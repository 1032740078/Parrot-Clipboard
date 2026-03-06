import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
  invokeCalls,
} from "../../__mocks__/@tauri-apps/api/core";

const loadLoggerModule = async () => {
  return await import("../../api/logger");
};

const loadFreshLoggerBundle = async () => {
  vi.resetModules();
  const loggerModule = await import("../../api/logger");
  const coreMockModule = await import("../../__mocks__/@tauri-apps/api/core");

  return {
    ...loggerModule,
    ...coreMockModule,
  };
};

describe("api/logger", () => {
  beforeEach(() => {
    __resetInvokeMock();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("normalizeError 可序列化 Error / 对象 / 原始值", async () => {
    const { normalizeError } = await loadLoggerModule();

    const errorPayload = normalizeError(new Error("boom"));
    const objectPayload = normalizeError({ foo: "bar", nested: { answer: 42 } });
    const primitivePayload = normalizeError(Symbol("token"));

    expect(errorPayload).toMatchObject({
      name: "Error",
      message: "boom",
    });
    expect(objectPayload).toEqual({ foo: "bar", nested: { answer: 42 } });
    expect(primitivePayload).toEqual({ message: "Symbol(token)" });
  });

  it("Tauri 环境下会上报后端并清洗上下文", async () => {
    const { logger } = await loadLoggerModule();
    const invokeHandler = vi.fn(async () => undefined);
    __setInvokeHandler(invokeHandler);
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    logger.info("hello", {
      count: 1,
      ok: true,
      list: ["a", { nested: new Error("nested") }],
      meta: { nullable: null },
    });

    await Promise.resolve();

    expect(invokeHandler).toHaveBeenCalledTimes(1);
    expect(invokeCalls[0]).toMatchObject({
      command: "write_client_log",
      args: {
        level: "info",
        message: "hello",
      },
    });
    expect(invokeCalls[0]?.args?.context).toMatchObject({
      count: 1,
      ok: true,
      list: ["a", { nested: { name: "Error", message: "nested" } }],
      meta: { nullable: null },
    });
    expect((invokeCalls[0]?.args?.context as Record<string, string>).client_timestamp).toMatch(
      /^\d{4}-\d{2}-\d{2}T/
    );
  });

  it("超长消息会截断，非 Tauri 环境不触发 invoke", async () => {
    const { logger } = await loadLoggerModule();
    const longMessage = "x".repeat(1005);

    logger.warn(longMessage);
    await Promise.resolve();

    expect(invokeCalls).toHaveLength(0);
  });

  it("非 test 模式会打印控制台，并在开发环境记录后端上报失败", async () => {
    vi.stubEnv("MODE", "development");
    vi.stubEnv("DEV", true);
    const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { logger, __setInvokeHandler: setFreshInvokeHandler } = await loadFreshLoggerBundle();
    setFreshInvokeHandler(async () => {
      throw new Error("send failed");
    });
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    logger.debug("console-visible", { foo: "bar" });

    await Promise.resolve();
    await Promise.resolve();

    expect(debugSpy).toHaveBeenCalledWith(
      "[DEBUG] console-visible",
      expect.objectContaining({ foo: "bar" })
    );
    expect(warnSpy).toHaveBeenCalledWith("[logger] 上报后端失败", expect.any(Error));
  });
});

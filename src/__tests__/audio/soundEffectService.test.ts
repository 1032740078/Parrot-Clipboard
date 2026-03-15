import { beforeEach, describe, expect, it, vi } from "vitest";

import { __resetInvokeMock, invokeCalls } from "../../__mocks__/@tauri-apps/api/core";

const { HowlMock, howlConstructor, howlPlay, howlStop, howlUnload } = vi.hoisted(() => {
  const stop = vi.fn();
  const play = vi.fn();
  const unload = vi.fn();
  const constructor = vi.fn();

  class MockHowl {
    constructor(options?: unknown) {
      constructor(options);
    }

    stop = stop;
    play = play;
    unload = unload;
  }

  return {
    HowlMock: MockHowl,
    howlConstructor: constructor,
    howlStop: stop,
    howlPlay: play,
    howlUnload: unload,
  };
});

vi.mock("howler", () => ({
  Howl: HowlMock,
}));

import {
  __resetSoundEffectServiceForTests,
  playSoundCue,
  soundEffectService,
} from "../../audio/soundEffectService";

describe("soundEffectService", () => {
  beforeEach(() => {
    __resetInvokeMock();
    howlConstructor.mockClear();
    howlStop.mockClear();
    howlPlay.mockClear();
    howlUnload.mockClear();
    __resetSoundEffectServiceForTests();
    delete (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
  });

  it("Tauri 运行时会跳过前端音效播放，改由原生层统一处理", () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    soundEffectService.playCopyCaptured();

    expect(invokeCalls.some((call) => call.command === "play_sound_effect")).toBe(false);
    expect(howlConstructor).not.toHaveBeenCalled();
  });

  it("Tauri 运行时不会回退到前端音效，避免与原生层重复播放", () => {
    (window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};

    soundEffectService.playCopyCaptured();

    expect(invokeCalls.some((call) => call.command === "play_sound_effect")).toBe(false);
    expect(howlConstructor).not.toHaveBeenCalled();
    expect(howlPlay).not.toHaveBeenCalled();
  });

  it("非 Tauri 环境首次播放时会懒加载 Howl 实例并复用缓存", () => {
    soundEffectService.playCopyCaptured();
    const firstCreateCount = howlConstructor.mock.calls.length;
    soundEffectService.playCopyCaptured();

    expect(howlConstructor).toHaveBeenCalledTimes(firstCreateCount);
    expect(howlStop).toHaveBeenCalledTimes(2);
    expect(howlPlay).toHaveBeenCalledTimes(2);
  });

  it("前端音效实例会以内联资源和 HTML5 Audio 模式创建", () => {
    soundEffectService.playCopyCaptured();

    expect(howlConstructor).toHaveBeenCalledTimes(1);
    expect(howlConstructor.mock.calls[0]?.[0]).toMatchObject({
      preload: true,
      html5: true,
      format: ["mp3"],
    });
    expect(howlConstructor.mock.calls[0]?.[0]?.src?.[0]).toMatch(/^data:/);
  });

  it("切换 cue 会创建独立实例", () => {
    soundEffectService.playCopyCaptured();
    soundEffectService.playPasteCompleted();
    soundEffectService.playPreviewRevealed();

    expect(howlConstructor).toHaveBeenCalledTimes(2);
  });

  it("底层音效实例抛错时静默降级", () => {
    howlConstructor.mockImplementationOnce(() => {
      throw new Error("decoder failed");
    });

    expect(() => playSoundCue("paste_completed")).not.toThrow();
    expect(howlPlay).not.toHaveBeenCalled();
  });
});

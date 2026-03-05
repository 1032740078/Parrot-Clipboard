import { describe, expect, it } from "vitest";

import { formatRelativeTime } from "../../components/MainPanel/time";

describe("formatRelativeTime", () => {
  const now = 1_000_000;

  it("秒级显示刚刚", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("刚刚");
  });

  it("分钟级显示 N 分钟前", () => {
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe("5 分钟前");
  });

  it("小时级显示 N 小时前", () => {
    expect(formatRelativeTime(now - 3 * 60 * 60_000, now)).toBe("3 小时前");
  });

  it("24~48 小时显示昨天", () => {
    expect(formatRelativeTime(now - 30 * 60 * 60_000, now)).toBe("昨天");
  });

  it(">48 小时显示 N 天前", () => {
    expect(formatRelativeTime(now - 72 * 60 * 60_000, now)).toBe("3 天前");
  });
});

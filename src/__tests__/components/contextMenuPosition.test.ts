import { describe, expect, it } from "vitest";

import { resolveContextMenuPosition } from "../../components/MainPanel/contextMenuPosition";

describe("contextMenuPosition", () => {
  it("UT-CONTEXT-203 视口足够时保持原始锚点并使用 bottom-start", () => {
    expect(resolveContextMenuPosition({ x: 120, y: 80 }, 1280, 720, 4)).toEqual({
      x: 120,
      y: 80,
      placement: "bottom-start",
      collisionAdjusted: false,
    });
  });

  it("UT-CONTEXT-204 靠近右下角时自动回收位置并标记碰撞修正", () => {
    expect(resolveContextMenuPosition({ x: 1240, y: 700 }, 1280, 720, 4)).toEqual({
      x: 1048,
      y: 532,
      placement: "bottom-end",
      collisionAdjusted: true,
    });
  });
});

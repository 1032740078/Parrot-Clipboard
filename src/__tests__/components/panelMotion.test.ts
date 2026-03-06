import { describe, expect, it } from "vitest";

import { panelMotionVariants } from "../../components/MainPanel/motion";

describe("panelMotionVariants", () => {
  it("UT-FE-MOTION-001 主面板进入 / 退出动画时长符合 UX 规范", () => {
    expect(panelMotionVariants.visible.transition.duration).toBe(0.22);
    expect(panelMotionVariants.exit.transition.duration).toBe(0.18);
    expect(panelMotionVariants.hidden.y).toBe("100%");
    expect(panelMotionVariants.exit.y).toBe("100%");
  });
});

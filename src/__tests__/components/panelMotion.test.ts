import { describe, expect, it } from "vitest";

import { getCardMotionProps, getPanelMotionVariants } from "../../components/MainPanel/motion";

describe("motion config", () => {
  it("UT-FE-MOTION-001 主面板进入 / 退出动画时长符合 UX 规范", () => {
    const panelMotion = getPanelMotionVariants(false);

    expect(panelMotion.visible.transition.duration).toBe(0.22);
    expect(panelMotion.exit.transition.duration).toBe(0.18);
    expect(panelMotion.hidden.y).toBe("100%");
    expect(panelMotion.exit.y).toBe("100%");
  });

  it("UT-FE-MOTION-002 删除卡片时存在离场动画配置", () => {
    const cardMotion = getCardMotionProps(false);

    expect(cardMotion.layout).toBe(true);
    expect(cardMotion.transition.duration).toBe(0.12);
    expect(cardMotion.exit.transition.duration).toBe(0.16);
    expect(cardMotion.exit.scale).toBe(0.96);
    expect(cardMotion.exit.y).toBe(12);
  });

  it("UT-FE-MOTION-003 reduced motion 场景下降级为弱动画", () => {
    const panelMotion = getPanelMotionVariants(true);
    const cardMotion = getCardMotionProps(true);

    expect(panelMotion.hidden).toEqual({ opacity: 0 });
    expect(panelMotion.visible.transition.duration).toBe(0.01);
    expect(cardMotion.layout).toBe(false);
    expect(cardMotion.exit).toEqual({
      opacity: 0,
      transition: {
        duration: 0.01,
      },
    });
  });
});

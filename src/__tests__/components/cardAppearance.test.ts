import { describe, expect, it } from "vitest";

import { getCardAppearanceClassName } from "../../components/MainPanel/cardAppearance";

describe("cardAppearance", () => {
  it("UT-VISUAL-304 默认态保留 hover 反馈与玻璃卡片基底", () => {
    const className = getCardAppearanceClassName({
      isSelected: false,
      isPreviewing: false,
    });

    expect(className).toContain("hover:-translate-y-0.5");
    expect(className).toContain("hover:border-sky-300/35");
    expect(className).toContain("border-white/10");
  });

  it("UT-VISUAL-305 选中态保留高亮边框与聚焦阴影", () => {
    const className = getCardAppearanceClassName({
      isSelected: true,
      isPreviewing: false,
    });

    expect(className).toContain("border-brand");
    expect(className).toContain("shadow-[0_0_0_1px_rgba(125,211,252,0.26),0_22px_46px_rgba(8,47,73,0.34)]");
  });

  it("UT-VISUAL-306 预览中态追加独立 ring 与冷色光晕", () => {
    const className = getCardAppearanceClassName({
      isSelected: true,
      isPreviewing: true,
    });

    expect(className).toContain("border-brand");
    expect(className).toContain("ring-1");
    expect(className).toContain("ring-violet-300/45");
    expect(className).toContain("rgba(196,181,253,0.3)");
  });
});

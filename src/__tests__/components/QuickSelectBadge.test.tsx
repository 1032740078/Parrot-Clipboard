import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuickSelectBadge } from "../../components/MainPanel/QuickSelectBadge";

describe("QuickSelectBadge", () => {
  it("显示快捷编号时会向上贴近卡片顶部", () => {
    render(<QuickSelectBadge slot={3} />);

    expect(screen.getByTestId("quick-select-badge")).toHaveTextContent("3");
    expect(screen.getByTestId("quick-select-badge").className).toContain("top-[2px]");
  });

  it("超过 9 的槽位不显示编号", () => {
    render(<QuickSelectBadge slot={10} />);

    expect(screen.queryByTestId("quick-select-badge")).not.toBeInTheDocument();
  });
});

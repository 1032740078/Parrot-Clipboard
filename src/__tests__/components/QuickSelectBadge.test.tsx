import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { QuickSelectBadge } from "../../components/MainPanel/QuickSelectBadge";

describe("QuickSelectBadge", () => {
  it("显示快捷编号时以内联标签形式出现在标题左侧", () => {
    render(<QuickSelectBadge slot={3} />);

    expect(screen.getByTestId("quick-select-badge")).toHaveTextContent("3");
    expect(screen.getByTestId("quick-select-badge").className).toContain("mr-2");
    expect(screen.getByTestId("quick-select-badge").className).toContain("rounded-md");
  });

  it("超过 9 的槽位不显示编号", () => {
    render(<QuickSelectBadge slot={10} />);

    expect(screen.queryByTestId("quick-select-badge")).not.toBeInTheDocument();
  });
});

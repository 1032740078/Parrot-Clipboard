import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TextCard } from "../../components/MainPanel/TextCard";
import { buildRecord } from "../fixtures/clipboardRecords";

describe("TextCard", () => {
  it("UT-CARD-001 短文本正常渲染", () => {
    render(<TextCard index={0} isSelected={false} record={buildRecord(1, "短文本", Date.now())} />);
    expect(screen.getByText("短文本")).toBeInTheDocument();
    expect(screen.getAllByTestId("quick-select-badge")).toHaveLength(1);
    expect(screen.getByTestId("source-app-icon")).toHaveAttribute("title", "Notes");
  });

  it("UT-CARD-002 长文本触发 4 行截断样式", () => {
    const longText = "很长的文本".repeat(30);
    const { getByText } = render(
      <TextCard index={0} isSelected={false} record={buildRecord(1, longText, Date.now())} />
    );

    const content = getByText(longText);
    expect((content as HTMLElement).style.webkitLineClamp).toBe("4");
  });

  it("UT-CARD-003 选中状态样式正确", () => {
    const { getByTestId } = render(
      <TextCard index={0} isSelected={true} record={buildRecord(1, "选中", Date.now())} />
    );

    expect(getByTestId("text-card").className.includes("border-rose-400/85")).toBe(true);
  });

  it("UT-CARD-005 预览中状态显示专属徽标并暴露状态属性", () => {
    render(
      <TextCard
        index={0}
        isPreviewing={true}
        isSelected={true}
        record={buildRecord(1, "预览态", Date.now())}
      />
    );

    expect(screen.getByTestId("previewing-badge")).toHaveTextContent("预览中");
    expect(screen.getByTestId("text-card")).toHaveAttribute("data-previewing", "true");
    expect(screen.getByTestId("text-card").className).toContain("ring-violet-300/45");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { TextCard } from "../../components/MainPanel/TextCard";
import { buildRecord } from "../fixtures/clipboardRecords";

describe("TextCard", () => {
  it("UT-CARD-001 短文本正常渲染", () => {
    render(<TextCard index={0} isSelected={false} record={buildRecord(1, "短文本", Date.now())} />);
    expect(screen.getByText("短文本")).toBeInTheDocument();
  });

  it("UT-CARD-002 长文本触发 3 行截断样式", () => {
    const longText = "很长的文本".repeat(30);
    const { getByText } = render(
      <TextCard index={0} isSelected={false} record={buildRecord(1, longText, Date.now())} />
    );

    const content = getByText(longText);
    expect((content as HTMLElement).style.webkitLineClamp).toBe("3");
  });

  it("UT-CARD-003 选中状态样式正确", () => {
    const { getByTestId } = render(
      <TextCard index={0} isSelected={true} record={buildRecord(1, "选中", Date.now())} />
    );

    expect(getByTestId("text-card").className.includes("border-brand")).toBe(true);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { FileCard } from "../../components/MainPanel/FileCard";
import { buildFileRecord } from "../fixtures/clipboardRecords";

describe("FileCard", () => {
  it("UT-FE-CARD-004 正确展示首个文件名与数量摘要", () => {
    render(<FileCard index={0} isSelected={false} record={buildFileRecord(1, "需求文档.md", 1000, 4, true)} />);

    expect(screen.getByText("需求文档.md")).toBeInTheDocument();
    expect(screen.getByText("共 4 项")).toBeInTheDocument();
    expect(screen.getByText("含文件夹")).toBeInTheDocument();
  });
});

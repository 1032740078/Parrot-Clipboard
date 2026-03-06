import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ImageCard } from "../../components/MainPanel/ImageCard";
import { buildImageRecord } from "../fixtures/clipboardRecords";

describe("ImageCard", () => {
  it("UT-FE-CARD-002 未就绪时展示占位态", () => {
    render(<ImageCard index={0} isSelected={false} record={buildImageRecord(1, "截图", 1000, "pending")} />);

    expect(screen.getByTestId("image-placeholder")).toBeInTheDocument();
    expect(screen.getByText("正在生成预览")).toBeInTheDocument();
  });

  it("UT-FE-CARD-003 就绪后展示缩略图与尺寸信息", () => {
    render(<ImageCard index={1} isSelected={true} record={buildImageRecord(2, "截图", 1000, "ready")} />);

    expect(screen.getByTestId("image-thumbnail")).toHaveAttribute("src", "/tmp/thumb-2.png");
    expect(screen.getByText("PNG")).toBeInTheDocument();
    expect(screen.getByText("1280×720")).toBeInTheDocument();
  });
});

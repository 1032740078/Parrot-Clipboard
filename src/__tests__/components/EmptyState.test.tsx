import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "../../components/MainPanel/EmptyState";

describe("EmptyState", () => {
  it("AC-1 空状态文案和图标可见", () => {
    render(<EmptyState />);

    expect(screen.getByText("还没有复制记录")).toBeInTheDocument();
    expect(screen.getByText("复制任何内容后将自动出现在这里")).toBeInTheDocument();
  });
});

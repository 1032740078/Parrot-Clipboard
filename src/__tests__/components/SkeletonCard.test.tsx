import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SkeletonCard } from "../../components/MainPanel/SkeletonCard";

describe("SkeletonCard", () => {
  it("加载态会渲染骨架卡片", () => {
    render(<SkeletonCard index={0} />);

    expect(screen.getByTestId("skeleton-card")).toBeInTheDocument();
    expect(screen.getByText("加载中")).toBeInTheDocument();
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SettingsWindowPlaceholder } from "../../components/SettingsWindowPlaceholder";

describe("components/SettingsWindowPlaceholder", () => {
  it("展示设置窗口占位信息", () => {
    render(<SettingsWindowPlaceholder />);

    expect(screen.getByText("设置中心准备中")).toBeInTheDocument();
    expect(screen.getByText(/设置窗口单实例打开与激活能力已经完成/)).toBeInTheDocument();
    expect(screen.getByText("当前能力")).toBeInTheDocument();
    expect(screen.getByText("下一步")).toBeInTheDocument();
  });
});

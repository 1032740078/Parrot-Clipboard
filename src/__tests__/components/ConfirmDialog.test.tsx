import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ConfirmDialog } from "../../components/common/ConfirmDialog";

describe("ConfirmDialog", () => {
  it("visible=false 时不渲染弹窗", () => {
    render(
      <ConfirmDialog
        cancelLabel="取消"
        confirmLabel="确认"
        description="描述"
        onCancel={() => undefined}
        onConfirm={() => undefined}
        title="标题"
        visible={false}
      />
    );

    expect(screen.queryByTestId("confirm-dialog")).not.toBeInTheDocument();
  });

  it("可响应取消和确认操作", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmDialog
        cancelLabel="取消"
        confirmLabel="确认"
        description="描述"
        onCancel={onCancel}
        onConfirm={onConfirm}
        title="标题"
        visible
      />
    );

    fireEvent.click(screen.getByTestId("confirm-dialog-cancel"));
    fireEvent.click(screen.getByTestId("confirm-dialog-confirm"));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("loading=true 时按钮禁用并显示处理中", () => {
    render(
      <ConfirmDialog
        cancelLabel="取消"
        confirmLabel="确认"
        description="描述"
        loading
        onCancel={() => undefined}
        onConfirm={() => undefined}
        title="标题"
        visible
      />
    );

    expect(screen.getByTestId("confirm-dialog-cancel")).toBeDisabled();
    expect(screen.getByTestId("confirm-dialog-confirm")).toBeDisabled();
    expect(screen.getByText("处理中...")).toBeInTheDocument();
  });
});

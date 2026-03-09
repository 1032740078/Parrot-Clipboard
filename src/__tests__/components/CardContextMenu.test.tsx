import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CardContextMenu } from "../../components/MainPanel/CardContextMenu";
import { useUIStore } from "../../stores/useUIStore";

describe("CardContextMenu", () => {
  beforeEach(() => {
    useUIStore.getState().reset();
  });

  it("UT-CONTEXT-205 会按状态渲染菜单项与禁用态", () => {
    useUIStore.getState().openContextMenu({
      recordId: 8,
      x: 240,
      y: 180,
      placement: "bottom-start",
      collisionAdjusted: false,
      actions: [
        { key: "preview", label: "预览完整内容", disabled: false },
        { key: "paste_plain_text", label: "纯文本粘贴", disabled: true },
      ],
    });

    render(<CardContextMenu />);

    expect(screen.getByTestId("card-context-menu")).toBeInTheDocument();
    expect(screen.getByTestId("card-context-menu-item-preview")).toBeEnabled();
    expect(screen.getByTestId("card-context-menu-item-paste_plain_text")).toBeDisabled();
  });

  it("UT-CONTEXT-206 点击菜单外区域会关闭菜单", async () => {
    useUIStore.getState().openContextMenu({
      recordId: 8,
      x: 240,
      y: 180,
      placement: "bottom-start",
      collisionAdjusted: false,
      actions: [{ key: "preview", label: "预览完整内容", disabled: false }],
    });

    render(
      <div>
        <button data-testid="outside" type="button">
          outside
        </button>
        <CardContextMenu />
      </div>
    );

    fireEvent.mouseDown(screen.getByTestId("outside"));

    await waitFor(() => {
      expect(screen.queryByTestId("card-context-menu")).not.toBeInTheDocument();
    });

    expect(useUIStore.getState().lastContextMenuCloseReason).toBe("click_outside");
  });

  it("UT-CONTEXT-207 点击可用菜单项会向外派发动作", () => {
    const onAction = vi.fn();
    useUIStore.getState().openContextMenu({
      recordId: 9,
      x: 200,
      y: 160,
      placement: "bottom-start",
      collisionAdjusted: false,
      actions: [{ key: "delete", label: "删除记录", disabled: false, danger: true }],
    });

    render(<CardContextMenu onAction={onAction} />);

    fireEvent.click(screen.getByTestId("card-context-menu-item-delete"));

    expect(onAction).toHaveBeenCalledWith("delete");
  });
});

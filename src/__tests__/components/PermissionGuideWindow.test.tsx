import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetInvokeMock,
  __setInvokeHandler,
} from "../../__mocks__/@tauri-apps/api/core";
import {
  __getMockCloseCallCount,
  __resetWindowMock,
} from "../../__mocks__/@tauri-apps/api/window";
import { PermissionGuideWindow } from "../../components/PermissionGuideWindow";

describe("PermissionGuideWindow", () => {
  beforeEach(() => {
    __resetInvokeMock();
    __resetWindowMock();
  });

  it("点击顶部关闭按钮会关闭权限引导窗口", async () => {
    __setInvokeHandler(async (command) => {
      if (command === "get_permission_status") {
        return {
          platform: "macos",
          accessibility: "missing",
          checked_at: 1700000000000,
          reason: "permission_denied",
        };
      }

      return undefined;
    });

    render(<PermissionGuideWindow />);

    await waitFor(() => {
      expect(screen.getByText("需要辅助功能权限")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "关闭" }));

    await waitFor(() => {
      expect(__getMockCloseCallCount()).toBe(1);
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  formatPermissionReason,
  isUnsignedOrAdhocPermissionReason,
  resolvePermissionGuideDescription,
  resolvePermissionGuideSteps,
} from "../../components/common/permissionReason";

const adhocPermission = {
  platform: "macos" as const,
  accessibility: "missing" as const,
  checked_at: 1700000000000,
  reason: "macos_accessibility_not_granted_unsigned_or_adhoc_build",
};

describe("permissionReason", () => {
  it("为临时签名构建返回更准确的权限说明", () => {
    expect(isUnsignedOrAdhocPermissionReason(adhocPermission.reason)).toBe(true);
    expect(resolvePermissionGuideDescription(adhocPermission)).toContain("临时签名或未签名包");
    expect(resolvePermissionGuideSteps(adhocPermission)[1]).toContain("删除旧的“粘贴板记录管理工具”条目");
    expect(formatPermissionReason(adhocPermission.reason)).toContain("临时签名（ad-hoc）或未签名构建");
  });

  it("普通未授权场景保持原有引导文案", () => {
    const genericPermission = {
      ...adhocPermission,
      reason: "macos_accessibility_not_granted",
    };

    expect(isUnsignedOrAdhocPermissionReason(genericPermission.reason)).toBe(false);
    expect(resolvePermissionGuideDescription(genericPermission)).toContain("未授予辅助功能权限时");
    expect(resolvePermissionGuideSteps(genericPermission)[1]).toContain("加入允许控制你的电脑的应用列表");
    expect(formatPermissionReason(genericPermission.reason)).toContain("已获得辅助功能权限");
  });
});

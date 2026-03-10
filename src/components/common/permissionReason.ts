import type { PermissionStatus } from "../../api/types";

const UNSIGNED_OR_ADHOC_REASON = "macos_accessibility_not_granted_unsigned_or_adhoc_build";
const MISSING_REASON = "macos_accessibility_not_granted";
const UNSUPPORTED_REASON = "accessibility_permission_not_applicable";

export const isUnsignedOrAdhocPermissionReason = (reason?: string | null): boolean =>
  reason === UNSIGNED_OR_ADHOC_REASON;

export const formatPermissionReason = (reason?: string | null): string | null => {
  if (!reason) {
    return null;
  }

  switch (reason) {
    case UNSIGNED_OR_ADHOC_REASON:
      return "检测到当前安装包使用临时签名（ad-hoc）或未签名构建；若你刚覆盖安装过应用，macOS 可能仍显示旧条目，但不会把当前构建视为同一个已授权应用。";
    case MISSING_REASON:
      return "系统尚未把当前应用进程识别为已获得辅助功能权限。";
    case UNSUPPORTED_REASON:
      return "当前平台不需要辅助功能授权，或此能力不适用。";
    default:
      return reason;
  }
};

export const resolvePermissionGuideDescription = (permissionStatus?: PermissionStatus): string => {
  if (!permissionStatus) {
    return "当前正在检测辅助功能权限，请稍后重试。";
  }

  if (permissionStatus.platform !== "macos") {
    return "当前平台暂不需要辅助功能授权，可继续正常浏览和管理历史记录。";
  }

  if (permissionStatus.accessibility === "granted") {
    return "辅助功能权限已可用，粘贴相关操作应已恢复。";
  }

  if (isUnsignedOrAdhocPermissionReason(permissionStatus.reason)) {
    return "当前构建看起来是临时签名或未签名包。macOS 在覆盖安装后，常会把同名新包视为新的应用身份，因此会出现“系统里看起来已勾选，但当前进程仍判定未授权”的现象。";
  }

  return "未授予辅助功能权限时，Enter / Shift+Enter 等粘贴相关操作会受限，但浏览、选择和删除历史仍可继续。";
};

export const resolvePermissionGuideSteps = (permissionStatus?: PermissionStatus): string[] => {
  if (isUnsignedOrAdhocPermissionReason(permissionStatus?.reason)) {
    return [
      "点击“打开系统设置”，进入辅助功能授权页面。",
      "先删除旧的“鹦鹉剪贴板”或历史旧名称条目，再重新把当前应用加入允许列表并开启开关。",
      "若刚覆盖安装过应用，请完成授权后彻底退出并重新打开应用，再点击“重新检测”。",
    ];
  }

  return [
    "点击“打开系统设置”，进入辅助功能授权页面。",
    "把“鹦鹉剪贴板”加入允许控制你的电脑的应用列表。",
    "完成授权后返回应用，点击“重新检测”完成闭环。",
  ];
};

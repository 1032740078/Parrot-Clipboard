import type { PermissionStatus } from "../../api/types";

interface PermissionGuideDialogProps {
  visible: boolean;
  checking: boolean;
  permissionStatus?: PermissionStatus;
  onLater: () => void;
  onOpenSettings: () => void;
  onRetry: () => void;
}

const resolveDescription = (permissionStatus?: PermissionStatus): string => {
  if (!permissionStatus) {
    return "当前正在检测辅助功能权限，请稍后重试。";
  }

  if (permissionStatus.platform !== "macos") {
    return "当前平台暂不需要辅助功能授权，可继续正常浏览和管理历史记录。";
  }

  if (permissionStatus.accessibility === "granted") {
    return "辅助功能权限已可用，粘贴相关操作应已恢复。";
  }

  return "未授予辅助功能权限时，Enter / Shift+Enter 等粘贴相关操作会受限，但浏览、选择和删除历史仍可继续。";
};

export const PermissionGuideDialog = ({
  visible,
  checking,
  permissionStatus,
  onLater,
  onOpenSettings,
  onRetry,
}: PermissionGuideDialogProps) => {
  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 px-4"
      data-testid="permission-guide-dialog"
      role="dialog"
      aria-labelledby="permission-guide-title"
      aria-modal="true"
    >
      <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-sky-300">权限引导</p>
            <h2 className="mt-2 text-xl font-semibold text-white" id="permission-guide-title">
              需要辅助功能权限
            </h2>
          </div>
          <button
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-200 transition hover:border-white/25"
            onClick={onLater}
            type="button"
          >
            稍后处理
          </button>
        </div>

        <p className="mt-4 text-sm leading-6 text-slate-300">
          {resolveDescription(permissionStatus)}
        </p>

        <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-200">
          <li>点击“打开系统设置”，进入辅助功能授权页面。</li>
          <li>把“粘贴板记录管理工具”加入允许控制你的电脑的应用列表。</li>
          <li>完成授权后返回应用，点击“重新检测”完成闭环。</li>
        </ol>

        {permissionStatus?.reason ? (
          <p className="mt-4 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-400">
            当前状态：{permissionStatus.reason}
          </p>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          <button
            className="rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-100 transition hover:border-white/25"
            disabled={checking}
            onClick={onOpenSettings}
            type="button"
          >
            打开系统设置
          </button>
          <button
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-sky-400 disabled:cursor-wait disabled:bg-sky-700"
            disabled={checking}
            onClick={onRetry}
            type="button"
          >
            {checking ? "检测中..." : "重新检测"}
          </button>
        </div>
      </div>
    </div>
  );
};

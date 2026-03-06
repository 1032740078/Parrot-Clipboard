import { useEffect, useRef } from "react";

interface ConfirmDialogProps {
  visible: boolean;
  loading?: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  visible,
  loading = false,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!visible) {
      return;
    }

    cancelButtonRef.current?.focus();
  }, [visible]);

  if (!visible) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/70 px-4 backdrop-blur-sm"
      data-testid="confirm-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900 p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-white" id="confirm-dialog-title">
          {title}
        </h2>
        <p className="mt-3 text-sm leading-6 text-slate-300">{description}</p>

        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelButtonRef}
            className="rounded-lg border border-white/15 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/5"
            data-testid="confirm-dialog-cancel"
            disabled={loading}
            onClick={onCancel}
            type="button"
          >
            {cancelLabel}
          </button>
          <button
            className="rounded-lg bg-rose-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="confirm-dialog-confirm"
            disabled={loading}
            onClick={() => {
              void onConfirm();
            }}
            type="button"
          >
            {loading ? "处理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

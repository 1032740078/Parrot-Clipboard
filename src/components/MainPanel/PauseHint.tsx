export const PauseHint = () => {
  return (
    <div
      aria-live="polite"
      className="mb-3 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-300/10 px-3 py-2 text-xs text-amber-100/90"
      data-testid="pause-hint"
      role="status"
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-300" />
      <span>监听已暂停，新复制的内容不会被记录，可从托盘恢复</span>
    </div>
  );
};

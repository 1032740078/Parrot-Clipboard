import { Clipboard } from "lucide-react";

export const EmptyState = () => {
  return (
    <div
      className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center"
      data-testid="empty-state"
    >
      <Clipboard color="#C7C7CC" size={40} strokeWidth={1.8} />
      <div className="text-[15px] font-medium text-slate-200">还没有复制记录</div>
      <div className="text-[13px] text-slate-400">复制任何内容后将自动出现在这里</div>
    </div>
  );
};

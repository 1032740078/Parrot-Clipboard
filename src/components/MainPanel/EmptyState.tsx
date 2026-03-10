import { Clipboard } from "lucide-react";

interface EmptyStateProps {
  title?: string;
  description?: string;
  testId?: string;
}

export const EmptyState = ({
  title = "还没有复制记录",
  description = "复制任何内容后将自动出现在这里",
  testId = "empty-state",
}: EmptyStateProps) => {
  return (
    <div
      className="flex h-full min-h-48 flex-col items-center justify-center gap-3 text-center"
      data-testid={testId}
    >
      <Clipboard color="#C7C7CC" size={40} strokeWidth={1.8} />
      <div className="text-[15px] font-medium text-slate-200">{title}</div>
      <div className="text-[13px] text-slate-400">{description}</div>
    </div>
  );
};

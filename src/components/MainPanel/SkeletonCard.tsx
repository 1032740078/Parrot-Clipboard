interface SkeletonCardProps {
  index: number;
}

export const SkeletonCard = ({ index }: SkeletonCardProps) => {
  return (
    <article
      className="flex h-56 w-card shrink-0 animate-pulse flex-col overflow-hidden rounded-[18px] border border-white/10 bg-white/5 backdrop-blur-md"
      data-testid="skeleton-card"
    >
      <div className="h-12 bg-white/10" />
      <div className="px-3 pt-3">
        <div className="h-3 w-20 rounded bg-white/10" />
      </div>
      <div className="mx-3 mt-3 h-32 rounded-lg bg-white/10" />
      <div className="px-3 pt-3">
        <div className="h-3 w-32 rounded bg-white/10" />
      </div>
      <div className="mt-auto flex h-8 items-center justify-between px-3 text-[11px] text-slate-400">
        <span>加载中</span>
        <span>#{index + 1}</span>
      </div>
    </article>
  );
};

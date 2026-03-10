interface SourceAppIconProps {
  sourceApp?: string | null;
}

export const SourceAppIcon = ({ sourceApp }: SourceAppIconProps) => {
  if (!sourceApp) {
    return null;
  }

  const initial = sourceApp.charAt(0).toUpperCase();

  return (
    <span
      className="flex h-5 w-5 items-center justify-center rounded-md bg-white/15 text-[10px] font-bold leading-none text-white/80"
      data-testid="source-app-icon"
      title={sourceApp}
    >
      {initial}
    </span>
  );
};

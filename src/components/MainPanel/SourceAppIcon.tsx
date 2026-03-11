import { useEffect, useState } from "react";

import { getSourceAppIconPng } from "../../api/commands";

interface SourceAppIconProps {
  sourceApp?: string | null;
}

const ICON_SIZE = 36;
const iconUrlCache = new Map<string, string | null>();
const inflightIconLoads = new Map<string, Promise<string | null>>();

const buildCacheKey = (sourceApp: string): string => `${sourceApp}::${ICON_SIZE}`;

const loadSourceAppIconUrl = async (sourceApp: string): Promise<string | null> => {
  const cacheKey = buildCacheKey(sourceApp);
  if (iconUrlCache.has(cacheKey)) {
    return iconUrlCache.get(cacheKey) ?? null;
  }

  const inflight = inflightIconLoads.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const iconBytes = await getSourceAppIconPng(sourceApp, ICON_SIZE);
    if (!iconBytes || iconBytes.byteLength === 0) {
      iconUrlCache.set(cacheKey, null);
      return null;
    }

    const iconUrl = URL.createObjectURL(new Blob([iconBytes], { type: "image/png" }));
    iconUrlCache.set(cacheKey, iconUrl);
    return iconUrl;
  })();

  inflightIconLoads.set(cacheKey, request);

  try {
    return await request;
  } finally {
    inflightIconLoads.delete(cacheKey);
  }
};

// eslint-disable-next-line react-refresh/only-export-components
export const __resetSourceAppIconCache = (): void => {
  for (const iconUrl of iconUrlCache.values()) {
    if (iconUrl) {
      URL.revokeObjectURL(iconUrl);
    }
  }

  iconUrlCache.clear();
  inflightIconLoads.clear();
};

export const SourceAppIcon = ({ sourceApp }: SourceAppIconProps) => {
  const normalizedSourceApp = sourceApp?.trim() ?? "";
  const [iconUrl, setIconUrl] = useState<string | null>(() => {
    if (!normalizedSourceApp) {
      return null;
    }

    return iconUrlCache.get(buildCacheKey(normalizedSourceApp)) ?? null;
  });

  useEffect(() => {
    if (!normalizedSourceApp) {
      return;
    }

    let cancelled = false;

    const resolveIcon = async (): Promise<void> => {
      const nextIconUrl = await loadSourceAppIconUrl(normalizedSourceApp);
      if (cancelled) {
        return;
      }

      setIconUrl(nextIconUrl);
    };

    void resolveIcon();

    return () => {
      cancelled = true;
    };
  }, [normalizedSourceApp]);

  if (!normalizedSourceApp) {
    return null;
  }

  const initial = normalizedSourceApp.charAt(0).toUpperCase();

  return (
    <span
      className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl border border-black/10 bg-gradient-to-br from-cyan-200/18 via-sky-200/14 to-indigo-300/18 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_10px_20px_rgba(14,165,233,0.2)] backdrop-blur-[6px]"
      data-testid="source-app-icon"
      title={normalizedSourceApp}
    >
      {iconUrl ? (
        <img
          alt={`${normalizedSourceApp} 图标`}
          className="h-full w-full object-cover"
          data-testid="source-app-icon-image"
          src={iconUrl}
        />
      ) : (
        <span className="text-sm font-bold leading-none text-white/90 drop-shadow-[0_1px_2px_rgba(8,47,73,0.45)]">
          {initial}
        </span>
      )}
    </span>
  );
};

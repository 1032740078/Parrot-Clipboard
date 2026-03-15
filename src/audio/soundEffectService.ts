import { Howl } from "howler";

import { logger, normalizeError } from "../api/logger";
import copyNotificationUrl from "../assets/sounds/copy-notification.mp3?inline";
import pasteNotificationUrl from "../assets/sounds/paste-notification.mp3?inline";

export type SoundCue = "copy_captured" | "paste_completed";

const SOUND_SOURCES: Record<SoundCue, string> = {
  copy_captured: copyNotificationUrl,
  paste_completed: pasteNotificationUrl,
};

const isTauriRuntime = (): boolean => {
  if (typeof window === "undefined") {
    return false;
  }

  return Boolean((window as Window & { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);
};

const soundCache = new Map<SoundCue, Howl>();

const createHowl = (cue: SoundCue): Howl =>
  new Howl({
    src: [SOUND_SOURCES[cue]],
    preload: true,
    // 打包版优先走 HTML5 Audio，避免继续依赖 Web Audio + 资源路径解码链路。
    html5: true,
    volume: 0.72,
    format: ["mp3"],
    onloaderror: (_soundId, error) => {
      logger.warn("加载音效资源失败，已静默降级", {
        sound_cue: cue,
        error,
      });
    },
    onplayerror: (_soundId, error) => {
      logger.warn("播放音效失败，已静默降级", {
        sound_cue: cue,
        error,
      });
    },
  });

const resolveHowl = (cue: SoundCue): Howl => {
  const cached = soundCache.get(cue);
  if (cached) {
    return cached;
  }

  const howl = createHowl(cue);
  soundCache.set(cue, howl);
  return howl;
};

const playWebSoundCue = (cue: SoundCue): void => {
  try {
    const howl = resolveHowl(cue);
    howl.stop();
    howl.play();
  } catch (error) {
    logger.warn("播放音效失败，已静默降级", {
      sound_cue: cue,
      error: normalizeError(error),
    });
  }
};

export const playSoundCue = (cue: SoundCue): void => {
  logger.info("触发音效播放", {
    sound_cue: cue,
    runtime: isTauriRuntime() ? "tauri" : "web",
  });

  if (isTauriRuntime()) {
    logger.debug("Tauri 运行时跳过前端音效播放，改由 Rust 原生层统一处理", {
      sound_cue: cue,
    });
    return;
  }

  playWebSoundCue(cue);
};

export const soundEffectService = {
  playCopyCaptured: (): void => {
    playSoundCue("copy_captured");
  },
  playPasteCompleted: (): void => {
    playSoundCue("paste_completed");
  },
  playPreviewRevealed: (): void => {
    // 预览音效已按当前产品决策取消，这里保留空方法以减少调用方改动面。
  },
};

export const __resetSoundEffectServiceForTests = (): void => {
  soundCache.forEach((howl) => {
    howl.unload();
  });
  soundCache.clear();
};

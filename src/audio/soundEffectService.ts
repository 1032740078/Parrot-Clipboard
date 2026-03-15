import { Howl } from "howler";

import { logger, normalizeError } from "../api/logger";
import copyNotificationUrl from "../assets/sounds/copy-notification.mp3";
import pasteNotificationUrl from "../assets/sounds/paste-notification.mp3";

export type SoundCue = "copy_captured" | "paste_completed";

const SOUND_SOURCES: Record<SoundCue, string> = {
  copy_captured: copyNotificationUrl,
  paste_completed: pasteNotificationUrl,
};

const soundCache = new Map<SoundCue, Howl>();

const createHowl = (cue: SoundCue): Howl =>
  new Howl({
    src: [SOUND_SOURCES[cue]],
    preload: true,
    html5: false,
    volume: 0.72,
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

export const playSoundCue = (cue: SoundCue): void => {
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

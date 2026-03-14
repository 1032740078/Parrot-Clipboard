import { beforeEach, describe, expect, it, vi } from "vitest";

const { HowlMock, howlConstructor, howlPlay, howlStop, howlUnload } = vi.hoisted(() => {
  const stop = vi.fn();
  const play = vi.fn();
  const unload = vi.fn();
  const constructor = vi.fn();

  class MockHowl {
    constructor() {
      constructor();
    }

    stop = stop;
    play = play;
    unload = unload;
  }

  return {
    HowlMock: MockHowl,
    howlConstructor: constructor,
    howlStop: stop,
    howlPlay: play,
    howlUnload: unload,
  };
});

vi.mock("howler", () => ({
  Howl: HowlMock,
}));

import {
  __resetSoundEffectServiceForTests,
  playSoundCue,
  soundEffectService,
} from "../../audio/soundEffectService";

describe("soundEffectService", () => {
  beforeEach(() => {
    howlConstructor.mockClear();
    howlStop.mockClear();
    howlPlay.mockClear();
    howlUnload.mockClear();
    __resetSoundEffectServiceForTests();
  });

  it("首次播放时会懒加载 Howl 实例并复用缓存", () => {
    soundEffectService.playCopyCaptured();
    const firstCreateCount = howlConstructor.mock.calls.length;
    soundEffectService.playCopyCaptured();

    expect(howlConstructor).toHaveBeenCalledTimes(firstCreateCount);
    expect(howlStop).toHaveBeenCalledTimes(2);
    expect(howlPlay).toHaveBeenCalledTimes(2);
  });

  it("切换 cue 会创建独立实例", () => {
    soundEffectService.playCopyCaptured();
    soundEffectService.playPasteCompleted();
    soundEffectService.playPreviewRevealed();

    expect(howlConstructor).toHaveBeenCalledTimes(3);
  });

  it("底层音效实例抛错时静默降级", () => {
    howlConstructor.mockImplementationOnce(() => {
      throw new Error("decoder failed");
    });

    expect(() => playSoundCue("preview_revealed")).not.toThrow();
    expect(howlPlay).not.toHaveBeenCalled();
  });
});

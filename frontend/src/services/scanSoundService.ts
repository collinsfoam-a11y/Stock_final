import { Platform } from "react-native";
import * as Speech from "expo-speech";

export type ScanSoundTone = "capture" | "success" | "warning" | "error";

const WEB_TONES: Record<
  ScanSoundTone,
  { frequency: number; durationMs: number; gain: number }
> = {
  capture: { frequency: 880, durationMs: 70, gain: 0.05 },
  success: { frequency: 1046, durationMs: 90, gain: 0.06 },
  warning: { frequency: 622, durationMs: 110, gain: 0.05 },
  error: { frequency: 440, durationMs: 140, gain: 0.05 },
};

const NATIVE_TONES: Record<
  ScanSoundTone,
  { text: string; rate: number; pitch: number }
> = {
  capture: { text: "scan", rate: 1.9, pitch: 1.7 },
  success: { text: "ok", rate: 1.8, pitch: 1.4 },
  warning: { text: "check", rate: 1.5, pitch: 0.9 },
  error: { text: "error", rate: 1.2, pitch: 0.8 },
};

let webAudioContext: AudioContext | null = null;

const getWebAudioContext = (): AudioContext | null => {
  if (typeof globalThis === "undefined") {
    return null;
  }

  const AudioContextCtor =
    (globalThis as { AudioContext?: typeof AudioContext }).AudioContext ??
    (
      globalThis as {
        webkitAudioContext?: typeof AudioContext;
      }
    ).webkitAudioContext;

  if (!AudioContextCtor) {
    return null;
  }

  if (!webAudioContext) {
    webAudioContext = new AudioContextCtor();
  }

  return webAudioContext;
};

const playWebTone = async (tone: ScanSoundTone): Promise<boolean> => {
  const context = getWebAudioContext();
  if (!context) {
    return false;
  }

  if (context.state === "suspended") {
    await context.resume();
  }

  const oscillator = context.createOscillator();
  const gainNode = context.createGain();
  const { frequency, durationMs, gain } = WEB_TONES[tone];
  const durationSeconds = durationMs / 1000;
  const startAt = context.currentTime;
  const stopAt = startAt + durationSeconds;

  oscillator.type = tone === "error" ? "square" : "sine";
  oscillator.frequency.setValueAtTime(frequency, startAt);
  gainNode.gain.setValueAtTime(0.0001, startAt);
  gainNode.gain.exponentialRampToValueAtTime(gain, startAt + 0.01);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, stopAt);

  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start(startAt);
  oscillator.stop(stopAt);

  return true;
};

const playNativeTone = async (tone: ScanSoundTone): Promise<void> => {
  const config = NATIVE_TONES[tone];
  await Speech.stop();
  Speech.speak(config.text, {
    language: "en-US",
    rate: config.rate,
    pitch: config.pitch,
  });
};

export const playScanSound = async (
  tone: ScanSoundTone,
  enabled: boolean,
): Promise<void> => {
  if (!enabled) {
    return;
  }

  try {
    if (Platform.OS === "web" && (await playWebTone(tone))) {
      return;
    }

    await playNativeTone(tone);
  } catch {
    // Best-effort feedback only.
  }
};

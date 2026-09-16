import { platform, type HapticCue } from './platform.js';
import type { PresentationPreferences, TableFeedbackCue } from './presentation.js';

let sharedAudioContext: AudioContext | null = null;
let audioUnavailable = false;

function audioContext(): AudioContext | null {
  if (audioUnavailable || typeof window === 'undefined' || window.AudioContext === undefined) {
    return null;
  }

  if (sharedAudioContext !== null) return sharedAudioContext;

  try {
    sharedAudioContext = new window.AudioContext();
    return sharedAudioContext;
  } catch {
    audioUnavailable = true;
    return null;
  }
}

export function unlockPresentationAudio(): void {
  const context = audioContext();
  if (context?.state === 'suspended') void context.resume().catch(() => undefined);
}

function tone(frequency: number, durationMs: number, gainValue: number, delayMs = 0): void {
  const context = audioContext();
  if (context === null) return;

  try {
    const startsAt = context.currentTime + delayMs / 1_000;
    const endsAt = startsAt + durationMs / 1_000;
    const oscillator = context.createOscillator();
    const gain = context.createGain();

    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(frequency, startsAt);
    gain.gain.setValueAtTime(0.0001, startsAt);
    gain.gain.exponentialRampToValueAtTime(gainValue, startsAt + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, endsAt);

    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(startsAt);
    oscillator.stop(endsAt + 0.01);
  } catch {
    // Audio feedback must never block gameplay on constrained WebViews.
  }
}

function paperNoise(durationMs: number, gainValue: number, cutoffHz: number): void {
  const context = audioContext();
  if (context === null) return;

  try {
    const frameCount = Math.max(1, Math.round((context.sampleRate * durationMs) / 1_000));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index += 1) {
      const envelope = 1 - index / samples.length;
      samples[index] = (Math.random() * 2 - 1) * envelope;
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = cutoffHz;
    gain.gain.value = gainValue;
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    source.start();
  } catch {
    // Audio feedback must never block gameplay on constrained WebViews.
  }
}

function playTableSound(cue: TableFeedbackCue | 'SELECT'): void {
  unlockPresentationAudio();

  switch (cue) {
    case 'SELECT':
      tone(310, 38, 0.022);
      return;
    case 'DRAW':
      paperNoise(95, 0.018, 2_400);
      return;
    case 'PLACE':
      paperNoise(70, 0.02, 1_800);
      tone(145, 70, 0.025);
      return;
    case 'MODIFIER':
      tone(250, 46, 0.018);
      tone(330, 54, 0.018, 36);
      return;
    case 'DISCARD':
      paperNoise(130, 0.022, 1_500);
      return;
    case 'REMOVE':
      paperNoise(180, 0.03, 1_200);
      tone(115, 90, 0.022);
      return;
    case 'RESULT':
      tone(220, 120, 0.018);
      tone(330, 170, 0.018, 70);
      tone(440, 220, 0.016, 140);
  }
}

function hapticForCue(cue: TableFeedbackCue): HapticCue {
  if (cue === 'RESULT') return 'SUCCESS';
  if (cue === 'REMOVE' || cue === 'DISCARD') return 'MEDIUM';
  return 'LIGHT';
}

export function playSelectionFeedback(preferences: PresentationPreferences): void {
  if (preferences.sound) playTableSound('SELECT');
  if (preferences.haptics) platform.haptic('SELECTION');
}

export function playConfirmedFeedback(
  cue: TableFeedbackCue,
  preferences: PresentationPreferences,
): void {
  if (preferences.sound) playTableSound(cue);
  if (preferences.haptics) platform.haptic(hapticForCue(cue));
}

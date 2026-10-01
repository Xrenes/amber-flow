import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// Plays the alarm tones (same three as desktop: Default, Gentle, Urgent) at
// a given volume — used for the Settings tone/volume preview. One player per
// tone is created on first use and reused.
const SOURCES = {
  default: require('../../../assets/sounds/default.wav'),
  gentle: require('../../../assets/sounds/gentle.wav'),
  urgent: require('../../../assets/sounds/urgent.wav'),
} as const;

export type ToneKey = keyof typeof SOURCES;

const players: Partial<Record<ToneKey, AudioPlayer>> = {};
let modeSet = false;

export async function previewTone(tone: string, volumePct: number) {
  const key: ToneKey = tone === 'gentle' || tone === 'urgent' ? tone : 'default';
  try {
    if (!modeSet) {
      // iPhone: play even with the ring/silent switch on, like an alarm should.
      await setAudioModeAsync({ playsInSilentMode: true });
      modeSet = true;
    }
    const player = (players[key] ||= createAudioPlayer(SOURCES[key]));
    player.volume = Math.max(0, Math.min(1, volumePct / 100));
    await player.seekTo(0);
    player.play();
  } catch (err) {
    console.warn('[amber-flow] tone preview failed:', err);
  }
}

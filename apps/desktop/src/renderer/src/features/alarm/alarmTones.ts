// The alarm's built-in tones — the single source of truth for what an
// alarm actually sounds like, so the Settings "Preview" button plays
// exactly what fires when an appointment's reminder or due time hits (the
// two used to be separate, drifted implementations: Settings had its own
// weaker stand-in beep that didn't match the real alarm in useAlarm.ts).
//
// Ported from app.js's beep() (one shared function for both the real alarm
// and the Settings preview), with every tone's gain raised so the alarm is
// loud and hard to miss by default, not just audible.

export type AlarmTone = 'default' | 'gentle' | 'urgent' | 'custom';

export function ensureAudioContext(ref: { current: AudioContext | null }): AudioContext | null {
  if (!ref.current) {
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      ref.current = Ctor ? new Ctor() : null;
    } catch {
      ref.current = null;
    }
  }
  if (ref.current && ref.current.state === 'suspended') {
    ref.current.resume().catch(() => {});
  }
  return ref.current;
}

// vol is 0..1. Each tone's gain is tuned to be loud and distinct:
// - default: a hard two-tone siren (the classic alarm clock sound)
// - gentle: a single warm chime — quieter than the others on purpose, it's
//   the "not jarring" option, but still clearly audible
// - urgent: a fast triple pulse, the loudest and most insistent option
export function playAlarmTone(ctx: AudioContext, tone: AlarmTone, vol: number): void {
  const now = ctx.currentTime;

  if (tone === 'gentle') {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 528;
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol * 0.8, now + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.9);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.9);
  } else if (tone === 'urgent') {
    [0, 0.18, 0.36].forEach((offset) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.value = 960;
      gain.gain.setValueAtTime(0, now + offset);
      gain.gain.linearRampToValueAtTime(vol * 0.85, now + offset + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + offset + 0.14);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  } else {
    // default
    [880, 660].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, now + i * 0.25);
      gain.gain.linearRampToValueAtTime(vol * 0.7, now + i * 0.25 + 0.02);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.25 + 0.22);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + i * 0.25);
      osc.stop(now + i * 0.25 + 0.25);
    });
  }
}

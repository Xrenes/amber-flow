import React, { useEffect, useRef, useState } from 'react';
import { useSettings } from './useSettings';
import styles from './SettingsModal.module.css';

interface SettingsModalProps {
  displayName?: string;
  onClose: () => void;
  onSaveName?: (name: string) => void;
}

const REMINDER_OPTIONS = [
  { value: 0, label: 'No reminder' },
  { value: 5, label: '5 minutes before' },
  { value: 10, label: '10 minutes before' },
  { value: 15, label: '15 minutes before' },
  { value: 30, label: '30 minutes before' },
  { value: 60, label: '1 hour before' },
  { value: 120, label: '2 hours before' },
  { value: 1440, label: '1 day before' },
];

// Lightweight standalone tone preview (app.js's ensureAudioCtx/beep live in
// the alarm feature being built separately; this reproduces just enough of
// the 3 built-in tones for the Preview button to be meaningful here).
let audioCtx: AudioContext | null = null;
function ensureAudioCtx() {
  if (!audioCtx) {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) audioCtx = new Ctor();
  }
  return audioCtx;
}
function beep(tone: string, volume: number) {
  const ctx = ensureAudioCtx();
  if (!ctx) return;
  const now = ctx.currentTime;
  const freqs = tone === 'gentle' ? [660, 880] : tone === 'urgent' ? [880, 880, 880] : [740];
  const gain = ctx.createGain();
  gain.gain.value = Math.max(0, Math.min(1, volume / 100)) * 0.3;
  gain.connect(ctx.destination);
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = tone === 'urgent' ? 'square' : 'sine';
    osc.frequency.value = f;
    osc.connect(gain);
    const start = now + i * 0.16;
    osc.start(start);
    osc.stop(start + 0.14);
  });
}

// Ports openSettings/closeSettings/_toggleCustomToneRow/settingsSaveBtn from
// app.js. Browser-notification toggle requests permission on save, matching
// the original's `Notification.requestPermission()` call.
export default function SettingsModal({ displayName, onClose, onSaveName }: SettingsModalProps) {
  const { settings, update } = useSettings();

  const [name, setName] = useState(settings.displayName || displayName || '');
  const [defaultReminderMins, setDefaultReminderMins] = useState(settings.defaultReminderMins ?? 60);
  const [soundEnabled, setSoundEnabled] = useState(settings.soundEnabled !== false);
  const [browserNotif, setBrowserNotif] = useState(
    typeof Notification !== 'undefined' && Notification.permission === 'granted' && settings.browserNotif !== false
  );
  const [alarmTone, setAlarmTone] = useState(settings.alarmTone || 'default');
  const [alarmVolume, setAlarmVolume] = useState(settings.alarmVolume ?? 80);
  const [customToneName, setCustomToneName] = useState(settings.customToneName || 'No file chosen');
  const customAudioUrl = useRef<string | null>(null);
  const volPreviewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  function handleOverlayClick(e: React.MouseEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget) onClose();
  }

  function preview(tone: string, vol: number) {
    if (tone === 'custom') {
      if (customAudioUrl.current) {
        const audio = new Audio(customAudioUrl.current);
        audio.volume = Math.max(0, Math.min(1, vol / 100));
        audio.play().catch(() => {});
      }
    } else {
      beep(tone, vol);
    }
  }

  function handleToneChange(value: string) {
    setAlarmTone(value as typeof alarmTone);
    preview(value, alarmVolume);
  }

  function handleVolumeInput(value: number) {
    setAlarmVolume(value);
    if (volPreviewTimer.current) clearTimeout(volPreviewTimer.current);
    volPreviewTimer.current = setTimeout(() => preview(alarmTone, value), 350);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    customAudioUrl.current = url;
    setCustomToneName(file.name);
    setAlarmTone('custom');
  }

  async function handleSave() {
    if (browserNotif && typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
    const grantedBrowserNotif =
      browserNotif && typeof Notification !== 'undefined' && Notification.permission === 'granted';

    update({
      displayName: name.trim(),
      defaultReminderMins,
      soundEnabled,
      browserNotif: grantedBrowserNotif,
      alarmTone,
      alarmVolume,
      customToneName: alarmTone === 'custom' ? customToneName : settings.customToneName,
    });
    onSaveName?.(name.trim());
    onClose();
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>Settings</h2>
          <button type="button" className={styles.iconBtn} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Profile</h3>
            <label>
              <span>Display name</span>
              <input type="text" placeholder="Your name" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
            </label>
          </div>

          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Tasks</h3>
            <label>
              <span>Default reminder</span>
              <select value={defaultReminderMins} onChange={(e) => setDefaultReminderMins(Number(e.target.value))}>
                {REMINDER_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Notifications</h3>
            <label className={styles.settingsToggleRow}>
              <span>Alarm sound</span>
              <span className={styles.settingsToggle}>
                <input type="checkbox" checked={soundEnabled} onChange={(e) => setSoundEnabled(e.target.checked)} />
                <span className={styles.settingsToggleTrack} />
              </span>
            </label>
            <label className={styles.settingsToggleRow}>
              <span>Browser notifications</span>
              <span className={styles.settingsToggle}>
                <input type="checkbox" checked={browserNotif} onChange={(e) => setBrowserNotif(e.target.checked)} />
                <span className={styles.settingsToggleTrack} />
              </span>
            </label>
          </div>

          <div className={styles.settingsSection}>
            <h3 className={styles.settingsSectionTitle}>Alarm Sound</h3>
            <label>
              <span>Tone</span>
              <div className={styles.alarmToneRow}>
                <select value={alarmTone} onChange={(e) => handleToneChange(e.target.value)}>
                  <option value="default">Default beep</option>
                  <option value="gentle">Gentle chime</option>
                  <option value="urgent">Urgent pulse</option>
                  <option value="custom">Custom file...</option>
                </select>
                <button
                  type="button"
                  className={styles.alarmPreviewBtn}
                  title="Preview tone"
                  onClick={() => preview(alarmTone, alarmVolume)}
                >
                  <svg viewBox="0 0 24 24" width="13" height="13" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                </button>
              </div>
            </label>
            {alarmTone === 'custom' && (
              <div className={styles.customToneRow}>
                <label className={styles.customToneLabel}>
                  <span>Audio file</span>
                  <div className={styles.customToneInputRow}>
                    <span className={styles.customToneFilename}>{customToneName}</span>
                    <label className={styles.customTonePickBtn}>
                      Browse
                      <input
                        type="file"
                        accept="audio/mpeg,audio/ogg,audio/wav,audio/aac,audio/flac,audio/mp4,audio/*"
                        className={styles.hiddenFileInput}
                        onChange={handleFileChange}
                      />
                    </label>
                  </div>
                </label>
              </div>
            )}
            <div className={styles.volumeRow}>
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={100}
                value={alarmVolume}
                className={styles.settingsRange}
                onChange={(e) => handleVolumeInput(Number(e.target.value))}
              />
              <span className={styles.volumeLabel}>{alarmVolume}%</span>
            </div>
          </div>

          <div className={styles.modalActions}>
            <button type="button" className={styles.primaryBtn} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

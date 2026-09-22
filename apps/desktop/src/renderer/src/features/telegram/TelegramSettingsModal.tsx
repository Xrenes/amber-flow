import React, { useEffect, useState } from 'react';
import { useTelegram } from './useTelegram';
import styles from './TelegramSettingsModal.module.css';

interface TelegramSettingsModalProps {
  userId?: string;
  onClose: () => void;
}

// Ports openTGSettings/closeTGSettings/showTGStatus + the tgSaveBtn/tgTestBtn
// handlers from app.js.
export default function TelegramSettingsModal({ userId, onClose }: TelegramSettingsModalProps) {
  const { settings, isConnected, status, busy, connect, disconnect, sendTest, showStatus } = useTelegram(userId);
  const [name, setName] = useState(settings.name);
  const [chatId, setChatId] = useState(settings.chatId);

  useEffect(() => {
    if (isConnected) {
      showStatus('✅ Integration on! Telegram notifications are active.', 'success');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  async function handleSave() {
    const ok = await connect(chatId, name);
    if (ok) setTimeout(onClose, 800);
  }

  function handleDisconnect() {
    disconnect();
    setChatId('');
    setName('');
  }

  return (
    <div className={styles.modalOverlay} onClick={handleOverlayClick}>
      <div className={styles.modal} role="dialog" aria-modal="true">
        <div className={styles.modalHeader}>
          <h2>Telegram Integration</h2>
          <button type="button" className={styles.iconBtn} aria-label="Close" onClick={onClose}>
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
        <div className={styles.modalBody}>
          {status.type && (
            <div className={`${styles.tgStatusBar} ${styles[status.type]}`}>{status.text}</div>
          )}
          <label>
            <span>
              Your name <em>(used in messages)</em>
            </span>
            <input type="text" placeholder="e.g. Alex" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <label>
            <span>Telegram Chat ID</span>
            <input
              type="text"
              placeholder="e.g. 123456789"
              inputMode="numeric"
              value={chatId}
              onChange={(e) => setChatId(e.target.value)}
            />
          </label>
          <details className={styles.tgGuide}>
            <summary>How to get your Telegram Chat ID</summary>
            <ol>
              <li>
                Open Telegram and search for <strong>@AmberFlowBot</strong>
              </li>
              <li>
                Send <code>/start</code> — the bot will reply with your Chat ID
              </li>
              <li>Paste that number above</li>
            </ol>
          </details>
          <div className={styles.modalActions}>
            {isConnected && (
              <button type="button" className={styles.ghostBtn} onClick={handleDisconnect}>
                Disconnect
              </button>
            )}
            <button type="button" className={styles.ghostBtn} disabled={busy} onClick={() => sendTest(chatId, name)}>
              Send test message
            </button>
            <button type="button" className={styles.primaryBtn} disabled={busy} onClick={handleSave}>
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

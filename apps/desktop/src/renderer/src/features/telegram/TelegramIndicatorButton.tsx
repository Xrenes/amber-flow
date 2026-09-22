import React from 'react';
import { useTelegram } from './useTelegram';
import styles from './TelegramSettingsModal.module.css';

interface TelegramIndicatorButtonProps {
  userId?: string;
  onClick: () => void;
}

// Ports updateTGIndicator()/the tgSettingsBtn dot from app.js: a topbar
// button that reflects connection state (green glowing dot + "connected"
// styling when a chat ID is saved).
export default function TelegramIndicatorButton({ userId, onClick }: TelegramIndicatorButtonProps) {
  const { isConnected } = useTelegram(userId);

  return (
    <button
      type="button"
      className={`${styles.tgBtn} ${isConnected ? styles.connected : ''}`}
      title={isConnected ? 'Telegram: Integration on!' : 'Set up Telegram notifications'}
      onClick={onClick}
    >
      <span className={`${styles.tgDot} ${isConnected ? styles.tgDotOn : ''}`} />
      Telegram
    </button>
  );
}

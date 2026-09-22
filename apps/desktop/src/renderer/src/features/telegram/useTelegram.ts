import { useCallback, useEffect, useState } from 'react';
import { sendTelegramMessage as workerSendTelegramMessage, registerBotUser } from '@amber-flow/shared';

// Ports saveTGSettings/isTGConnected/updateTGIndicator from app.js, using the
// same localStorage key ('amber.telegram.v1') and shape ({ chatId, name }).
const TG_KEY = 'amber.telegram.v1';

export interface TGSettings {
  chatId: string;
  name: string;
}

const DEFAULT_TG: TGSettings = { chatId: '', name: '' };

function loadTGSettings(): TGSettings {
  try {
    const raw = localStorage.getItem(TG_KEY);
    return raw ? JSON.parse(raw) : DEFAULT_TG;
  } catch {
    return DEFAULT_TG;
  }
}

// Same-tab components (e.g. the topbar indicator + the settings modal) each
// hold their own copy of this state; native `storage` events only fire in
// *other* tabs, so we also dispatch a same-window CustomEvent on every save
// to keep every useTelegram() instance in this window in sync.
const TG_LOCAL_EVENT = 'amber:tg-settings-changed';

function persistTGSettings(s: TGSettings) {
  localStorage.setItem(TG_KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent(TG_LOCAL_EVENT));
}

export type TGStatusType = 'success' | 'error' | 'info' | null;

export function useTelegram(userId?: string) {
  const [settings, setSettings] = useState<TGSettings>(() => loadTGSettings());
  const [status, setStatus] = useState<{ text: string; type: TGStatusType }>({ text: '', type: null });
  const [busy, setBusy] = useState(false);

  const isConnected = !!settings.chatId;

  const showStatus = useCallback((text: string, type: TGStatusType) => setStatus({ text, type }), []);
  const clearStatus = useCallback(() => setStatus({ text: '', type: null }), []);

  const saveSettings = useCallback((s: TGSettings) => {
    persistTGSettings(s);
    setSettings(s);
  }, []);

  // Ports the tgSaveBtn click handler: normalize chatId to digits, persist,
  // and register with the bot registry.
  const connect = useCallback(
    async (chatId: string, name: string) => {
      const cleanChatId = chatId.trim().replace(/\D/g, '');
      if (!cleanChatId) {
        showStatus('Telegram Chat ID is required.', 'error');
        return false;
      }
      setBusy(true);
      const s = { chatId: cleanChatId, name: name.trim() };
      saveSettings(s);
      try {
        if (userId) await registerBotUser(cleanChatId, userId);
      } catch {
        /* non-critical, mirrors app.js's swallow-and-continue */
      }
      showStatus('Settings saved.', 'success');
      setBusy(false);
      return true;
    },
    [saveSettings, showStatus, userId]
  );

  const disconnect = useCallback(() => {
    saveSettings(DEFAULT_TG);
    clearStatus();
  }, [saveSettings, clearStatus]);

  // Ports tgTestBtn: sends a real test message via the Worker.
  const sendTest = useCallback(async (chatId: string, name: string) => {
    const cleanChatId = chatId.trim().replace(/\D/g, '');
    if (!cleanChatId) {
      showStatus('Enter your Telegram Chat ID first.', 'error');
      return;
    }
    showStatus('Sending test message...', 'info');
    const greeting = name ? `Hi ${name}!` : 'Hi!';
    const msg = `${greeting} Amber Flow is connected via Telegram. You will receive task reminders here.`;
    try {
      const data = await workerSendTelegramMessage(cleanChatId, msg);
      if (data.ok) {
        showStatus('Test message sent! Check Telegram.', 'success');
      } else {
        showStatus(data.error || 'Failed. Check your Chat ID.', 'error');
      }
    } catch {
      showStatus('Network error. Check Worker URL.', 'error');
    }
  }, [showStatus]);

  // Ports sendTelegramMessage() (generic message send, used for alerts elsewhere).
  const sendMessage = useCallback(
    async (text: string) => {
      if (!isConnected) return;
      try {
        await workerSendTelegramMessage(settings.chatId, text);
      } catch {
        /* noop, mirrors app.js */
      }
    },
    [isConnected, settings.chatId]
  );

  useEffect(() => {
    // Keep in sync with other tabs (storage event) and other useTelegram()
    // instances in this same window (custom event dispatched on save).
    function onStorage(e: StorageEvent) {
      if (e.key === TG_KEY) setSettings(loadTGSettings());
    }
    function onLocalChange() {
      setSettings(loadTGSettings());
    }
    window.addEventListener('storage', onStorage);
    window.addEventListener(TG_LOCAL_EVENT, onLocalChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(TG_LOCAL_EVENT, onLocalChange);
    };
  }, []);

  return {
    settings,
    isConnected,
    status,
    busy,
    connect,
    disconnect,
    sendTest,
    sendMessage,
    showStatus,
    clearStatus,
  };
}

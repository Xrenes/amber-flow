import { contextBridge, ipcRenderer } from 'electron';

const api = {
  platform: process.platform,
  // Brings the app window to the foreground (restoring/focusing/flashing the
  // taskbar icon) — used when a task/appointment alarm fires so a due
  // reminder pulls attention even if the window is minimized or behind
  // other apps, matching what a native desktop app is expected to do.
  focusWindow: () => ipcRenderer.send('alarm:focus-window'),
};

contextBridge.exposeInMainWorld('amberDesktop', api);

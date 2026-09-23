import { app, shell, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { is } from './utils';

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: '#0b0c10',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.on('focus', () => {
    mainWindow?.flashFrame(false);
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

// Brings the app window to the foreground when a task/appointment alarm
// fires — a due reminder should pull focus even if the window is minimized
// or behind other apps, which a browser tab could never do.
ipcMain.on('alarm:focus-window', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  if (!mainWindow.isFocused()) mainWindow.flashFrame(true);
});

// Electron/Chromium uses this for the OS notification's app-name label on
// Windows (separate from the AUMID) — without it, dev-mode notifications
// show the raw executable/AUMID instead of "Amber Flow".
app.setName('Amber Flow');

app.whenReady().then(() => {
  app.setAppUserModelId('com.amberflow.desktop');

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

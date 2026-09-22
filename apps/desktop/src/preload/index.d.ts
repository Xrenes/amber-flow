export interface AmberDesktopApi {
  platform: NodeJS.Platform;
  focusWindow: () => void;
}

declare global {
  interface Window {
    amberDesktop: AmberDesktopApi;
  }
}

/// <reference types="vite/client" />
/// <reference path="../../preload/index.d.ts" />

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}

declare module '*.png' {
  const src: string;
  export default src;
}

declare module '*.jpg' {
  const src: string;
  export default src;
}

// Electron's <webview> tag isn't part of React's standard JSX intrinsics —
// declared here so TSX can use it directly (webviewTag: true is set in
// src/main/index.ts's BrowserWindow webPreferences). Typed loosely (the
// handful of attributes this app actually uses) rather than pulling in
// @types/electron's much larger WebviewTag surface just for a JSX tag.
declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
      src?: string;
      allowpopups?: string;
      partition?: string;
    };
  }
}

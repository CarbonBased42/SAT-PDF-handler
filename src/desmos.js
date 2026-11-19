/**
 * desmos.js — optional Desmos integration with graceful fallbacks.
 *
 * Preferred: the official Desmos JS API (set an API key in Settings).
 * Fallback: Desmos' embeddable calculator iframe.
 * Final fallback: the built-in grapher (grapher.js).
 */

let apiPromise = null;

export const DESMOS_EMBED_URL = 'https://www.desmos.com/calculator?embed';

export function loadDesmosApi(apiKey) {
  if (window.Desmos) return Promise.resolve(window.Desmos);
  if (!apiKey) return Promise.reject(new Error('No Desmos API key configured.'));
  if (apiPromise) return apiPromise;

  apiPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://www.desmos.com/api/v1.10/calculator.js?apiKey=${encodeURIComponent(
      apiKey,
    )}`;
    script.async = true;
    script.onload = () => {
      if (window.Desmos) resolve(window.Desmos);
      else {
        apiPromise = null;
        reject(new Error('Desmos loaded but did not initialise.'));
      }
    };
    script.onerror = () => {
      apiPromise = null;
      reject(new Error('Could not load the Desmos API.'));
    };
    document.head.appendChild(script);
  });

  return apiPromise;
}

export function createDesmosCalculator(host, Desmos) {
  host.innerHTML = '';
  const calculator = Desmos.GraphingCalculator(host, {
    expressions: true,
    settingsMenu: true,
    zoomButtons: true,
    keypad: true,
    graphpaper: true,
    border: false,
    expressionsCollapsed: false,
    administerSecretFolders: false,
  });
  return calculator;
}

export function createDesmosIframe(host) {
  host.innerHTML = '';
  const iframe = document.createElement('iframe');
  iframe.src = DESMOS_EMBED_URL;
  iframe.className = 'desmos-frame';
  iframe.title = 'Desmos graphing calculator';
  iframe.allow = 'clipboard-write';
  iframe.referrerPolicy = 'no-referrer-when-downgrade';
  host.appendChild(iframe);
  return iframe;
}

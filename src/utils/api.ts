import { createPopupClient } from '../rpc/popupClient';
import { PLATFORM_ORIGIN, PLATFORM_URL } from './consts';

let _ready = false;
let _readyPromise: Promise<any> | null = null;

export function isReady() {
  return _ready;
}

export const rpc = createPopupClient(PLATFORM_URL, {
  targetOrigin: PLATFORM_ORIGIN,
  autoAttach: true, // reattach after HMR
});

/**
 * Resolves when platform sends LCAP_READY.
 * Times out if not ready within timeoutMs.
 */
export function waitForReady(
  timeoutMs = 15_000,
  expectedOrigin?: string // e.g., "https://eapps-test.eng.infiniteblue.com"
): Promise<any> {
  // If we've already seen READY, resolve immediately.
  if (_ready) return Promise.resolve({ type: 'LCAP_READY', cached: true });

  // If there's already a waiter in-flight, reuse it.
  if (_readyPromise) return _readyPromise;

  _readyPromise = new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener('message', onMsg);
      _readyPromise = null; // allow future calls if needed
    };

    const onMsg = (evt: MessageEvent) => {
      // Strict origin check if provided
      if (expectedOrigin && evt.origin !== expectedOrigin) return;

      const data = (evt.data || {}) as any;
      if (data?.type === 'LCAP_READY') {
        _ready = true;
        cleanup();
        resolve(data);
      }
    };

    window.addEventListener('message', onMsg);

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for LCAP_READY'));
    }, timeoutMs);
  });

  return _readyPromise;
}

export const makeRequest = async (query, ...params) => {
  if (process.env.NODE_ENV !== 'production') {
    try {
      return await rpc.call(`${query}`, ...params);
    } catch (e) {
      console.error('Error making RPC request:', e);
    }
  } else {
    try {
      const parts = query.split('.');
      let ctx: any = window as any;

      // Walk down to the parent object of the final function
      for (let i = 0; i < parts.length - 1; i++) ctx = ctx[parts[i]];

      // Call the function with its parent as `this`
      const fn = parts.length === 1 ? (window as any)[parts[0]] : ctx[parts[parts.length - 1]];

      return Promise.resolve(fn.apply(parts.length === 1 ? window : ctx, params));
    } catch (e) {
      console.error('Error making _RB request:', e);
    }
  }
};

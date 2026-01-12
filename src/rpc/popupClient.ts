type Pending = { resolve: (v: any) => void; reject: (e: any) => void; timer: number };

type Options = {
  targetOrigin: string; // platform origin, e.g. "https://platform.company.com"
  timeoutMins?: number;
  windowName?: string; // stable name to reattach the same tab
  autoAttach?: boolean; // try to reattach on import (HMR-friendly)
};

declare global {
  interface Window {
    __RB_BRIDGE?: {
      server: Window | null;
      nonce: string;
      ready: boolean;
      windowName: string;
      targetOrigin: string;
      cbSeq: number;
      callbacks: Map<number, (...args: any[]) => void>;
    };
    __RB_BRIDGE_LISTENER?: boolean;
  }
}

export function createPopupClient(platformUrl: string, opts: Options) {
  const { targetOrigin, timeoutMins = 60, windowName = 'lcap-dev-bridge', autoAttach = true } = opts;

  // Initialize global bridge state once (survives HMR)
  if (!window.__RB_BRIDGE) {
    window.__RB_BRIDGE = {
      server: null,
      nonce: sessionStorage.getItem('rb_nonce') ?? crypto.getRandomValues(new Uint32Array(4)).join('-'),
      ready: false,
      windowName,
      targetOrigin,
      cbSeq: 1,
      callbacks: new Map<number, (...args: any[]) => void>(),
    };
    sessionStorage.setItem('rb_nonce', window.__RB_BRIDGE.nonce);
  } else {
    // keep latest config
    window.__RB_BRIDGE.windowName = windowName;
    window.__RB_BRIDGE.targetOrigin = targetOrigin;
  }

  const state = window.__RB_BRIDGE;
  const pending = new Map<number, Pending>();
  let seq = 0;

  // One global message listener (guarded for HMR)
  if (!window.__RB_BRIDGE_LISTENER) {
    window.__RB_BRIDGE_LISTENER = true;
    window.addEventListener('message', (evt) => {
      if (evt.origin !== state.targetOrigin) return;
      const msg = evt.data;
      if (!msg || typeof msg !== 'object') return;
      if (msg.nonce && msg.nonce !== state.nonce) return;

      if (msg.type === 'LCAP_READY') {
        state.ready = true;
        return;
      }

      if (msg.type === 'LCAP_RPC_CB' && msg.nonce === state.nonce) {
        const fn = state.callbacks.get(msg.cbId);
        if (fn) {
          try {
            fn(...(msg.cbArgs ?? []));
          } catch {}
        }
        return;
      }

      if (msg.type !== 'LCAP_RPC_RESULT') return;

      const { id, ok, result, error } = msg;
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      clearTimeout(entry.timer);
      ok ? entry.resolve(result) : entry.reject(new Error(error));
    });
  }

  function sendHelloBurst() {
    const start = Date.now();
    const tick = () => {
      if (!state.server || state.server.closed) return;
      state.server.postMessage({ type: 'LCAP_HELLO', nonce: state.nonce }, state.targetOrigin);
      if (Date.now() - start < 5000) setTimeout(tick, 400);
    };
    tick();
  }

  /** Must be called in a direct click to avoid popup blockers */
  function connectFromClick() {
    state.server = window.open(platformUrl, state.windowName) as Window | null;
    if (!state.server) throw new Error('Popup blocked. Trigger from a user click.');
    state.ready = false;
    // keep same nonce across HMR/page lifetime
    sendHelloBurst();
  }

  /** Reattach to an already-open named window (no new popup, no gesture) */
  function attachToExisting(): boolean {
    const w = window.open('', state.windowName) as Window | null;
    if (!w) return false;
    state.server = w;
    state.ready = false;
    // reuse persisted nonce
    state.server.postMessage({ type: 'LCAP_HELLO', nonce: state.nonce }, state.targetOrigin);
    return true;
  }

  function encodeArgsWithCallbacks(args: any[]) {
    return (
      args?.map((a) => {
        if (typeof a === 'function') {
          const id = state.cbSeq++;
          state.callbacks.set(id, a);
          return { __cb: id }; // placeholder; server will materialize
        }
        return a;
      }) ?? []
    );
  }

  async function call(name: string, ...args: any[]) {
    if (!state.server || state.server.closed) {
      throw new Error('Not connected — click Connect or let autoAttach run.');
    }
    const id = ++seq;
    const timer = window.setTimeout(
      () => {
        const entry = pending.get(id);
        if (!entry) return;
        pending.delete(id);
        entry.reject(new Error(`RPC timeout for '${name}' after ${timeoutMins} mins`));
      },
      timeoutMins * 60 * 1000
    );

    const p = new Promise((resolve, reject) => pending.set(id, { resolve, reject, timer }));

    const payload = {
      type: 'LCAP_RPC',
      id,
      root: name.includes('.') ? name.split('.')[0] : '_RB',
      name,
      args: encodeArgsWithCallbacks(args),
    };

    state.server.postMessage(payload, state.targetOrigin);

    return p;
  }

  // Try to reattach automatically on module (re)load
  if (autoAttach) {
    try {
      attachToExisting();
    } catch {}
  }

  return {
    connectFromClick,
    attachToExisting,
    call,
    isConnected: () => !!state.server && !state.server.closed && state.ready,
  };
}

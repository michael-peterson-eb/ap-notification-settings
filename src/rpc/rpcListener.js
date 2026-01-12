/**
 * To call _RB functions from local host, set up a connection to the platform
 * in components like this:
 *
 * Put in the platform URL you want to connect to:
 * const PLATFORM_URL = "https://eapps-test.eng.infiniteblue.com/prod3/m/main.jsp?pageId=7948945&id=418628738";
 * 
 * Establish the RPC connection:
 * const rpc = createPopupClient(PLATFORM_URL);
 * 
 * 
 * One time call to connect to the platform. It will open in another tab. Once on the tab,
 * open the console and run the IIFE to connect to the platform.
 * 
 * 
 *  const handleConnect = () => {
    try {
      rpc.openFromClick(); // MUST run inside this click to avoid popup blocker
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message || e));
    }
  };
 *
 *
 */

(() => {
  // Allow these entry points. Can be roots (objects on window) OR bare global fns.
  const ROOTS = ['_RB', 'rbf_getViewPage', 'getColumnsBySectionName']; // adjust as needed
  const TRUSTED_ORIGIN = 'http://localhost:3000'; // MUST match your React app origin exactly
  let sessionNonce = null;

  // Turn callback placeholders from the client into real functions that post back
  function materializeArgs(args, postBack, callId) {
    if (!Array.isArray(args)) return args;
    return args.map((a) => {
      if (a && typeof a === 'object' && a.__cb && typeof a.__cb === 'number') {
        const cbId = a.__cb;
        return (...cbArgs) => {
          // Remove / stringify non-cloneables (e.g., functions) so postMessage succeeds.
          const safe = (v) => {
            if (typeof v === 'function') return { __type: 'function', note: 'omitted' };
            if (v && typeof v === 'object') {
              // shallow copy is enough for typical payloads
              const o = Array.isArray(v) ? [] : {};
              for (const k in v) o[k] = safe(v[k]);
              return o;
            }
            return v;
          };
          const safeArgs = (cbArgs || []).map(safe);
          try {
            postBack({
              type: 'LCAP_RPC_CB',
              id: callId,
              cbId,
              cbArgs: safeArgs,
              nonce: sessionNonce,
            });
          } catch (_) {}
        };
      }
      return a;
    });
  }

  function isAllowed(name) {
    // allow either exact match (for bare globals) or prefix "<root>."
    return ROOTS.some((r) => name === r || name.startsWith(r + '.'));
  }

  // Resolve "A.B.C" from window, or bare "foo"
  function resolveFn(name) {
    if (!name.includes('.')) return { fn: window[name], base: window };
    const parts = name.split('.');
    let cur = window[parts[0]];
    let base = window;
    for (let i = 1; i < parts.length; i++) {
      base = cur;
      cur = cur?.[parts[i]];
    }
    return { fn: cur, base };
  }

  window.addEventListener('message', async (evt) => {
    if (evt.origin !== TRUSTED_ORIGIN) return;
    const msg = evt.data;
    if (!msg) return;

    // Allow either message name your client might use
    const isCall = msg.type === 'LCAP_RPC_CALL' || msg.type === 'LCAP_RPC';

    // Hoist so catch can reference safely
    let callId = msg && msg.id;

    try {
      // Handshake: reply READY (not RESULT) and stash nonce
      if (msg.type === 'LCAP_HELLO' && typeof msg.nonce === 'string') {
        sessionNonce = msg.nonce;
        evt.source?.postMessage({ type: 'LCAP_READY', nonce: sessionNonce }, TRUSTED_ORIGIN);
        return;
      }

      if (!isCall) return;
      if (msg.nonce && sessionNonce && msg.nonce !== sessionNonce) return;

      const { id, name, args } = msg;
      callId = id;

      if (!name || typeof name !== 'string') {
        throw new Error('RPC missing "name"');
      }
      if (!isAllowed(name)) {
        throw new Error(`RPC name must start with/equals one of: ${ROOTS.join(', ')}`);
      }

      const { fn, base } = resolveFn(name);
      if (typeof fn !== 'function') {
        throw new Error(`Not a function: ${name}`);
      }

      const matArgs = materializeArgs(args, (payload) => evt.source?.postMessage(payload, TRUSTED_ORIGIN), id);
      const result = await Promise.resolve(fn.apply(base, matArgs || []));
      evt.source?.postMessage({ type: 'LCAP_RPC_RESULT', id, ok: true, result, nonce: sessionNonce }, TRUSTED_ORIGIN);
    } catch (e) {
      evt.source?.postMessage(
        {
          type: 'LCAP_RPC_RESULT',
          id: callId ?? null,
          ok: false,
          error: String(e?.message || e),
          nonce: sessionNonce,
        },
        TRUSTED_ORIGIN
      );
    }
  });

  // Example helper to get Kendo columns from a section grid by name
  // This is purely to continue development while a new rbf_getViewColumns API is built.
  // The status of this API is at PA-27452 (https://everbridge.atlassian.net/browse/PA-27452).
  window.getColumnsBySectionName = (name) => {
    const normalizedName = String((name ?? '').trim());
    console.log('getColumnsBySectionName called with name:', normalizedName);

    // Safer selector in case names ever contain special chars
    const escaped = window.CSS && CSS.escape ? CSS.escape(normalizedName) : normalizedName;
    const gridEl = document.querySelector(`section[name="${escaped}"] div[data-role="grid"]`);
    const sectionNum = gridEl?.id;

    if (!sectionNum) return null;

    const columns = rbf_getPageComponent(sectionNum).getKendoConfig().columns;

    // Produce a JSON-serializable copy: drop or stringify any function values
    const safeColumns = columns.map((col) => {
      const cleaned = {};
      for (const [key, val] of Object.entries(col)) {
        if (typeof val === 'function') {
          cleaned[key] = '[Function]';
        } else {
          cleaned[key] = val;
        }
      }

      // Common Kendo props that are often functions—explicitly remove if present:
      delete cleaned.template;
      delete cleaned.editor;
      delete cleaned.footerTemplate;
      delete cleaned.headerTemplate;

      return cleaned;
    });

    return safeColumns;
  };

  console.log('[SERVER] RPC ready', { roots: ROOTS });
})();

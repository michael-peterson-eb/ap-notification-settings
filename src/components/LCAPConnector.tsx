import { useState, useEffect, useRef } from 'react';
import { rpc, makeRequest, waitForReady } from '../utils/api';
import { PLATFORM_ORIGIN } from '../utils/consts';

const READY_KEY = 'lcap.ready';
const ORIGIN_KEY = 'lcap.origin';
const PROCEEDED_KEY = 'lcap.proceeded'; // NEW

export const LCAPConnector = ({ onProceed }) => {
  const [result, setResult] = useState<any>(null);
  const [err, setErr] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // prevent double navigation
  const autoProceededRef = useRef(false);

  const handleConnect = async () => {
    try {
      if (!ready) {
        rpc.connectFromClick(); // must be inside a user click
      }
      await waitForReady(15000, PLATFORM_ORIGIN);
      setReady(true);
      setErr(null);

      // persist "connected for this tab session"
      sessionStorage.setItem(READY_KEY, '1');
      sessionStorage.setItem(ORIGIN_KEY, PLATFORM_ORIGIN);
    } catch (e: any) {
      setErr(String(e?.message || e));
      // clear flags on failure
      sessionStorage.removeItem(READY_KEY);
      sessionStorage.removeItem(ORIGIN_KEY);
      sessionStorage.removeItem(PROCEEDED_KEY);
    }
  };

  const handleProceedClick = () => {
    // remember that the user already proceeded in this tab session
    sessionStorage.setItem(PROCEEDED_KEY, '1');
    onProceed();
  };

  const makeExampleRequest = async () => {
    setErr(null);
    setResult(null);

    try {
      const res = await makeRequest(
        '_RB.selectQuery',
        ['id', 'name', 'status#code', 'EA_SA_txtCode', 'EA_SA_rsAssessmentQuestionType', 'EA_SA_rsAssessmentQuestions', 'EA_SA_txtaAdditionalInformation'],
        'EA_SA_OperationsSection',
        '',
        100,
        true
      );

      setResult(res);
    } catch (e: any) {
      setErr(String(e?.message || e));
      console.error('selectQuery error', e);
    }
  };

  // 🔇 Silent fast-path on first render
  useEffect(() => {
    let cancelled = false;

    const trySilentReady = async () => {
      if (sessionStorage.getItem(READY_KEY) === '1') {
        // use stored origin if present, else fall back
        const storedOrigin = sessionStorage.getItem(ORIGIN_KEY) ?? PLATFORM_ORIGIN;

        try {
          // short timeout since we think we're already connected
          await waitForReady(1200, storedOrigin);
          if (!cancelled) {
            setReady(true);
            setErr(null);
          }
        } catch {
          // not actually alive; clear and require user click
          sessionStorage.removeItem(READY_KEY);
          sessionStorage.removeItem(ORIGIN_KEY);
          sessionStorage.removeItem(PROCEEDED_KEY); // also drop the proceed memory
        }
      }
    };

    trySilentReady();
    return () => {
      cancelled = true;
    };
  }, []);

  // 🚀 Auto-proceed after a refresh once connection is silently ready
  useEffect(() => {
    const shouldAutoProceed = ready && sessionStorage.getItem(PROCEEDED_KEY) === '1' && !autoProceededRef.current;

    if (shouldAutoProceed) {
      autoProceededRef.current = true; // guard first
      // small microtask to let state settle (optional)
      Promise.resolve().then(() => onProceed());
    }
  }, [ready, onProceed]);

  return (
    <div
      style={{
        fontFamily: 'system-ui, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
        maxWidth: '640px',
        margin: '2rem auto',
        padding: '1.5rem',
        borderRadius: '12px',
        background: 'linear-gradient(145deg, #1e1e2f, #25253c)',
        color: '#f4f4f5',
        boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
      }}>
      <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 600 }}>🔌 LCAP RPC Connector</h2>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
        }}>
        <button
          onClick={handleConnect}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            borderRadius: '8px',
            background: ready ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #29CDAF, #22c55e)',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 4px 10px rgba(41,205,175,0.3)',
            transition: 'transform 0.15s',
          }}
          onMouseDown={(e) => (e.currentTarget.style.transform = 'scale(0.96)')}
          onMouseUp={(e) => (e.currentTarget.style.transform = 'scale(1)')}>
          {ready ? 'Connected ✅' : 'Connect to Platform'}
        </button>

        <button
          onClick={makeExampleRequest}
          disabled={!ready}
          style={{
            padding: '0.75rem 1rem',
            border: 'none',
            borderRadius: '8px',
            background: !ready ? 'rgba(249,115,22,0.4)' : 'linear-gradient(90deg, #f97316, #f87171)',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 600,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: '0 4px 10px rgba(249,115,22,0.3)',
            transition: 'transform 0.15s',
          }}
          onMouseDown={(e) => ready && (e.currentTarget.style.transform = 'scale(0.96)')}
          onMouseUp={(e) => ready && (e.currentTarget.style.transform = 'scale(1)')}
          title={!ready ? 'Connect to the platform first' : undefined}>
          Run _RB.selectQuery
        </button>

        <button
          onClick={handleProceedClick} // UPDATED
          disabled={!ready}
          style={{
            gridColumn: '1 / span 2',
            padding: '0.85rem 1rem',
            border: 'none',
            borderRadius: '8px',
            background: !ready ? 'rgba(59,130,246,0.4)' : 'linear-gradient(90deg, #60a5fa, #3b82f6)',
            color: '#fff',
            fontSize: '0.95rem',
            fontWeight: 700,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: '0 4px 10px rgba(59,130,246,0.3)',
          }}
          title={!ready ? 'Connect to the platform first' : undefined}>
          ➡️ Proceed to Resources & Dependencies
        </button>
      </div>

      {err && (
        <div
          style={{
            background: '#3f1d1d',
            border: '1px solid #f87171',
            padding: '0.75rem',
            borderRadius: '8px',
            color: '#f87171',
            fontSize: '0.9rem',
            whiteSpace: 'pre-wrap',
          }}>
          ❌ {err}
        </div>
      )}

      {result && (
        <div
          style={{
            background: '#1e293b',
            border: '1px solid #334155',
            padding: '0.75rem',
            borderRadius: '8px',
            fontSize: '0.85rem',
            overflowX: 'auto',
            maxHeight: '320px',
          }}>
          <pre style={{ margin: 0, color: '#e2e8f0' }}>{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}
    </div>
  );
};

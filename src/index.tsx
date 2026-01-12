// index.tsx (or main.tsx)
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { injectStyles } from './injectStyles';

const ROOT_ID = 'eb-notification-settings-root';

function ensureMountNode() {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const el = document.createElement('div');
  el.id = ROOT_ID;
  document.body.appendChild(el);
  return el;
}

export function mountNotificationsApp() {
  // host concerns
  injectStyles();

  // render like normal
  const mountNode = ensureMountNode();
  const root = ReactDOM.createRoot(mountNode);
  root.render(<App />);

  // optional: let caller unmount if needed
  return () => root.unmount();
}

// Optional: auto-mount immediately (remove if host will call mountNotificationsApp)
mountNotificationsApp();

import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { injectStyles } from './injectStyles';
import { setPortalContainer } from './domScope';

const ROOT_ID = 'eb-notification-settings-root';
const isDev = process.env.NODE_ENV === 'development';

type ScopedMount = {
  mountNode: HTMLElement;
  portalNode: HTMLElement;
  styleTarget: ShadowRoot | null;
};

function ensureHostContainer(): HTMLElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const el = document.createElement('div');
  el.id = ROOT_ID;
  document.body.appendChild(el);
  return el;
}

function ensureReactMountNode(): ScopedMount {
  const host = ensureHostContainer();

  if (isDev) {
    return {
      mountNode: host,
      portalNode: host,
      styleTarget: null,
    };
  }

  const shadowRoot = host.shadowRoot ?? host.attachShadow({ mode: 'open' });

  let mountNode = shadowRoot.getElementById('eb-notification-settings-app-root') as HTMLDivElement | null;
  if (!mountNode) {
    mountNode = document.createElement('div');
    mountNode.id = 'eb-notification-settings-app-root';
    shadowRoot.appendChild(mountNode);
  }

  let portalNode = shadowRoot.getElementById('eb-notification-settings-portal-root') as HTMLDivElement | null;
  if (!portalNode) {
    portalNode = document.createElement('div');
    portalNode.id = 'eb-notification-settings-portal-root';
    shadowRoot.appendChild(portalNode);
  }

  return {
    mountNode,
    portalNode,
    styleTarget: shadowRoot,
  };
}

export function mountNotificationsApp() {
  const { mountNode, portalNode, styleTarget } = ensureReactMountNode();

  setPortalContainer(portalNode);

  if (!isDev && styleTarget) {
    injectStyles(styleTarget);
  }

  const root = ReactDOM.createRoot(mountNode);
  root.render(<App />);

  return () => root.unmount();
}

mountNotificationsApp();

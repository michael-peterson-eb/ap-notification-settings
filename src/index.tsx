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

function getHostContainer(): HTMLElement | null {
  return document.getElementById(ROOT_ID);
}

function ensureHostContainer(): HTMLElement {
  const existing = getHostContainer();
  if (existing) return existing;

  const el = document.createElement('div');
  el.id = ROOT_ID;
  document.body.appendChild(el);
  return el;
}

function ensureReactMountNode(host: HTMLElement): ScopedMount {
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

export function mountNotificationsApp(host = ensureHostContainer()) {
  const { mountNode, portalNode, styleTarget } = ensureReactMountNode(host);

  setPortalContainer(portalNode);

  if (!isDev && styleTarget) {
    injectStyles(styleTarget);
  }

  const root = ReactDOM.createRoot(mountNode);
  root.render(<App />);

  return () => root.unmount();
}

let mountedHost: HTMLElement | null = null;
let unmountNotificationsApp: (() => void) | null = null;

function mountCurrentNotificationsHost() {
  if (mountedHost && !mountedHost.isConnected) {
    unmountNotificationsApp?.();
    mountedHost = null;
    unmountNotificationsApp = null;
  }

  const host = getHostContainer() ?? (isDev ? ensureHostContainer() : null);
  if (!host || host === mountedHost) return;

  unmountNotificationsApp?.();
  mountedHost = host;
  unmountNotificationsApp = mountNotificationsApp(host);
}

mountCurrentNotificationsHost();

if (!isDev) {
  const observer = new MutationObserver(mountCurrentNotificationsHost);
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

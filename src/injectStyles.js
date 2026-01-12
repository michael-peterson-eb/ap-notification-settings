import cssModule from './tailwind.out.css';

export function injectStyles() {
  const cssText = typeof cssModule === 'string' ? cssModule : (cssModule?.default ?? '');

  if (!cssText || typeof cssText !== 'string') {
    console.error('Styles not injected: cssText is not a string', cssModule);
    return;
  }

  const style = document.createElement('style');
  style.setAttribute('data-app-styles', 'true');
  style.textContent = cssText;
  document.head.appendChild(style);
}

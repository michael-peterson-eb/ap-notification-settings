let portalContainer: HTMLElement | null = null;

export function setPortalContainer(nextPortalContainer: HTMLElement | null) {
  portalContainer = nextPortalContainer;
}

export function getPortalContainer() {
  return portalContainer ?? document.body;
}

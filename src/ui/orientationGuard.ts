// Orientation guard for a landscape-only game (tech-spec Decision 21).
// The browser's own orientation media query — not Phaser's ScaleManager —
// is the source of truth, so the guard works even while the canvas is
// letterboxed by Scale.FIT. Subscribers get an immediate callback for the
// current orientation and one per change; the return value detaches.

const QUERY = '(orientation: portrait)';

export interface OrientationHandlers {
  onPortrait: () => void;
  onLandscape: () => void;
}

export function watchOrientation(handlers: OrientationHandlers): () => void {
  const mql = window.matchMedia(QUERY);
  if (mql.matches) handlers.onPortrait();
  else handlers.onLandscape();

  const listener = (event: MediaQueryListEvent): void => {
    if (event.matches) handlers.onPortrait();
    else handlers.onLandscape();
  };

  mql.addEventListener('change', listener);
  return () => mql.removeEventListener('change', listener);
}

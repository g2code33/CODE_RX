import { useEffect } from 'react';

/**
 * CODE Rx — Class & Group zoom guard.
 *
 * The Class & Group surfaces are dense working consoles (tables, chips,
 * selects), so pinch- and double-tap zooming breaks the layout instead of
 * helping. While a Class & Group surface is mounted we tighten the viewport
 * meta (no user scaling) and swallow double-taps; the previous viewport is
 * restored on unmount so the rest of the site keeps its normal behaviour.
 */
const ZOOM_PROOF = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover';

export const useCgmNoZoom = (): void => {
  useEffect(() => {
    const meta = window.document.querySelector('meta[name="viewport"]');
    const previous = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', ZOOM_PROOF);
    const stopDoubleTap = (event: Event) => event.preventDefault();
    window.document.addEventListener('dblclick', stopDoubleTap);
    return () => {
      if (meta) {
        if (previous !== null) meta.setAttribute('content', previous);
        else meta.removeAttribute('content');
      }
      window.document.removeEventListener('dblclick', stopDoubleTap);
    };
  }, []);
};

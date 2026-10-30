import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * CODE Rx §38 — connection state banner.
 *
 * Online-first: the portals never fake results while offline, they say so.
 * The banner appears whenever the browser reports no connection (and on the
 * first seconds after reconnect, so the state change is never missed).
 */
export const ConnectionBanner = () => {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    const goOffline = () => { setOnline(false); setJustReconnected(false); };
    const goOnline = () => { setOnline(true); setJustReconnected(true); };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  if (online && !justReconnected) return null;

  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-50 px-4 py-2 text-center text-xs font-black ${online ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-amber-950'}`}
    >
      {online
        ? 'Back online — your next actions will go through.'
        : <><WifiOff className="mr-1.5 inline h-3.5 w-3.5" />You are offline. Pages still show what was loaded; nothing can be submitted until the connection returns.</>}
    </div>
  );
};

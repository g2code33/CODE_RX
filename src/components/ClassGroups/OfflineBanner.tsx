import { useCallback, useEffect, useState } from 'react';
import { CloudOff, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { flushOfflineActions } from '../../lib/cgm';
import { listQueuedActions, onOutboxChange, type QueuedAction } from '../../lib/cgmOutbox';

/**
 * The connection banner, told honestly.
 *
 * Three states, and the student is never lied to in any of them:
 *   • online, nothing waiting   → silent
 *   • offline, nothing waiting  → you are offline; what you can read is here
 *   • anything waiting          → exactly what is waiting, and that it will
 *                                 send itself (with a "Send now" press too)
 *
 * Flushing happens on reconnect, on a press, and on the next load — so a
 * student who walks back into signal does not have to remember anything.
 */
export const OfflineBanner = () => {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
  const [queue, setQueue] = useState<QueuedAction[]>(() => listQueuedActions());
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<string | null>(null);

  const refresh = useCallback(() => setQueue(listQueuedActions()), []);

  const flush = useCallback(async (announce = false) => {
    if (!listQueuedActions().length) return;
    setBusy(true);
    try {
      const result = await flushOfflineActions();
      refresh();
      if (announce || result.sent || result.refused.length) {
        const parts: string[] = [];
        if (result.sent) parts.push(`${result.sent} saved action${result.sent === 1 ? '' : 's'} sent`);
        if (result.refused.length) parts.push(`${result.refused.length} could not be applied (${result.refused[0].reason})`);
        if (result.remaining) parts.push(`${result.remaining} still waiting`);
        setReport(parts.join(' · ') || 'Nothing was waiting.');
        window.setTimeout(() => setReport(null), 8000);
      }
    } finally { setBusy(false); }
  }, [refresh]);

  useEffect(() => {
    const goOnline = () => { setOnline(true); void flush(true); };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    const off = onOutboxChange(refresh);
    // A load is also a chance to deliver whatever the last visit left behind.
    if (navigator.onLine) void flush();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      off();
    };
  }, [flush, refresh]);

  const waiting = queue.length;
  if (online && !waiting && !report) return null;

  return (
    <div
      role="status"
      data-testid="cgm-offline-banner"
      className={`fixed inset-x-0 top-0 z-50 px-4 py-2 text-xs font-bold ${
        !online ? 'bg-amber-500 text-amber-950' : waiting ? 'bg-sky-600 text-white' : 'bg-emerald-600 text-white'
      }`}
    >
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {!online ? (
          <>
            <span className="flex items-center gap-1.5">
              <CloudOff className="h-3.5 w-3.5" />
              You are offline. Pages you opened stay readable
              {waiting ? `, and ${waiting} change${waiting === 1 ? '' : 's'} you made ${waiting === 1 ? 'is' : 'are'} saved on this device — ${waiting === 1 ? 'it' : 'they'} will send itself when the connection returns.` : ' — anything you try to save will be kept on this device.'}
            </span>
          </>
        ) : waiting ? (
          <>
            <span className="flex items-center gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
              {waiting} change{waiting === 1 ? '' : 's'} waiting to send: {queue.map((entry) => entry.label).join(' · ')}
            </span>
            <button
              type="button"
              data-testid="cgm-offline-send-now"
              disabled={busy}
              onClick={() => void flush(true)}
              className="rounded-md bg-white/20 px-2 py-0.5 font-black underline-offset-2 hover:bg-white/30"
            >
              Send now
            </button>
          </>
        ) : report ? (
          <span className="flex items-center gap-1.5">
            {/could not/.test(report) ? <AlertTriangle className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {report}
          </span>
        ) : null}
      </div>
    </div>
  );
};

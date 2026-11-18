// Class & Group Management — the offline outbox.
//
// The honest offline story until now was "you are offline, nothing can be
// submitted". That is true for a dead server and untrue for the case students
// actually hit: a lab with one bar of signal, where a tap silently fails.
//
// So an action that is safe to repeat gets held here instead of lost:
//
//   • it is written to this device BEFORE the request is attempted, so a tab
//     that dies mid-send still keeps the work;
//   • it carries a client action id, so the same action is never queued twice;
//   • it is replayed, in order, when the connection returns (or on the next
//     load), and the student is told what happened to each one;
//   • a refusal on replay (409/400 — "already done", "not allowed any more") is
//     reported and dropped rather than retried forever.
//
// Nothing that needs a fresh answer to continue (sign-in, voting, passkey)
// belongs here — only writes whose outcome the student can read afterwards.

const OUTBOX_KEY = 'codeRx_cgmOutbox';
const MAX_ITEMS = 25;
const EVENT = 'cgm-outbox-changed';

export interface QueuedAction {
  id: string;
  endpoint: string;
  method: string;
  body: unknown;
  /** What the student did, in their own words — shown while it waits. */
  label: string;
  queuedAt: string;
  attempts: number;
  /** Why it is still waiting (last failure), shown honestly. */
  lastError?: string | null;
}

const safeParse = (raw: string | null): QueuedAction[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is QueuedAction =>
      Boolean(entry && typeof entry.endpoint === 'string' && typeof entry.id === 'string'));
  } catch { return []; }
};

const read = (): QueuedAction[] => {
  try { return safeParse(localStorage.getItem(OUTBOX_KEY)); } catch { return []; }
};

const write = (items: QueuedAction[]) => {
  try {
    if (items.length) localStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(0, MAX_ITEMS)));
    else localStorage.removeItem(OUTBOX_KEY);
  } catch { /* private mode: the outbox simply does not survive */ }
  try { window.dispatchEvent(new CustomEvent(EVENT)); } catch { /* no window */ }
};

export const listQueuedActions = (): QueuedAction[] => read();

export const queuedCount = (): number => read().length;

const newId = (): string => {
  const random = Math.random().toString(36).slice(2, 10);
  return `act_${Date.now().toString(36)}_${random}`;
};

/**
 * Hold an action for later. A repeat of the same action (same endpoint +
 * same meaningful payload) replaces the queued copy instead of stacking.
 */
export const queueAction = (action: { endpoint: string; method: string; body: unknown; label: string; id?: string }): QueuedAction => {
  const items = read();
  const fingerprint = `${action.method} ${action.endpoint} ${JSON.stringify(action.body ?? null)}`;
  const duplicate = items.find((entry) => `${entry.method} ${entry.endpoint} ${JSON.stringify(entry.body ?? null)}` === fingerprint);
  if (duplicate) return duplicate;
  const queued: QueuedAction = {
    id: action.id || newId(),
    endpoint: action.endpoint,
    method: action.method,
    body: action.body ?? null,
    label: action.label,
    queuedAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };
  write([...items, queued]);
  return queued;
};

export const dropQueuedAction = (id: string) => write(read().filter((entry) => entry.id !== id));

export const clearOutbox = () => write([]);

export const onOutboxChange = (handler: () => void): (() => void) => {
  if (typeof window === 'undefined') return () => undefined;
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
};

export interface FlushResult {
  sent: number;
  refused: Array<{ label: string; reason: string }>;
  remaining: number;
}

/**
 * Replay the outbox in order. `send` performs one action and must throw on
 * failure. A 4xx is treated as final (the world moved on); a network failure
 * leaves the item queued and stops the run, because order matters.
 */
export const flushOutbox = async (
  send: (action: QueuedAction) => Promise<unknown>,
): Promise<FlushResult> => {
  const items = read();
  if (!items.length) return { sent: 0, refused: [], remaining: 0 };
  let sent = 0;
  const refused: Array<{ label: string; reason: string }> = [];
  const stillQueued: QueuedAction[] = [];
  let networkDown = false;

  for (const [index, item] of items.entries()) {
    if (networkDown) { stillQueued.push(item); continue; }
    try {
      await send(item);
      sent += 1;
    } catch (failure: any) {
      const status = Number(failure?.status || 0);
      const offline = status === 0 || failure?.code === 'offline' || failure?.code === 'timeout';
      if (offline) {
        // Try again next time; keep this one and everything after it, in order.
        networkDown = true;
        stillQueued.push({ ...item, attempts: item.attempts + 1, lastError: failure?.message || 'No connection' });
        void index;
      } else if (status >= 400 && status < 500) {
        // Final: it was already applied, or it is no longer allowed.
        refused.push({ label: item.label, reason: failure?.message || 'It was no longer possible.' });
      } else {
        stillQueued.push({ ...item, attempts: item.attempts + 1, lastError: failure?.message || 'The server refused it.' });
      }
    }
  }

  write(stillQueued);
  return { sent, refused, remaining: stillQueued.length };
};

import { Loader2, Send, ShieldCheck } from 'lucide-react';

/**
 * The review section a client sees on every document sent to them.
 *
 * Four answers — approve, decline, pending, or the client's own words — and
 * nothing else. The section is presentational: the room owns the state and the
 * transport, so the same control cannot drift between the room and a preview.
 *
 * What it deliberately does NOT do: change access. A review is feedback to
 * PHANTOM. It never publishes, unpublishes, downloads or archives anything, and
 * it never says that it does.
 */
export interface ClientReviewChoice {
  decision: string;
  label: string;
  freeText?: boolean;
}

export interface ClientReviewState {
  choices?: ClientReviewChoice[];
  maxChars?: number;
  current?: { decision: string; label: string; comment?: string; at?: string | null } | null;
}

export const ClientReviewSection = ({
  review,
  choice,
  comment,
  busy,
  notice,
  onChoose,
  onComment,
  onSend,
  onClear,
}: {
  review: ClientReviewState;
  choice: string;
  comment: string;
  busy: boolean;
  notice: string | null;
  onChoose: (decision: string) => void;
  onComment: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
}) => (
  <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-black uppercase tracking-[0.14em] text-emerald-800">Review this document</h3>
        <p className="mt-1 max-w-2xl text-xs font-medium leading-5 text-slate-600">
          Tell PHANTOM what you think of this document. Your answer goes to PHANTOM straight away, and you can change it at any time.
        </p>
      </div>
      {review.current ? (
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800 ring-1 ring-emerald-100">
          You answered: {review.current.label}
        </span>
      ) : null}
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {(review.choices || []).map((item) => (
        <button
          key={item.decision}
          type="button"
          onClick={() => onChoose(item.decision)}
          aria-pressed={choice === item.decision}
          className={`rounded-xl border px-3 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] transition ${
            choice === item.decision
              ? 'border-emerald-400 bg-emerald-50 text-emerald-900'
              : 'border-slate-200 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50/50'
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
    {choice ? (
      <div className="mt-4">
        <label className="block">
          <span className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500">
            {choice === 'custom' ? 'Your own answer (required)' : 'Add a note for PHANTOM (optional)'}
          </span>
          <textarea
            value={comment}
            onChange={(event) => onComment(event.target.value)}
            rows={3}
            maxLength={Number(review.maxChars || 2000)}
            aria-label="Your feedback to PHANTOM"
            className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm leading-6 text-slate-800 outline-none focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={onSend}
            disabled={busy || !choice || (choice === 'custom' && !comment.trim())}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.14em] text-white transition hover:bg-emerald-700 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />} Send to PHANTOM
          </button>
          <button
            type="button"
            onClick={onClear}
            className="text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-800"
          >
            Clear
          </button>
        </div>
      </div>
    ) : (
      <p className="mt-4 text-xs font-semibold text-slate-500">Choose one of the four answers above.</p>
    )}
    {review.current && review.current.comment ? (
      <p className="mt-4 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-600">
        Your note: {review.current.comment}
      </p>
    ) : null}
    {notice ? (
      <p role="status" className="mt-3 rounded-xl bg-emerald-50 px-3.5 py-2.5 text-xs font-bold text-emerald-800 ring-1 ring-emerald-100">{notice}</p>
    ) : null}
    <p className="mt-3 flex items-start gap-1.5 text-[11px] font-semibold text-slate-500">
      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      Your answer is feedback for PHANTOM. It does not change what you can open here.
    </p>
  </section>
);

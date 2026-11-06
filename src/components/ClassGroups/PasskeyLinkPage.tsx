import { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, KeyRound, ShieldCheck, WifiOff } from 'lucide-react';
import { cgmStudent } from '../../lib/cgm';
import { ConnectionBanner } from './ConnectionBanner';
import { useCgmNoZoom } from './noZoom';

/**
 * CODE Rx — ONE-TIME PASSKEY LINK (student side).
 *
 * A link the organizer created for ONE member. It needs no sign-in and no
 * approval: the organizer already granted it. The student opens it, sees their
 * own name and class (so they can be sure the link is theirs), presses one
 * button, and the system generates their new passkey — shown once, on this
 * page, exactly like registration.
 *
 * The link is single-use: the server's conditional UPDATE decides who wins, so
 * a forwarded link, a double tap or a second device cannot mint a second
 * passkey. Once used, the page says so plainly and points at the sign-in form.
 *
 * Designed for a phone first: one column, full-width tap targets, nothing that
 * needs a horizontal scroll.
 */

const card = 'rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm shadow-emerald-950/5';
const label = 'text-[10px] font-black uppercase tracking-[0.16em] text-slate-400';

const copyToClipboard = async (text: string): Promise<boolean> => {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', 'true');
      document.body.appendChild(area);
      area.select();
      const copied = document.execCommand('copy');
      area.remove();
      return copied;
    } catch { return false; }
  }
};

export const PasskeyLinkPage = ({ code, onExit }: { code: string; onExit: () => void }) => {
  useCgmNoZoom();
  const [info, setInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [issued, setIssued] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    cgmStudent.passkeyLinkInfo(code)
      .then((data: any) => { if (!alive) return; setInfo(data); })
      .catch((failure: any) => { if (alive) setError(failure?.message || 'This passkey link could not be opened.'); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [code]);

  const generate = async () => {
    setBusy(true); setError(null); setBlocked(null);
    try {
      const result: any = await cgmStudent.redeemPasskeyLink(code);
      setIssued(String(result?.passkey || ''));
      setInfo((current: any) => (current ? { ...current, state: 'used' } : current));
    } catch (failure: any) {
      const reason = String(failure?.code || '');
      if (reason === 'link_used' || reason === 'link_revoked') {
        setBlocked(failure?.message || 'This link can no longer be used.');
        setInfo((current: any) => (current ? { ...current, state: reason === 'link_revoked' ? 'revoked' : 'used' } : current));
      } else setError(failure?.message || 'The passkey could not be generated.');
    } finally { setBusy(false); }
  };

  const state = String(info?.state || '');
  const student = info?.student || {};
  const goSignIn = () => { window.location.hash = '#class-groups/student'; };

  return (
    <div className="cgm-shell">
      <ConnectionBanner />
      <header className="cgm-topbar">
        <div className="flex items-center gap-3">
          <img src="/CGP.jpg" alt="Classes & Groups" className="h-9 w-9 rounded-xl object-cover object-[50%_38%] shadow-sm ring-1 ring-emerald-900/20" loading="lazy" decoding="async" />
          <div>
            <p className="text-sm font-black text-slate-900">CODE Rx — one-time passkey link</p>
            <p className="text-[11px] font-semibold text-slate-400">{student.fullName ? `${student.fullName} · ${student.indexNumber || ''}` : 'Student passkey recovery'}</p>
          </div>
        </div>
        <button type="button" className="mini-button" onClick={onExit} data-testid="cgm-passkey-link-exit">
          <ArrowLeft className="mr-1 inline h-3.5 w-3.5" /> Back
        </button>
      </header>

      <main className="cgm-main" data-testid="cgm-passkey-link-page">
        {loading && <div className={card}><p className="text-sm font-semibold text-slate-400">Opening your link…</p></div>}

        {!loading && error && !info && (
          <div className={`${card} border-red-200`}>
            <p className="flex items-center gap-2 text-sm font-black text-red-600"><WifiOff className="h-4 w-4" /> This link cannot be used</p>
            <p className="mt-1 text-xs font-medium text-slate-500">{error}</p>
            <p className="mt-2 text-[11px] font-semibold text-slate-400">Ask your organizer for a fresh one — links work once and expire.</p>
            <button type="button" className="cgm-primary-button mt-3 w-full" onClick={goSignIn}>Go to the sign-in page</button>
          </div>
        )}

        {!loading && info && (
          <div className="space-y-4">
            {issued ? (
              <div className="rounded-2xl border-2 border-amber-300 bg-amber-50/70 p-4" data-testid="cgm-passkey-link-issued">
                <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-amber-800">
                  <CheckCircle2 className="h-4 w-4" /> Your new passkey — shown only now
                </p>
                <p className="mt-2 select-all rounded-xl border-2 border-amber-400 bg-white px-3 py-4 text-center font-mono text-2xl font-black tracking-[0.14em] text-amber-900" data-testid="cgm-passkey-link-passkey">{issued}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button type="button" className="mini-button" onClick={async () => setCopied(await copyToClipboard(issued))}>{copied ? 'Copied ✓' : 'Copy passkey'}</button>
                </div>
                <p className="mt-2 text-[11px] font-semibold text-amber-900">
                  Write it down now. Your old passkey no longer works, every device that was signed in has been signed out, and this link can never be used again.
                </p>
                <button type="button" className="cgm-primary-button mt-3 w-full !rounded-xl !py-3" onClick={goSignIn} data-testid="cgm-passkey-link-signin">
                  I have saved it — sign in
                </button>
              </div>
            ) : (
              <>
                <div className="cgm-ballot-hero">
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-100">One-time passkey link</p>
                  <h1 className="mt-1 text-xl font-black leading-tight">{student.fullName || 'Your passkey'}</h1>
                  <p className="mt-1 text-[11px] font-semibold text-emerald-50">
                    {[student.indexNumber, info.className].filter(Boolean).join(' · ')}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white ring-1 ring-white/25">
                      {state === 'live' ? 'ready to use once' : state}
                    </span>
                    <span className="rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-white ring-1 ring-white/25">
                      current {student.passkeyHint || 'passkey'}
                    </span>
                  </div>
                </div>

                {state === 'live' && (
                  <div className={card}>
                    <p className={label}>Make sure this is really you</p>
                    <p className="mt-2 flex items-center gap-2 text-sm font-black text-slate-800"><ShieldCheck className="h-4 w-4 text-emerald-600" /> {student.fullName}</p>
                    <p className="mt-1 text-[11px] font-medium text-slate-500">
                      {student.indexNumber ? `Index number ${student.indexNumber}` : 'Your account'}
                      {info.createdBy ? ` — ${info.createdBy} created this link for you.` : ''}
                      {' '}It works once, then it is finished.
                    </p>
                    <button
                      type="button"
                      disabled={busy}
                      data-testid="cgm-passkey-link-generate"
                      onClick={() => void generate()}
                      className="cgm-primary-button mt-4 w-full !rounded-xl !py-3"
                    >
                      <KeyRound className="mr-1.5 inline h-4 w-4" /> {busy ? 'Generating…' : 'Generate my new passkey'}
                    </button>
                    <p className="mt-2 text-[11px] font-medium text-slate-400">The system creates the passkey — you never invent one, so it cannot clash with anybody else’s.</p>
                    {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-700" data-testid="cgm-passkey-link-error">{error}</p>}
                  </div>
                )}

                {state !== 'live' && (
                  <div className={`${card} ${state === 'used' ? 'border-slate-200' : 'border-amber-200'}`}>
                    <p className="text-sm font-black text-slate-800">
                      {state === 'used' ? 'This link was already used' : state === 'revoked' ? 'Your organizer revoked this link' : 'This link has expired'}
                    </p>
                    <p className="mt-1 text-xs font-medium text-slate-500">
                      {blocked || 'Each link can issue exactly one passkey, so it cannot be used again.'} Ask your organizer for a new one — they can create it in seconds.
                    </p>
                    <button type="button" className="cgm-primary-button mt-3 w-full" onClick={goSignIn}>Go to the sign-in page</button>
                  </div>
                )}

                <div className={card}>
                  <p className={label}>How this works</p>
                  <ul className="mt-2 space-y-1.5 text-[11px] font-medium text-slate-500">
                    <li>• Your organizer created this link for you alone — no approval step, no queue.</li>
                    <li>• One use only: the moment it works, it is finished.</li>
                    <li>• It expires {info.expiresAt ? `on ${new Date(String(info.expiresAt).replace(' ', 'T') + 'Z').toLocaleString()}` : 'automatically'}.</li>
                    <li>• Your passkey is shown once. Save it before you leave the page.</li>
                  </ul>
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </div>
  );
};

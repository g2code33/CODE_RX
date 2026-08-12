import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Copy, Link2, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { db } from '../lib/cloudflare';

interface VaultShareDialogProps {
  document: { id: number; title: string; document_code?: string | null };
  onClose: () => void;
}

type ExpiryChoice = 'never' | '1' | '7' | '30' | '90';
type CopyKey = 'new-link' | number;

const EXPIRY_OPTIONS: Array<{ value: ExpiryChoice; label: string; detail: string }> = [
  { value: 'never', label: 'No expiry', detail: 'Stays active until you revoke it' },
  { value: '1', label: '1 day', detail: 'Available for 24 hours' },
  { value: '7', label: '7 days', detail: 'Available for one week' },
  { value: '30', label: '30 days', detail: 'Available for one month' },
  { value: '90', label: '90 days', detail: 'Available for three months' },
];

const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '';

const expiryLabel = (value?: string | null) => {
  if (!value) return 'No expiry';
  const time = new Date(value).getTime();
  const readable = dateLabel(value);
  return Number.isFinite(time) && time <= Date.now() ? `Expired ${readable}` : `Expires ${readable}`;
};

const downloadLabel = (share: any) => {
  if (!share.allow_download) return 'View only';
  if (share.downloadStatus === 'global_paused') return 'Download and print are paused';
  if (share.downloadStatus === 'creator_permission_disabled') return 'Download and print need approval';
  if (share.downloadStatus === 'available') return 'Download and print allowed';
  return 'Download and print requested';
};

const friendlyShareError = (error: any, fallback: string) => {
  const message = String(error?.message || '').trim();
  if (!message) return fallback;
  if (/database|d1|schema|internal server|unexpected response|token recovery/i.test(message)) {
    return `${fallback} Please try again in a moment.`;
  }
  return message;
};

export const VaultShareDialog = ({ document, onClose }: VaultShareDialogProps) => {
  const [data, setData] = useState<any>({ capability: null, shares: [] });
  const [allowDownload, setAllowDownload] = useState(false);
  const [expiryChoice, setExpiryChoice] = useState<ExpiryChoice>('never');
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [enablingDownloads, setEnablingDownloads] = useState(false);
  const [busyShareId, setBusyShareId] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<CopyKey | null>(null);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);
  const copyTimer = useRef<number | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await db.vault.shares(document.id));
    } catch (error: any) {
      setMessage({ type: 'error', text: friendlyShareError(error, 'We could not load your share links.') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    return () => {
      if (copyTimer.current) window.clearTimeout(copyTimer.current);
    };
  }, [document.id]);

  const copyText = async (value: string) => {
    if (!value) return false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
        return true;
      }
      const field = window.document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.opacity = '0';
      window.document.body.appendChild(field);
      field.select();
      const copied = window.document.execCommand('copy');
      field.remove();
      return copied;
    } catch {
      return false;
    }
  };

  const markCopied = (key: CopyKey) => {
    setCopiedKey(key);
    if (copyTimer.current) window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopiedKey((current) => current === key ? null : current), 2200);
  };

  const copy = async (url: string, key: CopyKey) => {
    if (!url) return;
    if (await copyText(url)) {
      markCopied(key);
      setMessage({ type: 'success', text: 'Link copied to your clipboard.' });
    } else {
      setMessage({ type: 'error', text: 'Your browser could not copy this link. Select the link above and copy it manually.' });
    }
  };

  const create = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const expiresInDays = expiryChoice === 'never' ? null : Number(expiryChoice);
      const result = await db.vault.createShare(document.id, { allowDownload, expiresInDays });
      setShareUrl(result.data.shareUrl);
      const expiryText = result.data.expiresAt ? `It expires ${dateLabel(result.data.expiresAt)}.` : 'It has no expiry and stays active until you revoke it.';
      const downloadText = allowDownload ? ' Download and Print are enabled for this link.' : '';
      setMessage({ type: 'success', text: `Your read-only link is ready. ${expiryText}${downloadText}` });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: friendlyShareError(error, 'We could not create this share link.') });
    } finally {
      setCreating(false);
    }
  };

  const nativeShare = async () => {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: document.title, text: 'Code Rx Vault document', url: shareUrl });
    } catch { /* A cancelled native share is not an error. */ }
  };

  const enableGlobalDownloads = async () => {
    setEnablingDownloads(true);
    setMessage({ type: 'success', text: 'Turning on download and print…' });
    try {
      await db.phantom.setGlobalDownloads(true);
      await load();
      setMessage({ type: 'success', text: 'Download and Print are now available on every link that allows them.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: friendlyShareError(error, 'We could not turn on download and print.') });
    } finally {
      setEnablingDownloads(false);
    }
  };

  const replaceLegacyLink = async (share: any) => {
    const confirmed = window.confirm('This link needs a fresh copy. Create one now? Anyone using the current link will need the new link instead.');
    if (!confirmed) return;
    setBusyShareId(share.id);
    setMessage(null);
    try {
      const result = await db.vault.replaceShare(document.id, share.id);
      const replacementUrl = result.data.shareUrl;
      setShareUrl(replacementUrl);
      const copied = await copyText(replacementUrl);
      if (copied) markCopied(share.id);
      setMessage({
        type: 'success',
        text: copied
          ? 'Your fresh link has been copied. Share the new link from now on.'
          : 'Your fresh link is ready above. Share that new link from now on.',
      });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: friendlyShareError(error, 'We could not create a fresh copy of this link.') });
    } finally {
      setBusyShareId(null);
    }
  };

  const revoke = async (shareId: number) => {
    setBusyShareId(shareId);
    try {
      await db.vault.revokeShare(document.id, shareId);
      setMessage({ type: 'success', text: 'This share link has been revoked.' });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: friendlyShareError(error, 'We could not revoke this share link.') });
    } finally {
      setBusyShareId(null);
    }
  };

  const capability = data.capability;
  const downloadsPaused = !loading && capability?.downloadsGloballyEnabled === false;
  const accountDownloadsPaused = !loading && capability?.downloadsGloballyEnabled === true && capability?.canDownload === false;
  const selectedExpiry = EXPIRY_OPTIONS.find((option) => option.value === expiryChoice) || EXPIRY_OPTIONS[0];

  const copyButton = (url: string, key: CopyKey, compact = false) => {
    const copied = copiedKey === key;
    const sizeClass = compact ? 'px-3 py-2' : 'px-4 py-2.5';
    return <button onClick={() => void copy(url, key)} className={`inline-flex items-center justify-center gap-2 rounded-xl border ${sizeClass} text-xs font-black transition-all focus:outline-none focus:ring-2 focus:ring-emerald-300 ${copied ? 'border-emerald-600 bg-emerald-600 text-white shadow-sm shadow-emerald-200' : 'border-emerald-200 bg-white text-emerald-700 hover:border-emerald-400 hover:bg-emerald-50'}`}>
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? 'Copied' : 'Copy link'}
    </button>;
  };

  return <div className="fixed inset-0 z-[170] flex items-center justify-center bg-emerald-950/15 p-4 backdrop-blur-sm" onClick={onClose}>
    <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Secure document sharing</p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">Share read-only access</h2>
          <p className="mt-2 text-sm text-slate-500">{document.document_code ? `${document.document_code} · ` : ''}{document.title}</p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700" aria-label="Close sharing"><X className="h-5 w-5" /></button>
      </div>

      {message && <div role={message.type === 'error' ? 'alert' : 'status'} className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-700'}`}>
        {message.type === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{message.text}</span>
      </div>}

      {downloadsPaused && <aside className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-black">Turn on Download and Print</p>
        <p className="mt-1 leading-6 text-amber-800">Your shared links are safe and view-only right now. Turn this on when you want links marked “Allow download and print” to show those controls to visitors.</p>
        {capability?.canManageGlobalDownloads
          ? <button disabled={enablingDownloads} onClick={() => void enableGlobalDownloads()} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-white transition hover:bg-amber-600 disabled:opacity-60">{enablingDownloads ? 'Turning on…' : 'Turn on download & print'}</button>
          : <p className="mt-2 text-xs font-bold text-amber-800">PHANTOM needs to turn on Download and Print for your account.</p>}
      </aside>}

      {accountDownloadsPaused && <aside className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-black">Download permission is needed</p>
        <p className="mt-1 leading-6 text-sky-800">You can still share a read-only link. Ask PHANTOM to enable Download and Print for your account before creating a downloadable link.</p>
      </aside>}

      <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={`flex items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950 ${accountDownloadsPaused ? 'cursor-not-allowed opacity-65' : 'cursor-pointer'}`}>
            <input type="checkbox" checked={allowDownload} disabled={accountDownloadsPaused} onChange={(event) => setAllowDownload(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" />
            <span><strong className="block">Allow download and print</strong><small className="mt-1 block text-xs leading-5 text-slate-500">Visitors can save a printable copy or print this shared document.</small></span>
          </label>
          <label className="rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950">
            <span className="flex items-center gap-2 font-bold"><CalendarDays className="h-4 w-4 text-emerald-600" />Link access period</span>
            <select value={expiryChoice} onChange={(event) => setExpiryChoice(event.target.value as ExpiryChoice)} className="mt-2 w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 outline-none focus:border-emerald-500">
              {EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <small className="mt-1.5 block text-xs leading-5 text-slate-500">{selectedExpiry.detail}</small>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-lg text-xs leading-5 text-emerald-800">Choose No expiry for continuing access, or set a time limit. You can revoke a link whenever access should end. Shared pages include document text only.</p>
          <button disabled={creating || loading} onClick={() => void create()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-700 disabled:opacity-60">
            <Link2 className="h-4 w-4" />{creating ? 'Creating…' : 'Create link'}
          </button>
        </div>
      </div>

      {shareUrl && <article className="mt-5 overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-sm shadow-emerald-950/5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50 px-4 py-3">
          <div><p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">New secure link</p><p className="mt-1 text-xs text-emerald-900">Ready to share whenever you are.</p></div>
          {copyButton(shareUrl, 'new-link')}
        </div>
        <textarea readOnly value={shareUrl} aria-label="New secure share link" className="h-20 w-full resize-none bg-white p-4 text-xs leading-5 text-slate-700 outline-none" />
        {'share' in navigator && <div className="border-t border-slate-100 px-4 py-3"><button onClick={() => void nativeShare()} className="inline-flex items-center gap-2 text-xs font-black text-emerald-700 transition hover:text-emerald-900"><Send className="h-4 w-4" />Share from this device</button></div>}
      </article>}

      <div className="mt-7">
        <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">Existing links</h3><span className="text-xs font-bold text-slate-400">{data.shares?.length || 0} total</span></div>
        {loading ? <div className="grid min-h-28 place-items-center text-xs font-bold text-emerald-700">Loading share links…</div> : <div className="mt-3 space-y-2">
          {(data.shares || []).map((share: any) => <article key={share.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm shadow-slate-950/[0.02]">
            <div className="min-w-0"><p className="text-sm font-bold text-slate-800">{share.status === 'active' ? 'Active read-only link' : 'Revoked link'}</p><p className="mt-1 text-xs leading-5 text-slate-500">{expiryLabel(share.expires_at)} · {downloadLabel(share)}{share.last_accessed_at ? ` · Last opened ${dateLabel(share.last_accessed_at)}` : ''}</p></div>
            {share.status === 'active' && <div className="flex flex-wrap items-center gap-2">
              {share.copyAvailable && share.shareUrl && copyButton(share.shareUrl, share.id, true)}
              {share.replacementRequired && <button disabled={busyShareId === share.id} onClick={() => void replaceLegacyLink(share)} title="Create a fresh copy of this link" className="inline-flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 transition hover:bg-amber-100 disabled:opacity-60"><Copy className="h-3.5 w-3.5" />{busyShareId === share.id ? 'Preparing…' : 'Copy link'}</button>}
              <button disabled={busyShareId === share.id} onClick={() => void revoke(share.id)} className="inline-flex items-center gap-1.5 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600 transition hover:bg-red-100 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />{busyShareId === share.id ? 'Working…' : 'Revoke'}</button>
            </div>}
          </article>)}
          {!data.shares?.length && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No share links have been created for this document.</p>}
        </div>}
      </div>
    </section>
  </div>;
};

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Send, ShieldCheck, Trash2, X } from 'lucide-react';
import { db } from '../lib/cloudflare';

interface VaultShareDialogProps {
  document: { id: number; title: string; document_code?: string | null };
  onClose: () => void;
}

const dateLabel = (value?: string | null) => value
  ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  : 'No expiry';

export const VaultShareDialog = ({ document, onClose }: VaultShareDialogProps) => {
  const [data, setData] = useState<any>({ capability: null, shares: [] });
  const [allowDownload, setAllowDownload] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      setData(await db.vault.shares(document.id));
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not load share links.' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [document.id]);

  const create = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const result = await db.vault.createShare(document.id, allowDownload);
      setShareUrl(result.data.shareUrl);
      setMessage({ type: 'success', text: 'Read-only share link created. It remains active until you revoke it.' });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not create this share link.' });
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setMessage({ type: 'success', text: 'Share link copied.' });
    } catch {
      setMessage({ type: 'error', text: 'Copy was blocked by this browser. Select and copy the link manually.' });
    }
  };

  const nativeShare = async () => {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: document.title, text: 'Code Rx Vault document', url: shareUrl });
    } catch { /* The user can cancel a native share without an error message. */ }
  };

  const revoke = async (shareId: number) => {
    try {
      await db.vault.revokeShare(document.id, shareId);
      setMessage({ type: 'success', text: 'Share link revoked immediately.' });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not revoke this share link.' });
    }
  };

  return <div className="fixed inset-0 z-[170] flex items-center justify-center bg-emerald-950/15 p-4 backdrop-blur-sm" onClick={onClose}>
    <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl sm:p-8" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">Secure document sharing</p>
          <h2 className="mt-1 text-2xl font-black text-slate-900">Share read-only access</h2>
          <p className="mt-2 text-sm text-slate-500">{document.document_code ? `${document.document_code} · ` : ''}{document.title}</p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close sharing"><X className="h-5 w-5" /></button>
      </div>

      {message && <div className={`mt-5 flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-medium ${message.type === 'success' ? 'border-emerald-100 bg-emerald-50 text-emerald-800' : 'border-red-100 bg-red-50 text-red-700'}`}>
        {message.type === 'success' ? <Check className="mt-0.5 h-4 w-4 shrink-0" /> : <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />}
        <span>{message.text}</span>
      </div>}

      <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950"><input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" /><span><strong className="block">Allow download and print</strong><small className="mt-1 block text-xs leading-5 text-slate-500">When enabled, people with this link can download a light printable copy or use the shared page print control.</small></span></label>
          <button disabled={creating || loading} onClick={() => void create()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-wider text-white hover:bg-emerald-700 disabled:opacity-60">
            <Link2 className="h-4 w-4" />{creating ? 'Creating link…' : 'Create link'}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-emerald-800">Share links do not expire. Revoke a link whenever access should end. Shared pages contain document text only; protected attachments, member records, and sensitive/restricted documents are never exposed.</p>
      </div>

      {shareUrl && <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">New secure link</p>
        <textarea readOnly value={shareUrl} className="mt-2 h-20 w-full resize-none rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-700 outline-none" />
        <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => void copy()} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:border-emerald-300 hover:text-emerald-700"><Copy className="h-4 w-4" />Copy link</button>
          {'share' in navigator && <button onClick={() => void nativeShare()} className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50"><Send className="h-4 w-4" />Share</button>}
        </div>
      </div>}

      <div className="mt-7">
        <div className="flex items-center justify-between"><h3 className="font-black text-slate-900">Existing links</h3><span className="text-xs font-bold text-slate-400">{data.shares?.length || 0} total</span></div>
        {loading ? <div className="grid min-h-28 place-items-center text-xs font-bold text-emerald-700">Loading share links…</div> : <div className="mt-3 space-y-2">
          {(data.shares || []).map((share: any) => <article key={share.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-100 px-4 py-3">
            <div><p className="text-sm font-bold text-slate-800">{share.status === 'active' ? 'Active read-only link' : 'Revoked link'}</p><p className="mt-1 text-xs text-slate-500">{share.expires_at ? `Legacy expiry: ${dateLabel(share.expires_at)}` : 'No expiry'} · {share.allow_download ? 'Download and print allowed' : 'View only'}{share.last_accessed_at ? ` · Last opened ${dateLabel(share.last_accessed_at)}` : ''}</p></div>
            {share.status === 'active' && <button onClick={() => void revoke(share.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100"><Trash2 className="h-3.5 w-3.5" />Revoke</button>}
          </article>)}
          {!data.shares?.length && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No share links have been created for this document.</p>}
        </div>}
      </div>
    </section>
  </div>;
};

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

const downloadLabel = (share: any) => {
  if (!share.allow_download) return 'View only';
  if (share.downloadStatus === 'global_paused') return 'Download and print requested · Global downloads are paused';
  if (share.downloadStatus === 'creator_permission_disabled') return 'Download and print requested · Account download access is paused';
  if (share.downloadStatus === 'available') return 'Download and print allowed';
  return 'Download and print requested';
};

export const VaultShareDialog = ({ document, onClose }: VaultShareDialogProps) => {
  const [data, setData] = useState<any>({ capability: null, shares: [] });
  const [allowDownload, setAllowDownload] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [enablingDownloads, setEnablingDownloads] = useState(false);
  const [busyShareId, setBusyShareId] = useState<number | null>(null);
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

  const copy = async (url = shareUrl) => {
    if (!url) return;
    if (await copyText(url)) setMessage({ type: 'success', text: 'Share link copied.' });
    else setMessage({ type: 'error', text: 'Copy was blocked by this browser. Select and copy the link manually.' });
  };

  const create = async () => {
    setCreating(true);
    setMessage(null);
    try {
      const result = await db.vault.createShare(document.id, allowDownload);
      setShareUrl(result.data.shareUrl);
      setMessage({ type: 'success', text: allowDownload ? 'Read-only share link created. Download and print will appear whenever downloads are enabled.' : 'Read-only share link created. It remains active until you revoke it.' });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not create this share link.' });
    } finally {
      setCreating(false);
    }
  };

  const nativeShare = async () => {
    if (!shareUrl || !navigator.share) return;
    try {
      await navigator.share({ title: document.title, text: 'Code Rx Vault document', url: shareUrl });
    } catch { /* The user can cancel a native share without an error message. */ }
  };

  const enableGlobalDownloads = async () => {
    setEnablingDownloads(true);
    setMessage({ type: 'success', text: 'Enabling document downloads…' });
    try {
      await db.phantom.setGlobalDownloads(true);
      await load();
      setMessage({ type: 'success', text: 'Global downloads are enabled. Allowed shared links now show Download and Print.' });
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not enable global downloads.' });
    } finally {
      setEnablingDownloads(false);
    }
  };

  const replaceLegacyLink = async (share: any) => {
    const confirmed = window.confirm('This older link was created before secure recopy support, so its original URL cannot be recovered. Replace it with a new copyable link? The previous URL will stop working.');
    if (!confirmed) return;
    setBusyShareId(share.id);
    setMessage(null);
    try {
      const result = await db.vault.replaceShare(document.id, share.id);
      const replacementUrl = result.data.shareUrl;
      setShareUrl(replacementUrl);
      const copied = await copyText(replacementUrl);
      setMessage({
        type: 'success',
        text: copied
          ? 'Replacement link copied. The previous URL no longer works.'
          : 'Replacement link is ready above. The previous URL no longer works.',
      });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not replace this share link.' });
    } finally {
      setBusyShareId(null);
    }
  };

  const revoke = async (shareId: number) => {
    setBusyShareId(shareId);
    try {
      await db.vault.revokeShare(document.id, shareId);
      setMessage({ type: 'success', text: 'Share link revoked immediately.' });
      await load();
    } catch (error: any) {
      setMessage({ type: 'error', text: error?.message || 'Could not revoke this share link.' });
    } finally {
      setBusyShareId(null);
    }
  };

  const capability = data.capability;
  const downloadsPaused = !loading && capability?.downloadsGloballyEnabled === false;
  const accountDownloadsPaused = !loading && capability?.downloadsGloballyEnabled === true && capability?.canDownload === false;

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

      {downloadsPaused && <aside className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <p className="font-black">Download and Print are paused globally</p>
        <p className="mt-1 leading-6 text-amber-800">A link may remember its download permission, but its shared page stays view-only until PHANTOM enables the global download switch.</p>
        {capability?.canManageGlobalDownloads
          ? <button disabled={enablingDownloads} onClick={() => void enableGlobalDownloads()} className="mt-3 rounded-lg bg-amber-500 px-3 py-2 text-xs font-black uppercase tracking-wider text-white hover:bg-amber-600 disabled:opacity-60">{enablingDownloads ? 'Enabling…' : 'Enable downloads now'}</button>
          : <p className="mt-2 text-xs font-bold text-amber-800">Ask PHANTOM to enable Document Sharing → Global document-download switch.</p>}
      </aside>}

      {accountDownloadsPaused && <aside className="mt-5 rounded-2xl border border-sky-100 bg-sky-50 p-4 text-sm text-sky-950">
        <p className="font-black">This account cannot enable shared downloads</p>
        <p className="mt-1 leading-6 text-sky-800">Global downloads are on, but PHANTOM has not enabled this account’s Download button. Your link can remain configured while you ask PHANTOM to enable it.</p>
      </aside>}

      <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-emerald-950"><input type="checkbox" checked={allowDownload} onChange={(event) => setAllowDownload(event.target.checked)} className="mt-0.5 h-4 w-4 accent-emerald-600" /><span><strong className="block">Allow download and print</strong><small className="mt-1 block text-xs leading-5 text-slate-500">When enabled, people with this link can download a light printable copy or use the shared page print control.{downloadsPaused ? ' The permission is saved, but global downloads are currently paused.' : ''}</small></span></label>
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
            <div className="min-w-0"><p className="text-sm font-bold text-slate-800">{share.status === 'active' ? 'Active read-only link' : 'Revoked link'}</p><p className="mt-1 text-xs text-slate-500">{share.expires_at ? `Legacy expiry: ${dateLabel(share.expires_at)}` : 'No expiry'} · {downloadLabel(share)}{share.last_accessed_at ? ` · Last opened ${dateLabel(share.last_accessed_at)}` : ''}</p></div>
            {share.status === 'active' && <div className="flex flex-wrap items-center gap-2">
              {share.copyAvailable && share.shareUrl && <button onClick={() => void copy(share.shareUrl)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100"><Copy className="h-3.5 w-3.5" />Copy link</button>}
              {share.replacementRequired && <button disabled={busyShareId === share.id} onClick={() => void replaceLegacyLink(share)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-black text-amber-800 hover:bg-amber-100 disabled:opacity-60"><Copy className="h-3.5 w-3.5" />{busyShareId === share.id ? 'Restoring…' : 'Restore & copy'}</button>}
              <button disabled={busyShareId === share.id} onClick={() => void revoke(share.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-xs font-black text-red-600 hover:bg-red-100 disabled:opacity-60"><Trash2 className="h-3.5 w-3.5" />{busyShareId === share.id ? 'Working…' : 'Revoke'}</button>
            </div>}
          </article>)}
          {!data.shares?.length && <p className="rounded-xl border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-500">No share links have been created for this document.</p>}
        </div>}
      </div>
    </section>
  </div>;
};

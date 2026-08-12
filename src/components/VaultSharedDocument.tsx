import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ArrowLeft, Download, FileText, Link2, Printer, ShieldCheck } from 'lucide-react';
import { db } from '../lib/cloudflare';
import { parseDocumentContent, safeVaultResourceUrl, sanitizeVaultRichText, type VaultBlock } from '../data/vaultEditor';

const shareTokenFromHash = () => {
  const hash = window.location.hash.replace(/^#vault-share\??/, '');
  return new URLSearchParams(hash).get('token') || '';
};

const stripHtml = (value: string) => value.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
const dateLabel = (value?: string) => value ? new Date(value).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
const friendlyPublicError = (error: any) => {
  const message = String(error?.message || '').trim();
  return /database|d1|schema|internal server|unexpected response/i.test(message)
    ? 'This shared document cannot be opened right now. Please try again shortly.'
    : message || 'This shared document is unavailable.';
};

const SharedBlock = ({ block }: { block: VaultBlock }) => {
  const content = sanitizeVaultRichText(block.content || '');
  if (block.type === 'heading') {
    const Tag = block.level === 1 ? 'h1' : block.level === 3 ? 'h3' : 'h2';
    return <Tag className={block.level === 1 ? 'mt-10 text-3xl font-black tracking-tight text-slate-800 sm:text-4xl' : 'mt-8 text-xl font-black text-slate-800'} dangerouslySetInnerHTML={{ __html: content }} />;
  }
  if (block.type === 'paragraph') return <div className="mt-4 text-[15px] leading-8 text-slate-700" dangerouslySetInnerHTML={{ __html: content }} />;
  if (block.type === 'quote') return <blockquote className="mt-6 border-l-4 border-emerald-400 bg-emerald-50 px-5 py-4 text-[15px] leading-7 text-emerald-950" dangerouslySetInnerHTML={{ __html: content }} />;
  if (block.type === 'callout') return <aside className="mt-6 rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-[15px] leading-7 text-emerald-950" dangerouslySetInnerHTML={{ __html: content }} />;
  if (block.type === 'bulletList' || block.type === 'numberedList' || block.type === 'checklist') {
    const List = block.type === 'numberedList' ? 'ol' : 'ul';
    return <List className={`mt-5 space-y-2 pl-6 text-[15px] leading-7 text-slate-700 ${block.type === 'numberedList' ? 'list-decimal' : 'list-disc'}`}>
      {(block.items || []).map((item, index) => <li key={item.id || index} className={item.checked ? 'text-slate-400 line-through' : ''} dangerouslySetInnerHTML={{ __html: sanitizeVaultRichText(item.text) }} />)}
    </List>;
  }
  if (block.type === 'code') return <pre className="mt-6 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-5 text-sm leading-6 text-slate-800"><code>{block.content || ''}</code></pre>;
  if (block.type === 'table') return <div className="mt-6 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full border-collapse text-sm"><tbody>{(block.rows || []).map((row, rowIndex) => <tr key={rowIndex} className={rowIndex === 0 ? 'bg-slate-50 font-black text-slate-800' : 'text-slate-700'}>{row.map((cell, cellIndex) => <td key={cellIndex} className="border border-slate-200 p-3 align-top" dangerouslySetInnerHTML={{ __html: sanitizeVaultRichText(cell) }} />)}</tr>)}</tbody></table></div>;
  if (block.type === 'divider') return <hr className="my-9 border-slate-200" />;
  if (block.type === 'formula') return <pre className="mt-6 overflow-x-auto rounded-xl border border-violet-100 bg-violet-50 p-4 text-sm text-violet-950">{block.content || ''}</pre>;
  if (block.type === 'embed') {
    const href = safeVaultResourceUrl(block.url);
    return href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 font-bold text-emerald-700 hover:underline"><Link2 className="h-4 w-4" />{stripHtml(block.content || href)}</a> : null;
  }
  return null;
};

export const VaultSharedDocument = ({ onClose }: { onClose: () => void }) => {
  const [document, setDocument] = useState<any>(null);
  const [error, setError] = useState('');
  const token = useMemo(shareTokenFromHash, []);

  useEffect(() => {
    if (!token) { setError('This share link is incomplete or invalid.'); return; }
    db.vault.publicShare(token).then(setDocument).catch((requestError: any) => setError(friendlyPublicError(requestError)));
  }, [token]);

  const blocks = useMemo(() => parseDocumentContent(document?.contentJson, ''), [document]);
  const download = () => {
    const anchor = window.document.createElement('a');
    anchor.href = db.vault.publicDownloadUrl(token);
    anchor.download = `${document?.documentCode || 'code-rx-vault-document'}.html`;
    window.document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return <main className="min-h-screen bg-[#f7faf8] px-4 py-7 sm:px-6 sm:py-12 print:bg-white print:p-0">
    <article className="mx-auto max-w-4xl overflow-hidden rounded-3xl border border-emerald-100 bg-white shadow-xl shadow-emerald-950/5 print:max-w-none print:rounded-none print:border-0 print:shadow-none">
      <header className="border-b border-emerald-100 bg-gradient-to-br from-[#f7fffa] via-[#ecf9f0] to-[#def4e6] p-6 text-slate-800 sm:p-10 print:bg-white">
        <a href="/" className="mb-6 inline-flex items-center gap-3 rounded-xl border border-emerald-100 bg-white/85 px-3 py-2 text-left shadow-sm transition hover:border-emerald-300 print:border-0 print:bg-transparent print:p-0"><img src="/logo.png" alt="Code Rx Society" className="h-10 w-10 object-contain" /><span><span className="block text-sm font-black tracking-wide text-slate-900">CODE <span className="text-emerald-600">Rx</span> SOCIETY</span><span className="block text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">Shared Vault document</span></span></a>
        <div className="flex items-start justify-between gap-5">
          <div className="flex min-w-0 items-start gap-3"><div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-200 bg-white text-emerald-700 shadow-sm"><FileText className="h-5 w-5" /></div><div><p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">Code Rx Vault · Shared document</p><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-800 sm:text-3xl">{document?.title || 'Opening secure document…'}</h1>{document?.documentCode && <p className="mt-2 text-xs font-black uppercase tracking-wider text-emerald-700">{document.documentCode}</p>}</div></div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 print:hidden">
            {document && (document.canDownload ? <><button onClick={download} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-50"><Download className="h-4 w-4" />Download</button><button onClick={() => window.print()} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50"><Printer className="h-4 w-4" />Print</button></> : <><button disabled title="Download is not enabled for this link" className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-400"><Download className="h-4 w-4" />Download locked</button><button disabled title="Print is not enabled for this link" className="inline-flex cursor-not-allowed items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-400"><Printer className="h-4 w-4" />Print locked</button></>)}
            <button onClick={() => { window.location.hash = ''; onClose(); }} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Close</button>
          </div>
        </div>
        {document && !document.canDownload && <div role="status" className="mt-5 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900 print:hidden"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><span><strong className="block">Download and Print are not available for this link.</strong>{document.downloadMessage || 'This document is shared for reading only. Ask the owner if you need a downloadable copy.'}</span></div>}
        {document && <div className="mt-6 flex flex-wrap gap-x-4 gap-y-1 text-xs text-emerald-800"><span>{document.sectionTitle}</span><span>Created {dateLabel(document.createdAt)}</span><span>Updated {dateLabel(document.updatedAt)}</span></div>}
      </header>
      {error ? <div className="grid min-h-80 place-items-center p-8 text-center"><div><AlertCircle className="mx-auto h-9 w-9 text-red-500" /><h2 className="mt-4 text-xl font-black text-slate-800">Document unavailable</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-500">{error}</p></div></div> : !document ? <div className="grid min-h-80 place-items-center text-center"><p className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">Opening shared document…</p></div> : <><section className="px-6 py-8 sm:px-12 sm:py-12">{blocks.map((block) => <SharedBlock key={block.id} block={block} />)}</section><footer className="flex items-center gap-2 border-t border-slate-100 bg-slate-50 px-6 py-4 text-xs leading-5 text-slate-500 sm:px-12 print:hidden"><ShieldCheck className="h-4 w-4 shrink-0 text-emerald-600" />This is a read-only share. Protected attachments and private Vault records are not included.</footer></>}
    </article>
  </main>;
};

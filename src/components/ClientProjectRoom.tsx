import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Download,
  FileText,
  Loader2,
  LockKeyhole,
  LogOut,
} from 'lucide-react';
import { clientPortal, ClientPortalError } from '../lib/cloudflare';
import { messageForFailure } from '../lib/accessKey';
import { parseDocumentContent, sanitizeVaultRichText, type VaultBlock } from '../data/vaultEditor';

export interface ClientPortalContext {
  client: { id: string; name: string; contactName?: string | null };
  project: { id: string; reference: string; name: string; description?: string };
  permissions: { view: boolean; download: boolean };
}

interface ClientProjectRoomProps {
  context: ClientPortalContext;
  onSignedOut: () => void;
  /** Called when the server reports that the session is no longer valid. */
  onSessionEnded: (message: string) => void;
  /** A one-time notice, e.g. a document download that is not available yet. */
  notice?: string | null;
  onNotice: (message: string | null) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  document: 'Document',
  letter: 'Letter',
  agreement: 'Agreement',
  report: 'Report',
  deliverable: 'Deliverable',
  update: 'Update',
};

const dateLabel = (value?: string | null) => {
  if (!value) return '—';
  const parsed = new Date(String(value).replace(' ', 'T') + (String(value).includes('T') ? '' : 'Z'));
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
};

/**
 * Renders one stored content block. Every block passes through the existing Vault
 * rich-text sanitiser, so a malformed snapshot can never inject markup here.
 */
const ContentBlock = ({ block }: { block: VaultBlock }) => {
  const html = block.content ? sanitizeVaultRichText(block.content) : '';
  if (block.type === 'heading') {
    const Tag = block.level === 1 ? 'h2' : 'h3';
    return (
      <Tag
        className={block.level === 1 ? 'mt-8 text-2xl font-black tracking-tight text-slate-900' : 'mt-7 text-lg font-black text-slate-900'}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (block.type === 'bulletList' || block.type === 'numberedList' || block.type === 'checklist') {
    const List = block.type === 'numberedList' ? 'ol' : 'ul';
    return (
      <List className={`mt-4 space-y-2 pl-6 text-[15px] leading-7 text-slate-700 ${block.type === 'numberedList' ? 'list-decimal' : 'list-disc'}`}>
        {(block.items || []).map((item, index) => (
          <li key={item.id || index} className={item.checked ? 'text-slate-400 line-through' : ''} dangerouslySetInnerHTML={{ __html: sanitizeVaultRichText(item.text) }} />
        ))}
      </List>
    );
  }
  if (block.type === 'quote') {
    return <blockquote className="mt-5 border-l-4 border-emerald-300 bg-emerald-50/60 px-5 py-4 text-[15px] leading-7 text-emerald-950" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (block.type === 'callout') {
    return <aside className="mt-5 rounded-xl border border-emerald-100 bg-emerald-50 p-5 text-[15px] leading-7 text-emerald-950" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  if (block.type === 'code') {
    return <pre className="mt-5 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-[13px] leading-6 text-slate-800"><code>{block.content || ''}</code></pre>;
  }
  if (block.type === 'divider') return <hr className="my-8 border-slate-200" />;
  if (block.type === 'table') {
    return (
      <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200">
        <table className="min-w-full border-collapse text-sm">
          <tbody>
            {(block.rows || []).map((row, rowIndex) => (
              <tr key={rowIndex} className={rowIndex === 0 ? 'bg-slate-50 font-bold text-slate-900' : 'text-slate-700'}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex} className="border border-slate-200 p-3 align-top" dangerouslySetInnerHTML={{ __html: sanitizeVaultRichText(cell) }} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  return <p className="mt-4 text-[15px] leading-8 text-slate-700" dangerouslySetInnerHTML={{ __html: html }} />;
};

/**
 * The authorized project room.
 *
 * Nothing here decides access: the project id comes from the signed-in session,
 * never from the URL, and every request is re-authorized by the server.
 */
export const ClientProjectRoom = ({ context, onSignedOut, onSessionEnded, notice, onNotice }: ClientProjectRoomProps) => {
  const [sections, setSections] = useState<Array<{ id: string; label: string; count: number }>>([]);
  const [recent, setRecent] = useState<any[]>([]);
  const [activeSection, setActiveSection] = useState('overview');
  const [documents, setDocuments] = useState<any[] | null>(null);
  const [openDocument, setOpenDocument] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const projectId = context.project.id;

  const handleFailure = useCallback((failure: unknown) => {
    const status = failure instanceof ClientPortalError ? failure.status : -1;
    const code = failure instanceof ClientPortalError ? failure.code : null;
    // A session that the server no longer accepts sends the client back to the
    // access screen rather than leaving a half-dead room on screen.
    if (status === 401 || code === 'session_expired') {
      onSessionEnded(messageForFailure(status, 'session_expired'));
      return;
    }
    setError(messageForFailure(status, code));
  }, [onSessionEnded]);

  const loadProject = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await clientPortal.project(projectId);
      setSections(response.data.sections || []);
      setRecent(response.data.recent || []);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setLoading(false);
    }
  }, [projectId, handleFailure]);

  useEffect(() => { void loadProject(); }, [loadProject]);

  const openSection = async (section: string) => {
    setActiveSection(section);
    setOpenDocument(null);
    setError(null);
    if (section === 'overview') {
      setDocuments(null);
      return;
    }
    setBusy(true);
    setDocuments(null);
    try {
      const response = await clientPortal.section(projectId, section);
      setDocuments(response.data.documents || []);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  };

  const openDocumentById = async (documentId: string) => {
    setBusy(true);
    setError(null);
    try {
      const response = await clientPortal.document(projectId, documentId);
      setOpenDocument(response.data.document);
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  };

  const download = async (document: any) => {
    setError(null);
    setBusy(true);
    try {
      await clientPortal.download(projectId, document.id, `${document.reference || 'code-rx-document'}.pdf`);
    } catch {
      // Downloads only exist once a stamped client copy has been produced, so a
      // refusal is explained rather than shown as a failure code.
      onNotice('This document is not available to download yet. Please contact Code Rx Society.');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    setSigningOut(true);
    try {
      await clientPortal.logout();
    } catch {
      /* the local session is cleared either way */
    } finally {
      setSigningOut(false);
      onSignedOut();
    }
  };

  const blocks = useMemo(
    () => (openDocument ? parseDocumentContent(openDocument.content, openDocument.summary || '') : []),
    [openDocument],
  );

  const list = documents ?? recent;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="Code Rx Society" className="h-9 w-9 rounded-lg object-contain" />
            <div className="leading-tight">
              <p className="text-[13px] font-black tracking-[0.22em] text-slate-900">CODE Rx SOCIETY</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Client Project Room</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden text-right sm:block">
              <p className="max-w-[240px] truncate text-sm font-bold text-slate-900">{context.client.name}</p>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">{context.project.reference}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-black uppercase tracking-[0.14em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />} Log out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-8">
        {notice ? (
          <div className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{notice}</span>
            <button type="button" onClick={() => onNotice(null)} className="text-xs font-black uppercase tracking-wider text-amber-800 hover:underline">Dismiss</button>
          </div>
        ) : null}

        <div className="grid gap-8 lg:grid-cols-[220px_1fr]">
          <nav aria-label="Project sections" className="lg:sticky lg:top-6 lg:self-start">
            <div className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {(sections.length ? sections : [{ id: 'overview', label: 'Overview', count: 0 }]).map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => void openSection(section.id)}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-bold transition lg:w-full ${
                    activeSection === section.id
                      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                      : 'text-slate-600 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  <span>{section.label}</span>
                  <span className={`text-[11px] font-black ${activeSection === section.id ? 'text-emerald-700' : 'text-slate-400'}`}>{section.count}</span>
                </button>
              ))}
            </div>
          </nav>

          <section>
            {error ? (
              <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            ) : null}

            {openDocument ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)] sm:p-8">
                <button
                  type="button"
                  onClick={() => setOpenDocument(null)}
                  className="inline-flex items-center gap-1.5 text-xs font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back
                </button>
                <p className="mt-5 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">
                  {CATEGORY_LABELS[openDocument.category] || 'Document'}
                </p>
                <h2 className="mt-2 text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{openDocument.title}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-semibold text-slate-500">
                  {openDocument.reference ? <span className="font-mono uppercase tracking-wider">{openDocument.reference}</span> : null}
                  {openDocument.version ? <span>Version {openDocument.version}</span> : null}
                  <span>Published {dateLabel(openDocument.publishedAt || openDocument.updatedAt)}</span>
                </div>
                <div className="mt-6 border-t border-slate-100 pt-2">
                  {blocks.length ? blocks.map((block, index) => <ContentBlock key={block.id || index} block={block} />) : (
                    <p className="mt-4 text-sm font-medium text-slate-500">This document has no published content yet.</p>
                  )}
                </div>
                {openDocument.permissions?.download ? (
                  <div className="mt-8 border-t border-slate-100 pt-6">
                    <button
                      type="button"
                      onClick={() => void download(openDocument)}
                      disabled={busy}
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-700 disabled:opacity-70"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download copy
                    </button>
                  </div>
                ) : null}
              </article>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-7">
                  <h1 className="text-2xl font-black tracking-tight text-slate-900 sm:text-3xl">{context.project.name}</h1>
                  <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{context.project.reference}</p>
                  {context.project.description ? (
                    <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">{context.project.description}</p>
                  ) : null}
                </div>

                <div className="mt-7 flex items-center justify-between">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-700">
                    {activeSection === 'overview' ? 'Recently published' : CATEGORY_LABELS[activeSection] || activeSection}
                  </h2>
                  {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {loading || (busy && documents === null && activeSection !== 'overview') ? (
                    <div className="flex items-center gap-2 px-5 py-10 text-sm font-semibold text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading your project…
                    </div>
                  ) : list.length ? (
                    <ul className="divide-y divide-slate-100">
                      {list.map((document) => (
                        <li key={document.id}>
                          <button
                            type="button"
                            onClick={() => void openDocumentById(document.id)}
                            className="flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-slate-50"
                          >
                            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                              <FileText className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold text-slate-900">{document.title}</span>
                              <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">
                                {CATEGORY_LABELS[document.category] || 'Document'}
                                {document.reference ? ` · ${document.reference}` : ''}
                                {document.version ? ` · v${document.version}` : ''}
                                {` · ${dateLabel(document.publishedAt || document.updatedAt)}`}
                              </span>
                            </span>
                            {document.permissions?.download ? <Download className="h-4 w-4 shrink-0 text-slate-300" /> : null}
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="px-5 py-10 text-sm font-medium text-slate-500">
                      Nothing has been published here yet. When Code Rx Society publishes a document, it will appear in this room.
                    </p>
                  )}
                </div>
              </>
            )}

            <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-400">
              <LockKeyhole className="h-3.5 w-3.5" /> This room only shows documents published to {context.client.name}.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
};

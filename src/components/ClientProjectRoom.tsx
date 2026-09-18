import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  CalendarDays,
  Download,
  Eye,
  FileText,
  KeyRound,
  Loader2,
  LockKeyhole,
  LogOut,
  ShieldCheck,
} from 'lucide-react';
import { clientPortal, ClientPortalError } from '../lib/cloudflare';
import { messageForFailure } from '../lib/accessKey';
import {
  landingFor,
  linkDestinationLabel,
  type LinkLanding,
} from '../lib/linkAccess';
import {
  CATEGORY_LABELS,
  canDownload,
  canPrint,
  deliveryAvailable,
  deliveryMessage,
  freshnessBadge,
  parseDelivery,
  sectionForCategory,
  downloadFileName,
  emptyMessageFor,
  hasAnyPublishedContent,
  overviewFacts,
  publicationInfo,
  sectionLabel,
  visibleSections,
  type RoomDelivery,
  type RoomDocument,
  type RoomSection,
} from '../lib/projectRoom';

export interface ClientPortalContext {
  client: { id: string; name: string; contactName?: string | null };
  project: { id: string; reference: string; name: string; description?: string; status?: string };
  permissions: { view: boolean; download: boolean };
  /**
   * Phase 7: where this session may go. `restricted` is true only for a session
   * minted from a temporary link; a key session sees the whole room. The room
   * renders only what the server offered — the server refuses the rest anyway.
   */
  destination?: {
    restricted: boolean;
    destination: string;
    intent: string;
    section: string | null;
    documentId: string | null;
  } | null;
  /** The single document a document/file link names, when it names one. */
  target?: { id: string; title: string; reference?: string | null; category?: string; version?: string | null } | null;
}

/**
 * The three reads the room performs. The signed-in client uses the client API;
 * PHANTOM's preview passes an equivalent transport backed by the preview
 * endpoints, which return the same payloads. Swapping the transport is what
 * lets PREVIEW render the genuine component without inventing a second room.
 */
export interface RoomTransport {
  project: (projectId: string) => Promise<{ data: { project?: any; sections?: any[]; recent?: any[]; scope?: any } }>;
  section: (projectId: string, section: string) => Promise<{ data: { documents?: any[] } }>;
  document: (projectId: string, documentId: string) => Promise<{ data: { document: any; delivery?: unknown } }>;
  /** Absent in preview: preview never serves a file. */
  download?: (projectId: string, documentId: string, fileName: string) => Promise<void>;
  /** Fetches the stamped client copy as a local object URL. Absent in preview. */
  stampedCopy?: (projectId: string, documentId: string, action: 'preview' | 'print') => Promise<{ url: string; filename: string }>;
}

interface ClientProjectRoomProps {
  context: ClientPortalContext;
  onSignedOut: () => void;
  /** Called when the server reports that the session is no longer valid. */
  onSessionEnded: (message: string) => void;
  notice?: string | null;
  onNotice: (message: string | null) => void;
  /** Defaults to the client API. Preview supplies its own. */
  transport?: RoomTransport;
  /** Preview mode: the room is read-only and never serves a file. */
  preview?: boolean;
  /** Label for the header action (Log out for clients, Exit preview for PHANTOM). */
  exitLabel?: string;
}

/**
 * The stamped client copy.
 *
 * The portal renders the artifact the server produced — a watermarked Code Rx
 * document — instead of re-typing the stored text. That is what makes the
 * watermark part of the viewer and of anything printed from it. When the server
 * says no stamped copy can be produced, this panel says so and shows nothing
 * else: the internal original is never a fallback.
 */
export const StampedCopyPanel = ({
  delivery, copy, busy, preview, printable, onLoadCopy, onPrint,
}: {
  delivery: RoomDelivery;
  copy: { url: string; filename: string } | null;
  busy: boolean;
  preview: boolean;
  printable: boolean;
  onLoadCopy: () => void;
  onPrint: () => void;
}) => {
  if (!deliveryAvailable(delivery)) {
    return (
      <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm font-semibold text-amber-900">
        {deliveryMessage(delivery)}
      </div>
    );
  }

  return (
    <div className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-100 bg-emerald-50/70 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[11px] font-black uppercase tracking-[0.22em] text-emerald-800">
            {delivery.designation || 'CLIENT PROJECT DOCUMENT'}
          </p>
          <p className="mt-1 text-xs font-semibold text-emerald-900">
            {delivery.label || 'Stamped copy'} · watermarked by Code Rx Society
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {printable ? (
          <button
            type="button"
            onClick={onPrint}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-50"
          >
            <Eye className="h-3.5 w-3.5" /> Print
          </button>
          ) : null}
          {copy ? (
            <a
              href={copy.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.16em] text-emerald-800 ring-1 ring-emerald-200 transition hover:bg-emerald-50"
            >
              <FileText className="h-3.5 w-3.5" /> Open in a new tab
            </a>
          ) : null}
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
        {preview ? (
          <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
            Preview shows the client&apos;s room, not their files. In their own session the stamped
            {' '}{delivery.label || 'client copy'} opens here.
          </p>
        ) : copy ? (
          <object
            data={copy.url}
            type={delivery.contentType || 'application/pdf'}
            aria-label={`${delivery.label || 'Stamped client copy'} for this document`}
            className="h-[70vh] w-full bg-white"
          >
            <p className="px-4 py-10 text-center text-sm font-semibold text-slate-500">
              Your browser cannot display this file inline.{' '}
              <a className="underline" href={copy.url} target="_blank" rel="noreferrer">Open the stamped copy</a>.
            </p>
          </object>
        ) : (
          <div className="px-4 py-12 text-center">
            <button
              type="button"
              onClick={onLoadCopy}
              disabled={busy}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-700 disabled:opacity-70"
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Open stamped copy
            </button>
            <p className="mt-3 text-xs font-medium text-slate-500">
              Every copy is stamped with the Code Rx watermark, your project reference and the version.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

const DocumentAction = ({
  document, busy, onView, onDownload,
}: {
  document: RoomDocument;
  busy: boolean;
  onView: () => void;
  onDownload: () => void;
}) => (
  <div className="flex shrink-0 items-center gap-2">
    <button
      type="button"
      onClick={onView}
      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200"
    >
      <Eye className="h-3.5 w-3.5" /> View
    </button>
    {/* Download is offered only when the server granted it for this document.
        Viewing never implies downloading. */}
    {canDownload(document) ? (
      <button
        type="button"
        onClick={onDownload}
        disabled={busy}
        aria-label={`Download ${document.title}`}
        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-[11px] font-black uppercase tracking-[0.12em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 disabled:opacity-70"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Download
      </button>
    ) : (
      <span className="hidden items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400 sm:inline-flex">
        <LockKeyhole className="h-3.5 w-3.5" /> View only
      </span>
    )}
  </div>
);

const DocumentRow = ({
  document, busy, onView, onDownload,
}: {
  document: RoomDocument;
  busy: boolean;
  onView: () => void;
  onDownload: () => void;
}) => {
  const info = publicationInfo(document);
  const badge = freshnessBadge(document);
  return (
    <li className="flex flex-col gap-3 px-4 py-4 transition hover:bg-slate-50/70 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900">{document.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
          <span className="uppercase tracking-[0.1em] text-emerald-700">{CATEGORY_LABELS[document.category] || 'Document'}</span>
          {badge ? (
            <span
              title={badge.title}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                badge.label === 'NEW' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100' : 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
              }`}
            >
              {badge.label}
            </span>
          ) : null}
          {document.reference ? <span className="font-mono uppercase tracking-wider">{document.reference}</span> : null}
          {document.version ? <span>Version {document.version}</span> : null}
        </div>
        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-[11px] font-medium text-slate-500">
          <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> {info.primary}</span>
          {info.secondary ? <span>{info.secondary}</span> : null}
        </p>
        {document.summary ? <p className="mt-1.5 line-clamp-2 text-xs font-medium text-slate-500">{document.summary}</p> : null}
      </div>
      <div className="flex items-center justify-end sm:justify-start">
        <DocumentAction document={document} busy={busy} onView={onView} onDownload={onDownload} />
      </div>
    </li>
  );
};

/**
 * The landing screen for a link that exists to deliver one file.
 *
 * It shows only the file the link names: no section list, no other document, no
 * counts. When the download is not permitted through this link the button is
 * replaced by the reason, and the server refuses the request in any case.
 */
const FileLandingPanel = ({
  target, clientName, canDownload, busy, onDownload,
}: {
  target: { title?: string; reference?: string | null; category?: string; version?: string | null } | null;
  clientName: string;
  canDownload: boolean;
  busy: boolean;
  onDownload: () => void | Promise<void>;
}) => (
  <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)] sm:p-9">
    <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
      <Download className="h-5 w-5" />
    </span>
    <h1 className="mt-5 text-xl font-black tracking-tight text-slate-900 sm:text-2xl">Your file is ready</h1>
    <p className="mt-2 text-sm font-medium leading-6 text-slate-600">
      This temporary link delivers one file from {clientName}, prepared for you by Code Rx Society.
    </p>

    <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/70 px-4 py-4">
      <p className="text-sm font-bold text-slate-900">{target?.title || 'Client file'}</p>
      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
        {target?.reference ? <span className="font-mono uppercase tracking-wider">{target.reference}</span> : null}
        {target?.version ? <span>Version {target.version}</span> : null}
        {target?.category ? <span className="uppercase tracking-[0.1em] text-emerald-700">{CATEGORY_LABELS[target.category] || 'Document'}</span> : null}
      </p>
    </div>

    {canDownload ? (
      <button
        type="button"
        onClick={() => void onDownload()}
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-sm font-black uppercase tracking-[0.18em] text-white transition hover:bg-emerald-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-emerald-100 disabled:opacity-70 sm:w-auto"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download file
      </button>
    ) : (
      <p className="mt-6 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
        <LockKeyhole className="mt-0.5 h-4 w-4 shrink-0" />
        This link does not permit downloads. Ask Code Rx Society for a link that does.
      </p>
    )}

    <p className="mt-6 text-xs font-medium leading-5 text-slate-500">
      Only this file is available through this link. Nothing else in the project room can be opened from here.
    </p>
  </div>
);

/**
 * The authenticated Client Project Room.
 *
 * Nothing here decides access: the project id comes from the signed-in session,
 * never from the URL, and every request is re-authorized by the server. A
 * section is only offered when the server reports authorized content in it.
 */
export const ClientProjectRoom = ({
  context, onSignedOut, onSessionEnded, notice, onNotice,
  transport = clientPortal, preview = false, exitLabel = 'Log out',
}: ClientProjectRoomProps) => {
  const [sections, setSections] = useState<RoomSection[]>([]);
  const [recent, setRecent] = useState<RoomDocument[]>([]);
  const [projectStatus, setProjectStatus] = useState<string>(context.project.status || 'active');
  const [projectDates, setProjectDates] = useState<{ createdAt?: string | null; updatedAt?: string | null }>({});
  const [activeSection, setActiveSection] = useState('overview');
  const [documents, setDocuments] = useState<RoomDocument[] | null>(null);
  const [openDocument, setOpenDocument] = useState<any | null>(null);
  const [openDelivery, setOpenDelivery] = useState<RoomDelivery>(() => parseDelivery(null));
  const [copy, setCopy] = useState<{ url: string; filename: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [copyBusy, setCopyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);

  const projectId = context.project.id;
  // Where the link (or key) was allowed to land. Everything below is derived
  // from the server's own scope block, never from the URL.
  const landing: LinkLanding = useMemo(() => landingFor(context.destination), [context.destination]);
  const restricted = context.destination?.restricted === true;

  const handleFailure = useCallback((failure: unknown) => {
    const status = failure instanceof ClientPortalError ? failure.status : -1;
    const code = failure instanceof ClientPortalError ? failure.code : null;
    // A session the server no longer accepts sends the client back to the
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
      const response = await transport.project(projectId);
      const project = response.data.project || {};
      setSections(response.data.sections || []);
      setRecent(response.data.recent || []);
      setProjectStatus(project.status || 'active');
      setProjectDates({ createdAt: project.createdAt, updatedAt: project.updatedAt });
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setLoading(false);
    }
  }, [projectId, handleFailure, transport]);

  useEffect(() => {
    // A file link exists to deliver one file: the room is never fetched, so the
    // session stays the minimum authorization the destination needs.
    if (landing.fileOnly) { setLoading(false); return; }
    void loadProject();
  }, [loadProject, landing.fileOnly]);

  // Land on the destination the link named, once the room's own data has loaded.
  useEffect(() => {
    if (loading || landing.fileOnly) return;
    if (landing.kind === 'section') void openSection(landing.section);
    else if (landing.kind === 'document' && landing.documentId) {
      void openSection(sectionForCategory(context.target?.category));
      void openDocumentById(landing.documentId);
    }
    // Only when the destination itself changes: a client browsing afterwards is
    // never bounced back to the link's landing point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, landing.kind, landing.section, landing.documentId, landing.fileOnly]);

  const openSection = async (section: string) => {
    setActiveSection(section);
    setOpenDocument(null);
    setOpenDelivery(parseDelivery(null));
    setCopy(null);
    setError(null);
    if (section === 'overview') {
      setDocuments(null);
      return;
    }
    setBusy(true);
    setDocuments(null);
    try {
      const response = await transport.section(projectId, section);
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
    setCopy(null);
    try {
      const response = await transport.document(projectId, documentId);
      setOpenDocument(response.data.document);
      const delivery = parseDelivery(response.data.delivery);
      setOpenDelivery(delivery);
      // The stamped copy is fetched eagerly only when the viewer can show it.
      if (!preview && delivery.available && transport.stampedCopy) {
        void loadStampedCopy(documentId);
      }
    } catch (failure) {
      handleFailure(failure);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Loads the stamped artifact for the viewer. The bytes come from the server
   * under the client session; the portal holds them in an object URL for as long
   * as the document is open, and revokes it when the viewer closes.
   */
  const loadStampedCopy = async (documentId: string, action: 'preview' | 'print' = 'preview') => {
    if (!transport.stampedCopy) return null;
    try {
      return await transport.stampedCopy(projectId, documentId, action);
    } catch (failure) {
      handleFailure(failure);
      return null;
    }
  };

  const openStampedCopy = async () => {
    if (!openDocument) return;
    setCopyBusy(true);
    setError(null);
    try {
      const loaded = await loadStampedCopy(String(openDocument.id), 'preview');
      if (loaded) setCopy(loaded);
    } finally {
      setCopyBusy(false);
    }
  };

  /**
   * Printing goes through the same artifact. A blank window is opened first so
   * the browser's user gesture is preserved, then pointed at the stamped file —
   * what the client prints is the watermarked document, not the page's markup.
   */
  const printStampedCopy = async () => {
    if (!openDocument) return;
    setError(null);
    const opened = !preview ? window.open('', '_blank', 'noopener') : null;
    setCopyBusy(true);
    try {
      const loaded = await loadStampedCopy(String(openDocument.id), 'print');
      if (!loaded) {
        if (opened) opened.close();
        return;
      }
      if (opened) opened.location.href = loaded.url;
      else if (!preview) window.open(loaded.url, '_blank', 'noopener');
    } finally {
      setCopyBusy(false);
    }
  };

  const download = async (document: RoomDocument) => {
    setError(null);
    // Preview never serves a document: it shows the client's own experience,
    // including the permission the client has, without handing a file to the
    // operator's browser.
    if (preview || !transport.download) {
      onNotice('In preview, downloads are shown but not served. The client downloads this from their own session.');
      return;
    }
    setBusy(true);
    try {
      await transport.download(projectId, document.id, downloadFileName(document));
    } catch {
      // Downloads exist only once a stamped client copy has been produced, so a
      // refusal is explained rather than shown as a failure code.
      onNotice('This document is not available to download yet. Please contact Code Rx Society.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => {
    // Object URLs hold the stamped bytes in memory; release them when the room
    // goes away so a closed session leaves nothing behind in the browser.
    setCopy((current) => {
      if (current?.url) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

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

  // Only sections holding authorized content are offered, plus the overview.
  const shownSections = useMemo(() => visibleSections(sections, recent.length), [sections, recent.length]);
  const publishedCount = useMemo(
    () => (sections || []).reduce((total, section) => (section.id === 'overview' ? total : total + Number(section.count || 0)), 0),
    [sections],
  );
  const facts = useMemo(
    () => overviewFacts({ reference: context.project.reference, status: projectStatus, ...projectDates, publishedCount }),
    [context.project.reference, projectStatus, projectDates, publishedCount],
  );

  const list = documents ?? recent;
  const anythingPublished = hasAnyPublishedContent(sections) || recent.length > 0;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-5 sm:py-4">
          <div className="flex min-w-0 items-center gap-3">
            <img src="/logo.png" alt="Code Rx Society" className="h-9 w-9 rounded-lg object-contain" />
            <div className="min-w-0 leading-tight">
              <p className="text-[12px] font-black tracking-[0.22em] text-slate-900 sm:text-[13px]">CODE Rx SOCIETY</p>
              <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Client Project Room</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="max-w-[220px] truncate text-sm font-bold text-slate-900">{context.client.name}</p>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">{context.project.reference}</p>
            </div>
            <button
              type="button"
              onClick={signOut}
              disabled={signingOut}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[11px] font-black uppercase tracking-[0.14em] text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 disabled:opacity-60 sm:px-3.5"
            >
              {signingOut ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogOut className="h-4 w-4" />}
              <span className="hidden sm:inline">{exitLabel}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-5 sm:py-8">
        {preview ? (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Preview only — this is exactly what {context.client.name} sees. No client session was created,
              no document is downloaded, and nothing on screen can change their access.
            </span>
          </div>
        ) : null}
        {restricted && !landing.fileOnly ? (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700">
            <KeyRound className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            <span>
              You opened this room with a temporary link for <strong>{linkDestinationLabel(context.destination?.destination)}</strong>.
              Anything outside that destination stays closed; your access key opens the whole room.
            </span>
          </div>
        ) : null}
        {notice ? (
          <div
            role="status"
            aria-live="polite"
            className="mb-6 flex items-start justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"
          >
            <span className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{notice}</span>
            <button
              type="button"
              aria-label="Dismiss this message"
              onClick={() => onNotice(null)}
              className="shrink-0 rounded text-xs font-black uppercase tracking-wider text-amber-800 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
            >
              Dismiss
            </button>
          </div>
        ) : null}

        {landing.fileOnly ? (
          <FileLandingPanel
            target={context.target || null}
            clientName={context.client.name}
            canDownload={context.permissions.download === true}
            busy={busy}
            onDownload={async () => {
              if (!landing.documentId) return;
              setBusy(true);
              setError(null);
              try {
                if (!transport.download) {
                  onNotice('In preview, downloads are shown but not served.');
                  return;
                }
                await transport.download(projectId, landing.documentId, `${(context.target?.reference || 'code-rx-file')}.pdf`);
              } catch {
                onNotice('This file is not available to download yet. Please contact Code Rx Society.');
              } finally {
                setBusy(false);
              }
            }}
          />
        ) : (
        <div className="grid gap-6 lg:grid-cols-[230px_1fr] lg:gap-8">
          {/* Sections: a horizontal strip on small screens, a sidebar from lg up. */}
          <nav aria-label="Project sections" className="lg:sticky lg:top-6 lg:self-start">
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:flex-col lg:gap-1 lg:overflow-visible lg:pb-0">
              {shownSections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => void openSection(section.id)}
                  aria-current={activeSection === section.id ? 'page' : undefined}
                  className={`flex shrink-0 items-center justify-between gap-3 rounded-lg px-3.5 py-2.5 text-sm font-bold transition lg:w-full ${
                    activeSection === section.id
                      ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-100'
                      : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:text-slate-900 lg:bg-transparent lg:ring-0 lg:hover:bg-white'
                  }`}
                >
                  <span className="whitespace-nowrap">{section.label}</span>
                  {section.id === 'overview' ? null : (
                    <span className={`text-[11px] font-black ${activeSection === section.id ? 'text-emerald-700' : 'text-slate-400'}`}>{section.count}</span>
                  )}
                </button>
              ))}
            </div>
          </nav>

          <section className="min-w-0">
            {error ? (
              <div role="alert" className="mb-5 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
              </div>
            ) : null}

            {openDocument ? (
              <article className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_18px_50px_-40px_rgba(15,23,42,0.4)] sm:p-8">
                <button
                  type="button"
                  onClick={() => setOpenDocument(null)}
                  className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-slate-500 transition hover:text-slate-800"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to {sectionLabel(activeSection)}
                </button>
                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <p className="text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700">
                    {CATEGORY_LABELS[openDocument.category] || 'Document'}
                  </p>
                  {freshnessBadge(openDocument as RoomDocument) ? (
                    <span
                      title={freshnessBadge(openDocument as RoomDocument)?.title}
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ${
                        freshnessBadge(openDocument as RoomDocument)?.label === 'NEW'
                          ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100'
                          : 'bg-amber-50 text-amber-800 ring-1 ring-amber-100'
                      }`}
                    >
                      {freshnessBadge(openDocument as RoomDocument)?.label}
                    </span>
                  ) : null}
                </div>
                <h2 className="mt-2 text-xl font-black tracking-tight text-slate-900 sm:text-3xl">{openDocument.title}</h2>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] font-semibold text-slate-500">
                  {openDocument.reference ? <span className="font-mono uppercase tracking-wider">{openDocument.reference}</span> : null}
                  {openDocument.version ? <span>Version {openDocument.version}</span> : null}
                  <span>{publicationInfo(openDocument as RoomDocument).primary}</span>
                  {publicationInfo(openDocument as RoomDocument).secondary ? <span>{publicationInfo(openDocument as RoomDocument).secondary}</span> : null}
                </div>
                {openDocument.summary ? (
                  <p className="mt-5 rounded-xl bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">{openDocument.summary}</p>
                ) : null}
                <StampedCopyPanel
                  delivery={openDelivery}
                  copy={copy}
                  busy={copyBusy}
                  preview={!!preview}
                  printable={canPrint(openDocument as RoomDocument, openDelivery)}
                  onLoadCopy={() => void openStampedCopy()}
                  onPrint={() => void printStampedCopy()}
                />
                {canDownload(openDocument as RoomDocument) ? (
                  <div className="mt-8 flex flex-col gap-3 border-t border-slate-100 pt-6 sm:flex-row sm:items-center">
                    <button
                      type="button"
                      onClick={() => void download(openDocument as RoomDocument)}
                      disabled={busy}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-emerald-700 disabled:opacity-70"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download copy
                    </button>
                    <p className="text-xs font-medium text-slate-500">
                      Your download is the stamped Code Rx copy of this document — watermarked and print-safe.
                    </p>
                  </div>
                ) : (
                  <p className="mt-8 flex items-center gap-2 border-t border-slate-100 pt-6 text-xs font-bold uppercase tracking-[0.12em] text-slate-400">
                    <LockKeyhole className="h-3.5 w-3.5" /> View only — this document cannot be downloaded.
                  </p>
                )}
              </article>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-7">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-3xl">{context.project.name}</h1>
                      <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">{context.project.reference}</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-700 ring-1 ring-emerald-100">
                      <ShieldCheck className="h-3.5 w-3.5" /> {facts[0].value}
                    </span>
                  </div>
                  {context.project.description ? (
                    <p className="mt-4 max-w-3xl text-[15px] leading-7 text-slate-600">{context.project.description}</p>
                  ) : null}

                  {/* Project information. Only the client's own project facts. */}
                  <dl className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-5 sm:grid-cols-4">
                    {facts.map((fact) => (
                      <div key={fact.label} className="min-w-0">
                        <dt className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{fact.label}</dt>
                        <dd className="mt-1 truncate text-sm font-bold text-slate-800" title={fact.value}>{fact.value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-black uppercase tracking-[0.2em] text-slate-700">
                    {activeSection === 'overview' ? 'Recently published' : sectionLabel(activeSection)}
                  </h2>
                  <div className="flex items-center gap-3">
                    {list.some((document) => freshnessBadge(document)) ? (
                      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">
                        <span className="text-emerald-700">NEW</span> recently published · <span className="text-amber-700">UPDATED</span> changed since
                      </p>
                    ) : null}
                    {busy ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" aria-hidden="true" /> : null}
                  </div>
                </div>

                <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white" aria-live="polite" aria-busy={loading}>
                  {loading || (busy && documents === null && activeSection !== 'overview') ? (
                    <div role="status" className="flex items-center gap-2 px-5 py-10 text-sm font-semibold text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Loading your project…
                    </div>
                  ) : list.length ? (
                    <ul className="divide-y divide-slate-100">
                      {list.map((document) => (
                        <DocumentRow
                          key={document.id}
                          document={document}
                          busy={busy}
                          onView={() => void openDocumentById(document.id)}
                          onDownload={() => void download(document)}
                        />
                      ))}
                    </ul>
                  ) : activeSection === 'overview' && !anythingPublished && landing.fileOnly ? (
                    <div className="px-5 py-10 text-center">
                      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </span>
                      <p className="mt-4 text-sm font-bold text-slate-700">Preparing your file…</p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        This link delivers a single file. Your download starts automatically.
                      </p>
                    </div>
                  ) : (
                    <div className="px-5 py-12 text-center">
                      <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-xl bg-slate-100 text-slate-400">
                        <FileText className="h-5 w-5" />
                      </span>
                      <p className="mt-4 text-sm font-bold text-slate-700">
                        {activeSection === 'overview' && !anythingPublished
                          ? 'No documents available yet.'
                          : emptyMessageFor(activeSection)}
                      </p>
                      <p className="mx-auto mt-2 max-w-sm text-xs font-medium text-slate-500">
                        {activeSection === 'overview' && !anythingPublished
                          ? 'When Code Rx Society publishes something for this project, it appears here.'
                          : 'Everything published to this section will appear here.'}
                      </p>
                    </div>
                  )}
                </div>

                {activeSection === 'overview' && list.length && publishedCount > list.length ? (
                  <p className="mt-3 text-xs font-semibold text-slate-500">
                    Showing the {list.length} most recent of {publishedCount} published documents. Choose a section above to see the rest.
                  </p>
                ) : null}
              </>
            )}

            <p className="mt-8 flex items-center justify-center gap-2 text-center text-xs font-semibold text-slate-400">
              <LockKeyhole className="h-3.5 w-3.5" /> This room only shows documents published to {context.client.name}.
            </p>
          </section>
        </div>
        )}
      </main>
    </div>
  );
};

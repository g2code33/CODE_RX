import { useCallback, useEffect, useRef, useState } from 'react';
import { useModalBehaviour } from './AppDialog';
import {
  Activity, AlertTriangle, Archive, CheckCircle2, Clock, Copy, Eye, FileCheck2, FileText, FileUp, KeyRound,
  Link2, Loader2, Pencil, Plus, RefreshCw, ShieldAlert, ShieldCheck, Users, X,
} from 'lucide-react';
import { clientAccessCenter, db } from '../lib/cloudflare';
import { VaultUploadField } from './VaultUploadField';
import {
  STAMPABLE_UPLOAD_ACCEPT,
  STAMPABLE_UPLOAD_LABEL,
  isStampableUploadMime,
  sectionAcceptsDocuments,
  uploadDocumentStatus,
  uploadFileAsVaultDocument,
  type UploadedVaultDocument,
} from '../lib/vaultUploads';
import { appDialog } from './AppDialog';
import { ClientProjectRoom, type ClientPortalContext, type RoomTransport } from './ClientProjectRoom';
import { CATEGORY_LABELS } from '../lib/projectRoom';
import {
  absoluteLinkUrl,
  linkAddressUrl,
  clientSignInUrl,
  linkShareHint,
  LINK_ACCESS_MODES,
  LINK_DESTINATIONS,
  LINK_MAX_USES_LIMIT,
  LINK_TTL_MINUTES_FALLBACK,
  LINK_TTL_MAX_MINUTES,
  LINK_TTL_MIN_MINUTES,
  LINK_TTL_PRESETS,
  linkDestination,
  linkDestinationLabel,
  linkPermissionSummary,
  linkUsesLabel,
  validateLinkLifetime,
  validateLinkMaxUses,
  type LinkAccessMode,
  type LinkDestinationId,
} from '../lib/linkAccess';

type Section = 'clients' | 'projects' | 'documents' | 'keys' | 'links' | 'activity' | 'permissions';

const SECTIONS: Array<[Section, string, any]> = [
  ['clients', 'Clients', Users],
  ['projects', 'Projects', Archive],
  ['documents', 'Documents', FileText],
  ['keys', 'Access keys', KeyRound],
  ['links', 'Temporary Links', Link2],
  ['activity', 'Activity', Activity],
  ['permissions', 'Permissions', ShieldCheck],
];

const LIFECYCLE_STEPS: string[] = ['draft', 'in_review', 'approved', 'published'];
const LIFECYCLE_ALL: string[] = [...LIFECYCLE_STEPS, 'unpublished', 'archived'];
const LIFECYCLE_LABELS: Record<string, string> = {
  draft: 'Draft', in_review: 'In review', approved: 'Approved',
  published: 'Published', unpublished: 'Unpublished', archived: 'Archived',
};

const formatWhen = (value?: string | null) => {
  if (!value) return '—';
  const text = String(value);
  const parsed = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return '—';
  return parsed.toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const statusTone = (status: string) => {
  if (status === 'active' || status === 'published') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (status === 'suspended' || status === 'in_review') return 'bg-amber-50 text-amber-800 ring-amber-100';
  if (status === 'revoked' || status === 'archived') return 'bg-rose-50 text-rose-700 ring-rose-100';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
};

const Pill = ({ children, tone = 'slate' }: { children: any; tone?: string }) => (
  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.1em] ring-1 ${
    tone === 'slate' ? 'bg-slate-100 text-slate-600 ring-slate-200' : statusTone(tone)
  }`}>{children}</span>
);

const Field = ({ label, children, hint }: { label: string; children: any; hint?: string }) => (
  <label className="block">
    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-500">{label}</span>
    <div className="mt-1.5">{children}</div>
    {hint ? <span className="mt-1 block text-[11px] font-medium text-slate-500">{hint}</span> : null}
  </label>
);

const inputClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition focus:border-emerald-400 focus:ring-4 focus:ring-emerald-50';

const Dialog = ({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: any; wide?: boolean }) => {
  // Escape closes it, the page behind stops scrolling, and Tab stays inside.
  const panelRef = useRef<HTMLDivElement>(null);
  useModalBehaviour(true, onClose, panelRef);
  return <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/40 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
    <div ref={panelRef} tabIndex={-1} className={`w-full ${wide ? 'max-w-3xl' : 'max-w-xl'} rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/20`}>
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div>
          <h4 className="text-lg font-black text-slate-900">{title}</h4>
          {subtitle ? <p className="mt-1 text-xs font-medium text-slate-500">{subtitle}</p> : null}
        </div>
        <button onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="h-4 w-4" /></button>
      </div>
      <div className="px-5 py-5">{children}</div>
    </div>
  </div>;
};

/**
 * PREVIEW AS CLIENT transport.
 *
 * Exported so the UI harness can hold the promise the feature makes: preview
 * talks to the preview endpoints only, for the client and project it was given,
 * and it has no download capability at all.
 */
export const buildPreviewTransport = (
  api: Pick<typeof clientAccessCenter, 'previewSection' | 'previewDocument'>,
  room: any,
  clientId: string,
  projectId: string,
): RoomTransport => ({
  project: async () => ({ data: room }),
  section: async (_projectId: string, target: string) =>
    ({ data: await api.previewSection(clientId, projectId, target) }),
  document: async (_projectId: string, documentId: string) =>
    ({ data: await api.previewDocument(clientId, projectId, documentId) }),
  // Deliberately no `download`, and no `sign`, `sendToPhantom`, `messages` or
  // `sendMessage`: the operator sees the client's own permission state and the
  // new signing and messaging surfaces, but nothing is signed, sent to PHANTOM
  // or downloaded outside the client's own session.
});

/** The client context the real room renders inside while previewing. */
export const buildPreviewRoomContext = (client: any, room: any): ClientPortalContext | null => (
  client && room
    ? {
      client: { id: client.id, name: client.name },
      project: room.project,
      // View is what the client would have; download is forced off in preview.
      permissions: { view: true, download: false },
    }
    : null
);

export const ClientAccessCenter = ({ onMessage }: { onMessage: (message: string) => void }) => {
  const [section, setSection] = useState<Section>('clients');
  const [clients, setClients] = useState<any[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [keys, setKeys] = useState<any[]>([]);
  const [documents, setDocuments] = useState<any[]>([]);
  const [links, setLinks] = useState<any[]>([]);
  const [activity, setActivity] = useState<{ entries: any[]; meta: any }>({ entries: [], meta: null });
  const [activityFilters, setActivityFilters] = useState<{ kind: string | null }>({ kind: null });
  const [activityLoading, setActivityLoading] = useState(false);
  const [capabilities, setCapabilities] = useState<any>({ capabilities: [], legacy: [], mine: [] });
  const [portalSettings, setPortalSettings] = useState<any[]>([]);
  /**
   * `null` until the portal switch has been read. When it is `false`, every
   * link and access key this workspace issues shows the client “Client access
   * is not available right now.” — so the warning below is worth more than a
   * silent panel.
   */
  const [clientAccessOn, setClientAccessOn] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [showClientForm, setShowClientForm] = useState<null | { mode: 'create' } | { mode: 'edit'; client: any }>(null);
  const [showProjectForm, setShowProjectForm] = useState<null | { mode: 'create' } | { mode: 'edit'; project: any }>(null);
  const [keyDialog, setKeyDialog] = useState<null | { clientId: string; projectId?: string }>(null);
  const [revealedKey, setRevealedKey] = useState<null | {
    passkey: string; hint: string; expiresAt: string | null; message: string; label?: string;
    /** The full http address a temporary link opens (shown once). */
    url?: string; urlHint?: string;
  }>(null);
  const [publishFlow, setPublishFlow] = useState<null | { clientId: string; projectId?: string; document?: any; upload?: boolean }>(null);
  const [linkDialog, setLinkDialog] = useState<null | { clientId: string }>(null);
  const [previewClient, setPreviewClient] = useState<null | { client: any; projectId: string; room: any; projects: any[] }>(null);
  /** The received document whose signed copy is loading right now, if any. */
  const [openingReceivedId, setOpeningReceivedId] = useState<string | null>(null);

  /** Opens the signed copy PHANTOM received from a client, as an object URL. */
  const openReceivedCopy = async (document: any) => {
    setOpeningReceivedId(document.id);
    setError(null);
    try {
      const result = await clientAccessCenter.receivedCopy(document.id);
      window.open(result.url, '_blank', 'noopener');
      // The object URL must outlive the navigation (the new tab reads lazily).
      setTimeout(() => URL.revokeObjectURL(result.url), 60_000);
    } catch (failure: any) {
      setError(failure?.message || 'The signed copy could not be opened.');
    } finally {
      setOpeningReceivedId(null);
    }
  };

  const loadClients = useCallback(async (archived = includeArchived) => {
    setLoading(true);
    setError(null);
    try {
      const rows = await clientAccessCenter.clients({ archived });
      setClients(rows);
      setSelectedClientId((current) => current ?? rows[0]?.id ?? null);
    } catch (failure: any) {
      setError(failure?.message || 'The client list could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [includeArchived]);

  const loadClientWorkspace = useCallback(async (clientId: string) => {
    setBusy(true);
    setError(null);
    try {
      const [clientDetail, projectRows, keyRows, documentRows, linkRows, activityRows] = await Promise.all([
        clientAccessCenter.client(clientId),
        clientAccessCenter.projects(clientId),
        clientAccessCenter.keys(clientId),
        clientAccessCenter.documents(clientId),
        clientAccessCenter.links(clientId),
        clientAccessCenter.activity(clientId, 120),
      ]);
      setDetail(clientDetail);
      setProjects(projectRows);
      setKeys(keyRows);
      setDocuments(documentRows);
      setLinks(linkRows);
      setActivity(activityRows);
      setActivityFilters({ kind: null });
    } catch (failure: any) {
      setError(failure?.message || 'This client workspace could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, []);

  /**
   * The activity timeline, filtered by kind. Filtering happens on the server so
   * the counts describe the client's whole history rather than the page of rows
   * the browser happens to hold.
   */
  const loadActivity = useCallback(async (clientId: string, filters: { kind: string | null } = { kind: null }) => {
    setActivityLoading(true);
    try {
      setActivity(await clientAccessCenter.activity(clientId, 120, { kind: filters.kind }));
    } catch (failure: any) {
      setError(failure?.message || 'The client activity timeline could not be loaded.');
    } finally {
      setActivityLoading(false);
    }
  }, []);

  const changeActivityFilter = (kind: string | null) => {
    setActivityFilters({ kind });
    if (selectedClientId) void loadActivity(selectedClientId, { kind });
  };

  /**
   * The caller's own effective capabilities. Rendering follows this set so an
   * operator is not offered an action the server would refuse — but the server
   * remains the authority for every request (Phase 6, requirement 6).
   */
  const loadCapabilities = useCallback(async () => {
    try {
      setCapabilities(await clientAccessCenter.capabilities());
    } catch {
      // A member with no client capability still needs a usable page; the
      // empty set below simply hides every action.
      setCapabilities({ capabilities: [], legacy: [], mine: [] });
    }
  }, []);

  /** Reads just the portal switch, so the warning is right on every section. */
  const loadPortalSwitch = useCallback(async () => {
    try {
      const settings = await clientAccessCenter.portalSettings('portal');
      const entry = (settings || []).find((row: any) => row.key === 'client_portal_enabled');
      setClientAccessOn(entry ? Boolean(entry.value) : null);
    } catch {
      // Without the answer the panel stays quiet rather than guessing.
      setClientAccessOn(null);
    }
  }, []);

  const loadPermissionMatrix = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const [matrix, portalSwitch, notificationSwitches] = await Promise.all([
        clientAccessCenter.permissionMatrix(),
        clientAccessCenter.portalSettings().catch(() => []),
        // Phase 9: the optional notification switches live on the same route.
        clientAccessCenter.portalSettings('notifications').catch(() => []),
      ]);
      const settings = [...(portalSwitch || []), ...(notificationSwitches || [])];
      setCapabilities((current: any) => ({ ...current, ...matrix, mine: matrix.mine ?? current.mine }));
      setPortalSettings(settings || []);
    } catch (failure: any) {
      setError(failure?.message || 'Client permissions could not be loaded.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void loadCapabilities(); void loadClients(); void loadPortalSwitch(); }, [loadCapabilities, loadClients, loadPortalSwitch]);
  useEffect(() => { if (selectedClientId) void loadClientWorkspace(selectedClientId); }, [selectedClientId, loadClientWorkspace]);
  useEffect(() => { if (section === 'permissions') void loadPermissionMatrix(); }, [section, loadPermissionMatrix]);

  /**
   * Switches client access on from the warning itself, through the same settings
   * route the Permissions section uses — no second endpoint, no second switch.
   */
  const switchClientAccessOn = async () => {
    setBusy(true);
    setError(null);
    try {
      await clientAccessCenter.savePortalSettings([{ key: 'client_portal_enabled', value: true }]);
      setClientAccessOn(true);
      await loadPortalSwitch();
      onMessage('Client access is on. Links and access keys now open for your clients.');
    } catch (failure: any) {
      setError(failure?.message || 'Client access could not be switched on.');
    } finally {
      setBusy(false);
    }
  };

  /** Does the operator hold this capability? PHANTOM always does. */
  const can = (capability: string) => Boolean(capabilities.isPhantom || (capabilities.mine || []).includes(capability));

  /** Re-read the operator's own capabilities after a permission change. */
  const reloadMine = async () => { await loadCapabilities(); };

  const refresh = async (message: string) => {
    if (selectedClientId) await loadClientWorkspace(selectedClientId);
    await loadClients();
    onMessage(message);
  };

  /** PREVIEW AS CLIENT — renders the real room component against the client API shape. */
  const openPreview = async (client: any, projectId?: string) => {
    setBusy(true);
    setError(null);
    try {
      const data = await clientAccessCenter.preview(client.id, projectId);
      const activeProjectId = data.project?.id || data.room?.project?.id || null;
      setPreviewClient({ client: data.client, projectId: activeProjectId, room: data.room, projects: data.projects || [] });
    } catch (failure: any) {
      setError(failure?.message || 'The client preview could not be opened.');
    } finally {
      setBusy(false);
    }
  };

  const previewRoomContext = buildPreviewRoomContext(previewClient?.client, previewClient?.room);
  const previewTransport = previewClient && previewClient.projectId
    ? buildPreviewTransport(clientAccessCenter, previewClient.room, previewClient.client.id, previewClient.projectId)
    : null;

  if (previewClient && previewRoomContext && previewTransport) {
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700">Preview as client</p>
            <p className="text-sm font-bold text-emerald-900">{previewClient.client.name}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {previewClient.projects.length > 1 ? (
              <select
                value={previewClient.projectId || ''}
                onChange={(event) => void openPreview(previewClient.client, event.target.value)}
                className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-bold text-emerald-900"
              >
                {previewClient.projects.map((project: any) => (
                  <option key={project.id} value={project.id}>{project.name}{project.isArchived ? ' (archived)' : ''}</option>
                ))}
              </select>
            ) : null}
            <button onClick={() => setPreviewClient(null)} className="mini-button border border-emerald-300 !text-emerald-900">
              Exit preview
            </button>
          </div>
        </div>
        {previewClient.room.notice ? (
          <p className="mb-4 flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4" /> {previewClient.room.notice}
          </p>
        ) : null}
        <div className="overflow-hidden rounded-2xl border border-slate-200">
          <ClientProjectRoom
            context={previewRoomContext}
            transport={previewTransport}
            preview
            exitLabel="Exit preview"
            notice={null}
            onNotice={(message) => message && onMessage(message)}
            onSignedOut={() => setPreviewClient(null)}
            onSessionEnded={() => setPreviewClient(null)}
          />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">Client project portal</p>
          <h3 className="mt-1 text-2xl font-black text-slate-900">CLIENT ACCESS CENTER</h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            Clients, their projects, published documents, access keys and temporary links. Access is granted only
            through the credentials issued here, and every action is recorded against the client.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {can('clients.create') ? (
            <button onClick={() => setShowClientForm({ mode: 'create' })} className="mini-button mini-button--primary">
              <Plus className="h-4 w-4" /> Create client
            </button>
          ) : null}
          <button onClick={() => void loadClients(includeArchived)} disabled={busy} className="mini-button">
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Sub-navigation, in the same style as the PHANTOM side navigation. */}
      <div className="mt-5 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
        {SECTIONS.map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setSection(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-black uppercase tracking-[0.1em] transition ${
              section === id ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {error ? (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
        </p>
      ) : null}

      {!can('clients.view') ? (
        <p role="alert" className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-6 text-sm font-semibold text-amber-900">
          You do not have permission to view client records. PHANTOM can grant CLIENT_VIEW (or the granular
          capabilities you need) in the Permissions section of this workspace.
        </p>
      ) : null}

      {clientAccessOn === false ? (
        <div role="alert" className="mt-5 rounded-2xl border border-amber-300 bg-amber-50 px-5 py-5">
          <p className="flex items-center gap-2 text-sm font-black text-amber-900">
            <ShieldAlert className="h-4 w-4" /> Client access is switched off
          </p>
          <p className="mt-2 max-w-3xl text-xs font-semibold leading-6 text-amber-900">
            Every link and every access key you issue while this is off shows the client a short
            “closed” message — <strong className="font-black">“Client access is not open at the moment.”</strong>
            {' '}The addresses and keys are valid, the door is simply shut. Switch it on and the same
            address and key work immediately, with nothing to reissue.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {can('clients.settings.manage') ? (
              <button onClick={() => void switchClientAccessOn()} className="mini-button mini-button--primary" disabled={busy}>
                <ShieldCheck className="h-4 w-4" /> Switch client access on
              </button>
            ) : (
              <span className="text-xs font-bold text-amber-900">Ask PHANTOM to switch client access on.</span>
            )}
            <span className="text-[11px] font-semibold text-amber-800">
              The same switch lives in Permissions → Client portal settings.
            </span>
          </div>
        </div>
      ) : null}

      <div className="mt-5 grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* Client selector — present on every sub-tab, because everything is scoped to a client. */}
        <aside className="h-fit rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
          <div className="flex items-center justify-between px-2 pb-2">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Clients</p>
            <label className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">
              <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} className="rounded border-slate-300" />
              Archived
            </label>
          </div>
          {loading ? (
            <p className="flex items-center gap-2 px-2 py-6 text-xs font-bold text-slate-500"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading clients…</p>
          ) : clients.length ? (
            <div className="space-y-1">
              {clients.map((client) => (
                <button
                  key={client.id}
                  onClick={() => setSelectedClientId(client.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                    client.id === selectedClientId ? 'bg-white ring-1 ring-emerald-200' : 'hover:bg-white/70'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-slate-800">{client.name}</span>
                    <span className="block truncate text-[11px] font-semibold text-slate-500">
                      {client.projectCount} project{client.projectCount === 1 ? '' : 's'} · {client.publishedCount} published
                    </span>
                  </span>
                  <Pill tone={client.status}>{client.status}</Pill>
                </button>
              ))}
            </div>
          ) : (
            <p className="px-2 py-6 text-xs font-semibold text-slate-500">No clients yet. Create the first one to issue portal access.</p>
          )}
        </aside>

        <main className="min-w-0">
          {!detail ? (
            <p className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">
              Select a client to manage their projects, documents, access keys and links.
            </p>
          ) : (
            <>
              {section === 'clients' && (
                <ClientsPanel
                  client={detail} keyCount={keys.length} projectCount={projects.length}
                  can={can}
                  lastActivityAt={clients.find((entry) => entry.id === detail.id)?.lastActivityAt || null}
                  publishedCount={documents.filter((doc) => doc.lifecycle === 'published' && doc.clientVisible).length}
                  onEdit={() => setShowClientForm({ mode: 'edit', client: detail })}
                  onSuspend={() => void setStatus(clientAccessCenter.setClientStatus, detail.id, 'suspended', 'Client suspended and all access revoked.', refresh, setError)}
                  onReactivate={() => void setStatus(clientAccessCenter.setClientStatus, detail.id, 'active', 'Client reactivated. Existing keys stay revoked until regenerated.', refresh, setError)}
                  onArchive={() => void setStatus(clientAccessCenter.setClientStatus, detail.id, 'archived', 'Client archived and access closed.', refresh, setError)}
                  onRevokeAll={() => void revokeAll(detail, refresh, setError)}
                  onPreview={() => void openPreview(detail)}
                  onIssueKey={() => setKeyDialog({ clientId: detail.id })}
                  busy={busy}
                />
              )}

              {section === 'projects' && (
                <ProjectsPanel
                  can={can} client={detail} projects={projects} documents={documents} keys={keys}
                  onCreate={() => setShowProjectForm({ mode: 'create' })}
                  onEdit={(project: any) => setShowProjectForm({ mode: 'edit', project })}
                  onArchive={(project: any) => void setProjectArchived(project, true, refresh, setError)}
                  onRestore={(project: any) => void setProjectArchived(project, false, refresh, setError)}
                  onIssueKey={(project: any) => setKeyDialog({ clientId: detail.id, projectId: project.id })}
                  onDirectLink={(project: any) => void sendDirectLink(
                    { clientId: detail.id, projectId: project.id, destination: 'project', label: project.name },
                    refresh, onMessage, setError, setRevealedKey, setBusy,
                  )}
                  busy={busy}
                />
              )}

              {section === 'documents' && (
                <DocumentsPanel
                  can={can} client={detail} documents={documents} projects={projects}
                  onPrepare={(document: any) => void prepareStampedCopy(document, refresh, onMessage, setError)}
                  onUpload={() => setPublishFlow({ clientId: detail.id, projectId: projects[0]?.id, upload: true })}
                  onDirectLink={(document: any) => void sendDirectLink(
                    {
                      clientId: detail.id,
                      projectId: document.project?.id || projects[0]?.id,
                      documentId: document.id,
                      destination: 'document',
                      label: document.title,
                    },
                    refresh, onMessage, setError, setRevealedKey, setBusy,
                  )}
                  onPublish={() => setPublishFlow({ clientId: detail.id, projectId: projects[0]?.id })}
                  onLifecycle={(document: any, state: string) => void changeLifecycle(document, state, refresh, setError)}
                  onEdit={(document: any) => setPublishFlow({ clientId: detail.id, projectId: document.project?.id, document })}
                  onDelete={(document: any) => void deleteDocument(document, refresh, setError)}
                  onOpenReceived={(document: any) => void openReceivedCopy(document)}
                  openingReceivedId={openingReceivedId}
                  busy={busy}
                />
              )}

              {section === 'keys' && (
                <KeysPanel
                  can={can} client={detail} keys={keys}
                  onIssue={() => setKeyDialog({ clientId: detail.id })}
                  onRegenerated={(payload) => { setRevealedKey(payload); void refresh('A replacement key was generated. The previous key and its sessions no longer work.'); }}
                  onRevoked={(key: any) => void revokeKey(key, refresh, setError)}
                  busy={busy}
                />
              )}

              {section === 'links' && (
                <LinksPanel
                  can={can} client={detail} links={links}
                  onCreate={() => setLinkDialog({ clientId: detail.id })}
                  onRevoke={(link: any) => void revokeLink(link, refresh, setError)}
                  busy={busy}
                />
              )}

              {section === 'activity' && (
                <ActivityPanel
                  client={detail}
                  activity={activity}
                  loading={activityLoading}
                  filters={activityFilters}
                  onFilterChange={changeActivityFilter}
                />
              )}

              {section === 'permissions' && (
                <PermissionsPanel
                  data={capabilities} settings={portalSettings}
                  onSaved={async (message) => { await loadPermissionMatrix(); await reloadMine(); onMessage(message); }}
                  onSettingsSaved={async (message) => { await loadPermissionMatrix(); onMessage(message); }}
                  onError={(message) => { if (message) onMessage(message); }}
                />
              )}
            </>
          )}
        </main>
      </div>

      {/* ---------------- dialogs ---------------- */}

      {showClientForm && (
        <ClientFormDialog
          client={showClientForm.mode === 'edit' ? showClientForm.client : null}
          onClose={() => setShowClientForm(null)}
          onSaved={async (message, createdId) => {
            setShowClientForm(null);
            if (createdId) { setSelectedClientId(createdId); await loadClients(); onMessage(message); return; }
            await refresh(message);
          }}
        />
      )}

      {showProjectForm && detail && (
        <ProjectFormDialog
          clientId={detail.id}
          project={showProjectForm.mode === 'edit' ? showProjectForm.project : null}
          onClose={() => setShowProjectForm(null)}
          onSaved={async (message) => { setShowProjectForm(null); await refresh(message); }}
        />
      )}

      {keyDialog && detail && (
        <KeyDialog
          client={detail} projects={projects}
          presetProjectId={typeof keyDialog.projectId === 'string' ? keyDialog.projectId : undefined}
          onClose={() => setKeyDialog(null)}
          onIssued={(payload) => { setKeyDialog(null); setRevealedKey(payload); void refresh('A new access key was generated and is shown once.'); }}
        />
      )}

      {revealedKey && (
        <KeyRevealDialog payload={revealedKey} onClose={() => setRevealedKey(null)} />
      )}

      {publishFlow && detail && (
        <PublishDialog
          client={detail}
          projects={projects}
          existing={publishFlow.document}
          presetProjectId={publishFlow.projectId}
          startWithUpload={publishFlow.upload === true}
          onClose={() => setPublishFlow(null)}
          onSaved={async (message) => { setPublishFlow(null); await refresh(message); }}
        />
      )}

      {linkDialog && detail && (
        <LinkDialogHost
          client={detail} projects={projects} documents={documents}
          onClose={() => setLinkDialog(null)}
          onIssued={async (payload, message) => {
            const origin = typeof window === 'undefined' ? '' : window.location.origin;
            setRevealedKey({
              passkey: payload.token,
              hint: '',
              expiresAt: payload.expiresAt,
              message,
              label: payload.mode === 'DIRECT_ACCESS' ? 'Temporary link — direct access' : 'Temporary link — access key required',
              // The server's own address, and if a response ever arrives
              // without one, the same clean address built from the token.
              url: payload.url || linkAddressUrl(payload.token, origin) || absoluteLinkUrl(payload.path, origin),
              urlHint: linkShareHint(payload.mode, payload.destinationLabel, origin),
            });
            await refresh('A temporary link was created and is shown once.');
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-panels
// ---------------------------------------------------------------------------

const ClientsPanel = ({
  can, client, keyCount, projectCount, publishedCount, lastActivityAt, onEdit, onSuspend, onReactivate, onArchive, onRevokeAll, onPreview, onIssueKey, busy,
}: {
  can: (capability: string) => boolean;
  client: any; keyCount: number; projectCount: number; publishedCount: number; lastActivityAt: string | null;
  onEdit: () => void; onSuspend: () => void; onReactivate: () => void; onArchive: () => void;
  onRevokeAll: () => void; onPreview: () => void; onIssueKey: () => void; busy: boolean;
}) => (
  <div>
    <div className="rounded-2xl border border-slate-100 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-xl font-black text-slate-900">{client.name}</h4>
            <Pill tone={client.status}>{client.status}</Pill>
          </div>
          <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contact</dt><dd className="font-semibold text-slate-700">{client.contactName || '—'}</dd></div>
            <div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email</dt><dd className="break-all font-semibold text-slate-700">{client.contactEmail || '—'}</dd></div>
            <div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Phone</dt><dd className="font-semibold text-slate-700">{client.contactPhone || '—'}</dd></div>
            <div><dt className="text-[10px] font-black uppercase tracking-wider text-slate-400">Created</dt><dd className="font-semibold text-slate-700">{formatWhen(client.createdAt)}</dd></div>
          </dl>
          {client.notes ? <p className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-xs font-medium text-slate-600">Internal note: {client.notes}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {can('clients.keys.create') ? (
            <button onClick={onIssueKey} disabled={busy} className="mini-button mini-button--primary">
              <KeyRound className="h-4 w-4" /> Issue access key
            </button>
          ) : null}
          {can('clients.edit') ? <button onClick={onEdit} className="mini-button"><Pencil className="h-4 w-4" /> Edit</button> : null}
          {can('clients.preview') ? (
            <button onClick={onPreview} disabled={busy} className="mini-button !border-emerald-200 !bg-emerald-50 !text-emerald-800">
              <Eye className="h-4 w-4" /> Preview as client
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {[
          ['Projects', projectCount],
          ['Access keys', keyCount],
          ['Published', publishedCount],
        ].map(([label, value]) => (
          <div key={String(label)} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <p className="mt-1 text-2xl font-black text-slate-900">{value}</p>
          </div>
        ))}
        <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Last activity</p>
          <p className="mt-1 text-sm font-bold text-slate-800">{formatWhen(lastActivityAt)}</p>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
        {can('clients.suspend') ? (
          <button onClick={onSuspend} disabled={busy || client.status === 'suspended'} className="mini-button border border-amber-200 bg-amber-50 !text-amber-800">
            <ShieldAlert className="h-4 w-4" /> Suspend client access
          </button>
        ) : null}
        {can('clients.suspend') ? (
          <button onClick={onReactivate} disabled={busy || client.status === 'active'} className="mini-button border border-emerald-200 bg-emerald-50 !text-emerald-800">
            <CheckCircle2 className="h-4 w-4" /> Reactivate client
          </button>
        ) : null}
        {can('clients.archive') ? (
          <button onClick={onArchive} disabled={busy || client.status === 'archived'} className="mini-button border border-slate-200">
            <Archive className="h-4 w-4" /> Archive client
          </button>
        ) : null}
        {can('clients.suspend') ? (
          <button onClick={onRevokeAll} disabled={busy} className="mini-button border border-rose-200 bg-rose-50 !text-rose-700">
            <KeyRound className="h-4 w-4" /> Revoke all client access
          </button>
        ) : null}
      </div>
      <p className="mt-3 text-[11px] font-medium text-slate-500">
        Suspending or archiving a client revokes every access key, session and temporary link on the server immediately.
        Reactivating never restores a revoked key — issue a new one.
        {" "}Every action is refused server-side unless you hold the matching client permission.
      </p>
    </div>
  </div>
);

const ProjectsPanel = ({
  can, client, projects, documents, keys, onCreate, onEdit, onArchive, onRestore, onIssueKey, onDirectLink, busy,
}: {
  can: (capability: string) => boolean;
  client: any; projects: any[]; documents: any[]; keys: any[]; onCreate: () => void; onEdit: (project: any) => void;
  onArchive: (project: any) => void; onRestore: (project: any) => void; onIssueKey: (project: any) => void;
  /** Generates a link that opens this project room straight away, with no key. */
  onDirectLink: (project: any) => void; busy: boolean;
}) => (
  <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="text-lg font-black text-slate-900">Projects</h4>
        <p className="text-xs font-medium text-slate-500">Projects for {client.name}. Each project is bound to this client only.</p>
      </div>
      {can('clients.projects.create') ? (
        <button onClick={onCreate} className="mini-button mini-button--primary" disabled={busy}><Plus className="h-4 w-4" /> Create project</button>
      ) : null}
    </div>
    <div className="mt-4 space-y-3">
      {projects.length ? projects.map((project) => (
        <article key={project.id} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black text-slate-900">{project.name}</p>
                <Pill tone={project.isArchived ? 'archived' : project.status}>{project.isArchived ? 'archived' : project.status}</Pill>
              </div>
              <p className="mt-1 font-mono text-[11px] font-bold uppercase tracking-wider text-emerald-700">{project.reference}</p>
              {project.description ? <p className="mt-2 max-w-2xl text-xs font-medium text-slate-600">{project.description}</p> : null}
              <p className="mt-2 text-[11px] font-semibold text-slate-500">
                {documents.filter((document) => document.project?.id === project.id).length} document{documents.filter((document) => document.project?.id === project.id).length === 1 ? '' : 's'} · {keys.filter((key) => key.project?.id === project.id && key.status === 'active').length} active key{keys.filter((key) => key.project?.id === project.id && key.status === 'active').length === 1 ? '' : 's'} · updated {formatWhen(project.updatedAt)}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {can('clients.keys.create') && !project.isArchived ? (
                <button onClick={() => onIssueKey(project)} disabled={busy} className="mini-button"><KeyRound className="h-4 w-4" /> Issue access key</button>
              ) : null}
              {can('clients.links.create') ? (
                <button
                  onClick={() => onDirectLink(project)}
                  disabled={busy}
                  className="mini-button"
                  title={`Generate an address that opens ${project.name} straight away, without asking for a key`}
                >
                  <Link2 className="h-4 w-4" /> Direct link
                </button>
              ) : null}
              {can('clients.projects.edit') ? <button onClick={() => onEdit(project)} className="mini-button"><Pencil className="h-4 w-4" /> Edit</button> : null}
              {can('clients.projects.archive') ? (project.isArchived
                ? <button onClick={() => onRestore(project)} className="mini-button border border-emerald-200 bg-emerald-50 !text-emerald-800">Restore</button>
                : <button onClick={() => onArchive(project)} className="mini-button text-rose-600">Archive</button>) : null}
            </div>
          </div>
        </article>
      )) : <p className="rounded-2xl border border-slate-100 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">No projects yet. Create one to publish documents to this client.</p>}
    </div>
  </div>
);

const DocumentsPanel = ({
  can, client, documents, projects, onPublish, onUpload, onLifecycle, onEdit, onDelete, onPrepare, onDirectLink, busy,
  openingReceivedId, onOpenReceived,
}: {
  can: (capability: string) => boolean;
  client: any; documents: any[]; projects: any[]; onPublish: () => void;
  /** Phase 18 — publish a document straight from an uploaded file. */
  onUpload: () => void;
  onLifecycle: (document: any, state: string) => void; onEdit: (document: any) => void;
  onDelete: (document: any) => void;
  /** Renders (or refreshes) the stamped client copy on the server. */
  onPrepare: (document: any) => void;
  /** Generates a link that opens this document straight away, with no key. */
  onDirectLink: (document: any) => void;
  /** Opens the signed copy the client handed back (PHANTOM, received documents). */
  onOpenReceived: (document: any) => void;
  /** The received document whose signed copy is loading right now, if any. */
  openingReceivedId: string | null;
  busy: boolean;
}) => {
  const projectName = (document: any) => projects.find((project) => project.id === document.project?.id)?.name || '';

  /** The documents the client sent back, newest first, as the panel groups them. */
  const received = documents
    .filter((document) => Boolean(document.signature?.receivedAt))
    .sort((a: any, b: any) => String(b.signature.receivedAt).localeCompare(String(a.signature.receivedAt)));
  const otherDocuments = documents.filter((document) => !Boolean(document.signature?.receivedAt));
  const withdrawn = received.filter((document) => document.lifecycle !== 'published' || document.isArchived);
  const liveReceived = received.length - withdrawn.length;
  return (
  <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="text-lg font-black text-slate-900">Client documents</h4>
        <p className="text-xs font-medium text-slate-500">
          Only PUBLISHED documents reach the client. Internal Vault documents are never exposed automatically.
        </p>
      </div>
      {can('clients.documents.create') ? (
        <div className="flex flex-wrap gap-2">
          <button onClick={onUpload} className="mini-button mini-button--primary" disabled={busy || !projects.length}>
            <FileUp className="h-4 w-4" /> Upload a document
          </button>
          <button onClick={onPublish} className="mini-button" disabled={busy || !projects.length}>
            <Plus className="h-4 w-4" /> Publish to client
          </button>
        </div>
      ) : null}
    </div>

    {can('clients.documents.create') && projects.length ? (
      <button
        onClick={onUpload}
        disabled={busy}
        className="mt-4 flex w-full flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50"
      >
        <span className="flex items-center gap-3">
          <FileUp className="h-5 w-5 text-emerald-600" />
          <span>
            <span className="block text-sm font-black text-slate-800">Upload a document for {client.name}</span>
            <span className="block text-[11px] font-semibold text-slate-500">
              Pick the file, choose the Vault section that keeps the internal original, and the stamped client copy is rendered
              by the same pipeline — the client never receives the source file.
            </span>
          </span>
        </span>
        <span className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Upload &amp; stamp</span>
      </button>
    ) : null}

    {/* RECEIVED DOCUMENTS — the signed copies the client handed back. They stay
        grouped here even after the document leaves the client's room, because
        what PHANTOM received is a record, not a live publish. */}
    {received.length ? (
      <div className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-800">
            <FileCheck2 className="h-4 w-4" aria-hidden="true" /> Received documents
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] tracking-normal text-emerald-800">
              {liveReceived}
            </span>
          </p>
          {withdrawn.length ? (
            <p className="text-[10px] font-semibold text-slate-500">
              {withdrawn.length} held for reference — no longer published to the client.
            </p>
          ) : null}
        </div>
        <div className="mt-3 space-y-3">
          {received.map((document) => (
            <article key={document.id} className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-black text-slate-900">{document.title}</p>
                    <Pill tone={document.lifecycle}>{LIFECYCLE_LABELS[document.lifecycle] || document.lifecycle}</Pill>
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                    <span className="font-mono uppercase tracking-wider">{document.reference}</span>
                    <span>{projectName(document)}</span>
                    <span>v{document.signature?.version || document.version}</span>
                  </p>
                  <p className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-semibold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                    Signed by {document.signature?.signerName}
                    {document.signature?.signerTitle ? `, ${document.signature.signerTitle}` : ''}
                    {document.signature?.receivedAt ? (
                      <span className="text-slate-500">· received {formatWhen(document.signature.receivedAt)}</span>
                    ) : null}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => onOpenReceived(document)}
                    disabled={busy || openingReceivedId !== null}
                    className="mini-button mini-button--primary"
                    title={`Open the signed copy of ${document.title} the client handed back`}
                  >
                    {openingReceivedId === document.id
                      ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <FileText className="h-4 w-4" />} Open signed copy
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    ) : null}

    <div className="mt-6 space-y-3">
      {otherDocuments.length ? otherDocuments.map((document) => (
        <article key={document.id} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-black text-slate-900">{document.title}</p>
                <Pill tone={document.lifecycle}>{LIFECYCLE_LABELS[document.lifecycle] || document.lifecycle}</Pill>
                {document.clientVisible ? <Pill tone="published">client visible</Pill> : <Pill>not visible</Pill>}
              </div>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                <span className="font-mono uppercase tracking-wider">{document.reference}</span>
                <span>{CATEGORY_LABELS[document.category] || document.category}</span>
                <span>{projectName(document)}</span>
                <span>v{document.version}</span>
                <span>{document.vaultDocumentId ? `Vault snapshot${document.vaultVersion ? ` v${document.vaultVersion}` : ''}` : 'client copy'}</span>
              </p>
              <p className="mt-1 text-[11px] font-semibold text-slate-500">
                View {document.allowView ? 'allowed' : 'denied'} · Download {document.allowDownload ? 'allowed' : 'denied'}
                {document.publishedAt ? ` · published ${formatWhen(document.publishedAt)}` : ''}
              </p>
              {/* What the client answered in the review section. It is their
                  feedback to PHANTOM, shown where the document lives. */}
              {document.review ? (
                <div className="mt-2 rounded-xl border border-emerald-100 bg-emerald-50/60 px-3 py-2">
                  <p className="flex flex-wrap items-center gap-2 text-[11px] font-black uppercase tracking-[0.12em] text-emerald-800">
                    <Pill tone={reviewTone(document.review.decision)}>
                      {REVIEW_LABELS[document.review.decision] || document.review.decision}
                    </Pill>
                    Client review
                    {document.review.at ? <span className="font-bold normal-case tracking-normal text-emerald-700">{formatWhen(document.review.at)}</span> : null}
                  </p>
                  {document.review.comment ? (
                    <p className="mt-1.5 whitespace-pre-wrap text-xs font-medium leading-5 text-slate-700">{document.review.comment}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {can('clients.links.create') ? (
                <button
                  onClick={() => onDirectLink(document)}
                  className="mini-button border border-emerald-200 !bg-emerald-50 !text-emerald-800"
                  disabled={busy}
                  title={`Generate an address that opens ${document.title} straight away, without asking for a key`}
                >
                  <Link2 className="h-4 w-4" /> Direct link
                </button>
              ) : null}
              {can('clients.documents.edit') ? (
                <button onClick={() => onPrepare(document)} className="mini-button border border-emerald-200 !bg-emerald-50 !text-emerald-800" disabled={busy}>
                  <ShieldCheck className="h-4 w-4" /> {document.hasClientArtifact ? 'Refresh stamped copy' : 'Prepare stamped copy'}
                </button>
              ) : null}
              {can('clients.documents.edit') ? <button onClick={() => onEdit(document)} className="mini-button"><Pencil className="h-4 w-4" /> Edit</button> : null}
              {can('clients.documents.delete') ? (
                <button onClick={() => onDelete(document)} className="mini-button text-rose-600" disabled={busy}>Delete</button>
              ) : null}
              <select
                value={document.lifecycle}
                onChange={(event) => onLifecycle(document, event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2.5 py-2 text-[11px] font-black uppercase tracking-wider text-slate-700"
                aria-label={`Lifecycle for ${document.title}`}
                disabled={!can('clients.documents.publish') && !can('clients.documents.unpublish')}
              >
                {LIFECYCLE_ALL.filter((state) => {
                  const publishing = !['unpublished', 'archived'].includes(state);
                  return can(publishing ? 'clients.documents.publish' : 'clients.documents.unpublish');
                }).map((state) => (
                  <option key={state} value={state}>{LIFECYCLE_LABELS[state] || state}</option>
                ))}
              </select>
            </div>
          </div>
        </article>
      )) : (
        <p className="rounded-2xl border border-slate-100 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">
          {documents.length ? 'All of this client\u2019s documents are in Received documents.' : `Nothing has been published to ${client.name} yet.`}
        </p>
      )}
    </div>
  </div>
  );
};

const KeysPanel = ({
  can, client, keys, onIssue, onRegenerated, onRevoked, busy,
}: {
  can: (capability: string) => boolean;
  client: any; keys: any[]; onIssue: () => void;
  onRegenerated: (payload: { passkey: string; hint: string; expiresAt: string | null; message: string; label?: string }) => void;
  onRevoked: (key: any) => void; busy: boolean;
}) => {
  const [hideRevoked, setHideRevoked] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedSignIn, setCopiedSignIn] = useState(false);
  const visible = hideRevoked ? keys.filter((key) => key.status !== 'revoked') : keys;
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const signInUrl = clientSignInUrl(origin);
  const copySignIn = async () => {
    try {
      await navigator.clipboard.writeText(signInUrl);
      setCopiedSignIn(true);
      setTimeout(() => setCopiedSignIn(false), 2500);
    } catch {
      setCopiedSignIn(false);
    }
  };

  const regenerate = async (key: any) => {
    setError(null);
    setWorkingId(key.id);
    try {
      const result = await clientAccessCenter.regenerateKey(key.id);
      onRegenerated({
        passkey: result.data.passkey,
        hint: result.data.hint,
        expiresAt: null,
        message: result.message,
        label: key.label || undefined,
      });
    } catch (failure: any) {
      setError(failure?.message || 'A replacement key could not be generated.');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-lg font-black text-slate-900">Access keys</h4>
          <p className="text-xs font-medium text-slate-500">
            Keys open {client.name}&apos;s project room from the sign-in page. A key is shown once when it is generated and is
            never stored in readable form, so it can never be listed or recovered here.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {keys.length ? (
            <button onClick={() => setHideRevoked((value) => !value)} className="mini-button">
              {hideRevoked ? 'Show revoked' : 'Hide revoked'}
            </button>
          ) : null}
          {can('clients.keys.create') ? (
            <button onClick={onIssue} className="mini-button mini-button--primary" disabled={busy}>
              <KeyRound className="h-4 w-4" /> Issue access key
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-100 bg-slate-50 p-4">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Send this with the key</p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            readOnly
            value={signInUrl}
            aria-label="Client sign-in address"
            onFocus={(event) => event.currentTarget.select()}
            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
          />
          <button onClick={() => void copySignIn()} className="mini-button" disabled={!signInUrl}>
            {copiedSignIn ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copiedSignIn ? 'Copied' : 'Copy'}
          </button>
          <a href={signInUrl || '/'} target="_blank" rel="noreferrer" className="mini-button"><Link2 className="h-4 w-4" /> Open</a>
        </div>
        <p className="mt-2 text-[11px] font-medium text-slate-600">
          The client opens this address and enters their access key. The key is never part of the address, so the link stays safe
          to resend.
        </p>
      </div>

      {error ? <p role="alert" className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}

      <div className="mt-4 space-y-3">
        {visible.length ? visible.map((key) => (
          <article key={key.id} className="rounded-2xl border border-slate-100 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-mono text-sm font-black tracking-wider text-slate-900">{key.hint || 'key'}</p>
                  <Pill tone={key.status === 'active' ? 'active' : 'revoked'}>{key.status}</Pill>
                  {key.project ? <Pill>{key.project.name}</Pill> : <Pill>no project pin</Pill>}
                </div>
                <p className="mt-1 text-[11px] font-semibold text-slate-500">
                  {key.label ? `${key.label} · ` : ''}Issued {formatWhen(key.createdAt)}
                  {' · '}{key.lastUsedAt ? `last used ${formatWhen(key.lastUsedAt)}` : 'never used'}
                  {key.expiresAt ? ` · expires ${formatWhen(key.expiresAt)}` : ' · no expiry'}
                  {key.revokedAt ? ` · revoked ${formatWhen(key.revokedAt)}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {can('clients.keys.regenerate') ? (
                  <button onClick={() => void regenerate(key)} disabled={workingId === key.id} className="mini-button" title="Replace this key with a new one">
                    {workingId === key.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Regenerate
                  </button>
                ) : null}
                {can('clients.keys.revoke') && key.status === 'active' ? (
                  <button onClick={() => onRevoked(key)} disabled={workingId === key.id} className="mini-button border border-rose-200 bg-rose-50 !text-rose-700">
                    Revoke
                  </button>
                ) : null}
              </div>
            </div>
          </article>
        )) : (
          <p className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">
            {keys.length
              ? 'Every key for this client has been revoked. Issue a new one to let them back in.'
              : 'No access key has been issued yet. Issue one and hand it to the client — it opens only their project room.'}
          </p>
        )}
      </div>
    </div>
  );
};

const LinksPanel = ({
  can, client, links, onCreate, onRevoke, busy,
}: {
  can: (capability: string) => boolean;
  client: any; links: any[];
  onCreate: () => void; onRevoke: (link: any) => void; busy: boolean;
}) => (
  <div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h4 className="text-lg font-black text-slate-900">Temporary project links</h4>
        <p className="text-xs font-medium text-slate-500">
          Each link opens one destination, for a limited time. Tokens are hashed on the server and shown once, so each link is
          generated as a full http address you can send as-is: a direct-access link opens the destination immediately, a passkey
          link asks for the client&apos;s access key first. A lost link is replaced, not recovered.
        </p>
      </div>
      {can('clients.links.create') ? (
        <button onClick={onCreate} className="mini-button mini-button--primary" disabled={busy}><Link2 className="h-4 w-4" /> Create temporary link</button>
      ) : null}
    </div>
    <div className="mt-4 space-y-3">
      {links.length ? links.map((link) => (
        <article key={link.id} className="rounded-2xl border border-slate-100 bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold text-slate-900">{link.project?.name || 'Project'}</p>
                <Pill tone={link.status}>{link.status}</Pill>
                <Pill>{linkDestinationLabel(link.destination)}</Pill>
                <Pill tone={link.mode === 'DIRECT_ACCESS' ? 'suspended' : 'active'}>
                  {link.mode === 'DIRECT_ACCESS' ? 'Direct access' : 'Passkey required'}
                </Pill>
              </div>
              {link.document ? (
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {link.document.title} · <span className="font-mono">{link.document.reference}</span>
                  {link.intent === 'file' ? <span className="ml-2 font-bold text-emerald-700">file only</span> : null}
                </p>
              ) : null}
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-semibold text-slate-500">
                <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> expires {formatWhen(link.expiresAt)}</span>
                <span>{linkUsesLabel(link)}</span>
                <span>{linkPermissionSummary(link).label}</span>
                {link.intent === 'file' && link.hasClientArtifact === false ? (
                  <span className="font-bold text-amber-700">no client file yet</span>
                ) : null}
              </p>
            </div>
            {link.status === 'active' && can('clients.links.revoke') ? (
              <button onClick={() => onRevoke(link)} className="mini-button text-rose-600" disabled={busy}>Revoke</button>
            ) : <Pill>{link.status === 'active' ? 'active' : 'inactive'}</Pill>}
          </div>
        </article>
      )) : <p className="rounded-2xl border border-slate-100 bg-white px-5 py-8 text-center text-sm font-semibold text-slate-500">No temporary links have been issued for {client.name}.</p>}
    </div>
  </div>
);

/** One recorded entry, with only display-safe details. */
const ACTIVITY_DETAIL_KEYS: Array<[string, string]> = [
  ['reference', 'Reference'],
  ['title', 'Document'],
  ['section', 'Section'],
  ['destination', 'Destination'],
  ['reason', 'Reason'],
  ['state', 'State'],
  ['sessionsRevoked', 'Sessions revoked'],
  ['mode', 'Link mode'],
];

const activityKindTone = (kind: string) => {
  if (kind === 'security') return 'bg-rose-50 text-rose-700 ring-rose-100';
  if (kind === 'link') return 'bg-sky-50 text-sky-700 ring-sky-100';
  if (kind === 'document') return 'bg-emerald-50 text-emerald-700 ring-emerald-100';
  if (kind === 'auth') return 'bg-indigo-50 text-indigo-700 ring-indigo-100';
  return 'bg-slate-100 text-slate-600 ring-slate-200';
};

const activityWhen = (value?: string | null) => {
  const formatted = formatWhen(value);
  if (formatted === '—') return formatted;
  const text = String(value || '');
  const parsed = new Date(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return formatted;
  const minutes = Math.round((Date.now() - parsed.getTime()) / 60_000);
  if (minutes < 1) return `${formatted} · just now`;
  if (minutes < 60) return `${formatted} · ${minutes}m ago`;
  if (minutes < 60 * 24 * 2) return `${formatted} · ${Math.round(minutes / 60)}h ago`;
  return formatted;
};

/**
 * The client activity timeline.
 *
 * The rows are the platform's existing audit entries, presented: what happened,
 * when, through which credential, on which project, and — where the entry names
 * one — which document. The stored details are shown through an allow-list, so a
 * passkey, a session token, a link token or an internal storage key can never be
 * rendered here even if a future recorder wrote one into the log.
 */
export const ActivityPanel = ({
  client, activity, loading, filters, onFilterChange,
}: {
  client: any;
  activity: { entries: any[]; meta: any };
  loading: boolean;
  filters: { kind: string | null };
  onFilterChange: (kind: string | null) => void;
}) => {
  const entries = activity?.entries || [];
  const counts = activity?.meta?.counts || { all: entries.length };
  const kindLabels: Record<string, string> = activity?.meta?.labels?.kinds || {};
  const kindLabel = (kind?: string | null) => (kind ? kindLabels[kind] || String(kind) : 'Activity');
  const activityAccessLabel = (method?: { label?: string } | null) => method?.label || 'Unknown method';
  const kinds: string[] = activity?.meta?.kinds?.length
    ? activity.meta.kinds
    : ['project', 'document', 'link', 'auth', 'navigation', 'security'];
  const chips: Array<{ id: string | null; label: string; count: number }> = [
    { id: null, label: 'All activity', count: Number(counts.all || 0) },
    ...kinds.map((kind) => ({ id: kind, label: kindLabel(kind), count: Number(counts[kind] || 0) })),
  ];
  return (
    <div>
      <h4 className="text-lg font-black text-slate-900">Client activity</h4>
      <p className="text-xs font-medium text-slate-500">
        Recorded in the existing audit log against {client.name}. Each entry shows who acted, how access was granted and
        what it touched — credentials are never written to the log and never shown here.
      </p>

      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Filter client activity">
        {chips.map((chip) => {
          const active = filters.kind === chip.id;
          return (
            <button
              key={chip.id || 'all'}
              type="button"
              aria-pressed={active}
              onClick={() => onFilterChange(chip.id)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.12em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-200 ${
                active
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-700'
              }`}
            >
              {chip.label}
              <span className="rounded-full bg-white/70 px-1.5 text-[10px] font-bold text-slate-500">{chip.count}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-2xl border border-slate-100 bg-white" aria-live="polite">
        {loading ? (
          <div className="divide-y divide-slate-100">
            {[0, 1, 2, 3].map((row) => (
              <div key={row} className="flex items-center justify-between gap-3 px-4 py-4">
                <div className="flex-1 space-y-2">
                  <div className="h-3 w-40 animate-pulse rounded bg-slate-100" />
                  <div className="h-3 w-64 animate-pulse rounded bg-slate-100" />
                </div>
                <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
              </div>
            ))}
          </div>
        ) : entries.length ? (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => {
              const details = ACTIVITY_DETAIL_KEYS
                .map(([key, label]) => (entry.details?.[key] === undefined || entry.details?.[key] === ''
                  ? null
                  : { label, value: String(entry.details[key]) }))
                .filter(Boolean) as Array<{ label: string; value: string }>;
              return (
                <li key={entry.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.12em] ring-1 ${activityKindTone(entry.kind)}`}>
                        {kindLabel(entry.kind)}
                      </span>
                      <p className="text-sm font-bold text-slate-800">{entry.label || entry.event}</p>
                    </div>
                    <p className="mt-1 text-[11px] font-semibold text-slate-500">
                      {entry.actor?.name ? `${entry.actor.name} · ` : ''}
                      {entry.accessMethod?.label || activityAccessLabel(entry.accessMethod)}
                      {entry.project?.name ? ` · ${entry.project.name}` : ''}
                      {entry.project?.reference ? ` (${entry.project.reference})` : ''}
                      {entry.document ? ` · ${entry.document.reference || entry.document.title}` : ''}
                    </p>
                    {details.length ? (
                      <p className="mt-1 text-[11px] font-medium text-slate-500">
                        {details.map((detail) => `${detail.label}: ${detail.value}`).join(' · ')}
                      </p>
                    ) : null}
                  </div>
                  <span className="whitespace-nowrap text-[11px] font-semibold text-slate-500">{activityWhen(entry.at)}</span>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="px-5 py-10 text-center">
            <Clock className="mx-auto h-6 w-6 text-slate-500" />
            <p className="mt-3 text-sm font-bold text-slate-700">
              {filters.kind ? `No ${String(kindLabel(filters.kind)).toLowerCase()} activity recorded for this client.` : 'No client activity recorded yet.'}
            </p>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {filters.kind
                ? 'Clear the filter to see the full timeline.'
                : 'Sign-ins, project visits, document reads, temporary links and security changes appear here as they happen.'}
            </p>
            {filters.kind ? (
              <button type="button" onClick={() => onFilterChange(null)} className="mini-button mt-4">
                Show all activity
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * The client permission matrix.
 *
 * Reads the capabilities, the members and the recorded changes from the server;
 * writes go through the same server route, which enforces the non-escalation
 * rule and records WHO / WHAT / WHEN / TARGET / OLD / NEW in the existing audit
 * log. Toggling here only expresses an intent — the server decides.
 */
const PermissionsPanel = ({
  data, settings, onSaved, onSettingsSaved, onError,
}: {
  data: any; settings: any[];
  onSaved: (message: string) => void | Promise<void>;
  onSettingsSaved: (message: string) => void | Promise<void>;
  onError: (message: string | null) => void;
}) => {
  void onError;
  const capabilities: any[] = data.capabilities || [];
  const members: any[] = data.members || [];
  const changes: any[] = data.recentChanges || [];
  const mine: string[] = data.mine || [];
  const isPhantom = Boolean(data.isPhantom);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState<Record<string, boolean>>({});
  const [savingSettings, setSavingSettings] = useState(false);

  const selected = members.find((member: any) => member.id === selectedId) || null;
  const groups = Array.from(new Set(capabilities.map((entry: any) => entry.group)));
  const mayGrantAll = isPhantom;

  useEffect(() => {
    setDraft(selected ? [...(selected.permissions || [])] : []);
  }, [selectedId, JSON.stringify(selected?.permissions || [])]);

  useEffect(() => {
    setSettingsDraft(Object.fromEntries((settings || []).map((entry: any) => [entry.key, Boolean(entry.value)])));
  }, [JSON.stringify(settings || [])]);

  const dirty = selected
    ? JSON.stringify([...draft].sort()) !== JSON.stringify([...(selected.permissions || [])].sort())
    : false;

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await clientAccessCenter.setMemberPermissions(selected.id, draft);
      const added = result.data?.added || [];
      const removed = result.data?.removed || [];
      setNotice(added.length || removed.length
        ? `${selected.name}: granted ${added.length}, removed ${removed.length}. Recorded in the audit log.`
        : `${selected.name} already had exactly those client permissions.`);
      await onSaved(result.message || 'Client permissions updated.');
    } catch (failure: any) {
      setNotice(failure?.message || 'Those permissions could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const saveSettings = async (groupId?: string) => {
    setSavingSettings(true);
    setNotice(null);
    try {
      const payload = (settings || [])
        .filter((entry: any) => !groupId || (entry.group || 'portal') === groupId)
        .map((entry: any) => ({ key: entry.key, value: Boolean(settingsDraft[entry.key]) }));
      const result = await clientAccessCenter.savePortalSettings(payload);
      setNotice(result.message || 'Portal settings saved.');
      await onSettingsSaved(result.message || 'Client portal settings saved.');
    } catch (failure: any) {
      setNotice(failure?.message || 'Those settings could not be saved.');
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <div>
      <h4 className="text-lg font-black text-slate-900">Client permissions</h4>
      <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-500">
        PHANTOM has full control of the client portal. A founding identity — NEXUS, GHOST, FALCON, QUANTUM, MATRIX —
        grants nothing on its own: every capability below must be granted explicitly, and the server refuses every
        client-portal action without it. {isPhantom
          ? 'As PHANTOM you may grant or remove any client capability.'
          : 'You may only manage client capabilities you hold yourself, and never your own account.'}
      </p>

      {notice ? <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{notice}</p> : null}

      <div className="mt-5 grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="h-fit rounded-2xl border border-slate-100 bg-slate-50/60 p-3">
          <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Members</p>
          <div className="space-y-1">
            {members.map((member: any) => (
              <button
                key={member.id}
                onClick={() => setSelectedId(member.id)}
                className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${member.id === selectedId ? 'bg-white ring-1 ring-emerald-200' : 'hover:bg-white/70'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-800">{member.name}</span>
                  <span className="block truncate text-[11px] font-semibold text-slate-500">
                    {member.memberCode || '—'} · {(member.permissions || []).length} client permission{(member.permissions || []).length === 1 ? '' : 's'}
                  </span>
                </span>
                <Pill tone={member.status}>{member.status}</Pill>
              </button>
            ))}
            {!members.length ? <p className="px-2 py-6 text-xs font-semibold text-slate-500">No members yet.</p> : null}
          </div>
        </aside>

        <div className="min-w-0">
          {!selected ? (
            <p className="rounded-2xl border border-slate-100 bg-white px-5 py-10 text-center text-sm font-semibold text-slate-500">
              Select a member to see and change their client permissions.
            </p>
          ) : (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-100 bg-white p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-black text-slate-900">{selected.name}</p>
                    <p className="text-[11px] font-semibold text-slate-500">
                      {selected.memberCode || '—'} · {selected.responsibility || 'member'} · status {selected.status}
                      {selected.codenamePath && selected.codenamePath !== 'member' ? ` · ${String(selected.codenamePath).replace(/_/g, ' ')}` : ''}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => setDraft([])} className="mini-button" disabled={saving || !draft.length}>Remove all</button>
                    <button onClick={save} className="mini-button mini-button--primary" disabled={saving || !dirty}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                      {dirty ? 'Save permissions' : 'Saved'}
                    </button>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
                  {groups.map((group) => (
                    <div key={group}>
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{group}</p>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        {capabilities.filter((entry: any) => entry.group === group).map((entry: any) => {
                          const granted = draft.includes(entry.key);
                          const heldByMe = mayGrantAll || mine.includes(entry.key);
                          return (
                            <label
                              key={entry.key}
                              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition ${
                                granted ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white hover:bg-slate-50'
                              } ${heldByMe ? '' : 'opacity-60'}`}
                              title={heldByMe ? entry.description : 'You do not hold this capability, so you cannot grant or remove it.'}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5 rounded border-slate-300"
                                checked={granted}
                                disabled={!heldByMe || saving}
                                onChange={(event) => setDraft((current) => event.target.checked
                                  ? Array.from(new Set([...current, entry.key]))
                                  : current.filter((key) => key !== entry.key))}
                              />
                              <span className="min-w-0">
                                <span className="block text-xs font-black uppercase tracking-wider text-slate-800">{entry.brief}</span>
                                <span className="block text-[11px] font-semibold text-slate-500">{entry.label} · <span className="font-mono">{entry.key}</span></span>
                                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{entry.description}</span>
                                {!heldByMe ? <span className="mt-0.5 block text-[11px] font-bold text-amber-700">Not held by you — cannot be granted.</span> : null}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {[
                {
                  id: 'portal',
                  title: 'Client portal settings',
                  blurb: 'The three switches the client routes already check. PHANTOM can also change them in Settings.',
                },
                {
                  id: 'notifications',
                  title: 'Client notifications (optional)',
                  blurb: 'Off by default. When enabled, publishing tells the people who manage client content in the platform\'s own notification inbox, and emails the client\'s contact address through the existing EmailJS transaction. A notification never blocks or delays a publish.',
                },
              ].map((group) => (
                <div key={group.id} className="rounded-2xl border border-slate-100 bg-white p-4">
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{group.title}</p>
                  <p className="mt-1 text-xs font-medium text-slate-500">{group.blurb}</p>
                  <div className="mt-3 space-y-2">
                    {(settings || []).filter((entry: any) => (entry.group || 'portal') === group.id).map((entry: any) => (
                      <label key={entry.key} className="flex items-start gap-2.5 rounded-xl border border-slate-100 px-3.5 py-2.5">
                        <input
                          type="checkbox"
                          className="mt-0.5 rounded border-slate-300"
                          checked={Boolean(settingsDraft[entry.key])}
                          disabled={savingSettings}
                          onChange={(event) => setSettingsDraft((current) => ({ ...current, [entry.key]: event.target.checked }))}
                        />
                        <span className="min-w-0">
                          <span className="block text-[12px] font-bold text-slate-700">{entry.label || entry.key}</span>
                          <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-400">{entry.key}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-3 flex justify-end">
                    <button onClick={() => saveSettings(group.id)} disabled={savingSettings} className="mini-button mini-button--primary">
                      {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {group.id === 'portal' ? 'Save portal settings' : 'Save notification settings'}
                    </button>
                  </div>
                </div>
              ))}
              {notice ? <p className="text-xs font-semibold text-emerald-700">{notice}</p> : null}
            </div>
          )}
        </div>
      </div>

      <div className="mt-6">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Recent permission changes</p>
        <div className="mt-3 overflow-hidden rounded-2xl border border-slate-100 bg-white">
          {changes.length ? (
            <ul className="divide-y divide-slate-100">
              {changes.map((entry: any) => (
                <li key={entry.id} className="px-4 py-3">
                  <p className="text-sm font-bold text-slate-800">
                    {entry.actor}{entry.actorMemberCode ? ` · ${entry.actorMemberCode}` : ''} → {entry.target || 'member'}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">{formatWhen(entry.at)}</p>
                  {entry.added?.length || entry.removed?.length ? (
                    <p className="mt-1 text-[11px] font-medium text-slate-600">
                      {entry.added?.length ? <span className="text-emerald-700">granted: {entry.added.join(', ')}</span> : null}
                      {entry.added?.length && entry.removed?.length ? ' · ' : null}
                      {entry.removed?.length ? <span className="text-rose-700">removed: {entry.removed.join(', ')}</span> : null}
                    </p>
                  ) : null}
                  {entry.previousValue || entry.newValue ? (
                    <details className="mt-1">
                      <summary className="cursor-pointer text-[11px] font-bold text-slate-500">Old and new values</summary>
                      <p className="mt-1 break-words font-mono text-[10px] font-semibold text-slate-500">
                        old: {JSON.stringify(entry.previousValue)}<br />new: {JSON.stringify(entry.newValue)}
                      </p>
                    </details>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-8 text-center text-sm font-semibold text-slate-500">No permission changes recorded yet.</p>}
        </div>
      </div>

      <p className="mt-4 text-[11px] font-medium text-slate-500">
        The four Phase 5 umbrella keys (<span className="font-mono">clients.manage</span>, <span className="font-mono">clients.publish</span>,
        {' '}<span className="font-mono">clients.links</span>, <span className="font-mono">clients.preview</span>) still work exactly as granted:
        each one resolves to the granular capabilities it always meant, so no existing grant changed meaning.
      </p>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Dialogs
// ---------------------------------------------------------------------------

const ClientFormDialog = ({
  client, onClose, onSaved,
}: { client: any | null; onClose: () => void; onSaved: (message: string, createdId?: string) => void | Promise<void> }) => {
  const [name, setName] = useState(client?.name || '');
  const [contactName, setContactName] = useState(client?.contactName || '');
  const [contactEmail, setContactEmail] = useState(client?.contactEmail || '');
  const [contactPhone, setContactPhone] = useState(client?.contactPhone || '');
  const [notes, setNotes] = useState(client?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) { setError('An organisation or company name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        name: name.trim(), contactName: contactName.trim(), contactEmail: contactEmail.trim(),
        contactPhone: contactPhone.trim(), notes: notes.trim(),
      };
      if (client) {
        await clientAccessCenter.updateClient(client.id, payload);
        await onSaved('Client updated.');
      } else {
        const result = await clientAccessCenter.createClient(payload);
        await onSaved('Client created. Issue an access key to give them access.', result.data.id);
      }
    } catch (failure: any) {
      setError(failure?.message || 'This client could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title={client ? 'Edit client' : 'Create client'}
      subtitle={client ? client.name : 'Internal notes are never shown to the client.'}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Organisation or company name">
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ashanti Pharmacy Ltd" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Contact name">
            <input className={inputClass} value={contactName} onChange={(event) => setContactName(event.target.value)} />
          </Field>
          <Field label="Contact email">
            <input className={inputClass} value={contactEmail} onChange={(event) => setContactEmail(event.target.value)} />
          </Field>
        </div>
        <Field label="Contact phone">
          <input className={inputClass} value={contactPhone} onChange={(event) => setContactPhone(event.target.value)} />
        </Field>
        <Field label="Internal note" hint="Visible to PHANTOM only. It is never sent to the client.">
          <textarea className={`${inputClass} min-h-24`} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="mini-button">Cancel</button>
          <button onClick={submit} disabled={saving} className="mini-button mini-button--primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {client ? 'Save client' : 'Create client'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const ProjectFormDialog = ({
  clientId, project, onClose, onSaved,
}: { clientId: string; project: any | null; onClose: () => void; onSaved: (message: string) => void | Promise<void> }) => {
  const [name, setName] = useState(project?.name || '');
  const [description, setDescription] = useState(project?.description || '');
  const [status, setStatus] = useState(project?.status || 'active');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (name.trim().length < 2) { setError('A project name is required.'); return; }
    setSaving(true);
    setError(null);
    try {
      if (project) {
        await clientAccessCenter.updateProject(project.id, { name: name.trim(), description: description.trim(), status });
        await onSaved('Project updated.');
      } else {
        const result = await clientAccessCenter.createProject(clientId, { name: name.trim(), description: description.trim() });
        await onSaved(`Project created as ${result.data.reference}.`);
      }
    } catch (failure: any) {
      setError(failure?.message || 'This project could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog title={project ? 'Edit project' : 'Create project'} subtitle={project?.reference} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Project name">
          <input className={inputClass} value={name} onChange={(event) => setName(event.target.value)} />
        </Field>
        <Field label="Client-facing description" hint="Shown on the client's Project Overview. Never put internal notes here.">
          <textarea className={`${inputClass} min-h-24`} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {project ? (
          <Field label="Status">
            <select className={inputClass} value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="active">Active</option>
              <option value="suspended">On hold</option>
              <option value="archived">Archived</option>
            </select>
          </Field>
        ) : null}
        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="mini-button">Cancel</button>
          <button onClick={submit} disabled={saving} className="mini-button mini-button--primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} {project ? 'Save project' : 'Create project'}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

const KeyDialog = ({
  client, projects, presetProjectId, onClose, onIssued,
}: {
  client: any; projects: any[]; presetProjectId?: string;
  onClose: () => void; onIssued: (payload: { passkey: string; hint: string; expiresAt: string | null; message: string }) => void;
}) => {
  const [projectId, setProjectId] = useState(presetProjectId || projects.find((project) => !project.isArchived)?.id || '');
  const [label, setLabel] = useState('');
  const [expiry, setExpiry] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await clientAccessCenter.createKey(client.id, {
        projectId: projectId || undefined,
        label: label.trim() || undefined,
        expiresAt: expiry ? new Date(expiry).toISOString() : undefined,
      });
      onIssued({ passkey: result.data.passkey, hint: result.data.hint, expiresAt: result.data.expiresAt, message: result.message });
    } catch (failure: any) {
      setError(failure?.message || 'An access key could not be generated.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Generate access key"
      subtitle={`For ${client.name}. The key is shown once and never stored in readable form.`}
      onClose={onClose}
    >
      <div className="space-y-4">
        <Field label="Project" hint="A key with no project pin works only while the client has exactly one active project — otherwise sign-in is refused rather than guessed.">
          <select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">No project pin (single-project clients only)</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}{project.isArchived ? ' (archived)' : ''}</option>
            ))}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Label" hint="Who is this key for?">
            <input className={inputClass} value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Ama Boateng" />
          </Field>
          <Field label="Expires" hint="Optional. Leave blank for no expiry.">
            <input type="datetime-local" className={inputClass} value={expiry} onChange={(event) => setExpiry(event.target.value)} />
          </Field>
        </div>
        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="mini-button">Cancel</button>
          <button onClick={submit} disabled={saving} className="mini-button mini-button--primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Generate key
          </button>
        </div>
      </div>
    </Dialog>
  );
};

/**
 * The one "shown once" dialog. For an access key the credential is the value
 * itself; for a temporary link it is the address the client opens, so the
 * address is what is shown and copied — with the raw token kept beside it for
 * an operator who needs only that part.
 */
export const KeyRevealDialog = ({
  payload, onClose,
}: {
  payload: {
    passkey: string; hint: string; expiresAt: string | null; message: string; label?: string;
    /** Phase 18 follow-up: the full http address a temporary link opens. */
    url?: string; urlHint?: string;
  };
  onClose: () => void;
}) => {
  const [copied, setCopied] = useState<'url' | 'token' | 'signin' | null>(null);
  const urlField = useRef<HTMLInputElement>(null);
  const copy = async (value: string, which: 'url' | 'token' | 'signin') => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2500);
    } catch {
      setCopied(null);
    }
  };
  const isLink = Boolean(payload.url);
  // A key is useless without the address it is used on, so every key reveal
  // carries the sign-in link too — with no credential in it.
  const signInUrl = clientSignInUrl(typeof window === 'undefined' ? '' : window.location.origin);

  return (
    <Dialog
      title="Copy this now"
      subtitle={isLink
        ? 'This link is shown once. Deliver it securely; it cannot be retrieved — only replaced.'
        : 'This value is shown once. Close this window and it cannot be retrieved — only regenerated.'}
      onClose={onClose}
    >
      <div className="space-y-4">
        {isLink ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{payload.label || 'Temporary link'}</p>
            <input
              ref={urlField}
              readOnly
              value={payload.url}
              aria-label="The link to send"
              onFocus={() => urlField.current?.select()}
              className="mt-2 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 font-mono text-xs font-bold text-emerald-900 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            />
            {payload.expiresAt ? <p className="mt-2 text-[11px] font-bold text-emerald-800">Expires {formatWhen(payload.expiresAt)}</p> : null}
            <div className="mt-3 flex flex-wrap gap-2">
              <button onClick={() => void copy(String(payload.url), 'url')} className="mini-button mini-button--primary">
                {copied === 'url' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === 'url' ? 'Copied' : 'Copy link'}
              </button>
              <a
                href={payload.url}
                target="_blank"
                rel="noreferrer"
                className="mini-button"
              >
                <Link2 className="h-4 w-4" /> Open link
              </a>
            </div>
            {payload.urlHint ? <p className="mt-3 text-[11px] font-semibold text-emerald-900">{payload.urlHint}</p> : null}
            <p className="mt-3 border-t border-emerald-200 pt-3 text-[11px] font-medium text-emerald-900">
              Token only: <span className="break-all font-mono">{payload.passkey}</span>
              {' '}
              <button onClick={() => void copy(payload.passkey, 'token')} className="font-black underline underline-offset-2">
                {copied === 'token' ? 'copied' : 'copy token'}
              </button>
            </p>
          </div>
        ) : (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-center">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-700">{payload.label || 'Client credential'}</p>
            <p className="mt-2 break-all font-mono text-lg font-black tracking-[0.12em] text-emerald-900 sm:text-2xl">{payload.passkey}</p>
            {payload.expiresAt ? <p className="mt-2 text-[11px] font-bold text-emerald-800">Expires {formatWhen(payload.expiresAt)}</p> : null}
          </div>
        )}
        {!isLink ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Where the client uses it</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                readOnly
                value={signInUrl}
                aria-label="Client sign-in link"
                onFocus={(event) => event.currentTarget.select()}
                className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 font-mono text-xs font-bold text-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
              />
              <button onClick={() => void copy(signInUrl, 'signin')} className="mini-button">
                {copied === 'signin' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === 'signin' ? 'Copied' : 'Copy link'}
              </button>
              <a href={signInUrl || '/'} target="_blank" rel="noreferrer" className="mini-button"><Link2 className="h-4 w-4" /> Open</a>
            </div>
            <p className="mt-2 text-[11px] font-medium text-slate-600">
              Send this address with the key: the client opens it and enters the key. The key itself never goes in the link.
            </p>
          </div>
        ) : null}
        <p className="text-sm font-medium text-slate-600">{payload.message}</p>
        <p className="rounded-xl bg-slate-50 px-3.5 py-3 text-xs font-medium text-slate-600">
          Deliver this to the client out of band. Code Rx stores only a secure hash, so nobody — including PHANTOM — can read it back.
        </p>
        <div className="flex justify-end gap-2">
          {!isLink ? (
            <button onClick={() => void copy(payload.passkey, 'token')} className="mini-button">
              {copied === 'token' ? <CheckCircle2 className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === 'token' ? 'Copied' : 'Copy'}
            </button>
          ) : null}
          <button onClick={onClose} className="mini-button mini-button--primary">Done</button>
        </div>
      </div>
    </Dialog>
  );
};

/**
 * The controlled publishing workflow:
 * source → client → project → section → view/download → publish.
 */
/**
 * Extracts plain text from a client document's stored snapshot.
 */
const extractSnapshotText = (snapshot?: string | null, format?: string | null): string => {
  if (!snapshot) return '';
  if ((format || '').toLowerCase() === 'text') return snapshot;
  try {
    const parsed = JSON.parse(snapshot);
    const blocks = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    if (!blocks.length && typeof parsed === 'string') return parsed;
    return blocks
      .map((b: any) => {
        if (!b) return '';
        if (typeof b === 'string') return b;
        if (b.content) return String(b.content);
        if (b.text) return String(b.text);
        if (Array.isArray(b.items)) return b.items.join('\n');
        return '';
      })
      .filter(Boolean)
      .join('\n\n');
  } catch {
    return snapshot;
  }
};

const PublishDialog = ({
  client, projects, existing, presetProjectId, startWithUpload, onClose, onSaved,
}: {
  client: any; projects: any[]; existing?: any; presetProjectId?: string;
  /** Phase 18 — open directly on the upload step from the documents panel. */
  startWithUpload?: boolean;
  onClose: () => void; onSaved: (message: string) => void | Promise<void>;
}) => {
  const initialSource: 'text' | 'vault' | 'upload' = existing
    ? (existing.vaultDocumentId ? 'vault' : 'text')
    : (startWithUpload ? 'upload' : 'text');

  const [source, setSource] = useState<'text' | 'vault' | 'upload'>(initialSource);
  const [vaultSources, setVaultSources] = useState<any[]>([]);
  const [vaultDocumentId, setVaultDocumentId] = useState<string>(existing?.vaultDocumentId ? String(existing.vaultDocumentId) : '');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [vaultSections, setVaultSections] = useState<any[]>([]);
  const [sectionSlug, setSectionSlug] = useState<string>('');
  const [projectId, setProjectId] = useState(existing?.project?.id || existing?.projectId || presetProjectId || projects.find((project) => !project.isArchived)?.id || '');
  const [category, setCategory] = useState(existing?.category || 'document');
  const [title, setTitle] = useState(existing?.title || '');
  const [summary, setSummary] = useState(existing?.summary || '');
  const [version, setVersion] = useState(existing?.version || '1.0');
  const [contentText, setContentText] = useState(existing ? extractSnapshotText(existing.contentSnapshot, existing.contentSnapshotFormat) : '');
  const [allowView, setAllowView] = useState(existing ? Boolean(existing.allowView) : true);
  const [allowDownload, setAllowDownload] = useState(existing ? Boolean(existing.allowDownload) : false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    clientAccessCenter.vaultSources()
      .then(setVaultSources)
      .catch(() => setVaultSources([]));
  }, []);

  useEffect(() => {
    db.vault.sections()
      .then((rows) => {
        const usable = (rows || []).filter((row: any) => sectionAcceptsDocuments(row) && !row.is_sensitive);
        setVaultSections(usable);
        if (!sectionSlug) setSectionSlug(usable[0]?.slug || '');
      })
      .catch(() => setVaultSections([]));
  }, []);

  const submit = async (publishNow: boolean) => {
    setError(null);
    if (!projectId) { setError('Choose the client and project this document belongs to.'); return; }
    if (title.trim().length < 1) { setError('A document title is required.'); return; }
    if (!existing && source === 'vault' && !vaultDocumentId) { setError('Choose the internal document to publish.'); return; }
    if (!existing && source === 'text' && contentText.trim().length < 1) { setError('Provide the client-facing document text.'); return; }
    if (source === 'upload') {
      if (!existing && !uploadFile) { setError('Choose the document file to upload.'); return; }
      if (uploadFile && !isStampableUploadMime(uploadFile.type)) {
        setError(`A stamped Code Rx copy cannot be produced from ${uploadFile.type || 'that file type'}. Upload ${STAMPABLE_UPLOAD_LABEL}.`);
        return;
      }
      if (uploadFile && !sectionSlug) { setError('Choose the Vault section that should keep the internal original.'); return; }
    }

    setSaving(true);
    let filedDocument: UploadedVaultDocument | null = null;
    try {
      let documentId = existing?.id as string | undefined;
      let stampNote = '';

      if (source === 'upload' && uploadFile) {
        // Upload file as a Vault document
        const filed = await uploadFileAsVaultDocument({
          file: uploadFile,
          section: sectionSlug,
          title: title.trim(),
          status: uploadDocumentStatus(vaultSections.find((row) => row.slug === sectionSlug)),
        });
        filedDocument = filed;

        if (existing) {
          // Updating an existing document with a new uploaded file
          await clientAccessCenter.updateDocument(existing.id, {
            title: title.trim(),
            summary: summary.trim(),
            version: version.trim() || '1.0',
            vaultDocumentId: String(filed.documentId),
            allowView,
            allowDownload,
          });
          documentId = existing.id;
        } else {
          // Creating a brand new document from upload
          const created = await clientAccessCenter.createDocument(client.id, {
            projectId,
            category,
            title: title.trim(),
            summary: summary.trim(),
            version: version.trim() || '1.0',
            vaultDocumentId: String(filed.documentId),
          });
          documentId = created.data.id;
        }

        try {
          const delivery = await clientAccessCenter.prepareDelivery(documentId, true);
          const kilobytes = Math.max(1, Math.round(Number(delivery.data?.sizeBytes || 0) / 1024));
          stampNote = ` Stamped client copy: ${delivery.data?.label || 'client copy'} (${kilobytes} KB, ${delivery.data?.cached ? 'cached' : 'newly rendered'}).`;
        } catch (deliveryFailure: any) {
          stampNote = ` The stamped client copy could not be prepared yet — ${deliveryFailure?.message || 'try again from the document list.'}`;
        }
      } else if (!existing) {
        const created = await clientAccessCenter.createDocument(client.id, {
          projectId,
          category,
          title: title.trim(),
          summary: summary.trim(),
          version: version.trim() || '1.0',
          ...(source === 'vault' ? { vaultDocumentId } : { contentText: contentText.trim() }),
        });
        documentId = created.data.id;
      } else {
        // Editing existing document (updating title, summary, version, permissions, and writings or vault link)
        await clientAccessCenter.updateDocument(existing.id, {
          title: title.trim(),
          summary: summary.trim(),
          version: version.trim() || '1.0',
          allowView,
          allowDownload,
          ...(source === 'vault' ? { vaultDocumentId: vaultDocumentId || null } : { contentText: contentText.trim(), vaultDocumentId: null }),
        });
        documentId = existing.id;

        // Force refresh stamped artifact so the new writing or replaced document is reflected
        try {
          await clientAccessCenter.prepareDelivery(documentId, true);
        } catch {
          // stamped copy will render on preview
        }
      }

      if (documentId) {
        await clientAccessCenter.updateDocument(documentId, { allowView, allowDownload });
        if (publishNow) {
          await clientAccessCenter.setDocumentLifecycle(documentId, 'in_review');
          await clientAccessCenter.setDocumentLifecycle(documentId, 'approved');
          await clientAccessCenter.setDocumentLifecycle(documentId, 'published', true);
        }
      }
      await onSaved(publishNow
        ? `Published to ${client.name}. The client can see it now.${stampNote}`
        : `Saved as a draft. Nothing is visible to the client yet.${stampNote}`);
    } catch (failure: any) {
      const filed = filedDocument as UploadedVaultDocument | null;
      setError([
        failure?.message || 'This document could not be saved.',
        filed ? `The file is filed in the Vault as ${filed.documentCode || `document #${filed.documentId}`} — retry to publish it.` : '',
      ].filter(Boolean).join(' '));
    } finally {
      setSaving(false);
    }
  };

  const chosenProject = projects.find((project) => project.id === projectId);

  return (
    <Dialog
      title={existing ? 'Edit client document' : 'Publish to client'}
      subtitle={`${client.name}${chosenProject ? ` · ${chosenProject.name}` : ''}`}
      onClose={onClose}
      wide
    >
      <div className="space-y-5">
        {existing && (existing.vaultDocumentId || existing.hasClientArtifact) ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <p className="text-xs font-bold text-slate-800">
                {existing.vaultDocumentId ? `Currently linked to Vault document #${existing.vaultDocumentId}` : 'Document currently has an uploaded file/snapshot'}
              </p>
              <p className="text-[11px] text-slate-500">
                You can upload a new replacement file, edit its writings, or switch to direct client text.
              </p>
            </div>
            {source !== 'text' ? (
              <button
                type="button"
                onClick={() => { setSource('text'); setVaultDocumentId(''); }}
                className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-black text-rose-600 hover:bg-rose-50"
              >
                Detach file / write text instead
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button onClick={() => setSource('text')} className={`rounded-xl px-3.5 py-2.5 text-xs font-black uppercase tracking-wider ${source === 'text' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-500'}`}>
            {existing ? 'Edit document text' : '1 · Write the client copy'}
          </button>
          <button onClick={() => setSource('vault')} className={`rounded-xl px-3.5 py-2.5 text-xs font-black uppercase tracking-wider ${source === 'vault' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-500'}`}>
            {existing ? 'Link from Vault' : '1 · Use an internal document'}
          </button>
          <button onClick={() => setSource('upload')} className={`rounded-xl px-3.5 py-2.5 text-xs font-black uppercase tracking-wider ${source === 'upload' ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
            {existing ? 'Upload replacement file' : '1 · Upload a document'}
          </button>
        </div>

        {source === 'upload' ? (
          <div className="space-y-4">
            <VaultUploadField
              file={uploadFile}
              onFile={setUploadFile}
              accept={STAMPABLE_UPLOAD_ACCEPT}
              disabled={saving}
              busy={saving}
              hint={`Accepted: ${STAMPABLE_UPLOAD_LABEL}. The file is filed in the Vault as the internal original and the stamped Code Rx copy is rendered for the client — the source file itself is never delivered.`}
            />
            <Field
              label="Vault section for the internal original"
              hint="The upload becomes a real internal document in this section, so the original is filed, searchable and auditable in the Vault before anything reaches the client."
            >
              <select className={inputClass} value={sectionSlug} onChange={(event) => setSectionSlug(event.target.value)} disabled={saving}>
                <option value="">Choose a section…</option>
                {vaultSections.map((row) => (
                  <option key={row.slug} value={row.slug}>{row.title}</option>
                ))}
              </select>
            </Field>
            {!vaultSections.length ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-900">
                No Vault section currently accepts a new document for you. Ask a section manager for create rights — without a
                section there is nowhere to file the internal original.
              </p>
            ) : null}
          </div>
        ) : null}

        {source === 'vault' ? (
          <Field
            label="Internal document"
            hint="Only active, non-sensitive Vault documents are offered. Publishing pins a version snapshot — the Vault itself is never exposed."
          >
            <select className={inputClass} value={vaultDocumentId} onChange={(event) => setVaultDocumentId(event.target.value)}>
              <option value="">Choose a document…</option>
              {vaultSources.map((source_) => (
                <option key={source_.id} value={source_.id} disabled={!source_.publishable}>
                  {source_.code ? `${source_.code} · ` : ''}{source_.title}{source_.publishable ? '' : ` (${source_.status})`}
                </option>
              ))}
            </select>
          </Field>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="2 · Project">
            <select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={Boolean(existing)}>
              <option value="">Choose a project…</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}{project.isArchived ? ' (archived)' : ''}</option>
              ))}
            </select>
          </Field>
          <Field label="3 · Section">
            <select className={inputClass} value={category} onChange={(event) => setCategory(event.target.value)} disabled={Boolean(existing)}>
              {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Title">
          <input className={inputClass} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Phase 1 discovery report" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Client-facing summary" hint="Optional. Shown under the title in the project room.">
            <input className={inputClass} value={summary} onChange={(event) => setSummary(event.target.value)} />
          </Field>
          <Field label="Version">
            <input className={inputClass} value={version} onChange={(event) => setVersion(event.target.value)} />
          </Field>
        </div>

        {source === 'text' ? (
          <Field label="Client-facing text" hint="This becomes the document the client reads. Internal working notes do not belong here.">
            <textarea className={`${inputClass} min-h-40`} value={contentText} onChange={(event) => setContentText(event.target.value)} />
          </Field>
        ) : null}

        <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">4 · Client permissions</p>
          <div className="mt-3 space-y-3">
            <label className="flex items-start gap-3">
              <input type="checkbox" checked={allowView} onChange={(event) => { setAllowView(event.target.checked); if (!event.target.checked) setAllowDownload(false); }} className="mt-0.5 rounded border-slate-300" />
              <span>
                <span className="block text-sm font-bold text-slate-800">Allow viewing</span>
                <span className="block text-[11px] font-medium text-slate-500">The client can read this document in their project room.</span>
              </span>
            </label>
            <label className={`flex items-start gap-3 ${allowView ? '' : 'opacity-50'}`}>
              <input type="checkbox" checked={allowDownload} disabled={!allowView} onChange={(event) => setAllowDownload(event.target.checked)} className="mt-0.5 rounded border-slate-300" />
              <span>
                <span className="block text-sm font-bold text-slate-800">Allow downloading</span>
                <span className="block text-[11px] font-medium text-slate-500">
                  Separate from viewing. Downloads are served only from a stamped client copy and never from the internal original.
                </span>
              </span>
            </label>
          </div>
        </div>

        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4">
          <button onClick={onClose} className="mini-button">Cancel</button>
          <button onClick={() => void submit(false)} disabled={saving} className="mini-button">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save as draft
          </button>
          <button onClick={() => void submit(true)} disabled={saving} className="mini-button mini-button--primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve &amp; publish
          </button>
        </div>
        <p className="text-[11px] font-medium text-slate-500">
          Approve &amp; publish moves the document through In review → Approved → Published. Only a published,
          client-visible document with view permission ever reaches the client.
        </p>
      </div>
    </Dialog>
  );
};

/** Hosts the temporary-link creation dialog, kept separate for clarity. */
const LinkDialogHost = ({
  client, projects, documents, onClose, onIssued,
}: {
  client: any; projects: any[]; documents: any[]; onClose: () => void;
  onIssued: (
    payload: { token: string; expiresAt: string; path: string; url?: string; mode: LinkAccessMode; destinationLabel: string },
    message: string,
  ) => void | Promise<void>;
}) => {
  const [projectId, setProjectId] = useState(projects.find((project) => !project.isArchived)?.id || '');
  const [destination, setDestination] = useState<LinkDestinationId>('project');
  const [documentId, setDocumentId] = useState('');
  // Direct access is the default because a direct link is what an operator is
  // usually sending: opening it lands on the destination. The key-gated mode is
  // one click away and the dialog explains both before anything is created.
  const [mode, setMode] = useState<LinkAccessMode>('DIRECT_ACCESS');
  const [expiryMinutes, setExpiryMinutes] = useState(String(LINK_TTL_MINUTES_FALLBACK));
  const [customExpiry, setCustomExpiry] = useState('');
  const [unlimitedUses, setUnlimitedUses] = useState(false);
  const [maxUses, setMaxUses] = useState('1');
  const [allowView, setAllowView] = useState(true);
  const [allowDownload, setAllowDownload] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = linkDestination(destination)!;
  const isFile = destination === 'file';
  const needsDocument = chosen.needsDocument;

  // Only published, client-visible documents of the chosen project can be
  // linked to — the server refuses anything else, so the picker does not offer it.
  const projectDocuments = documents.filter((document) =>
    document.project?.id === projectId && document.lifecycle === 'published' && document.clientVisible);
  const chosenDocument = projectDocuments.find((document) => document.id === documentId) || null;

  // A file destination exists to deliver the stamped client copy, so the
  // permissions are decided by the destination, not by the operator.
  const effectiveAllowDownload = isFile ? true : allowDownload;
  const effectiveAllowView = isFile ? false : allowView;

  const minutes = customExpiry ? Number(customExpiry) : Number(expiryMinutes);

  const submit = async () => {
    setError(null);
    if (!projectId) { setError('Choose the project this link opens.'); return; }
    if (needsDocument && !documentId) {
      setError(isFile ? 'Choose the published document whose file this link delivers.' : 'Choose the published document this link opens.');
      return;
    }
    const lifetimeProblem = validateLinkLifetime(minutes);
    if (lifetimeProblem) { setError(lifetimeProblem); return; }
    const usesProblem = unlimitedUses ? null : validateLinkMaxUses(Number(maxUses));
    if (usesProblem) { setError(usesProblem); return; }
    if (!effectiveAllowView && !effectiveAllowDownload) { setError('Allow viewing, downloading, or both.'); return; }

    setSaving(true);
    try {
      const result = await clientAccessCenter.createLink(client.id, {
        projectId,
        destination,
        documentId: needsDocument ? documentId : undefined,
        mode,
        expiresInMinutes: minutes,
        maxUses: unlimitedUses ? null : Number(maxUses),
        allowView: effectiveAllowView,
        allowDownload: effectiveAllowDownload,
      });
      await onIssued({
        token: result.data.token,
        expiresAt: result.data.expiresAt,
        // The server generates the full http address from the address the
        // panel is being used on; the path is kept so an older response (or a
        // response with no host) still becomes a usable link here.
        path: result.data.path,
        url: result.data.url,
        mode: (result.data.mode === 'DIRECT_ACCESS' ? 'DIRECT_ACCESS' : 'REQUIRE_PASSKEY') as LinkAccessMode,
        destinationLabel: result.data.destinationLabel,
      }, result.message);
    } catch (failure: any) {
      setError(failure?.message || 'A temporary link could not be created.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      title="Create temporary link"
      subtitle={`For ${client.name}. The destination, the access mode and the lifetime are all enforced by the server.`}
      onClose={onClose}
    >
      <div className="space-y-5">
        <Field label="Project">
          <select className={inputClass} value={projectId} onChange={(event) => { setProjectId(event.target.value); setDocumentId(''); }}>
            <option value="">Choose a project…</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.name}{project.isArchived ? ' (archived)' : ''}</option>
            ))}
          </select>
        </Field>

        <Field label="Destination">
          <div className="grid gap-2 sm:grid-cols-2">
            {LINK_DESTINATIONS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => { setDestination(entry.id); if (!entry.needsDocument) setDocumentId(''); }}
                className={`rounded-xl px-3.5 py-2.5 text-left text-xs font-bold transition ${
                  destination === entry.id
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                    : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span className="block font-black uppercase tracking-wider">{entry.label}</span>
                <span className="mt-0.5 block text-[11px] font-medium text-slate-500">{entry.hint}</span>
              </button>
            ))}
          </div>
        </Field>

        {needsDocument ? (
          <>
            <Field label={isFile ? 'Document whose file is delivered' : 'Published document'}>
              <select className={inputClass} value={documentId} onChange={(event) => setDocumentId(event.target.value)}>
                <option value="">Choose a published document…</option>
                {projectDocuments.map((document) => (
                  <option key={document.id} value={document.id}>{document.title} · {document.reference}</option>
                ))}
              </select>
            </Field>
            {!projectDocuments.length ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] font-semibold text-amber-900">
                Nothing is published in this project yet, so there is no document to link to.
              </p>
            ) : null}
            {isFile && chosenDocument && !chosenDocument.hasClientArtifact ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] font-semibold text-amber-900">
                This document has no stamped client copy cached yet. That is expected — the server renders the
                watermarked copy the first time it is delivered, and never hands over an unstamped original. Use
                “Prepare stamped copy” to create it now.
              </p>
            ) : null}
            {isFile && chosenDocument && Number(chosenDocument.allowDownload) !== 1 ? (
              <p className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[11px] font-semibold text-amber-900">
                This document does not allow downloads, so a file link cannot be created for it.
              </p>
            ) : null}
          </>
        ) : null}

        <Field label="Access mode" hint={LINK_ACCESS_MODES.find((entry) => entry.id === mode)?.hint}>
          <div className="flex flex-wrap gap-2">
            {LINK_ACCESS_MODES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setMode(entry.id)}
                className={`rounded-xl px-3.5 py-2.5 text-xs font-black uppercase tracking-wider transition ${
                  mode === entry.id ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Valid for">
          <div className="flex flex-wrap gap-2">
            {LINK_TTL_PRESETS.map((preset) => (
              <button
                key={preset.minutes}
                type="button"
                onClick={() => { setExpiryMinutes(String(preset.minutes)); setCustomExpiry(''); }}
                className={`rounded-xl px-3 py-2 text-[11px] font-black uppercase tracking-wider transition ${
                  !customExpiry && Number(expiryMinutes) === preset.minutes
                    ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'
                    : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-3">
            <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500" htmlFor="link-custom-expiry">Custom</label>
            <input
              id="link-custom-expiry"
              type="number"
              min={LINK_TTL_MIN_MINUTES}
              max={LINK_TTL_MAX_MINUTES}
              className={`${inputClass} max-w-[160px]`}
              placeholder={`${LINK_TTL_MIN_MINUTES}–${LINK_TTL_MAX_MINUTES} minutes`}
              value={customExpiry}
              onChange={(event) => setCustomExpiry(event.target.value)}
            />
            <span className="text-[11px] font-semibold text-slate-500">minutes</span>
          </div>
        </Field>

        <Field label="Permissions">
          <div className="space-y-2">
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={effectiveAllowView}
                disabled={isFile}
                onChange={(event) => setAllowView(event.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span className="text-xs font-semibold text-slate-700">
                VIEW — the client may read the destination
                {isFile ? <span className="ml-1 font-bold text-slate-500">(a file link never opens the reader)</span> : null}
              </span>
            </label>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={effectiveAllowDownload}
                disabled={isFile}
                onChange={(event) => setAllowDownload(event.target.checked)}
                className="mt-0.5 rounded border-slate-300"
              />
              <span className="text-xs font-semibold text-slate-700">
                DOWNLOAD — documents that allow downloads may be downloaded through this link
                {isFile ? <span className="ml-1 font-bold text-slate-500">(always on for a file link)</span> : null}
              </span>
            </label>
          </div>
        </Field>

        <Field label="Maximum uses">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={unlimitedUses}
                onChange={(event) => setUnlimitedUses(event.target.checked)}
                className="rounded border-slate-300"
              />
              Unlimited
            </label>
            <input
              type="number"
              min={1}
              max={LINK_MAX_USES_LIMIT}
              className={`${inputClass} max-w-[140px]`}
              value={maxUses}
              disabled={unlimitedUses}
              onChange={(event) => setMaxUses(event.target.value)}
            />
            <span className="text-[11px] font-semibold text-slate-500">uses (1–{LINK_MAX_USES_LIMIT})</span>
          </div>
        </Field>

        {error ? <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-800">{error}</p> : null}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="mini-button">Cancel</button>
          <button onClick={submit} disabled={saving} className="mini-button mini-button--primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Create link
          </button>
        </div>
      </div>
    </Dialog>
  );
};

// ---------------------------------------------------------------------------
// Server-side actions (helpers keep the JSX readable)
// ---------------------------------------------------------------------------

const setStatus = async (
  request: (clientId: string, status: string) => Promise<any>,
  clientId: string, status: string,
  message: string,
  refresh: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) => {
  try {
    await request(clientId, status);
    await refresh(message);
  } catch (failure: any) {
    setError(failure?.message || 'That change could not be saved.');
  }
};

const setProjectArchived = async (
  project: any, archived: boolean,
  refresh: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) => {
  try {
    await clientAccessCenter.updateProject(project.id, { status: archived ? 'archived' : 'active', archive: archived });
    await refresh(archived ? 'Project archived. The client can no longer open it.' : 'Project restored.');
  } catch (failure: any) {
    setError(failure?.message || 'That project could not be updated.');
  }
};

const revokeAll = async (
  client: any,
  refresh: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) => {
  const agreed = await appDialog.confirm({
    title: `Revoke all access for ${client.name}?`,
    message: 'Every access key, open session and temporary link is cancelled immediately. The client sees the access screen again until you issue a new key.',
    confirmLabel: 'Revoke everything',
    tone: 'danger',
  });
  if (!agreed) return;
  try {
    await clientAccessCenter.revokeAllAccess(client.id);
    await refresh('All client access revoked: keys, sessions and temporary links are dead.');
  } catch (failure: any) {
    setError(failure?.message || 'Access could not be revoked.');
  }
};

/**
 * Prepares the stamped client copy of a document on the server.
 *
 * Nothing is generated in the browser: the request returns the artifact's kind,
 * size and cache state, or the server's controlled refusal — in which case the
 * operator sees the reason and no file is produced.
 */
/**
 * How long a one-press direct link lives. Long enough to send and be opened
 * today, short enough that an address forgotten in a chat stops working.
 */
const DIRECT_LINK_TTL_MINUTES = 1440;

/**
 * A direct link in one press. The operator is looking at a project or a
 * document, so the address is generated for exactly that and opening it lands
 * there — no key prompt, no menu. The link itself is the credential, which is
 * why the reveal says so, the lifetime is finite, and the link appears in the
 * links list where it can be revoked like any other.
 */
const sendDirectLink = async (
  input: { clientId: string; projectId?: string; documentId?: string; destination: 'project' | 'document'; label: string },
  refresh: (message: string) => Promise<void> | void,
  onMessage: (message: string) => void,
  setError: (message: string | null) => void,
  setRevealed: (payload: { passkey: string; hint: string; expiresAt: string | null; message: string; label?: string; url?: string; urlHint?: string }) => void,
  setBusy: (busy: boolean) => void,
) => {
  if (!input.projectId) {
    setError('This client needs a project before a link can be created.');
    return;
  }
  setBusy(true);
  setError(null);
  try {
    const result = await clientAccessCenter.createLink(input.clientId, {
      projectId: input.projectId,
      destination: input.destination,
      documentId: input.destination === 'document' ? input.documentId : undefined,
      mode: 'DIRECT_ACCESS',
      expiresInMinutes: DIRECT_LINK_TTL_MINUTES,
      maxUses: null,
      allowView: true,
      allowDownload: false,
    });
    const origin = typeof window === 'undefined' ? '' : window.location.origin;
    setRevealed({
      passkey: result.data.token,
      hint: '',
      expiresAt: result.data.expiresAt,
      message: result.message,
      label: `Direct link — opens ${input.label}`,
      url: result.data.url || linkAddressUrl(result.data.token, origin),
      urlHint: linkShareHint('DIRECT_ACCESS', result.data.destinationLabel, origin),
    });
    const message = `A direct link to ${input.label} was created and is shown once.`;
    onMessage(message);
    await refresh(message);
  } catch (failure: any) {
    setError(failure?.message || 'A direct link could not be created.');
  } finally {
    setBusy(false);
  }
};

const prepareStampedCopy = async (
  document: any,
  refresh: (message: string) => Promise<void> | void,
  onMessage: (message: string) => void,
  setError: (message: string | null) => void,
) => {
  try {
    const result = await clientAccessCenter.prepareDelivery(document.id, true);
    const kilobytes = Math.max(1, Math.round(Number(result.data?.sizeBytes || 0) / 1024));
    const message = `Stamped client copy ready — ${result.data?.label || 'client copy'} (${kilobytes} KB, `
      + `${result.data?.cached ? 'already cached' : 'newly rendered'}).`;
    onMessage(message);
    await refresh(message);
  } catch (failure: any) {
    setError(failure?.message || 'A stamped client copy cannot be prepared for this source.');
  }
};

/** The client's four review answers, as the panel shows them. */
const REVIEW_LABELS: Record<string, string> = {
  approve: 'Approved',
  decline: 'Declined',
  pending: 'Pending',
  custom: 'Custom answer',
};

const reviewTone = (decision: string) => (
  decision === 'approve' ? 'published' : decision === 'decline' ? 'archived' : 'draft'
);

const deleteDocument = async (
  document: any,
  refresh: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) => {
  const agreed = await appDialog.confirm({
    title: `Delete “${document.title}”?`,
    message: 'It moves to the PHANTOM Recycle Bin and leaves the client portal immediately.',
    confirmLabel: 'Delete document',
    tone: 'danger',
  });
  if (!agreed) return;
  try {
    await clientAccessCenter.deleteDocument(document.id);
    await refresh('Client document deleted. PHANTOM → Recycle Bin can restore it.');
  } catch (failure: any) {
    setError(failure?.message || 'That document could not be deleted.');
  }
};

const changeLifecycle = async (
  document: any, state: string,
  refresh: (message: string) => void | Promise<void>,
  setError: (message: string | null) => void,
) => {
  try {
    const result = await clientAccessCenter.setDocumentLifecycle(document.id, state, state === 'published');
    await refresh(result.message || `Document moved to ${state}.`);
  } catch (failure: any) {
    setError(failure?.message || 'That lifecycle change was refused.');
  }
};

const revokeKey = async (
  key: any,
  refresh: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) => {
  try {
    await clientAccessCenter.revokeKey(key.id);
    await refresh('Access key revoked. Its sessions no longer work.');
  } catch (failure: any) {
    setError(failure?.message || 'That access key could not be revoked.');
  }
};

const revokeLink = async (
  link: any,
  refresh: (message: string) => Promise<void>,
  setError: (message: string | null) => void,
) => {
  try {
    await clientAccessCenter.revokeLink(link.id);
    await refresh('Temporary link revoked.');
  } catch (failure: any) {
    setError(failure?.message || 'That link could not be revoked.');
  }
};

export default ClientAccessCenter;

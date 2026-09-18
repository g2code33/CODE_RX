/**
 * CODE Rx SOCIETY — delivery context resolution (Phase 8).
 *
 * Routes call this module; it does the loading and the caching, while
 * `client-document-delivery.ts` owns the plan and the rendering and
 * `client-delivery*.ts` own the stamping itself.
 *
 * Two rules are enforced here, once, for every entry point (viewer, download,
 * print, Phantom preview):
 *
 *   1. The tenant scope is always part of the SQL. A document is only ever
 *      loaded by `(document id, client id, project id)` — the ids the
 *      middleware already authorized.
 *   2. A source that was sensitive at creation but has since been marked
 *      sensitive or restricted in the Vault is refused at delivery time too.
 */

import {
  ensureClientDeliveryArtifact,
  planClientDelivery,
  refreshClientDeliveryArtifact,
  type ArtifactResult,
  type BucketLike,
  type DeliveryAttachment,
  type DeliveryDocument,
  type DeliveryInput,
  type DeliveryMeta,
  type DeliveryPlan,
  type RenderInput,
} from './client-document-delivery';

/** Minimal D1 surface, matching how the rest of `functions/lib` talks to it. */
export interface DbLike {
  prepare(sql: string): { bind(...values: unknown[]): { first<T = unknown>(): Promise<T | null>; all<T = unknown>(): Promise<{ results?: T[] }>; run(): Promise<unknown> } };
}

interface ContextRow {
  id: number;
  public_id: string;
  client_id: number;
  client_project_id: number;
  reference_code: string | null;
  title: string;
  summary: string | null;
  category: string;
  version: string | null;
  content_snapshot: string | null;
  content_snapshot_format: string | null;
  storage_reference: string | null;
  vault_document_id: number | null;
  vault_version_number: number | null;
  published_at: string | null;
  created_at: string | null;
  project_name: string;
  project_reference: string;
  client_name: string;
  client_public_id: string;
  vault_is_sensitive: number | null;
  vault_section_sensitive: number | null;
  vault_visibility: string | null;
}

export interface ClientDeliveryContext {
  documentRowId: number;
  clientRowId: number;
  projectRowId: number;
  documentPublicId: string;
  clientPublicId: string;
  projectPublicId: string;
  vaultDocumentId: number | null;
  storageReference: string | null;
  publishedAt: string | null;
  createdAt: string | null;
  /** True when the linked Vault source has been marked sensitive or restricted. */
  sourceRestricted: boolean;
  meta: DeliveryMeta;
  document: DeliveryDocument;
  attachment: DeliveryAttachment | null;
}

const SOURCE_RESTRICTED_MESSAGE =
  'This document is not available for download. Contact Code Rx Society.';

/**
 * Loads everything the stamp needs. Returns `null` when the document does not
 * exist inside the authorized scope — the caller answers with the portal's own
 * not-found response, so a wrong id reveals nothing.
 */
export const loadClientDeliveryContext = async (
  db: DbLike,
  params: { documentRowId: number; clientId: number; projectId: number },
): Promise<ClientDeliveryContext | null> => {
  const row = await db.prepare(
    `SELECT d.id, d.public_id, d.client_id, d.client_project_id, d.reference_code, d.title, d.summary,
            d.category, d.version, d.content_snapshot, d.content_snapshot_format, d.storage_reference,
            d.vault_document_id, d.vault_version_number, d.published_at, d.created_at,
            p.name AS project_name, p.reference_code AS project_reference, p.public_id AS project_public_id,
            c.name AS client_name, c.public_id AS client_public_id,
            vd.is_archived AS vault_is_archived, vd.visibility AS vault_visibility,
            vs.is_sensitive AS vault_section_sensitive
     FROM client_documents d
     JOIN client_projects p ON p.id = d.client_project_id
     JOIN clients c ON c.id = d.client_id
     LEFT JOIN vault_documents vd ON vd.id = d.vault_document_id
     LEFT JOIN vault_sections vs ON vs.id = vd.section_id
     WHERE d.id = ? AND d.client_id = ? AND d.client_project_id = ?`,
  ).bind(params.documentRowId, params.clientId, params.projectId).first<ContextRow & { project_public_id: string }>();

  if (!row) return null;

  const attachment = await resolveAttachment(db, row);
  const issuedAt = new Date(row.published_at || row.created_at || Date.now());
  const meta: DeliveryMeta = {
    projectName: row.project_name,
    projectReference: row.project_reference,
    documentTitle: row.title,
    documentReference: row.reference_code || row.public_id,
    version: row.version || '1.0',
    clientName: row.client_name,
    category: row.category,
    issuedAt: Number.isNaN(issuedAt.getTime()) ? new Date() : issuedAt,
  };

  return {
    documentRowId: Number(row.id),
    clientRowId: Number(row.client_id),
    projectRowId: Number(row.client_project_id),
    documentPublicId: row.public_id,
    clientPublicId: row.client_public_id,
    projectPublicId: row.project_public_id,
    vaultDocumentId: row.vault_document_id === null ? null : Number(row.vault_document_id),
    storageReference: row.storage_reference,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    sourceRestricted: Number(row.vault_section_sensitive) === 1
      || row.vault_visibility === 'restricted'
      || Number(row.vault_is_archived) === 1,
    meta,
    document: {
      title: row.title,
      reference: row.reference_code || row.public_id,
      version: row.version || '1.0',
      category: row.category,
      contentSnapshot: row.content_snapshot,
      contentSnapshotFormat: row.content_snapshot_format,
    },
    attachment,
  };
};

/**
 * Finds the attachment a document is delivered from.
 *
 * The block list decides: when a document's only content is a single file or
 * image block, that attachment *is* the document and is delivered by its own
 * type (stamped PDF, stamped image, converted document). A rich-text document
 * keeps its blocks and embeds its images.
 */
const resolveAttachment = async (db: DbLike, row: ContextRow): Promise<DeliveryAttachment | null> => {
  if (!row.vault_document_id) return null;
  const snapshot = row.content_snapshot || '';
  const format = (row.content_snapshot_format || '').toLowerCase();
  if (format === 'text' || !snapshot.includes('fileKey')) return null;

  let fileKey = '';
  try {
    const parsed = JSON.parse(snapshot);
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    const refs = blocks
      .filter((block: any) => block && typeof block.fileKey === 'string' && ['image', 'file', 'embed'].includes(String(block.type)))
      .map((block: any) => ({ fileKey: String(block.fileKey), type: String(block.type) }));
    const contentBlocks = blocks.filter((block: any) => block
      && !['image', 'file', 'embed'].includes(String(block.type))
      && String(block.content ?? '').trim() !== '').length;
    if (refs.length === 1 && contentBlocks === 0) fileKey = refs[0].fileKey;
  } catch {
    return null;
  }
  if (!fileKey) return null;

  // The attachment must belong to the same Vault document this client document
  // pins, so a snapshot can never point the delivery at another department's
  // file by carrying a borrowed key.
  const attachment = await db.prepare(
    `SELECT a.file_key, a.name, a.mime_type, a.size_bytes
     FROM vault_attachments a
     WHERE a.file_key = ? AND a.document_id = ?
     LIMIT 1`,
  ).bind(fileKey, row.vault_document_id).first<{ file_key: string; name: string; mime_type: string | null; size_bytes: number | null }>();

  if (!attachment) return null;
  return {
    fileKey: attachment.file_key,
    name: attachment.name,
    mimeType: attachment.mime_type,
    sizeBytes: attachment.size_bytes === null ? null : Number(attachment.size_bytes),
  };
};

export interface DeliveryResolution {
  plan: DeliveryPlan;
  context: ClientDeliveryContext;
  artifact: ArtifactResult | null;
  /** Client-safe message when nothing can be delivered. */
  message: string;
  reason: string | null;
}

/**
 * Resolves a stamped artifact for the document, rendering and caching it when
 * needed. Never returns source bytes: the artifact is always a pipeline output,
 * and every failure is reported as a refusal the route turns into a controlled
 * response.
 */
export const resolveClientDelivery = async (options: {
  db: DbLike;
  bucket: BucketLike;
  context: ClientDeliveryContext;
  /** Force a re-render even when a cached artifact exists. */
  refresh?: boolean;
}): Promise<DeliveryResolution> => {
  const { context } = options;

  if (context.sourceRestricted) {
    return {
      plan: planOf(context),
      context,
      artifact: null,
      message: SOURCE_RESTRICTED_MESSAGE,
      reason: 'source_restricted',
    };
  }

  const input = await buildRenderInput(options.bucket, context);
  const plan = planClientDelivery(input);
  if (!plan.available) {
    return { plan, context, artifact: null, message: plan.message, reason: plan.reason };
  }

  try {
    const artifact = await ensureClientDeliveryArtifact({
      bucket: options.bucket,
      clientPublicId: context.clientPublicId,
      documentPublicId: context.documentPublicId,
      input,
    });
    if (options.refresh) {
      // A refresh is only requested by the Phantom action, never by a client
      // read: regenerate from the current source and replace the cached object.
      const rendered = await refreshClientDeliveryArtifact({
        bucket: options.bucket,
        clientPublicId: context.clientPublicId,
        documentPublicId: context.documentPublicId,
        input,
      });
      return { plan, context, artifact: rendered, message: '', reason: null };
    }
    return { plan, context, artifact, message: '', reason: null };
  } catch (error) {
    const reason = (error as { reason?: string })?.reason || 'delivery_unavailable';
    const message = (error as Error)?.message || plan.message;
    return { plan, context, artifact: null, message, reason };
  }
};

const planOf = (context: ClientDeliveryContext): DeliveryPlan => ({
  available: false,
  kind: null,
  sourceKind: 'unsupported',
  label: 'Unavailable',
  contentType: 'application/octet-stream',
  extension: '',
  message: SOURCE_RESTRICTED_MESSAGE,
  reason: 'source_restricted',
});

/** Fetches the bytes the renderer needs — the attachment, or embedded images. */
const buildRenderInput = async (bucket: BucketLike, context: ClientDeliveryContext): Promise<RenderInput> => {
  const input: RenderInput = {
    meta: context.meta,
    document: context.document,
    attachment: context.attachment,
    attachmentBytes: null,
    embeddedImages: {},
  };

  if (context.attachment) {
    input.attachmentBytes = await readObject(bucket, context.attachment.fileKey);
    return input;
  }

  // Rich text: embed the images its blocks reference. Only PNGs are decoded (the
  // only raster format the runtime can read); anything else is omitted with a
  // note by the renderer — the raw object is never forwarded.
  const snapshot = context.document.contentSnapshot || '';
  if (!snapshot.includes('fileKey')) return input;
  try {
    const parsed = JSON.parse(snapshot);
    const blocks = Array.isArray(parsed?.blocks) ? parsed.blocks : [];
    for (const block of blocks) {
      if (!block || String(block.type) !== 'image' || typeof block.fileKey !== 'string') continue;
      if (!block.fileKey.startsWith('vault/')) continue;
      if (input.embeddedImages?.[block.fileKey] !== undefined) continue;
      input.embeddedImages![block.fileKey] = await readObject(bucket, block.fileKey);
    }
  } catch {
    // A malformed snapshot renders as text; the renderer still stamps it.
  }
  return input;
};

const readObject = async (bucket: BucketLike, key: string): Promise<Uint8Array | null> => {
  if (!key || !key.startsWith('vault/')) return null;
  try {
    const object = await bucket.get(key);
    if (!object) return null;
    const bytes = new Uint8Array(await object.arrayBuffer());
    return bytes.length ? bytes : null;
  } catch {
    return null;
  }
};

/**
 * Persists the artifact key in the existing `storage_reference` column. The
 * update is scoped by the same client/project ids the document was loaded with,
 * and every value written is a pipeline key under `client-exports/`.
 */
export const recordArtifactReference = async (
  db: DbLike,
  context: ClientDeliveryContext,
  key: string,
): Promise<boolean> => {
  if (!key.startsWith('client-exports/')) return false;
  if (context.storageReference === key) return false;
  await db.prepare(
    `UPDATE client_documents SET storage_reference = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND client_id = ? AND client_project_id = ?`,
  ).bind(key, context.documentRowId, context.clientRowId, context.projectRowId).run();
  return true;
};

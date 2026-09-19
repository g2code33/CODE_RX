/**
 * CODE Rx SOCIETY — Phase 18: uploading a document *file* and filing it as a
 * real internal document.
 *
 * This module adds no new storage and no new delivery. It composes the two
 * endpoints that already own the job:
 *
 *   POST /api/vault/upload     stores the bytes (10 MB, allow-listed MIME) in
 *                              the Vault and returns a file key + attachment
 *   POST /api/vault/documents  creates the internal document, links the
 *                              attachment to it and stores the block snapshot
 *
 * A client copy is never produced here: the server's single stamping pipeline
 * renders it from the internal document when PHANTOM prepares the delivery.
 */
import { db } from './cloudflare';

/**
 * An image or a file block — the same shapes the Vault editor writes, so an
 * uploaded document behaves exactly like a document typed in the editor and
 * the existing delivery planner recognises it.
 */
export type UploadBlockType = 'image' | 'file';

export interface UploadedVaultDocument {
  /** Internal document id (the same identifier the Vault UI uses). */
  documentId: number;
  documentCode: string | null;
  version: number;
  fileKey: string;
  attachmentId: number | null;
  name: string;
  mimeType: string;
  /** True when the file itself is the whole document (deliverable as-is). */
  singleAttachment: true;
}

/** Prefixes the browser reports for a section that can hold a new document. */
export const sectionAcceptsDocuments = (section: any): boolean =>
  Boolean(section && section.permissions && section.permissions.create);

/**
 * A section manager may file the upload as an approved/active internal record;
 * anyone else with create rights files it as a draft. The same rule the Vault
 * create route enforces, decided before the request so the operator is never
 * handed a surprise 403.
 */
export const uploadDocumentStatus = (section: any): 'active' | 'draft' =>
  section?.permissions?.manage ? 'active' : 'draft';

/** The file name, minus its extension — a sensible starting document title. */
export const titleFromFileName = (name: string): string =>
  String(name || '')
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, 180);

export const isImageUpload = (file: { type?: string }): boolean =>
  String(file?.type || '').toLowerCase().startsWith('image/');

/**
 * Mirrors what the server's stamping engine can actually render — the PDF,
 * image and text paths of `planClientDelivery`, plus the two office formats the
 * ZIP reader in functions/lib/client-delivery-office.ts can convert (.docx and
 * .odt). Legacy .doc is deliberately absent: the engine cannot read it, so the
 * operator is told before a byte is stored. The server stays the authority.
 */
export const STAMPABLE_UPLOAD_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/x-markdown',
  'application/json',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.oasis.opendocument.text',
]);

export const STAMPABLE_UPLOAD_LABEL =
  'PDF, PNG, Word (.docx), OpenDocument (.odt), plain text, CSV, Markdown or JSON';

export const isStampableUploadMime = (mimeType: string | null | undefined): boolean => {
  const mime = String(mimeType || '').toLowerCase();
  if (!mime) return false;
  return STAMPABLE_UPLOAD_MIME_TYPES.has(mime) || mime.startsWith('text/');
};

/** The `accept` attribute for the client-delivery upload field. */
export const STAMPABLE_UPLOAD_ACCEPT =
  '.pdf,.png,.txt,.csv,.md,.markdown,.json,.docx,.odt,application/pdf,image/png,text/*';

/** 10 MB — the same ceiling `/api/vault/upload` enforces. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const uploadSizeLabel = (bytes: number): string =>
  bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

/**
 * Uploads the file and files it as an internal Vault document whose content is
 * that single file.
 *
 * Both steps are existing endpoints. If the second step fails the attachment is
 * already in the Vault (unlinked); PHANTOM sees the error and can retry, and
 * nothing is ever published to a client from a half-created document.
 */
export const uploadFileAsVaultDocument = async (options: {
  file: File;
  section: string;
  title?: string;
  status?: 'active' | 'draft';
  visibility?: 'section' | 'members';
}): Promise<UploadedVaultDocument> => {
  const { file, section } = options;
  const title = (options.title || titleFromFileName(file.name)).trim() || titleFromFileName(file.name) || 'Uploaded document';

  const uploaded = await db.vault.uploadFile(file, section);
  const blockType: UploadBlockType = isImageUpload(file) ? 'image' : 'file';
  const block = {
    type: blockType,
    fileKey: uploaded.fileKey,
    attachmentId: uploaded.attachment?.id,
    url: uploaded.url,
    caption: file.name,
    content: file.name,
  };

  try {
    const created = await db.vault.createDocument({
      section,
      title,
      // The file is the document: one attachment block and no prose, which is
      // exactly the shape the delivery pipeline delivers by the file's own type.
      contentJson: JSON.stringify({ version: 1, blocks: [block] }),
      fileKey: uploaded.fileKey,
      status: options.status || 'active',
      visibility: options.visibility || 'section',
    });
    return {
      documentId: Number(created?.data?.id),
      documentCode: created?.data?.documentCode || null,
      version: Number(created?.data?.version || 1),
      fileKey: uploaded.fileKey,
      attachmentId: uploaded.attachment?.id ?? null,
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      singleAttachment: true,
    };
  } catch (error) {
    // The bytes are stored but no document was created: say so plainly instead
    // of leaving the operator guessing which half happened.
    const failure = error as Error & { status?: number };
    throw new Error(
      `The file was uploaded, but the internal document could not be created (${failure?.message || 'unknown error'}). `
      + 'Nothing was published to the client.',
    );
  }
};

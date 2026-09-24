/**
 * CODE Rx SOCIETY — raw unformatted delivery pipeline tests.
 *
 * Bundles the delivery modules with esbuild and asserts the behaviour of the
 * raw delivery fix end to end (planning, rendering, normalization, caching
 * fingerprints, filenames). Runs in plain Node:
 *
 *   node scripts/raw-delivery-tests.mjs
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const require = createRequire(import.meta.url);
const { build } = require('esbuild');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(os.tmpdir(), `code-rx-raw-tests-${process.pid}`);

let failures = 0;
const check = (name, cond) => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}`);
  if (!cond) failures += 1;
};

await build({
  entryPoints: [path.join(repoRoot, 'functions/lib/client-document-delivery.ts')],
  bundle: true, format: 'esm', platform: 'node',
  outfile: path.join(outDir, 'cdd.bundle.mjs'), logLevel: 'silent',
});
await build({
  entryPoints: [path.join(repoRoot, 'functions/lib/client-delivery-pdf.ts')],
  bundle: true, format: 'esm', platform: 'node',
  outfile: path.join(outDir, 'cdp.bundle.mjs'), logLevel: 'silent',
});

const cdd = await import(path.join(outDir, 'cdd.bundle.mjs'));
const cdp = await import(path.join(outDir, 'cdp.bundle.mjs'));

// --- normalize / parse -------------------------------------------------------
const rawOnly = cdp.normalizePresentationCustomization({
  rawDocumentDelivery: true, hideHeader: false, customHeaderHeadline: 'CODE Rx SOCIETY',
  customHeaderDesignation: 'CLIENT PROJECT DOCUMENT', customWatermarkText: 'CODE Rx SOCIETY',
  customWatermarkOpacity: 0.10, hideWatermark: false, hideLogo: false,
});
check('normalize: raw flag survives', rawOnly?.rawDocumentDelivery === true);
check('normalize: default strings dropped', rawOnly.customHeaderHeadline === null && rawOnly.customWatermarkText === null);
check('normalize: default opacity dropped', rawOnly.customWatermarkOpacity === null);

const allDefaults = cdp.normalizePresentationCustomization({
  customHeaderHeadline: 'CODE Rx SOCIETY', customHeaderDesignation: 'CLIENT PROJECT DOCUMENT',
  hideHeader: false, hideWatermark: false, customWatermarkText: 'CODE Rx SOCIETY',
  customWatermarkOpacity: 0.1, hideLogo: false, rawDocumentDelivery: false,
});
check('normalize: all-default payload -> null (reset to branded)', allDefaults === null);

check('normalize: unknown/invalid fields dropped', cdp.normalizePresentationCustomization({ evil: '<script>', rawDocumentDelivery: 'yes' }) === null);
check('normalize: garbage input -> null', cdp.normalizePresentationCustomization('nope') === null);
check('parseStored: roundtrip', cdp.parseStoredPresentationCustomization(JSON.stringify({ rawDocumentDelivery: true }))?.rawDocumentDelivery === true);
check('parseStored: bad JSON -> null', cdp.parseStoredPresentationCustomization('{{{') === null);
check('parseStored: empty -> null', cdp.parseStoredPresentationCustomization(null) === null);

// --- plans --------------------------------------------------------------------
const baseDoc = {
  title: 'T', reference: 'CRX-DOC-0001', version: '1.0', category: 'document',
  contentSnapshot: '{"blocks":[{"type":"paragraph","content":"Hello"}]}', contentSnapshotFormat: 'blocks',
};
const meta = (cust) => ({
  projectName: 'P', projectReference: 'PR', documentTitle: 'T', documentReference: 'R',
  version: '1.0', clientName: 'C', category: 'document', issuedAt: new Date(), customization: cust,
});
const pdfAttachment = { fileKey: 'vault/a', name: 'Contract.pdf', mimeType: 'application/pdf', sizeBytes: 10 };
const docxAttachment = { fileKey: 'vault/b', name: 'Report final.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sizeBytes: 10 };
const pngAttachment = { fileKey: 'vault/c', name: 'Plan', mimeType: 'image/png', sizeBytes: 10 };

check('plan: stamped default for pdf attachment', cdd.planClientDelivery({ meta: meta(null), document: baseDoc, attachment: pdfAttachment }).kind === 'stamped_pdf');
const rawPdf = cdd.planClientDelivery({ meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: pdfAttachment });
check('plan: raw pdf -> raw_file pdf', rawPdf.kind === 'raw_file' && rawPdf.contentType === 'application/pdf' && rawPdf.extension === 'pdf');
const rawDocx = cdd.planClientDelivery({ meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: docxAttachment });
check('plan: raw docx keeps docx type/ext', rawDocx.kind === 'raw_file' && rawDocx.contentType.endsWith('wordprocessingml.document') && rawDocx.extension === 'docx');
const rawPng = cdd.planClientDelivery({ meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: pngAttachment });
check('plan: raw png ext from mime when name has none', rawPng.kind === 'raw_file' && rawPng.extension === 'png');
const rawText = cdd.planClientDelivery({ meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: null });
check('plan: raw rich text -> unbranded generated pdf', rawText.kind === 'generated_pdf' && rawText.label === 'Unbranded PDF');
check('plan: stamped rich text label unchanged', cdd.planClientDelivery({ meta: meta(null), document: baseDoc, attachment: null }).label === 'Stamped PDF');

// --- rendering ----------------------------------------------------------------
const fakePdf = new TextEncoder().encode('%PDF-1.4 fake bytes');
const rendered = await cdd.renderClientDelivery({
  meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: pdfAttachment,
  attachmentBytes: fakePdf, embeddedImages: {},
});
check('render: raw returns exact source bytes', rendered.bytes.length === fakePdf.length && rendered.bytes.every((b, i) => b === fakePdf[i]));
check('render: raw kind/contentType', rendered.kind === 'raw_file' && rendered.contentType === 'application/pdf');

const stamped = await cdd.renderClientDelivery({
  meta: meta(null), document: baseDoc, attachment: pdfAttachment, attachmentBytes: fakePdf, embeddedImages: {},
}).catch((e) => e);
// Fail closed: an unstamped/unstampable source is refused — never passed
// through to the client as-is.
check('render: stamped path refuses an invalid pdf (no passthrough)',
  stamped instanceof Error && typeof stamped.reason === 'string' && stamped.reason !== '');

const rawGenerated = await cdd.renderClientDelivery({
  meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: null, attachmentBytes: null, embeddedImages: {},
});
const rawGenText = new TextDecoder('latin1').decode(rawGenerated.bytes);
const stampedGenerated = await cdd.renderClientDelivery({
  meta: meta(null), document: baseDoc, attachment: null, attachmentBytes: null, embeddedImages: {},
});
const stampedGenText = new TextDecoder('latin1').decode(stampedGenerated.bytes);
// Page content streams are compressed, so probe the uncompressed document
// metadata: a raw copy carries no branded metadata, a stamped copy does.
check('render: raw generated pdf has neutral metadata', !rawGenText.includes('CLIENT PROJECT DOCUMENT') && !rawGenText.includes('CODE Rx SOCIETY'));
check('render: raw generated pdf skips logo embedding', !rawGenText.includes('CrxWatermarkLogo') && !rawGenText.includes('CrxHeaderLogo'));
check('render: stamped generated pdf carries branded metadata', stampedGenText.includes('CLIENT PROJECT DOCUMENT') && stampedGenText.includes('CODE Rx SOCIETY'));

// --- cache fingerprints ---------------------------------------------------------
const fpRaw = await cdd.sourceFingerprint({ meta: meta({ rawDocumentDelivery: true }), document: baseDoc, attachment: pdfAttachment });
const fpStamped = await cdd.sourceFingerprint({ meta: meta(null), document: baseDoc, attachment: pdfAttachment });
check('fingerprint: raw vs stamped differ', fpRaw !== fpStamped);

// --- filenames -------------------------------------------------------------------
check('filename: raw keeps original name', cdd.rawDeliveryFilename(pdfAttachment, 'pdf') === 'Contract.pdf');
check('filename: raw appends ext when missing', cdd.rawDeliveryFilename(pngAttachment, 'png') === 'Plan.png');
const hostile = cdd.rawDeliveryFilename({ fileKey: 'x', name: 'a"b;c:\n.pdf', mimeType: null, sizeBytes: 1 }, 'pdf');
check('filename: raw sanitizes hostile chars', !/[\\/"<>|:&\n;]/.test(hostile.replace(/\.pdf$/, '')));
check('filename: stamped unchanged', cdd.deliveryFilename(meta(null), 'pdf').startsWith('CODE-Rx-R-v1.0-client-copy'));

console.log(failures ? `\n${failures} FAILURES` : '\nALL RAW DELIVERY TESTS PASSED');
process.exit(failures ? 1 : 0);

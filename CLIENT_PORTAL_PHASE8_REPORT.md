# CLIENT PORTAL — PHASE 8 REPORT

**Phase:** 8 — *SECURE WATERMARKED CLIENT DOCUMENT DELIVERY* (marked CRITICAL)
**Brief:** "Build the mandatory watermarking and stamping pipeline for client-facing documents."
**Branch:** `arena/01a0b09c-code-rx` · **Base:** `ad3a46b` (Phase 7) · **Date:** 2026-09-18

---

## 1. Headline result

| Verification | Checks | Passed | Failed | Success rate |
| --- | ---: | ---: | ---: | ---: |
| Backend suite — real Hono app on SQLite/D1 through the real routes | 1278 | 1278 | 0 | **100.0 %** |
| UI suite — real React components + the client delivery rules | 299 | 299 | 0 | **100.0 %** |
| Live HTTP verification against the built Worker (`wrangler pages dev`) | 63 | 63 | 0 | **100.0 %** |
| **Total** | **1640** | **1640** | **0** | **100.0 %** |
| Mutation testing (one Phase 8 safety rule broken at a time) | 14 | 14 detected | 0 survived | **no rule went unguarded** (see §8) |
| Deep engine probes (PDF stamping, PNG codec, image stamping, office conversion) | 113 | 113 | 0 | **100.0 %** |
| TypeScript (`tsc --noEmit -p tsconfig.json`) | — | clean | — | — |
| Production build (`npm run build`) | — | clean | — | — |

Phase 8 added **50 backend checks** (group 21), **31 UI checks** (group 13) and the whole 63-check live run.
No database migration was needed: the pipeline stores its cache key in the existing
`client_documents.storage_reference` column and its objects in the existing R2 bucket under `client-exports/`.

---

## 2. The brief, requirement by requirement

| # | Requirement | Where it lives | Proof |
| --- | --- | --- | --- |
| 1 | **Watermark** — CODE Rx SOCIETY, Code Rx mark, "CLIENT PROJECT DOCUMENT", project name, document reference, version, subtle logo watermark, footer | `functions/lib/client-delivery-pdf.ts` (header band, metadata block, diagonal watermark, footer), `buildStampedImage` in `client-document-delivery.ts`, `client-delivery-logo.ts` (embedded 96×96 mark) | backend group 21 (viewer PDF needles), live §1/§2/§8, `/home/user/phase8-samples/live-viewer-copy.png` |
| 2 | **Security** — the client never obtains the untouched original; internal source = PROTECTED; NO client-facing option to disable the watermark | client routes serve only `client-exports/…/crx-stamped-<fingerprint>.<ext>` produced by the pipeline; `storage_reference` is pipeline-managed (PATCH refuses hand-aimed keys, `code:'storage_reference_managed'`); no watermark field exists anywhere in the API or UI | group 21 (opt-out attempts, `?raw=1`, `/raw`, `/original`), UI group 13 (`no client component can switch the watermark off`), mutation M4/M6/M12 |
| 3 | **File types** — per type the safest delivery; unsupported formats are never exposed | `planClientDelivery` (`client-document-delivery.ts`): PDF → stamped PDF, PNG → stamped PNG, text/CSV/Markdown → generated PDF, DOCX/ODT → converted PDF, block/HTML/JSON snapshots → generated PDF, anything else → refusal | §3 matrix, backend group 21 (PDF/PNG/DOCX/JPEG cases), probes `pdf-test.mjs`, `delivery-test.mjs`, `verify.py` |
| 4 | **Storage** — originals protected, no permanent public raw-file URLs, authorized backend delivery only | every bucket read is gated to `vault/` keys and scoped to the client document's own Vault attachment; artifacts live under `client-exports/<client>/<document>/`; the only URLs the client ever sees are `/api/client/...` routes behind a session | group 21 (`the descriptor never leaks the storage key`), live §5/§8 (`the stored reference is not the vault key`) |
| 5 | **Download** — server-side authorized, delivered file keeps the watermark | `GET /api/client/project/:projectId/documents/:documentId/download` → `serveStampedArtifact(..., 'attachment')` | group 21, live §2 (`the download endpoint returns the same stamped artifact`) |
| 6 | **Print** — print output retains Code Rx branding | `GET …/print` serves the identical stamped artifact inline (the browser's PDF print then prints the watermark itself) | group 21 (`print output retains the Code Rx branding`), live §2 (byte-identical to viewer/download) |
| 7 | **Metadata** — project, document, reference, version, client-document designation | metadata block + footer of every artifact; `delivery.designation = 'CLIENT PROJECT DOCUMENT'` in the API payload | group 21 (`the deliverable carries the project, document, reference and version metadata`), live §1 |
| 8 | **Failure safety** — on failure return a controlled error, never the original | every failure path yields `DeliveryRefusal` → `409 delivery_unavailable` with a client-safe reason (`source_restricted`, `unsupported_attachment_mime`, `no_source_content`, `attachment_unreadable`, `pdf_encrypted`, …) and zero bytes | group 21 (unsupported, empty source, orphan attachment, restricted source), mutation M7/M8 |
| 9 | **Test** — viewer, download, print watermarks; raw original inaccessible; unauthorized and view-only users cannot download | groups 21 + UI group 13 + the live run | §7 below |

---

## 3. The delivery pipeline

```
client document ──► loadClientDeliveryContext ──► planClientDelivery ──► render ──► cache ──► serve
 (existing row)      (scope, meta, attachment)     (kind + safety)      (stamp)   (R2)     (viewer/print/download)
```

Every entry point (viewer, print, download, Phantom "prepare", Phantom preview descriptor) runs the same code:
`resolveClientDelivery` in `functions/lib/client-delivery-context.ts`. There is no second path and no fallback that
returns source bytes.

| Source | Planned delivery | How the client copy is produced |
| --- | --- | --- |
| PDF attachment (`application/pdf`) | `stamped_pdf` | Source pages are repainted with a branding layer: watermark, header band, metadata block, footer. Original artwork and text are kept; the file itself is rewritten (never proxied). |
| PNG attachment (`image/png`) | `stamped_png` | Decoded in-worker (own PNG codec), then repainted: header band with the mark, 6-row metadata block, rotated watermark, logo overlay, footer. The watermark is burned into the pixels. |
| Text / CSV / Markdown attachment | `converted_pdf` | Rendered as a branded PDF document. |
| DOCX / ODT (`…wordprocessingml…`, `…opendocument…`) | `converted_pdf` | ZIP + WordprocessingML read in-worker, text extracted, rendered as a branded PDF. The container is never handed over. |
| Published text snapshot | `generated_pdf` | Branded PDF built from the text. |
| Block / JSON / HTML / Markdown snapshot | `generated_pdf` (rich text) | Blocks are rendered as headings, paragraphs, lists, quotes, callouts, tables, code and embedded PNG images with the watermark layer. |
| JPEG, WebP, GIF, AVIF, SVG, ZIP, any unknown MIME | **refused** | `409 delivery_unavailable` / `unsupported_attachment_mime`. The untouched original is never a fallback. |
| No source content | **refused** | `no_source_content`. |
| Internal attachment whose bytes are missing | **refused** | `attachment_unreadable`. |
| Internal source that became sensitive/restricted/archived in the Vault | **refused** | `source_restricted`, message: "This document is not available for download. Contact Code Rx Society." |

Only `vault/`-prefixed keys are ever read, and only when they belong to the client document's own Vault attachment;
only `client-exports/`-prefixed keys are ever written or registered.

---

## 4. What the watermark contains

* **Header band** (page 1): the embedded Code Rx mark, "CODE Rx SOCIETY", "CLIENT PROJECT DOCUMENT", issue date and client name.
* **Metadata block**: PROJECT · DOCUMENT · REFERENCE · VERSION · CLIENT · DESIGNATION (`CLIENT PROJECT DOCUMENT · CODE Rx SOCIETY`).
* **Diagonal watermark** on every page: the Code Rx mark at 10 % opacity, "CODE Rx SOCIETY" at 58 pt and
  "CLIENT PROJECT DOCUMENT" at 20 pt, drawn under a transparency group.
* **Footer** on every page: designation, "Page N of M", the metadata line
  (client · project · project reference · document reference · version) and
  "Watermarked client copy — do not redistribute".
* **Running header** (pages 2+): document reference and the issuing authority.

Rendered proof: `/home/user/phase8-samples/live-viewer-copy.png` (a real copy served by the live Worker),
`branded-document.png`, `stamped-source-pdf.png`, `stamped-image.png`, `docx-conversion.png`.

---

## 5. Security model

1. **The client never receives a file the pipeline did not produce.** The download route reads the artifact the
   resolver returned; there is no branch that reads `storage_reference`, the Vault key or any other object.
2. **`storage_reference` is pipeline-managed.** `PATCH /api/phantom/client-documents/:documentId` refuses any value
   that is not a `client-exports/<client>/<document>/crx-stamped-<fingerprint>.<ext>` shape
   (`400 storage_reference_managed`). Proven by suite checks and live §5.
3. **File links require a real artifact.** A `file` destination is only issued when the document already has a
   pipeline artifact, so a link can never be the first thing to reach for a raw object.
4. **No client-facing switch.** There is no setting, query parameter, body field or route that disables the
   watermark; `watermark:false`, `?watermark=0`, `?raw=1`, `/raw`, `/original` were all exercised (400/409/404 or
   the same stamped bytes).
5. **Capability-gated.** Preparing a copy needs `clients.documents.edit`; downloads additionally need the document's
   `allow_download`, the client portal switch and the `client_downloads_enabled` master switch. All checks are
   server-side; hiding a button in the UI is not authorization.
6. **Fail closed.** Every refusal returns a controlled JSON error with a safe reason code, records `ACCESS_DENIED`
   (client activity) or `client.document.delivery.failed` (audit), and never leaks a key, a path or bytes.
7. **Cache keys are content-addressed.** `crx-stamped-<sha256-derived fingerprint>` means a changed source produces a
   new artifact, while an unchanged one is served from cache (`cached:true`).

---

## 6. Viewer, download and print are literally the same file

The suite and the live run both fetch all three endpoints and compare the bytes:

* `viewer == print == download` byte for byte (live §2, backend group 21);
* `Content-Disposition` is `inline` for viewer/print and `attachment` for download;
* every response is `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer` and carries `X-Code-Rx-Delivery: <kind>`;
* the portal renders the artifact in an `<object>` frame from an authenticated `fetch` → `blob:` URL
  (the client session token is a request header, so an `<iframe src>` could never have authenticated).

---

## 7. The scenarios the brief names

| Scenario | Test |
| --- | --- |
| Viewer has the watermark | group 21 `the viewer serves the stamped PDF, watermarked and branded`; live §1 |
| Download has the watermark | group 21 `the downloaded file is a stamped Code Rx PDF…`; live §2 |
| Print has the watermark | group 21 `print output retains the Code Rx branding…`; live §2 (byte-identical) |
| Raw original is inaccessible | group 21 `the raw internal original is not forwarded: its file marker never reaches the client`, `an object placed in client-exports/ by hand is never what the client receives`; live §8 (`RAW-ORIGINAL-SENTINEL-42` absent, stored key is a pipeline artifact) |
| Unauthorized user cannot download | group 21 `an anonymous caller cannot fetch a client copy (401)`, `a member without the delivery capability cannot prepare a client copy (403)`, `one client cannot download another client document (404)`; live §4 |
| View-only user cannot download | group 21 `a view-only client cannot download it, even though the artifact exists`; live §4 |
| Watermark cannot be disabled | group 21 (three opt-out attempts), UI group 13, live §3 |
| Failure safety | group 21 (unsupported, empty source, orphan attachment, restricted source); live §6 |

---

## 8. Mutation testing — 14 mutants, every one detected

Each mutant breaks exactly one Phase 8 safety rule in the real source; the shipped suite is then run and must fail.

| # | Mutated rule | Detected by |
| --- | --- | --- |
| M1 | A sensitive internal source is no longer refused at delivery | 2 checks |
| M2 | The document reader stops requiring view permission | 2 checks |
| M3 | The download route stops requiring download permission | 6 checks |
| M4 | `storage_reference` can be aimed at any `client-exports/` object again | 2 checks |
| M5 | A file link can be issued without a stamped copy | 1 check |
| M6 | The client descriptor advertises a download route in the operator preview | 1 check |
| M7 | An unsupported attachment is planned as if it were text | 4 checks |
| M8 | A document with no source content produces a copy anyway | 3 checks |
| M9 | The PDF watermark layer is dropped (header kept) | 12 checks |
| M10 | The stamped image loses its header band | 1 check |
| M11 | The pipeline artifact key check is loosened to the whole prefix | 1 check |
| M12 | The viewer accepts a delivery the server calls unstamped | 4 checks |
| M13 | Print is offered without view permission | 1 check |
| M14 | The refusal message stops naming Code Rx Society | 1 check |

**14 / 14 detected, 0 survived.** Two mutants (M8, M9) initially survived and two checks were added because of it:
an empty-snapshot document must refuse (`no_source_content`), and the artifact must contain the watermark *layer*
(ExtGState), not just the header mark. That is the point of the exercise — the gaps it found are now closed.

---

## 9. Live verification (63 checks, built Worker, real HTTP)

Run with `python3 /tmp/p8/live.py` against `wrangler pages dev dist --port 8788`: PHANTOM signs in, a client and
project are created, documents are published, a passkey signs in as the client, and every requirement is re-checked
over real HTTP against real D1 and R2 — including a **real internal PDF** seeded into the protected `vault/` area
(section 8), which is delivered as a stamped PDF whose stored reference is
`client-exports/cli_…/doc_…/crx-stamped-….pdf` while the original's marker never appears in what the client receives.

A saved copy of that live delivery is in `/home/user/phase8-samples/`:

| File | What it is |
| --- | --- |
| `live-viewer-copy.pdf` (34,761 B) | The exact bytes the client session received from `…/preview` |
| `live-viewer-copy.png` (193,716 B) | Page 1 rendered at 1.6× (595.28 × 841.89 pt) |
| `branded-document.png`, `stamped-source-pdf.png`, `stamped-image.png`, `docx-conversion.png` | Engine-level renders (rich text, stamped PDF, stamped PNG, DOCX conversion) |

---

## 10. Files changed

| File | Change |
| --- | --- |
| `functions/lib/client-delivery.ts` | **new** — in-worker deflate/inflate/SHA-256/CRC32, PNG encode+decode, `Canvas`, `BRAND`, 5×7 bitmap font, `DeliveryError` |
| `functions/lib/client-delivery-pdf.ts` | **new** — PDF writer and stamper: latin1-safe operators, core-font text, image XObjects, branding layer, metadata block, watermark, footer, source-page repaint |
| `functions/lib/client-delivery-logo.ts` | **new** — the Code Rx mark (96×96 RGBA, base64) decoded at render time |
| `functions/lib/client-delivery-office.ts` | **new** — ZIP reader + WordprocessingML/ODF text extraction for DOCX/ODT |
| `functions/lib/client-document-delivery.ts` | **new** — `planClientDelivery`, `renderClientDelivery`, `ensureClientDeliveryArtifact`, `refreshClientDeliveryArtifact`, `readClientArtifact`, `isDeliveryArtifactKey`, `buildStampedImage` |
| `functions/lib/client-delivery-context.ts` | **new** — `loadClientDeliveryContext`, `resolveClientDelivery`, attachment resolution, `recordArtifactReference` |
| `functions/client-routes.ts` | client read returns the delivery descriptor instead of raw content; new `…/preview` and `…/print`; download serves the pipeline artifact; Phantom `POST /api/phantom/client-documents/:documentId/delivery`; `storage_reference` is pipeline-managed; file links require an artifact; Phantom preview returns a path-less descriptor |
| `src/lib/cloudflare.ts` | `clientPortal.stampedCopy()` (authenticated blob fetch), `clientAccessCenter.prepareDelivery()` |
| `src/lib/projectRoom.ts` | `RoomDelivery`, fail-closed `parseDelivery`, `deliveryAvailable`, `canPrint`, `deliveryMessage` |
| `src/components/ClientProjectRoom.tsx` | viewer now renders the stamped artifact (`StampedCopyPanel`): print, new-tab, inline frame; the raw-text renderer was removed |
| `src/components/ClientAccessCenter.tsx` | "Prepare / Refresh stamped copy" action; link dialog copy updated to the pipeline |
| `scripts/client-portal-tests.mjs` | group 21 (50 checks) + updated delivery assertions throughout |
| `scripts/client-portal-ui-tests.mjs` | group 13 (31 checks) |
| `CLIENT_PORTAL_PHASE8_REPORT.md` | this report |

No schema file, migration, table or column was added.

---

## 11. Reuse (no duplicate systems)

* **Storage**: the existing R2 bucket and the existing `client_documents.storage_reference` column — no new table,
  no new bucket, no new column, no migration.
* **Authorization**: the existing client sessions, `clientDocumentExposure`, the existing capability system
  (`clients.documents.edit`, `clients.links.*`) and the existing master switches. No second permission model.
* **Audit/activity**: the existing `audit_logs` writer — `client.document.delivery.prepared`,
  `client.document.delivery.failed`, `DOCUMENT_VIEWED`/`DOWNLOADED` with the delivery kind attached.
* **PDF/office/PNG work** happens in the Worker with no new dependency (no sharp, no canvas, no external service),
  which is why the codec and PDF writer are in-repo libraries rather than a service call.

Two deliberate tightenings, both additive:
`storage_reference` can no longer be set by hand (it is the pipeline's cache pointer), and a `file` link is issued
only when a real pipeline artifact exists. Legacy values are ignored at delivery time and overwritten the first time
the document is delivered.

---

## 12. How to operate it (PHANTOM)

1. **Publish** a document as before (Vault pin or text). Nothing changes in the publishing flow.
2. **Prepare stamped copy** appears on every document row in PHANTOM → Clients → Documents; it renders (or refreshes)
   the client copy and reports the kind, size and digest. It is optional — the first viewer/download renders it anyway.
3. **Link to a specific file** only becomes available once the copy exists; the dialog says so when it does not.
4. **Revoke, expire, suspend** anything as before — delivery stops with the link.

---

## 13. Known limits (stated, not hidden)

* 16-bit PNG sources are decoded using the high byte (display-equivalent); greyscale+alpha, palette, interlaced and
  all five filter types are covered by the decode matrix (10/10 against an ImageMagick oracle).
* JPEG/WebP/GIF/AVIF are **refused**, not re-encoded: re-encoding would degrade the client's artwork, and refusing is
  the safe side of the brief.
* DOCX conversion extracts WordprocessingML text; embedded images and complex table layout are not reproduced — the
  original container is never handed over.
* PDF stamping preserves the source artwork and text and rewrites the page content streams; encrypted PDFs are refused.
* The deep probe `pdf-test.mjs` still prints `carries branding ops: true false` — a cosmetic raw-byte grep that cannot
  see Flate-compressed operators; text extraction (`verify.py`, `live.py`) proves the branding is present.
* The `client-exports/` cache grows one object per (document, source fingerprint). Clearing it is safe: artifacts are
  re-rendered on demand.

---

## 14. Success rate

**100.0 % — 1640 of 1640 checks pass** (1278 backend + 299 UI + 63 live), with 14 of 14 mutation attempts detected and
113 of 113 engine-probe checks green. Phase 8 is complete and ready for the next phase.

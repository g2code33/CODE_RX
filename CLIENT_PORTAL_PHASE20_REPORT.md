# Phase 20 — One logo everywhere, PHANTOM in the client's room, and a review section that reaches PHANTOM

**Delivered on branch `arena/01a0b09c-code-rx`.** One image asset, one delivery
pipeline, one notification inbox, one audit trail, one client activity log. No
new dependency, no parallel system, no unrelated rewrite.

---

## What was asked, and what was found

| # | The ask | What was actually wrong | What was done |
|---|---------|------------------------|---------------|
| 1 | "all logo references must be `public/CODE RX11.png` — change the bad logo used in the watermark and header title of letters" | The letter's header band and its diagonal watermark were stamped with a **96×96 mark derived from `public/logo-small.png`** — a different, older piece of artwork. Beyond the letters, the Home page Hero, the client screens' sign, the favicon, the home-screen icons, the install manifest and the offline cache all still asked for `/logo.png`, `/logo-small.png` or `/icon-*.png`. | `BRAND_MARK_PNG_BASE64` is now the official mark, re-encoded from `public/CODE RX11.png` (96×96, 8-bit RGBA). Every reference on the site, in the editor defaults, in the worker, in the manifest and on every client screen points at `/CODE%20RX11.png`. The retired assets are **deleted** — `public/` holds exactly one image. |
| 2 | "the client project room must carry the text PHANTOM" | The room named the client and the project but never said who at Code Rx handles it. | The room header now carries a **PHANTOM** sign, described in the client's own terms ("your Code Rx desk") — in the live room and in the PHANTOM preview alike. |
| 3 | "a review section on everything sent to a client — approve, decline, pending, custom — the feedback must reach PHANTOM and trigger a notification" | There was no way for a client to answer a document: a client could only read it (and, since Phase 19, work on it). | Every document a client can open now carries a **Review this document** section: the four answers, free text for the client's own words, a note that goes with any of them, and a **Send to PHANTOM** action that raises a notification in the existing inbox. |

---

## The rules this phase respects

1. **One logo.** `public/CODE RX11.png` (512×512) is the society's only mark. The
   letter's header band and watermark are both drawn from it, so a printed
   letter, the portal, the browser tab and an installed home-screen icon are the
   same artwork.
2. **Reuse.** The review section uses the table-and-inbox plumbing the platform
   already has: `clientNotificationRecipients()` + `createNotification()` for the
   PHANTOM notice, `recordClientActivity()` for the client's history, `audit()`
   for the trail — and it piggybacks the Recycle Bin so an answer survives a
   delete-and-restore.
3. **A review is feedback, never access.** The four answers cannot publish,
   unpublish, archive, download or move a version. That is proven, not asserted:
   after answering, the document is still published, still client-visible, and on
   the same version. The client is told this in the section itself.
4. **Nothing about a client leaks.** The review is scoped by the client session
   and the project in the URL; another client's session gets an opaque 404 on
   both read and answer. An unpublished document cannot be reached through the
   review route at all.
5. **A stale database cannot keep showing the old logo.** The logo rule is one
   exported policy (`normalizeBrandLogosInContent`) used both by the boot
   migration and by the public content read, so a payload saved before this phase
   is healed on the read that would have shown it — and the stored copy is
   corrected in the same breath.

---

## Proof

| Gate | Command | Result |
|------|---------|--------|
| Backend harness | `npm run test:client-portal` | **1505 / 1505** |
| UI harness | `npm run test:client-portal-ui` | **657 / 657** |
| Phase 20 live check | `node scripts/phase20-live-check.mjs` | **56 / 56** |
| Phase 18 live check (re-run) | `node scripts/phase18-live-check.mjs` | **34 / 34** |
| Panel + room, driven in a real DOM | `node scripts/client-panel-dom-check.mjs` | **31 / 31** |
| Public addresses + client door | `node scripts/browser-dom-check.mjs` | green |

**Total: 2283 / 2283 checks = 100.0 %.** TypeScript is clean for `src/` and for
`functions/` (the pre-existing duplicate-JSX-attribute and Context-variance
diagnostics in the older routes are unchanged and out of scope).

### The logo, measured rather than assumed

The tests decode the PNGs and compare pixels, so "the letter carries the official
logo" is a measurement, not a filename:

| Measurement | Result |
|---|---|
| The mark the delivery pipeline embeds, vs a 96×96 render of `public/CODE RX11.png` | mean channel difference **10.42** (the retired mark measures **92.40**; the tests fail above 25) |
| The header-band mark inside a delivered letter, vs the official mark over that band's own colour | **6.32** |
| The watermark mark inside the same letter, vs the official mark over white | **0.89** |
| Image assets shipped in `public/` | **1** (`CODE RX11.png`) |
| Retired addresses still referenced anywhere in `src/`, the page, the worker or the manifest | **0** |
| A saved payload naming `/logo.png` and `/logo-small.png`, read back | all five published logo slots answer `/CODE%20RX11.png`, and the stored row is healed |

---

## Production notes

- **Nothing changes on `coderxsociety.pages.dev` until `main` is deployed.**
  Push the branch to `main`; `.github/workflows/deploy.yml` builds and deploys
  the site and the API together.
- The retired image files are deleted, which is safe: the schema bootstrap (and
  the content read path) rewrite any stored `/logo.png` reference to the official
  mark on the first request after the deploy.
- Client access still has to be switched on in the production database
  (PHANTOM → Client Access → Permissions → *Client portal settings* → tick
  *Client access* → **Save portal settings**), and access keys must be issued
  there — the preview's database is separate.

# Code Rx — Client Portal, Phase 14
## Long key removed · way back to the website · contact reduced to three small actions

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (continues from `7fca970`)
**Type:** client-screen cleanup. One format, one header sign, one compact contact row. **No database migration.**
**Result:** interface suite **386/386**, backend suite **1332/1332**, live checks **9/9**, type check clean,
production build exit 0 → **1727/1727 = 100.0 %**.

---

## 1. What you asked for

> "remove the long key entirely · add back to website sign there · remove the copy address, make it contact code rx,
> contact phantom and telegram — make it just suitable not too big very nice"

Three changes, exactly as asked, nothing beside them.

## 2. The long key is gone — entirely

| | Phase 13 | Now |
| --- | --- | --- |
| Client screen | three boxes **plus** a "Using a long key issued earlier?" fallback field | **three boxes only** — no second field, no toggle |
| Client helper | accepted bodies of 9–32 characters | accepts **exactly 9**; anything longer is refused with "An access key is 9 characters. Check the key and try again." |
| Server (`normalizeClientPasskey`) | accepted bodies of 9–32 characters | accepts **exactly 9**; a 16-character body is refused before any hash lookup |
| Server hint | project code for a short key, last four characters for a long one | always the project code |
| Test fixtures | a 16-character dark-login fixture | the canonical shape only |

**Read this before you deploy it:** a client who is still holding a long key can no longer sign in at all — that is
what "entirely" means, and it is why the refusal is deliberate and total rather than a silent half-read. The recovery
is one tap: **PHANTOM → Clients → the client → Keys → Regenerate**. It mints a short key for the same project
(keeping that project's code), and revokes that key's old sessions and links in the same action. Keys already issued
in the short format keep working — verified live with `CRX-22G-LVJ-MSD`.

There is no half state anywhere: no hidden acceptance window, no fallback field kept "just in case", no migration, and
no stored key is deleted — only a key that cannot be presented any more.

## 3. A way back to the website, on every client screen

A new shared component, `ClientSiteSign`, replaces the loose logo markup in all three client headers:

* the Code Rx lockup — logo, **CODE Rx SOCIETY** and the screen's own subtitle — is now a real link home, with the
  accessible name "Code Rx Society website home";
* beside it sits a small, plain **Back to website** sign (`← Back to website`), so the way out is visible and not a
  guess about whether the logo is clickable;
* it points at the site root only (`/`) — never at a hash, so it can never be mistaken for a credential or for the
  portal's own `#client-portal` address;
* it is used by the sign-in screen, the ended-link screens and the project room (which keeps its
  "Client Project Room" subtitle through the same component).

## 4. Contact: three small actions

| Before (Phase 12) | Now |
| --- | --- |
| A wide three-column grid of large buttons: *Contact Code Rx Society*, *Copy address*, *Telegram* | One row of **three small chips**: **Contact Code Rx** · **Contact PHANTOM** · **Telegram** |
| The full address printed under them, plus every telephone number as a `tel:` link | No address line, no telephone list, nothing to copy |
| A copy-to-clipboard button with its own copied/failed states and a blocked-clipboard note | Removed |

* **Contact Code Rx** — a mail message to the society's published address (`links.footer.email`), with this screen's
  context already written into the subject, exactly as before.
* **Contact PHANTOM** — the website's **existing** PHANTOM contact form, not a second contact system. The chip links to
  `/#contact-phantom`, and the website's footer now honours that hash by opening the same `ContactForm` modal its own
  "Contact PHANTOM" buttons open. That route is a form on a page, so it still works where a `mailto:` handler does
  not — which is the machine-independence the Phase 12 copy button was defending, now achieved without a clipboard.
* **Telegram** — the society's channel from the published site content, in a new tab (`noopener noreferrer`).

Nothing got bigger: the block is a two-line heading plus a single wrapped row of chips, and it drops out of the way on
a phone (the chips wrap, they never overflow). The address, the phone numbers and the whole website remain one click
away through the new header sign; `clientContact()` still reads them from published site content, so they cannot drift.

## 5. Files

| File | Change |
| --- | --- |
| `functions/lib/client-auth.ts` | One key format: `CLIENT_PASSKEY_BODY_LENGTH` replaces the 9–32 window; the normaliser accepts exactly that length; the hint is always the project code; comments no longer describe a legacy format |
| `functions/client-routes.ts` | Key-mint comment corrected (project-code hint); no behaviour change beyond the normaliser |
| `src/lib/accessKey.ts` | `ACCESS_KEY_LEGACY_BODY_LENGTH`, the min/max window and `compactAccessKey` deleted; the typed buffer is bounded at 32 so an old key is *reported* as the wrong length, never silently halved; the prefix rule now runs before the length cut |
| `src/components/ClientAccessScreen.tsx` | The fallback field, its toggle and its state removed; header uses `ClientSiteSign` |
| `src/components/ClientSiteSign.tsx` | **new** — the shared header sign with the link home |
| `src/components/ClientLinkState.tsx` | Uses `ClientSiteSign`; the mail chip keeps the plain label |
| `src/components/ClientProjectRoom.tsx` | Uses `ClientSiteSign` with the room's own subtitle |
| `src/components/ClientSupportContact.tsx` | Rebuilt as the three-chip row; the copy button, the clipboard states, the address line and the phone list are gone |
| `src/lib/linkAccess.ts` | `CLIENT_SITE_HOME`, `PHANTOM_CONTACT_HASH`, `phantomContactHref()` added; the now-unused `telHref` retired |
| `src/components/Footer.tsx` | Opens the existing PHANTOM form when the website is reached with `#contact-phantom` |
| `scripts/client-portal-ui-tests.mjs` | Checks moved to the one format, the header sign and the three chips (386 checks) |
| `scripts/client-portal-tests.mjs` | The long key is now asserted to be *refused*; fixtures use the canonical shape (1332 checks) |

## 6. Verification

* **Interface suite** — `npm run test:client-portal-ui`: **386 checks, 386 pass, 0 fail.**
* **Backend suite** — `npm run test:client-portal`: **1332 checks, 1332 pass, 0 fail.**
* **Type check** — `tsc --noEmit`: clean. **Build** — `npm run build`: exit 0.
* **Live, against the running preview** (`http://127.0.0.1:8788`):

| # | Live check | Result |
| --- | --- | --- |
| 1 | Public site `/` | 200 |
| 2 | Client portal entry `/#client-portal` | 200 |
| 3 | Published site content `/api/site-content` | 200 |
| 4 | Served bundle: header sign + `#contact-phantom` chip present, no long-key field, no "Copy address" | ✔ 2 / 1 / 0 / 0 |
| 5 | PHANTOM sign-in and portal switch still work | 200 / 200 |
| 6 | Fresh key minted for "Malaria Surveillance Dashboard" | `CRX-4SY-6RA-MSD` (code `MSD`) |
| 7 | That key signs in exactly, and typed lowercase with spaces | 200 / 200 |
| 8 | The long key `CRX-8K4P-X92M-7LQF-B3TD` is refused, and so is a wrong project code | 401 / 401 |
| 9 | Project room renders with the session (7 sections) | 200 |

Static walk-through of the shipped components (sign-in, ended link, room header — real components, real stylesheet):
`phase14-client-screens-preview.html`.

## 7. Database

**No migration.** `client_access_keys` is untouched: the same verifier and hint columns, the same rows. What changed
is which values the server will even consider a key.

## 8. Notes for the next phase

* A long key in a client's hands is now dead weight — regenerate it from the PHANTOM workspace (one tap, same project
  code) rather than issuing a new key by hand.
* `PHANTOM_CONTACT_HASH` (`#contact-phantom`) is the single deep link to the PHANTOM form; if the website's footer is
  ever rewritten, that hash is the contract the client screens depend on.
* The client screens no longer render the address or the phone numbers anywhere — they live on the website, one click
  away through the header sign.

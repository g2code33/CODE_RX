# Code Rx — Client Portal, Phase 12
## Client access field rebuilt · "Contact Code Rx Society" fixed

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (continues from `f33ed69`)
**Type:** UX fix on the client access experience — no API change, no schema change, no new route.
**Result:** interface suite **374/374**, backend suite **1327/1327**, live bundle checks **6/6**, type check clean,
production build exit 0 → **1707/1707 = 100.0 %**.

---

## 1. What you reported, and what was actually wrong

### "The contact Code Rx Society at the client page is not working"

The block was a single hard-coded link: `mailto:coderxsociety@gmail.com?subject=Client%20portal%20access`.

* A `mailto:` link does **nothing** inside an embedded browser (the preview frame), a private window, or a phone with
  no mail app configured — which is exactly what "not working" looks like.
* It was **hard-coded**, so it ignored the contact details stored in the website editor. Change the society's address
  or Telegram in the editor and the client page kept pointing at the old one.

### "The text box for the access key entry is malfunctioning"

The field rewrote the client's text **on every keystroke** (`formatAccessKey` in `onChange`):

* it re-capitalised and re-grouped the whole value while typing, and the caret is not managed by React — so the cursor
  **jumped to the end** whenever you typed or edited in the middle;
* it **silently deleted** any character not in the key alphabet (0, O, 1, I), so pressing those keys appeared to do
  nothing at all;
* the placeholder advertised **three** groups (`CRX-____-____-____`) while every issued key has **four**
  (`CRX-XXXX-XXXX-XXXX-XXXX`), and the wide letter-spacing made a full key overflow the field on a phone.

## 2. What was changed

### The field (rebuilt, same screen, same copy)

| Before | Now |
| --- | --- |
| Value rewritten on every keystroke; caret jumped; characters vanished | **Nothing is rewritten while you type.** The text stays exactly as entered, and is tidied into `CRX-XXXX-XXXX-XXXX-XXXX` only when you leave the field, paste, or submit |
| A glyph a key can never contain was deleted mid-word | It **stays visible** and the guidance explains it: "Access keys never contain 0, O, 1, I — check the key." |
| Paste handled like typing | **Paste anywhere** — lowercase, spaces, no dashes, with the prefix, with surrounding text. A complete key is **verified immediately**, with no second tap |
| No feedback until submit | **Live guidance**: four group markers fill as the key arrives, a live `n of 16 characters` count, "Looks complete — press Enter Project", a green field state when ready |
| No way to clear the field | **Clear (✕) button**, plus **"Paste from clipboard"** where the browser allows it (with a press-and-hold hint where it does not) |
| Sized for a desktop; overflowed small phones | Mobile-first sizing: smaller type and tracking with no left icon under `sm`, larger centred field above it; a 22-character key never overflows |
| Placeholder showed three groups | Placeholder shows the shape a real key has: `CRX-____-____-____-____` |

Kept exactly as the Phase 3 brief required: `CLIENT ACCESS` heading, `Enter your project access key` helper, the seven
failure messages, "Need assistance?", the single labelled field, Enter-to-submit, the "never stored in this browser"
line, and the raw key still never leaving the component (state only — no storage, no URL).

### The contact block (new shared component)

`src/components/ClientSupportContact.tsx` is now used by **the access screen and both temporary-link end-state
screens** (expired / revoked / used / unknown), so the client always has a working way to reach the society:

* **Email us** — a mail link that carries the screen's context in the subject and body;
* **Copy address** — copies the address to the clipboard, confirms with "Address copied", and when a browser blocks
  the clipboard says so and points at the address that is printed on screen (never a dead end);
* **Telegram** — opens the society's channel in a new tab, which works in every environment including the preview frame;
* the address is always visible and selectable, and the published phone numbers are dialled as `tel:` links;
* **one source of truth:** the details are read from the published site content (`links.footer.email`,
  `footer.telegram`, `footer.phoneOne/Two` — the same values the public footer uses), so editing them in the website
  editor updates the client page too. Empty values fall back to the society defaults, and clearing one in the editor
  removes it from the client page.

## 3. Files changed

| File | Change |
| --- | --- |
| `src/components/ClientAccessScreen.tsx` | rebuilt field (no mid-typing rewrite, live guidance, group markers, clear/paste, mobile sizing) + shared contact block |
| `src/components/ClientSupportContact.tsx` | **new** — email, copy-address with fallback, Telegram, telephone |
| `src/components/ClientLinkState.tsx` | uses the shared contact block; keeps its own context-aware subject |
| `src/lib/linkAccess.ts` | `clientContact()`, `clientSupportMailto()`, `telHref()`; `linkContactHref(headline, email?)` |
| `src/lib/accessKey.ts` | placeholder now matches the four-group key shape |
| `src/components/ClientPortal.tsx` | passes the published contact details to both screens |
| `src/App.tsx` | hands `siteContent.links` to the client workspace (one line) |
| `scripts/client-portal-ui-tests.mjs` | new group 16 (20 checks) + the placeholder expectation updated |

**Database migrations: none. API changes: none. New routes: none.**

## 4. Tests performed

| Check | Result |
| --- | --- |
| Interface suite, including the new group 16 | **374/374** |
| Backend suite | **1327/1327** |
| Type check (`tsc --noEmit`) | clean |
| Production build | exit 0 |
| Live served bundle carries the new field guidance, paste affordance, copy action and true placeholder | **6/6** |
| Live portal login through the access-key API still succeeds | 200 |

Group 16 locks the behaviour in code, not in prose: that typing is never re-grouped under the caret, that tidying
happens on blur/paste, that an impossible glyph is explained rather than deleted, that a complete pasted key verifies
by itself, that the field carries one input, a clear control, a labelled/busy/`enterKeyHint` contract, and that the
contact block has a mail link **plus** copy, channel and telephone routes driven by the published site content.

**One previously recorded expectation was updated, deliberately:** the Phase 3 placeholder literal
(`CRX-____-____-____`) promised three groups while every issued key has four. The constant and its assertion now read
`CRX-____-____-____-____`. The brief's headings, instructions and error wording are untouched.

## 5. Success rate

**1707/1707 = 100.0 %** (374 interface + 1327 backend + 6 live bundle checks).

## 6. How to see it

The preview is running on port **8788** with the rebuilt bundle:

1. Click any client entry (footer, project page, navigation key button, or the sign-in dialog) → `#client-portal`.
2. Type a key by hand: nothing is rewritten, nothing disappears, the four markers fill and the counter tracks you.
   Type a `0` or `O` and you are told why it cannot be in a key — it stays on screen.
3. Paste the preview key (`CRX-YFW7-WMRF-V7KF-L8PK`, sandbox-local): it tidies itself and verifies immediately.
4. Press **Enter Project** → the project room opens.
5. Under the form, **Contact Code Rx Society** now offers Email, **Copy address** and **Telegram**, with the address
   and phone numbers always visible.

A static visual of the rebuilt screen (real component, site stylesheet) is saved at
`phase12-client-access-preview.html` in the workspace root, outside the repository.

---

**Phase 12 complete.** The access key field no longer fights the typist, and a client can always reach Code Rx Society
from the client page — by email, by copying the address, by Telegram, or by phone.

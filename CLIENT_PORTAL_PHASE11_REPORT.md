# Code Rx — Client Portal, Phase 11
## Public entry points to the client project room

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (continues from `426b7f5`)
**Type:** small additive UI phase — no new feature surface, no new route, no new API, no schema change.
**Result:** interface suite **354/354**, backend suite **1327/1327**, live bundle checks **6/6**, type check clean,
production build exit 0 → **1687/1687 = 100.0 %**.

---

## 1. The request

> "Make clients also be able to open client portal or project through the main website
> 1. one at the footer, 2. other at the top right of the project page,
> 3. anywhere you think is possible and nice and cool."

A client is not a member: there is no account and no password, so the client door could never live behind the
**Member Portal** button. Phase 11 adds a public, clearly-labelled way in from the website itself.

## 2. What was added

One shared component — `src/components/ClientPortalEntry.tsx` — rendered in five places, in three shapes.
Every one of them points at the **same single address** the access key signs in to: `#client-portal`.
None of them carries a token, a key or any credential in the URL.

| # | Where | Shape | What the client sees |
| --- | --- | --- | --- |
| 1 | **Footer**, in the brand column with the logo/social row, above the newsletter divider | `tile` | "Client project room — Enter your project access key", key badge + arrow. Its label is editable with the rest of the footer copy in the visual editor |
| 2 | **Project page** — top right of the project list, beside the `#projects` section link | `chip` | "Client project room ↗" |
| 3 | **Project page** — top right of an *open* project, opposite "Back to lab" | `chip` | the same door, so a client reading a project never has to hunt for it |
| 4 | **Navigation bar** — every public page (desktop icon button, and a full-width tile in the mobile menu) | `icon` / `tile` | a quiet key button next to **Member Portal**; spelled out in the mobile menu |
| 5 | **Sign-in dialog** — above "Connect with us" | `tile` | for the person who came looking for a login and actually needs their project |

Session-aware wording (the "cool" part): if this tab already holds a live client session, the entry becomes
**"Open my project — Continue in your client project room"**, so a returning client recognises their own
workspace instead of being offered a key field they have already used.

## 3. Why this is safe

* **It is presentation only.** The component renders one `<a href="#client-portal">`. It makes no API call,
  writes nothing to storage, and grants nothing — the access key is still exchanged and verified on Code Rx
  servers exactly as before.
* **No credential in the address.** The destination is the bare workspace hash. Link tokens (`#client-portal/link/<token>`)
  are still only produced by the PHANTOM workspace and are still stripped from the address bar after exchange.
* **No new route, no new API, no new permission.** The `/api/client/*` surface and the server-side
  authorization from Phases 3–10 are untouched; this phase changes only who can *find* the door.
* **Nothing was redesigned.** The member portal button, its labels and its behaviour are unchanged; the client
  access screen, link end-states and project room are byte-for-byte what Phase 10 audited.
* **The dashboard shells hide it.** The navigation entry is suppressed inside the member dashboard and the
  PHANTOM workspace, so it never competes with member controls.
* **Accessibility.** Each shape carries a proper `aria-label` ("Open the client project room with your project
  access key"), the icon button additionally has a `title`, and all shapes are normal keyboard-focusable links.

## 4. Files changed

| File | Change |
| --- | --- |
| `src/components/ClientPortalEntry.tsx` | **new** — the shared entry (three variants: `chip`, `tile`, `icon`) |
| `src/lib/linkAccess.ts` | +27 lines: `CLIENT_PORTAL_HASH`, `clientPortalPath()`, `clientEntryCopy(hasSession)` — pure, reused by the component and the tests |
| `src/components/Footer.tsx` | one entry tile in the brand column (editable label) |
| `src/components/Projects.tsx` | entry at the top right of the project list and of an open project |
| `src/components/Navbar.tsx` | entry on every public page (desktop icon + mobile tile) |
| `src/components/AuthModal.tsx` | entry in the sign-in dialog |
| `scripts/client-portal-ui-tests.mjs` | +75 lines: new group 15 locking all of the above |

**Database migrations: none.** No schema, setting, table or data change.
**API changes: none.**

## 5. Tests performed (all executed, none assumed)

| Check | Result |
| --- | --- |
| Interface suite (`npm run test:client-portal-ui`) incl. the 17 new entry-point checks | **354/354** |
| Backend suite (`npm run test:client-portal`) | **1327/1327** |
| Type check (`tsc --noEmit`) | clean |
| Production build (`npm run build`) | exit 0 |
| Live served bundle carries the entry, the hash and the returning-client wording, and no access key | **6/6** |
| Live portal flow through the new door (access key → session → project room → published document) | pass |

The new group 15 renders the real component (no copies) in all three shapes and asserts the destination, the
accessible labelling, the returning-client wording, the absence of any credential in the URL, and that the
component performs no request and reads nothing but this tab's session. It also asserts each of the five
placements in source, that the member portal button is untouched, and that the client screens themselves
gained no link back.

## 6. Success rate

**1687/1687 = 100.0 %** (354 interface + 1327 backend + 6 live bundle checks).

## 7. How to see it

The preview server is running on port **8788** with real Pages Functions, local D1 and local R2.

1. Open the site — the footer entry sits in the brand column, and the key button sits in the navigation bar.
2. Scroll to **Project lab** — the entry is at the top right; open any project and it is at the top right again.
3. Click **Member Portal** — the sign-in dialog offers the client door above "Connect with us".
4. Click any of them: the address bar becomes `…/#client-portal` and the **CLIENT ACCESS** screen appears.
5. Type the preview access key (given in chat — it is local to this sandbox only) and press **Enter Project**:
   the project room opens on *Asante Health Trust (preview) → Malaria Surveillance Dashboard*, with
   *District Rollout Summary* carrying a **NEW** badge.
6. Close the tab and open the site again: the entry now reads **"Open my project"** while that tab's session is live.

A static visual of the three shapes is saved at `phase11-client-entry-preview.html` (workspace root, outside the
repository) — it is rendered from the real component with the site's own stylesheet.

---

**Phase 11 complete.** The client portal is now reachable from the main website: the footer, the project pages,
the navigation bar of every public page, and the sign-in dialog — all pointing at the same server-authorized door.

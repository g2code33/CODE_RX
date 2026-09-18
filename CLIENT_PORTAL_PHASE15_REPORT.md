# Code Rx — Client Portal, Phase 15
## "Talk to PHANTOM" everywhere · a contact form you can actually read · no logo glow · a PHANTOM section for every website emoji

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (continues from `5bf29f0`)
**Type:** public-website polish, wording and a new PHANTOM section. **No database migration.**
**Result:** interface suite **409/409**, backend suite **1332/1332**, live checks **14/14**, type check clean,
production build exit 0 → **1755/1755 = 100.0 %**.

---

## 1. What you asked for

> "change all contact phatom on the website to talk to phatom · the contact phantom page ui is very poor — the
> visibility is not there, users cannot read what is there · add a section in admin to be able to change all emojis
> that are available in the website, and can replace it with png, jpeg and image · remove the glo on the website logo
> and make it show more well and more visible"

Four changes, all four delivered, nothing else touched.

## 2. "Contact PHANTOM" no longer exists anywhere

| Where | Before | Now |
| --- | --- | --- |
| Footer button (visible label) | Contact PHANTOM | **Talk to PHANTOM** |
| Footer button (screen-reader label + tooltip) | Contact PHANTOM | **Talk to PHANTOM** |
| Contact form heading | Contact PHANTOM | **Talk to PHANTOM.** |
| Contact form eyebrow + close button label | Contact PHANTOM | **Talk to PHANTOM** |
| Client portal chip (Phase 14) | Contact PHANTOM | **Talk to PHANTOM** (same three-chip row, same size) |

Verified by search, not by eye: `Contact PHANTOM` appears **0 times** in the source and **0 times** in the built
bundle; `Talk to PHANTOM` appears 7 times in the built bundle across the footer and the form.

## 3. The contact form is now readable — this was treated as a defect, not cosmetics

The report was "the visibility is not there, users cannot read what is there". The cause was structural: the form was
a translucent panel over the page, styled with theme utilities that the site's own accent overrides recolour, with a
close button that rendered white-on-white at desktop size, and its fields sat on a washed surface with light labels.

| | Before | Now |
| --- | --- | --- |
| Surface | translucent panel over the live page | **solid white card on a dark green header** |
| Heading | small, low-contrast | 3xl–4xl **white on `#063b2a`**, `PHANTOM.` in lime |
| Close control | floating, could render white-on-white | **inside the dark header** — `h-10 w-10`, white ring on white/10 |
| Colours | theme utilities that the site's `.brand-app` overrides can recolour | **explicit hex values only** — the overrides cannot reach them |
| Fields | compact, light labels, 14px | **labelled 12px uppercase `#334155`**, white boxes on `#cbd5e1` borders, 15px text `#0f172a`, focus ring `#15803d` |
| Layout | mixed width | one column, `max-w-2xl`, scrolls on a phone |
| Topics | — | three chips, `aria-pressed`, keystroke-visible |
| Errors / success | small text | rose alert block; success view names the email you typed, with "Send another message" |

The form is unchanged in behaviour: it still writes through the existing contact API and still shows the mail
fallback address — only the presentation changed.

## 4. The glow is gone, and the logo is bigger and unmuted

* `.brand-logo-glow` (a lime drop-shadow), `@keyframes brand-pulse` and `.animate-brand-pulse` are **deleted** from
  `src/index.css`. The pulse was the real culprit: it faded the emblem to 55 % opacity in a loop, so the logo spent
  half its life half-visible.
* The Navbar's blurred halo span is removed. Both the navbar and the footer now draw the logo on a new
  `.brand-logo-plate` — solid white, soft shadow, hairline green outline — at **h-12/h-14 (navbar)** and **h-14
  (footer)**, larger than the old faded badge. Hero and About show the artwork plain, at full opacity, with no glow
  and no animation on the image itself.
* Search-verified: `brand-logo-glow` and `brand-pulse` appear **0 times** in the source and 0 times in the bundle.

## 5. New PHANTOM section: every website emoji, replaceable with your own image

**Where it lives:** PHANTOM Control Centre → **Site Emojis** (between *Community Control* and *Media Management*). It
is a section in the admin workspace you already have — not a second admin, not a new page outside it.

**What it lists:** the **15 emojis the public website actually prints**, each with its plain-language name and the
place a visitor sees it:

| Emoji | Where | Emoji | Where |
| --- | --- | --- | --- |
| 🟢 | Project status | 🏆 🥈 🥉 | Member leaderboard |
| 🚧 | Project status | 👋 | Member dashboard heading |
| 🧪 | Project status | 📎 | Community chat files |
| ✅ | Project status + reactions | 💊 💻 🚀 | Terms page copy |
| 👍 ❤️ 🔥 | Community reactions | | |

Each row takes **one upload — PNG, JPEG or WEBP, up to 10 MB** — and draws your image wherever that emoji appears,
sized to the text around it, with the emoji kept as the image's alt text. **"Use the emoji again"** removes the
replacement and restores the original character. Replaced rows are counted at the top ("1 of 15 replaced") and marked
in the list.

**How it is built — nothing new was invented:** the upload goes through the platform's existing `POST /api/upload`
(the same media pipeline every other site image uses, `media.upload` permission, R2 `BUCKET`, served from the public
`/api/files/…` route) and the replacement is stored in the published site content as `media["emoji.<key>"]`, beside
`nav.logo`, `footer.logo` and every other image. **No new API, no new storage, no new table, no migration.** An emoji
you never replace renders exactly as it does today, character for character.

Emojis that exist only in an editor's sample data or inside the admin screens themselves are deliberately **not**
listed — they are not places a visitor sees.

## 6. What did not change

Client access, keys, sessions, links, permissions, audit, notifications, the Vault and the Client Project Room are
untouched. No route, table, permission or payload was altered in this phase. `CLIENT_PORTAL_PHASE14_REPORT.md` and
every earlier guarantee still holds.

## 7. Verification

| Check | Result |
| --- | --- |
| Type check (`tsc --noEmit`) | clean |
| Production build | exit 0 — 1,136.10 kB / 290.33 kB gzip, single file |
| Bundle wording | `Contact PHANTOM` 0 · `Talk to PHANTOM` 7 · `brand-logo-glow`/`brand-pulse` 0 · `brand-logo-plate` 3 |
| Interface suite (incl. new Phase 15 group) | **409/409** |
| Backend suite | **1332/1332** |
| Live: website, `#client-portal`, `/api/site-content` | 200 · 200 · 200 |
| Live: PHANTOM sign-in, portal setting, client key sign-in (canonical + lowercase), removed long key refused, room opens | 6/6 |
| Live: emoji upload → `/api/files/emoji/…` → published in site content → served back → restored | 8/8 |

The live emoji test is the real pipeline end to end: PHANTOM uploaded a PNG into the `emoji/` folder, the returned
`/api/files/emoji/…` URL was written into `media["emoji.welcome.wave"]`, the site content served it back, and the
content was then restored to exactly what it was before the test.

## 8. Files changed

**Added**
* `src/data/siteEmojis.ts` — the registry (15 entries: stable key, emoji, name, place) plus the render helpers.
* `src/components/SiteEmoji.tsx` — `<SiteEmoji>` / `<SiteEmojiText>` and one provider for the whole app.
* `src/components/SiteEmojiAdmin.tsx` — the *Site Emojis* section.

**Edited**
* `src/components/ContactForm.tsx` — rebuilt presentational layer (portal modal, readable colours, success view).
* `src/index.css` — glow + pulse removed; `.brand-logo-plate` added.
* `src/components/Navbar.tsx`, `Hero.tsx`, `About.tsx`, `Footer.tsx` — logo treatment; Footer wording.
* `src/components/ClientSupportContact.tsx` — chip wording.
* `src/components/Dashboard.tsx`, `CommunityHub.tsx`, `Projects.tsx`, `Terms.tsx` — emojis now render through the
  registry.
* `src/App.tsx` — one `SiteEmojiProvider` around the shell.
* `src/components/PhantomControlCenter.tsx`, `AdminPanel.tsx` — the new section and its data.
* `scripts/client-portal-ui-tests.mjs` — Phase 15 group (21 new checks) and the renamed-chip expectations.

**Database migrations:** none.

## 9. Using it

1. Sign in as PHANTOM → open the Control Centre → **Site Emojis**.
2. Find the emoji (each row shows where visitors see it — "Where it shows" opens the detail).
3. **Use an image** → pick a PNG/JPEG/WEBP. The row updates immediately and the public site shows your image on the
   next page load.
4. **Use the emoji again** to put the original character back.

---

**Success rate: 100.0 % — 1755/1755** (409 interface + 1332 backend + 14 live).

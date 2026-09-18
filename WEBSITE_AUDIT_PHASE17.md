# CODE Rx website — full audit
**Date:** 18 September 2026 · **Build audited:** `3006be3` (Phase 16 follow-up 2) · **Scope:** every surface — public site, member portal, PHANTOM/admin workspace, client portal, assets and delivery.

**How this was done:** static inspection of all 58 source files, a headless render of the real components (home, contact modal, dashboard, client access screen, client support block), a live server probe of the running build, contrast computed numerically against the real palette, and HTTP checks on the external links the site ships. Nothing here is a guess: each finding names the file and line, or the measured value.

**Nothing in this report has been changed yet** — it is a findings list for you to pick from.

---

## 1. Scoreboard

| Area | Findings | Worst severity |
| --- | --- | --- |
| Content & credibility | 4 | **Blocker** |
| Controls that look interactive but do nothing | 3 | **High** |
| Accessibility | 4 | Medium |
| Performance & delivery | 3 | Medium |
| Sharing / SEO | 2 | Medium |
| Data hygiene & duplication | 3 | Low |
| Verified good (checked, no action needed) | 6 | — |

---

## 2. BLOCKER — the site publicly presents fake people and unfinished legal text

### 2.1 The leadership team is invented, with stock photos
`src/data/siteState.ts:143-146` and the duplicate in `src/data/mockData.ts:267-270`:

```
{ name: 'Dr. Tech Pharm',   role: 'President',            image: unsplash… }
{ name: 'Sarah Script',     role: 'Vice President',       image: unsplash… }
{ name: 'Alex Code',        role: 'Technology Director',  image: unsplash… }
{ name: 'Elena AI',         role: 'AI & Data Lead',       image: unsplash… }
```

These render in **About → Leadership** with photographs of random stock models as if they were society officers. The
same page's "community" strip shows `Member 1 … Member 4` with faces pulled from `i.pravatar.cc` (`siteState.ts:126-129`),
and one code path still points at `via.placeholder.com/400x400?text=Team+Member`.

For a society recruiting real pharmacists, this is the single most damaging thing on the site: a visitor who compares
the photos to LinkedIn learns the leadership is not real.

**Options:** (a) hide the section until real people are ready, (b) fill in real names/roles/photos, (c) keep the
layout but label it clearly as sample content. Nothing ships until you choose — I do not invent officers.

### 2.2 The Terms page ships with `[Insert …]` placeholders
`src/data/siteState.ts:627-631` (visible to every visitor on **Terms → 31. OFFICIAL CONTACT**):

```
Email: [Insert Official Email]
Website: [Insert Website]
Official Community: [Insert Link]
Location: Ghana
```

### 2.3 Twenty of twenty-one projects have a dead link
`src/components/Projects.tsx:48` falls back to `href="#"` when a project has no repository or demo:

```jsx
<a href={selectedProject.github || '#'} …>   <a href={selectedProject.demo || '#'} …>
```

Only one project carries a URL — and it is broken: `https://github.com/coderx/pms` returned **404** when probed.
Clicking any "repository"/"demo" button therefore either jumps to the top of the page or lands on a GitHub 404.

### 2.4 Announcement copy is unfinished
`src/data/siteState.ts:133-137` — the home "Latest news" cards end mid-sentence with a literal ellipsis:
*"We are excited to announce the expansion of Code Rx…"*, *"Join us for a deep dive into Large Language Models…"*.

---

## 3. HIGH — controls that appear interactive but do nothing

| # | Finding | Evidence |
| --- | --- | --- |
| 3.1 | **Dashboard search box is decorative.** "Search resources…" has no state, no handler, no results. | `src/components/Dashboard.tsx:76` — the input has `placeholder` only; grep shows no `search` state in the file |
| 3.2 | **27 browser-chrome dialogs** stand in for real UI: `alert`, `confirm`, `prompt`. One is a `window.prompt` asking an admin to type a member's phone number; another greets every visitor with `alert('Failed to subscribe…')`. They cannot be styled, cannot be validated, and look broken in the installed PWA. | 8 × `PhantomControlCenter.tsx`, 8 × `AdminPanel.tsx`, 5 × `CommunityHub.tsx`, 2 × `ClientAccessCenter.tsx`, 1 × `Footer.tsx`, 1 × `VisualEditor.tsx`, 1 × `VaultShareDialog.tsx`, 1 × `VaultDocumentEditor.tsx` |
| 3.3 | **Modals do not behave like modals.** No Escape to close, no focus moved into the dialog, no focus trap, and the page behind keeps scrolling. The command palette even prints an **ESC** key hint it does not honour. | `role="dialog"` in `ContactForm.tsx:71`, `SiteEmojiAdmin.tsx`; the only `Escape` handler in the whole app is in `VaultDocumentEditor.tsx`; no `document.body.style` scroll lock anywhere |

---

## 4. Accessibility

| # | Finding | Evidence |
| --- | --- | --- |
| 4.1 | **Newsletter email field has no label** — placeholder only, so screen readers announce an unlabelled edit box. The dashboard search box is the same. | `src/components/Footer.tsx:53` |
| 4.2 | **10 icon-only buttons rely on `title` alone** (not reliably announced), and two dashboard buttons have neither `title` nor `aria-label`. | `VaultSharedDocument`, `PhantomControlCenter`, `Dashboard` (×2), `VisualEditor`, `CommunityHub`, `AdminPanel` |
| 4.3 | **Pale text still on white** in the Vault editor and one client empty state: `text-slate-300` = `#cbd5e1` ≈ **1.6:1**, plus `placeholder:text-slate-300` in the tag input and a `text-emerald-300` crown icon on a light badge. | `VaultDocumentEditor.tsx:455,529`, `ClientAccessCenter.tsx:973`, `PhantomControlCenter.tsx` (crown) |
| 4.4 | **15 controls remove the browser focus outline** without an equally strong replacement — 10 with no cue at all, 5 with only a border-colour change. Keyboard users lose track of where they are. | `outline-none` without `focus-visible:ring`: `VaultDocumentEditor` (×8), `NotificationCenter` (×2), `PhantomControlCenter`, `VaultShareDialog`, `VisualEditor`, … |

---

## 5. Performance & delivery

| # | Finding | Measured |
| --- | --- | --- |
| 5.1 | **Heavy first load.** The app is one inlined HTML file, and the images it loads are unoptimised — none of them `loading="lazy"` (only the new emoji replacements are lazy). | `index.html` **1,136.85 kB** (290 kB gzip) + `CODE RX11.png` **400 kB** (About + login modal) + `icon-512.png` **332 kB** + `logo.png` **110 kB** |
| 5.2 | **Deploys are invisible for one page load.** The service worker serves the cached shell first (stale-while-revalidate), and the cache name must be bumped by hand each release. | `public/sw.js:5` — `const CACHE = 'code-rx-v4'` |
| 5.3 | **PNG where WebP/AVIF would do**, and the maskable icon is 224 kB for a launcher tile. | `public/*.png` sizes above |

---

## 6. Sharing & SEO

| # | Finding |
| --- | --- |
| 6.1 | **No Open Graph or Twitter card tags.** When the Telegram channel or anyone shares the site, there is no title, description or preview image — just a bare link. (`index.html` has a good `<title>` and description, but zero `og:`/`twitter:` tags.) |
| 6.2 | **No `robots.txt` and no `sitemap.xml`.** |

---

## 7. Data hygiene & duplication

| # | Finding |
| --- | --- |
| 7.1 | **Two sources for the same content.** Leadership, projects, tracks and core values exist in both `src/data/mockData.ts` and `src/data/siteState.ts`; they have already drifted (the Terms emoji, the project links). |
| 7.2 | **Dead demo data.** `LEADERBOARD` (`mockData.ts:237-243`) is exported but imported nowhere — the dashboard uses the live API instead. |
| 7.3 | **Footer phone numbers are plain text, not `tel:` links**, so they are not tappable on the phone most visitors will use. (`Footer.tsx:56`) |

---

## 8. Verified good — checked, no action needed

* **Vault rich text is properly sanitised.** Every one of the nine `dangerouslySetInnerHTML` sites passes content through an allow-list sanitiser (`sanitizeVaultRichText`, `src/data/vaultEditor.ts:90`); no raw HTML path found.
* **Client portal authorisation** — keys are hashed, sessions expire, the room returns only published sections (re-verified live: room opens with 7 sections, unknown/removed keys return 401).
* **Emoji replacement system** — 15 registered emojis, upload → publish → render verified end to end.
* **No leftover `console.log`** in application source, and no orphan component files.
* **Contrast on the public site and client screens** — after Phase 16, every mapped text colour on a white surface measures ≥ 4.5:1 (enforced by a test, not by eye).
* **No missing local assets** — every `/…png` the code references exists in `public/`.

---

## 9. Suggested order if you want these fixed

| Round | What | Why first | Effort |
| --- | --- | --- | --- |
| A | 2.1–2.4 content/credibility (team, Terms placeholders, project links, news copy) | Public-facing believability; a visitor's first impression | Needs your input for 2.1 |
| B | 3.1–3.3 + 4.1–4.2 (dead search, real dialogs instead of `alert/confirm/prompt`, modal behaviour, labels) | The "this looks unfinished" class of defect you have been finding | Medium |
| C | 4.3–4.4 + 5 + 6 (pale text, focus rings, image weights, OG tags, robots/sitemap) | Polish, speed and sharing | Medium |
| D | 7.1–7.3 (one source of truth for content, dead data, tappable phone numbers) | Housekeeping; protects future edits | Low |

Every round keeps the current guarantees: additive, minimal, no new systems, no database migration, PHANTOM keeps
full control, and the client portal is untouched.

---

# Round A — done: the site no longer invents anything

**Status:** shipped. **Result: 1809 / 1809 checks passing (100.0 %).**
UI 458/458 · backend 1332/1332 · live 10/10 (Phase 16 set) · live 9/9 (Round A set).

Your instruction was: *remove all fake contents and leave them blank, I will personally add them in the admin section.*
Every collection on the public website is now published by PHANTOM only, and every screen that used to print sample
content has a professional empty state instead.

## What was removed

| Where | What was there | Now |
| --- | --- | --- |
| Officers grid (About) | Four invented people (`Dr. Tech Pharm` …) with stock photographs | Empty; the section is hidden from the public page entirely |
| Member strip + member count (Home) | Four `pravatar.cc` faces and a `500+` figure | Empty; the count only appears once a real figure is published |
| News cards (Home) | Three unfinished announcements with a `…` ending | Empty state: *“No announcements yet.”* |
| Project lab | 21 projects, 20 of them with no link, one pointing at a repository that 404s | Empty state; a project card can no longer render a link to nowhere |
| Challenge board | `CRX-DECODER-001` with invented participants, a countdown and a prize | Empty state: *“No challenge is open right now.”* |
| Partnerships / Opportunities (About) | Invented partner names and an internship, scholarship and grant | The section hides itself until there is something true to list |
| Library | Sample categories and documents | Empty state: *“The library is being prepared.”* |
| Terms §31 | `[Insert Official Email]`, `[Insert Website]`, `[Insert Link]` | `coderxsociety@gmail.com` and the official community channel; the Website line is dropped rather than invented |
| Community copy | “500+ members” was implied in the description | Rewritten without a number |

## The empty state itself

One component, `src/components/SectionEmpty.tsx`, used by the project lab, the challenge board, the library, the news
grid and the partner cards, so the public pages look deliberate rather than unfinished on the day nothing has been
published yet. The dashboard and the Vault keep their own existing dark empty states — nothing was rebuilt.

## PHANTOM still has full control

Every collection can be added back exactly as before, in the admin section, and new records now start **blank** instead
of arriving pre-filled with a stock face or a placeholder image:

* `AdminPanel` — team members, community members (image field no longer pre-filled with `pravatar.cc`)
* `VisualEditor` — “Leadership member”, news, projects, resources, partnerships and opportunities all still addable
* Terms, copy and every text field remain editable, with the published contact details as the default

## Verification

* The public pages were rendered with **all** collections empty — home, about, learn, projects, challenges, community,
  resources and terms — and checked for fabricated strings, stock images and broken links: none.
* A new harness group (21 checks) locks this in: it fails if a stock image service, an invented officer, an `[Insert`
  marker or a `|| '#'` project link ever returns.
* The served production build was re-checked live: the delivered page contains the empty states and the real contact
  details, and none of the removed content.

Round B (dead dashboard search, the 27 native dialogs, modal behaviour, unlabelled controls) is next, then Round C
(speed, focus rings, sharing tags, robots and sitemap).

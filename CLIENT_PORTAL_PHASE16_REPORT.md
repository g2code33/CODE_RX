# Code Rx — Client Portal, Phase 16
## Quieter client screen · a readable Learn section · labels you can actually see · a deeper footer band

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (continues from `65ddc84`)
**Type:** presentation only — copy removal, text colours, one surface shade. **No API, permission, table or route change.**
**Result:** interface suite **421/421**, backend suite **1332/1332**, live checks **14/14**, type check clean,
production build exit 0 → **1767/1767 = 100.0 %**.

> **Follow-up, same request (§7):** the first pass fixed the labels the request named; a second pass then removed the
> last of the bright lime from every white surface and took the footer band one more shade down. Interface suite is
> **428/428** there, live checks **10/10** → **1770/1770 = 100.0 %** for the current build.

---

## 1. What you asked for

> "remove these: 1. the last three letters are your project code. 2. Type or paste the key Code Rx Society gave
> you. 3. and is never stored in this browser · check the learn section, this ui: Learning_path/08 modules and it
> numberings are bad, change them to black or deep green, the footer background must be a bit darker · also all
> colour like this 'Learning_path / 08 modules' to deep green or simple deep black because it is not visible"

## 2. The three lines are gone from the client access screen

| Removed | Where it was |
| --- | --- |
| `… — the last three letters are your project code.` | under the three key boxes |
| `Type or paste the key Code Rx Society gave you.` | the idle line under the boxes |
| `… and is never stored in this browser.` | the footnote under the contact chips |

The line the boxes keep is the format itself (`CRX-___-___-ABC`), and the footnote now reads *"Your access key is
verified on Code Rx servers. Only your published project documents are shown here."* — the promise about **not storing
your key** is no longer written on the screen, while the wording that the key is verified on Code Rx servers stays.
Nothing about the behaviour changed: the key still never leaves this component, is still never written to
localStorage, and is still verified on the server. Only the sentences you singled out were deleted; the counter
(`6/9`), the live hint while typing, the "Looks complete — verifying now." state and every error message are untouched.

## 3. The Learn section — and every other small label — is readable now

The root cause was one shared style. `.brand-number` — the small mono label used by **11 components** — was painted
`rgba(184, 255, 61, 0.9)`, which is the bright lime of the dark-brand design. On the current white theme that is
lime-on-white: the *Learning_path / 08 modules* label, the **01–08** module numbers, the "01 / TEAM" tags, the hero
statistic labels, the footer column headings and the terms card numbers were all sitting on white in a colour that
barely reads.

| | Before | Now |
| --- | --- | --- |
| `.brand-number` | `rgba(184, 255, 61, 0.9)` — lime on white | **`var(--brand-green)` = `#15803d`, deep green** |
| Learn step dashes | lime, hidden on white | deep green |
| Big headings (`PHARMACY…`) | gradient fading into mint at 55 % | gradient now runs **dark → deep green → green**, so the second half of the heading reads too |
| Hero "CRX / 001", team card "01 / TEAM" | lime | **still lime** — these two sit on a near-black panel and on photography, where lime is the readable choice (`.brand-number--lime`) |

No component markup changed for the numbering itself: the labels inherit the corrected style, so the fix lands
everywhere the label is used, in the Learn section and outside it.

## 4. The footer band is a shade darker

The footer sat on `--brand-deep` (`#f8fafc`), which is almost the same as the white page — and the footer element
also carries `.brand-grid`, which paints the *page* white and was winning. There is now a dedicated token:

* `--brand-footer: #e7edf3` — a soft grey-green, clearly darker than the white page and the white cards.
* `footer.brand-section` re-states that colour **and** a grid tinted for it (`rgba(21, 128, 61, 0.07)`), so the class
  pair above cannot repaint the band white again.

The band still reads as the closed end of the page; it is simply no longer the same value as the page.

## 5. Verification

| Check | Result |
| --- | --- |
| Type check (`tsc --noEmit`) | clean |
| Production build | exit 0 — 1,136.25 kB / 290.33 kB gzip |
| Interface suite (incl. new group 17) | **421/421** |
| Backend suite | **1332/1332** |
| Live: website, published content, PHANTOM sign-in, portal setting, client key sign-in, project room, emoji upload → publish → restore | **14/14** |
| Sentenced removed from the shipped bundle | `never stored in this browser` 0 · `last three letters` 0 |
| Readable label style in the shipped bundle | `.brand-number{color:var(--brand-green)}` · `.brand-number--lime{color:#b8ff3df2}` |
| Footer band in the shipped bundle | `--brand-footer:#e7edf3` · `footer.brand-section{background-color:var(--brand-footer)}` |

## 6. Files changed

**Edited**
* `src/components/ClientAccessScreen.tsx` — the three lines removed; the footnote reworded.
* `src/index.css` — `.brand-number` deep green, new `.brand-number--lime`, heading gradient re-pointed, new
  `--brand-footer` token and the footer band rule.
* `src/components/Academy.tsx` — the step dashes are deep green.
* `src/components/Hero.tsx`, `src/components/Leadership.tsx` — the two labels that sit on dark surfaces use the lime
  modifier explicitly.
* `scripts/client-portal-ui-tests.mjs` — group 17 (11 checks) plus the updated screen-copy expectation.

**Database migrations:** none.

---

**Success rate: 100.0 % — 1767/1767** (421 interface + 1332 backend + 14 live).

---

## 7. Follow-up, same request — the lime marks that were still on white

The first pass moved the shared label style and the Learn card's own marks. It left the *same colour* in a dozen other
places where it sits on white: the small dots beside a category, the rules under a card title, the chip washes, the
divider inside the hero statistics, the project progress bars, and two hover tints. On white those read as pale green
smudges — the same complaint, one component over — so they were swept too.

| Walked over to deep green (`#15803d`) | Kept lime (`#b8ff3d`), because the surface there is dark |
| --- | --- |
| `Academy` — the live dot, the card wash, the row hover | `Hero` — the dark panel's "CRX / 001", its signal bars, its progress fill |
| `About` — the value rules, the quote rule, the two tiles | `Leadership` — "01 / TEAM" over the portrait |
| `SiteFlow` — the two News dots, the item dot, the rule, the image wash | `ContactForm` — the lime word in the dark green header, its focus ring |
| `WhatWeDo`, `Competitions`, `Extras`, `Projects`, `Terms`, `SectionLink` | `Footer`, `ClientPortalEntry` — the lime glyph inside a deep green tile |
| `Hero` — the intro rule and the statistic dividers (they sit on the white page, not on the panel) | |

The lime that remains is a **text colour on a dark chip** in every case; nothing painted on white uses it any more.

**The footer band stepped down again:** `--brand-footer` is now **`#e2e8f0`** (was `#e7edf3`), against the white page
and the white cards — the band is unmistakably its own surface while all of its text keeps its contrast.

### Verification (current build)

| Check | Result |
| --- | --- |
| Type check | clean |
| Production build | exit 0 — 1,136.82 kB / 290.38 kB gzip |
| Delivered page | `never stored in this browser` 0 · `last three letters` 0 · `Type or paste the key…` 0 · `.brand-number{color:var(--brand-green)}` present · `--brand-footer:#e2e8f0` present |
| Interface suite (new group 18, 7 checks) | **428/428** |
| Backend suite | **1332/1332** |
| Live: page, published content, PHANTOM sign-in, portal setting, client key sign-in, removed long key refused | **10/10** |

Group 18 asserts the rule as an invariant rather than a spot check: across every public component, the files that may
still contain the lime hex value are exactly `Hero`, `Leadership`, `ContactForm`, `Footer` and `ClientPortalEntry` —
the five dark surfaces — and in the last two the value must appear as text on a deep green tile.

**Files edited in the follow-up:** `src/components/{About,Academy,Competitions,Extras,Footer,Hero,Projects,SectionLink,SiteFlow,Terms,WhatWeDo,ClientPortalEntry}.tsx`,
`src/index.css` (the band tone), `scripts/client-portal-ui-tests.mjs` (group 18).

**Database migrations:** none.

**Success rate for this build: 100.0 % — 1770/1770** (428 interface + 1332 backend + 10 live).

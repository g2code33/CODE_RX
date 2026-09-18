# Code Rx — Client Portal, Phase 13
## Short project key · three fixed boxes · auto-login kept

**Date:** 18 September 2026
**Branch:** `arena/01a0b09c-code-rx` (continues from `b643323`)
**Type:** key-format and entry-box rework on the client access experience. **No database migration**; legacy keys keep working.
**Result:** interface suite **380/380**, backend suite **1331/1331**, live checks **8/8**, type check clean,
production build exit 0 → **1719/1719 = 100.0 %**.

---

## 1. What you asked for

> "still malfunctioning … i think the key is too lengthy make CRX-123-123-initials of specific project name(only 3) …
> also the spaces must be fixed and not moved and must be in fixed boxes that client will feel easy to use,
> the CRX keep interfering with the other keys … the auto login is nice"

Four things were delivered, in that order of importance:

1. a **shorter key** — `CRX-XXX-XXX-ABC`, nine characters instead of sixteen;
2. the last three letters are the **initials of that key's own project**;
3. entry happens in **three fixed boxes** that never move, and `CRX` is a **fixed label above them, never an input**;
4. the **auto-login is untouched** — a complete key still verifies itself.

## 2. The key

| | Before (Phases 3–12) | Now (Phase 13) |
| --- | --- | --- |
| Shape | `CRX-8K4P-X92M-7LQF-B3TD` (20 characters, 16 significant) | `CRX-22G-LVJ-MSD` (14 characters, 9 significant) |
| Random part | 16 characters | **two groups of three** = 6 characters from the 32-symbol alphabet |
| Meaning | none | last group = **project code**: Malaria Surveillance Dashboard → `MSD` |
| Entropy | 80 bits | **≈30 bits** (32⁶ ≈ 1.07 × 10⁹) |
| Typing effort | 16 characters, four groups | **9 characters, three boxes, one gesture** |

The project code is built by `clientProjectCode(name)` in `functions/lib/client-auth.ts`: word initials taken from the
key alphabet (`0/O/1/I` excluded), de-duplicated, padded with `X` when a project name is too short, and falling back to
the remaining letters of the first word when the initials collapse. The code is printed on every key in the PHANTOM
workspace list as the key's hint (it is *not* a secret — the random part is), so an operator can tell two keys apart
by the project they open without ever seeing a stored key.

### The trade-off, stated plainly

A nine-character body is easier to say over the phone and easier to type, and that is the whole point of this phase —
but it is also **~2⁵⁰ times easier to guess** than the old 80-bit key. Three things carry that weight, and all three
already existed in the product:

| Protection | Before | Now |
| --- | --- | --- |
| Per-IP failure throttle | ✔ | ✔ (unchanged) |
| Per-key-attempted throttle | ✔ | ✔ (unchanged) |
| **Per-project-code throttle** | ✖ | **new — 500 failures / 15 minutes → 15-minute lock on that code** |

The new counter lives in `clientPasskeyCodeScope()`: an attempt that *looks like* a key (`CRX-XXX-XXX-ABC`) is counted
against `code:ABC`. It is consumed **only after the key lookup has already failed**, so a client holding a correct key
can never be locked out by other people's failed guesses — the counter can only ever close the door on a code that
admissions have already shown the attacker does not hold. Raising the strength later is a one-line change
(`CLIENT_PASSKEY_RANDOM_LENGTH`).

## 3. The boxes

```
   ┌─────┐   ┌───┐ ┌───┐ ┌───┐
   │ CRX │   │22G│ │LVJ│ │MSD│
   └─────┘   └───┘ └───┘ └───┘
   fixed      1 of 3  2 of 3  3 of 3
   label      └─ access key ─┘ └ project code ┘
```

* **`CRX` is a `<span aria-hidden="true">`** — a decoration printed once, not a value inside the field. It cannot
  move, cannot be selected, cannot be deleted, and cannot take a character that was meant for a box. This is the
  complaint "the CRX keep interfering with the other keys" answered structurally rather than with a regex.
* **Three `<input maxlength="3">` boxes**, always three, always in the same order. Nothing is re-grouped, re-spaced
  or re-capitalised while you type, so the character under your finger never jumps.
* Typing the third character of a box **advances** to the next one; typing past the end of the key **spills into the
  following boxes**, so a fast typist is never blocked. `Backspace` in an empty box steps back and deletes there.
  `←`/`→` walk between boxes. The last box carries `enterKeyHint="go"`, the others `"next"`.
* A key pasted anywhere on the screen — lowercase, spaces, dashes, with or without `CRX`, with the project code
  attached — is **distributed across the boxes** and verified at once.
* **Auto-login is intact:** the moment the three boxes together hold a valid, complete key, the screen submits itself.
  The status line says so ("Looks complete — verifying now."), and it is the same code path as pressing Enter.
* **Legacy keys are not abandoned.** "Using a long key issued earlier?" reveals a free-form field
  (`#client-access-legacy`) where a 16-character key from before this phase is typed or pasted and exchanged normally.
* Screen copy, the seven error states, the busy contract (`aria-busy`), the key-never-stored rule and the Phase 12
  contact block are all unchanged; the key is still cleared from state on success (now by resetting the boxes).

## 4. Files

| File | Change |
| --- | --- |
| `functions/lib/client-auth.ts` | Format block rewritten for `CRX-XXX-XXX-ABC`; new `clientProjectCode()`, `generateClientPasskey(source?)`, `clientPasskeyHint()`, `clientPasskeyCodeScope()`; `CLIENT_AUTH_CODE_*` throttle constants; `normalizeClientPasskey` now accepts bodies **9–32** so old keys still authenticate |
| `functions/client-routes.ts` | Key minting uses the project's name (falling back to the client's); regeneration keeps the project's code; unknown-key attempts consume the per-code throttle before the failure is answered |
| `src/lib/accessKey.ts` | Rewritten for the three-box model: `splitAccessKey`, `joinAccessKey`, `validateAccessKeyGroups`, `ACCESS_KEY_GROUP_LENGTH/GROUPS/CODE_LENGTH`, `ACCESS_KEY_PLACEHOLDER`; a 9-character body is never mistaken for a `CRX`-prefixed value |
| `src/components/ClientAccessKeyField.tsx` | **new** — the three fixed boxes, the fixed `CRX` label, advance/spill/Backspace/arrow behaviour, per-box accessible labels |
| `src/components/ClientAccessScreen.tsx` | Rebuilt around the boxes and the auto-submit; shape guidance `CRX-___-___-ABC`; legacy fallback field; unchanged copy, errors, busy state and contact block |
| `scripts/client-portal-ui-tests.mjs` | Interface suite rewritten for the boxed field (also removes an old tautological assertion) |
| `scripts/client-portal-tests.mjs` | Backend expectations moved to the short format + project code, the code throttle, and legacy-key normalisation |

## 5. Verification

* **Interface suite** — `npm run test:client-portal-ui`: **380 checks, 380 pass, 0 fail.**
* **Backend suite** — `npm run test:client-portal`: **1331 checks, 1331 pass, 0 fail.**
* **Type check** — `tsc --noEmit`: clean. **Build** — `npm run build`: exit 0.
* **Live, against the running preview** (`http://127.0.0.1:8788`):

| # | Live check | Result |
| --- | --- | --- |
| 1 | Public site `/` | 200 |
| 2 | Client portal entry `/#client-portal` | 200 |
| 3 | Published site content `/api/site-content` | 200 |
| 4 | Served bundle carries the three-box field | placeholder + per-box labels present |
| 5 | Key minted for "Malaria Surveillance Dashboard" | `CRX-22G-LVJ-MSD` — code `MSD` ✔ |
| 6 | That key logs in (exact, lowercase/spaced, CRX-prefixed) | 200 / 200 / 200 |
| 7 | Wrong project code `CRX-22G-LVJ-XXX` | 401, "This project access key was not recognised…" |
| 8 | Legacy 16-character key `CRX-8K4P-X92M-7LQF-B3TD` still opens the portal, and the project room renders with the session | 200 |

Static walk-through of the shipped component (real screen, real stylesheet) — `phase13-client-access-preview.html`.

## 6. Database

**No migration.** `client_access_keys` is unchanged; only how a key's *body* is generated and how long a valid body
may be. Existing rows keep their existing verifiers and hints, and the login normaliser still accepts them.

## 7. Notes for the next phase

* `CLIENT_PASSKEY_RANDOM_LENGTH` is the single knob if you want longer keys later (it changes new keys only).
* The project code is shown to PHANTOM as the key hint; it is never treated as a secret.
* The legacy fallback field stays as long as keys minted before this phase are in circulation.

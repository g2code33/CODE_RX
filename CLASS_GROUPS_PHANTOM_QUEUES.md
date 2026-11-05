# PHANTOM oversight — decisions, notifications and the listing rule

Everything in this note is server-enforced; the UI never decides anything.

## Every decision that waits on PHANTOM

| Queue | Table | Who may act | Where PHANTOM is told |
| --- | --- | --- | --- |
| Organizer applications | `cgm_organizer_applications` | PHANTOM only | inbox `class_groups` + notification |
| Class approvals | `cgm_classes` (`status = 'pending'`) | PHANTOM only | inbox `class_groups` + notification |
| Sensitive profile changes | `cgm_profile_change_requests` (gender, index number, phone) | PHANTOM only | inbox `class_groups` + notification |
| Re-choose requests | `cgm_rechoose_requests` | PHANTOM only (organizers get 403) | inbox `class_groups` + notification |
| **Moves, swaps & removals** | `cgm_move_requests` | PHANTOM only | inbox `class_groups` + notification |
| Force Get requests | `cgm_force_get_requests` | PHANTOM only | inbox `class_groups` + notification |
| Disputes | `cgm_announcement_reports` | PHANTOM only | inbox `class_groups` + notification |

**Moves, swaps and removals are requests, never actions.** With the default policy
`move_approval_mode = 'approval'` an organizer's `assign-student`, `swap-students`
or `assignments/:id/remove` writes a `cgm_move_requests` row and changes nothing.
PHANTOM's approval runs the *same* code path an organizer used to
(`applyMemberMove` / `applyMemberSwap` / `applyMemberRemoval`): identical capacity
checks, gender-pool gate, designation handling, student notification and audit rows.
An approval is **claimed** with a conditional `UPDATE … WHERE status = 'pending'`
before it is applied, so two operators cannot apply one request twice, and a
request the roster refuses is released back to `pending` with the reason.
PHANTOM acting directly *is* the approval, and `move_approval_mode = 'auto'`
restores immediate moves for a class that runs its own composition.

## Decisions stay visible

Every queue lists `pending` work first and then the decided rows, each carrying its
verdict, reviewer and moment (`APPROVED by PHANTOM · just now`). `?status=pending`
narrows a queue when the record is noise.

## Tab badges — "new since you last looked"

`GET /api/cgm/phantom/attention` returns, per oversight section, `pending` (live
decision backlog) and `unseen` (what arrived after *this* account last opened that
section). `POST /api/cgm/phantom/attention/:tab/seen` moves the watermark
(`cgm_phantom_attention`, one row per member profile per tab, keyed on the newest
row **id** — not a timestamp, because arrivals are stamped to the second). Opening a
tab clears only that number; the work itself is untouched, and a section that still
owes a decision keeps a dot.

The whole board is one statement — but not a `UNION ALL` chain. D1 refuses a
compound SELECT with more than five terms (`too many terms in compound SELECT`),
and a board built that way fails as a whole, silently reading as "nothing new" on
every tab. It is instead one `SELECT` of scalar subqueries, two counted columns per
section (`<key>_pending`, `<key>_unseen`), so it still costs a single round trip.
A failed statement is logged once per isolate rather than swallowed.

The oversight panel keeps its twelve sections on one sideways-scrolling rail
instead of stacking them over the content, with a single `Queues (N)` chip
carrying the total still waiting; the chip opens the first queue that needs a
decision.

## The control center carries the same numbers

The left-hand PHANTOM navigation (`Overview`, `Applications`, `Members`,
`Community Control`, `Class Groups`, `Audit Logs`, `Recycle Bin`) shows the same
kind of number the oversight sections do — what arrived **since this operator
last opened that tab** — and opening the tab clears it, for that account only.
The watermark lives in `cgm_phantom_attention` under a `nav:`-prefixed key, so a
section inside Class Groups and the Class Groups tab itself never clear each
other.

`Class Groups` is **derived**: its badge is the sum of the oversight panel's own
sections (`classGroupsUnseen`), so it falls by exactly the section PHANTOM opens.
`Overview` carries the grand total of every other tab. Tabs with nothing to watch
(Permissions, Settings, Site Emojis…) show no badge rather than a decorative zero.
The counts come from the tables those tabs render (`applications`,
`member_profiles`, `public_forum_reports` + `community_group_join_requests`,
`audit_logs`, `recycle_bin_items`) in one statement of scalar subqueries —
`GET /api/phantom/attention`, `POST /api/phantom/attention/:key/seen`.

## One listing rule

`src/components/RecentItems.tsx` (`LIST_PREVIEW = 5`) is the single list primitive:
every list shows the latest five entries and a "View more" control for the rest,
and the control disappears when there is nothing more to see.

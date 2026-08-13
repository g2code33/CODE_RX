# Code Rx Community + Messaging Setup

## Architecture retained

The Community system extends the existing Code Rx Pages Functions application. It reuses:

- Existing React/Vite frontend and visual design system
- Existing Code Rx authentication and `member_profiles`
- Existing Code Names and PHANTOM authorization
- Existing Cloudflare Pages Functions API
- Existing D1 binding: `DB` → `code-rx-db`
- Existing R2 binding: `BUCKET` → `code-rx-storage`
- Existing notification and audit systems

It does not create a second login system, user database, Worker, D1 database, or R2 bucket.

## Public vs private separation

### General Community

Visitors enter with an email and receive a random `Guest-XXXX` identity. The email is private in D1 and is never returned in public thread or chat responses.

Public guest tokens cannot access:

- Member directory
- Code Names of private members
- DMs
- Private groups
- Private messages
- Telegram linking
- PHANTOM controls

### Code Rx Community

Private messaging requires the existing Code Rx JWT and an active Code Rx member profile. Every DM, group, message, attachment, search request, read state, and moderation action is re-authorized by the Pages Function.

## Database migration

The additive Community migration creates tables for:

- Public guest sessions, threads, posts, reactions, reports, and public chat
- Private conversations, group members, join requests, messages, reactions, reports, and attachments
- Media policy and usage metadata
- Telegram links, short-lived link tokens, webhook deduplication, and message-sync metadata

No production table is reset or removed. The migration runs automatically on the first API request after deployment.

## Real-time approach

The initial production implementation uses bounded incremental polling:

- Private active conversation refresh: 12 seconds
- Public forum/chat refresh: 20 seconds
- Message lists are limited and paginated at the API layer

This avoids adding an always-on Durable Object/WebSocket cost to the Cloudflare Free-plan architecture. The schema and APIs remain ready for a future Durable Object or WebSocket transport without changing message ownership or authorization.

Typing indicators and online presence are intentionally not written continuously to D1. They should be added later with an ephemeral transport, not permanent database writes.

## Media controls

PHANTOM Control → Media Management controls R2-backed Community attachments.

Policy priority:

```text
Global all-media master switch
→ Global media type
→ Area setting (Private Community / Public Forum / Public Chat)
→ Group override
```

The global all-media switch is a true safety master: if it is OFF, area or group settings cannot bypass it. Text messaging continues even when every media category is disabled.

The backend validates:

- Active Code Rx membership and conversation membership
- Group media policy
- Media type
- File extension and MIME type
- Per-file size limit
- Configured storage limit
- R2 access authorization

Private R2 attachment keys are never sent to the browser. Downloads are served through authenticated Pages Function routes.

## Telegram configuration

Telegram is optional. Add these only as encrypted Cloudflare Pages/Worker secrets:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_BOT_USERNAME
TELEGRAM_WEBHOOK_SECRET
```

Never put any Telegram secret in React, `VITE_*`, D1, Git, screenshots, or chat.

### Link flow

1. Member selects **Connect Telegram**.
2. The API creates a cryptographically random, single-use, ten-minute token.
3. The member opens the Telegram `/start` deep link.
4. The webhook verifies `X-Telegram-Bot-Api-Secret-Token`.
5. The token is consumed and the Telegram chat ID is linked to the member profile.

### Telegram sync safeguards

- Website-originated messages are recorded before optional Telegram delivery.
- Telegram message IDs are stored in `community_telegram_message_links`.
- Telegram webhook update IDs are deduplicated in D1.
- Telegram-originated messages use `source = telegram` and are not sent back through the website-to-Telegram path.
- A linked direct Telegram chat can send `/dm CODENAME message` to create/open the matching private Code Rx DM without exposing emails.
- Group sync requires PHANTOM to explicitly enable it and configure the Telegram group chat ID.
- Telegram media does not bypass Code Rx media controls. Website-to-Telegram private attachments are handled only through the PHANTOM-controlled retention path below; inbound Telegram media remains unimported.

### Telegram media retention

PHANTOM can open **PHANTOM Control → Media Management → Global** and enable
**Telegram storage protection**. When enabled:

- A private-chat attachment is accepted only when the conversation has an active Telegram sync target.
- Code Rx sends the private R2 object to that configured Telegram target as a document, without exposing an R2 key or public file URL.
- The R2 object is deleted only after Telegram returns a confirmed message ID.
- The Code Rx message and small attachment audit metadata remain, but active R2 storage totals no longer include the file.
- A failed Telegram sync or failed R2 cleanup keeps the file safely in R2; PHANTOM and the sender can retry it. It is never deleted before delivery is confirmed.
- The retention path has a conservative **20 MB per-file** cap to stay within safe Pages Function and Telegram limits. Text chat is never restricted by this setting.

## Required deployment verification

1. Create a public guest identity and confirm only a guest handle appears publicly.
2. Create a public thread, reply, react, report, and verify PHANTOM moderation controls.
3. Create two active members, open a DM, send a message, and verify the second member cannot read unrelated conversation IDs.
4. Create an open, approval, invite-only, and PHANTOM-assigned group.
5. Verify join request approval, group roles, message deletion, reactions, mentions, pins, and read state.
6. Confirm media upload is rejected when the global master switch is OFF.
7. Enable image media, upload to an authorized group, then verify an unauthorized member cannot access the attachment route.
8. Enable PHANTOM Telegram storage protection, upload a supported file below 20 MB to a Telegram-synced test chat, verify Telegram receives it, then verify the R2 active-file total returns to its prior value.
9. Deliberately use an unavailable Telegram target once, verify the local file is retained and appears in PHANTOM retry controls, then retry only after fixing the target.
10. Configure Telegram secrets only after the website messaging system is working.

## Current Free-plan-aware limitation

The Community is message-complete through secure polling. Native WebSocket typing/online indicators and automatic Telegram group discovery are intentionally deferred until a dedicated real-time transport is justified and configured.

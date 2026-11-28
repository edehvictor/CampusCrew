# Booking experience improvements

Work in small batches. Check each batch locally, sign and push it, then run the browser checks before starting the next batch. Cloudinary is deferred; evidence continues to use private Supabase storage.

## Batch 1: booking overview and applications

Implemented; awaiting browser confirmation:

- Keep the title, agreed amount, selected person and current action together.
- Preserve confirmed progress during disputes and refunds. A dispute can start before or after submission; do not invent a submitted step. A partial settlement must not appear as a fully paid booking.
- Show a selected badge for the accepted application. Allow selection only on an open task with no accepted application.
- Make application price, availability, reviews and proposal easy to scan. Collapse biography, services and coverage.
- Collapse task details once booked, alongside the existing collapsed payment terms and receipts. Keep the work workspace separate.
- Remove the outdated message saying escrow funding is still being connected.

Code guide: `services/booking-progress.ts` derives display stages from the payment snapshot; `booking-payment.tsx` renders progress and server-authorized actions; `application-card.tsx` renders reusable application cards; `request-detail.tsx` organizes these sections. CSS is in `book-one.css` and `experience.css`. Payment permissions, transaction construction and contract rules are unchanged.

Browser checks:

1. Owner opens an open task: applications show price, availability, reputation and proposal. Services/coverage expand. Profile links work.
2. Select a provider: the named person and Selected badge appear; the accepted application has no Select provider button. Another applicant cannot be selected.
3. In both sessions, inspect acceptance, funding and submission as they confirm. Reached steps stay filled. The next permitted action is visible above technical details.
4. Inspect a dispute before submission and one after submission: funding remains reached; submission appears reached only when it actually happened. The dispute has one pause explanation.
5. Inspect a partial settlement: refund availability must not be presented as a full payout. Receipts and refund controls remain reachable.
6. At 360px width: cards, prices and progress fit; controls remain readable and keyboard accessible. Expand task details and compare them with the original task.

## Batch 2: task and application editing

Implemented with server-owned identity, version checks, task-row locking and database guards after selection. Task changes require existing applicants to review and confirm their offers before selection. Forms are prefilled, preserve the opened version and allow cancelling without writing. Follow [TASK_EDITING.md](TASK_EDITING.md) for the migration, code tour and two-browser checks. The isolated desktop/mobile browser check passed. The user confirmed the migration, and the connected database revision field was verified on November 28. Real two-account confirmation remains pending.

## Remaining approved batches

3. Evidence uploads: preview, file details, explicit upload action, cancel/remove before submission, clear separation of drafts and submitted evidence. Define retention/removal rules for submitted evidence before enabling deletion.
4. Workspace: clearer Work, Messages and Activity panels, with distinct empty/loading/error states and a readable event timeline.
5. Notifications: use the actual participant's name, link to the booking and preserve event deduplication.
6. Wallet approvals: explain each action before signing, including USDC movement and variable XLM network fees. Never present an estimated fee as a fixed final charge.

Validation: all 74 application/database tests passed, including four progress regressions; ESLint and the production Next.js build passed. Interactive desktop/mobile confirmation is still pending. No new database migration is required for batch 1. Later database changes will have separate migrations and authorization tests.

Batch 2 validation: all 98 current application/database tests pass, including 14 editing/notification-route checks and 10 nearby-location checks. The editing forms were also exercised in an isolated browser with intercepted API fixtures; no sample records were added to Supabase.

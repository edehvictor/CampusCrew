# Task and application editing

Run `supabase/migrations/20261128000100_task_application_editing.sql` in full in Supabase SQL Editor after the earlier marketplace/experience migrations. The nearby-location migration is independent of this update. Refresh both browsers after applying it. Existing tasks and applications start at version 1.

## Product rules

- An owner can edit title, category, area, timing, budget, scope and evidence requirement while the task is open.
- Applicants can edit their own price, availability and note while no provider has been selected. Updating an application keeps its ID and original creation date; it is not a second application.
- Any changed task field increments the task version. Existing applications must be reviewed and confirmed against that version before selection, even when the provider keeps the same price and note.
- The owner and affected applicants receive notifications for actual edits. Saving exactly the same details again does not generate another version or notification.
- Selecting a provider freezes the task and all applications. Changes cannot be made after selection, including before escrow creation, after cancellation or after a refund. A different agreement requires a new task.
- A selected booking takes the reviewed quote's amount. Editing the task's budget never overwrites a provider's proposed price.

## Code tour

`request-dialog.tsx` supplies the existing task/application form for both creation and editing, with prefilled fields and an explicit cancel action. `board.tsx` captures the task snapshot when a form opens; background updates do not silently replace that draft. The submitted command carries that captured version. `request-detail.tsx` exposes Edit task or Edit application only in the relevant owner/applicant state, and `application-card.tsx` marks applications that need confirmation.

`types/pilot.ts` validates every command with Zod. `/api/book-one` obtains the actor from the signed session and enforces same-origin writes. `services/pilot-server.ts` routes edits through `services/marketplace-editing-server.ts`; the browser cannot supply the actor's wallet.

The database functions lock the task row before editing, applying or selecting. Expected task/application versions must match the stored versions. When selection and editing overlap, either the edit wins and selection must review the new version, or selection wins and the edit is rejected. Triggers also block direct updates to booked tasks/applications. Old mutation functions reject unversioned clients after this migration, so an old browser must refresh rather than bypass the checks.

This update changes marketplace agreement handling, not the deployed Soroban contract. The existing escrow still uses the immutable selected booking amount.

## Two-browser test

1. Owner posts a task; provider applies with 1 test USDC. Refresh both accounts.
2. Provider opens Edit application, changes the quote to 1.50 and saves. Owner sees one application with the updated price.
3. Owner edits the pickup instructions or timing. Provider sees that the task changed. Owner cannot select the old application yet.
4. Provider opens Review & update application. The task context is expanded; verify the new instructions and either change or keep the quote, then confirm.
5. Owner selects the confirmed application. Both sides see the booking, and its agreed amount remains 1.50. Edit controls disappear.
6. Prepare escrow and confirm that it uses the selected quote, not the task budget.
7. Open an edit form in one tab; update the same record from another tab first. Saving the old form must fail with an instruction to review the latest version, rather than overwrite it.
8. Open an editor, change a field, then Cancel. Refresh: the saved task/application must be unchanged.

## Local checks

`node --test tests/marketplace-editing.test.mjs` checks database authorization, version handling, stale-offer rejection, frozen terms, notifications and selected-price preservation. Its interleaved-request test uses the local PGlite queue and does not replace a multi-connection production concurrency test.

With the local dev server running, `node scripts/check-marketplace-editing-ui.mjs` opens an isolated Chrome profile and intercepts all API requests with fixtures from `tests/fixtures/marketplace-editing.mts`. It checks prefilled forms, saved command versions, blocked stale selection, cancel without writing, and mobile layout. No fixture is written to Supabase and no wallet is connected. Screenshots are saved to the temporary directory printed by the command.

The browser fixture check is not confirmation of a real two-account journey. On November 28 the user confirmed applying the migration and the connected task revision field was verified. Finish the two-account test above with your accounts.

## Funded budget policy

For reserve-before-publication tasks, the funded budget is fixed. Edit scope, timing, service category and evidence requirements before selection; applicants must confirm the updated version. To change the budget, remove/refund and post a new task. Withdrawals and removal use the separate ownership/version checks documented in [FUNDED_TASKS.md](FUNDED_TASKS.md).

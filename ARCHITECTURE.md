# CampusCrew code tour

CampusCrew has three systems: a Next.js interface/API, a Supabase marketplace database, and a Soroban escrow contract on Stellar Testnet. Supabase stores profiles, tasks, applications, messages, evidence metadata, notifications, and a reconciled payment view. The contract holds test USDC and controls payouts and refunds. A database status by itself never transfers funds.

## Where code belongs

| Folder | Responsibility | Example |
| --- | --- | --- |
| `src/app` | URL entry points and API request handlers | `api/stellar/booking/route.ts` |
| `src/components` | Shared application navigation | `marketplace-shell.tsx` |
| `src/components/shared` | Reusable app-wide UI and PWA controls | `brand-loader.tsx` |
| `src/features/book-one` | Marketplace screens and booking-specific UI | `pilot-board.tsx`, `booking-payment.tsx` |
| `src/features/book-one/auth` | Wallet connection, message sign-in, sessions, transaction signing | `stellar-auth.ts` |
| `src/features/book-one/services` | Marketplace operations, Stellar RPC/escrow, snapshots and balances | `stellar-escrow-server.ts` |
| `src/features/book-one/types` | Validated input schemas and data shapes | `pilot.ts` |
| `src/features/book-one/hooks` | Reusable client-side React behavior | `use-live-snapshot.ts` |
| `supabase/migrations` | Database tables, permissions and stored functions | `20261119000100_stellar_onboarding.sql` |
| `contracts/escrow` | Rust/Soroban token custody and transition rules | `src/lib.rs` |

Keep a component in the feature if only the marketplace uses it. A custom hook should own coherent behavior, such as opening the authenticated update stream and falling back to refreshes. Built-in React hooks such as `useState` stay inside the component or custom hook that needs them.

## Follow one task

1. `pilot-board.tsx` holds account/task state and calls `api/book-one/route.ts` to post or apply. `types/pilot.ts` validates inputs. `services/pilot-server.ts` checks the session and writes to Supabase.
2. `auth/pilot-wallet.tsx` configures the wallet chooser. `auth/stellar-auth.ts` creates and checks a short-lived signed login message. `api/stellar/auth/route.ts` issues a revocable HTTP-only session cookie. `auth/stellar-session.ts` reads it on later requests. A connected address alone is not authentication.
3. After provider selection, `booking-payment.tsx` offers the allowed action. `api/stellar/booking/route.ts` calls `services/stellar-escrow-server.ts` to check roles and chain state, simulate a transaction, and save an intent bound to its hash.
4. `auth/wallet-signing.ts` asks the selected wallet to sign the prepared Testnet transaction. The server checks the wallet, network, exact transaction, confirmed RPC result and matching contract booking before recording the receipt in Supabase.
5. `hooks/use-live-snapshot.ts` listens for authenticated server-sent updates from `api/updates/route.ts`. If the stream is unavailable, it refreshes while the page is visible.

Signed-in snapshots reconcile both pending app transactions and active bookings belonging to that wallet. Resolver decisions have no browser payment intent, so the active-booking check must run even when no app transaction is pending. `services/reconcile-payments.ts` merges those targets and avoids syncing a booking twice in one pass. The protected worker performs the same observation when browsers are closed.

## Escrow timing

The organizer creates the booking; the provider accepts; the organizer funds the contract. The provider submits completion. **Review starts immediately at submission:** the organizer may approve and release at once or open a dispute. The two-day review deadline is only the earliest time the provider may claim if the organizer has not acted and no dispute was opened. It does not delay an owner-approved payout. A dispute pauses the ordinary payout; only the configured resolver can decide the provider amount. Contributors reclaim any refundable amount.

The fallback protects a provider from indefinite nonpayment but gives the organizer a real deadline to inspect the work. Notifications should make that deadline obvious. Changing the two-day rule requires a reviewed contract change and deployment; editing UI text will not change on-chain behavior.

`booking-review-countdown.tsx` displays the saved on-chain review deadline. `hooks/use-review-countdown.ts` updates its display once per second and on tab focus; `services/review-countdown.ts` calculates and formats the remaining time. The clock never adds payment permissions: the server and contract still authorize claims. Disputed bookings show a paused notice and settled bookings remove the clock. See [the two-wallet dispute walkthrough](docs/DISPUTE_TEST.md) to test submission, payout, resolver awards, and refunds. Scheduled deadline reminders remain future work.

The contract stores multiple contribution shares, but the current web flow prepares one share for an individual booking. Book Together invitations, separate neighbour contributions and group progress are future app work. Current payments and reputation are Testnet pilot activity, not production transactions or student-identity verification.

## Dispute administration

`/admin/disputes` is a separate client entry point outside the marketplace layout. `hooks/use-resolver-session.ts` manages its connect/sign-in/logout steps using the existing wallet-auth endpoint. `auth/resolver-access.ts` compares the authenticated wallet with the configured resolver; private admin routes enforce that check independently of the UI. The login challenge has an admin purpose, while the underlying server session and revocation are shared with marketplace authentication.

`services/dispute-server.ts` reads case reports and strictly scopes participant or assigned-resolver access. `services/dispute-resolution-server.ts` prepares, verifies, submits and reconciles decisions. `services/resolver-transaction.ts` builds the exact contract call. Amount parsing is shared in `usdc-units.ts` and `dispute-amount.ts`; the preview is never the payment authority. `types/disputes.ts` defines the API schemas and case data shapes.

The database stores a report before the participant signs the on-chain dispute. The UI distinguishes that report from a confirmed pause. Decision intents bind a transaction hash, award and rationale; only a confirmed matching chain settlement becomes a completed decision. The worker recovers submitted decisions after browser closure. Evidence access is extended to the configured resolver only for an existing dispute case. Both participants can upload dispute files while the contract is Disputed; ordinary completion uploads retain their earlier provider-only rule.

See [ADMIN_DISPUTES.md](docs/ADMIN_DISPUTES.md) for operational setup and the three-profile Testnet acceptance test.

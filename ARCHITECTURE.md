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

## Escrow timing

The organizer creates the booking; the provider accepts; the organizer funds the contract. The provider submits completion. **Review starts immediately at submission:** the organizer may approve and release at once or open a dispute. The two-day review deadline is only the earliest time the provider may claim if the organizer has not acted and no dispute was opened. It does not delay an owner-approved payout. A dispute pauses the ordinary payout; only the configured resolver can decide the provider amount. Contributors reclaim any refundable amount.

The fallback protects a provider from indefinite nonpayment but gives the organizer a real deadline to inspect the work. Notifications should make that deadline obvious. Changing the two-day rule requires a reviewed contract change and deployment; editing UI text will not change on-chain behavior.

The contract stores multiple contribution shares, but the current web flow prepares one share for an individual booking. Book Together invitations, separate neighbour contributions and group progress are future app work. Current payments and reputation are Testnet pilot activity, not production transactions or student-identity verification.

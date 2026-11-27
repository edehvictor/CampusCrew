# CampusCrew

**A campus marketplace for everyday errands and local services.** Post a task, compare offers from people nearby, and book a provider. Students can earn from deliveries, shopping, cleaning, tutoring, repairs, design, and other useful work. We are starting at the University of Nigeria, Nsukka (UNN).

CampusCrew uses **Stellar Testnet** and **test USDC** for its current pilot. A Soroban escrow contract holds the agreed payment while work is done. This is a test-money product, not a live paid marketplace.

## How it works

1. **Join:** Connect a Stellar wallet, sign a login message, and complete a profile. Providers list their services and coverage area.
2. **Find a match:** A task owner posts what they need, where, and their budget. Nearby providers apply with a price, availability, and note. The owner compares applications and selects one provider.
3. **Secure payment:** The owner creates an escrow booking, the provider accepts its terms, and the owner funds it with test USDC. Both sides can see the confirmed payment state and receipt.
4. **Complete the task:** The provider submits a completion note and, when required by the task owner, a photo or document. The owner can approve payout immediately or open a dispute.
5. **Settle fairly:** If the owner does not act, the provider may claim after two days *unless a dispute was opened*. A dispute pauses ordinary payout; the configured resolver decides the provider's award, and the remainder becomes refundable. After confirmed payout, both sides can review the booking.

The app currently prepares **individual bookings**. The contract supports multiple contributions, but **Book Together** invitations, separate neighbour payments, and shared funding progress are still planned. See [the roadmap](ROADMAP.md).

## What is built

| Area | Current state |
| --- | --- |
| Marketplace | Wallet sign-in, profiles, UNN tasks, applications, provider selection, bookings, and personal activity pages |
| Stellar payments | Individual Testnet escrow creation, acceptance, funding, completion, payout, cancellation, disputes, and refunds |
| Trust and follow-up | Private booking messages and completion evidence, participant notifications, post-payout reviews, provider metrics, and payment history |
| Mobile | Responsive web app and installable PWA; phone push requires a configured worker, HTTPS, and user permission |
| Book Together | Planned; the group booking interface and separate participant funding are not live |

A wallet signature proves control of an address. It does **not** verify student status, provider skills, or a unique human. Reviews and earnings shown today are Testnet pilot data.

## Deployment

CampusCrew has a Next.js web app, a Supabase database, and a Soroban escrow contract on Stellar Testnet. Deploy the web app to a Node.js host, apply the database migrations, and configure the host with the Supabase credentials and the contract details in [`deployments/stellar-testnet.json`](deployments/stellar-testnet.json). Run the reconciliation worker separately so payment updates and optional notifications continue when browsers are closed.

Follow the [deployment guide](docs/DEPLOYMENT.md) for the environment variables, release checks, and Testnet booking walkthrough.

## Stack

| Library or tool | What it does |
| --- | --- |
| Next.js + React | App pages, server rendering, and API routes |
| TypeScript | Types for the interface and server code |
| Supabase + PostgreSQL | Profiles, tasks, applications, sessions, booking records, messages, and reviews |
| Stellar Wallets Kit | Connects browser wallets such as Freighter and xBull |
| Stellar SDK | Verifies wallet sign-in, prepares transactions, and reads Stellar Testnet state |
| Rust + Soroban SDK | Escrow contract rules for funding, payout, disputes, and refunds |
| Zod | Validates API inputs and decoded on-chain data at runtime |
| Server-Sent Events | Sends authenticated booking updates to open pages |
| Node.js worker | Reconciles pending transactions and delivers queued notifications |
| web-push | Sends opt-in phone and desktop push notifications |
| Web app manifest + service worker | Makes the site installable and provides a generic offline page |
| CSS | Responsive layout and the CampusCrew visual system |
| Lucide React | Interface icons |
| Fontsource | Self-hosted Plus Jakarta Sans and EB Garamond fonts |
| PGlite + Node.js test runner | Tests database behavior and application logic without a live Supabase project |
| ESLint | Checks code quality and Next.js conventions |

The database is the marketplace record; the contract is the authority for money. A database status alone cannot move USDC. See [ARCHITECTURE.md](ARCHITECTURE.md) for a guided code tour.

## Pages

| Route | Purpose |
| --- | --- |
| `/` | Home |
| `/campuses` | Campus discovery; UNN is the active campus |
| `/tasks`, `/tasks/:id` | Browse tasks and inspect a task |
| `/providers`, `/providers/:id` | Find providers and view public profiles |
| `/me/tasks` | Tasks you posted |
| `/me/applications` | Applications you sent |
| `/me/bookings`, `/me/bookings/:id` | Your bookings and their payment/work history |
| `/me/earnings`, `/me/notifications`, `/me/profile` | Earnings, alerts, and profile |

Personal data and booking actions are checked against the signed wallet session on the server.

## Run locally

Use **Node.js 24**. On Windows PowerShell, `npm.cmd` avoids the script-execution error from `npm.ps1`.

```powershell
Copy-Item .env.example .env.local
npm.cmd ci
npm.cmd run dev
```

Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`. Keep the service-role key out of Git and the browser. Apply the Stellar SQL files in `supabase/migrations` in filename order to your development Supabase project (see the [deployment guide](docs/DEPLOYMENT.md) for the list). Restart Next.js after changing environment variables. Open the local URL printed by Next.js, usually `http://localhost:3000`.

To use the **existing verified Testnet escrow**, fill `STELLAR_ESCROW_CONTRACT`, `STELLAR_ESCROW_WASM_HASH`, and `STELLAR_ESCROW_RESOLVER` from [`deployments/stellar-testnet.json`](deployments/stellar-testnet.json), then run `npm.cmd run stellar:enable`. This checks the deployment and required payment tables before setting `STELLAR_ESCROW_ENABLED=true` locally. Wallets need test XLM for fees and Circle-issued **test USDC** for funding; the profile dialog provides wallet setup controls.

Use two browser profiles to test the owner/provider journey. Post a test task, apply from the other wallet, select the provider, create and accept escrow, fund, submit work, and approve payout. Check the funding and payout receipts in both accounts. For a pilot dispute, the configured resolver can run `npm.cmd run stellar:resolve -- TASK_UUID PROVIDER_USDC_AMOUNT`; the decision is manual and should be documented. The resolver key never belongs in the web app's environment.

## Checks

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Contract checks run from the repository root with `cargo fmt --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings`, and `cargo build --locked --target wasm32v1-none --release`. Test fixtures live in `tests/fixtures`; the live app does not load sample tasks. The optional `stellar:smoke` script creates, accepts, and cancels an **unfunded** Testnet booking and is not a paid-booking test.

More detail: [deployment guide](docs/DEPLOYMENT.md) · [architecture](ARCHITECTURE.md) · [roadmap](ROADMAP.md) · [design system](DESIGN.md) · [contract rules](contracts/escrow/README.md).

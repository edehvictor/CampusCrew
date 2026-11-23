# CampusCrew

Book local services on your own or with neighbours. Built on Stellar.

## Run locally

Open this existing CampusCrew folder in VS Code. Use Node.js 24 and run:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the address printed in the terminal, usually http://localhost:3000. Keep one dev server running. Next.js refreshes when you save. Press Ctrl+C to stop the server. On macOS or Linux, use `npm` in place of `npm.cmd`.

## Configure Stellar onboarding

1. Use your existing development Supabase project, or create a development project for the pilot.
2. In Supabase SQL Editor, run `supabase/migrations/20261119000100_stellar_onboarding.sql` once. It creates the Stellar profiles, tasks, applications, booking records, login challenges, and sessions.
3. Put `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, following `.env.example`. Keep the service-role key private. Existing values can be reused. Reown and the Supabase Ethereum wallet provider are no longer needed for this onboarding flow.
4. Restart Next.js after changing environment variables. Refresh the page and choose **Connect wallet**.
5. Connect Freighter / Varial or xBull. Sign the CampusCrew login message and complete your profile. To apply for work, include the service category and area in your profile.

The app uses Stellar Testnet. A browser wallet connection is followed by a server-verified SEP-53 signed challenge. Challenges expire after five minutes, are bound to the browser and origin, and can create a session only once. Login cookies are HTTP-only and sessions can be revoked on sign-out. Wallet ownership is separate from provider skill or campus identity checks.

Stellar sign-in uses its own session cookie. Earlier Ethereum/Supabase browser sessions do not authenticate the Stellar API. The original pilot migration and its data are retained. Stellar records have their own tables and explicit Testnet/USDC labels.

## Booking stage

Users can sign in, save profiles, post tasks with test USDC budgets, apply, compare applications, and select a provider. Individual bookings now have wallet-signed escrow creation, provider acceptance, funding, completion submission, approval/payout, cancellation, disputes, and refunds. Pending submissions are tracked by their prepared transaction hash and recovered with **Refresh payment**. A booking advances only after a confirmed RPC result and a matching on-chain booking record.

The campus selector keeps UNN, Nsukka active. Choosing **Other campuses** displays a coming-soon notice and keeps the UNN task list selected. Multi-campus data and onboarding are not enabled yet.

Open your profile to see your wallet's test USDC and XLM balances, refresh them, get test XLM, add the USDC trustline, or open the test USDC faucet. Balances are read from Stellar Testnet for the signed-in wallet. Only USDC issued by Circle's Testnet issuer is counted. A failed lookup displays an error; an unactivated account and an account without a USDC trustline are identified separately. Balances and wallet setup controls stay in the profile modal.

The contract in `contracts/escrow` passed formatting, 14 Rust tests, Clippy, and the release WebAssembly build in [GitHub run 44843634439](https://github.com/edehvictor/CampusCrew/actions/runs/44843634439). Windows still blocks local dependency build scripts. The verified artifact was deployed to [Stellar Testnet](https://stellar.expert/explorer/testnet/contract/CCS3UK7HCGK5AQIPCJRVNMCR3HWXPD7ZCL7XMWRHGFTG46MTCBAGGZ6S); public configuration and receipts are in `deployments/stellar-testnet.json`.

## Enable Testnet booking payments

1. Apply `supabase/migrations/20261121000100_stellar_escrow.sql` once, after the onboarding migration. It stores immutable booking terms, prepared transaction approvals, confirmed receipts, and monotonic chain snapshots. Both migrations have been applied to the current development project.
2. To reuse the published Testnet deployment, use the contract, WASM hash, and resolver from `deployments/stellar-testnet.json` in `.env.local`, following `.env.example`.
3. Run `npm.cmd run stellar:enable`. It checks the deployed code and payment tables before enabling the local payment controls. Restart Next.js if needed. The current local pilot is enabled.
4. To deploy a new reviewed version, download its passing CI artifact into `target/verified/campuscrew_escrow.wasm`, then run `npm.cmd run stellar:deploy`. Deployment never enables payments automatically. Testnet deployer/resolver secrets stay in the ignored `.env.stellar-testnet.local`; the Next.js app does not need those secrets.

The first live technical check created, accepted, and cancelled an unfunded booking on Testnet. Its receipts are in `tests/receipts/stellar-testnet-smoke.json`. It transferred **zero USDC** and does not count as a completed service booking. The first browser-driven USDC funding/payout remains to be confirmed. Book Together is still a later milestone.

### Two-wallet payment test

1. In separate browser profiles, connect the task owner and provider to Stellar Testnet. Open each CampusCrew profile, get test XLM, choose **Add test USDC to wallet**, then **Open wallet and approve**. The profile dialog pauses while the wallet opens. Adding the trustline does not fund the wallet; the task owner then obtains at least 1 test USDC from Circle's faucet. Use **Reconnect wallet** if the wallet connection was lost.
2. Post a clearly marked test task and have the provider quote **1 USDC**. Select that provider.
3. As task owner, choose **Create Testnet escrow** and approve the wallet transaction. Use **Refresh payment** after confirmation.
4. As provider, refresh and choose **Accept booking terms**. Then the task owner refreshes and chooses **Fund with test USDC**.
5. As provider, refresh, choose **Submit completion**, write a note, and sign. As task owner, refresh and choose **Approve and release test USDC**.
6. Confirm **Paid**, the funding/settlement explorer receipts, and the provider's updated USDC balance. Refreshing must preserve state. If a transaction is pending or a response is lost, refresh payment before retrying.

Before funding, either party can cancel. After funding, disputes stop payout and require the independent resolver. For a pilot dispute, the local operator can run `npm.cmd run stellar:resolve -- TASK_UUID PROVIDER_USDC_AMOUNT` using the configured Testnet resolver key. An award of `0` makes the full deposit refundable; the contributor then uses **Refresh payment** and **Reclaim contribution**. This operator decision has its own saved receipt; it is not an automatic dispute judgment. Work and funding deadlines, the two-day review period, and resolver authority appear before funding.

## Test

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Fixtures live in `tests/fixtures`. Call `makeTaskFixtures()` in a test for independent sample data. The app loads real tasks from Supabase.

`npm.cmd run stellar:smoke` is an explicit technical Testnet create/accept/cancel check using fresh wallets and test XLM. It does not create Supabase tasks or transfer USDC, and it never runs during `npm test`.

Run Rust checks from this same project root:

```bash
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --target wasm32v1-none --release
```

See ROADMAP.md for the Stellar migration and buildathon delivery targets, DESIGN.md for layout and brand conventions, and AGENTS.md for repository guidance.

Based on the [Chucks1093 Next.js server template](https://github.com/Chucks1093/templates/tree/main/nextjs-server-template).


## Booking experience, evidence and reviews

Apply these updates in order after the existing Stellar migrations:

1. supabase/migrations/20261123000100_marketplace_experience.sql
2. supabase/migrations/20261123000200_reputation_queries.sql
3. supabase/migrations/20261123000300_refund_notifications.sql

They add private notifications, booking messages and event history, completion evidence, and two-way booking reviews. The second migration backfills a review-window start for already-paid pilot bookings at migration time; it does not claim to reconstruct their historical payout timestamps. The first two updates were checked against the connected development database on November 23; the user also confirmed the refund-alert update succeeded.

Evidence is optional by default. A task owner can require a photo or document when posting; the choice cannot be changed after booking through the app. Only the selected provider can upload before submitting completion. A private storage bucket holds up to three JPEG/PNG/WebP/PDF files of at most 5 MB each. Server checks enforce participants, actual file signatures, current booking state and limits. Downloads use participant-authorized, short-lived attachment URLs. A completion note is still required. Do not include sensitive document contents in public descriptions.

Reviews require a confirmed Paid booking and settlement receipt. Each side can review once within 14 days of settlement. Public reviews unlock after both respond or the settlement review window expires. Ratings and completed-booking metrics are computed on the server. All current feedback and earnings are identified as Testnet activity and must not be reused as production reputation. Identity or campus affiliation is not inferred from wallet ownership. Student-email verification is deliberately not a registration requirement or a shipped badge.

Personal routes live under /me: tasks, applications, bookings (including /me/bookings/BOOKING_UUID), profile, notifications and earnings. Each API derives ownership from the signed session. Public provider profiles use a separate opaque profile UUID. Application filters include Pending, Selected and Not selected. Bookings have Active, Completed and Cancelled/refund filters. No Settings menu is added.

## Automatic updates and phone installation

Open pages receive authenticated server-sent snapshots; the stream revalidates the session and reconnects periodically. It uses the existing HTTP-only session, so there is no extra login or public booking subscription. Disconnected/unsupported streams fall back to automatic snapshot checks while the page is visible. Pending Stellar submissions are checked against RPC before a payment update is recorded. Database triggers persist deduplicated participant notifications in the same transaction as each event. Confirmations are asynchronous: this is not a promise of instantaneous delivery.

Run the app in one terminal and a worker in another:

    npm.cmd run dev
    npm.cmd run experience:worker

The worker calls the protected /api/internal/experience-worker endpoint every ten seconds, reconciles submitted transactions, observes active bookings for external resolver decisions, and sends queued push notifications. It can also be scheduled by an external service using an Authorization: Bearer header containing EXPERIENCE_WORKER_SECRET. Run a durable worker in production; browser streams alone cannot reconcile after all browsers close. Do not expose worker or VAPID private keys to the client. A one-cycle check is available with npm.cmd run experience:worker -- --once. Alerts retry up to five times; invalid subscriptions are removed. OS delivery and connectivity can delay push. Notification bodies are generic to protect booking details on lock screens.

PWA files: src/app/manifest.ts, public/sw.js, public/offline.html and public/icons. The worker caches only the generic offline page, never authenticated bookings, sessions, private files or payment APIs. Production installation and web push require HTTPS. On iPhone, add CampusCrew to the Home Screen and enable notifications through a deliberate tap. Android installation can use the browser prompt/menu. An installed app still needs a network connection to transact.

Local VAPID keys and a worker secret were generated in the ignored .env.local. For a deployment, copy those values securely into the host's environment: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, EXPERIENCE_WORKER_SECRET, and set CAMPUSCREW_WORKER_ORIGIN on the worker host. Configure VAPID_SUBJECT to a project URL or contact address you control. Restart Next.js after changing environment values. Phone notifications are opt-in and a browser wallet's mainnet/testnet settings still apply.

Next browser acceptance: two wallets complete a 1-test-USDC booking without manual refresh; completion evidence is private and enforced when requested; each sees the other's message; payout opens review; duplicate/ineligible reviews fail; provider metrics and private earnings match receipts. Separately test refunds, reconnects, expired review windows and phone push with consent. Book Together remains a separate implementation milestone; this release does not enable shared contributions or identity checks.

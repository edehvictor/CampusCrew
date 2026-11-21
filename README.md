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

1. In separate browser profiles, connect the task owner and provider to Stellar Testnet. Open each CampusCrew profile, get test XLM, and add test USDC to the wallet. The task owner obtains at least 1 test USDC from the Circle faucet.
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

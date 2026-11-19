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

Users can sign in, save profiles, post tasks with test USDC budgets, apply, compare applications, and select a provider. The selected booking waits for funding.

The Soroban escrow draft is in `contracts/escrow`. Its connection to the browser and server is pending. The server rejects payment and completion requests until that integration is implemented. Windows Application Control blocked the original contract checks, so the contract's 13 Rust tests and WebAssembly build are still unverified. The prepared `.github/workflows/contracts.yml` can run checks on Linux after publication.

## Test

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Fixtures live in `tests/fixtures`. Call `makeTaskFixtures()` in a test for independent sample data. The app loads real tasks from Supabase.

Run Rust checks from this same project root:

```bash
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --target wasm32v1-none --release
```

See ROADMAP.md for the Stellar migration and buildathon delivery targets, DESIGN.md for layout and brand conventions, and AGENTS.md for repository guidance.

Based on the [Chucks1093 Next.js server template](https://github.com/Chucks1093/templates/tree/main/nextjs-server-template).

# Deploy CampusCrew

There are **two separate deployments**: the Soroban escrow contract and the Next.js web app. The contract is already deployed and verified on Stellar Testnet; its public metadata is in [`deployments/stellar-testnet.json`](../deployments/stellar-testnet.json). This repository does not currently record a verified public web-app URL. Do not present a contract explorer link as the app's website.

## 1. Prepare the database

Use a Supabase project for the Testnet pilot. Apply these migrations in order (by Supabase migrations or SQL Editor):

1. `supabase/migrations/20261119000100_stellar_onboarding.sql`
2. `supabase/migrations/20261121000100_stellar_escrow.sql`
3. `supabase/migrations/20261123000100_marketplace_experience.sql`
4. `supabase/migrations/20261123000200_reputation_queries.sql`
5. `supabase/migrations/20261123000300_refund_notifications.sql`
6. `supabase/migrations/20261127000100_provider_payout_receipts.sql`
7. `supabase/migrations/20261127000200_dispute_dashboard.sql`

The older `20261116000100_book_one.sql` belongs to the previous GoodDollar/Celo pilot and is not required to create a fresh Stellar pilot database. Confirm each migration succeeds before proceeding. The service-role key bypasses row-level restrictions and must remain server-side.

## 2. Configure the web app

Deploy this repository root as a **Next.js** application on a host that runs Node.js server routes. Use Node.js 24, `npm ci`, and `npm run build`. Set these environment variables on the host:

| Variable | Use |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL; safe for the browser |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only database access; secret |
| `STELLAR_ESCROW_CONTRACT` | Contract ID in `deployments/stellar-testnet.json` |
| `STELLAR_ESCROW_WASM_HASH` | Verified Wasm hash in the same file |
| `STELLAR_ESCROW_RESOLVER` | Resolver public address in the same file |
| `STELLAR_ESCROW_ENABLED` | `true` only after verifying the above values and applying the escrow migration |

The deployed Testnet contract is `CCS3UK7HCGK5AQIPCJRVNMCR3HWXPD7ZCL7XMWRHGFTG46MTCBAGGZ6S`. Set all three escrow identifiers from the deployment JSON rather than typing them from memory. `npm run stellar:enable` performs on-chain and database checks **locally** and writes to local `.env.local`; it does not update a web host's environment. For a hosted app, verify the same values and set them in the host's dashboard. Never deploy `.env.local`, `SUPABASE_SERVICE_ROLE_KEY`, deployer keys, or resolver secret to the client.

Use the final HTTPS app origin consistently when connecting and signing in. Login challenges are bound to the browser and origin. Verify that the wallet is on **Stellar Testnet**, not Mainnet. Add a public app URL to the root README only after the deployment loads and a two-wallet booking is checked there.

The resolver signs in at `/admin/disputes` using the wallet configured in `STELLAR_ESCROW_RESOLVER`. The web host uses only its public address, never the resolver's private key. Each financial settlement requires a wallet-signed transaction. See [admin setup and testing](ADMIN_DISPUTES.md).

## 3. Run reconciliation and optional phone push

Browser updates use an authenticated stream while the page is open. A separate worker is needed to reconcile pending transactions and send push alerts when browsers are closed. Run `npm run experience:worker` as a durable process on a worker host, with `CAMPUSCREW_WORKER_ORIGIN` set to the public HTTPS app origin and the same `EXPERIENCE_WORKER_SECRET` set on both the worker and web host. The worker calls the protected `/api/internal/experience-worker` endpoint every ten seconds. An external scheduler can call the endpoint with `Authorization: Bearer <secret>` instead. A one-cycle check is `npm run experience:worker -- --once`.

For phone push, also set `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `VAPID_SUBJECT` on the appropriate hosts. The private key stays server-side. Users must opt in; OS and network delivery are not instantaneous. The PWA can be installed over HTTPS, but transactions still need a network connection and wallet approval. The service worker caches only the generic offline page, not private bookings.

## 4. Check the release

1. Run `npm run lint`, `npm test`, and `npm run build` before deployment.
2. Open the deployed app in two separate browser profiles. Sign in with two Testnet wallets and save both profiles.
3. Post and apply for a clearly marked test task; select the provider. Check that each account sees only its permitted actions and private data.
4. Create and accept escrow. Fund with a small amount of **test USDC**, submit completion, and approve payout. Confirm both transaction receipts on Stellar Testnet and the resulting wallet balances. Each wallet needs test XLM for fees and the owner needs a USDC trustline and test funds.
5. Test a dispute/refund path separately. A dispute pauses payout; the configured resolver must make a manual award. Test notification delivery, reconnects, mobile layout, and an installed PWA before inviting pilot users.

The existing confirmed 1-test-USDC funding and payout receipts are linked from the root README. They prove the contract path on Testnet, not that the current web host is healthy or ready for a public paid launch.

## Replacing the Testnet contract

Only deploy a reviewed Wasm build. The passing CI workflow publishes `campuscrew_escrow.wasm`; put it at `target/verified/campuscrew_escrow.wasm` and run `npm run stellar:deploy`. The script uses separate Testnet deployer and resolver secrets in the ignored `.env.stellar-testnet.local`, verifies the resulting contract, and records public metadata in `deployments/stellar-testnet.json`. It leaves payment controls disabled. Apply the required database migration and check the new deployment before enabling payments. Do not reuse old payment terms or silently change an existing deployment's identifiers.

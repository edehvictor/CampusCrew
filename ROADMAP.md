# Stellar buildathon roadmap

The delivery order below follows the supplied buildathon roadmap. Each checkpoint requires its acceptance check to pass before being presented as shipped.

## Event requirements checked November 18, 2026

Source: [Stellar Buildathon application](https://docs.google.com/forms/d/e/1FAIpQLSf29BJ5Oto9R7PS_foAbfVzZmn6LYeolic34l1ryY1H-T3JfA/viewform). The organizer's [November 18 post](https://x.com/Stellar_Nigeria/status/2123069878995230904) links to a longer X article. The post summary was accessible, but the full article was not.

- The form describes a one-week buildathon with workshops, office hours, and a live Builder Showcase.
- Participants must be Stellar Builder's Circle members in Nigeria or Ghana. Only the team lead submits one registration per team.
- Previous SCF funding recipients, Instawards sprint participants, and people currently in the SCF or Instawards pipeline are excluded from winning. Eligibility is verified by the organizers.
- The form asks shortlisted Top 10 teams about in-person availability on December 4 or 5 in Lagos or Accra. It does not map each date to a city.
- The top two eligible projects from each location may be recommended for SCF Instawards of up to USD 15,000 in XLM per project. Recommendation is a further funding step.
- The accessible official form does not state the registration deadline, daily workshop dates, judging rubric, or final project submission cutoff. Reposts of an earlier announcement mention November 21. Confirm the official cutoff and timezone, and plan to register promptly.

Application positioning: CampusCrew helps students book local providers individually or with neighbours, with individual payments, shared contributions, payouts, and refunds implemented through Stellar escrow. Select Soroban Smart Contracts and Payments and Stablecoins as the planned features. Describe the existing local prototype and Stellar migration stage accurately. Wallet sign-in proves address ownership and does not establish provider expertise or unique-human identity.

Before December 4, aim to have the deployed Testnet app, contract address, confirmed receipts for all three demo journeys, a public repository, and a backup demo ready. These are our delivery targets. The form does not publish a detailed final-submission checklist.

## 1. Escrow foundation

Implement a single Soroban escrow supporting one contributor or several contributors. Keep authorization, provider acceptance, contribution accounting, release, dispute handling, and refunds on-chain.

Current implementation: `contracts/escrow/src/lib.rs`, with tests in `contracts/escrow/src/test.rs`.

Earlier build failures were fixed in two steps: the signing dependency was resolved to `ed25519-dalek` 2.2.0, then the contract-error test assertions were converted to the SDK's error wrapper. Windows Application Control still prevents local Rust compilation, so Linux CI is the verification environment. The current passing result and deployed contract are recorded below.

Acceptance: formatting, contract tests, Clippy, and a release WebAssembly build pass. Test signature requirements, replay attempts, incomplete groups, rounding, expiry, cancellation, and failure rollback.

**Verified November 21:** [run 44843634439](https://github.com/edehvictor/CampusCrew/actions/runs/44843634439) passed formatting, all 14 contract tests, Clippy, and the release Wasm build for `f687a39`. The downloaded archive matched GitHub's artifact SHA-256. The contract was deployed and its code/token/resolver verified on Stellar Testnet at `CCS3UK7HCGK5AQIPCJRVNMCR3HWXPD7ZCL7XMWRHGFTG46MTCBAGGZ6S`. Configuration and deployment receipts are in `deployments/stellar-testnet.json`.

CI now publishes compiler/test failures as public annotations and saves the Wasm artifact only after all checks pass. An additional role-separation test brings the suite to 14 contract tests.

## 2. Stellar authentication and profiles

Implemented in the existing checkout: Stellar Wallets Kit with Freighter / Varial and xBull, server-verified SEP-53 login, browser-bound single-use challenges, HTTP-only revocable sessions, profile completion, and Stellar task/application/provider-selection APIs. The active frontend uses Testnet/USDC labels. The GoodDollar verification and Celo wallet flow have been removed from the runtime.

The migration `supabase/migrations/20261119000100_stellar_onboarding.sql` has been applied to the development Supabase project. Signed login, session reads, challenge replay rejection, logout, and session revocation passed against the local API. On November 21 the user confirmed the two-browser test: sign in, save profiles, post a task, apply, select a provider, refresh, and sign out. Payment and completion actions now use the separate wallet-signed Stellar booking endpoint; unsigned legacy mutations remain disabled. Database tests also run the migration in in-memory PostgreSQL, including authorization and retry checks.

The marketplace now has a campus selector with UNN active and other campuses coming soon. It does not enable another campus or combine campus data. The profile account modal fetches actual Testnet XLM and Circle-issued test USDC balances from an authenticated server endpoint. No balance is shown in the main page header. Unactivated accounts, missing USDC trustlines, and network errors have separate states. App tests now include balance issuer matching and lookup failures.

For payment integration, check the wallet and Testnet network again before signing. Keep network, asset identity, contract address, participant shares, and transaction hashes on each booking. Decide any additional campus identity checks with pilot users.

Acceptance: two browser sessions sign in as different Stellar wallets, complete profiles, post a task, apply, and select a provider. Refresh preserves each account's session. Failed and replayed login challenges are rejected. The existing app's Celo authentication has been removed from the Stellar runtime.

## 3. Individual Testnet booking

The wallet-signed create/accept/fund/submit/release/claim/cancel/refund/dispute flow is implemented. The server constructs transactions from the selected booking, checks actor and chain state, binds the signed envelope to a stored hash, and only records confirmed receipts against matching ledger data. Pending submissions recover through Refresh payment; older responses cannot roll state backwards. The new escrow migration has been applied to development Supabase and local Testnet payments are enabled. Profile controls obtain test XLM and add Circle's USDC trustline; receiving test USDC still uses Circle's faucet.

The live technical create/accept/cancel journey passed against the deployed contract with zero USDC transferred. See `tests/receipts/stellar-testnet-smoke.json`. Unit/database tests cover precision, wrong wallets/networks, changed transaction bodies, on-chain term mismatches, immutable terms, private payment intents, receipt binding, and stale-state protection. A browser-driven funded booking, payout and refund still need confirmation before this checkpoint is complete. Disputes use the named independent resolver and the local Testnet operator utility; automatic dispute judgment is not implemented.

Deploy the escrow to Stellar Testnet with the verified test USDC asset. Connect creation, provider acceptance, funding, completion submission, approval, and payout. Store completion notes privately in application data and verify payment state from Stellar RPC.

Acceptance: a reviewer can open the deployed app, complete a booking with two test wallets, and inspect the confirmed contract, funding transaction, and payout. A failed, pending, mismatched, or repeated transaction cannot advance the booking incorrectly. Reloading recovers a confirmed payment.

## 4. Book Together

Add invitations, participant wallet addresses, fixed agreed contributions, a funding deadline, and remaining-funding progress. Confirm the plan before contract creation. Each contributor signs and pays their own share. Display the organizer's approval role and the resolver's authority before funding.

Acceptance: four residents fund one booking through the app and the provider receives one payout. In a second booking, an incomplete group expires and each actual contributor can reclaim their own deposit. Amounts, status, and receipts survive refresh and retries.

## 5. Provider discovery and notifications

Add provider discovery by service and coverage area, availability, and a request-a-quote path that creates the same booking structure. Notify participants of applications, selection, funding, completion, disputes, and expiry. Add reporting and moderation controls needed by the pilot.

Acceptance: both a posted-task journey and a provider-profile journey reach the same funded-booking flow. Share exact service addresses only with authorized participants.

## 6. Pilot and submission

Recruit one lodge, four residents, and two providers while engineering continues. Validate a real shared-service quote. Test mobile and desktop with separate wallets. Publish setup instructions, deployment details, known limitations, and a backup demo.

Demonstrate three journeys with test funds: individual completion and payout, shared funding and payout, and expired-funding refunds.

Measure tasks receiving suitable applications, time to first application, completed bookings, successfully funded groups, returning providers, repeat bookings, cancellations, and disputes. Count actual confirmed transactions, including group contributions, rather than assuming two transactions per booking.

Before a paid launch, complete the contract review and confirm an end-to-end funding and cash-out route with the selected payment partner.

# CampusCrew resolution desk

Open **http://localhost:3000/admin/disputes** with the local server running. On a hosted release, use the same path on the HTTPS app origin.

## Admin sign-in

Use a separate browser profile for administration. Add the existing resolver wallet privately to a supported Stellar wallet extension and select Stellar Testnet. Its public address is `resolver` in `deployments/stellar-testnet.json`; its private signing key is `STELLAR_RESOLVER_SECRET` in the ignored local `.env.stellar-testnet.local`. Never enter that secret on the dashboard, share it, or commit it. A newly created wallet does not inherit this deployed contract's authority.

Select the imported resolver account inside Varial, click **Connect Varial**, then **Sign in securely**. Connection reads the extension's selected address and may return without a popup if access was already granted. Sign-in requests a separate wallet signature. The extension must be installed and unlocked in the same browser profile that opens CampusCrew. **Choose another wallet** opens the general wallet chooser, including xBull.

The login message describes dispute administration and does not send a payment. The admin page reuses CampusCrew's server-verified wallet session, with an admin-specific challenge preflight. The server requires the signed-in address to match the configured resolver on every private request. Ordinary marketplace wallets cannot access the queue or settlement endpoints. Signing out revokes the session. No resolver private key is required in the web host environment; settlement is signed in the extension.

## Database setup

Apply `supabase/migrations/20261127000200_dispute_dashboard.sql` after the existing experience and provider-payout-receipt migrations. It adds private case reports, append-only statements through the app, decision intents and confirmations, and participant dispute-evidence uploads. The user confirmed applying this migration in the current development project. No contract redeployment is required.

## A case from report to settlement

1. The owner or provider selects **Report a problem** in a funded booking, chooses a reason, and explains what happened. Saving the report creates a database case. It does **not** pause funds. The wallet must approve the dispute transaction, and Stellar must confirm it.
2. In the booking's **Dispute** tab, both parties can add explanations. While the contract state is Disputed, each can upload up to three private evidence files (JPG, PNG, WebP or PDF, at most 4 MB each). Existing completion evidence is also available to the assigned resolver once a case exists.
3. At the resolution desk, select the case and click **Start review**. Read the agreement, completion note, both parties' statements, evidence, booking messages and timeline. Ask for clarification using the case-update form; these messages are visible to both parties. A report without a confirmed on-chain dispute cannot be settled.
4. Enter the provider's award and a decision explanation of at least 20 characters. The preview shows the provider's payment and the owner's refundable amount. The amount cannot exceed the verified funded deposit. Amounts support up to seven decimals.
5. Click **Review settlement**, inspect the final preview, then **Open wallet & approve decision**. The server prepares and stores the exact transaction hash, amount and explanation. Modified transaction contents or another signer's signature are rejected.
6. The decision remains pending until its successful Stellar transaction and matching booking state are confirmed. A lost response can be recovered using **Check confirmation**; a cancelled wallet request can be resumed from decision history before the prepared transaction expires. The background worker also reconciles submitted decisions. Confirmed decisions show their receipt and explanation to both parties.
7. The provider's award is transferred by the resolution. The owner signs **Reclaim contribution** separately for any refund. A confirmed settlement is final through this contract.

## Test with one test USDC

Use an owner profile, provider profile, and dedicated resolver profile. Create and fund a fresh 1-test-USDC booking, submit completion, and report a problem. Confirm the pause, add statements from both parties, and sign in to the desk as the resolver. Award 0.60 and explain your decision. Verify the provider's 0.60 receipt and earnings, then reclaim 0.40 as the owner. Use separate bookings for full refund (award 0) and full provider payment (award 1). Do not reuse an already settled booking.

The interface is built and automated authorization/database/transaction checks pass; wallet-popup behavior and the complete three-profile browser journey still require the user's acceptance test. The dashboard currently shows the latest 50 cases. Existing live on-chain disputes are imported into the queue; older resolved disputes without case reports are not reconstructed. Scheduled review deadlines, appeals, resolver reassignment, and multi-admin roles are not implemented. The database reasoning is private to case participants and the resolver; transaction addresses and amounts remain public on-chain.

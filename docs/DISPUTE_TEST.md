# Test the review countdown and dispute flow

Use two browser profiles on the same local origin with different Stellar Testnet wallets. Wallet A is the task owner; wallet B is the provider. Both need test XLM for fees, and A needs at least 1 Circle test USDC. Keep Next.js running (`npm.cmd run dev`) and, in another terminal, run `npm.cmd run experience:worker` for background reconciliation and notifications.

## First booking: see the countdown and immediate payment

1. A posts a clearly marked 1-test-USDC test task; B applies for 1 test USDC. A selects B.
2. In Bookings, A creates escrow, B accepts, and A secures the payment. Approve each action in the correct wallet and wait for confirmation.
3. B submits completion with a note and evidence if requested. Both accounts should show a countdown close to two days and the exact claim deadline. Owner review is available immediately.
4. Reload and switch tabs: the countdown should still use the original deadline, not restart. The timer is a local display; it does not authorize payments.
5. A chooses **Approve & pay provider**. Once confirmed, the booking is Paid, the countdown disappears, and B receives the test USDC. No two-day wait is required for this path.

## Second booking: pause payment and act as the referee

1. Repeat selection, acceptance and funding for a new 1-test-USDC task. B submits completion.
2. A opens that booking and chooses **Report a problem**, confirms the prompt, and approves the wallet transaction. Once confirmed, both accounts should show Disputed and **Payout paused for dispute**, with no ticking claim countdown. Neither ordinary release nor provider claim should be offered.
3. Copy the task UUID from the booking page URL: `/me/bookings/TASK_UUID`. This is not a transaction hash, contract address, or application UUID.
4. As the pilot operator, in the project terminal run `npm.cmd run stellar:resolve -- TASK_UUID 0.60`, replacing TASK_UUID. The existing ignored `.env.stellar-testnet.local` must contain the configured resolver key. Do not share its contents. This awards B 0.60 test USDC and makes 0.40 refundable to A. It is an explicit Testnet settlement, not a wallet-popup action for A or B.
5. Wait for confirmation. The open booking page checks active bookings for resolver decisions even if no app transaction is pending. A chooses **Reclaim contribution** in the booking and signs to receive 0.40 test USDC. The provider's 0.60 was transferred by the resolver decision; A's refund requires the separate reclaim transaction. Compare balances and receipts. If background sync is delayed, open **Receipts & payment help → Check payment status**.

Use `0` instead of `0.60` for a full refund, or `1` for full provider payment, on separate funded, disputed 1-test-USDC bookings. A resolution is final for that booking; do not repeat alternative awards on the same one. The resolver currently uses this operator script; a dispute case form and resolver dashboard are not yet implemented.

## Third booking: test the provider's fallback

Leave a new funded booking in Submitted after B submits completion, with no dispute and no owner approval. After the actual two-day deadline, B sees **Claim payout** and signs a transaction. The chain decides eligibility; changing a browser clock or database display value cannot accelerate the contract deadline. Both accounts should then show Paid. Testing this live requires the two-day wait; the contract test suite checks the time boundary with a controlled ledger clock.

The countdown is visible only for submitted work. Disputes replace it with a paused notice; paid/refunded bookings have no countdown. The clock does not send money automatically. The existing submission notification asks the owner to review; scheduled deadline reminders are not part of this change.

## Earnings after a split settlement

Apply `20261127000100_provider_payout_receipts.sql`. The app observes booking-bound contract events and verifies a successful release, claim or resolver transaction plus its token transfer before recording the provider receipt. The provider's earnings must include only the awarded amount, even after the owner reclaims a refund. The owner sees the award and refund as separate history entries with separate receipts. A full refund creates no provider earnings. This history is distinct from the wallet's current balance. Automatic receipt discovery uses recent Stellar RPC history; unavailable older receipts are not invented or treated as paid income.

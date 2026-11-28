# Fund a task before publishing

This is a new escrow protocol. The existing Testnet contract cannot reserve a budget before a provider is known. Keep `STELLAR_FUNDED_ENABLED=false` until the new contract passes CI and its separate deployment is verified. Do not overwrite `deployments/stellar-testnet.json` or the existing `STELLAR_ESCROW_*` values: they remain responsible for older bookings.

## The product flow

1. The owner fills in a task and its maximum budget. **Fund & publish task** prepares one wallet transaction.
2. The new contract's `publish` call transfers that budget into escrow. Rejecting the wallet approval, a failed transaction or a pending transaction does not publish a task.
3. The server verifies the saved transaction hash, Testnet signature, successful receipt, contract Wasm, token, resolver, owner, amount and ledger state. Only then does it create the task listing in PostgreSQL.
4. Providers quote at or below the funded budget. The owner chooses an offer. Selection locks the scope and offer, then **Confirm provider & assign budget** signs `assign`. This assigns the existing deposit; it does not charge the owner USDC again.
5. For a 5 test USDC budget and a 4 test USDC quote, assignment keeps 4 in the booking and returns 1 to the owner atomically. The provider then accepts, works and submits completion. Existing approval, two-day fallback, dispute and refund rules continue.

The pilot currently gives publication, assignment and provider acceptance a shared 24-hour deadline. Expiry closes applications; it never pays the provider automatically or confiscates the deposit. An unassigned deposit remains refundable. An assigned but unaccepted booking uses the booking cancellation/refund controls. Work and completion review have their own deadlines.

The owner and provider may each pay Stellar network fees for wallet-approved transactions. A fee in XLM is separate from the test USDC budget.

## Withdrawal and removal

- **Withdraw application** is an authenticated database operation, with no wallet transaction fee. Only its author can withdraw, and only before selection. Withdrawn applications stay in history, stop counting as active applications and cannot be selected. **Apply again** updates the same application and confirms the current task version.
- **Remove task & refund budget** signs a contract cancellation and returns the entire unassigned deposit. Applications pause while cancellation is pending. Removal is recorded only after the refund confirms.
- A selected task whose deposit was never assigned on-chain can still be removed and refunded. A transaction race cannot both assign and cancel the same reserve: the contract permits only one transition from Open.
- Once assigned, use booking cancellation/refund/dispute controls. Financial records are retained. Removal archives the listing rather than deleting receipts or other people's applications.
- The funded budget cannot be edited. To change it, refund/remove and post a new task. Scope edits before selection still require applicants to confirm the new version.

## Where the code lives

| Responsibility | Code |
| --- | --- |
| Budget reserve, atomic difference refund, cancellation and existing settlements | `contracts/escrow/src/lib.rs` |
| Contract scenarios and signature requirements | `contracts/escrow/src/test.rs` |
| Pure transaction construction, matching reserve and expiry safety | `src/features/book-one/services/publication.ts` |
| Private intents, receipt verification, reconciliation and publish-after-confirmation | `src/features/book-one/services/publication-server.ts` |
| Authenticated funding endpoint | `src/app/api/stellar/publication/route.ts` |
| Request validation and response types | `src/features/book-one/types/publication.ts` |
| Wallet interaction | `src/features/book-one/pilot-board.tsx` |
| Task forms, actions, withdrawal and recovery panel | `src/features/book-one/board.tsx`, `request-dialog.tsx`, `request-detail.tsx` |
| Database ownership, locking, price ceiling, removal and board visibility | `supabase/migrations/20261128000200_funded_task_lifecycle.sql` |
| Budget and ownership regression checks | `tests/funded-tasks.test.mjs` |

A private payment intent is saved **before** requesting the signature. It contains the draft and expected hash so a closed browser or delayed confirmation can be recovered. It is not a public task. Anonymous and authenticated database roles cannot read intents or call confirmation functions. The normal `post` API mutation now rejects attempts to publish without payment.

Do not trust frontend labels or amounts. PostgreSQL independently checks quote limits, ownership, versions, withdrawal and selection. The contract independently checks its deposit amount, signatures and single-use state. The server checks confirmed on-chain data before recording publication or refunds.

## Deployment sequence

1. Run application checks and Rust formatting, tests, Clippy and release Wasm build. The suite now defines 20 Rust scenarios, including six reserve-before-publication scenarios. If Windows still cannot download dependencies, use the existing Linux **Stellar escrow** GitHub Actions workflow. Download the artifact from the successful run for the new commit; the previous contract artifact does not contain these methods.
2. Extract the verified `campuscrew_escrow.wasm` into `target/verified/`.
3. Deploy the separate Testnet contract:
   ```powershell
   node scripts/deploy-stellar-testnet.mjs --funded target/verified/campuscrew_escrow.wasm
   ```
   This preserves the original deployment, checks the new publication methods, uses a distinct deterministic salt and retains the same resolver. It writes `deployments/stellar-funded-testnet.json` and disabled `STELLAR_FUNDED_*` configuration.
4. Run the complete `20261128000200_funded_task_lifecycle.sql` migration once in Supabase SQL Editor. It hides legacy **unfunded, unassigned** tasks from public browsing; their owners can still see and remove them. Existing bookings remain available. The schema rollout and new contract activation should happen together.
5. Enable only after deployment and migration verification:
   ```powershell
   node scripts/enable-stellar-escrow.mjs --funded
   ```
   Keep the existing escrow enabled too. Configure both sets of server environment variables on the web host, then restart Next.js.
6. Keep the authenticated experience worker running for automatic receipt recovery. Browsers can also use **Check funding** or **Check refund**. Do not send another deposit while the previous approval remains unresolved.

New server configuration (never replace the legacy keys):
```dotenv
STELLAR_FUNDED_CONTRACT=<new contract address>
STELLAR_FUNDED_WASM_HASH=<verified new Wasm SHA-256>
STELLAR_FUNDED_RESOLVER=<same resolver as the legacy contract>
STELLAR_FUNDED_ENABLED=false
```

## Two-wallet acceptance test

1. Owner posts a **5 test USDC** task. Cancel the first approval: no listing should appear. Check/expire that private approval before retrying.
2. Approve funding and wait for confirmation. Owner balance decreases by 5; Browse tasks shows the funded task and its receipt. Reload both browsers.
3. Provider tries a 5.01 quote (reject), then sends a 4 quote. Withdraw it: owner cannot select it. Reapply and let the owner select it.
4. Owner confirms assignment. Their balance increases by 1; the booking holds 4. Provider accepts without paying the 4. Submit and approve completion: provider receives 4.
5. Post another 2 test USDC task and remove it before assignment. Only its owner can cancel; after confirmation their 2 returns and the task disappears from public browsing. Both sides retain relevant history.
6. Confirm an older booking still loads its original escrow and receipts.

Passing database/UI tests does not establish that the new deployed contract works. Complete these wallet tests against the new address before describing funded publishing as live.

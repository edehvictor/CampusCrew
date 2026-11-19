# CampusCrew Stellar escrow

CampusCrew helps students and neighbours find local service providers. People post a task, compare offers, select a provider, and fund a booking. An individual can book alone, and a group can contribute to the same booking.

The first service area is the University of Nigeria, Nsukka. Categories include cleaning, tutoring, hair and beauty, repairs, tech and design, and errands.

The Stellar migration lives in the existing CampusCrew project. Run the Rust commands below from the project root. The frontend uses Stellar wallet sign-in and Testnet task data. Connecting this escrow to the frontend is the next payment milestone. Rust compilation, formatting, and the 13 contract tests are unverified because Windows Application Control blocked execution.

## Contract behaviour

- One deployment uses a single configured token contract and a named dispute resolver.
- The organizer signs booking creation with a fixed provider, contribution plan, funding deadline, and work deadline. The organizer must contribute. The provider and resolver must have independent wallets.
- The selected provider signs acceptance before participants can fund.
- Each participant signs a transfer of their exact agreed share. A booking becomes funded after the last contribution.
- Before full funding, the organizer or provider can cancel. Once the funding deadline passes, contributors can reclaim their deposits even if nobody manually cancels.
- After funding, the provider submits completion. The organizer can approve payout, or the provider can claim after a two-day review period if no dispute has been opened.
- The provider or any participant can open a dispute before settlement. The configured resolver decides the provider's payout, from zero to the funded total. The remainder is refundable to contributors in proportion to their deposits.
- Each contributor withdraws their own refund. Rounding preserves the exact refundable balance even when withdrawals occur out of order.
- A fully funded booking cannot be cancelled unilaterally. Missed work deadlines require the dispute path.

The two-day review period, maximum group size of 32, seven-day funding limit, and 30-day work limit are initial implementation choices for the pilot. Show the organizer's authority, automatic payout deadline, resolver address, and refund rules before anyone contributes. Review these terms with pilot participants before treating them as final product policy.

## Contract checks

Install Rust, its `wasm32v1-none` target, and the Stellar CLI using the official [Stellar setup guide](https://developers.stellar.org/docs/build/smart-contracts/getting-started/setup).

Run from the CampusCrew project root:

```bash
cargo fmt --check
cargo test --locked
cargo clippy --locked --all-targets -- -D warnings
cargo build --locked --target wasm32v1-none --release
```

The release artifact is `target/wasm32v1-none/release/campuscrew_escrow.wasm`. Local contract tests exercise the Soroban host with a test token. They do not create Stellar Testnet transactions.

## Testnet rollout

1. Configure a deployer, an independent resolver, two booking wallets, and additional contributor wallets for the shared-booking journey.
2. Confirm the chosen test USDC asset issuer and its Stellar Asset Contract against Circle's current documentation. Store the asset identity, token contract, escrow contract, and network passphrase with the deployment configuration.
3. Fund accounts with test XLM, establish any required trustlines, obtain test USDC, and verify balances.
4. Deploy the compiled escrow with the configured token contract and resolver address. Record the deployment hash and contract address.
5. Exercise individual funding/payout, four-wallet funding/payout, and expired-funding refunds. Save every confirmed transaction receipt.
6. Connect the same contract methods to the web flow and repeat the journeys through the app.

Deployment and signing should use explicit Stellar Testnet network configuration. A connected wallet proves control of its address. CampusCrew must describe any additional identity or provider checks separately and accurately.

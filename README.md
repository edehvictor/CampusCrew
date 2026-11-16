# Campuscrew

Book local services on your own or with neighbours and pay with G$.

## Run locally

Open this folder in VS Code and use its integrated terminal. Use Node.js 24, which includes npm. Check your version with `node --version`.

```powershell
npm.cmd ci
npm.cmd run dev
```

Use the address printed in the terminal, usually http://localhost:3000. Keep that terminal running while you edit. Next.js refreshes the app when you save. Press Ctrl+C to stop it. On macOS or Linux, use `npm` in place of `npm.cmd`.

No account, wallet, or environment variables are needed for Book One.

## Try Book One

- Open the sample cleaning task. View the applications, select the provider, simulate funding, submit a completion note, and approve the simulated payout.
- Post a task to see it in Posted tasks. Apply to someone else’s sample task to see it in Sent applications.
- Use category and service-area filters to find a task. Refresh the page to check that your demo changes persist.

The browser stores demo bookings for this local address. G$ funding, payouts, and refunds are simulated.

## Run the connected G$ pilot

1. Create a development Supabase project and enable the Ethereum Web3 wallet provider in Authentication. Add `http://localhost:3000/` to the allowed redirect URLs. If the local port changes, allow that origin too.
2. Apply `supabase/migrations/20261116000100_book_one.sql` in the project's SQL editor or with Supabase migrations.
3. Create a Reown project for WalletConnect. Copy `.env.example` to `.env.local` and fill in the Reown project ID, Supabase project URL, publishable key, and server service-role key. Keep the service-role key and any private RPC URL in that local file. Restart Next.js and use `http://localhost:3000` for wallet sign-in on this computer.
4. For funding, deploy `contracts/BookOneEscrow.sol` with GoodDollar's development G$ token on Celo as the constructor argument (`0xFa51eFDc0910CCdA91732e6806912Fa12e2FD475`). Put the deployed address in `BOOK_ONE_ESCROW_ADDRESS`. Keep `NEXT_PUBLIC_GOODDOLLAR_ENV=development` for the pilot. The dev identity and token run on Celo with development G$. Celo wallet transactions may need gas.
5. Use two browser profiles so the wallet sessions stay independent. Complete both Campuscrew profiles and verify with GoodDollar. In the second profile, include the category and area of the first profile's task. Post, apply, refresh, select the provider, and fund. Submit completion as the provider, then approve payout as the task owner. Compare the funding and settlement receipts in both sessions.

Pilot refund rules: the provider can refund a funded booking. The task owner can refund it after seven days if G$ is still held. Review those rules and the contract before a production rollout. If a payment was sent and the app is still waiting, use **Refresh payment** in the booking.

On the same computer, use `localhost` consistently across the browser, Supabase's allowlist, and Reown. For a browser on a phone, use a reachable HTTPS development origin that the providers allow.

[Supabase Web3 authentication](https://supabase.com/docs/guides/auth/auth-web3) · [Reown project setup](https://docs.reown.com/appkit/next/core/installation) · [GoodDollar development token](https://docs.gooddollar.org/for-developers/developer-guides/how-to-integrate-the-gusd-token)

## Working on the app

`src/app` contains Next.js entry points and shared styling. `src/components` contains the marketplace shell. `src/features/book-one` contains the booking board, task views, and browser state. See ROADMAP.md for the build sequence, DESIGN.md for layout and brand conventions, and AGENTS.md for repo guidance.

`npm run lint` and `npm run build` verify the app. Use a separate terminal if the dev server is running.

Based on the [Chucks1093 Next.js server template](https://github.com/Chucks1093/templates/tree/main/nextjs-server-template).

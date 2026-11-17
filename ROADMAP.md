# Campuscrew roadmap

## 1. Verify the connected Book One app

Check the task board on desktop and mobile, including the empty state. Keep fixture data under tests and run a clean build before sharing the staging URL.

Exit check: staging loads on two phones, displays real tasks from Supabase, and lets users start wallet sign-in.

## 2. Authentication and shared bookings

Let visitors browse. Use WalletConnect for wallet-first sign-in and require current GoodDollar verification on Celo before posting or applying. Start with the UNN Nsukka service area. Ask for a display name and location after sign-in. People who offer services add their categories, coverage areas, and a short bio before applying. Store profiles, tasks, applications, and bookings in Supabase and enforce ownership and provider selection on the server.

Exit check: use two separate browser sessions to post, apply, choose a provider, and exchange a completion note. Confirm only authorized accounts can perform each action and only one provider can be selected.

## 3. Celo and G$ pilot

Use the linked wallet at payment. First prove funding, release, and refund with test transactions, then add a capped G$ rebooking credit for repeat use. Define cancellation and dispute rules before a paid pilot. Document the contract, transaction evidence, and the volume of G$ used.

Exit check: two accounts complete one booking with independently verifiable funding and release. A repeat booking can redeem the credit once. Track time to first application, completed bookings, 30-day rebooking, and G$ redeemed.

## 4. Book Together

Use Book One activity to identify services that neighbours can realistically share. Pilot shared booking with one service and one location after the individual booking and payment flow has been tested with real users.

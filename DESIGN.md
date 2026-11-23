# Campuscrew interface

Campuscrew helps people book local services on their own or with neighbours. Book One starts with posted tasks and applications.

## Layout

Drips Wave uses a persistent navigation column, groups actions by role, and keeps the list next to its selected issue. Campuscrew uses the same layout idea with public discovery, posted tasks, sent applications, and shared bookings. The sidebar and list stay visible alongside the detail pane on desktop. On narrow screens, the navigation is available from the header and details open as a separate view within the board.

- Marketplace contains Home, Explore campuses, and Browse tasks. Home is the default entry point; service categories and real open tasks lead into the existing task board.
- My activity groups Posted tasks, Sent applications, and Bookings.
- Use View applications on a posted task to compare providers and select one.
- Primary actions are contextual. The top bar has Post a task, and a task's details show the action available in its current state.
- Put the campus selector above the task board. UNN, Nsukka is active; other campuses display Coming soon and do not change the selected campus.
- Explore campuses shows the active UNN community with its official logo and one general coming-soon card. Add other named campuses when their rollout is confirmed, rather than presenting speculative university partnerships.
- Keep wallet balances inside the concise profile account modal, with refresh, loading, and failure states. Collapse test-wallet tools once the account and USDC trustline are ready. The copy control copies the full wallet address and only confirms success after clipboard access succeeds. Show Testnet and USDC labels in task and booking flows, not Home or Explore campuses.
- Home opens as a campus task marketplace, lists errands alongside services, and states escrow protection in one concise line. Keep the first screen uncluttered; the three illustrated steps and open tasks can follow below the fold.

## Visual system

- Brand purple: `#6659DF`. Use it for the logo, selection cues, and color accents. Use a deeper purple on the primary button for legible white text.
- Lavender: `#E3E1EF`. Use it on the canvas and in the selected navigation and list treatments, with light surfaces for reading.
- Set interface text and labels in Plus Jakarta Sans. Use EB Garamond for page and task titles.
- Use the supplied mark with the Campuscrew wordmark. Use Lucide for icons and give icon-only controls an accessible name.
- Keep category, location, budget, and application count visible in the list. Give the selected task's scope and next action room in the detail pane.

- On mobile, show the brand mark alone in the header. The Home hero fills the viewport below the header and hides the illustration so the heading and actions have space.

- Use the brand mark with a delivery orbit and three sequential dots during initial loading. Respect reduced-motion preferences and never delay entry for the animation. The Home hero uses the supplied repeating grain texture, inverted to make its white translucent pixels dark, at 60% layer opacity (the source alpha peaks at 16%, giving about 10% maximum visible grain), behind content with no pointer interactions.

- The hero grain spans the full main content width, from the sidebar edge to the page edge. Keep the hero content and lower sections within the shared 1440px container and responsive gutters.

## Booking experience

Keep one current status and next action visible. Put wallet technical details and receipts in expandable sections, while showing the review/claim deadline when work is submitted. Work/evidence, messages and activity share a booking workspace. Reviews are dismissible and never gate payout. The account menu stays compact, with View profile and editing controls but no Settings entry. Use precise Testnet labels for ratings and earnings; never award a generic Verified badge for a connected wallet.

## Campus discovery and payment history

Keep the wallet/session board in the shared marketplace layout so route changes preserve the account and update stream. Disable the account button during the initial check without adding a loading caption. Merge overlapping background snapshot requests; sign-in, sign-out and mutations request fresh snapshots.

Explore campuses gives UNN one active campus panel, its supplied official logo, a live open-task count and category shortcuts. Expansion stays in a compact non-interactive note. The decorative campus locator is an illustration, not a geographical map.

Earnings & payments uses a restrained lavender earnings card, separate escrow/spending summaries, searchable status filters, receipt details and CSV export. Settled income is separate from escrow. Only selected participants see private payment records; selection alone never counts as payment. Dates are explicitly CampusCrew recording dates, including the documented pilot backfill. Never invent growth charts or transaction timestamps.

Research: [Wise transaction history](https://wise.com/help/articles/2489458/how-do-i-download-my-transaction-history) and [Stripe payment-data export](https://support.stripe.com/questions/exporting-payment-data) informed filtering, status separation and receipts; [Airbnb destination search](https://www.airbnb.com/help/article/252) informed location-first discovery.

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

- Use the brand mark with a delivery orbit and three sequential dots during initial loading. Respect reduced-motion preferences and never delay entry for the animation. The Home hero uses the supplied repeating grain texture at 3.5% opacity, behind content with no pointer interactions.

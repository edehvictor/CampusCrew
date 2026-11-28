# Campuscrew interface

Campuscrew helps people book local services on their own or with neighbours. Book One starts with posted tasks and applications.

## Layout

Drips Wave uses a persistent navigation column, groups actions by role, and keeps the list next to its selected issue. Campuscrew uses the same layout idea with public discovery, posted tasks, sent applications, and shared bookings. The sidebar and list stay visible alongside the detail pane on desktop. On narrow screens, the navigation is available from the header and details open as a separate view within the board.

- Marketplace contains Home, Explore campuses, and Browse tasks. Home is the default entry point; service categories and real open tasks lead into the existing task board.
- The expanded desktop sidebar is 220px wide (180px on tablets). On desktop, hovering the right sidebar edge for 600ms folds navigation to a 76px icon rail. The same invisible edge area expands the sidebar on a deliberate hover; show no arrow, purple divider highlight or handle. The selected navigation item keeps its separate 3px purple inset edge, lavender border and tinted background in both expanded and icon modes. Keep a keyboard-focusable edge target supporting Enter and Space. Ignore transient re-entry while the sidebar width animates. Preserve accessible link names, native hover tooltips and active-page styling. Mobile keeps the full labelled menu; reduced-motion preferences disable width transitions. The sidebar does not scroll. Reserve a separate footer row and at least 24px beneath Log out, spread the navigation with roomier rows on normal screens, compact it only on short screens, and use two menu columns in short mobile viewports.
- My activity groups Posted tasks, Sent applications, and Bookings.
- Use View applications on a posted task to compare providers and select one.
- Align the sidebar brand and the breadcrumb/profile controls to the same header-height variable and vertical centre. Keep navigation spacing below that dedicated brand row, including in icon mode; mobile does not reserve a second header row.
- Primary actions are contextual. The top bar has Post a task, and a task's details show the action available in its current state.
- Put the campus selector above the task board. UNN, Nsukka is active; other campuses display Coming soon and do not change the selected campus.
- Explore campuses shows the active UNN community with its official logo and one general coming-soon card. Add other named campuses when their rollout is confirmed, rather than presenting speculative university partnerships.
- Keep wallet balances inside the concise profile account modal, with refresh, loading, and failure states. Collapse test-wallet tools once the account and USDC trustline are ready. The copy control copies the full wallet address and only confirms success after clipboard access succeeds. Show Testnet and USDC labels in task and booking flows, not Home or Explore campuses.
- Home opens as a campus task marketplace, lists errands alongside services, and states escrow protection in one concise line. Keep the first screen uncluttered; the three illustrated steps and open tasks can follow below the fold.

## Visual system

- Brand purple: `#6659DF`. Use it for the logo, selection cues, and color accents. Use a deeper purple on the primary button for legible white text.
- Lavender: `#E3E1EF`. Use it on the canvas and in the selected navigation and list treatments, with light surfaces for reading.
- Set interface text and labels in Plus Jakarta Sans. Use EB Garamond for page and task titles. The Home hero is an exception: set ?Campus task? in Plus Jakarta Sans Variable and keep the italic ?marketplace.? in EB Garamond.
- Use the supplied mark with the Campuscrew wordmark. Use Lucide for icons and give icon-only controls an accessible name.
- Keep category, location, budget, and application count visible in the list. Give the selected task's scope and next action room in the detail pane.

- On mobile, show the brand mark alone in the header. The Home hero fills the viewport below the header and hides the illustration so the heading and actions have space.

- Use the brand mark with a delivery orbit and three sequential dots during initial loading. Respect reduced-motion preferences and never delay entry for the animation. The Home hero uses the supplied cloud image (`public/hero/campus-sky.png`) as a continuous, one-way 160-second transform loop (200 seconds on phones). Two identical pairs of mirrored panels make the wrap seamless. Keep the text side light with a directional wash, concentrate the moving sky around the pulse diagram, and use grain at 8% layer opacity. The service diagram sends one signal every three seconds through CampusCrew and escrow toward completion, with a soft glow and coordinated node highlights. Hide the diagram below 1280px so its labels never become cramped. A pause control stops both motions; reduced-motion preferences disable them. Decorative layers have no pointer interactions.

- The hero grain spans the full main content width, from the sidebar edge to the page edge. Keep the hero content and lower sections within the shared 1440px container and responsive gutters.

## Booking experience

Keep one current status and next action visible. Put wallet technical details and receipts in expandable sections, while showing the review/claim deadline when work is submitted. Work/evidence, messages and activity share a booking workspace. Reviews are dismissible and never gate payout. The account menu stays compact, with View profile and editing controls but no Settings entry. Use precise Testnet labels for ratings and earnings; never award a generic Verified badge for a connected wallet.

Keep the selected person and current payment action above expandable task details. Reached progress markers stay filled during disputes; show a pause instead of resetting to selection. A dispute before submission must not mark work submitted, and a partial settlement must not mark the full payment complete. Applications show price, availability, reputation and proposal first, with services and coverage expandable. The accepted application has a Selected badge and no selection button.

Task and application editors reuse the creation forms with prefilled fields. Preserve the version seen when the editor opens; stale edits must be rejected rather than overwrite newer details. A changed task asks existing applicants to review and confirm their offers before selection. Keep a visible cancel action, and remove editing controls after a provider is selected.

## Nearby discovery

Keep nearby discovery optional. Ask for browser location only after a click. Providers explicitly share one approximate location for 30 minutes and can stop immediately; do not imply continuous tracking or precise whereabouts. Show estimated kilometre bands and update times beside reputation. Ordinary service and area browsing remains available when permission is denied. Current-location discovery comes first; task pickup location matching follows separately.

## Resolver sign-in

The resolver login uses one compact centered panel with Connect wallet and Sign in steps. Show one primary action for the current step; keep alternate wallets secondary and collapse resolver address/help text. Show an explicit configuration error with retry when access cannot load or no resolver is configured. Authentication never authorizes a settlement by itself.

## Campus discovery and payment history

Keep the wallet/session board in the shared marketplace layout so route changes preserve the account and update stream. Disable the account button during the initial check without adding a loading caption. Merge overlapping background snapshot requests; sign-in, sign-out and mutations request fresh snapshots.

Keep the previous Explore campuses layout: the active UNN card with its supplied logo and Explore UNN tasks action, alongside the general Coming soon card. The user preferred this version; preserve it while refining other screens.

Earnings & payments uses a restrained lavender earnings card, separate escrow/spending summaries, searchable status filters, receipt details and CSV export. Settled income is separate from escrow. Only selected participants see private payment records; selection alone never counts as payment. Dates are explicitly CampusCrew recording dates, including the documented pilot backfill. Never invent growth charts or transaction timestamps.

Research: [Wise transaction history](https://wise.com/help/articles/2489458/how-do-i-download-my-transaction-history) and [Stripe payment-data export](https://support.stripe.com/questions/exporting-payment-data) informed filtering, status separation and receipts.

## Shared profile picture and compact account menu

Use the supplied black-and-white portrait through `src/components/shared/user-avatar.tsx` wherever a person has an avatar. The source stays unchanged in `public/avatars/default-profile.jpg`; CSS frames it in a circle. It is a shared placeholder, not proof of identity. Keep adjacent names visible and the repeated avatar decorative for screen readers.

The account popup prioritizes identity, one test-USDC balance, profile actions and sign-out. Wallet address/copy, test-XLM fees, reconnect and test-fund tools stay inside Wallet details. Missing trustlines do not automatically expand the compact menu. The full profile page retains the full wallet setup controls.

## Evidence attachments

Separate local selections from uploaded booking attachments. Use the shared evidence uploader for completion and disputes. Show image previews, local PDF preview links, filenames, sizes, real upload progress and explicit upload/cancel/remove controls. Keep an unconfirmed transfer distinct from a confirmed attachment. A cancelled request may already have reached the server; refresh before claiming success or deletion.

Required evidence and unfinished local selections block completion submission. Preparing completion freezes the attachment set. Submitted and disputed evidence stays read-only; additional dispute files are append-only. Keep private files behind authenticated access and avoid showing signed storage URLs in public profiles. See [EVIDENCE_UPLOADS.md](docs/EVIDENCE_UPLOADS.md).

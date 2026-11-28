# Nearby provider discovery

The first version searches from the task owner's current device location. Task pickup locations and application-distance ranking are next. It recommends nearby people; the owner still compares profiles and chooses a provider.

## Enable and test

Run the complete `supabase/migrations/20261127000300_nearby_providers.sql` file once in Supabase SQL Editor. Existing marketplace browsing does not depend on this migration. No map API key or Stellar transaction is needed.

1. Sign in as a provider and open My profile. Add a service and an On campus or Around Nsukka coverage area if needed.
2. Choose Share my approximate location, then allow browser location access. The profile should show Sharing with an expiry time 30 minutes later. This captures one location, not continuous tracking.
3. In the task owner's browser profile, open Find providers. Choose Find nearby help and allow location access.
4. Choose a service and radius. Providers with active opt-in locations appear in approximate distance order; the owner does not appear in their own results. Open a profile to compare reviews and completed tasks.
5. In the provider profile, choose Stop sharing. After the next search/update (up to 30 seconds), that person must disappear from nearby results. They remain in ordinary discovery.
6. Deny location permission in a separate test. No made-up location or distance should appear. Ordinary service and area filters must remain usable.
7. Test on a phone over HTTPS. Localhost works on the development computer, but an HTTP LAN address is not a supported secure location origin.

If both browser profiles use the same device, their distances may fall in the same first band. This is expected and does not prove a ranking bug. Coarse desktop estimates may be rejected; use a phone or manual area browsing instead.

## What the code does

- `services/browser-location.ts` requests one browser fix only after a click. It handles denial, unavailable/insecure contexts, timeouts and poor accuracy. It rounds latitude and longitude to two decimal places before sending them.
- `types/nearby.ts` validates coordinates, accuracy, supported radii and services. The browser cannot choose the acting wallet.
- `/api/nearby` checks the signed-in wallet session and same-origin mutation, then calls `services/nearby-server.ts`. Search origins are POSTed, not put in URL query strings, and are not stored.
- The private location table stores one coarse point per provider, roughly a kilometre-sized area near Nsukka, plus server timestamps. SQL also rounds incoming coordinates. No exact GPS point or location history is stored.
- SQL calculates straight-line distance between coarse points, returns whole-kilometre distance bands and public provider data, filters expired/non-local providers, and limits results to 50. Nearby searches are limited to one per two seconds per signed-in profile.
- `hooks/use-nearby-providers.ts` handles permission requests, results, expired entries, aborted/stale requests and updates while the page is visible. The latest shared search origin stays in component memory until discovery is cleared or the account/page unmounts.
- `provider-discovery.tsx` combines service/search/area filters with nearby discovery; `provider-card.tsx` and `reputation-line.tsx` are reused for ordinary and nearby results.
- `provider-location.tsx` handles provider opt-in and stopping. An old status response cannot undo a newer stop action in the interface. Leaving the profile while a permission prompt is pending prevents a later publish from that component.

## Boundaries

Distance bands are estimates, not directions, travel times, guaranteed availability or proof of identity. Device location can be inaccurate or spoofed. Reviews and normal booking checks still matter. Exact pickup/delivery addresses belong in private booking communication.

Provider location expires after 30 minutes even if the worker is down, because SQL excludes expired rows. Stopping sharing deletes the provider's row immediately. Expired rows are removed by nearby requests and the existing authenticated experience worker; physical cleanup depends on those running. No location is written on-chain.

Validation at initial implementation: 84 application/database tests, lint and production build passed. The suite covers opt-in, coordinate coarsening, expiry, distance/service filters, search throttling, restricted database access, and browser permission/accuracy failures. The private location table was verified in the connected database on November 28. Two-account device-location testing remains pending browser permissions and the test flow above.

Reference: [MDN Geolocation API](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API).

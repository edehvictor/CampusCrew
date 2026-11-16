# Campuscrew

- Use this Next.js App Router checkout for development. Run `npm ci` once, then `npm run dev`. Local development needs no credentials.
- Read DESIGN.md for interface conventions and ROADMAP.md for build order.
- Keep route entry points in `src/app`, shared navigation in `src/components`, and Book One UI, models, and browser demo state in `src/features/book-one`.
- Keep the browser demo working across reloads. The storage key is `campuscrew-book-one-v1`. When changing its shape, handle saved data from older versions.
- Demo identities and payouts are simulated. When implementing shared accounts and payments, enforce ownership and booking transitions on the server.
- Use Lucide for interface icons. Preserve keyboard navigation, explicit field labels, and a usable mobile list/detail flow.
- Run `npm run lint` and `npm run build` after changes. Keep `npm run dev` running in a separate terminal for interactive checks.

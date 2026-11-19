# Campuscrew

- Use this Next.js App Router checkout for development. Run `npm ci` once, then `npm run dev`. Configure the connected pilot via .env.local. The booking tests need no credentials.
- Read DESIGN.md for interface conventions and ROADMAP.md for build order.
- Keep route entry points in `src/app`, shared navigation in `src/components`, and the Book One UI, models, and booking logic in `src/features/book-one`.
- Keep mock data in `tests/fixtures`. Run `npm test` to check booking behavior with test fixtures.
- Enforce ownership and booking transitions on the server.
- Use Lucide for interface icons. Preserve keyboard navigation, explicit field labels, and a usable mobile list/detail flow.
- Run `npm run lint`, `npm test`, and `npm run build` after changes. Keep `npm run dev` running in a separate terminal for interactive checks.
- Continue the Stellar migration in this checkout. Keep the Next.js app at the repository root and Soroban code in `contracts/escrow`.
- Check the root Rust workspace with `cargo fmt --check`, `cargo test --locked`, `cargo clippy --locked --all-targets -- -D warnings`, and `cargo build --locked --target wasm32v1-none --release`. Report blocked checks accurately.
- Read the Stellar migration status in ROADMAP.md before changing authentication or payment behaviour.

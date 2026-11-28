# Evidence uploads and completion

## Provider flow

1. Open a **Funded** booking and choose **Work & evidence**.
2. Choose up to three files. Photos show thumbnails; PDFs have a local **Preview PDF** link. Nothing uploads when files are selected.
3. Check the filename, preview and size. **Remove** discards a local selection. **Upload** sends that file and shows real transfer progress. A completed transfer remains Processing until the server confirms it.
4. **Cancel upload** aborts the browser request. Cancellation may arrive after the server has received the file, so the booking refreshes its Attached files list. The interface never promises a received file was deleted merely because the transfer was cancelled.
5. **Retry** uses the same upload ID and content hash. An interrupted response cannot silently create a second attachment or overwrite another file.
6. Uploaded files appear under **Attached files**, labelled as not yet submitted. The selected provider may remove their own attachment before completion approval starts.
7. Choose **Submit completion**, add a completion note and approve submission in the wallet. Uploading alone does not submit work or release payment. Required evidence and unfinished local selections block accidental submission.

Switching between Work, Messages, Activity and an already-opened Dispute tab preserves local selections. Leaving the booking aborts active transfers and releases preview URLs; confirmed attachments stay in the booking.

## Limits and privacy

New uploads accept JPG, PNG, WebP and PDF, up to **4 MB per file**. Both the client and server inspect file signatures; the server also enforces size and ownership. The limit leaves room for multipart overhead under Vercel's default 4.5 MB request limit ([official limits](https://vercel.com/docs/functions/limitations)). Earlier attachments up to 5 MB remain readable. The existing storage bucket/database upper bound is retained for those older records; the current upload endpoint enforces the lower new-upload limit.

Evidence stays in the private `campuscrew-evidence` Supabase bucket. Authorized image previews use the existing authenticated evidence route with short-lived signed URLs; PDF files are downloaded rather than embedded. Local previews use temporary blob URLs. No Cloudinary integration or public upload preset is involved.

Only booking participants can access files. A configured resolver can access evidence for an actual dispute case. Removed files are excluded from authenticated reads, booking lists and dispute lists. Physical deletion runs immediately; if storage is unavailable, the authenticated worker retries. Previously issued signed links have a short lifetime. Audit metadata and a removal event remain.

## Completion and dispute locks

Uploading, removing and preparing a completion transaction acquire the same escrow-row lock in PostgreSQL. Preparing completion locks the evidence set, including optional attachments. Required evidence must exist and must not have been removed. If removal wins the lock first, preparing completion without required evidence fails; if preparation wins, removal fails.

Evidence cannot be removed after submission, payout or during a dispute. Either booking participant can append dispute evidence while the contract is Disputed, with up to three active files per uploader. Existing evidence cannot be erased to change a case record.

A cancelled wallet approval can leave a prepared completion intent briefly active. Removal checks current chain state and the transaction's ledger expiry before clearing an expired approval. A completed on-chain submission never becomes editable because its browser response was interrupted. File upload/removal uses ordinary authenticated HTTP calls and does not require a wallet transaction or network fee.

Files support the owner's review and the resolver's decision. Their presence does not automatically prove delivery or successful work.

## Code map

| Responsibility | File |
| --- | --- |
| Reusable chooser, preview cards, attachment list and controls | `src/features/book-one/evidence-uploader.tsx` |
| Local selection, progress, cancellation and preview cleanup | `src/features/book-one/hooks/use-evidence-uploads.ts` |
| HTTP upload transport and stable-ID response checks | `src/features/book-one/services/evidence-upload.ts` |
| File validation | `src/features/book-one/services/evidence-validation.ts` |
| Authenticated upload, preview, download and removal endpoint | `src/app/api/evidence/route.ts` |
| Chain-aware removal and durable object cleanup | `src/features/book-one/services/evidence-server.ts` |
| Completion/evidence guards, removal audit and retry rules | `supabase/migrations/20261128000300_evidence_workflow.sql` |
| Database and transport checks | `tests/evidence-workflow.test.mjs`, `tests/evidence-upload.test.mjs` |
| Isolated desktop/mobile checks (intercepts all API calls) | `scripts/check-evidence-ui.mjs`, `tests/fixtures/evidence.mts` |

## Rollout

Apply the complete `20261128000300_evidence_workflow.sql` migration. It is independent of funded-posting migration `20261128000200`; it does not change the escrow contract, prices or payments. The user applied it and the new columns and submission-lock function were verified in development Supabase. Deploy the matching server and UI together, and run the authenticated experience worker for deletion retries.

Test with a Funded booking as its selected provider: choose an image, remove it before upload, choose a PDF, preview it, start and cancel upload, retry, then remove the confirmed attachment. When evidence is required, completion must stay blocked until a file is uploaded. Finally submit completion and confirm both sides see read-only attachments. During a dispute, new files may be appended but existing files cannot be removed.

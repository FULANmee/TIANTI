# Assets and Object Storage

## Modes and Configuration

Storage is selected by TIANTI_STORAGE_MODE:

- mock: uploads are stored as data URLs in the in-memory repository;
- r2: src/storage/r2.ts writes to Cloudflare R2 through the AWS S3 client.

src/lib/env.ts::getR2StorageConfig() is the only configuration normalizer. It requires bucket, endpoint, access key, secret, and public base URL, adding https:// when needed and removing a trailing slash.

Do not read raw R2 environment variables in components, routes, or cleanup logic.

## Canonical Upload Flow

~~~text
InlineAssetUpload
  -> crop in browser
  -> POST multipart /api/admin/assets
  -> uploadObjectToR2() or mock data URL
  -> saveAsset()
  -> ContentRepository.createAsset()
  -> onUploaded(asset) updates the owning draft
~~~

InlineAssetUpload supports file input, drag/drop, paste, reopening an existing image through the authenticated asset GET route, crop/zoom, replace, and clear.

/api/uploads/presign and createUploadSignature() still exist but are not the current component flow. If changing upload strategy, search both surfaces and either keep them coherent or explicitly retire the unused one.

## Image Ratios

src/lib/asset-display.ts is the single source for both crop and display ratio behavior.

- Every asset kind currently supports 3:4 and 4:3.
- 3:4 is the default.
- A ratio is accepted within a delta of 0.03.
- saveAsset() revalidates width/height server-side.
- Public components use getAssetDisplayPreset() rather than hard-coding an aspect ratio.

Reference consumers include TalentCard, EventArchiveCard, talent detail rails, and InlineAssetUpload.

## Replacement and Immediate Cleanup

When replacing or clearing an image:

1. Keep the old ID in the owning component's deduplicated cleanupCandidateAssetIds.
2. Save the business entity/archive first.
3. Pass candidates to the mutation.
4. Call cleanupUnusedAssets() only after the repository write succeeds.

This ordering prevents deleting an asset still needed by an unsaved draft. See TalentManager, ArchiveManager, saveTalent(), and saveArchive().

Cleanup always rescans references. Never directly delete an object just because a client removed it from one field.

## Reference-Aware Cleanup

src/modules/assets/cleanup.ts owns all current asset references:

- talent cover;
- talent representations;
- archive scene images;
- archive shared photos.

If a new asset-bearing field/table is added, update collectReferencedAssetIds() and the conditional Postgres delete before shipping.

The delete order is:

1. verify the candidate is not referenced in the loaded state;
2. call repository deleteAssetIfUnreferenced(), with a database-level recheck in Postgres;
3. delete the R2 object when an object key is known;
4. retain object-delete failures in the result instead of rolling the deleted DB row back.

Static local media and unrelated external URLs are not cron candidates because no owned R2 key can be proven.

## Orphan Cron

vercel.json calls /api/cron/cleanup-orphan-assets at 17 3 * * *.

The job:

- requires CRON_SECRET;
- uses a default 30-minute grace window;
- processes at most 50 eligible assets by default;
- considers only unreferenced assets with a resolvable R2 object key and valid old-enough createdAt;
- rechecks references during deletion.

Environment knobs are ORPHAN_ASSET_GRACE_MINUTES and ORPHAN_ASSET_CLEANUP_LIMIT, both positive integers.

## Verification

~~~bash
npm test -- tests/unit/lib/asset-display.test.ts
npm test -- tests/unit/lib/image-transfer.test.ts
npm test -- tests/unit/assets/cleanup.test.ts
npm test -- tests/unit/admin/mutations.test.ts
npm run test:e2e -- -g "upload|image|crop|shared-photo"
~~~

For real R2 validation, use a non-production object and confirm upload, public read, replace/clear, and cleanup without exposing credentials in logs.

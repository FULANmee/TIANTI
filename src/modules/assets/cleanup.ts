import "server-only";
import { randomUUID } from "node:crypto";

import { getOrphanAssetCleanupConfig, getR2StorageConfig, isMockStorageMode } from "@/lib/env";
import type { Asset, ContentState } from "@/modules/domain/types";
import { getContentRepository } from "@/modules/repository";
import { deleteObjectFromR2 } from "@/storage/r2";

export interface AssetCleanupResult {
  attemptedAssetIds: string[];
  deletedAssetIds: string[];
  missingAssetIds: string[];
  objectDeleteErrors: Array<{
    assetId: string;
    message: string;
    objectKey: string;
  }>;
  skippedReferencedAssetIds: string[];
}

export interface OrphanAssetCleanupResult extends AssetCleanupResult {
  cutoffIso: string;
  eligibleAssetCount: number;
  graceMinutes: number;
  limit: number;
  scannedAssetCount: number;
}

function dedupeIds(ids: string[]) {
  return [...new Set(ids)];
}

export function collectReferencedAssetIds(state: ContentState) {
  const referencedAssetIds = new Set<string>();

  for (const talent of state.talents) {
    if (talent.coverAssetId) {
      referencedAssetIds.add(talent.coverAssetId);
    }

    for (const representation of talent.representations) {
      if (representation.assetId) {
        referencedAssetIds.add(representation.assetId);
      }
    }
  }

  for (const archive of state.archives) {
    for (const entry of archive.entries) {
      if (entry.sceneAssetId) {
        referencedAssetIds.add(entry.sceneAssetId);
      }

      if (entry.sharedPhotoAssetId) {
        referencedAssetIds.add(entry.sharedPhotoAssetId);
      }
    }
  }

  return referencedAssetIds;
}

function getAssetObjectKeyFromUrl(url: string) {
  if (isMockStorageMode()) {
    return null;
  }

  try {
    const { publicBaseUrl } = getR2StorageConfig();
    const normalizedBaseUrl = `${publicBaseUrl}/`;
    if (!url.startsWith(normalizedBaseUrl)) {
      return null;
    }

    return decodeURIComponent(url.slice(normalizedBaseUrl.length));
  } catch {
    return null;
  }
}

export function getAssetObjectKey(asset: Pick<Asset, "objectKey" | "url">) {
  return asset.objectKey?.trim() || getAssetObjectKeyFromUrl(asset.url);
}

function getAssetCreatedAtTime(asset: Pick<Asset, "createdAt">) {
  if (!asset.createdAt) {
    return null;
  }

  const createdAtTime = Date.parse(asset.createdAt);
  return Number.isNaN(createdAtTime) ? null : createdAtTime;
}

async function cleanupAssetsByIds(candidateIds: string[]): Promise<AssetCleanupResult> {
  const repository = getContentRepository();
  const attemptedAssetIds = dedupeIds(candidateIds.map((id) => id.trim()).filter(Boolean));

  if (attemptedAssetIds.length === 0) {
    return {
      attemptedAssetIds: [],
      deletedAssetIds: [],
      missingAssetIds: [],
      objectDeleteErrors: [],
      skippedReferencedAssetIds: []
    };
  }

  const state = await repository.getState();
  const referencedAssetIds = collectReferencedAssetIds(state);
  const assetMap = new Map(state.assets.map((asset) => [asset.id, asset]));
  const deletedAssetIds: string[] = [];
  const missingAssetIds: string[] = [];
  const objectDeleteErrors: AssetCleanupResult["objectDeleteErrors"] = [];
  const skippedReferencedAssetIds: string[] = [];

  for (const assetId of attemptedAssetIds) {
    if (referencedAssetIds.has(assetId)) {
      skippedReferencedAssetIds.push(assetId);
      continue;
    }

    const asset = assetMap.get(assetId);
    if (!asset) {
      missingAssetIds.push(assetId);
      continue;
    }

    const objectKey = getAssetObjectKey(asset);
    const deleted = await repository.deleteAssetIfUnreferenced(assetId, objectKey);
    if (!deleted) {
      skippedReferencedAssetIds.push(assetId);
      continue;
    }

    deletedAssetIds.push(assetId);
  }

  for (const job of await repository.listAssetObjectDeletionJobs(Math.max(100, attemptedAssetIds.length))) {
    try {
      await deleteObjectFromR2(job.objectKey);
      await repository.completeAssetObjectDeletionJob(job.objectKey);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete object from R2.";
      await repository.failAssetObjectDeletionJob(job.objectKey, message);
      objectDeleteErrors.push({ assetId: job.assetId, message, objectKey: job.objectKey });
    }
  }

  return {
    attemptedAssetIds,
    deletedAssetIds,
    missingAssetIds,
    objectDeleteErrors,
    skippedReferencedAssetIds
  };
}

export async function cleanupUnusedAssets(candidateIds: string[]) {
  return cleanupAssetsByIds(candidateIds);
}

export async function cleanupOrphanedAssets(): Promise<OrphanAssetCleanupResult> {
  const repository = getContentRepository();
  const { graceMinutes, limit } = getOrphanAssetCleanupConfig();
  const state = await repository.getState();
  const referencedAssetIds = collectReferencedAssetIds(state);
  const cutoffTime = Date.now() - graceMinutes * 60 * 1000;
  const orphanAssets = state.assets
    .filter((asset) => !referencedAssetIds.has(asset.id))
    .filter((asset) => Boolean(getAssetObjectKey(asset)))
    .filter((asset) => {
      const createdAtTime = getAssetCreatedAtTime(asset);
      return createdAtTime !== null && createdAtTime <= cutoffTime;
    })
    .sort((left, right) => {
      const leftTime = getAssetCreatedAtTime(left) ?? 0;
      const rightTime = getAssetCreatedAtTime(right) ?? 0;
      return leftTime - rightTime;
    });

  const attemptedAssetIds = orphanAssets.slice(0, limit).map((asset) => asset.id);
  const run = {
    id: randomUUID(),
    status: "running" as const,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    scannedAssetCount: state.assets.length,
    eligibleAssetCount: orphanAssets.length,
    deletedAssetCount: 0,
    errorCount: 0
  };
  await repository.saveAssetCleanupRun(run);

  try {
    const cleanupResult = await cleanupAssetsByIds(attemptedAssetIds);
    await repository.saveAssetCleanupRun({
      ...run,
      status: cleanupResult.objectDeleteErrors.length > 0 ? "completed_with_errors" : "completed",
      finishedAt: new Date().toISOString(),
      deletedAssetCount: cleanupResult.deletedAssetIds.length,
      errorCount: cleanupResult.objectDeleteErrors.length
    });

    return {
    ...cleanupResult,
    cutoffIso: new Date(cutoffTime).toISOString(),
    eligibleAssetCount: orphanAssets.length,
    graceMinutes,
    limit,
    scannedAssetCount: state.assets.length
    };
  } catch (error) {
    await repository.saveAssetCleanupRun({ ...run, status: "failed", finishedAt: new Date().toISOString(), errorCount: 1 });
    throw error;
  }
}

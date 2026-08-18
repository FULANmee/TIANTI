import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";
import { PRODUCTION_NEON_BRANCH_ID } from "./apply-preview-v5-migrations";

type Environment = Readonly<Record<string, string | undefined>>;

export function getTarget(environment: Environment) {
  const preview = environment.TIANTI_PREVIEW_V5_1_MIGRATIONS === "1";
  const production = environment.TIANTI_PRODUCTION_V5_1_MIGRATIONS === "1";
  if (preview && production) throw new Error("5.1 migration flags cannot both be enabled.");
  if (!preview && !production) return null;
  if (!environment.VERCEL_DEPLOYMENT_ID?.startsWith("dpl_")) {
    throw new Error("5.1 migration requires a Vercel deployment ID.");
  }
  if (preview) {
    if (
      environment.VERCEL_ENV !== "preview" ||
      environment.VERCEL_TARGET_ENV !== "preview" ||
      !["5.1", "codex/5.1", "codex/5.3"].includes(environment.VERCEL_GIT_COMMIT_REF ?? "")
    ) throw new Error("5.1 Preview migration guard rejected this deployment context.");
    return "preview" as const;
  }
  if (
    environment.VERCEL_ENV !== "production" ||
    environment.VERCEL_TARGET_ENV !== "production" ||
    !["main", "codex/5.1"].includes(environment.VERCEL_GIT_COMMIT_REF ?? "")
  ) throw new Error("5.1 Production migration guard rejected this deployment context.");
  return "production" as const;
}

export async function main(environment: Environment = process.env) {
  const target = getTarget(environment);
  if (!target) {
    console.log("TIANTI 5.1 migration skipped.");
    return;
  }
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error("5.1 migration requires DATABASE_URL.");
  const parsed = new URL(databaseUrl);
  if (!parsed.hostname.endsWith(".neon.tech")) throw new Error("5.1 migration requires Neon.");

  const sql = postgres(databaseUrl, { max: 1, prepare: false });
  try {
    await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext('tianti-v5-1-migrations'))`;
      const branchRows = await transaction<{ branch_id: string | null }[]>`
        select current_setting('neon.branch_id', true) as branch_id
      `;
      const branchId = branchRows[0]?.branch_id;
      if (target === "preview" && (!branchId || branchId === PRODUCTION_NEON_BRANCH_ID)) {
        throw new Error("5.1 Preview migration rejected this Neon branch.");
      }
      if (target === "production" && branchId !== PRODUCTION_NEON_BRANCH_ID) {
        throw new Error("5.1 Production migration rejected this Neon branch.");
      }

      const rows = await transaction<{ table_name: string; column_name: string | null }[]>`
        select table_name, column_name from information_schema.columns
        where table_schema = 'public' and (
          (table_name = 'assets' and column_name = 'crop_x') or
          (table_name = 'talents' and column_name = 'mcn_source') or
          (table_name = 'talent_douyin_profiles' and column_name = 'latest_work_url') or
          table_name in ('asset_cleanup_runs', 'asset_object_deletion_jobs')
        )
      `;
      const markers = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
      const baseComplete = [
        "assets.crop_x", "talent_douyin_profiles.latest_work_url",
        "asset_cleanup_runs.id", "asset_object_deletion_jobs.object_key"
      ].every((marker) => markers.has(marker));
      if (!baseComplete) {
        if (markers.size > 0) throw new Error("5.1 migration found a partial schema and stopped safely.");
        const migration = await readFile(new URL("../drizzle/0010_empty_mentor.sql", import.meta.url), "utf8");
        await transaction.unsafe(migration, [], { prepare: false });
      }

      const mcnRows = await transaction<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'talents'
          and column_name in ('mcn', 'mcn_source')
      `;
      if (mcnRows.length > 0) {
        const removal = await readFile(new URL("../drizzle/0011_remove_mcn.sql", import.meta.url), "utf8");
        await transaction.unsafe(removal, [], { prepare: false });
      }

      const beautyTierRows = await transaction<{ column_name: string }[]>`
        select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'archive_entries' and column_name = 'beauty_tier'
      `;
      if (beautyTierRows.length === 0) {
        const ratingMigration = await readFile(new URL("../drizzle/0012_redundant_wolfpack.sql", import.meta.url), "utf8");
        await transaction.unsafe(ratingMigration, [], { prepare: false });
      }
    });
  } finally {
    await sql.end({ timeout: 5 });
  }
  console.log(`TIANTI 5.1 ${target} schema is complete.`);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) await main();

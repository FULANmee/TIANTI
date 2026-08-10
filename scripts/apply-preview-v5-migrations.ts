import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import postgres from "postgres";

export const PRODUCTION_NEON_BRANCH_ID = "br-patient-dust-anwfalxy";
const MIGRATION_LOCK_KEY = "tianti-v5-migrations";

export const targetTables = [
  "douyin_sync_results",
  "douyin_sync_runs",
  "event_merge_rule_members",
  "event_merge_rules",
  "talent_douyin_profiles",
  "talent_douyin_related_accounts",
  "talent_douyin_schedule_entries"
] as const;

export const targetIndexes = [
  "douyin_sync_results_run_idx",
  "douyin_sync_results_talent_idx",
  "douyin_sync_results_created_at_idx",
  "douyin_sync_runs_started_at_idx",
  "douyin_sync_runs_status_idx",
  "douyin_sync_runs_running_idx",
  "event_merge_rule_members_rule_idx",
  "event_merge_rule_members_source_entry_idx",
  "event_merge_rule_members_identity_idx",
  "event_merge_rules_target_event_idx",
  "talent_douyin_profiles_sec_user_id_idx",
  "talent_douyin_profiles_last_success_idx",
  "talent_douyin_related_accounts_talent_idx",
  "talent_douyin_related_accounts_unique_idx",
  "talent_douyin_schedule_entries_talent_idx",
  "talent_douyin_schedule_entries_event_idx",
  "talent_douyin_schedule_entries_state_date_idx",
  "talent_douyin_schedule_entries_fingerprint_idx",
  "events_origin_idx"
] as const;

export const targetConstraints = [
  "douyin_sync_results_pkey",
  "douyin_sync_results_run_id_douyin_sync_runs_id_fk",
  "douyin_sync_results_talent_id_talents_id_fk",
  "douyin_sync_runs_pkey",
  "event_merge_rule_members_pkey",
  "event_merge_rule_members_rule_id_event_merge_rules_id_fk",
  "event_merge_rule_members_talent_id_talents_id_fk",
  "event_merge_rules_pkey",
  "event_merge_rules_target_event_id_events_id_fk",
  "talent_douyin_profiles_pkey",
  "talent_douyin_profiles_talent_id_talents_id_fk",
  "talent_douyin_related_accounts_pkey",
  "talent_douyin_related_accounts_talent_id_talents_id_fk",
  "talent_douyin_schedule_entries_pkey",
  "talent_douyin_schedule_entries_talent_id_talents_id_fk",
  "talent_douyin_schedule_entries_event_id_events_id_fk"
] as const;

export const targetColumns = {
  douyin_sync_results: ["id", "run_id", "talent_id", "status", "code", "message", "created_at"],
  douyin_sync_runs: [
    "id",
    "trigger",
    "status",
    "requested_count",
    "succeeded_count",
    "skipped_count",
    "failed_count",
    "started_at",
    "finished_at"
  ],
  event_merge_rule_members: [
    "id",
    "rule_id",
    "source_entry_id",
    "talent_id",
    "city",
    "normalized_name",
    "starts_at",
    "ends_at",
    "last_seen_at"
  ],
  event_merge_rules: ["id", "target_event_id", "created_at", "updated_at"],
  talent_douyin_profiles: [
    "talent_id",
    "profile_url",
    "sec_user_id",
    "signature_raw",
    "itinerary_text",
    "follower_count",
    "fetched_at",
    "last_success_at",
    "last_error_code",
    "link_extraction_status",
    "manual_sync_available_at",
    "parser_version"
  ],
  talent_douyin_related_accounts: ["id", "talent_id", "nickname", "sec_user_id", "url", "sort_order"],
  talent_douyin_schedule_entries: [
    "id",
    "talent_id",
    "fingerprint",
    "raw_text",
    "starts_at",
    "ends_at",
    "city",
    "event_name",
    "event_id",
    "first_seen_at",
    "last_seen_at",
    "consecutive_missing_count",
    "state",
    "parser_version"
  ]
} as const;

const mergeRuleTableNames = new Set(["event_merge_rule_members", "event_merge_rules"]);
const mergeRuleIndexNames = new Set([
  "event_merge_rule_members_rule_idx",
  "event_merge_rule_members_source_entry_idx",
  "event_merge_rule_members_identity_idx",
  "event_merge_rules_target_event_idx"
]);
const mergeRuleConstraintNames = new Set([
  "event_merge_rule_members_pkey",
  "event_merge_rule_members_rule_id_event_merge_rules_id_fk",
  "event_merge_rule_members_talent_id_talents_id_fk",
  "event_merge_rules_pkey",
  "event_merge_rules_target_event_id_events_id_fk"
]);

type Sql = postgres.TransactionSql;
type MigrationEnvironment = Readonly<Record<string, string | undefined>>;

export type MigrationTarget = "preview" | "production";

export interface SchemaSnapshot {
  baseTablesPresent: boolean;
  targetTableNames: Set<string>;
  targetColumnNames: Set<string>;
  originColumnPresent: boolean;
  targetIndexNames: Set<string>;
  targetConstraintNames: Set<string>;
}

export function isEnabledForThisBuild(environment: MigrationEnvironment = process.env) {
  if (environment.TIANTI_PREVIEW_V5_MIGRATIONS !== "1") {
    return false;
  }

  if (
    environment.VERCEL_ENV !== "preview" ||
    environment.VERCEL_TARGET_ENV !== "preview" ||
    environment.VERCEL_GIT_COMMIT_REF !== "5.0"
  ) {
    throw new Error("Preview migration guard rejected this deployment context.");
  }

  if (!environment.VERCEL_DEPLOYMENT_ID?.startsWith("dpl_")) {
    throw new Error("Preview migration guard requires a Vercel deployment ID.");
  }

  return true;
}

export function isEnabledForProductionBuild(environment: MigrationEnvironment = process.env) {
  if (environment.TIANTI_PRODUCTION_V5_MIGRATIONS !== "1") {
    return false;
  }

  if (
    environment.VERCEL_ENV !== "production" ||
    environment.VERCEL_TARGET_ENV !== "production" ||
    environment.VERCEL_GIT_COMMIT_REF !== "main"
  ) {
    throw new Error("Production migration guard rejected this deployment context.");
  }

  if (!environment.VERCEL_DEPLOYMENT_ID?.startsWith("dpl_")) {
    throw new Error("Production migration guard requires a Vercel deployment ID.");
  }

  return true;
}

export function getMigrationTarget(environment: MigrationEnvironment = process.env): MigrationTarget | null {
  const previewEnabled = environment.TIANTI_PREVIEW_V5_MIGRATIONS === "1";
  const productionEnabled = environment.TIANTI_PRODUCTION_V5_MIGRATIONS === "1";

  if (previewEnabled && productionEnabled) {
    throw new Error("Preview and Production migration flags cannot be enabled together.");
  }

  if (previewEnabled) {
    return isEnabledForThisBuild(environment) ? "preview" : null;
  }

  if (productionEnabled) {
    return isEnabledForProductionBuild(environment) ? "production" : null;
  }

  return null;
}

export function getValidatedDatabaseUrl(environment: MigrationEnvironment = process.env) {
  const raw = environment.DATABASE_URL;
  if (!raw) {
    throw new Error("5.0 migration requires DATABASE_URL.");
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    // Node's ERR_INVALID_URL includes the original input, which can contain the
    // database password. Replace it with a deliberately secret-free error.
    throw new Error("5.0 migration requires a valid database URL.");
  }
  if (
    !["postgres:", "postgresql:"].includes(parsed.protocol) ||
    !parsed.hostname.endsWith(".neon.tech") ||
    !parsed.hostname.split(".")[0]?.startsWith("ep-")
  ) {
    throw new Error("5.0 migration requires a Neon deployment endpoint.");
  }

  return {
    raw,
    endpointId: parsed.hostname.split(".")[0]
  };
}

async function readSchemaSnapshot(sql: Sql): Promise<SchemaSnapshot> {
  const [baseTableRows, tableRows, columnRows, originRows, indexRows, constraintRows] = await Promise.all([
    sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ('events', 'talents')
    `,
    sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public'
        and table_name in ${sql(targetTables)}
    `,
    sql<{ table_name: string; column_name: string }[]>`
      select table_name, column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name in ${sql(targetTables)}
    `,
    sql<{ column_name: string }[]>`
      select column_name
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'events'
        and column_name = 'origin'
    `,
    sql<{ indexname: string }[]>`
      select indexname
      from pg_indexes
      where schemaname = 'public'
        and indexname in ${sql(targetIndexes)}
    `,
    sql<{ constraint_name: string }[]>`
      select constraint_name
      from information_schema.table_constraints
      where constraint_schema = 'public'
        and constraint_name in ${sql(targetConstraints)}
    `
  ]);

  return {
    baseTablesPresent: new Set(baseTableRows.map((row) => row.table_name)).size === 2,
    targetTableNames: new Set(tableRows.map((row) => row.table_name)),
    targetColumnNames: new Set(
      columnRows.map((row) => `${row.table_name}.${row.column_name}`)
    ),
    originColumnPresent: originRows.length === 1,
    targetIndexNames: new Set(indexRows.map((row) => row.indexname)),
    targetConstraintNames: new Set(constraintRows.map((row) => row.constraint_name))
  };
}

function hasEveryExpectedColumn(snapshot: SchemaSnapshot) {
  return Object.entries(targetColumns).every(([tableName, columns]) =>
    columns.every((columnName) => snapshot.targetColumnNames.has(`${tableName}.${columnName}`))
  );
}

function hasExactlyExpectedValues(actual: Set<string>, expected: readonly string[]) {
  return actual.size === expected.length && expected.every((value) => actual.has(value));
}

export function getSchemaState(snapshot: SchemaSnapshot) {
  if (!snapshot.baseTablesPresent) {
    return "invalid_base" as const;
  }

  const isFresh =
    snapshot.targetTableNames.size === 0 &&
    snapshot.targetColumnNames.size === 0 &&
    !snapshot.originColumnPresent &&
    snapshot.targetIndexNames.size === 0 &&
    snapshot.targetConstraintNames.size === 0;
  if (isFresh) {
    return "fresh" as const;
  }

  const legacyTableNames = targetTables.filter((tableName) => !mergeRuleTableNames.has(tableName));
  const legacyColumnNames = Object.entries(targetColumns)
    .filter(([tableName]) => !mergeRuleTableNames.has(tableName))
    .flatMap(([tableName, columns]) => columns.map((columnName) => `${tableName}.${columnName}`));
  const legacyIndexNames = targetIndexes.filter((indexName) => !mergeRuleIndexNames.has(indexName));
  const legacyConstraintNames = targetConstraints.filter(
    (constraintName) => !mergeRuleConstraintNames.has(constraintName)
  );
  const isLegacyComplete =
    hasExactlyExpectedValues(snapshot.targetTableNames, legacyTableNames) &&
    hasExactlyExpectedValues(snapshot.targetColumnNames, legacyColumnNames) &&
    snapshot.originColumnPresent &&
    hasExactlyExpectedValues(snapshot.targetIndexNames, legacyIndexNames) &&
    hasExactlyExpectedValues(snapshot.targetConstraintNames, legacyConstraintNames);
  if (isLegacyComplete) {
    return "legacy_complete" as const;
  }

  const isComplete =
    snapshot.targetTableNames.size === targetTables.length &&
    hasEveryExpectedColumn(snapshot) &&
    snapshot.originColumnPresent &&
    snapshot.targetIndexNames.size === targetIndexes.length &&
    snapshot.targetConstraintNames.size === targetConstraints.length;
  return isComplete ? ("complete" as const) : ("partial" as const);
}

export async function main(environment: MigrationEnvironment = process.env) {
  const migrationTarget = getMigrationTarget(environment);
  if (!migrationTarget) {
    console.log("TIANTI 5.0 migration skipped.");
    return;
  }

  const database = getValidatedDatabaseUrl(environment);
  const sql = postgres(database.raw, { max: 1, prepare: false });
  let migrationResult: {
    beforeState: "fresh" | "legacy_complete" | "complete";
    branchId: string;
  };

  try {
    migrationResult = await sql.begin(async (transaction) => {
      await transaction`select pg_advisory_xact_lock(hashtext(${MIGRATION_LOCK_KEY}))`;
      const branchRows = await transaction<{ branch_id: string | null }[]>`
        select current_setting('neon.branch_id', true) as branch_id
      `;
      const branchId = branchRows[0]?.branch_id;
      if (migrationTarget === "preview") {
        if (!branchId || !branchId.startsWith("br-") || branchId === PRODUCTION_NEON_BRANCH_ID) {
          throw new Error("Preview migration rejected an unverified or production Neon branch.");
        }
      } else if (branchId !== PRODUCTION_NEON_BRANCH_ID) {
        throw new Error("Production migration rejected a non-production Neon branch.");
      }

      const before = await readSchemaSnapshot(transaction);
      const beforeState = getSchemaState(before);
      if (beforeState === "invalid_base") {
        throw new Error("5.0 migration database is missing required TIANTI base tables.");
      }
      if (beforeState === "partial") {
        throw new Error("5.0 migration database contains a partial TIANTI 5.0 schema.");
      }

      if (beforeState === "fresh") {
        const [migrationSeven, migrationEight, migrationNine] = await Promise.all([
          readFile(new URL("../drizzle/0007_adorable_brood.sql", import.meta.url), "utf8"),
          readFile(new URL("../drizzle/0008_big_tigra.sql", import.meta.url), "utf8"),
          readFile(new URL("../drizzle/0009_lowly_fabian_cortez.sql", import.meta.url), "utf8")
        ]);
        await transaction.unsafe(migrationSeven, [], { prepare: false });
        await transaction.unsafe(migrationEight, [], { prepare: false });
        await transaction.unsafe(migrationNine, [], { prepare: false });
      } else if (beforeState === "legacy_complete") {
        const migrationNine = await readFile(
          new URL("../drizzle/0009_lowly_fabian_cortez.sql", import.meta.url),
          "utf8"
        );
        await transaction.unsafe(migrationNine, [], { prepare: false });
      }

      const afterState = getSchemaState(await readSchemaSnapshot(transaction));
      if (afterState !== "complete") {
        throw new Error("5.0 migration database failed the complete TIANTI 5.0 schema check.");
      }

      return { beforeState, branchId };
    });
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log(
    `TIANTI 5.0 ${migrationTarget === "preview" ? "Preview" : "Production"} schema ${
      migrationResult.beforeState === "fresh"
        ? "applied"
        : migrationResult.beforeState === "legacy_complete"
          ? "upgraded"
          : "already complete"
    }; endpoint=${database.endpointId}; branch=${migrationResult.branchId}.`
  );
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  await main();
}

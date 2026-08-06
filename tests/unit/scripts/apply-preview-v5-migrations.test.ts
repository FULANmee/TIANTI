import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  PRODUCTION_NEON_BRANCH_ID,
  getSchemaState,
  getValidatedDatabaseUrl,
  isEnabledForThisBuild,
  targetColumns,
  targetConstraints,
  targetIndexes,
  targetTables,
  type SchemaSnapshot
} from "../../../scripts/apply-preview-v5-migrations";

const validPreviewEnvironment = {
  TIANTI_PREVIEW_V5_MIGRATIONS: "1",
  VERCEL_ENV: "preview",
  VERCEL_TARGET_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "5.0",
  VERCEL_DEPLOYMENT_ID: "dpl_test"
};

function makeCompleteSnapshot(): SchemaSnapshot {
  return {
    baseTablesPresent: true,
    targetTableNames: new Set(targetTables),
    targetColumnNames: new Set(
      Object.entries(targetColumns).flatMap(([tableName, columns]) =>
        columns.map((columnName) => `${tableName}.${columnName}`)
      )
    ),
    originColumnPresent: true,
    targetIndexNames: new Set(targetIndexes),
    targetConstraintNames: new Set(targetConstraints)
  };
}

describe("TIANTI 5.0 Preview migration gate", () => {
  it("stays disabled unless the explicit migration flag is set", () => {
    expect(isEnabledForThisBuild({})).toBe(false);
  });

  it.each([
    ["a Production deployment", { VERCEL_ENV: "production" }],
    ["a non-Preview target", { VERCEL_TARGET_ENV: "production" }],
    ["another Git branch", { VERCEL_GIT_COMMIT_REF: "main" }]
  ])("rejects %s before database configuration is read", (_label, overrides) => {
    expect(() =>
      isEnabledForThisBuild({ ...validPreviewEnvironment, ...overrides })
    ).toThrow("Preview migration guard rejected this deployment context.");
  });

  it("rejects local or unverifiable execution without a deployment ID", () => {
    expect(() =>
      isEnabledForThisBuild({
        ...validPreviewEnvironment,
        VERCEL_DEPLOYMENT_ID: undefined
      })
    ).toThrow("Preview migration guard requires a Vercel deployment ID.");
  });

  it("pins the known Production Neon branch deny-list value", () => {
    expect(PRODUCTION_NEON_BRANCH_ID).toBe("br-patient-dust-anwfalxy");
  });

  it("validates a Neon endpoint without exposing a malformed connection string", () => {
    const validUrl = "postgresql://preview-user:preview-password@ep-safe-123.eu.neon.tech/database";
    expect(getValidatedDatabaseUrl({ DATABASE_URL: validUrl })).toEqual({
      raw: validUrl,
      endpointId: "ep-safe-123"
    });

    const secret = "must-not-appear";
    let thrown: unknown;
    try {
      getValidatedDatabaseUrl({ DATABASE_URL: `postgresql://preview-user:${secret}@[` });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(Error);
    expect(String(thrown)).toBe("Error: Preview migration requires a valid database URL.");
    expect(String(thrown)).not.toContain(secret);
  });

  it("classifies only the exact fresh and complete states as safe", () => {
    const fresh: SchemaSnapshot = {
      baseTablesPresent: true,
      targetTableNames: new Set(),
      targetColumnNames: new Set(),
      originColumnPresent: false,
      targetIndexNames: new Set(),
      targetConstraintNames: new Set()
    };
    expect(getSchemaState(fresh)).toBe("fresh");
    expect(getSchemaState(makeCompleteSnapshot())).toBe("complete");

    const missingPrimaryKey = makeCompleteSnapshot();
    missingPrimaryKey.targetConstraintNames.delete("talent_douyin_profiles_pkey");
    expect(getSchemaState(missingPrimaryKey)).toBe("partial");

    expect(getSchemaState({ ...fresh, baseTablesPresent: false })).toBe("invalid_base");
  });

  it("keeps the guarded artifact lists aligned with migrations 0007 through 0009", () => {
    const migrationSql = [
      readFileSync(resolve(process.cwd(), "drizzle/0007_adorable_brood.sql"), "utf8"),
      readFileSync(resolve(process.cwd(), "drizzle/0008_big_tigra.sql"), "utf8"),
      readFileSync(resolve(process.cwd(), "drizzle/0009_lowly_fabian_cortez.sql"), "utf8")
    ].join("\n");
    const createdTables = [...migrationSql.matchAll(/CREATE TABLE "([^"]+)"/g)].map(
      (match) => match[1]
    );
    const createdIndexes = [
      ...migrationSql.matchAll(/CREATE (?:UNIQUE )?INDEX "([^"]+)"/g)
    ].map((match) => match[1]);
    const explicitConstraints = [
      ...migrationSql.matchAll(/ADD CONSTRAINT "([^"]+)"/g)
    ].map((match) => match[1]);

    expect(new Set(createdTables)).toEqual(new Set(targetTables));
    expect(new Set(createdIndexes)).toEqual(new Set(targetIndexes));
    expect(new Set([...createdTables.map((table) => `${table}_pkey`), ...explicitConstraints])).toEqual(
      new Set(targetConstraints)
    );

    for (const tableName of targetTables) {
      const tableBlock = migrationSql.match(
        new RegExp(`CREATE TABLE "${tableName}" \\(([\\s\\S]*?)\\n\\);`)
      );
      expect(tableBlock, `missing CREATE TABLE block for ${tableName}`).not.toBeNull();
      const columnNames = [...(tableBlock?.[1] ?? "").matchAll(/^\s*"([^"]+)"/gm)].map(
        (match) => match[1]
      );
      expect(columnNames).toEqual([...targetColumns[tableName]]);
    }

    expect(migrationSql).toContain('ALTER TABLE "events" ADD COLUMN "origin"');
  });
});

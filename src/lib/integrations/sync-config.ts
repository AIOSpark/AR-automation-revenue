import { validateIntegrationEndpoint } from "@/lib/adapters/url-safety";

const TALLY_URL_KEYS = ["tallyCloudUrl", "tallyWritebackUrl", "tallyBridgeHealthUrl"] as const;
const FORBIDDEN_CONFIG_KEYS = new Set([
  "organizationId",
  "adapterType",
  "credentials",
  "credentialsEncrypted",
  "testModeUseFixtures",
  "rawFileBuffer",
]);

const MAX_CSV_ROWS = 5000;
const MAX_CSV_COLUMNS = 100;

export type SanitizedSyncConfig =
  | { ok: true; config: Record<string, unknown> }
  | { ok: false; error: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function sanitizeSyncCustomConfig(
  adapterType: string,
  input: unknown
): Promise<SanitizedSyncConfig> {
  if (input === undefined) return { ok: true, config: {} };
  if (!isPlainObject(input)) return { ok: false, error: "customConfig must be an object" };

  for (const key of FORBIDDEN_CONFIG_KEYS) {
    if (input[key] !== undefined) {
      return { ok: false, error: `customConfig.${key} is not accepted from clients` };
    }
  }

  if (adapterType === "tally") {
    const config: Record<string, unknown> = {};
    for (const key of TALLY_URL_KEYS) {
      if (input[key] === undefined) continue;
      if (typeof input[key] !== "string" || !(input[key] as string).trim()) {
        return { ok: false, error: `customConfig.${key} must be a non-empty URL string` };
      }
      const validated = await validateIntegrationEndpoint(input[key] as string);
      if (!validated.ok) return { ok: false, error: `customConfig.${key}: ${validated.error}` };
      config[key] = validated.url;
    }
    return { ok: true, config };
  }

  if (adapterType === "csv") {
    const config: Record<string, unknown> = {};

    if (input.rowsData !== undefined) {
      if (!Array.isArray(input.rowsData) || input.rowsData.length > MAX_CSV_ROWS) {
        return { ok: false, error: `customConfig.rowsData must be an array of at most ${MAX_CSV_ROWS} rows` };
      }
      if (!input.rowsData.every(isPlainObject)) {
        return { ok: false, error: "customConfig.rowsData entries must be objects" };
      }
      config.rowsData = input.rowsData;
    }

    if (input.columnMapping !== undefined) {
      if (!isPlainObject(input.columnMapping)) {
        return { ok: false, error: "customConfig.columnMapping must be an object" };
      }
      const entries = Object.entries(input.columnMapping);
      if (entries.length > MAX_CSV_COLUMNS) {
        return { ok: false, error: `customConfig.columnMapping must have at most ${MAX_CSV_COLUMNS} entries` };
      }
      if (entries.some(([, value]) => typeof value !== "string")) {
        return { ok: false, error: "customConfig.columnMapping values must be strings" };
      }
      config.columnMapping = input.columnMapping;
    }

    return { ok: true, config };
  }

  return { ok: true, config: {} };
}

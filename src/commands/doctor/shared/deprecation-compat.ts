// Inventory of doctor compatibility migrations that outlive deprecated runtime/config paths.
export type DoctorDeprecationCompatStatus = "active" | "deprecated" | "removal-pending" | "removed";

export type DoctorDeprecationCompatOwner =
  | "agent-runtime"
  | "audio"
  | "browser"
  | "channel"
  | "config"
  | "gateway"
  | "plugin"
  | "provider"
  | "tools"
  | "tts";

export type DoctorDeprecationCompatRecord<Code extends string = string> = {
  /** Stable inventory code for a doctor compatibility surface. */
  code: Code;
  /** Current lifecycle state for the compatibility surface. */
  status: DoctorDeprecationCompatStatus;
  /** Area that owns the deprecated input or migration. */
  owner: DoctorDeprecationCompatOwner;
  /** Date or release window when the compatibility surface first shipped. */
  introduced: string;
  deprecated?: string;
  warningStarts?: string;
  removeAfter?: string;
  source: string;
  migration: string;
  replacement: string;
  docsPath: string;
  tests: readonly string[];
  notes?: string;
};

const TODAY = "2026-04-26";
const MAX_REMOVE_AFTER = "2026-07-26";

function deprecatedCompatRecord<Code extends string>(
  record: Omit<
    DoctorDeprecationCompatRecord<Code>,
    "deprecated" | "warningStarts" | "removeAfter" | "status"
  > &
    Partial<
      Pick<
        DoctorDeprecationCompatRecord<Code>,
        "deprecated" | "removeAfter" | "status" | "warningStarts"
      >
    >,
): DoctorDeprecationCompatRecord<Code> {
  return {
    status: "deprecated",
    deprecated: TODAY,
    warningStarts: TODAY,
    removeAfter: MAX_REMOVE_AFTER,
    ...record,
  };
}

// Doctor migrations and repair shims can outlive the runtime/config compatibility
// path they repair. Release removals must check this inventory before deleting
// doctor fixes, and replacement notes should be revalidated against the current
// architecture because ownership and config footprint can shift during rollout.
const DOCTOR_DEPRECATION_COMPAT_RECORDS = [
  deprecatedCompatRecord({
    code: "doctor-plugin-install-config-ledger",
    owner: "plugin",
    introduced: "2026-04-25",
    source: "plugins.installs in authored config",
    migration: "src/config/plugin-install-config-migration.ts",
    replacement: "shared SQLite installed_plugin_index install ledger",
    docsPath: "/cli/plugins#registry",
    tests: [
      "src/config/io.write-config.test.ts",
      "src/commands/doctor/shared/plugin-registry-migration.test.ts",
    ],
  }),
  deprecatedCompatRecord({
    code: "doctor-bundled-plugin-load-paths",
    owner: "plugin",
    introduced: "2026-04-25",
    source: "plugins.load.paths entries that point at bundled plugin source/dist locations",
    migration: "src/commands/doctor/shared/bundled-plugin-load-paths.ts",
    replacement: "packaged bundled plugins and the persisted plugin registry",
    docsPath: "/cli/plugins#registry",
    tests: ["src/commands/doctor/shared/bundled-plugin-load-paths.test.ts"],
  }),
] as const satisfies readonly DoctorDeprecationCompatRecord[];

export type DoctorDeprecationCompatCode =
  (typeof DOCTOR_DEPRECATION_COMPAT_RECORDS)[number]["code"];
export type KnownDoctorDeprecationCompatRecord = DoctorDeprecationCompatRecord;

const doctorDeprecationCompatRecordByCode = new Map<
  DoctorDeprecationCompatCode,
  KnownDoctorDeprecationCompatRecord
>(DOCTOR_DEPRECATION_COMPAT_RECORDS.map((record) => [record.code, record]));

/** List every doctor compatibility record, including removed or still-active entries. */
export function listDoctorDeprecationCompatRecords(): readonly KnownDoctorDeprecationCompatRecord[] {
  return DOCTOR_DEPRECATION_COMPAT_RECORDS;
}

/** List compatibility records currently in a deprecated/removal-pending lifecycle. */
export function listDeprecatedDoctorDeprecationCompatRecords(): readonly KnownDoctorDeprecationCompatRecord[] {
  return DOCTOR_DEPRECATION_COMPAT_RECORDS.filter((record) =>
    (["deprecated", "removal-pending"] as readonly string[]).includes(record.status),
  );
}

/** Return true when a string is a known doctor compatibility inventory code. */
export function isDoctorDeprecationCompatCode(code: string): code is DoctorDeprecationCompatCode {
  return doctorDeprecationCompatRecordByCode.has(code);
}

/** Return a doctor compatibility record by code, throwing for impossible stale callers. */
export function getDoctorDeprecationCompatRecord(
  code: DoctorDeprecationCompatCode,
): KnownDoctorDeprecationCompatRecord {
  const record = doctorDeprecationCompatRecordByCode.get(code);
  if (!record) {
    throw new Error(`Unknown doctor deprecation compatibility code: ${code}`);
  }
  return record;
}

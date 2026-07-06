// Matrix plugin module implements migration snapshot behavior.
export type MatrixMigrationStatus = {
  pending: boolean;
  actionable: boolean;
};
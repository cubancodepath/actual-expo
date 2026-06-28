export class SyncError extends Error {
  type: string;
  meta: unknown;

  constructor(type: string, meta?: unknown) {
    super(type);
    this.name = "SyncError";
    this.type = type;
    this.meta = meta;
  }
}

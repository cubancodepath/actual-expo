export class PostError extends Error {
  type: string;
  meta: unknown;

  constructor(type: string, meta?: unknown) {
    super(type);
    this.name = 'PostError';
    this.type = type;
    this.meta = meta;
  }
}

export class SyncError extends Error {
  type: string;
  meta: unknown;

  constructor(type: string, meta?: unknown) {
    super(type);
    this.name = 'SyncError';
    this.type = type;
    this.meta = meta;
  }
}

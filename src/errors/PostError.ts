export class PostError extends Error {
  type: string;
  meta: unknown;

  constructor(type: string, meta?: unknown) {
    super(type);
    this.name = "PostError";
    this.type = type;
    this.meta = meta;
  }
}

// The HTTP client moved to the core platform seam (`@/core/platform/fetch`) so
// core can reach the network without importing `@/services`. This re-export
// keeps the existing `services/api/*` import sites working; prefer importing
// from `@/core/platform/fetch` directly in new code.
export { http, toTransportError, parseResponse } from "@/core/platform/fetch";

import { isHTTPError } from "ky";
import { z } from "zod";
import { http, parseResponse, toTransportError } from "@/lib/http";
import { ActualError } from "@/core/errors";

export type BudgetFile = {
  fileId: string;
  groupId: string;
  name: string;
  encryptKeyId?: string;
  deleted?: boolean;
  ownerName?: string;
};

export type LoginMethod = "password" | "openid" | "header";

export type BootstrapInfo = {
  bootstrapped: boolean;
  loginMethod: LoginMethod;
};

/** Actual server responses come either enveloped (`{status, data}`) or flat. */
const envelope = <S extends z.ZodType>(schema: S) =>
  z.preprocess((json) => {
    if (json && typeof json === "object" && "data" in json) {
      return (json as { data: unknown }).data ?? json;
    }
    return json;
  }, schema);

// ---------------------------------------------------------------------------
// Bootstrap probe
// ---------------------------------------------------------------------------

const PROBE_RETRY_DELAYS = [1500, 2500, 3000];

const BootstrapResponse = envelope(
  z.object({
    bootstrapped: z.boolean().default(true),
    // availableLoginMethods is the modern shape; loginMethod is the legacy scalar
    availableLoginMethods: z
      .array(z.object({ method: z.string(), active: z.boolean() }))
      .default([]),
    loginMethod: z.string().optional(),
  }),
);

/** Probe a server to find out if it's bootstrapped and which login method is active. */
export async function getBootstrapInfo(serverUrl: string): Promise<BootstrapInfo> {
  let json: unknown;
  try {
    json = await http
      .get(`${serverUrl}/account/needs-bootstrap`, {
        retry: {
          limit: PROBE_RETRY_DELAYS.length,
          delay: (attempt) => PROBE_RETRY_DELAYS[attempt - 1] ?? 3000,
          // The probe is the user's first contact with an unknown server —
          // retry on any failure (network, timeout, or bad status), like the
          // original manual backoff loop did.
          shouldRetry: () => true,
        },
      })
      .json();
  } catch (e) {
    const mapped = toTransportError(e);
    // Parity with the original fetch flow: any unusable probe response reads
    // as "can't reach a working server" except a malformed JSON body.
    throw mapped.code === "http/parse-error" ? mapped : new ActualError("network/offline");
  }

  const data = parseResponse(BootstrapResponse, json);
  const activeMethod =
    data.availableLoginMethods.find((m) => m.active)?.method ?? data.loginMethod ?? "password";

  return {
    bootstrapped: data.bootstrapped,
    loginMethod: activeMethod as LoginMethod,
  };
}

// ---------------------------------------------------------------------------
// Password login
// ---------------------------------------------------------------------------

const LoginResponse = envelope(z.object({ token: z.string().min(1) }));

export async function login(serverUrl: string, password: string): Promise<string> {
  let json: unknown;
  try {
    json = await http.post(`${serverUrl}/account/login`, { json: { password } }).json();
  } catch (e) {
    if (isHTTPError(e)) {
      // The server reports a wrong password in the error body's `reason`
      const reason = (e.data as { reason?: string } | undefined)?.reason;
      if (reason === "invalid-password") throw new ActualError("auth/invalid-password");
    }
    throw toTransportError(e);
  }

  try {
    return parseResponse(LoginResponse, json).token;
  } catch {
    // Parity with the original flow: a 2xx response without a token is a
    // server-side problem, not a parse error
    throw new ActualError("http/server-error");
  }
}

// ---------------------------------------------------------------------------
// OpenID login
// ---------------------------------------------------------------------------

const OpenIdResponse = envelope(
  z.object({ redirectUrl: z.string().optional(), returnUrl: z.string().optional() }),
);

/**
 * Initiate an OpenID login. The server performs the PKCE OIDC dance and
 * redirects back to `{returnUrl}/openid-cb?token=xxx` when done.
 *
 * Returns the provider authorization URL to open in the system browser.
 */
export async function initiateOpenIdLogin(serverUrl: string, returnUrl: string): Promise<string> {
  let json: unknown;
  try {
    json = await http
      .post(`${serverUrl}/account/login`, { json: { loginMethod: "openid", returnUrl } })
      .json();
  } catch (e) {
    throw toTransportError(e);
  }

  const data = parseResponse(OpenIdResponse, json);
  const authUrl = data.redirectUrl ?? data.returnUrl;
  if (!authUrl) throw new ActualError("http/server-error");
  return authUrl;
}

// ---------------------------------------------------------------------------
// File listing
// ---------------------------------------------------------------------------

const FileEntry = z.looseObject({
  fileId: z.string().optional(),
  id: z.string().optional(),
  groupId: z.string().optional(),
  name: z.string().optional(),
  encryptKeyId: z.string().nullish(),
  deleted: z.union([z.boolean(), z.number()]).optional(),
  usersWithAccess: z
    .array(z.looseObject({ owner: z.boolean().optional(), displayName: z.string().optional() }))
    .optional(),
});

const ListFilesResponse = z.preprocess((json) => {
  const j = json as { data?: unknown; files?: unknown } | null;
  if (Array.isArray(j?.data)) return j.data;
  return (j?.data as { files?: unknown } | undefined)?.files ?? j?.files ?? [];
}, z.array(FileEntry));

/**
 * List budget files available on the server.
 *
 * Throws ActualError("auth/token-expired") on 401/403 — handling the expired
 * session (clearing prefs, redirecting) is the caller's responsibility.
 */
export async function listFiles(serverUrl: string, token: string): Promise<BudgetFile[]> {
  let json: unknown;
  try {
    json = await http
      .get(`${serverUrl}/sync/list-user-files`, { headers: { "x-actual-token": token } })
      .json();
  } catch (e) {
    const mapped = toTransportError(e);
    throw mapped.code === "auth/unauthorized" ? new ActualError("auth/token-expired") : mapped;
  }

  return parseResponse(ListFilesResponse, json).map((f) => ({
    fileId: (f.fileId ?? f.id)!,
    groupId: f.groupId!,
    name: f.name!,
    encryptKeyId: f.encryptKeyId ?? undefined,
    deleted: f.deleted === 1 || f.deleted === true,
    ownerName: f.usersWithAccess?.find((u) => u.owner)?.displayName,
  }));
}

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

/** Probe a server to find out if it's bootstrapped and which login method is active. */
export async function getBootstrapInfo(serverUrl: string): Promise<BootstrapInfo> {
  const res = await fetch(`${serverUrl}/account/needs-bootstrap`);
  if (!res.ok) {
    throw new Error(`Server unreachable (${res.status})`);
  }
  const json = await res.json();
  const data = json?.data ?? json;
  const bootstrapped: boolean = data?.bootstrapped ?? true;

  // availableLoginMethods is the modern shape; loginMethod is the legacy scalar
  const methods: { method: string; active: boolean }[] = data?.availableLoginMethods ?? [];
  const activeMethod = methods.find((m) => m.active)?.method ?? data?.loginMethod ?? "password";

  return {
    bootstrapped,
    loginMethod: activeMethod as LoginMethod,
  };
}

export async function login(serverUrl: string, password: string): Promise<string> {
  const res = await fetch(`${serverUrl}/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Login failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const token: string = json?.data?.token ?? json?.token;
  if (!token) throw new Error("No token in response");
  return token;
}

/**
 * Initiate an OpenID login. The server performs the PKCE OIDC dance and
 * redirects back to `{returnUrl}/openid-cb?token=xxx` when done.
 *
 * Returns the provider authorization URL to open in the system browser.
 */
export async function initiateOpenIdLogin(serverUrl: string, returnUrl: string): Promise<string> {
  const res = await fetch(`${serverUrl}/account/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ loginMethod: "openid", returnUrl }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`OpenID login failed (${res.status}): ${text}`);
  }

  const json = await res.json();
  const authUrl: string = json?.data?.redirectUrl ?? json?.data?.returnUrl ?? json?.redirectUrl;
  if (!authUrl) throw new Error("No redirect URL returned from server");
  return authUrl;
}

export async function listFiles(serverUrl: string, token: string): Promise<BudgetFile[]> {
  const res = await fetch(`${serverUrl}/sync/list-user-files`, {
    headers: {
      "x-actual-token": token,
    },
  });

  if (res.status === 401 || res.status === 403) {
    const { usePrefsStore } = await import("../stores/prefsStore");
    usePrefsStore.getState().clearAll();
    throw new Error("Session expired. Please log in again.");
  }

  if (!res.ok) {
    throw new Error(`Failed to list files (${res.status})`);
  }

  const json = await res.json();
  const files: BudgetFile[] = (
    Array.isArray(json?.data) ? json.data : (json?.data?.files ?? json?.files ?? [])
  ).map((f: Record<string, unknown>) => ({
    fileId: f.fileId ?? f.id,
    groupId: f.groupId,
    name: f.name,
    encryptKeyId: f.encryptKeyId ?? undefined,
    deleted: f.deleted === 1 || f.deleted === true,
    ownerName: Array.isArray(f.usersWithAccess)
      ? (f.usersWithAccess as any[]).find((u) => u.owner)?.displayName
      : undefined,
  }));
  return files;
}

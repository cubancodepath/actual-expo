// Faithful port of loot-core/src/server/server-config.ts (trimmed to the
// endpoints this app talks to). The app layer (sessionStore) calls setServer /
// setUserToken when the session changes; core reads getServer / getUserToken —
// so core/sync never imports app stores (upstream parity).

type ServerConfig = {
  BASE_SERVER: string;
  SYNC_SERVER: string;
  SIGNUP_SERVER: string;
};

let config: ServerConfig | null = null;

// Mobile adaptation: upstream persists the token in platform asyncStorage
// ('user-token') and core reads it there. On mobile the token's durable home
// is the app layer's SecureStore (hardware-backed) — core keeps only this
// in-memory mirror, set alongside setServer, so the token never touches
// unencrypted storage.
let userToken: string | null = null;

function joinURL(base: string, ...paths: string[]): string {
  const url = new URL(base);
  url.pathname = [url.pathname.replace(/\/$/, ""), ...paths].join("/").replace(/\/{2,}/g, "/");
  return url.toString().replace(/\/$/, "");
}

export function isValidBaseURL(base: string): boolean {
  try {
    return Boolean(new URL(base));
  } catch {
    return false;
  }
}

export function setServer(url: string | null): void {
  if (url == null || url === "") {
    config = null;
  } else {
    config = getServer(url);
  }
}

// `url` is optional; if not given it will provide the global config (upstream).
export function getServer(url?: string): ServerConfig | null {
  if (url) {
    try {
      return {
        BASE_SERVER: url,
        SYNC_SERVER: joinURL(url, "sync"),
        SIGNUP_SERVER: joinURL(url, "account"),
      };
    } catch {
      return config;
    }
  }
  return config;
}

export function setUserToken(token: string | null): void {
  userToken = token || null;
}

export function getUserToken(): string | null {
  return userToken;
}

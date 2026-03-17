export type ServerInfo = {
  version: string; // e.g. "26.2.1"
};

/** Fetch the server version from the `/info` endpoint. Returns "0.0.0" on failure. */
export async function getServerInfo(serverUrl: string): Promise<ServerInfo> {
  try {
    const res = await fetch(`${serverUrl}/info`);
    if (!res.ok) return { version: "0.0.0" };
    const json = await res.json();
    const version = json?.build?.version ?? json?.version;
    if (typeof version === "string" && version) return { version };
    return { version: "0.0.0" };
  } catch {
    return { version: "0.0.0" };
  }
}

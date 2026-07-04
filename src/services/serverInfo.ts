import { z } from "zod";
import { http } from "@/lib/http";

export type ServerInfo = {
  version: string; // e.g. "26.2.1"
};

const InfoResponse = z.object({
  build: z.object({ version: z.string() }).optional(),
  version: z.string().optional(),
});

/** Fetch the server version from the `/info` endpoint. Returns "0.0.0" on failure. */
export async function getServerInfo(serverUrl: string): Promise<ServerInfo> {
  try {
    const json = await http.get(`${serverUrl}/info`).json();
    const parsed = InfoResponse.safeParse(json);
    const version = parsed.success
      ? (parsed.data.build?.version ?? parsed.data.version)
      : undefined;
    return { version: version || "0.0.0" };
  } catch {
    return { version: "0.0.0" };
  }
}

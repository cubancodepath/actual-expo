import { http } from "@/core/platform/fetch";
import { ServerInfoResponseDtoSchema } from "./serverInfo.dto";
import { toServerInfo } from "./serverInfo.mappers";
import type { ServerInfo } from "./serverInfo.types";

export type { ServerInfo } from "./serverInfo.types";

export async function getServerInfo(serverUrl: string): Promise<ServerInfo> {
  try {
    const json = await http.get(`${serverUrl}/info`).json();
    const parsed = ServerInfoResponseDtoSchema.safeParse(json);
    return parsed.success ? toServerInfo(parsed.data) : { version: "0.0.0" };
  } catch {
    return { version: "0.0.0" };
  }
}

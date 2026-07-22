import type { ServerInfoResponseDto } from "./serverInfo.dto";
import type { ServerInfo } from "./serverInfo.types";

export function toServerInfo(dto: ServerInfoResponseDto): ServerInfo {
  return { version: dto.build?.version ?? dto.version ?? "0.0.0" };
}

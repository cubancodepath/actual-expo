import { ActualError } from "@/core/errors";
import { http, parseResponse, toTransportError } from "@/core/platform/fetch";
import { dataOrSelf } from "../response";
import { BootstrapResponseDtoSchema } from "./bootstrap.dto";
import { toBootstrapInfo } from "./bootstrap.mappers";
import type { BootstrapInfo } from "./bootstrap.types";

export type { BootstrapInfo, LoginMethod } from "./bootstrap.types";

const PROBE_RETRY_DELAYS = [1500, 2500, 3000];

// Core transport: only THROWS — the app layer surfaces to the error bus.
export async function getBootstrapInfo(serverUrl: string): Promise<BootstrapInfo> {
  let json: unknown;
  try {
    json = await http
      .get(`${serverUrl}/account/needs-bootstrap`, {
        retry: {
          limit: PROBE_RETRY_DELAYS.length,
          delay: (attempt) => PROBE_RETRY_DELAYS[attempt - 1] ?? 3000,
          shouldRetry: () => true,
        },
      })
      .json();
  } catch (e) {
    const mapped = toTransportError(e);
    throw mapped.code === "http/parse-error" ? mapped : new ActualError("network/offline");
  }

  const dto = parseResponse(BootstrapResponseDtoSchema, dataOrSelf(json));
  return toBootstrapInfo(dto);
}

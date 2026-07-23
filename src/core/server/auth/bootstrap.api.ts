import { ActualError } from "@/core/errors";
import { http, parseResponse } from "@/core/platform/fetch";
import { dataOrSelf } from "../util/response";
import { BootstrapResponseDtoSchema } from "./bootstrap.dto";
import { toBootstrapInfo } from "./bootstrap.mappers";
import type { BootstrapInfo } from "./bootstrap.types";

export type { BootstrapInfo, LoginMethod } from "./bootstrap.types";

const PROBE_RETRY_DELAYS = [1500, 2500, 3000];

// Core transport: only THROWS — the app layer surfaces to the error bus.
export async function getBootstrapInfo(serverUrl: string): Promise<BootstrapInfo> {
  let json: unknown;
  try {
    json = await (
      await http.get(`${serverUrl}/account/needs-bootstrap`, {
        retry: {
          limit: PROBE_RETRY_DELAYS.length,
          delayMs: (attempt) => PROBE_RETRY_DELAYS[attempt - 1] ?? 3000,
        },
      })
    ).json();
  } catch (e) {
    if (e instanceof ActualError && e.code === "http/parse-error") throw e;
    throw new ActualError("network/offline");
  }

  const dto = parseResponse(BootstrapResponseDtoSchema, dataOrSelf(json));
  return toBootstrapInfo(dto);
}

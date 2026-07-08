import { z } from "zod";
import { ActualError } from "@/core/errors";
import { emitErrorEvent } from "@/core/errors/ErrorChannel";
import { http, parseResponse, toTransportError } from "./httpClient";

export type RemoteBudgetFile = {
  fileId: string;
  groupId: string;
  name: string;
  encryptKeyId?: string;
  deleted?: boolean;
  ownerName?: string;
};

const RemoteBudgetFileSchema = z.looseObject({
  fileId: z.string().optional(),
  id: z.string().optional(),
  groupId: z.string().optional(),
  name: z.string().optional(),
  encryptKeyId: z.string().nullish(),
  deleted: z.union([z.boolean(), z.number()]).optional(),
  usersWithAccess: z
    .array(
      z.looseObject({
        // SQLite-backed servers may serialize this boolean as 0/1 (older
        // sync-server versions), so accept both forms like `deleted` above.
        owner: z.union([z.boolean(), z.number()]).optional(),
        displayName: z.string().optional(),
      }),
    )
    .optional(),
});

const RemoteBudgetFilesResponseSchema = z.array(RemoteBudgetFileSchema);

function emitBudgetFilesApiError(error: unknown, operation: string): void {
  emitErrorEvent(error, { source: "FILES", context: { operation } });
}

function filesPayload(json: unknown): unknown {
  const body = json as { data?: unknown; files?: unknown } | null;
  if (Array.isArray(body?.data)) return body.data;
  return (body?.data as { files?: unknown } | undefined)?.files ?? body?.files ?? [];
}

export async function listRemoteBudgetFiles(
  serverUrl: string,
  token: string,
): Promise<RemoteBudgetFile[]> {
  let json: unknown;
  try {
    json = await http
      .get(`${serverUrl}/sync/list-user-files`, { headers: { "x-actual-token": token } })
      .json();
  } catch (e) {
    const mapped = toTransportError(e);
    const error =
      mapped.code === "auth/unauthorized" ? new ActualError("auth/token-expired") : mapped;
    emitBudgetFilesApiError(error, "listRemoteBudgetFiles");
    throw error;
  }

  try {
    return parseResponse(RemoteBudgetFilesResponseSchema, filesPayload(json)).map((file) => ({
      fileId: (file.fileId ?? file.id)!,
      groupId: file.groupId!,
      name: file.name!,
      encryptKeyId: file.encryptKeyId ?? undefined,
      deleted: file.deleted === 1 || file.deleted === true,
      ownerName: file.usersWithAccess?.find((user) => user.owner === 1 || user.owner === true)
        ?.displayName,
    }));
  } catch (e) {
    emitBudgetFilesApiError(e, "listRemoteBudgetFiles.parseResponse");
    throw e;
  }
}

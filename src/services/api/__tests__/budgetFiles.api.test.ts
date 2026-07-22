import { describe, expect, it } from "vitest";
import { getRemoteFiles } from "../budgetFiles.api";
import {
  expectActualError,
  fetchMock,
  jsonResponse,
  SERVER,
} from "@/core/server/util/__tests__/testUtils";

describe("getRemoteFiles", () => {
  const rawFile = {
    fileId: "f1",
    groupId: "g1",
    name: "My Budget",
    encryptKeyId: null,
    deleted: 0,
    usersWithAccess: [{ owner: true, displayName: "Ana" }],
  };

  it("parses files and sends the token header", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: [rawFile] }));

    const files = await getRemoteFiles(SERVER, "tok");

    expect(files).toEqual([
      {
        fileId: "f1",
        groupId: "g1",
        name: "My Budget",
        encryptKeyId: undefined,
        deleted: false,
        ownerName: "Ana",
      },
    ]);
    const request = fetchMock.mock.calls[0][0] as Request;
    expect(request.headers.get("x-actual-token")).toBe("tok");
  });

  it("throws auth/token-expired on 401 without touching any store", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: "error" }, 401));

    await expectActualError(getRemoteFiles(SERVER, "stale"), "auth/token-expired");
  });
});

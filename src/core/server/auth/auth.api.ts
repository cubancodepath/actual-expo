import { ActualError } from "@/core/errors";
import { http, parseResponse } from "@/core/platform/fetch";
import { dataOrSelf } from "../util/response";
import { LoginResponseDtoSchema, OpenIdResponseDtoSchema } from "./auth.dto";

// Core transport: only THROWS typed ActualErrors — the app layer (sign-in hooks
// / react-query onError) surfaces them to the error bus.

export async function loginWithPassword(serverUrl: string, password: string): Promise<string> {
  let json: unknown;
  try {
    json = await (await http.post(`${serverUrl}/account/login`, { json: { password } })).json();
  } catch (e) {
    // The seam rejects only with ActualError; the server signals a wrong
    // password via its JSON reason, surfaced in the error context.
    if (e instanceof ActualError && e.context?.serverReason === "invalid-password") {
      throw new ActualError("auth/invalid-password");
    }
    throw e;
  }

  try {
    return parseResponse(LoginResponseDtoSchema, dataOrSelf(json)).token;
  } catch {
    throw new ActualError("http/server-error");
  }
}

export async function createOpenIdLoginUrl(serverUrl: string, returnUrl: string): Promise<string> {
  const json = await (
    await http.post(`${serverUrl}/account/login`, { json: { loginMethod: "openid", returnUrl } })
  ).json();

  const dto = parseResponse(OpenIdResponseDtoSchema, dataOrSelf(json));
  const authUrl = dto.redirectUrl ?? dto.returnUrl;
  if (authUrl) return authUrl;

  throw new ActualError("http/server-error");
}

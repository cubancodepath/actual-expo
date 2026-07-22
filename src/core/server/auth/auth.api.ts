import { isHTTPError } from "ky";
import { ActualError } from "@/core/errors";
import { http, parseResponse, toTransportError } from "@/core/platform/fetch";
import { dataOrSelf } from "../util/response";
import { LoginResponseDtoSchema, OpenIdResponseDtoSchema } from "./auth.dto";

// Core transport: only THROWS typed ActualErrors — the app layer (sign-in hooks
// / react-query onError) surfaces them to the error bus.

export async function loginWithPassword(serverUrl: string, password: string): Promise<string> {
  let json: unknown;
  try {
    json = await http.post(`${serverUrl}/account/login`, { json: { password } }).json();
  } catch (e) {
    if (isHTTPError(e)) {
      const reason = (e.data as { reason?: string } | undefined)?.reason;
      if (reason === "invalid-password") {
        throw new ActualError("auth/invalid-password");
      }
    }
    throw toTransportError(e);
  }

  try {
    return parseResponse(LoginResponseDtoSchema, dataOrSelf(json)).token;
  } catch {
    throw new ActualError("http/server-error");
  }
}

export async function createOpenIdLoginUrl(serverUrl: string, returnUrl: string): Promise<string> {
  let json: unknown;
  try {
    json = await http
      .post(`${serverUrl}/account/login`, { json: { loginMethod: "openid", returnUrl } })
      .json();
  } catch (e) {
    throw toTransportError(e);
  }

  const dto = parseResponse(OpenIdResponseDtoSchema, dataOrSelf(json));
  const authUrl = dto.redirectUrl ?? dto.returnUrl;
  if (authUrl) return authUrl;

  throw new ActualError("http/server-error");
}

import { isHTTPError } from "ky";
import { ActualError } from "@/core/errors";
import { emitErrorEvent } from "@/core/errors/ErrorChannel";
import { dataOrSelf } from "../response";
import { http, parseResponse, toTransportError } from "../httpClient";
import { LoginResponseDtoSchema, OpenIdResponseDtoSchema } from "./auth.dto";

function emitAuthApiError(error: unknown, operation: string): void {
  emitErrorEvent(error, { source: "AUTH", context: { operation } });
}

export async function loginWithPassword(serverUrl: string, password: string): Promise<string> {
  let json: unknown;
  try {
    json = await http.post(`${serverUrl}/account/login`, { json: { password } }).json();
  } catch (e) {
    if (isHTTPError(e)) {
      const reason = (e.data as { reason?: string } | undefined)?.reason;
      if (reason === "invalid-password") {
        const error = new ActualError("auth/invalid-password");
        emitAuthApiError(error, "loginWithPassword");
        throw error;
      }
    }

    const error = toTransportError(e);
    emitAuthApiError(error, "loginWithPassword");
    throw error;
  }

  try {
    return parseResponse(LoginResponseDtoSchema, dataOrSelf(json)).token;
  } catch {
    const error = new ActualError("http/server-error");
    emitAuthApiError(error, "loginWithPassword.parseResponse");
    throw error;
  }
}

export async function createOpenIdLoginUrl(serverUrl: string, returnUrl: string): Promise<string> {
  let json: unknown;
  try {
    json = await http
      .post(`${serverUrl}/account/login`, { json: { loginMethod: "openid", returnUrl } })
      .json();
  } catch (e) {
    const error = toTransportError(e);
    emitAuthApiError(error, "createOpenIdLoginUrl");
    throw error;
  }

  try {
    const dto = parseResponse(OpenIdResponseDtoSchema, dataOrSelf(json));
    const authUrl = dto.redirectUrl ?? dto.returnUrl;
    if (authUrl) return authUrl;
  } catch (e) {
    emitAuthApiError(e, "createOpenIdLoginUrl.parseResponse");
    throw e;
  }

  const error = new ActualError("http/server-error");
  emitAuthApiError(error, "createOpenIdLoginUrl.missingUrl");
  throw error;
}

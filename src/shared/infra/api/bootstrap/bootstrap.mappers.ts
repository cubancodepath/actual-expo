import type { BootstrapResponseDto } from "./bootstrap.dto";
import type { BootstrapInfo, LoginMethod } from "./bootstrap.types";

export function toBootstrapInfo(dto: BootstrapResponseDto): BootstrapInfo {
  const activeMethod =
    dto.availableLoginMethods.find((method) => method.active)?.method ?? dto.loginMethod;

  return {
    bootstrapped: dto.bootstrapped,
    loginMethod: toLoginMethod(activeMethod),
  };
}

function toLoginMethod(value: string | undefined): LoginMethod {
  if (value === "openid" || value === "header" || value === "password") return value;
  return "password";
}

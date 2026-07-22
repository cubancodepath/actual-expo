export type LoginMethod = "password" | "openid" | "header";

export type BootstrapInfo = {
  bootstrapped: boolean;
  loginMethod: LoginMethod;
};

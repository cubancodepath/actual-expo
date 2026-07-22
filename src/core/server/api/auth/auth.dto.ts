import { z } from "zod";

export const LoginResponseDtoSchema = z.object({ token: z.string().min(1) });

export const OpenIdResponseDtoSchema = z.object({
  redirectUrl: z.string().optional(),
  returnUrl: z.string().optional(),
});

export type LoginResponseDto = z.output<typeof LoginResponseDtoSchema>;
export type OpenIdResponseDto = z.output<typeof OpenIdResponseDtoSchema>;

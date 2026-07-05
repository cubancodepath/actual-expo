import { z } from "zod";

export const BootstrapResponseDtoSchema = z.object({
  bootstrapped: z.boolean().default(true),
  availableLoginMethods: z.array(z.object({ method: z.string(), active: z.boolean() })).default([]),
  loginMethod: z.string().optional(),
});

export type BootstrapResponseDto = z.output<typeof BootstrapResponseDtoSchema>;

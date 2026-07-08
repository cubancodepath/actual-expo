import { z } from "zod";

export const BootstrapResponseDtoSchema = z.object({
  bootstrapped: z.boolean().default(true),
  availableLoginMethods: z
    .array(
      z.object({
        method: z.string(),
        active: z.union([z.boolean(), z.number()]).transform(Boolean),
      }),
    )
    .default([]),
  loginMethod: z.string().optional(),
});

export type BootstrapResponseDto = z.output<typeof BootstrapResponseDtoSchema>;

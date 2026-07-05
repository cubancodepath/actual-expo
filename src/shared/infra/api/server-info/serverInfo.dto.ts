import { z } from "zod";

export const ServerInfoResponseDtoSchema = z.object({
  build: z.object({ version: z.string() }).optional(),
  version: z.string().optional(),
});

export type ServerInfoResponseDto = z.output<typeof ServerInfoResponseDtoSchema>;

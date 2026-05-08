import { z } from 'zod';

export const paginationSchema = z.object({
  index: z.coerce.number().int().min(1).optional().default(1),
  size: z.coerce.number().int().min(1).max(100).optional().default(20),
});

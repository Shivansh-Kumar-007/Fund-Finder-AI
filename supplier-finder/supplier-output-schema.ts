import { z } from "zod";

export const supplierSchema = z.object({
  name: z.string(),
  website: z.string(),
  country: z.string().optional(),
  city: z.string().optional(),
  summary: z.string(),
  products: z.array(z.string()).optional(),
});

export const supplierListSchema = z.object({
  suppliers: z.array(supplierSchema),
});

export type Supplier = z.infer<typeof supplierSchema>;

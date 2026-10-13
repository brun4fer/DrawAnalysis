import "server-only";
import { normalizeProductVariant } from "@/lib/product";

export const SERVER_APP_VARIANT = normalizeProductVariant(
  process.env.APP_VARIANT || process.env.NEXT_PUBLIC_APP_VARIANT,
);

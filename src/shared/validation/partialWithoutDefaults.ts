import { z } from "zod";

/**
 * `.partial()` for update schemas without re-applying creation defaults.
 * Zod applies `.default()` values under `.partial()`, so an omitted PATCH field
 * can otherwise overwrite the stored value during the merge that follows.
 */
export function partialWithoutDefaults<Shape extends z.ZodRawShape>(
  schema: z.ZodObject<Shape>
): ReturnType<z.ZodObject<Shape>["partial"]> {
  const unwrapped: Record<string, z.core.$ZodType> = {};
  for (const [key, field] of Object.entries(schema.shape)) {
    if (field instanceof z.ZodDefault) unwrapped[key] = field.unwrap();
  }
  return schema.extend(unwrapped).partial() as ReturnType<z.ZodObject<Shape>["partial"]>;
}

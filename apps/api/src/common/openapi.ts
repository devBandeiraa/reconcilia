import type { SchemaObject } from '@nestjs/swagger';
import { z } from 'zod';

/** Converte um schema Zod de packages/shared em schema OpenAPI, sem duplicar o tipo. */
export function toOpenApiSchema(schema: z.ZodType): SchemaObject {
  return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as SchemaObject;
}

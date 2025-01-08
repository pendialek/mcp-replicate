/**
 * OpenAPI schema types.
 */

export interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  components?: {
    schemas?: Record<string, SchemaObject>;
  };
}

export interface SchemaObject {
  type?: string;
  required?: string[];
  properties?: Record<string, PropertyObject>;
  additionalProperties?: boolean | SchemaObject;
}

export interface PropertyObject {
  type: string;
  format?: string;
  description?: string;
  default?: unknown;
  minimum?: number;
  maximum?: number;
  enum?: string[];
  items?: SchemaObject;
}

export type ModelIO = Record<string, unknown>;

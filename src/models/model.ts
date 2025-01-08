/**
 * Data models for Replicate models and versions.
 */

/**
 * OpenAPI schema types
 */
export interface OpenAPISchema {
  openapi: string;
  info: {
    title: string;
    version: string;
  };
  paths: Record<string, unknown>;
  components?: {
    schemas?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
}

/**
 * A specific version of a model on Replicate.
 */
export interface ModelVersion {
  /** Unique identifier for this model version */
  id: string;
  /** When this version was created */
  created_at: string;
  /** Version of Cog used to create this model */
  cog_version: string;
  /** OpenAPI schema for the model */
  openapi_schema: OpenAPISchema;
  /** Model identifier (owner/name) */
  model?: string;
  /** Replicate version identifier */
  replicate_version?: string;
  /** Hardware configuration for this version */
  hardware?: string;
}

/**
 * Model information returned from Replicate.
 */
export interface Model {
  /** Unique identifier in format owner/name */
  id: string;
  /** Owner of the model (user or organization) */
  owner: string;
  /** Name of the model */
  name: string;
  /** Description of the model's purpose and usage */
  description?: string;
  /** Model visibility (public/private) */
  visibility: "public" | "private";
  /** URL to model's GitHub repository */
  github_url?: string;
  /** URL to model's research paper */
  paper_url?: string;
  /** URL to model's license */
  license_url?: string;
  /** Number of times this model has been run */
  run_count?: number;
  /** URL to model's cover image */
  cover_image_url?: string;
  /** Latest version of the model */
  latest_version?: ModelVersion;
  /** Default example inputs */
  default_example?: Record<string, unknown>;
  /** Whether this model is featured */
  featured?: boolean;
  /** Model tags */
  tags?: string[];
}

/**
 * Response format for listing models.
 */
export interface ModelList {
  /** List of models */
  models: Model[];
  /** Cursor for pagination */
  next_cursor?: string;
  /** Total number of models */
  total_count?: number;
}

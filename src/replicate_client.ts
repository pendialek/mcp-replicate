/**
 * Replicate API client implementation with caching support.
 */

import Replicate from "replicate";
import type { Model, ModelList, ModelVersion } from "./models/model.js";
import type {
  Prediction,
  PredictionInput,
  PredictionStatus,
  ModelIO,
} from "./models/prediction.js";
import type { Collection, CollectionList } from "./models/collection.js";
import {
  modelCache,
  predictionCache,
  collectionCache,
} from "./services/cache.js";
import { ReplicateError, ErrorHandler, createError } from "./services/error.js";

// Constants
const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const DEFAULT_TIMEOUT = 60000; // 60 seconds in milliseconds
const MAX_RETRIES = 3;
const MIN_RETRY_DELAY = 1000; // 1 second in milliseconds
const MAX_RETRY_DELAY = 10000; // 10 seconds in milliseconds
const DEFAULT_RATE_LIMIT = 100; // requests per minute

// Type definitions for Replicate client responses
interface ReplicateModel {
  owner: string;
  name: string;
  description?: string;
  visibility?: "public" | "private";
  github_url?: string;
  paper_url?: string;
  license_url?: string;
  run_count?: number;
  cover_image_url?: string;
  default_example?: Record<string, unknown>;
  featured?: boolean;
  tags?: string[];
  latest_version?: ModelVersion;
}

interface ReplicatePrediction {
  id: string;
  version: string;
  status: string;
  input: Record<string, unknown>;
  output?: unknown;
  error?: unknown;
  logs?: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  urls: Record<string, string>;
  metrics?: Record<string, number>;
}

interface ReplicatePage<T> {
  results: T[];
  next?: string;
  previous?: string;
  total?: number;
}

interface CreatePredictionOptions {
  version?: string;
  model?: string;
  input: ModelIO | string;
  webhook?: string;
}

/**
 * Client for interacting with the Replicate API.
 */
export class ReplicateClient {
  private api_token: string;
  private rate_limit: number;
  private request_times: number[];
  private retry_count: number;
  private client: Replicate;

  constructor(api_token?: string) {
    this.api_token = api_token || process.env.REPLICATE_API_TOKEN || "";
    if (!this.api_token) {
      throw new Error("Replicate API token is required");
    }

    this.rate_limit = DEFAULT_RATE_LIMIT;
    this.request_times = [];
    this.retry_count = 0;
    this.client = new Replicate({ auth: this.api_token });
  }

  /**
   * Wait if necessary to comply with rate limiting.
   */
  private async waitForRateLimit(): Promise<void> {
    const now = Date.now();

    // Remove request times older than 1 minute
    this.request_times = this.request_times.filter((t) => now - t <= 60000);

    if (this.request_times.length >= this.rate_limit) {
      // Calculate wait time based on oldest request
      const wait_time = 60000 - (now - this.request_times[0]);
      if (wait_time > 0) {
        console.debug(`Rate limit reached. Waiting ${wait_time}ms`);
        await new Promise((resolve) => setTimeout(resolve, wait_time));
      }
    }

    this.request_times.push(now);
  }

  /**
   * Handle rate limits and other response headers.
   */
  private async handleResponse(response: Response): Promise<void> {
    // Update rate limit from headers if available
    const limit = response.headers.get("X-RateLimit-Limit");
    const remaining = response.headers.get("X-RateLimit-Remaining");
    const reset = response.headers.get("X-RateLimit-Reset");

    if (limit) {
      this.rate_limit = Number.parseInt(limit, 10);
    }

    // Handle rate limit exceeded
    if (response.status === 429) {
      const retryAfter = Number.parseInt(
        response.headers.get("Retry-After") || "60",
        10
      );
      throw createError.rateLimit(retryAfter);
    }
  }

  /**
   * Make an HTTP request with retries and rate limiting.
   */
  private async makeRequest<T>(
    method: string,
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    await this.waitForRateLimit();

    return ErrorHandler.withRetries(
      async () => {
        const response = await fetch(`${REPLICATE_API_BASE}${endpoint}`, {
          method,
          headers: {
            Authorization: `Token ${this.api_token}`,
            "Content-Type": "application/json",
            ...options.headers,
          },
          ...options,
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT),
        });

        await this.handleResponse(response);

        if (!response.ok) {
          throw await ErrorHandler.parseAPIError(response);
        }

        return response.json();
      },
      {
        maxAttempts: MAX_RETRIES,
        minDelay: MIN_RETRY_DELAY,
        maxDelay: MAX_RETRY_DELAY,
        onRetry: (error: Error, attempt: number) => {
          console.warn(
            `Request failed: ${error.message}. `,
            `Retrying (attempt ${attempt + 1}/${MAX_RETRIES})`
          );
        },
      }
    );
  }

  /**
   * List available models on Replicate with pagination.
   */
  async listModels(
    options: { owner?: string; cursor?: string } = {}
  ): Promise<ModelList> {
    try {
      // Check cache first
      const cacheKey = `models:${options.owner || "all"}:${
        options.cursor || ""
      }`;
      const cached = modelCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      if (options.owner) {
        // If owner is specified, use search to find their models
        const response = (await this.client.models.search(
          `owner:${options.owner}`
        )) as unknown as ReplicatePage<ReplicateModel>;

        const result: ModelList = {
          models: response.results.map((model) => ({
            id: `${model.owner}/${model.name}`,
            owner: model.owner,
            name: model.name,
            description: model.description || "",
            visibility: model.visibility || "public",
            github_url: model.github_url,
            paper_url: model.paper_url,
            license_url: model.license_url,
            run_count: model.run_count,
            cover_image_url: model.cover_image_url,
            default_example: model.default_example,
            featured: model.featured || false,
            tags: model.tags || [],
            latest_version: model.latest_version
              ? {
                  id: model.latest_version.id,
                  created_at: model.latest_version.created_at,
                  cog_version: model.latest_version.cog_version,
                  openapi_schema: {
                    ...model.latest_version.openapi_schema,
                    openapi: "3.0.0",
                    info: {
                      title: `${model.owner}/${model.name}`,
                      version: model.latest_version.id,
                    },
                    paths: {},
                  },
                }
              : undefined,
          })),
          next_cursor: response.next,
          total_count: response.total || response.results.length,
        };

        // Cache the result
        modelCache.set(cacheKey, result);
        return result;
      }

      // Otherwise list all models
      const params = new URLSearchParams();
      if (options.cursor) {
        params.set("cursor", options.cursor);
      }

      const response = await this.makeRequest<ReplicatePage<ReplicateModel>>(
        "GET",
        `/models${params.toString() ? `?${params.toString()}` : ""}`
      );

      const result: ModelList = {
        models: response.results.map((model) => ({
          id: `${model.owner}/${model.name}`,
          owner: model.owner,
          name: model.name,
          description: model.description || "",
          visibility: model.visibility || "public",
          github_url: model.github_url,
          paper_url: model.paper_url,
          license_url: model.license_url,
          run_count: model.run_count,
          cover_image_url: model.cover_image_url,
          default_example: model.default_example,
          featured: model.featured || false,
          tags: model.tags || [],
          latest_version: model.latest_version
            ? {
                id: model.latest_version.id,
                created_at: model.latest_version.created_at,
                cog_version: model.latest_version.cog_version,
                openapi_schema: {
                  ...model.latest_version.openapi_schema,
                  openapi: "3.0.0",
                  info: {
                    title: `${model.owner}/${model.name}`,
                    version: model.latest_version.id,
                  },
                  paths: {},
                },
              }
            : undefined,
        })),
        next_cursor: response.next,
        total_count: response.total || response.results.length,
      };

      // Cache the result
      modelCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Search for models using semantic search.
   */
  async searchModels(query: string): Promise<ModelList> {
    try {
      // Check cache first
      const cacheKey = `search:${query}`;
      const cached = modelCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Use the official client for search
      const response = (await this.client.models.search(
        query
      )) as unknown as ReplicatePage<ReplicateModel>;

      const result: ModelList = {
        models: response.results.map((model) => ({
          id: `${model.owner}/${model.name}`,
          owner: model.owner,
          name: model.name,
          description: model.description || "",
          visibility: model.visibility || "public",
          github_url: model.github_url,
          paper_url: model.paper_url,
          license_url: model.license_url,
          run_count: model.run_count,
          cover_image_url: model.cover_image_url,
          default_example: model.default_example,
          featured: model.featured || false,
          tags: model.tags || [],
          latest_version: model.latest_version
            ? {
                id: model.latest_version.id,
                created_at: model.latest_version.created_at,
                cog_version: model.latest_version.cog_version,
                openapi_schema: {
                  ...model.latest_version.openapi_schema,
                  openapi: "3.0.0",
                  info: {
                    title: `${model.owner}/${model.name}`,
                    version: model.latest_version.id,
                  },
                  paths: {},
                },
              }
            : undefined,
        })),
        next_cursor: response.next,
        total_count: response.results.length,
      };

      // Cache the result
      modelCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * List available collections.
   */
  async listCollections(
    options: {
      cursor?: string;
    } = {}
  ): Promise<CollectionList> {
    try {
      // Check cache first
      const cacheKey = `collections:${options.cursor || ""}`;
      const cached = collectionCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Use the official client for collections
      const response = await this.client.collections.list();

      const result: CollectionList = {
        collections: response.results.map((collection) => ({
          id: collection.slug,
          name: collection.name,
          slug: collection.slug,
          description: collection.description || "",
          models:
            collection.models?.map((model) => ({
              id: `${model.owner}/${model.name}`,
              owner: model.owner,
              name: model.name,
              description: model.description || "",
              visibility: model.visibility || "public",
              github_url: model.github_url,
              paper_url: model.paper_url,
              license_url: model.license_url,
              run_count: model.run_count,
              cover_image_url: model.cover_image_url,
              default_example: model.default_example
                ? ({
                    input: model.default_example.input,
                    output: model.default_example.output,
                    error: model.default_example.error,
                    status: model.default_example.status,
                    logs: model.default_example.logs,
                    metrics: model.default_example.metrics,
                  } as Record<string, unknown>)
                : undefined,
              featured: false,
              tags: [],
              latest_version: model.latest_version
                ? {
                    id: model.latest_version.id,
                    created_at: model.latest_version.created_at,
                    cog_version: model.latest_version.cog_version,
                    openapi_schema: {
                      ...model.latest_version.openapi_schema,
                      openapi: "3.0.0",
                      info: {
                        title: `${model.owner}/${model.name}`,
                        version: model.latest_version.id,
                      },
                      paths: {},
                    },
                  }
                : undefined,
            })) || [],
          featured: false,
          created_at: new Date().toISOString(),
          updated_at: undefined,
        })),
        next_cursor: response.next,
        total_count: response.results.length,
      };

      // Cache the result
      collectionCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Get a specific collection by slug.
   */
  async getCollection(slug: string): Promise<Collection> {
    try {
      // Check cache first
      const cacheKey = `collection:${slug}`;
      const cached = collectionCache.get(cacheKey);
      if (cached?.collections?.length === 1) {
        return cached.collections[0];
      }

      interface CollectionResponse {
        id: string;
        name: string;
        slug: string;
        description?: string;
        models: ReplicateModel[];
        featured?: boolean;
        created_at: string;
        updated_at?: string;
      }

      const response = await this.makeRequest<CollectionResponse>(
        "GET",
        `/collections/${slug}`
      );

      const collection: Collection = {
        id: response.id,
        name: response.name,
        slug: response.slug,
        description: response.description || "",
        models: response.models.map((model) => ({
          id: `${model.owner}/${model.name}`,
          owner: model.owner,
          name: model.name,
          description: model.description || "",
          visibility: model.visibility || "public",
          github_url: model.github_url,
          paper_url: model.paper_url,
          license_url: model.license_url,
          run_count: model.run_count,
          cover_image_url: model.cover_image_url,
          default_example: model.default_example,
          featured: model.featured || false,
          tags: model.tags || [],
          latest_version: model.latest_version,
        })),
        featured: response.featured || false,
        created_at: response.created_at,
        updated_at: response.updated_at,
      };

      // Cache the result as a single-item collection list
      collectionCache.set(cacheKey, {
        collections: [collection],
        total_count: 1,
      });
      return collection;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Create a new prediction.
   */
  async createPrediction(
    options: CreatePredictionOptions
  ): Promise<Prediction> {
    try {
      // If input is a string, wrap it in an object with 'prompt' property
      const input =
        typeof options.input === "string"
          ? { prompt: options.input }
          : options.input;

      // Create prediction parameters with the correct type
      const predictionParams = options.version
        ? {
            version: options.version,
            input,
            webhook: options.webhook,
          }
        : {
            model: options.model!,
            input,
            webhook: options.webhook,
          };

      if (!options.version && !options.model) {
        throw new Error("Either model or version must be provided");
      }

      // Use the official client for predictions
      const prediction = (await this.client.predictions.create(
        predictionParams
      )) as unknown as ReplicatePrediction;

      const result = {
        id: prediction.id,
        version: prediction.version,
        status: prediction.status as PredictionStatus,
        input: prediction.input as ModelIO,
        output: prediction.output as ModelIO | undefined,
        error: prediction.error ? String(prediction.error) : undefined,
        logs: prediction.logs,
        created_at: prediction.created_at,
        started_at: prediction.started_at,
        completed_at: prediction.completed_at,
        urls: prediction.urls,
        metrics: prediction.metrics,
      };

      // Cache the result
      predictionCache.set(`prediction:${prediction.id}`, [result]);
      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Get the status of a prediction.
   */
  async getPredictionStatus(prediction_id: string): Promise<Prediction> {
    try {
      // Check cache first
      const cacheKey = `prediction:${prediction_id}`;
      const cached = predictionCache.get(cacheKey);
      // Only use cache for completed predictions
      if (
        cached?.length === 1 &&
        ["succeeded", "failed", "canceled"].includes(cached[0].status)
      ) {
        return cached[0];
      }

      // Use the official client for predictions
      const prediction = (await this.client.predictions.get(
        prediction_id
      )) as unknown as ReplicatePrediction;

      const result = {
        id: prediction.id,
        version: prediction.version,
        status: prediction.status as PredictionStatus,
        input: prediction.input as ModelIO,
        output: prediction.output as ModelIO | undefined,
        error: prediction.error ? String(prediction.error) : undefined,
        logs: prediction.logs,
        created_at: prediction.created_at,
        started_at: prediction.started_at,
        completed_at: prediction.completed_at,
        urls: prediction.urls,
        metrics: prediction.metrics,
      };

      // Cache completed predictions
      if (["succeeded", "failed", "canceled"].includes(result.status)) {
        predictionCache.set(cacheKey, [result]);
      }

      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Cancel a running prediction.
   */
  async cancelPrediction(prediction_id: string): Promise<Prediction> {
    try {
      const response = await this.makeRequest<ReplicatePrediction>(
        "POST",
        `/predictions/${prediction_id}/cancel`
      );

      const result = {
        id: response.id,
        version: response.version,
        status: response.status as PredictionStatus,
        input: response.input as ModelIO,
        output: response.output as ModelIO | undefined,
        error: response.error ? String(response.error) : undefined,
        logs: response.logs,
        created_at: response.created_at,
        started_at: response.started_at,
        completed_at: response.completed_at,
        urls: response.urls,
        metrics: response.metrics,
      };

      // Update cache
      predictionCache.set(`prediction:${prediction_id}`, [result]);
      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * List predictions with optional filtering.
   */
  async listPredictions(
    options: {
      status?: PredictionStatus;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<Prediction[]> {
    try {
      // Check cache first
      const cacheKey = `predictions:${options.status || "all"}:${
        options.limit || "all"
      }:${options.cursor || ""}`;
      const cached = predictionCache.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Use the official client for predictions
      const response =
        (await this.client.predictions.list()) as unknown as ReplicatePage<ReplicatePrediction>;

      // Filter and limit results
      const filteredPredictions = options.status
        ? response.results.filter((p) => p.status === options.status)
        : response.results;

      const limitedPredictions = options.limit
        ? filteredPredictions.slice(0, options.limit)
        : filteredPredictions;

      const result = limitedPredictions.map((prediction) => ({
        id: prediction.id,
        version: prediction.version,
        status: prediction.status as PredictionStatus,
        input: prediction.input as ModelIO,
        output: prediction.output as ModelIO | undefined,
        error: prediction.error ? String(prediction.error) : undefined,
        logs: prediction.logs,
        created_at: prediction.created_at,
        started_at: prediction.started_at,
        completed_at: prediction.completed_at,
        urls: prediction.urls,
        metrics: prediction.metrics,
      }));

      // Cache the result
      predictionCache.set(cacheKey, result);
      return result;
    } catch (error) {
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Get details of a specific model including versions.
   */
  async getModel(owner: string, name: string): Promise<Model> {
    try {
      // Check cache first
      const cacheKey = `model:${owner}/${name}`;
      const cached = modelCache.get(cacheKey);
      if (cached?.models?.length === 1) {
        return cached.models[0];
      }

      // Use direct API request to get model details
      const response = await this.makeRequest<ReplicateModel>(
        "GET",
        `/models/${owner}/${name}`
      ).catch((error) => {
        throw ErrorHandler.parseAPIError(error);
      });

      // Get model versions
      const versionsResponse = await this.makeRequest<
        ReplicatePage<ModelVersion>
      >("GET", `/models/${owner}/${name}/versions`).catch((error) => {
        throw ErrorHandler.parseAPIError(error);
      });

      const model: Model = {
        id: `${response.owner}/${response.name}`,
        owner: response.owner,
        name: response.name,
        description: response.description || "",
        visibility: response.visibility || "public",
        github_url: response.github_url,
        paper_url: response.paper_url,
        license_url: response.license_url,
        run_count: response.run_count,
        cover_image_url: response.cover_image_url,
        default_example: response.default_example,
        latest_version: versionsResponse.results[0]
          ? {
              id: versionsResponse.results[0].id,
              created_at: versionsResponse.results[0].created_at,
              cog_version: versionsResponse.results[0].cog_version,
              openapi_schema: {
                ...versionsResponse.results[0].openapi_schema,
                openapi: "3.0.0",
                info: {
                  title: `${response.owner}/${response.name}`,
                  version: versionsResponse.results[0].id,
                },
                paths: {},
              },
            }
          : undefined,
      };

      // Cache the result as a single-item model list
      modelCache.set(cacheKey, {
        models: [model],
        total_count: 1,
      });
      return model;
    } catch (error) {
      if (error instanceof Promise) {
        throw new ReplicateError("Failed to fetch model details");
      }
      throw ErrorHandler.parseAPIError(error as Response);
    }
  }

  /**
   * Get the webhook signing secret.
   */
  async getWebhookSecret(): Promise<string> {
    interface WebhookResponse {
      key: string;
    }

    const response = await this.makeRequest<WebhookResponse>(
      "GET",
      "/webhooks/default/secret"
    );

    return response.key;
  }
}

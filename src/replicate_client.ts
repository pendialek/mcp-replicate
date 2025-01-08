/**
 * Replicate API client implementation.
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

/**
 * Base class for Replicate API errors.
 */
export class ReplicateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ReplicateError";
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitExceeded extends ReplicateError {
  constructor(public retry_after: number) {
    super(`Rate limit exceeded. Retry after ${retry_after} seconds.`);
    this.name = "RateLimitExceeded";
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends ReplicateError {
  constructor() {
    super("Invalid or missing API token");
    this.name = "AuthenticationError";
  }
}

/**
 * Error thrown when a resource is not found.
 */
export class NotFoundError extends ReplicateError {
  constructor(resource: string) {
    super(`Resource not found: ${resource}`);
    this.name = "NotFoundError";
  }
}

/**
 * Error thrown when the API request fails.
 */
export class APIError extends ReplicateError {
  constructor(public status: number, public code: string, message: string) {
    super(`API error (${status}): ${message}`);
    this.name = "APIError";
  }
}

/**
 * Helper to handle API errors consistently.
 */
function handleAPIError(error: unknown): never {
  if (error instanceof ReplicateError) {
    throw error;
  }

  if (error instanceof Response) {
    if (error.status === 401) {
      throw new AuthenticationError();
    }
    if (error.status === 404) {
      throw new NotFoundError(error.url);
    }
    if (error.status === 429) {
      const retryAfter = Number.parseInt(
        error.headers.get("retry-after") || "60",
        10
      );
      throw new RateLimitExceeded(retryAfter);
    }
    throw new APIError(error.status, error.statusText, "Request failed");
  }

  if (error instanceof Error) {
    throw new ReplicateError(error.message);
  }

  throw new ReplicateError("Unknown error occurred");
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
    if (limit) {
      this.rate_limit = Number.parseInt(limit, 10);
    }

    // Handle rate limit exceeded
    if (response.status === 429) {
      const retry_after = Number.parseInt(
        response.headers.get("Retry-After") || "60",
        10
      );
      throw new RateLimitExceeded(retry_after);
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

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
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
          handleAPIError(response);
        }

        this.retry_count = 0; // Reset on success
        return await response.json();
      } catch (error) {
        if (error instanceof RateLimitExceeded) {
          console.warn(
            `Rate limit exceeded. Waiting ${error.retry_after} seconds`
          );
          await new Promise((resolve) =>
            setTimeout(resolve, error.retry_after * 1000)
          );
          continue;
        }

        this.retry_count++;
        if (attempt === MAX_RETRIES - 1) {
          handleAPIError(error);
        }

        // Calculate exponential backoff with jitter
        const delay = Math.min(
          MAX_RETRY_DELAY,
          MIN_RETRY_DELAY * 2 ** attempt + Math.random() * 1000
        );

        console.warn(
          `Request failed: ${error}. `,
          `Retrying in ${delay}ms `,
          `(attempt ${attempt + 1}/${MAX_RETRIES})`
        );

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw new Error("Request failed after max retries");
  }

  /**
   * List available models on Replicate with pagination.
   */
  async listModels(
    options: {
      owner?: string;
      cursor?: string;
    } = {}
  ): Promise<ModelList> {
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (options.cursor) {
        params.set("cursor", options.cursor);
      }
      if (options.owner) {
        params.set("username", options.owner); // The API expects 'username' not 'owner'
      }

      // Make direct request to support all parameters
      const response = await this.makeRequest<ReplicatePage<ReplicateModel>>(
        "GET",
        `/models${params.toString() ? `?${params.toString()}` : ""}`
      );

      return {
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
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Search for models using semantic search.
   */
  async searchModels(query: string): Promise<ModelList> {
    try {
      // Use the official client for search
      const response = (await this.client.models.search(
        query
      )) as unknown as ReplicatePage<ReplicateModel>;

      return {
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
    } catch (error) {
      handleAPIError(error);
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
      // Use the official client for collections
      const response = await this.client.collections.list();

      return {
        collections: response.results.map((collection) => ({
          id: collection.slug, // Using slug as id since the official client doesn't provide an id
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
              featured: false, // The official client doesn't provide this
              tags: [], // The official client doesn't provide this
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
          featured: false, // The official client doesn't provide this
          created_at: new Date().toISOString(), // The official client doesn't provide this
          updated_at: undefined,
        })),
        next_cursor: response.next,
        total_count: response.results.length,
      };
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Get a specific collection by slug.
   */
  async getCollection(slug: string): Promise<Collection> {
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

    return {
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
  }

  /**
   * Create a new prediction.
   */
  async createPrediction(options: {
    version: string;
    input: ModelIO;
    webhook?: string;
  }): Promise<Prediction> {
    try {
      // Use the official client for predictions
      const prediction = (await this.client.predictions.create({
        version: options.version,
        input: options.input,
        webhook: options.webhook,
      })) as unknown as ReplicatePrediction;

      return {
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
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Get the status of a prediction.
   */
  async getPredictionStatus(prediction_id: string): Promise<Prediction> {
    try {
      // Use the official client for predictions
      const prediction = (await this.client.predictions.get(
        prediction_id
      )) as unknown as ReplicatePrediction;

      return {
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
    } catch (error) {
      handleAPIError(error);
    }
  }

  /**
   * Cancel a running prediction.
   */
  async cancelPrediction(prediction_id: string): Promise<Prediction> {
    const response = await this.makeRequest<ReplicatePrediction>(
      "POST",
      `/predictions/${prediction_id}/cancel`
    );

    return {
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

      return limitedPredictions.map((prediction) => ({
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
    } catch (error) {
      handleAPIError(error);
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

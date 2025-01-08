/**
 * Replicate API client implementation.
 */

import type { Model, ModelList } from "./models/model.js";
import type {
  Prediction,
  PredictionInput,
  PredictionStatus,
  ModelIO,
} from "./models/prediction.js";
import type { Collection, CollectionList } from "./models/collection.ts";

// Constants
const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const DEFAULT_TIMEOUT = 60000; // 60 seconds in milliseconds
const MAX_RETRIES = 3;
const MIN_RETRY_DELAY = 1000; // 1 second in milliseconds
const MAX_RETRY_DELAY = 10000; // 10 seconds in milliseconds
const DEFAULT_RATE_LIMIT = 100; // requests per minute

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
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
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
    throw new APIError(
      error.status,
      error.statusText,
      "Request failed"
    );
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

  constructor(api_token?: string) {
    this.api_token = api_token || process.env.REPLICATE_API_TOKEN || "";
    if (!this.api_token) {
      throw new Error("Replicate API token is required");
    }

    this.rate_limit = DEFAULT_RATE_LIMIT;
    this.request_times = [];
    this.retry_count = 0;
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
    const params = new URLSearchParams();
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }
    if (options.owner) {
      params.set("user", options.owner);
    }

    interface ModelResponse {
      results: {
        owner: string;
        name: string;
        description?: string;
        visibility?: "public" | "private";
        github_url?: string;
        paper_url?: string;
        license_url?: string;
        run_count?: number;
        cover_image_url?: string;
        latest_version?: Model["latest_version"];
        default_example?: Record<string, unknown>;
        featured?: boolean;
        tags?: string[];
      }[];
      next?: string;
    }

    const result = await this.makeRequest<ModelResponse>(
      "GET",
      `/models?${params.toString()}`
    );

    // Ensure results exists and is an array
    const models = Array.isArray(result.results) ? result.results : [];

    return {
      models: models.map((m) => ({
        id: `${m.owner}/${m.name}`,
        owner: m.owner,
        name: m.name,
        description: m.description,
        visibility: m.visibility || "public",
        github_url: m.github_url,
        paper_url: m.paper_url,
        license_url: m.license_url,
        run_count: m.run_count,
        cover_image_url: m.cover_image_url,
        latest_version: m.latest_version,
        default_example: m.default_example,
        featured: m.featured,
        tags: m.tags || [],
      })),
      next_cursor: result.next,
    };
  }

  /**
   * Search for models using semantic search.
   */
  async searchModels(query: string): Promise<ModelList> {
    interface SearchResponse {
      results: {
        owner: string;
        name: string;
        description?: string;
        visibility?: "public" | "private";
        github_url?: string;
        paper_url?: string;
        license_url?: string;
        run_count?: number;
        cover_image_url?: string;
        latest_version?: Model["latest_version"];
        default_example?: Record<string, unknown>;
        featured?: boolean;
        tags?: string[];
      }[];
      next?: string;
    }

    const params = new URLSearchParams();
    params.set("search", query);
    
    const result = await this.makeRequest<SearchResponse>("GET", `/models?${params.toString()}`);

    // Add debug logging
    console.debug('Search response:', JSON.stringify(result, null, 2));

    // Ensure we have a valid response structure
    if (!result || typeof result !== 'object') {
      return {
        models: [],
        next_cursor: undefined
      };
    }

    // Ensure results exists and is an array
    const models = Array.isArray(result.results) ? result.results : [];

    return {
      models: models.map((m) => ({
        id: `${m.owner}/${m.name}`,
        owner: m.owner,
        name: m.name,
        description: m.description,
        visibility: m.visibility || "public",
        github_url: m.github_url,
        paper_url: m.paper_url,
        license_url: m.license_url,
        run_count: m.run_count,
        cover_image_url: m.cover_image_url,
        latest_version: m.latest_version,
        default_example: m.default_example,
        featured: m.featured,
        tags: m.tags || [],
      })),
      next_cursor: result.next,
    };
  }

  /**
   * List available collections with pagination.
   */
  async listCollections(options: {
    cursor?: string;
  } = {}): Promise<CollectionList> {
    const params = new URLSearchParams();
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }

    interface CollectionResponse {
      results: {
        id: string;
        name: string;
        slug: string;
        description?: string;
        models: {
          owner: string;
          name: string;
          description?: string;
          visibility?: "public" | "private";
          github_url?: string;
          paper_url?: string;
          license_url?: string;
          run_count?: number;
          cover_image_url?: string;
          latest_version?: Model["latest_version"];
          default_example?: Record<string, unknown>;
          featured?: boolean;
          tags?: string[];
        }[];
        featured?: boolean;
        created_at: string;
        updated_at?: string;
      }[];
      next?: string;
      total_count?: number;
    }

    const result = await this.makeRequest<CollectionResponse>(
      "GET",
      `/collections?${params.toString()}`
    );

    // Add debug logging
    console.debug('Collections response:', JSON.stringify(result, null, 2));

    // Ensure we have a valid response structure
    if (!result || typeof result !== 'object') {
      return {
        collections: [],
        next_cursor: undefined,
        total_count: 0
      };
    }

    // Ensure results exists and is an array
    const collections = Array.isArray(result.results) ? result.results : [];

    return {
      collections: collections.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        description: c.description,
        models: (c.models || []).map((m) => ({
          id: `${m.owner}/${m.name}`,
          owner: m.owner,
          name: m.name,
          description: m.description,
          visibility: m.visibility || "public",
          github_url: m.github_url,
          paper_url: m.paper_url,
          license_url: m.license_url,
          run_count: m.run_count,
          cover_image_url: m.cover_image_url,
          latest_version: m.latest_version,
          default_example: m.default_example,
          featured: m.featured,
          tags: m.tags || [],
        })),
        featured: c.featured,
        created_at: c.created_at,
        updated_at: c.updated_at,
      })),
      next_cursor: result.next,
      total_count: result.total_count,
    };
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
      models: {
        owner: string;
        name: string;
        description?: string;
        visibility?: "public" | "private";
        github_url?: string;
        paper_url?: string;
        license_url?: string;
        run_count?: number;
        cover_image_url?: string;
        latest_version?: Model["latest_version"];
        default_example?: Record<string, unknown>;
        featured?: boolean;
        tags?: string[];
      }[];
      featured?: boolean;
      created_at: string;
      updated_at?: string;
    }

    const result = await this.makeRequest<CollectionResponse>(
      "GET",
      `/collections/${slug}`
    );

    return {
      id: result.id,
      name: result.name,
      slug: result.slug,
      description: result.description,
      models: result.models.map((m) => ({
        id: `${m.owner}/${m.name}`,
        owner: m.owner,
        name: m.name,
        description: m.description,
        visibility: m.visibility || "public",
        github_url: m.github_url,
        paper_url: m.paper_url,
        license_url: m.license_url,
        run_count: m.run_count,
        cover_image_url: m.cover_image_url,
        latest_version: m.latest_version,
        default_example: m.default_example,
        featured: m.featured,
        tags: m.tags || [],
      })),
      featured: result.featured,
      created_at: result.created_at,
      updated_at: result.updated_at,
    };
  }

  /**
   * Create a new prediction using a model version.
   */
  async createPrediction(options: {
    version: string;
    input: ModelIO;
    webhook?: string;
  }): Promise<Prediction> {
    interface PredictionBody {
      version: string;
      input: ModelIO;
      webhook_completed?: string;
    }

    const body: PredictionBody = {
      version: options.version,
      input: options.input,
    };
    if (options.webhook) {
      body.webhook_completed = options.webhook;
    }

    interface PredictionResponse {
      id: string;
      version: string;
      status: PredictionStatus;
      input: ModelIO;
      output?: ModelIO;
      error?: string;
      logs?: string;
      created_at: string;
      started_at?: string;
      completed_at?: string;
      urls: Record<string, string>;
      metrics?: Record<string, number>;
    }

    const result = await this.makeRequest<PredictionResponse>(
      "POST",
      "/predictions",
      {
        method: "POST",
        body: JSON.stringify(body),
      }
    );

    return {
      id: result.id,
      version: result.version,
      status: result.status,
      input: result.input,
      output: result.output,
      error: result.error,
      logs: result.logs,
      created_at: result.created_at,
      started_at: result.started_at,
      completed_at: result.completed_at,
      urls: result.urls,
      metrics: result.metrics,
      stream_url: result.urls?.stream,
    };
  }

  /**
   * Get the status and results of a prediction.
   */
  async getPredictionStatus(prediction_id: string): Promise<Prediction> {
    interface PredictionResponse {
      id: string;
      version: string;
      status: PredictionStatus;
      input: ModelIO;
      output?: ModelIO;
      error?: string;
      logs?: string;
      created_at: string;
      started_at?: string;
      completed_at?: string;
      urls: Record<string, string>;
      metrics?: Record<string, number>;
    }

    const result = await this.makeRequest<PredictionResponse>(
      "GET",
      `/predictions/${prediction_id}`
    );

    return {
      id: result.id,
      version: result.version,
      status: result.status,
      input: result.input,
      output: result.output,
      error: result.error,
      logs: result.logs,
      created_at: result.created_at,
      started_at: result.started_at,
      completed_at: result.completed_at,
      urls: result.urls,
      metrics: result.metrics,
      stream_url: result.urls?.stream,
    };
  }

  /**
   * Cancel a running prediction.
   */
  async cancelPrediction(prediction_id: string): Promise<Prediction> {
    interface PredictionResponse {
      id: string;
      version: string;
      status: PredictionStatus;
      input: ModelIO;
      output?: ModelIO;
      error?: string;
      logs?: string;
      created_at: string;
      started_at?: string;
      completed_at?: string;
      urls: Record<string, string>;
      metrics?: Record<string, number>;
    }

    const result = await this.makeRequest<PredictionResponse>(
      "POST",
      `/predictions/${prediction_id}/cancel`
    );

    return {
      id: result.id,
      version: result.version,
      status: result.status,
      input: result.input,
      output: result.output,
      error: result.error,
      logs: result.logs,
      created_at: result.created_at,
      started_at: result.started_at,
      completed_at: result.completed_at,
      urls: result.urls,
      metrics: result.metrics,
      stream_url: result.urls?.stream,
    };
  }

  /**
   * List recent predictions with optional filtering.
   */
  async listPredictions(
    options: {
      status?: PredictionStatus;
      limit?: number;
      cursor?: string;
    } = {}
  ): Promise<Prediction[]> {
    const params = new URLSearchParams();
    if (options.status) {
      params.set("status", options.status);
    }
    if (options.limit) {
      params.set("limit", options.limit.toString());
    }
    if (options.cursor) {
      params.set("cursor", options.cursor);
    }

    interface PredictionResponse {
      id: string;
      version: string;
      status: PredictionStatus;
      input: ModelIO;
      output?: ModelIO;
      error?: string;
      logs?: string;
      created_at: string;
      started_at?: string;
      completed_at?: string;
      urls: Record<string, string>;
      metrics?: Record<string, number>;
    }

    const result = await this.makeRequest<PredictionResponse[]>(
      "GET",
      `/predictions?${params.toString()}`
    );

    return result.map((p) => ({
      id: p.id,
      version: p.version,
      status: p.status,
      input: p.input,
      output: p.output,
      error: p.error,
      logs: p.logs,
      created_at: p.created_at,
      started_at: p.started_at,
      completed_at: p.completed_at,
      urls: p.urls,
      metrics: p.metrics,
      stream_url: p.urls?.stream,
    }));
  }

  /**
   * Get the signing secret for verifying webhook requests.
   */
  async getWebhookSecret(): Promise<string> {
    const result = await this.makeRequest<{ key: string }>(
      "GET",
      "/webhooks/default/secret"
    );
    return result.key;
  }
}

/**
 * Enhanced error handling system for Replicate API.
 */

import type { PredictionStatus } from "../models/prediction.js";

/**
 * Base class for Replicate API errors with enhanced context.
 */
export class ReplicateError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message);
    this.name = "ReplicateError";
  }

  /**
   * Get a detailed error report including context.
   */
  getReport(): string {
    const report = [`Error: ${this.message}`];
    if (this.context) {
      report.push("Context:");
      for (const [key, value] of Object.entries(this.context)) {
        report.push(`  ${key}: ${JSON.stringify(value)}`);
      }
    }
    if (this.stack) {
      report.push("\nStack trace:", this.stack);
    }
    return report.join("\n");
  }
}

/**
 * Error thrown when rate limit is exceeded.
 */
export class RateLimitExceeded extends ReplicateError {
  constructor(
    public retry_after: number,
    public remaining_requests?: number,
    public reset_time?: Date
  ) {
    super(`Rate limit exceeded. Retry after ${retry_after} seconds.`, {
      retry_after,
      remaining_requests,
      reset_time: reset_time?.toISOString(),
    });
    this.name = "RateLimitExceeded";
  }
}

/**
 * Error thrown when authentication fails.
 */
export class AuthenticationError extends ReplicateError {
  constructor(details?: string) {
    super(`Invalid or missing API token${details ? `: ${details}` : ""}`, {
      details,
    });
    this.name = "AuthenticationError";
  }
}

/**
 * Error thrown when a resource is not found.
 */
export class NotFoundError extends ReplicateError {
  constructor(resource: string, details?: string) {
    super(`Resource not found: ${resource}${details ? ` (${details})` : ""}`, {
      resource,
      details,
    });
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
    message: string,
    public response?: any
  ) {
    super(`API error (${status}): ${message}`, {
      status,
      code,
      response,
    });
    this.name = "APIError";
  }
}

/**
 * Error thrown when a prediction fails.
 */
export class PredictionError extends ReplicateError {
  constructor(
    public prediction_id: string,
    message: string,
    public status: PredictionStatus,
    public logs?: string
  ) {
    super(`Prediction ${prediction_id} failed: ${message}`, {
      prediction_id,
      status,
      logs,
    });
    this.name = "PredictionError";
  }
}

/**
 * Error thrown when a webhook delivery fails.
 */
export class WebhookError extends ReplicateError {
  constructor(
    public webhook_url: string,
    message: string,
    public status_code?: number,
    public response?: string
  ) {
    super(`Webhook delivery to ${webhook_url} failed: ${message}`, {
      webhook_url,
      status_code,
      response,
    });
    this.name = "WebhookError";
  }
}

/**
 * Error thrown when input validation fails.
 */
export class ValidationError extends ReplicateError {
  constructor(message: string, public field?: string, public value?: unknown) {
    super(`Validation error${field ? ` for ${field}` : ""}: ${message}`, {
      field,
      value,
    });
    this.name = "ValidationError";
  }
}

/**
 * Error thrown when a timeout occurs.
 */
export class TimeoutError extends ReplicateError {
  constructor(operation: string, public timeout_ms: number) {
    super(`Operation "${operation}" timed out after ${timeout_ms}ms`, {
      operation,
      timeout_ms,
    });
    this.name = "TimeoutError";
  }
}

/**
 * Enhanced error handling utilities.
 */
export class ErrorHandler {
  private static retryableStatusCodes = new Set([
    408, // Request Timeout
    429, // Too Many Requests
    500, // Internal Server Error
    502, // Bad Gateway
    503, // Service Unavailable
    504, // Gateway Timeout
  ]);

  /**
   * Check if an error should trigger a retry.
   */
  static isRetryable(error: Error): boolean {
    if (error instanceof RateLimitExceeded) {
      return true;
    }
    if (error instanceof APIError) {
      return this.retryableStatusCodes.has(error.status);
    }
    if (error instanceof TimeoutError) {
      return true;
    }
    return false;
  }

  /**
   * Calculate delay for exponential backoff.
   */
  static getBackoffDelay(
    attempt: number,
    options?: {
      min_delay?: number;
      max_delay?: number;
      factor?: number;
      jitter?: boolean;
    }
  ): number {
    const {
      min_delay = 1000,
      max_delay = 30000,
      factor = 2,
      jitter = true,
    } = options || {};

    let delay = min_delay * Math.pow(factor, attempt);
    if (jitter) {
      delay += Math.random() * min_delay;
    }
    return Math.min(delay, max_delay);
  }

  /**
   * Execute an operation with automatic retries.
   */
  static async withRetries<T>(
    operation: () => Promise<T>,
    options?: {
      max_attempts?: number;
      min_delay?: number;
      max_delay?: number;
      backoff_factor?: number;
      jitter?: boolean;
      retry_if?: (error: Error) => boolean;
      on_retry?: (error: Error, attempt: number) => void;
    }
  ): Promise<T> {
    const {
      max_attempts = 3,
      min_delay = 1000,
      max_delay = 30000,
      backoff_factor = 2,
      jitter = true,
      retry_if = this.isRetryable,
      on_retry,
    } = options || {};

    let lastError: Error;
    for (let attempt = 0; attempt < max_attempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === max_attempts - 1 || !retry_if(lastError)) {
          throw lastError;
        }

        const delay = this.getBackoffDelay(attempt, {
          min_delay,
          max_delay,
          factor: backoff_factor,
          jitter,
        });

        if (on_retry) {
          on_retry(lastError, attempt);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  /**
   * Parse error details from API response.
   */
  static parseAPIError(response: Response): APIError {
    let message = response.statusText;
    let code = "unknown_error";
    let details: any;

    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        details = response.json();
        if (details.error) {
          message = details.error;
        }
        if (details.code) {
          code = details.code;
        }
      }
    } catch {
      // Ignore JSON parsing errors
    }

    return new APIError(response.status, code, message, details);
  }

  /**
   * Create a detailed error report.
   */
  static createErrorReport(error: Error): {
    name: string;
    message: string;
    context?: Record<string, unknown>;
    environment: Record<string, unknown>;
    timestamp: string;
  } {
    const timestamp = new Date().toISOString();
    const environment = {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
    };

    if (error instanceof ReplicateError) {
      return {
        name: error.name,
        message: error.message,
        context: error.context,
        environment,
        timestamp,
      };
    }

    return {
      name: error.name || "Error",
      message: error.message,
      environment,
      timestamp,
    };
  }
}

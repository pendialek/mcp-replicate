/**
 * Simple error handling system for Replicate API.
 */

interface APIErrorResponse {
  error?: string;
  code?: string;
  details?: Record<string, unknown>;
}

/**
 * Base class for all Replicate API errors.
 */
export class ReplicateError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message);
    this.name = "ReplicateError";
  }
}

// Re-export specialized error types as ReplicateError instances
export const createError = {
  rateLimit: (retryAfter: number) =>
    new ReplicateError("Rate limit exceeded", { retryAfter }),

  authentication: (details?: string) =>
    new ReplicateError("Authentication failed", { details }),

  notFound: (resource: string) =>
    new ReplicateError("Model not found", { resource }),

  api: (status: number, message: string) =>
    new ReplicateError("API error", { status, message }),

  prediction: (id: string, message: string) =>
    new ReplicateError("Prediction failed", { predictionId: id, message }),

  validation: (field: string, message: string) =>
    new ReplicateError("Invalid input parameters", { field, message }),

  timeout: (operation: string, ms: number) =>
    new ReplicateError("Operation timed out", { operation, timeoutMs: ms }),
};

interface RetryOptions {
  maxAttempts?: number;
  minDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  retryIf?: (error: Error) => boolean;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Error handling utilities.
 */
export const ErrorHandler = {
  /**
   * Check if an error should trigger a retry.
   */
  isRetryable(error: Error): boolean {
    if (!(error instanceof ReplicateError)) return false;

    const retryableMessages = [
      "Rate limit exceeded",
      "Internal server error",
      "Gateway timeout",
      "Service unavailable",
    ];

    return retryableMessages.some((msg) => error.message.includes(msg));
  },

  /**
   * Calculate delay for exponential backoff.
   */
  getBackoffDelay(
    attempt: number,
    {
      minDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
    }: Partial<RetryOptions> = {}
  ): number {
    const delay = minDelay * backoffFactor ** attempt;
    return Math.min(delay, maxDelay);
  },

  /**
   * Execute an operation with automatic retries.
   */
  async withRetries<T>(
    operation: () => Promise<T>,
    optionsOrMaxAttempts: RetryOptions | number = {}
  ): Promise<T> {
    const options: RetryOptions =
      typeof optionsOrMaxAttempts === "number"
        ? { maxAttempts: optionsOrMaxAttempts }
        : optionsOrMaxAttempts;

    const {
      maxAttempts = 3,
      minDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      retryIf = this.isRetryable,
      onRetry,
    } = options;

    let lastError: Error | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxAttempts - 1 || !retryIf(lastError)) {
          throw lastError;
        }

        const delay = this.getBackoffDelay(attempt, {
          minDelay,
          maxDelay,
          backoffFactor,
        });

        if (onRetry) {
          onRetry(lastError, attempt);
        }

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    throw lastError || new Error("Operation failed");
  },

  /**
   * Parse error from API response.
   */
  async parseAPIError(response: Response): Promise<ReplicateError> {
    const status = response.status;
    let message = response.statusText;
    let context: Record<string, unknown> = { status };

    try {
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const details = (await response.json()) as APIErrorResponse;
        message = details.error || message;
        context = { ...context, ...details };
      }
    } catch {
      // Ignore JSON parsing errors
    }

    return new ReplicateError(message, context);
  },

  /**
   * Create a detailed error report.
   */
  createErrorReport(error: Error): {
    name: string;
    message: string;
    context?: Record<string, unknown>;
    timestamp: string;
  } {
    if (error instanceof ReplicateError) {
      return {
        name: error.name,
        message: error.message,
        context: error.context,
        timestamp: new Date().toISOString(),
      };
    }

    return {
      name: error.name || "Error",
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  },
};

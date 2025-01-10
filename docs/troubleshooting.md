# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Replicate MCP Server.

## Error Handling System

### ReplicateError Class

```typescript
// Base error class with context
class ReplicateError extends Error {
  constructor(message: string, public context?: Record<string, unknown>) {
    super(message);
    this.name = "ReplicateError";
  }
}
```

### Error Factory Functions

```typescript
const createError = {
  rateLimit: (retryAfter: number) =>
    new ReplicateError("Rate limit exceeded", { retryAfter }),

  authentication: (details?: string) =>
    new ReplicateError("Authentication failed", { details }),

  notFound: (resource: string) =>
    new ReplicateError("Model not found", { resource }),

  validation: (field: string, message: string) =>
    new ReplicateError("Invalid input parameters", { field, message }),

  timeout: (operation: string, ms: number) =>
    new ReplicateError("Operation timed out", { operation, timeoutMs: ms }),
};
```

### Error Reports

```typescript
interface ErrorReport {
  name: string;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

// Generate error reports
const report = ErrorHandler.createErrorReport(error);
console.error(JSON.stringify(report, null, 2));
```

## Common Issues

### 1. Authentication Issues

#### Symptoms
- "Authentication failed" errors
- 401 Unauthorized responses
- Authentication-related webhook failures

#### Solutions
1. Verify API Token
```typescript
try {
  await client.listModels();
} catch (error) {
  if (error instanceof ReplicateError && error.message === "Authentication failed") {
    console.error("Authentication failed:", error.context?.details);
  }
}
```

2. Check Environment Variables
```typescript
if (!process.env.REPLICATE_API_TOKEN) {
  throw createError.authentication("Missing API token");
}
```

### 2. Rate Limiting Issues

#### Handling Rate Limits

```typescript
try {
  await client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "test" }
  });
} catch (error) {
  if (error instanceof ReplicateError && error.message === "Rate limit exceeded") {
    const retryAfter = error.context?.retryAfter;
    console.log(`Rate limit hit. Retry after ${retryAfter} seconds`);
  }
}
```

### 3. Network Issues

#### Enhanced Network Error Handling

```typescript
const result = await ErrorHandler.withRetries(
  async () => client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "test" }
  }),
  {
    maxAttempts: 3,
    minDelay: 1000,
    maxDelay: 30000,
    retryIf: (error) => error instanceof ReplicateError,
    onRetry: (error, attempt) => {
      console.warn(
        `Request failed: ${error.message}. `,
        `Retrying (attempt ${attempt + 1}/3)`
      );
    }
  }
);
```

### 4. Prediction Issues

#### Input Validation

```typescript
try {
  const prediction = await client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "" }  // Invalid empty prompt
  });
} catch (error) {
  if (error instanceof ReplicateError && error.message === "Invalid input parameters") {
    console.error(`Validation error: ${error.context?.field} - ${error.context?.message}`);
  }
}
```

## Getting Help

If you're experiencing issues:

1. Check error reports:
```typescript
const errorReport = ErrorHandler.createErrorReport(error);
console.error(JSON.stringify(errorReport, null, 2));
```

2. Generate a diagnostic report:
```typescript
const diagnostics = {
  error: ErrorHandler.createErrorReport(error),
  timestamp: new Date().toISOString(),
  environment: {
    nodeVersion: process.version,
    platform: process.platform,
    arch: process.arch,
    env: process.env.NODE_ENV
  }
};
```

3. Contact support with detailed information:
   - Error reports with context
   - Environment details
   - Steps to reproduce

4. Resources:
   - [GitHub Issues](https://github.com/replicate/replicate/issues)
   - [API Documentation](https://replicate.com/docs)
   - [Discord Community](https://discord.gg/replicate)
   - [Support Email](mailto:support@replicate.com)

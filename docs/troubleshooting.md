# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Replicate MCP Server.

## Enhanced Error Handling

### Error Types

```typescript
// Base error class with enhanced context
class ReplicateError extends Error {
  constructor(
    message: string,
    public context: Record<string, any> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace(this, this.constructor);
  }

  getReport(): ErrorReport {
    return ErrorHandler.createErrorReport(this);
  }
}

// Specific error types
class ValidationError extends ReplicateError {}
class AuthenticationError extends ReplicateError {}
class RateLimitExceeded extends ReplicateError {}
class NetworkError extends ReplicateError {}
class TimeoutError extends ReplicateError {}
```

### Error Reports

```typescript
interface ErrorReport {
  name: string;
  message: string;
  stack: string;
  context: Record<string, any>;
  timestamp: string;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
  };
  request?: {
    method: string;
    url: string;
    headers: Record<string, string>;
    body?: any;
  };
  response?: {
    status: number;
    headers: Record<string, string>;
    body?: any;
  };
}

// Generate detailed error reports
const report = ErrorHandler.createErrorReport(error);
console.error(JSON.stringify(report, null, 2));
```

## Common Issues

### 1. Authentication Issues

#### Symptoms
- "Invalid API token" errors
- 401 Unauthorized responses
- Authentication-related webhook failures

#### Solutions
1. Verify API Token
```typescript
try {
  await client.validateToken();
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error(error.getReport());
    // Token validation details in error.context
    const { tokenAge, lastUsed, permissions } = error.context;
  }
}
```

2. Check Environment Variables
```typescript
// Enhanced environment validation
class EnvironmentValidator {
  static validateToken(token: string | undefined): void {
    if (!token) {
      throw new ValidationError("Missing API token", {
        envVar: "REPLICATE_API_TOKEN",
        configPath: "~/.replicate/config.json"
      });
    }

    if (!/^r8_[a-zA-Z0-9]{40}$/.test(token)) {
      throw new ValidationError("Invalid token format", {
        token: token.substring(0, 5) + "...",
        expectedFormat: "r8_<40 characters>"
      });
    }
  }
}
```

### 2. Rate Limiting Issues

#### Enhanced Rate Limiting

```typescript
class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private limits: Map<string, number> = new Map([
    ["predictions", 50],
    ["models", 100],
    ["collections", 200]
  ]);

  async checkLimit(operation: string): Promise<void> {
    const now = Date.now();
    const windowMs = 60000; // 1 minute
    
    // Get or initialize request timestamps
    let timestamps = this.requests.get(operation) || [];
    timestamps = timestamps.filter(time => now - time < windowMs);
    
    // Check limit
    if (timestamps.length >= (this.limits.get(operation) || 50)) {
      const resetTime = Math.min(...timestamps) + windowMs;
      throw new RateLimitExceeded(
        `Rate limit exceeded for ${operation}`,
        {
          operation,
          limit: this.limits.get(operation),
          resetTime: new Date(resetTime).toISOString(),
          remainingTime: resetTime - now
        }
      );
    }
    
    // Record request
    timestamps.push(now);
    this.requests.set(operation, timestamps);
  }
}
```

### 3. Network Issues

#### Enhanced Network Error Handling

```typescript
class NetworkManager {
  async request<T>(
    operation: () => Promise<T>,
    config: {
      timeout?: number;
      retries?: number;
      circuit_breaker?: boolean;
    } = {}
  ): Promise<T> {
    return ErrorHandler.withRetries(
      async () => {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(
            () => controller.abort(),
            config.timeout || 30000
          );

          const result = await operation();
          clearTimeout(timeoutId);
          return result;
        } catch (error) {
          if (error.name === "AbortError") {
            throw new TimeoutError(
              "Request timed out",
              {
                timeout: config.timeout,
                operation: operation.name
              }
            );
          }
          throw new NetworkError(
            "Network request failed",
            {
              error: error.message,
              operation: operation.name
            }
          );
        }
      },
      {
        max_attempts: config.retries || 3,
        retry_if: (error) => {
          return error instanceof NetworkError ||
                 error instanceof TimeoutError;
        }
      }
    );
  }
}
```

### 4. Prediction Issues

#### Enhanced Prediction Validation

```typescript
class PredictionValidator {
  static validateInput(input: Record<string, any>): void {
    const validators = {
      prompt: (value: any) => {
        if (typeof value !== "string") {
          throw new ValidationError(
            "Invalid prompt type",
            { expected: "string", received: typeof value }
          );
        }
        if (value.length === 0) {
          throw new ValidationError(
            "Empty prompt",
            { field: "prompt", value }
          );
        }
        if (value.length > 1000) {
          throw new ValidationError(
            "Prompt too long",
            { 
              field: "prompt",
              length: value.length,
              maxLength: 1000
            }
          );
        }
      },
      
      num_inference_steps: (value: any) => {
        if (!Number.isInteger(value)) {
          throw new ValidationError(
            "Invalid inference steps",
            {
              field: "num_inference_steps",
              value,
              expected: "integer"
            }
          );
        }
        if (value < 1 || value > 150) {
          throw new ValidationError(
            "Inference steps out of range",
            {
              field: "num_inference_steps",
              value,
              range: [1, 150]
            }
          );
        }
      }
    };

    // Validate each field
    Object.entries(input).forEach(([key, value]) => {
      if (validators[key]) {
        validators[key](value);
      }
    });
  }
}
```

## Advanced Debugging

### 1. Enhanced Logging

```typescript
class Logger {
  private static instance: Logger;
  private logLevel: string;
  private logFile: string;

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  log(
    level: string,
    message: string,
    context: Record<string, any> = {}
  ): void {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      context,
      environment: process.env.NODE_ENV,
      processId: process.pid,
      threadId: process.threadId
    };

    // Log to console with colors
    const colors = {
      error: "\x1b[31m",
      warn: "\x1b[33m",
      info: "\x1b[36m",
      debug: "\x1b[90m"
    };

    console.log(
      `${colors[level] || ""}[${entry.timestamp}] ${level.toUpperCase()}: ${message}\x1b[0m`,
      context
    );

    // Log to file if configured
    if (this.logFile) {
      fs.appendFileSync(
        this.logFile,
        JSON.stringify(entry) + "\n"
      );
    }
  }
}
```

### 2. Request Tracing

```typescript
class RequestTracer {
  private static traces: Map<string, Trace> = new Map();

  static startTrace(operationName: string): string {
    const traceId = crypto.randomUUID();
    this.traces.set(traceId, {
      operationName,
      startTime: Date.now(),
      events: [],
      context: {}
    });
    return traceId;
  }

  static addEvent(
    traceId: string,
    event: string,
    context: Record<string, any> = {}
  ): void {
    const trace = this.traces.get(traceId);
    if (trace) {
      trace.events.push({
        timestamp: Date.now(),
        event,
        context
      });
    }
  }

  static endTrace(traceId: string): TraceReport {
    const trace = this.traces.get(traceId);
    if (!trace) {
      throw new Error(`Trace not found: ${traceId}`);
    }

    const duration = Date.now() - trace.startTime;
    const report = {
      traceId,
      operation: trace.operationName,
      duration,
      events: trace.events,
      context: trace.context
    };

    this.traces.delete(traceId);
    return report;
  }
}
```

### 3. Performance Monitoring

```typescript
class PerformanceMonitor {
  private metrics: {
    requestCount: number;
    errorCount: number;
    averageResponseTime: number;
    responseTimeHistory: number[];
    memoryUsage: number[];
    cpuUsage: number[];
  };

  recordMetrics(operation: string, duration: number, success: boolean): void {
    this.metrics.requestCount++;
    if (!success) this.metrics.errorCount++;
    
    this.metrics.responseTimeHistory.push(duration);
    this.metrics.averageResponseTime = this.calculateAverage(
      this.metrics.responseTimeHistory
    );

    this.metrics.memoryUsage.push(process.memoryUsage().heapUsed);
    this.metrics.cpuUsage.push(process.cpuUsage().user);
  }

  getMetricsReport(): PerformanceReport {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      analysis: this.analyzeMetrics()
    };
  }
}
```

## Best Practices

1. **Error Handling**
   ```typescript
   try {
     await operation();
   } catch (error) {
     // Generate detailed error report
     const report = ErrorHandler.createErrorReport(error);
     
     // Log error with context
     Logger.getInstance().log("error", error.message, report);
     
     // Handle specific error types
     if (error instanceof ValidationError) {
       // Handle validation errors
     } else if (error instanceof NetworkError) {
       // Handle network errors
     } else if (error instanceof RateLimitExceeded) {
       // Handle rate limiting
     }
   }
   ```

2. **Monitoring**
   ```typescript
   const monitor = new PerformanceMonitor();
   const tracer = new RequestTracer();

   async function monitoredOperation() {
     const traceId = tracer.startTrace("operation");
     const startTime = Date.now();
     
     try {
       const result = await operation();
       monitor.recordMetrics(
         "operation",
         Date.now() - startTime,
         true
       );
       return result;
     } catch (error) {
       monitor.recordMetrics(
         "operation",
         Date.now() - startTime,
         false
       );
       throw error;
     } finally {
       tracer.endTrace(traceId);
     }
   }
   ```

3. **Validation**
   ```typescript
   class InputValidator {
     static validate(input: any, schema: ValidationSchema): void {
       const result = schema.validate(input);
       if (!result.success) {
         throw new ValidationError(
           "Input validation failed",
           {
             errors: result.errors,
             input: input
           }
         );
       }
     }
   }
   ```

## Getting Help

If you're experiencing issues:

1. Check error reports and logs:
   ```typescript
   const errorReport = ErrorHandler.createErrorReport(error);
   console.error(JSON.stringify(errorReport, null, 2));
   ```

2. Generate a diagnostic report:
   ```typescript
   const diagnostics = {
     error: ErrorHandler.createErrorReport(error),
     metrics: performanceMonitor.getMetricsReport(),
     traces: RequestTracer.getActiveTraces(),
     environment: {
       nodeVersion: process.version,
       platform: process.platform,
       arch: process.arch,
       env: process.env.NODE_ENV
     }
   };
   ```

3. Contact support with detailed information:
   - Error reports
   - Trace logs
   - Performance metrics
   - Environment details

4. Resources:
   - [GitHub Issues](https://github.com/your-repo/issues)
   - [API Documentation](https://replicate.com/docs)
   - [Discord Community](https://discord.gg/replicate)
   - [Support Email](mailto:support@replicate.com)

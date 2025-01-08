# Troubleshooting Guide

This guide helps you diagnose and resolve common issues with the Replicate MCP Server.

## Common Issues

### 1. Authentication Issues

#### Symptoms
- "Invalid API token" errors
- 401 Unauthorized responses
- Authentication-related webhook failures

#### Solutions
1. Verify API Token
```typescript
// Check token is set
if (!process.env.REPLICATE_API_TOKEN) {
  throw new Error("Missing API token");
}

// Verify token format
if (!/^r8_[a-zA-Z0-9]{40}$/.test(process.env.REPLICATE_API_TOKEN)) {
  throw new Error("Invalid token format");
}
```

2. Check Environment Variables
```bash
# Check if token is set
echo $REPLICATE_API_TOKEN

# Set token if missing
export REPLICATE_API_TOKEN=your_token_here
```

3. Verify Token Validity
```typescript
try {
  await client.listModels({ limit: 1 });
  console.log("Token is valid");
} catch (error) {
  console.error("Token validation failed:", error.message);
}
```

### 2. Rate Limiting Issues

#### Symptoms
- 429 Too Many Requests errors
- Delayed responses
- Failed predictions

#### Solutions
1. Implement Rate Limiting
```typescript
class RateLimiter {
  private requests: number = 0;
  private resetTime: number = Date.now() + 60000;

  async checkLimit(): Promise<boolean> {
    if (Date.now() > this.resetTime) {
      this.requests = 0;
      this.resetTime = Date.now() + 60000;
    }
    
    if (this.requests >= 50) {
      return false;
    }
    
    this.requests++;
    return true;
  }
}
```

2. Use Exponential Backoff
```typescript
async function withBackoff<T>(
  operation: () => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (error.code !== "RateLimitExceeded" || attempt === maxRetries - 1) {
        throw error;
      }
      await new Promise(resolve => 
        setTimeout(resolve, Math.pow(2, attempt) * 1000)
      );
    }
  }
  throw new Error("Max retries exceeded");
}
```

### 3. Webhook Delivery Issues

#### Symptoms
- Missing webhook notifications
- Failed deliveries
- Timeout errors

#### Solutions
1. Check Webhook URL
```typescript
function validateWebhookUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
```

2. Verify Webhook Server
```typescript
async function checkWebhookEndpoint(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "HEAD",
      timeout: 5000
    });
    return response.ok;
  } catch {
    return false;
  }
}
```

3. Monitor Webhook Status
```typescript
async function monitorWebhooks(prediction_id: string) {
  const prediction = await client.getPrediction({ prediction_id });
  console.log("Webhook status:", {
    completed: prediction.webhook_completed,
    lastAttempt: prediction.webhook_last_attempt,
    error: prediction.webhook_error
  });
}
```

### 4. Prediction Failures

#### Symptoms
- Failed predictions
- Unexpected outputs
- Timeout errors

#### Solutions
1. Validate Input Parameters
```typescript
function validatePredictionInput(input: any): boolean {
  // Check required fields
  if (!input.prompt) {
    throw new Error("Missing required field: prompt");
  }

  // Validate parameter types
  if (input.num_inference_steps && 
      !Number.isInteger(input.num_inference_steps)) {
    throw new Error("num_inference_steps must be an integer");
  }

  // Check value ranges
  if (input.guidance_scale && 
      (input.guidance_scale < 1 || input.guidance_scale > 20)) {
    throw new Error("guidance_scale must be between 1 and 20");
  }

  return true;
}
```

2. Monitor Prediction Status
```typescript
async function monitorPrediction(prediction_id: string) {
  const prediction = await client.getPrediction({ prediction_id });
  console.log("Prediction status:", {
    status: prediction.status,
    startTime: prediction.started_at,
    error: prediction.error
  });
}
```

### 5. Performance Issues

#### Symptoms
- Slow responses
- High memory usage
- Connection timeouts

#### Solutions
1. Enable Caching
```typescript
class Cache {
  private cache: Map<string, any> = new Map();
  private ttl: number;

  constructor(ttlSeconds: number = 300) {
    this.ttl = ttlSeconds * 1000;
  }

  set(key: string, value: any): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
  }

  get(key: string): any {
    const item = this.cache.get(key);
    if (!item) return null;
    
    if (Date.now() - item.timestamp > this.ttl) {
      this.cache.delete(key);
      return null;
    }
    
    return item.value;
  }
}
```

2. Implement Connection Pooling
```typescript
class ConnectionPool {
  private pool: Set<any> = new Set();
  private maxSize: number;

  constructor(maxSize: number = 10) {
    this.maxSize = maxSize;
  }

  async acquire(): Promise<any> {
    if (this.pool.size >= this.maxSize) {
      await new Promise(resolve => 
        setTimeout(resolve, 100)
      );
      return this.acquire();
    }
    
    const connection = await this.createConnection();
    this.pool.add(connection);
    return connection;
  }

  release(connection: any): void {
    this.pool.delete(connection);
  }
}
```

## Debugging Tools

### 1. Logging

```typescript
const logger = {
  debug: (message: string, ...args: any[]) => {
    console.debug(`[DEBUG] ${message}`, ...args);
  },
  info: (message: string, ...args: any[]) => {
    console.info(`[INFO] ${message}`, ...args);
  },
  error: (message: string, ...args: any[]) => {
    console.error(`[ERROR] ${message}`, ...args);
  }
};
```

### 2. Request Tracing

```typescript
async function traceRequest<T>(
  operation: () => Promise<T>,
  context: string
): Promise<T> {
  const startTime = Date.now();
  try {
    const result = await operation();
    logger.info(`${context} completed in ${Date.now() - startTime}ms`);
    return result;
  } catch (error) {
    logger.error(`${context} failed after ${Date.now() - startTime}ms`, error);
    throw error;
  }
}
```

### 3. Health Checks

```typescript
async function checkHealth(): Promise<boolean> {
  try {
    // Check API connectivity
    await client.listModels({ limit: 1 });
    
    // Check webhook endpoint
    if (config.webhook_url) {
      await checkWebhookEndpoint(config.webhook_url);
    }
    
    // Check cache
    cache.set("health_check", true);
    if (!cache.get("health_check")) {
      throw new Error("Cache check failed");
    }
    
    return true;
  } catch (error) {
    logger.error("Health check failed:", error);
    return false;
  }
}
```

## Best Practices

1. **Error Handling**
   - Implement proper error boundaries
   - Use typed errors for better debugging
   - Log errors with context
   - Handle edge cases

2. **Monitoring**
   - Track API response times
   - Monitor webhook delivery rates
   - Watch resource usage
   - Set up alerts for failures

3. **Performance**
   - Use caching appropriately
   - Implement connection pooling
   - Optimize resource usage
   - Monitor memory leaks

4. **Security**
   - Keep API tokens secure
   - Validate all inputs
   - Use HTTPS for webhooks
   - Implement rate limiting

## Common Error Codes

| Code | Description | Solution |
|------|-------------|----------|
| 401 | Unauthorized | Check API token |
| 404 | Not Found | Verify resource exists |
| 429 | Rate Limited | Implement backoff |
| 500 | Server Error | Retry with backoff |
| 503 | Service Unavailable | Check service status |

## Getting Help

If you're still experiencing issues:

1. Check the [GitHub issues](https://github.com/your-repo/issues)
2. Review the [API documentation](https://replicate.com/docs)
3. Join the [Discord community](https://discord.gg/replicate)
4. Contact [support@replicate.com](mailto:support@replicate.com)

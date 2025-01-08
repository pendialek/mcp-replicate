# Replicate MCP Server Usage Examples

This document provides practical examples of common use cases for the Replicate MCP server.

## Basic Usage

### Generating Images with Text

```typescript
// Create a prediction with SDXL
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A serene mountain landscape at sunset",
    quality: "balanced",
    style: "photographic"
  }
});

// Get prediction status
const status = await client.getPrediction({
  prediction_id: prediction.id
});

// Cancel a running prediction if needed
await client.cancelPrediction({
  prediction_id: prediction.id
});
```

### Browsing Models

```typescript
// List all models
const models = await client.listModels({});

// Filter models by owner
const stabilityModels = await client.listModels({
  owner: "stability-ai"
});

// Search for specific models
const searchResults = await client.searchModels({
  query: "text to image models with good quality"
});
```

### Working with Collections

```typescript
// List available collections
const collections = await client.listCollections({});

// Get details of a specific collection
const textToImage = await client.getCollection({
  slug: "text-to-image"
});

// Browse models in a collection
const collectionModels = textToImage.models;
```

## Advanced Usage

### Using Templates

```typescript
// Using quality templates
const highQualityPrediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A futuristic cityscape",
    ...templates.quality.extreme,
    ...templates.style.cinematic,
    ...templates.size.widescreen
  }
});
```

### Webhook Integration

```typescript
// Create prediction with webhook notification
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "An abstract digital artwork"
  },
  webhook_url: "https://api.myapp.com/webhooks/replicate"
});

// Example webhook handler (Express.js)
app.post("/webhooks/replicate", (req, res) => {
  const signature = req.headers["x-replicate-signature"];
  if (!verifyWebhookSignature(signature, webhookSecret, req.body)) {
    return res.status(401).send("Invalid signature");
  }

  const { event, prediction } = req.body;
  switch (event) {
    case "prediction.completed":
      handleCompletedPrediction(prediction);
      break;
    case "prediction.failed":
      handleFailedPrediction(prediction);
      break;
  }

  res.status(200).send("OK");
});
```

### Error Handling

```typescript
try {
  const prediction = await client.createPrediction({
    version: "invalid-model@latest",
    input: { prompt: "Test" }
  });
} catch (error) {
  if (error.code === "ResourceNotFound") {
    console.error("Model not found");
  } else if (error.code === "RateLimitExceeded") {
    const retryAfter = error.data.retryAfter;
    console.error(`Rate limit exceeded. Try again in ${retryAfter} seconds`);
  } else {
    console.error("Unexpected error:", error.message);
  }
}
```

### Real-time Updates with SSE

```typescript
// Subscribe to prediction updates
const subscription = client.subscribe(`replicate-prediction://${prediction.id}`);

subscription.on("update", (update) => {
  console.log("Prediction status:", update.status);
  if (update.output) {
    console.log("Generated image URL:", update.output.image);
  }
});

subscription.on("error", (error) => {
  console.error("Subscription error:", error);
});

// Cleanup when done
subscription.unsubscribe();
```

### Batch Processing

```typescript
// Create multiple predictions
async function batchProcess(prompts: string[]) {
  const predictions = await Promise.all(
    prompts.map(prompt =>
      client.createPrediction({
        version: "stability-ai/sdxl@latest",
        input: { prompt }
      })
    )
  );

  // Monitor all predictions
  return Promise.all(
    predictions.map(prediction =>
      client.getPrediction({ prediction_id: prediction.id })
    )
  );
}

// Usage
const prompts = [
  "A serene beach at sunset",
  "A mystical forest with glowing mushrooms",
  "A futuristic space station"
];

const results = await batchProcess(prompts);
```

### Rate Limit Handling

```typescript
// Implement exponential backoff
async function withRetry<T>(
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
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error("Max retries exceeded");
}

// Usage
const prediction = await withRetry(() =>
  client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "Test prompt" }
  })
);
```

## Best Practices

1. Always handle errors appropriately:
   - Check for rate limits
   - Validate inputs before sending
   - Implement retry logic for transient failures

2. Use templates for consistent results:
   - Leverage quality presets for different use cases
   - Use style templates for consistent aesthetics
   - Apply size templates for standard dimensions

3. Implement webhook security:
   - Verify webhook signatures
   - Use HTTPS endpoints
   - Implement retry logic for failed deliveries

4. Monitor prediction status:
   - Subscribe to real-time updates when possible
   - Implement timeouts for long-running predictions
   - Handle failed predictions gracefully

5. Optimize resource usage:
   - Batch similar requests when possible
   - Implement caching where appropriate
   - Clean up subscriptions when no longer needed

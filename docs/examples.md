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
// List all models (uses caching)
const models = await client.listModels({});

// Filter models by owner (cached by owner)
const stabilityModels = await client.listModels({
  owner: "stability-ai"
});

// Search for specific models (cached by query)
const searchResults = await client.searchModels({
  query: "text to image models with good quality"
});
```

### Working with Collections

```typescript
// List available collections (cached)
const collections = await client.listCollections({});

// Get details of a specific collection (cached by slug)
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
app.post("/webhooks/replicate", async (req, res) => {
  try {
    const signature = req.headers["x-replicate-signature"];
    const webhookSecret = await client.getWebhookSecret();
    
    if (!verifyWebhookSignature(signature, webhookSecret, req.body)) {
      throw new ValidationError("Invalid signature");
    }

    const { event, prediction } = req.body;
    switch (event) {
      case "prediction.completed":
        await handleCompletedPrediction(prediction);
        break;
      case "prediction.failed":
        await handleFailedPrediction(prediction);
        break;
    }

    res.status(200).send("OK");
  } catch (error) {
    console.error(ErrorHandler.createErrorReport(error));
    res.status(error instanceof ValidationError ? 401 : 500).json({
      error: error.message,
      code: error.name
    });
  }
});
```

### Error Handling

```typescript
try {
  const prediction = await client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "Test prompt" }
  });
} catch (error) {
  if (error instanceof ReplicateError) {
    console.error(error.message);
    // Optional: access additional context if available
    if (error.context) {
      console.error("Error context:", error.context);
    }
  } else {
    console.error("Unexpected error:", error);
  }
}
```

### Automatic Retries

```typescript
// Using the built-in retry functionality
const result = await ErrorHandler.withRetries(
  async () => client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "A test image" }
  }),
  {
    maxAttempts: 3,
    minDelay: 1000,
    maxDelay: 10000,
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

### Handling Common Errors

```typescript
try {
  const prediction = await client.createPrediction({
    version: "stability-ai/sdxl@latest",
    input: { prompt: "Test prompt" }
  });
} catch (error) {
  if (error instanceof ReplicateError) {
    switch (error.message) {
      case "Rate limit exceeded":
        const retryAfter = error.context?.retryAfter;
        console.log(`Rate limit hit. Retry after ${retryAfter} seconds`);
        break;
      case "Authentication failed":
        console.log("Please check your API token");
        break;
      case "Model not found":
        console.log(`Model ${error.context?.resource} not found`);
        break;
      case "Invalid input parameters":
        console.log(`Invalid input: ${error.context?.field} - ${error.context?.message}`);
        break;
      default:
        console.log("Operation failed:", error.message);
    }
  }
}
```

### Batch Processing

```typescript
// Batch processing example
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
      client.getPredictionStatus(prediction.id)
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

## Best Practices

1. Use proper error handling:
   ```typescript
   try {
     // Your code here
   } catch (error) {
     if (error instanceof ReplicateError) {
       console.error(error.message);
     } else {
       console.error("Unexpected error:", error);
     }
   }
   ```

2. Implement proper retry logic:
   ```typescript
   let attempts = 0;
   const maxAttempts = 3;
   
   while (attempts < maxAttempts) {
     try {
       const result = await makeRequest();
       break;
     } catch (error) {
       attempts++;
       if (attempts === maxAttempts) throw error;
       await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
     }
   }
   ```

3. Use webhooks effectively:
   ```typescript
   // Create prediction with webhook notification
   const prediction = await client.createPrediction({
     version: "stability-ai/sdxl@latest",
     input: {
       prompt: "An abstract digital artwork"
     },
     webhook_url: "https://api.myapp.com/webhooks/replicate"
   });
   ```

4. Handle rate limits gracefully:
   ```typescript
   try {
     await makeRequest();
   } catch (error) {
     if (error.message.includes("rate limit")) {
       console.log("Rate limit hit. Please try again later.");
     }
   }
   ```

5. Clean up resources:
   ```typescript
   try {
     // Use API
     await makeRequest();
   } catch (error) {
     // Handle errors
     console.error(error);
   }
   ```

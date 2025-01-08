/**
 * Handlers for MCP tools.
 */

import type { ReplicateClient } from "../replicate_client.js";
import type { Model } from "../models/model.js";
import type { ModelIO, Prediction } from "../models/prediction.js";
import type { Collection } from "../models/collection.js";

/**
 * Cache for models, predictions, and collections.
 */
interface Cache {
  modelCache: Map<string, Model>;
  predictionCache: Map<string, Prediction>;
  collectionCache: Map<string, Collection>;
}

/**
 * Get error message from unknown error.
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * Handle the search_models tool.
 */
export async function handleSearchModels(
  client: ReplicateClient,
  cache: Cache,
  args: { query: string }
) {
  try {
    const result = await client.searchModels(args.query);

    // Update cache
    for (const model of result.models) {
      cache.modelCache.set(`${model.owner}/${model.name}`, model);
    }

    return {
      content: [
        {
          type: "text",
          text: `Found ${result.models.length} models matching "${args.query}":`,
        },
        ...result.models.map((model) => ({
          type: "text" as const,
          text: `- ${model.owner}/${model.name}: ${
            model.description || "No description"
          }`,
        })),
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error searching models: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the list_models tool.
 */
export async function handleListModels(
  client: ReplicateClient,
  cache: Cache,
  args: { owner?: string; cursor?: string }
) {
  try {
    const result = await client.listModels(args);

    // Update cache
    for (const model of result.models) {
      cache.modelCache.set(`${model.owner}/${model.name}`, model);
    }

    return {
      content: [
        {
          type: "text",
          text: args.owner ? `Models by ${args.owner}:` : "Available models:",
        },
        ...result.models.map((model) => ({
          type: "text" as const,
          text: `- ${model.owner}/${model.name}: ${
            model.description || "No description"
          }`,
        })),
        result.next_cursor
          ? {
              type: "text" as const,
              text: `\nUse cursor "${result.next_cursor}" to see more results.`,
            }
          : null,
      ].filter(Boolean),
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error listing models: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the list_collections tool.
 */
export async function handleListCollections(
  client: ReplicateClient,
  cache: Cache,
  args: { cursor?: string }
) {
  try {
    const result = await client.listCollections(args);

    // Update cache
    for (const collection of result.collections) {
      cache.collectionCache.set(collection.slug, collection);
    }

    return {
      content: [
        {
          type: "text",
          text: "Available collections:",
        },
        ...result.collections.map((collection: Collection) => ({
          type: "text" as const,
          text: `- ${collection.name}: ${
            collection.description || `A collection of ${collection.models.length} models`
          }`,
        })),
        result.next_cursor
          ? {
              type: "text" as const,
              text: `\nUse cursor "${result.next_cursor}" to see more results.`,
            }
          : null,
      ].filter(Boolean),
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error listing collections: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the get_collection tool.
 */
export async function handleGetCollection(
  client: ReplicateClient,
  cache: Cache,
  args: { slug: string }
) {
  try {
    const collection = await client.getCollection(args.slug);

    // Update cache
    cache.collectionCache.set(collection.slug, collection);

    return {
      content: [
        {
          type: "text",
          text: `Collection: ${collection.name}`,
        },
        collection.description
          ? {
              type: "text" as const,
              text: collection.description,
            }
          : null,
        {
          type: "text",
          text: "\nModels in this collection:",
        },
        ...collection.models.map((model: Model) => ({
          type: "text" as const,
          text: `- ${model.owner}/${model.name}: ${
            model.description || "No description"
          }`,
        })),
      ].filter(Boolean),
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error getting collection: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the create_prediction tool.
 */
export async function handleCreatePrediction(
  client: ReplicateClient,
  cache: Cache,
  args: { version: string; input: ModelIO; webhook?: string }
) {
  try {
    const prediction = await client.createPrediction(args);

    // Cache the prediction
    cache.predictionCache.set(prediction.id, prediction);

    return {
      content: [
        {
          type: "text",
          text: `Created prediction ${prediction.id}`,
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error creating prediction: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the cancel_prediction tool.
 */
export async function handleCancelPrediction(
  client: ReplicateClient,
  cache: Cache,
  args: { prediction_id: string }
) {
  try {
    const prediction = await client.cancelPrediction(args.prediction_id);

    // Update cache
    cache.predictionCache.set(prediction.id, prediction);

    return {
      content: [
        {
          type: "text",
          text: `Cancelled prediction ${prediction.id}`,
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error cancelling prediction: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the get_prediction tool.
 */
export async function handleGetPrediction(
  client: ReplicateClient,
  cache: Cache,
  args: { prediction_id: string }
) {
  try {
    const prediction = await client.getPredictionStatus(args.prediction_id);

    // Update cache
    cache.predictionCache.set(prediction.id, prediction);

    return {
      content: [
        {
          type: "text",
          text: `Prediction ${prediction.id}:`,
        },
        {
          type: "json",
          json: prediction,
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error getting prediction: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the list_predictions tool.
 */
export async function handleListPredictions(
  client: ReplicateClient,
  cache: Cache,
  args: { limit?: number; cursor?: string }
) {
  try {
    const predictions = await client.listPredictions({
      limit: args.limit || 10,
    });

    // Update cache
    for (const prediction of predictions) {
      cache.predictionCache.set(prediction.id, prediction);
    }

    return {
      content: [
        {
          type: "text",
          text: `Found ${predictions.length} predictions:`,
        },
        {
          type: "json",
          json: predictions,
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error listing predictions: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
} 

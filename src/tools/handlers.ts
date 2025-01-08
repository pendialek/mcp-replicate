/**
 * Handlers for MCP tools.
 */

import type { ReplicateClient } from "../replicate_client.js";
import type { Model } from "../models/model.js";
import type {
  ModelIO,
  Prediction,
  PredictionStatus,
} from "../models/prediction.js";
import type { Collection } from "../models/collection.js";
import type { SSEServerTransport } from "../transport/sse.js";
import {
  createPredictionStatusNotification,
  createPredictionErrorNotification,
  createPredictionProgressNotification,
} from "../models/notification.js";

/**
 * Cache for models, predictions, and collections.
 */
interface Cache {
  modelCache: Map<string, Model>;
  predictionCache: Map<string, Prediction>;
  collectionCache: Map<string, Collection>;
  predictionStatus: Map<string, PredictionStatus>;
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
          text: `- ${collection.name} (slug: ${collection.slug}): ${
            collection.description ||
            `A collection of ${collection.models.length} models`
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
  transport: SSEServerTransport,
  args: { version: string; input: ModelIO | string; webhook?: string }
) {
  try {
    // If input is a string, wrap it in an object with 'text' property
    const input =
      typeof args.input === "string" ? { text: args.input } : args.input;

    const prediction = await client.createPrediction({
      ...args,
      input,
    });

    // Cache the prediction and its initial status
    cache.predictionCache.set(prediction.id, prediction);
    cache.predictionStatus.set(prediction.id, prediction.status);

    // Send initial status notification
    await transport.notify(
      createPredictionStatusNotification(prediction, "starting")
    );

    // Start polling for updates
    const pollInterval = setInterval(async () => {
      try {
        const updatedPrediction = await client.getPredictionStatus(
          prediction.id
        );
        const previousStatus = cache.predictionStatus.get(prediction.id);

        // Update cache
        cache.predictionCache.set(updatedPrediction.id, updatedPrediction);

        // Check for status changes
        if (previousStatus && updatedPrediction.status !== previousStatus) {
          cache.predictionStatus.set(
            updatedPrediction.id,
            updatedPrediction.status
          );
          await transport.notify(
            createPredictionStatusNotification(
              updatedPrediction,
              previousStatus
            )
          );

          // Send progress notification if processing
          if (updatedPrediction.status === "processing") {
            const progress = estimateProgress(updatedPrediction);
            await transport.notify(
              createPredictionProgressNotification(updatedPrediction, progress)
            );
          }

          // Stop polling if in terminal state
          if (
            updatedPrediction.status === "succeeded" ||
            updatedPrediction.status === "failed" ||
            updatedPrediction.status === "canceled"
          ) {
            clearInterval(pollInterval);

            // Send error notification if failed
            if (
              updatedPrediction.status === "failed" &&
              updatedPrediction.error
            ) {
              await transport.notify(
                createPredictionErrorNotification(
                  updatedPrediction,
                  updatedPrediction.error
                )
              );
            }
          }
        }
      } catch (error) {
        console.error("Error polling prediction status:", error);
      }
    }, 1000); // Poll every second

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
  transport: SSEServerTransport,
  args: { prediction_id: string }
) {
  try {
    const prediction = await client.cancelPrediction(args.prediction_id);

    const previousStatus = cache.predictionStatus.get(prediction.id);

    // Update cache
    cache.predictionCache.set(prediction.id, prediction);
    cache.predictionStatus.set(prediction.id, prediction.status);

    // Send status notification
    if (previousStatus) {
      await transport.notify(
        createPredictionStatusNotification(prediction, previousStatus)
      );
    }

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
 * Handle the get_model tool.
 */
export async function handleGetModel(
  client: ReplicateClient,
  cache: Cache,
  args: { owner: string; name: string }
) {
  try {
    const model = await client.getModel(args.owner, args.name);

    // Update cache
    cache.modelCache.set(`${model.owner}/${model.name}`, model);

    return {
      content: [
        {
          type: "text",
          text: `Model: ${model.owner}/${model.name}`,
        },
        model.description
          ? {
              type: "text" as const,
              text: `\nDescription: ${model.description}`,
            }
          : null,
        {
          type: "text",
          text: "\nLatest version:",
        },
        model.latest_version
          ? {
              type: "text" as const,
              text: `ID: ${model.latest_version.id}\nCreated: ${model.latest_version.created_at}`,
            }
          : {
              type: "text" as const,
              text: "No versions available",
            },
      ].filter(Boolean),
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Error getting model: ${getErrorMessage(error)}`,
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
  transport: SSEServerTransport,
  args: { prediction_id: string }
) {
  try {
    const prediction = await client.getPredictionStatus(args.prediction_id);

    const previousStatus = cache.predictionStatus.get(prediction.id);

    // Update cache
    cache.predictionCache.set(prediction.id, prediction);
    cache.predictionStatus.set(prediction.id, prediction.status);

    // Send status notification if changed
    if (previousStatus && prediction.status !== previousStatus) {
      await transport.notify(
        createPredictionStatusNotification(prediction, previousStatus)
      );

      // Send error notification if failed
      if (prediction.status === "failed" && prediction.error) {
        await transport.notify(
          createPredictionErrorNotification(prediction, prediction.error)
        );
      }
    }

    return {
      content: [
        {
          type: "text",
          text: `Prediction ${prediction.id}:`,
        },
        {
          type: "text",
          text: `Status: ${prediction.status}\nModel version: ${prediction.version}\nCreated: ${prediction.created_at}`,
        },
        prediction.input
          ? {
              type: "text" as const,
              text: `\nInput:\n${JSON.stringify(prediction.input, null, 2)}`,
            }
          : null,
        prediction.output
          ? {
              type: "text" as const,
              text: `\nOutput:\n${JSON.stringify(prediction.output, null, 2)}`,
            }
          : null,
        prediction.error
          ? {
              type: "text" as const,
              text: `\nError: ${prediction.error}`,
            }
          : null,
        prediction.logs
          ? {
              type: "text" as const,
              text: `\nLogs:\n${prediction.logs}`,
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
          text: `Error getting prediction: ${getErrorMessage(error)}`,
        },
      ],
    };
  }
}

/**
 * Handle the list_predictions tool.
 */
/**
 * Estimate prediction progress based on logs and status.
 */
function estimateProgress(prediction: Prediction): number {
  if (prediction.status === "succeeded") return 100;
  if (prediction.status === "failed" || prediction.status === "canceled")
    return 0;
  if (prediction.status === "starting") return 0;

  // Try to parse progress from logs
  if (prediction.logs) {
    const match = prediction.logs.match(/progress: (\d+)%/);
    if (match) {
      return Number.parseInt(match[1], 10);
    }
  }

  // Default to 50% if processing but no specific progress info
  return prediction.status === "processing" ? 50 : 0;
}

export async function handleListPredictions(
  client: ReplicateClient,
  cache: Cache,
  transport: SSEServerTransport,
  args: { limit?: number; cursor?: string }
) {
  try {
    const predictions = await client.listPredictions({
      limit: args.limit || 10,
    });

    // Update cache and status tracking
    for (const prediction of predictions) {
      const previousStatus = cache.predictionStatus.get(prediction.id);
      cache.predictionCache.set(prediction.id, prediction);
      cache.predictionStatus.set(prediction.id, prediction.status);

      // Send notifications for status changes
      if (previousStatus && prediction.status !== previousStatus) {
        await transport.notify(
          createPredictionStatusNotification(prediction, previousStatus)
        );

        if (prediction.status === "failed" && prediction.error) {
          await transport.notify(
            createPredictionErrorNotification(prediction, prediction.error)
          );
        }
      }
    }

    // Format predictions as text
    const predictionTexts = predictions.map((prediction) => {
      const status = prediction.status.toUpperCase();
      const model = prediction.version;
      const time = new Date(prediction.created_at).toLocaleString();
      return `- ID: ${prediction.id}\n  Status: ${status}\n  Model: ${model}\n  Created: ${time}`;
    });

    return {
      content: [
        {
          type: "text",
          text: `Found ${predictions.length} predictions:`,
        },
        {
          type: "text",
          text: predictionTexts.join("\n\n"),
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

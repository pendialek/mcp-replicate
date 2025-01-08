#!/usr/bin/env node

/**
 * MCP server implementation for Replicate.
 * Provides access to Replicate models and predictions through MCP.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { ReplicateClient } from "./replicate_client.js";
import type { Model } from "./models/model.js";
import type {
  Prediction,
  ModelIO,
  PredictionStatus,
} from "./models/prediction.js";
import type { Collection } from "./models/collection.js";
import { SSEServerTransport } from "./transport/sse.js";

import { tools } from "./tools/index.js";
import {
  handleSearchModels,
  handleListModels,
  handleListCollections,
  handleGetCollection,
  handleCreatePrediction,
  handleCancelPrediction,
  handleGetPrediction,
  handleListPredictions,
  handleGetModel,
} from "./tools/handlers.js";

// Initialize Replicate client
const client = new ReplicateClient();

// Cache for models, predictions, collections, and prediction status
const modelCache = new Map<string, Model>();
const predictionCache = new Map<string, Prediction>();
const collectionCache = new Map<string, Collection>();
const predictionStatus = new Map<string, PredictionStatus>();

// Cache object for tool handlers
const cache = {
  modelCache,
  predictionCache,
  collectionCache,
  predictionStatus,
};

// Initialize SSE transport
const sseTransport = new SSEServerTransport();

/**
 * Create an MCP server with capabilities for resources (models and predictions),
 * tools (to run predictions), and prompts (for model selection).
 */
const server = new Server(
  {
    name: "replicate",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {
        schemes: [
          "replicate-model://",
          "replicate-prediction://",
          "replicate-collection://",
        ],
      },
      tools: {},
      prompts: {},
    },
  }
);

/**
 * Handler for listing available models, predictions, and collections as resources.
 * Each model is exposed as a resource with:
 * - A replicate-model:// URI scheme
 * - application/json MIME type
 * - Human readable name and description
 *
 * Each prediction is exposed as a resource with:
 * - A replicate-prediction:// URI scheme
 * - application/json MIME type
 * - Human readable name and description
 *
 * Each collection is exposed as a resource with:
 * - A replicate-collection:// URI scheme
 * - application/json MIME type
 * - Human readable name and description
 */
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  // Get models from Replicate
  const modelList = await client.listModels();

  // Cache models for later use
  for (const model of modelList.models) {
    modelCache.set(`${model.owner}/${model.name}`, model);
  }

  // Get recent predictions
  const predictions = await client.listPredictions({ limit: 10 });

  // Cache predictions for later use
  for (const prediction of predictions) {
    predictionCache.set(prediction.id, prediction);
  }

  // Get collections
  const collectionList = await client.listCollections();

  // Cache collections for later use
  for (const collection of collectionList.collections) {
    collectionCache.set(collection.slug, collection);
  }

  // Convert models to resources
  const modelResources = modelList.models.map((model: Model) => ({
    uri: `replicate-model://${model.owner}/${model.name}`,
    mimeType: "application/json",
    name: `${model.owner}/${model.name}`,
    description: model.description || `A model by ${model.owner}`,
  }));

  // Convert predictions to resources
  const predictionResources = predictions.map((prediction: Prediction) => ({
    uri: `replicate-prediction://${prediction.id}`,
    mimeType: "application/json",
    name: `Prediction ${prediction.id}`,
    description: `A prediction using model version ${prediction.version}`,
  }));

  // Convert collections to resources
  const collectionResources = collectionList.collections.map(
    (collection: Collection) => ({
      uri: `replicate-collection://${collection.slug}`,
      mimeType: "application/json",
      name: collection.name,
      description:
        collection.description ||
        `A collection of ${collection.models.length} models`,
    })
  );

  return {
    resources: [
      ...modelResources,
      ...predictionResources,
      ...collectionResources,
    ],
  };
});

/**
 * Handler for reading model, prediction, and collection details.
 * Takes a replicate-model://, replicate-prediction://, or replicate-collection:// URI
 * and returns the details as JSON.
 */
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const url = new URL(request.params.uri);
  const scheme = url.protocol;
  const path = url.pathname.replace(/^\//, "");

  let content: Model | Prediction | Collection;

  if (scheme === "replicate-model://") {
    // Get model details
    const model = modelCache.get(path);
    if (!model) {
      throw new Error(`Model ${path} not found`);
    }
    content = model;
  } else if (scheme === "replicate-prediction://") {
    // Get prediction details
    const prediction = predictionCache.get(path);
    if (!prediction) {
      throw new Error(`Prediction ${path} not found`);
    }
    content = prediction;
  } else if (scheme === "replicate-collection://") {
    // Get collection details
    const cachedCollection = collectionCache.get(path);
    if (!cachedCollection) {
      // Try to fetch from API if not in cache
      try {
        const collection = await client.getCollection(path);
        if (!collection) {
          throw new Error(`Collection ${path} not found`);
        }
        collectionCache.set(path, collection);
        content = collection;
      } catch (error) {
        throw new Error(`Collection ${path} not found`);
      }
    } else {
      content = cachedCollection;
    }
  } else {
    throw new Error(`Unsupported URI scheme: ${scheme}`);
  }

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(content, null, 2),
      },
    ],
  };
});

/**
 * Handler that lists available tools.
 */
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

/**
 * Handler for tools.
 */
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  switch (request.params.name) {
    case "search_models":
      return handleSearchModels(client, cache, {
        query: String(request.params.arguments?.query),
      });

    case "list_models":
      return handleListModels(client, cache, {
        owner: request.params.arguments?.owner as string | undefined,
        cursor: request.params.arguments?.cursor as string | undefined,
      });

    case "list_collections":
      return handleListCollections(client, cache, {
        cursor: request.params.arguments?.cursor as string | undefined,
      });

    case "get_collection":
      return handleGetCollection(client, cache, {
        slug: String(request.params.arguments?.slug),
      });

    case "create_prediction":
      return handleCreatePrediction(client, cache, sseTransport, {
        version: String(request.params.arguments?.version),
        input: request.params.arguments?.input as ModelIO,
        webhook: request.params.arguments?.webhook_url as string | undefined,
      });

    case "cancel_prediction":
      return handleCancelPrediction(client, cache, sseTransport, {
        prediction_id: String(request.params.arguments?.prediction_id),
      });

    case "get_prediction":
      return handleGetPrediction(client, cache, sseTransport, {
        prediction_id: String(request.params.arguments?.prediction_id),
      });

    case "list_predictions":
      return handleListPredictions(client, cache, sseTransport, {
        limit: request.params.arguments?.limit as number | undefined,
        cursor: request.params.arguments?.cursor as string | undefined,
      });

    case "get_model":
      return handleGetModel(client, cache, {
        owner: String(request.params.arguments?.owner),
        name: String(request.params.arguments?.name),
      });

    default:
      throw new Error("Unknown tool");
  }
});

/**
 * Handler that lists available prompts.
 * Exposes prompts for model selection and parameter suggestions.
 */
server.setRequestHandler(ListPromptsRequestSchema, async () => {
  return {
    prompts: [
      {
        name: "select_model",
        description: "Get help selecting a model for your use case",
      },
      {
        name: "suggest_parameters",
        description: "Get parameter suggestions for a model",
      },
    ],
  };
});

/**
 * Handler for prompts.
 */
server.setRequestHandler(GetPromptRequestSchema, async (request) => {
  switch (request.params.name) {
    case "select_model": {
      // Get all models for context
      const modelList = await client.listModels();
      const modelResources = modelList.models.map((model: Model) => ({
        type: "resource" as const,
        resource: {
          uri: `replicate-model://${model.owner}/${model.name}`,
          mimeType: "application/json",
          text: JSON.stringify(model, null, 2),
        },
      }));

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "I need help selecting a model for my use case. Here are the available models:",
            },
          },
          ...modelResources.map((resource) => ({
            role: "user" as const,
            content: resource,
          })),
          {
            role: "user",
            content: {
              type: "text",
              text: "Please describe your use case and I'll help you select the most appropriate model.",
            },
          },
        ],
      };
    }

    case "suggest_parameters": {
      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: "Please provide the model ID (owner/name) and I'll help you with parameter suggestions.",
            },
          },
        ],
      };
    }

    default:
      throw new Error("Unknown prompt");
  }
});

/**
 * Start the server using stdio transport.
 */
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

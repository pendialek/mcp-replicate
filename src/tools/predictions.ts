/**
 * Tools for managing Replicate predictions.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ReplicateClient } from "../replicate_client.js";
import type { Prediction } from "../models/prediction.js";

/**
 * Tool for creating new predictions.
 */
export const createPredictionTool: Tool = {
  name: "create_prediction",
  description: "Create a new prediction using a model version",
  inputSchema: {
    type: "object",
    properties: {
      version: {
        type: "string",
        description: "Model version ID to use",
      },
      input: {
        type: "object",
        description: "Input parameters for the model",
        additionalProperties: true,
      },
      webhook_url: {
        type: "string",
        description: "Optional webhook URL for notifications",
      },
    },
    required: ["version", "input"],
  },
};

/**
 * Tool for canceling predictions.
 */
export const cancelPredictionTool: Tool = {
  name: "cancel_prediction",
  description: "Cancel a running prediction",
  inputSchema: {
    type: "object",
    properties: {
      prediction_id: {
        type: "string",
        description: "ID of the prediction to cancel",
      },
    },
    required: ["prediction_id"],
  },
};

/**
 * Tool for getting prediction details.
 */
export const getPredictionTool: Tool = {
  name: "get_prediction",
  description: "Get details about a specific prediction",
  inputSchema: {
    type: "object",
    properties: {
      prediction_id: {
        type: "string",
        description: "ID of the prediction to get details for",
      },
    },
    required: ["prediction_id"],
  },
};

/**
 * Tool for listing recent predictions.
 */
export const listPredictionsTool: Tool = {
  name: "list_predictions",
  description: "List recent predictions",
  inputSchema: {
    type: "object",
    properties: {
      limit: {
        type: "number",
        description: "Maximum number of predictions to return",
        default: 10,
      },
      cursor: {
        type: "string",
        description: "Cursor for pagination",
      },
    },
  },
}; 

/**
 * MCP tools for interacting with Replicate.
 */

export * from "./models.js";
export * from "./predictions.js";

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  searchModelsTool,
  listModelsTool,
  listCollectionsTool,
  getCollectionTool,
} from "./models.js";
import {
  createPredictionTool,
  cancelPredictionTool,
  getPredictionTool,
  listPredictionsTool,
} from "./predictions.js";

/**
 * All available tools.
 */
export const tools: Tool[] = [
  searchModelsTool,
  listModelsTool,
  listCollectionsTool,
  getCollectionTool,
  createPredictionTool,
  cancelPredictionTool,
  getPredictionTool,
  listPredictionsTool,
]; 

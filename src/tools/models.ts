/**
 * Tools for interacting with Replicate models.
 */

import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { ReplicateClient } from "../replicate_client.js";
import type { Model } from "../models/model.js";

/**
 * Tool for searching models using semantic search.
 */
export const searchModelsTool: Tool = {
  name: "search_models",
  description: "Search for models using semantic search",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Search query",
      },
    },
    required: ["query"],
  },
};

/**
 * Tool for listing available models.
 */
export const listModelsTool: Tool = {
  name: "list_models",
  description: "List available models with optional filtering",
  inputSchema: {
    type: "object",
    properties: {
      owner: {
        type: "string",
        description: "Filter by model owner",
      },
      cursor: {
        type: "string",
        description: "Pagination cursor",
      },
    },
  },
};

/**
 * Tool for listing model collections.
 */
export const listCollectionsTool: Tool = {
  name: "list_collections",
  description: "List available model collections",
  inputSchema: {
    type: "object",
    properties: {
      cursor: {
        type: "string",
        description: "Pagination cursor",
      },
    },
  },
};

/**
 * Tool for getting collection details.
 */
export const getCollectionTool: Tool = {
  name: "get_collection",
  description: "Get details of a specific collection",
  inputSchema: {
    type: "object",
    properties: {
      slug: {
        type: "string",
        description: "Collection slug",
      },
    },
    required: ["slug"],
  },
}; 

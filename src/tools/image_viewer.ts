/**
 * MCP tools for image viewing functionality.
 */

import { ImageViewer } from "../services/image_viewer.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { MCPRequest } from "../types/mcp.js";

/**
 * Tool for displaying images in the system's default web browser
 */
export const viewImageTool: Tool = {
  name: "view_image",
  description: "Display an image in the system's default web browser",
  inputSchema: {
    type: "object",
    properties: {
      url: {
        type: "string",
        description: "URL of the image to display",
      },
    },
    required: ["url"],
  },
  handler: handleViewImage,
};

/**
 * Tool for clearing the image cache
 */
export const clearImageCacheTool: Tool = {
  name: "clear_image_cache",
  description: "Clear the image viewer cache",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: handleClearImageCache,
};

/**
 * Tool for getting image cache statistics
 */
export const getImageCacheStatsTool: Tool = {
  name: "get_image_cache_stats",
  description: "Get statistics about the image cache",
  inputSchema: {
    type: "object",
    properties: {},
  },
  handler: handleGetImageCacheStats,
};

/**
 * Display an image in the system's default web browser
 */
export async function handleViewImage(request: any) {
  const url = request.params.arguments?.url;

  if (typeof url !== "string") {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: "URL parameter is required",
        },
      ],
    };
  }

  try {
    const viewer = ImageViewer.getInstance();
    await viewer.displayImage(url);

    return {
      content: [
        {
          type: "text",
          text: "Image displayed successfully",
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to display image: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

/**
 * Clear the image viewer cache
 */
export async function handleClearImageCache(request: any) {
  try {
    const viewer = ImageViewer.getInstance();
    viewer.clearCache();

    return {
      content: [
        {
          type: "text",
          text: "Image cache cleared successfully",
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to clear cache: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

/**
 * Get image viewer cache statistics
 */
export async function handleGetImageCacheStats(request: any) {
  try {
    const viewer = ImageViewer.getInstance();
    const stats = viewer.getCacheStats();

    return {
      content: [
        {
          type: "text",
          text: "Cache statistics:",
        },
        {
          type: "text",
          text: JSON.stringify(stats, null, 2),
        },
      ],
    };
  } catch (error) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Failed to get cache stats: ${
            error instanceof Error ? error.message : String(error)
          }`,
        },
      ],
    };
  }
}

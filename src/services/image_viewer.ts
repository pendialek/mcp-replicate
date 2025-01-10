/**
 * Image viewer service for handling system image display and caching.
 */

import { Cache, type CacheStats } from "./cache.js";

// MCP-specific error types
export enum ErrorCode {
  InvalidRequest = "INVALID_REQUEST",
  InternalError = "INTERNAL_ERROR",
  UnsupportedFormat = "UNSUPPORTED_FORMAT",
}

export class McpError extends Error {
  constructor(public code: ErrorCode, message: string) {
    super(message);
    this.name = "McpError";
  }
}

// Supported image formats and their MIME types
export const IMAGE_MIME_TYPES = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
} as const;

export type ImageFormat = keyof typeof IMAGE_MIME_TYPES;

interface ImageMetadata {
  format: ImageFormat;
  url: string;
  localPath?: string;
  width?: number;
  height?: number;
}

// Create a specialized cache for images with 1 hour TTL
export const imageCache = new Cache<ImageMetadata>(200, 3600);

export class ImageViewer {
  private static instance: ImageViewer;

  private constructor() {
    // Private constructor for singleton pattern
  }

  /**
   * Get singleton instance of ImageViewer
   */
  static getInstance(): ImageViewer {
    if (!ImageViewer.instance) {
      ImageViewer.instance = new ImageViewer();
    }
    return ImageViewer.instance;
  }

  /**
   * Display an image in the system's default web browser
   */
  async displayImage(url: string): Promise<void> {
    try {
      // Check cache first
      const cached = imageCache.get(url);
      if (cached) {
        await this.openInBrowser(cached.localPath || cached.url);
        return;
      }

      // If not cached, fetch and cache the image metadata
      const metadata = await this.fetchImageMetadata(url);
      imageCache.set(url, metadata);

      // Display the image
      await this.openInBrowser(metadata.localPath || url);
    } catch (error: unknown) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to display image: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Fetch metadata for an image URL
   */
  private async fetchImageMetadata(url: string): Promise<ImageMetadata> {
    // For now, just return basic metadata without strict MIME type checking
    return {
      format: "image/png", // Default format
      url: url,
    };
  }

  /**
   * Open an image URL in the system's default web browser
   */
  private async openInBrowser(url: string): Promise<void> {
    try {
      // Create a simple HTML page to display the image
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Image Viewer</title>
  <style>
    body {
      margin: 0;
      padding: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #1a1a1a;
    }
    img {
      max-width: 100%;
      max-height: 100vh;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <img src="${url}" alt="Image preview" />
</body>
</html>`;

      // Create a temporary file to host the HTML
      const tempPath = `/tmp/mcp-image-viewer-${Date.now()}.html`;
      const fs = await import("node:fs/promises");
      await fs.writeFile(tempPath, html);

      // Launch browser with the HTML file
      const fileUrl = `file://${tempPath}`;

      // Use the system's browser_action tool
      const { exec } = await import("node:child_process");
      const { promisify } = await import("node:util");
      const execAsync = promisify(exec);

      // Open the file in the default browser
      if (process.platform === "darwin") {
        await execAsync(`open "${fileUrl}"`);
      } else if (process.platform === "win32") {
        await execAsync(`start "" "${fileUrl}"`);
      } else {
        await execAsync(`xdg-open "${fileUrl}"`);
      }

      // Clean up the temporary file after a delay to ensure browser has loaded it
      setTimeout(async () => {
        try {
          await fs.unlink(tempPath);
        } catch (error) {
          console.error("Failed to clean up temporary file:", error);
        }
      }, 5000);
    } catch (error: unknown) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to open browser: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  /**
   * Clear the image cache
   */
  clearCache(): void {
    imageCache.clear();
  }

  /**
   * Get statistics about the image cache
   */
  getCacheStats(): CacheStats {
    return imageCache.getStats();
  }
}

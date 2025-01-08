/**
 * Template manager for handling image generation parameters.
 */

import { qualityPresets, type QualityPreset } from "./parameters/quality.js";
import { stylePresets, type StylePreset } from "./parameters/style.js";
import {
  sizePresets,
  type SizePreset,
  scaleToMaxSize,
} from "./parameters/size.js";

import type { ModelIO } from "../models/openapi.js";

export interface ImageGenerationParameters extends ModelIO {
  prompt: string;
  negative_prompt?: string;
  width: number;
  height: number;
  num_inference_steps?: number;
  guidance_scale?: number;
  scheduler?: string;
  style_strength?: number;
  seed?: number;
  num_outputs?: number;
}

export interface TemplateOptions {
  quality?: keyof typeof qualityPresets;
  style?: keyof typeof stylePresets;
  size?: keyof typeof sizePresets;
  custom_size?: { width: number; height: number };
  seed?: number;
  num_outputs?: number;
}

/**
 * Manages templates and parameter generation for image generation.
 */
export class TemplateManager {
  private maxImageSize: number;

  constructor(maxImageSize = 1024) {
    this.maxImageSize = maxImageSize;
  }

  /**
   * Get all available presets.
   */
  getAvailablePresets() {
    return {
      quality: Object.entries(qualityPresets).map(([id, preset]) => ({
        id,
        ...preset,
      })),
      style: Object.entries(stylePresets).map(([id, preset]) => ({
        id,
        ...preset,
      })),
      size: Object.entries(sizePresets).map(([id, preset]) => ({
        id,
        ...preset,
      })),
    };
  }

  /**
   * Generate parameters by combining presets and options.
   */
  generateParameters(
    prompt: string,
    options: TemplateOptions = {}
  ): ImageGenerationParameters {
    // Get presets
    const qualityPreset = options.quality
      ? qualityPresets[options.quality]
      : qualityPresets.balanced;
    const stylePreset = options.style
      ? stylePresets[options.style]
      : stylePresets.photorealistic;
    const sizePreset = options.size
      ? sizePresets[options.size]
      : sizePresets.square;

    // Handle custom size
    let { width, height } = options.custom_size || sizePreset.parameters;
    if (width > this.maxImageSize || height > this.maxImageSize) {
      ({ width, height } = scaleToMaxSize(width, height, this.maxImageSize));
    }

    // Combine prompts
    const fullPrompt = [
      stylePreset.parameters.prompt_prefix,
      prompt.trim(),
      stylePreset.parameters.prompt_suffix,
    ]
      .filter(Boolean)
      .join(" ");

    // Combine negative prompts
    const negativePrompts = [
      qualityPreset.parameters.negative_prompt,
      stylePreset.parameters.negative_prompt,
    ]
      .filter(Boolean)
      .join(", ");

    // Combine parameters
    return {
      prompt: fullPrompt,
      negative_prompt: negativePrompts || undefined,
      width,
      height,
      num_inference_steps: qualityPreset.parameters.num_inference_steps,
      guidance_scale: qualityPreset.parameters.guidance_scale,
      scheduler: qualityPreset.parameters.scheduler,
      style_strength: stylePreset.parameters.style_strength,
      seed: options.seed,
      num_outputs: options.num_outputs || 1,
    };
  }

  /**
   * Validate parameters against model constraints.
   */
  validateParameters(
    parameters: ImageGenerationParameters,
    modelConstraints: {
      min_width?: number;
      max_width?: number;
      min_height?: number;
      max_height?: number;
      step_size?: number;
      supported_schedulers?: string[];
    } = {}
  ): void {
    const errors: string[] = [];

    // Basic validation
    if (parameters.width <= 0) {
      errors.push("Width must be positive");
    }
    if (parameters.height <= 0) {
      errors.push("Height must be positive");
    }

    // Model constraints validation
    if (
      modelConstraints.min_width &&
      parameters.width < modelConstraints.min_width
    ) {
      errors.push(`Width must be at least ${modelConstraints.min_width}`);
    }
    if (
      modelConstraints.max_width &&
      parameters.width > modelConstraints.max_width
    ) {
      errors.push(`Width must be at most ${modelConstraints.max_width}`);
    }
    if (
      modelConstraints.min_height &&
      parameters.height < modelConstraints.min_height
    ) {
      errors.push(`Height must be at least ${modelConstraints.min_height}`);
    }
    if (
      modelConstraints.max_height &&
      parameters.height > modelConstraints.max_height
    ) {
      errors.push(`Height must be at most ${modelConstraints.max_height}`);
    }

    // Validate step size
    if (modelConstraints.step_size) {
      if (parameters.width % modelConstraints.step_size !== 0) {
        errors.push(
          `Width must be a multiple of ${modelConstraints.step_size}`
        );
      }
      if (parameters.height % modelConstraints.step_size !== 0) {
        errors.push(
          `Height must be a multiple of ${modelConstraints.step_size}`
        );
      }
    }

    // Validate scheduler
    if (
      modelConstraints.supported_schedulers &&
      parameters.scheduler &&
      !modelConstraints.supported_schedulers.includes(parameters.scheduler)
    ) {
      errors.push(
        `Scheduler must be one of: ${modelConstraints.supported_schedulers.join(
          ", "
        )}`
      );
    }

    // Validate other parameters
    if (parameters.num_inference_steps && parameters.num_inference_steps < 1) {
      errors.push("Number of inference steps must be positive");
    }
    if (parameters.guidance_scale && parameters.guidance_scale < 1) {
      errors.push("Guidance scale must be positive");
    }
    if (
      parameters.style_strength &&
      (parameters.style_strength < 0 || parameters.style_strength > 1)
    ) {
      errors.push("Style strength must be between 0 and 1");
    }
    if (parameters.num_outputs && parameters.num_outputs < 1) {
      errors.push("Number of outputs must be positive");
    }

    if (errors.length > 0) {
      throw new Error(`Parameter validation failed:\n${errors.join("\n")}`);
    }
  }

  /**
   * Suggest parameters based on prompt analysis.
   */
  suggestParameters(prompt: string): TemplateOptions {
    // Simple keyword-based suggestions
    const suggestions: TemplateOptions = {};

    // Quality suggestions
    if (prompt.includes("quick") || prompt.includes("draft")) {
      suggestions.quality = "draft";
    } else if (prompt.includes("high quality") || prompt.includes("detailed")) {
      suggestions.quality = "quality";
    }

    // Style suggestions
    if (prompt.includes("photo") || prompt.includes("realistic")) {
      suggestions.style = "photorealistic";
    } else if (prompt.includes("anime") || prompt.includes("manga")) {
      suggestions.style = "anime";
    } else if (prompt.includes("painting") || prompt.includes("oil")) {
      suggestions.style = "oil_painting";
    } else if (prompt.includes("watercolor")) {
      suggestions.style = "watercolor";
    } else if (prompt.includes("pixel") || prompt.includes("8-bit")) {
      suggestions.style = "pixel_art";
    } else if (prompt.includes("minimal")) {
      suggestions.style = "minimalist";
    }

    // Size suggestions
    if (prompt.includes("portrait") || prompt.includes("vertical")) {
      suggestions.size = "portrait";
    } else if (prompt.includes("landscape") || prompt.includes("horizontal")) {
      suggestions.size = "landscape";
    } else if (prompt.includes("panorama") || prompt.includes("wide")) {
      suggestions.size = "panoramic";
    } else if (prompt.includes("instagram")) {
      suggestions.size = prompt.includes("story")
        ? "instagram_story"
        : "instagram_post";
    } else if (prompt.includes("twitter header")) {
      suggestions.size = "twitter_header";
    }

    return suggestions;
  }
}

/**
 * Text-to-image generation prompt.
 */

import type { MCPMessage } from "../../types/mcp.js";
import { TemplateManager, type TemplateOptions } from "../manager.js";

const templateManager = new TemplateManager();

/**
 * Generate a text-to-image prompt with parameter suggestions.
 */
export function generateTextToImagePrompt(userPrompt: string): MCPMessage {
  // Get parameter suggestions based on prompt
  const suggestions = templateManager.suggestParameters(userPrompt);

  // Get all available presets for reference
  const presets = templateManager.getAvailablePresets();

  // Generate example parameters
  const exampleParams = templateManager.generateParameters(
    userPrompt,
    suggestions
  );

  return {
    jsonrpc: "2.0",
    method: "prompt/text_to_image",
    params: {
      messages: [
        {
          role: "assistant",
          content: {
            type: "text",
            text: "I'll help you generate an image. Here's what I understand from your prompt:",
          },
        },
        {
          role: "assistant",
          content: {
            type: "text",
            text: `Based on your description, I suggest:
${suggestions.quality ? `- Quality: ${suggestions.quality} mode` : ""}
${suggestions.style ? `- Style: ${suggestions.style} style` : ""}
${suggestions.size ? `- Size: ${suggestions.size} format` : ""}

Here are the parameters I'll use:
- Prompt: "${exampleParams.prompt}"
${
  exampleParams.negative_prompt
    ? `- Negative prompt: "${exampleParams.negative_prompt}"`
    : ""
}
- Size: ${exampleParams.width}x${exampleParams.height}
- Steps: ${exampleParams.num_inference_steps}
- Guidance scale: ${exampleParams.guidance_scale}
${exampleParams.scheduler ? `- Scheduler: ${exampleParams.scheduler}` : ""}
${
  exampleParams.style_strength
    ? `- Style strength: ${exampleParams.style_strength}`
    : ""
}

Would you like to adjust any of these settings? You can choose from:

Quality presets:
${presets.quality.map((p) => `- ${p.name}: ${p.description}`).join("\n")}

Style presets:
${presets.style.map((p) => `- ${p.name}: ${p.description}`).join("\n")}

Size presets:
${presets.size.map((p) => `- ${p.name}: ${p.description}`).join("\n")}

Or you can specify custom parameters:
- Custom size (e.g., "make it 1024x768")
- Number of images (e.g., "generate 4 variations")
- Seed number for reproducibility

Let me know if you want to proceed with these settings or make any adjustments.`,
          },
        },
      ],
      parameters: exampleParams,
      suggestions,
      presets,
    },
  };
}

/**
 * Parse user response to extract parameter adjustments.
 */
export function parseParameterAdjustments(
  response: string
): Partial<TemplateOptions> {
  const adjustments: Partial<TemplateOptions> = {};

  // Quality adjustments
  if (response.match(/\b(draft|quick|fast)\b/i)) {
    adjustments.quality = "draft";
  } else if (response.match(/\b(balanced|medium|default)\b/i)) {
    adjustments.quality = "balanced";
  } else if (response.match(/\b(quality|high|detailed)\b/i)) {
    adjustments.quality = "quality";
  } else if (response.match(/\b(extreme|maximum|best)\b/i)) {
    adjustments.quality = "extreme";
  }

  // Style adjustments
  if (response.match(/\b(photo|realistic)\b/i)) {
    adjustments.style = "photorealistic";
  } else if (response.match(/\b(anime|manga)\b/i)) {
    adjustments.style = "anime";
  } else if (response.match(/\b(digital[\s-]?art)\b/i)) {
    adjustments.style = "digital_art";
  } else if (response.match(/\b(oil[\s-]?painting)\b/i)) {
    adjustments.style = "oil_painting";
  } else if (response.match(/\b(watercolor)\b/i)) {
    adjustments.style = "watercolor";
  } else if (response.match(/\b(pixel[\s-]?art|8[\s-]?bit)\b/i)) {
    adjustments.style = "pixel_art";
  } else if (response.match(/\b(minimal|minimalist)\b/i)) {
    adjustments.style = "minimalist";
  }

  // Size adjustments
  if (response.match(/\b(square|1:1)\b/i)) {
    adjustments.size = "square";
  } else if (response.match(/\b(portrait|vertical|3:4)\b/i)) {
    adjustments.size = "portrait";
  } else if (response.match(/\b(landscape|horizontal|4:3)\b/i)) {
    adjustments.size = "landscape";
  } else if (response.match(/\b(widescreen|16:9)\b/i)) {
    adjustments.size = "widescreen";
  } else if (response.match(/\b(panoramic|21:9)\b/i)) {
    adjustments.size = "panoramic";
  } else if (response.match(/\b(instagram[\s-]?story)\b/i)) {
    adjustments.size = "instagram_story";
  } else if (response.match(/\b(instagram[\s-]?post)\b/i)) {
    adjustments.size = "instagram_post";
  } else if (response.match(/\b(twitter[\s-]?header)\b/i)) {
    adjustments.size = "twitter_header";
  }

  // Custom size
  const sizeMatch = response.match(/(\d+)\s*x\s*(\d+)/i);
  if (sizeMatch) {
    adjustments.custom_size = {
      width: Number.parseInt(sizeMatch[1], 10),
      height: Number.parseInt(sizeMatch[2], 10),
    };
  }

  // Number of outputs
  const numMatch = response.match(
    /\b(\d+)\s*(outputs?|variations?|images?)\b/i
  );
  if (numMatch) {
    adjustments.num_outputs = Number.parseInt(numMatch[1], 10);
  }

  // Seed
  const seedMatch = response.match(/\bseed\s*[=:]?\s*(\d+)\b/i);
  if (seedMatch) {
    adjustments.seed = Number.parseInt(seedMatch[1], 10);
  }

  return adjustments;
}

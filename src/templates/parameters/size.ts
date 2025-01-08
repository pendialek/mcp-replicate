/**
 * Size and aspect ratio presets for image generation.
 */

export interface SizePreset {
  name: string;
  description: string;
  parameters: {
    width: number;
    height: number;
    aspect_ratio?: string;
    recommended_for?: string[];
  };
}

export const sizePresets: Record<string, SizePreset> = {
  square: {
    name: "Square",
    description: "Perfect square format",
    parameters: {
      width: 1024,
      height: 1024,
      aspect_ratio: "1:1",
      recommended_for: ["social media", "profile pictures", "album covers"],
    },
  },
  portrait: {
    name: "Portrait",
    description: "Vertical format for portraits",
    parameters: {
      width: 768,
      height: 1024,
      aspect_ratio: "3:4",
      recommended_for: ["portraits", "mobile wallpapers", "book covers"],
    },
  },
  landscape: {
    name: "Landscape",
    description: "Horizontal format for landscapes",
    parameters: {
      width: 1024,
      height: 768,
      aspect_ratio: "4:3",
      recommended_for: ["landscapes", "desktop wallpapers", "banners"],
    },
  },
  widescreen: {
    name: "Widescreen",
    description: "16:9 format for modern displays",
    parameters: {
      width: 1024,
      height: 576,
      aspect_ratio: "16:9",
      recommended_for: [
        "desktop backgrounds",
        "presentations",
        "video thumbnails",
      ],
    },
  },
  panoramic: {
    name: "Panoramic",
    description: "Extra wide format for panoramas",
    parameters: {
      width: 1024,
      height: 384,
      aspect_ratio: "21:9",
      recommended_for: [
        "panoramic landscapes",
        "ultra-wide displays",
        "banners",
      ],
    },
  },
  instagram_post: {
    name: "Instagram Post",
    description: "Optimized for Instagram posts",
    parameters: {
      width: 1080,
      height: 1080,
      aspect_ratio: "1:1",
      recommended_for: ["instagram posts", "social media"],
    },
  },
  instagram_story: {
    name: "Instagram Story",
    description: "Optimized for Instagram stories",
    parameters: {
      width: 1080,
      height: 1920,
      aspect_ratio: "9:16",
      recommended_for: ["instagram stories", "mobile content"],
    },
  },
  twitter_header: {
    name: "Twitter Header",
    description: "Optimized for Twitter profile headers",
    parameters: {
      width: 1500,
      height: 500,
      aspect_ratio: "3:1",
      recommended_for: ["twitter headers", "social media banners"],
    },
  },
};

/**
 * Get the closest size preset for given dimensions.
 */
export function findClosestSizePreset(
  width: number,
  height: number
): SizePreset {
  const targetRatio = width / height;
  let closestPreset = sizePresets.square;
  let smallestDiff = Number.POSITIVE_INFINITY;

  for (const preset of Object.values(sizePresets)) {
    const presetRatio = preset.parameters.width / preset.parameters.height;
    const ratioDiff = Math.abs(presetRatio - targetRatio);

    if (ratioDiff < smallestDiff) {
      smallestDiff = ratioDiff;
      closestPreset = preset;
    }
  }

  return closestPreset;
}

/**
 * Scale dimensions to fit within maximum size while maintaining aspect ratio.
 */
export function scaleToMaxSize(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  if (width <= maxSize && height <= maxSize) {
    return { width, height };
  }

  const ratio = width / height;
  return ratio > 1
    ? {
        // Width is larger
        width: maxSize,
        height: Math.round(maxSize / ratio),
      }
    : {
        // Height is larger
        width: Math.round(maxSize * ratio),
        height: maxSize,
      };
}

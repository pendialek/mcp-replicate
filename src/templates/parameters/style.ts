/**
 * Style presets for image generation.
 */

export interface StylePreset {
  name: string;
  description: string;
  parameters: {
    prompt_prefix?: string;
    prompt_suffix?: string;
    negative_prompt?: string;
    style_strength?: number;
  };
}

export const stylePresets: Record<string, StylePreset> = {
  photorealistic: {
    name: "Photorealistic",
    description: "Highly detailed, realistic photography style",
    parameters: {
      prompt_prefix: "photorealistic, highly detailed photograph,",
      prompt_suffix: "8k uhd, high resolution, professional photography",
      negative_prompt:
        "illustration, painting, drawing, cartoon, anime, rendered, 3d, cgi",
      style_strength: 0.8,
    },
  },
  cinematic: {
    name: "Cinematic",
    description: "Movie-like scenes with dramatic lighting",
    parameters: {
      prompt_prefix: "cinematic shot, dramatic lighting, movie scene,",
      prompt_suffix: "anamorphic lens, film grain, depth of field, bokeh",
      negative_prompt: "flat lighting, flash photography, overexposed",
      style_strength: 0.85,
    },
  },
  anime: {
    name: "Anime",
    description: "Japanese anime and manga style",
    parameters: {
      prompt_prefix: "anime style, manga illustration,",
      prompt_suffix: "clean lines, vibrant colors, detailed anime drawing",
      negative_prompt: "photorealistic, 3d rendered, western animation",
      style_strength: 0.9,
    },
  },
  digital_art: {
    name: "Digital Art",
    description: "Modern digital art style",
    parameters: {
      prompt_prefix: "digital art, concept art,",
      prompt_suffix: "highly detailed, sharp focus, vibrant colors",
      negative_prompt: "traditional media, watercolor, oil painting",
      style_strength: 0.85,
    },
  },
  oil_painting: {
    name: "Oil Painting",
    description: "Classical oil painting style",
    parameters: {
      prompt_prefix: "oil painting, traditional art, painterly,",
      prompt_suffix: "detailed brushwork, canvas texture, rich colors",
      negative_prompt: "digital art, photograph, 3d rendered",
      style_strength: 0.9,
    },
  },
  watercolor: {
    name: "Watercolor",
    description: "Soft watercolor painting style",
    parameters: {
      prompt_prefix: "watercolor painting, soft and dreamy,",
      prompt_suffix: "flowing colors, wet on wet technique, artistic",
      negative_prompt: "sharp edges, harsh contrast, digital art",
      style_strength: 0.85,
    },
  },
  pixel_art: {
    name: "Pixel Art",
    description: "Retro pixel art style",
    parameters: {
      prompt_prefix: "pixel art, retro game style,",
      prompt_suffix: "8-bit, pixelated, video game art",
      negative_prompt: "smooth gradients, photorealistic, high resolution",
      style_strength: 0.95,
    },
  },
  minimalist: {
    name: "Minimalist",
    description: "Clean, simple minimalist style",
    parameters: {
      prompt_prefix: "minimalist design, simple composition,",
      prompt_suffix: "clean lines, negative space, geometric",
      negative_prompt: "busy, cluttered, detailed, ornate",
      style_strength: 0.8,
    },
  },
};

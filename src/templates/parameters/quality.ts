/**
 * Quality presets for image generation.
 */

export interface QualityPreset {
  name: string;
  description: string;
  parameters: {
    num_inference_steps?: number;
    guidance_scale?: number;
    scheduler?: string;
    negative_prompt?: string;
  };
}

export const qualityPresets: Record<string, QualityPreset> = {
  draft: {
    name: "Draft",
    description: "Quick, low-quality preview with minimal steps",
    parameters: {
      num_inference_steps: 20,
      guidance_scale: 7,
      scheduler: "DPMSolverMultistep",
    },
  },
  balanced: {
    name: "Balanced",
    description: "Good balance between quality and speed",
    parameters: {
      num_inference_steps: 30,
      guidance_scale: 7.5,
      scheduler: "DPMSolverMultistep",
      negative_prompt: "blurry, low quality, distorted",
    },
  },
  quality: {
    name: "Quality",
    description: "High-quality output with more steps",
    parameters: {
      num_inference_steps: 50,
      guidance_scale: 8,
      scheduler: "DPMSolverMultistep",
      negative_prompt: "blurry, low quality, distorted, ugly, deformed",
    },
  },
  extreme: {
    name: "Extreme",
    description: "Maximum quality with extensive steps",
    parameters: {
      num_inference_steps: 100,
      guidance_scale: 9,
      scheduler: "DPMSolverMultistep",
      negative_prompt:
        "blurry, low quality, distorted, ugly, deformed, noisy, grainy, oversaturated",
    },
  },
};

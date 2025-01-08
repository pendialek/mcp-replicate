# Template System Documentation

The Replicate MCP Server includes a powerful template system for managing common parameter configurations. This system helps ensure consistent results across different use cases and simplifies the process of working with complex model parameters.

## Overview

Templates provide pre-configured parameter sets for common scenarios. They are organized into categories:
- Quality templates for controlling generation fidelity
- Style templates for artistic direction
- Size templates for standard dimensions

## Template Categories

### Quality Templates

Quality templates balance generation speed against output fidelity.

```typescript
export const qualityTemplates = {
  draft: {
    num_inference_steps: 25,
    guidance_scale: 7.0,
    scheduler: "K_EULER",
    seed: null
  },
  balanced: {
    num_inference_steps: 40,
    guidance_scale: 7.5,
    scheduler: "K_EULER_ANCESTRAL",
    seed: null
  },
  quality: {
    num_inference_steps: 60,
    guidance_scale: 8.0,
    scheduler: "DPM++_2M_KARRAS",
    seed: null
  },
  extreme: {
    num_inference_steps: 100,
    guidance_scale: 9.0,
    scheduler: "DPM++_2M_KARRAS",
    seed: null
  }
};
```

Usage:
```typescript
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A detailed landscape",
    ...templates.quality.quality  // Use quality preset
  }
});
```

### Style Templates

Style templates provide consistent artistic direction.

```typescript
export const styleTemplates = {
  photographic: {
    style_preset: "photographic",
    negative_prompt: "illustration, painting, drawing, art"
  },
  digital_art: {
    style_preset: "digital-art",
    negative_prompt: "photographic, realistic, photo"
  },
  cinematic: {
    style_preset: "cinematic",
    negative_prompt: "amateur, low quality"
  },
  anime: {
    style_preset: "anime",
    negative_prompt: "photographic, realistic"
  },
  painting: {
    style_preset: "painting",
    negative_prompt: "photographic, digital art"
  }
};
```

Usage:
```typescript
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A mountain scene",
    ...templates.style.cinematic  // Use cinematic style
  }
});
```

### Size Templates

Size templates define standard image dimensions.

```typescript
export const sizeTemplates = {
  square: {
    width: 1024,
    height: 1024,
    aspect_ratio: "1:1"
  },
  portrait: {
    width: 832,
    height: 1216,
    aspect_ratio: "2:3"
  },
  landscape: {
    width: 1216,
    height: 832,
    aspect_ratio: "3:2"
  },
  widescreen: {
    width: 1344,
    height: 768,
    aspect_ratio: "16:9"
  }
};
```

Usage:
```typescript
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A cityscape",
    ...templates.size.widescreen  // Use widescreen format
  }
});
```

## Combining Templates

Templates can be combined to achieve specific results:

```typescript
const prediction = await client.createPrediction({
  version: "stability-ai/sdxl@latest",
  input: {
    prompt: "A futuristic cityscape at night",
    ...templates.quality.extreme,    // Maximum quality
    ...templates.style.cinematic,    // Cinematic style
    ...templates.size.widescreen     // Widescreen format
  }
});
```

## Custom Templates

You can create custom templates by extending the base templates:

```typescript
const customTemplate = {
  ...templates.quality.quality,
  ...templates.style.cinematic,
  ...templates.size.widescreen,
  // Custom overrides
  guidance_scale: 8.5,
  negative_prompt: "low quality, blurry, amateur"
};
```

## Template Manager

The TemplateManager class provides a centralized way to manage templates:

```typescript
class TemplateManager {
  private templates: Map<string, any>;

  constructor() {
    this.templates = new Map();
    this.registerDefaults();
  }

  registerTemplate(name: string, template: any) {
    this.templates.set(name, template);
  }

  getTemplate(name: string) {
    return this.templates.get(name);
  }

  private registerDefaults() {
    // Register quality templates
    Object.entries(qualityTemplates).forEach(([name, template]) => {
      this.registerTemplate(`quality.${name}`, template);
    });

    // Register style templates
    Object.entries(styleTemplates).forEach(([name, template]) => {
      this.registerTemplate(`style.${name}`, template);
    });

    // Register size templates
    Object.entries(sizeTemplates).forEach(([name, template]) => {
      this.registerTemplate(`size.${name}`, template);
    });
  }
}
```

## Best Practices

1. **Template Selection**
   - Use `draft` quality for rapid prototyping
   - Use `balanced` quality for general use
   - Use `quality` or `extreme` for final outputs
   - Choose appropriate style templates for consistent aesthetics
   - Select size templates based on intended use

2. **Template Combination**
   - Combine templates in a consistent order (quality → style → size)
   - Be aware of parameter conflicts when combining templates
   - Test template combinations for expected results

3. **Custom Templates**
   - Base custom templates on existing ones for consistency
   - Document custom template parameters
   - Share common custom templates across your application

4. **Performance Considerations**
   - Higher quality templates increase generation time
   - Balance quality against performance requirements
   - Consider caching template combinations

## Template Validation

The server includes validation for template parameters:

```typescript
interface TemplateValidation {
  validateQuality(template: QualityTemplate): boolean;
  validateStyle(template: StyleTemplate): boolean;
  validateSize(template: SizeTemplate): boolean;
}
```

Use these validation methods to ensure template integrity:

```typescript
if (!templateValidation.validateQuality(customTemplate)) {
  throw new Error("Invalid quality template parameters");
}
```

## Error Handling

Handle template-related errors appropriately:

```typescript
try {
  const template = templateManager.getTemplate("quality.extreme");
  if (!template) {
    throw new Error("Template not found");
  }
  // Use template...
} catch (error) {
  console.error("Template error:", error.message);
  // Use fallback template or default parameters
}

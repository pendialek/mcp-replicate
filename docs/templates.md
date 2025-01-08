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

## Template Manager

The TemplateManager class provides a robust way to manage templates with validation and error handling:

```typescript
class TemplateManager {
  private templates: Map<string, Template>;
  private validationRules: Map<string, ValidationRule>;

  constructor() {
    this.templates = new Map();
    this.validationRules = new Map();
    this.registerDefaults();
  }

  registerTemplate(name: string, template: Template, validate = true) {
    try {
      if (validate) {
        this.validateTemplate(template);
      }
      this.templates.set(name, template);
    } catch (error) {
      throw new ValidationError(
        `Invalid template: ${name}`,
        "template",
        template
      );
    }
  }

  getTemplate(name: string): Template {
    const template = this.templates.get(name);
    if (!template) {
      throw new NotFoundError(`Template not found: ${name}`);
    }
    return template;
  }

  validateTemplate(template: Template): boolean {
    // Validate template structure
    if (!this.validateStructure(template)) {
      throw new ValidationError(
        "Invalid template structure",
        "structure",
        template
      );
    }

    // Validate template parameters
    if (!this.validateParameters(template)) {
      throw new ValidationError(
        "Invalid template parameters",
        "parameters",
        template
      );
    }

    return true;
  }

  combineTemplates(...templates: Template[]): Template {
    return ErrorHandler.withRetries(
      () => {
        const combined = templates.reduce(
          (acc, template) => ({
            ...acc,
            ...template
          }),
          {}
        );

        this.validateTemplate(combined);
        return combined;
      },
      {
        max_attempts: 1,
        retry_if: (error) => error instanceof ValidationError
      }
    );
  }
}
```

## Enhanced Error Handling

The template system includes comprehensive error handling:

### Template Validation Errors

```typescript
try {
  const template = templateManager.getTemplate("quality.extreme");
  templateManager.validateTemplate(template);
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(
      `Template validation failed for ${error.context.field}: `,
      error.context.value
    );
  } else if (error instanceof NotFoundError) {
    console.error("Template not found:", error.context.resource);
  } else {
    console.error(ErrorHandler.createErrorReport(error));
  }
}
```

### Parameter Validation

```typescript
interface ParameterValidation {
  validateRange(value: number, min: number, max: number): boolean;
  validateEnum(value: string, allowedValues: string[]): boolean;
  validateAspectRatio(width: number, height: number, ratio: string): boolean;
}

// Usage
try {
  const template = templateManager.getTemplate("size.custom");
  if (!parameterValidation.validateRange(template.width, 512, 2048)) {
    throw new ValidationError(
      "Width must be between 512 and 2048",
      "width",
      template.width
    );
  }
} catch (error) {
  console.error(error.getReport());
}
```

### Template Combination Error Handling

```typescript
try {
  const combined = templateManager.combineTemplates(
    templates.quality.extreme,
    templates.style.cinematic,
    templates.size.widescreen
  );
} catch (error) {
  if (error instanceof ValidationError) {
    console.error(
      "Template combination failed:",
      error.context.field,
      error.context.value
    );
  } else {
    console.error(ErrorHandler.createErrorReport(error));
  }
}
```

## Best Practices

1. **Template Validation**
   ```typescript
   // Always validate templates before use
   try {
     const template = templateManager.getTemplate("quality.custom");
     templateManager.validateTemplate(template);
   } catch (error) {
     // Handle validation errors appropriately
     console.error(error.getReport());
     // Use fallback template
     template = templateManager.getTemplate("quality.balanced");
   }
   ```

2. **Template Combination**
   ```typescript
   // Combine templates safely
   const combined = ErrorHandler.withRetries(
     () => templateManager.combineTemplates(
       templates.quality.quality,
       templates.style.cinematic,
       templates.size.widescreen
     ),
     {
       max_attempts: 2,
       retry_if: (error) => error instanceof ValidationError
     }
   );
   ```

3. **Custom Templates**
   ```typescript
   // Create and validate custom templates
   try {
     const customTemplate = {
       ...templates.quality.quality,
       guidance_scale: 8.5
     };
     templateManager.registerTemplate(
       "quality.custom",
       customTemplate,
       true // validate on registration
     );
   } catch (error) {
     console.error("Custom template validation failed:", error.getReport());
   }
   ```

4. **Error Recovery**
   ```typescript
   // Implement fallback strategy
   async function getTemplateWithFallback(name: string) {
     try {
       return await templateManager.getTemplate(name);
     } catch (error) {
       if (error instanceof NotFoundError) {
         console.warn(`Template ${name} not found, using fallback`);
         return templateManager.getTemplate("quality.balanced");
       }
       throw error;
     }
   }
   ```

5. **Template Caching**
   ```typescript
   // Cache validated templates
   const templateCache = new Map<string, Template>();

   async function getValidatedTemplate(name: string) {
     if (templateCache.has(name)) {
       return templateCache.get(name);
     }

     const template = await templateManager.getTemplate(name);
     if (templateManager.validateTemplate(template)) {
       templateCache.set(name, template);
     }
     return template;
   }
   ```

## Performance Considerations

1. **Template Validation Caching**
   - Cache validation results for frequently used templates
   - Invalidate cache when templates are modified
   - Use LRU caching for template combinations

2. **Batch Validation**
   ```typescript
   // Validate multiple templates efficiently
   async function validateTemplates(templates: Template[]) {
     const results = await Promise.all(
       templates.map(template =>
         ErrorHandler.withRetries(
           () => templateManager.validateTemplate(template)
         )
       )
     );
     return results.every(result => result);
   }
   ```

3. **Optimized Template Combination**
   ```typescript
   // Combine templates efficiently
   const combinedTemplate = templateManager.combineTemplates(
     templates.quality.quality,
     templates.style.cinematic,
     templates.size.widescreen,
     {
       validate: false, // Skip intermediate validations
       validateFinal: true // Only validate final result
     }
   );
   ```

## Template Monitoring

```typescript
interface TemplateMetrics {
  validationErrors: number;
  combinationErrors: number;
  cacheHits: number;
  cacheMisses: number;
  averageValidationTime: number;
}

// Track template usage and errors
const metrics: TemplateMetrics = {
  validationErrors: 0,
  combinationErrors: 0,
  cacheHits: 0,
  cacheMisses: 0,
  averageValidationTime: 0
};

// Monitor template operations
templateManager.on("validation_error", (error) => {
  metrics.validationErrors++;
  console.error(error.getReport());
});
```

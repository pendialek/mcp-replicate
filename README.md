# Replicate MCP Server

A [Model Context Protocol](https://github.com/mcp-sdk/mcp) server implementation for [Replicate](https://replicate.com). This server provides access to Replicate's models and predictions through the MCP interface.

## Features

- **Resources**
  - List available models on Replicate
  - View model details and metadata
  - List recent predictions
  - View prediction status and results

- **Tools**
  - Create new predictions using any model version
  - Cancel running predictions

- **Prompts**
  - Get help selecting appropriate models
  - Get parameter suggestions for models

## Installation

```bash
npm install
```

## Configuration

The server requires a Replicate API token. You can set it in one of two ways:

1. Environment variable:
```bash
export REPLICATE_API_TOKEN=your_token_here
```

2. Pass it directly when creating the client:
```typescript
const client = new ReplicateClient("your_token_here");
```

## Usage

1. Build the TypeScript code:
```bash
npm run build
```

2. Start the server:
```bash
npm start
```

The server communicates via stdio using the MCP protocol. You can use any MCP client to interact with it.

## Development

1. Install dependencies:
```bash
npm install
```

2. Start the development server (with auto-reload):
```bash
npm run dev
```

3. Lint the code:
```bash
npm run lint
```

4. Format the code:
```bash
npm run format
```

## Resource URIs

The server uses custom URI schemes to identify resources:

- Models: `replicate-model://{owner}/{name}`
- Predictions: `replicate-prediction://{id}`

## Tools

### create_prediction

Creates a new prediction using a model version.

Parameters:
- `version`: Model version ID
- `input`: Model input parameters
- `webhook_url` (optional): Webhook URL for notifications

### cancel_prediction

Cancels a running prediction.

Parameters:
- `prediction_id`: ID of the prediction to cancel

## Prompts

### select_model

Get help selecting an appropriate model for your use case. The prompt includes details about all available models to help with selection.

### suggest_parameters

Get suggestions for model parameters based on your requirements. Provide the model ID (owner/name) and describe what you want to achieve.

## Error Handling

The server includes robust error handling for:
- Rate limiting
- API errors
- Invalid requests
- Missing resources

## Caching

The server implements caching for models and predictions to reduce API calls. The cache is updated when:
- Listing resources
- Creating new predictions
- Canceling predictions

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

## License

MIT

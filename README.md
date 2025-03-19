# Replicate MCP Server

A [Model Context Protocol](https://github.com/mcp-sdk/mcp) server implementation for Replicate. Run Replicate models through a simple tool-based interface.

## Quickstart

1. Get your Replicate API token:
   - Go to [Replicate API tokens page](https://replicate.com/account/api-tokens)
   - Create a new token if you don't have one
   - Copy the token for the next step
2. Install and run on Linux/Debian:

```bash
# Download and run installation script
curl -o- https://raw.githubusercontent.com/pendialek/mcp-replicate/main/install.sh | bash

# Run the server
REPLICATE_API_TOKEN=your_token_here mcp-replicate
```

The installation script will:
- Clone the repository
- Install dependencies
- Build the project
- Create a global symlink
```

3. Configure your MCP client (e.g., Claude Desktop, Cline, Cursor):
   - Open the client's settings
   - Add the following configuration, replacing `your_token_here` with your actual Replicate API token:

```json
{
  "mcpServers": {
    "replicate": {
      "command": "mcp-replicate",
      "env": {
        "REPLICATE_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

4. Start your MCP client. You should see a 🔨 hammer icon indicating the tools are available.

## Alternative Installation Methods

### Install from source

```bash
git clone https://github.com/pendialek/mcp-replicate.git
cd mcp-replicate
npm install
npm run build
npm start
```

## Features

### Models
- Search models using semantic search
- Browse models and collections
- Get detailed model information and versions

### Predictions
- Create predictions with text or structured input
- Track prediction status
- Cancel running predictions
- List your recent predictions

### Image Handling
- View generated images in your browser
- Manage image cache for better performance

## Configuration

The server needs a Replicate API token to work. You can get one at [Replicate](https://replicate.com/account/api-tokens).

There are two ways to provide the token:

### 1. In MCP Client Config (Recommended)

Add it to your client configuration as shown in the Quickstart section:

```json
{
  "mcpServers": {
    "replicate": {
      "command": "mcp-replicate",
      "env": {
        "REPLICATE_API_TOKEN": "your_token_here"
      }
    }
  }
}
```

### 2. As Environment Variable

Alternatively, you can set it as an environment variable:

```bash
export REPLICATE_API_TOKEN=your_token_here
```

## Available Tools

### Model Tools
- `search_models`: Find models using semantic search
- `list_models`: Browse available models
- `get_model`: Get details about a specific model
- `list_collections`: Browse model collections
- `get_collection`: Get details about a specific collection

### Prediction Tools  
- `create_prediction`: Run a model with your inputs
- `get_prediction`: Check a prediction's status
- `cancel_prediction`: Stop a running prediction
- `list_predictions`: See your recent predictions

### Image Tools
- `view_image`: Open an image in your browser
- `clear_image_cache`: Clean up cached images
- `get_image_cache_stats`: Check cache usage

## Troubleshooting

### Server is running but tools aren't showing up

1. Check that your MCP client is properly configured with the server settings
2. Ensure your Replicate API token is set correctly
3. Try restarting both the server and the client
4. Check the server logs for any error messages

### Tools are visible but not working

1. Verify your Replicate API token is valid
2. Check your internet connection
3. Look for any error messages in the server output

## Development

1. Install dependencies:
```bash
npm install
```

2. Start development server (with auto-reload):
```bash
npm run dev
```

3. Check code style:
```bash
npm run lint
```

4. Format code:
```bash
npm run format
```

## Requirements

- Node.js >= 18.0.0
- TypeScript >= 5.0.0

## License

MIT

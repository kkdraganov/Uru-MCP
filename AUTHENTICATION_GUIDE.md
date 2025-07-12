# Uru MCP Authentication Guide

This guide explains the two authentication methods supported by the Uru MCP server.

## Overview

The Uru MCP server supports two authentication approaches:

1. **Per-Request API Keys** (Recommended) - API keys are passed as parameters in each tool call
2. **Server-Level Configuration** (Legacy) - A default API key is configured at server startup

## Method 1: Per-Request API Keys (Recommended)

### Benefits

- **Enhanced Security**: API keys are not stored in environment variables or configuration files
- **Multi-User Support**: Different API keys can be used for different requests
- **Flexibility**: No server reconfiguration needed to change API keys
- **Better Isolation**: Each tool call is independently authenticated

### How It Works

When no server-level API key is configured, the MCP server automatically adds an `api_key` parameter to all tool schemas. Clients must provide this parameter with each tool call.

### Example Tool Call

```json
{
  "method": "tools/call",
  "params": {
    "name": "example-tool",
    "arguments": {
      "api_key": "your-api-key-here",
      "message": "Hello, world!",
      "other_param": "value"
    }
  }
}
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"]
    }
  }
}
```

Note: No `env` section is needed when using per-request API keys.

### Starting the Server

```bash
# No authentication token required
npx uru-mcp
```

The server will start successfully and show:
```
⚠️  No authentication token configured
   API key must be provided in tool arguments
```

## Method 2: Server-Level Configuration (Legacy)

### Benefits

- **Convenience**: API key is configured once at server startup
- **Backward Compatibility**: Works with existing configurations
- **Simpler Tool Calls**: No need to include API key in each request

### Configuration Options

#### Option A: Environment Variable

```bash
export URU_API_KEY="your-api-key-here"
npx uru-mcp
```

#### Option B: Command Line

```bash
npx uru-mcp --token your-api-key-here
```

#### Option C: Interactive Setup

```bash
npx uru-mcp --setup
```

### Claude Desktop Configuration

```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Example Tool Call

```json
{
  "method": "tools/call",
  "params": {
    "name": "example-tool",
    "arguments": {
      "message": "Hello, world!",
      "other_param": "value"
    }
  }
}
```

Note: No `api_key` parameter is needed when using server-level configuration.

## Hybrid Approach (Recommended)

You can combine both methods for maximum flexibility:

1. Configure a default API key at the server level (fallback)
2. Override it with per-request API keys when needed (priority)

This approach provides the best of both worlds:
- **Convenience**: Default authentication for regular use
- **Flexibility**: Per-request override for different users/contexts
- **Security**: Ability to use different keys for different operations

### Configuration

```bash
export URU_API_KEY="default-api-key"
npx uru-mcp
```

### Tool Calls

```json
// Uses default API key
{
  "method": "tools/call",
  "params": {
    "name": "tool1",
    "arguments": {
      "message": "Uses default key"
    }
  }
}

// Overrides with specific API key
{
  "method": "tools/call",
  "params": {
    "name": "tool2",
    "arguments": {
      "api_key": "override-api-key",
      "message": "Uses override key"
    }
  }
}
```

## Security Considerations

### Per-Request API Keys
- ✅ API keys are not stored in configuration files
- ✅ Different keys can be used for different operations
- ✅ Keys are only transmitted when needed
- ⚠️ Keys are visible in tool call logs (if debug mode is enabled)

### Server-Level Configuration
- ⚠️ API keys are stored in environment variables or config files
- ⚠️ Same key is used for all operations
- ✅ Keys are not visible in individual tool calls
- ⚠️ Requires server restart to change keys

## Migration Guide

### From Server-Level to Per-Request

1. Remove the API key from your environment variables or configuration
2. Update your Claude Desktop configuration to remove the `env` section
3. Restart the MCP server
4. The server will automatically add `api_key` parameters to all tools
5. Provide the API key in each tool call

### From Per-Request to Server-Level

1. Configure the API key using one of the server-level methods
2. Restart the MCP server
3. The server will no longer require `api_key` parameters in tool calls
4. Remove `api_key` from your tool call arguments

## Troubleshooting

### "Authentication required" Error

This error occurs when:
- No server-level API key is configured AND
- No `api_key` parameter is provided in the tool call

**Solution**: Either configure a server-level API key or provide `api_key` in your tool arguments.

### "Authentication failed" Error

This error occurs when:
- The provided API key is invalid or expired

**Solution**: Check that your API key is correct and has the necessary permissions.

### Tools Not Showing `api_key` Parameter

This happens when:
- A server-level API key is configured
- The server doesn't add `api_key` parameters when a default token exists

**Solution**: This is expected behavior. Remove the server-level API key if you want to use per-request authentication.

## Best Practices

1. **Use Per-Request API Keys** for new implementations
2. **Validate API Keys** before making tool calls
3. **Use Environment Variables** for server-level keys (never hardcode)
4. **Enable Debug Mode** during development to troubleshoot authentication issues
5. **Monitor API Key Usage** to detect unauthorized access
6. **Rotate API Keys** regularly for security

## Testing Authentication

Use the provided test script to verify authentication is working:

```bash
node test_api_key_auth.js
```

This will test both authentication methods and verify the server behaves correctly.

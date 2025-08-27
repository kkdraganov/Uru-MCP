# How Claude Gets Tool Names - MCP Protocol Explained

This document explains exactly how Claude Desktop discovers and uses tools through the Model Context Protocol (MCP), including how to test with localhost.

## Overview

Claude uses the **Model Context Protocol (MCP)** to discover and execute tools. MCP is a JSON-RPC 2.0 protocol that runs over STDIO (standard input/output) between Claude and MCP servers.

## The Tool Discovery Process

### 1. Server Startup
Claude starts the MCP server as a subprocess:
```bash
node bin/uru-mcp.js
```

### 2. Protocol Initialization
Claude sends an `initialize` request:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {},
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}
```

### 3. Tool Discovery (THE KEY STEP)
Claude sends a `tools/list` request to discover available tools:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list",
  "params": {}
}
```

### 4. Server Response
The MCP server responds with an array of available tools:
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "gmail_work__list_tools",
        "description": "List available Gmail tools for work account",
        "inputSchema": {
          "type": "object",
          "properties": {
            "api_key": {"type": "string"}
          }
        }
      },
      {
        "name": "slack_company__execute_tool",
        "description": "Execute Slack tools for company workspace",
        "inputSchema": {
          "type": "object",
          "properties": {
            "tool_name": {"type": "string"},
            "parameters": {"type": "object"}
          }
        }
      }
    ]
  }
}
```

### 5. Tool Execution
Claude can now call any discovered tool using `tools/call`:
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "gmail_work__list_tools",
    "arguments": {
      "api_key": "your-api-key"
    }
  }
}
```

## Using Localhost for Development

### Environment Variables
Set these environment variables to use localhost:
```bash
URU_PROXY_URL=http://localhost:3001
URU_API_KEY=your-api-key-here
URU_DEBUG=true
```

### Testing with Localhost
1. **Start your local MCP proxy server** on port 3001
2. **Configure the MCP server** to use localhost:
   ```bash
   URU_PROXY_URL=http://localhost:3001 node bin/uru-mcp.js
   ```
3. **Test tool discovery** using the provided test scripts

### Test Scripts Available
- `simple_mcp_demo.js` - Shows the protocol flow
- `test_local_proxy.js` - Tests with localhost proxy
- `test_client.js` - Comprehensive testing suite

## Key Points

1. **Protocol**: MCP uses JSON-RPC 2.0 over STDIO
2. **Discovery**: Tools are discovered via the `tools/list` method
3. **Execution**: Tools are called via the `tools/call` method
4. **Localhost**: The proxy URL can point to localhost for development
5. **Hierarchical**: This implementation uses a hierarchical namespace system

## Architecture

```
Claude Desktop
    ↓ (STDIO/JSON-RPC)
MCP Server (uru-mcp)
    ↓ (HTTP)
Proxy Server (localhost:3001 or production)
    ↓ (API calls)
Various Services (Gmail, Slack, etc.)
```

## Running the Demo

To see this in action:
```bash
# Run the simple demonstration
node simple_mcp_demo.js

# Test with localhost (requires local proxy)
node test_local_proxy.js

# Comprehensive testing
node test_client.js --key your-api-key --local
```

This explains exactly how Claude discovers tool names through the MCP protocol and how localhost fits into the development workflow.

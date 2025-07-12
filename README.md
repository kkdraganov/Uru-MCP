# Uru MCP

A Model Context Protocol (MCP) server that provides AI assistants with access to Uru Platform capabilities and tools.

## Overview

**Uru MCP** enables AI assistants to work directly with Uru Platform services through the Model Context Protocol. The server provides a standardized interface for accessing Uru's AI tools and capabilities.

The server works with MCP client applications such as [Claude Desktop](https://claude.ai/download), [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers), [Cursor](https://www.cursor.com/), and other MCP-compatible clients.

## ⚡ Quick Start

### Prerequisites

- **Node.js 18+** (required)
- **Uru Platform authentication token** (required)

### 1. Install MCP Server

Add the server configuration to your MCP settings file. MCP servers can be installed manually or at runtime via npx (recommended):

#### Configure for npx (recommended)

```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_API_KEY": "your-auth-token-here"
      }
    }
  }
}
```

### 2. Test the Installation

Ask your AI client: "Please list available Uru tools" or run the test command:

```bash
npx uru-mcp --test
```

## 🛠️ Setup & Configuration

### 1. Authentication

Obtain your Uru Platform authentication token and configure it using one of these methods:

#### Method 1: Interactive Setup (Recommended)

```bash
npx uru-mcp --setup
```

This will guide you through configuring:
- Authentication token (required)
- Debug mode preferences

#### Method 2: Environment Variables

```bash
export URU_API_KEY="your-auth-token-here"
export URU_DEBUG="false"
```

#### Method 3: Command Line Options

```bash
npx uru-mcp --token your-auth-token-here
```

### 2. Environment Variables

#### Required

- `URU_API_KEY`: Uru Platform authentication API key (required)

#### Optional

- `URU_DEBUG`: Enable debug mode (`true` or `false`, defaults to `false`)
- `URU_PROXY_URL`: MCP proxy URL (defaults to `https://mcp.uruenterprises.com`, use `http://localhost:3001` for development)

### 3. Client Integration

#### Claude Desktop

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS)
Edit: `%APPDATA%\Claude\claude_desktop_config.json` (Windows)
Edit: `~/.config/Claude/claude_desktop_config.json` (Linux)

```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_API_KEY": "your-auth-token-here"
      }
    }
  }
}
```

#### VS Code / Cursor

For VS Code with MCP extensions or Cursor, add to your MCP configuration file:

```json
{
  "uru": {
    "command": "npx",
    "args": ["uru-mcp"],
    "env": {
      "URU_API_KEY": "your-auth-token-here"
    }
  }
}
```

## 📡 STDIO Interface

The Uru MCP server implements the Model Context Protocol over STDIO transport, enabling communication with any MCP-compatible client.

### Command-Line Usage

```bash
# Start the server (typically called by MCP clients)
npx uru-mcp

# With environment variables
URU_API_KEY="your-token" npx uru-mcp

# With debug mode
URU_DEBUG=true npx uru-mcp

# With development proxy
URU_PROXY_URL="http://localhost:3001" npx uru-mcp

# With CLI options
npx uru-mcp --proxy-url http://localhost:3001 --debug
```

### JSON-RPC Message Format

The server uses JSON-RPC 2.0 over STDIO. All communication follows the MCP specification.

#### Server Information

```json
{
  "name": "uru-mcp",
  "version": "1.1.2",
  "title": "Uru Platform MCP Server",
  "description": "Model Context Protocol server providing access to Uru Platform AI tools and capabilities"
}
```

#### Available Methods

##### tools/list - List Available Tools

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list",
  "params": {}
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "tools": [
      {
        "name": "tool_name",
        "description": "Tool description",
        "inputSchema": {
          "type": "object",
          "properties": { ... },
          "required": [ ... ]
        }
      }
    ]
  }
}
```

##### tools/call - Execute a Tool

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "tool_name",
    "arguments": {
      "param1": "value1",
      "param2": "value2"
    }
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Tool execution result"
      }
    ]
  }
}
```

### Error Handling

The server returns standard JSON-RPC 2.0 error responses:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Authentication failed",
    "data": {
      "suggestion": "Check your URU_API_KEY environment variable"
    }
  }
}
```

**Common Error Codes:**
- `-32001`: Authentication failed
- `-32002`: Access forbidden
- `-32003`: Cannot connect to Uru Platform
- `-32601`: Tool not found
- `-32602`: Invalid parameters

## 🛠️ CLI Usage

### Available Commands

```bash
# Interactive setup wizard
npx uru-mcp --setup

# Test connection to backend
npx uru-mcp --test

# Show MCP client configuration examples
npx uru-mcp --claude-config

# Start server with custom settings
npx uru-mcp --token your-token --debug

# Show help
npx uru-mcp --help
```

### Configuration Options

| Option | Environment Variable | Description |
|--------|---------------------|-------------|
| `--token` | `URU_API_KEY` | Authentication token |
| `--debug` | `URU_DEBUG` | Enable debug logging |

## 🔍 Troubleshooting

### Common Issues

#### Connection Issues

**❌ "Cannot connect to proxy"**
- Verify your internet connection
- Test with: `npx uru-mcp --test`
- Check if `https://mcp.uruenterprises.com` is accessible

**❌ "Authentication failed"**
- Verify your token is correct and hasn't expired
- Check if your token has the required permissions
- Reconfigure with: `npx uru-mcp --setup`

**❌ "Proxy endpoint not found"**
- The Uru Platform service may be offline
- Contact your administrator or check service status

#### MCP Client Integration Issues

**❌ "Tools not appearing in MCP client"**
- Restart your MCP client after configuration changes
- Check the MCP server configuration in your client
- Verify the server is running: `npx uru-mcp --test`
- Ensure the `URU_API_KEY` environment variable is set correctly

**❌ "Server startup failures"**
- Check that Node.js 18+ is installed
- Verify the authentication token is provided
- Enable debug mode for detailed error information

### Debugging

#### Enable Debug Mode

Enable debug mode for detailed logging:

```bash
# Via command line
npx uru-mcp --debug

# Via environment variable
URU_DEBUG=true npx uru-mcp

# In MCP client configuration
{
  "uru": {
    "command": "npx",
    "args": ["uru-mcp"],
    "env": {
      "URU_API_KEY": "your-token",
      "URU_DEBUG": "true"
    }
  }
}
```

#### Testing and Validation

1. **Test connection:** `npx uru-mcp --test`
2. **View configuration examples:** `npx uru-mcp --claude-config`
3. **View help:** `npx uru-mcp --help`
4. **Run comprehensive tests:** `node test_client.js --token YOUR_TOKEN`

## 💻 Developer Guide

### Installation & Building

```bash
git clone https://github.com/kkdraganov/Uru-MCP
cd Uru-MCP
npm install
npm run start
```

### Running Tests

```bash
# Run comprehensive test suite
node test_client.js --token YOUR_TOKEN

# Run with debug logging
node test_client.js --token YOUR_TOKEN --debug

# Focus on MCP protocol compliance
node test_client.js --token YOUR_TOKEN --test-mode integration
```

### Project Structure

```
├── index.js                 # Main entry point
├── bin/uru-mcp.js           # CLI entry point
├── lib/
│   ├── mcp-server.js        # Core MCP server implementation
│   ├── config-manager.js    # Configuration management
│   └── error-handler.js     # Error handling utilities
├── test_client.js           # Comprehensive test suite
└── README.md               # Documentation
```

## 📚 Advanced Usage

### Configuration File

The Uru MCP server automatically creates and manages a configuration file at `~/.uru-mcp.json` when you run the setup wizard. This file stores your authentication token and debug preferences.

You can manually edit this file if needed:

```json
{
  "token": "your-auth-token-here",
  "debug": false
}
```

### Custom Integration

For custom MCP client integration, the server supports:

- **Transport:** STDIO (standard input/output)
- **Protocol:** JSON-RPC 2.0
- **Capabilities:** Tools (with listChanged support), Logging
- **Authentication:** Bearer token via environment variables

## 🔒 Security

- **Tokens:** Never commit authentication tokens to version control
- **Environment Variables:** Use environment variables for sensitive data
- **Network:** All communication uses HTTPS with the Uru Platform
- **Permissions:** Only grant necessary permissions to authentication tokens

## 🤝 Support

- **Documentation:** [GitHub Repository](https://github.com/kkdraganov/Uru-MCP)
- **Issues:** [Report Issues](https://github.com/kkdraganov/Uru-MCP/issues)
- **Discussions:** [GitHub Discussions](https://github.com/kkdraganov/Uru-MCP/discussions)

## 🔗 Related Resources

- [Model Context Protocol Documentation](https://github.com/modelcontextprotocol)
- [Uru Platform Documentation](https://uruenterprises.com)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ by Uru Enterprises LLC**

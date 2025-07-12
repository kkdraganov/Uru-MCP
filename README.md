# Uru MCP

A Model Context Protocol (MCP) server that provides AI assistants with access to Uru Platform capabilities and tools through an intelligent two-tier discovery system.

## Overview

**Uru MCP** enables AI assistants to work directly with Uru Platform services through the Model Context Protocol. The server provides a standardized interface for accessing Uru's AI tools and capabilities via an innovative two-tier tool discovery system that efficiently manages 400+ available tools.

The server works with MCP client applications such as [Claude Desktop](https://claude.ai/download), [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers), [Cursor](https://www.cursor.com/), and other MCP-compatible clients.

## 🔍 Two-Tier Tool Discovery System

The Uru MCP server implements an intelligent two-tier discovery system to efficiently manage the extensive catalog of 400+ available tools without overwhelming MCP clients.

### System Architecture

**Tier 1: Service Discovery**
- MCP clients initially see high-level service connections (e.g., "Gmail (Work - Kal)", "COMPANY", "PLATFORM")
- Each connection represents a specific service integration or account
- Prevents tool overload while maintaining discoverability

**Tier 2: Tool Exploration & Execution**
- Call any service connection to explore its specific tools
- Direct tool execution by name with automatic routing
- Dynamic tool loading ensures optimal performance

### How It Works

1. **Discovery Phase**: Call `tools/list` to see available service connections
2. **Exploration Phase**: Call a service connection tool to see its specific tools
3. **Execution Phase**: Call specific tools directly by name with parameters

### Example Workflow

```bash
# Step 1: Discover available services
tools/list → ["Gmail (Work - Kal)", "COMPANY", "PLATFORM", "Slack (Team)", ...]

# Step 2: Explore Gmail tools
call "Gmail (Work - Kal)" → Lists: GMAIL_SEND_EMAIL, GMAIL_FETCH_EMAILS, etc.

# Step 3: Execute specific tool
call "GMAIL_SEND_EMAIL" with parameters → Email sent via Gmail (Work - Kal)
```

### Tool Categories

The two-tier system organizes tools into the following categories:

**Base MCP Tools**
- `uru_help`: Interactive help system explaining the two-tier workflow
- Connection tools for each service integration (dynamically discovered)

**Uru Platform-Specific Tools** (accessed via service connections)
- **Email Services**: Gmail, Outlook integration tools
- **Productivity**: Calendar, Drive, document management tools
- **Communication**: Slack, Teams, messaging platform tools
- **Company Tools**: Custom n8n workflows and business processes
- **Platform Tools**: Core Uru platform capabilities and utilities

### Discovery Process

The tool discovery process follows MCP protocol standards with intelligent caching:

1. **Initial Connection**: MCP client connects to Uru MCP server
2. **Service Discovery**: Server queries `/list/apps` endpoint to get available service connections
3. **Connection Tool Creation**: Each service becomes a connection tool in the MCP client
4. **On-Demand Tool Loading**: When a connection tool is called, server queries `/list/apps/{app_name}/tools`
5. **Dynamic Execution**: Direct tool calls are routed to the appropriate service automatically
6. **Intelligent Caching**: Results are cached for 30 seconds to optimize performance

### Usage Examples

**Email Management Example**
```javascript
// Discover email services
tools/list → ["Gmail (Work - Kal)", "Outlook (Personal)", ...]

// Explore Gmail capabilities
call "Gmail (Work - Kal)" → Shows: GMAIL_SEND_EMAIL, GMAIL_FETCH_EMAILS, GMAIL_SEARCH, etc.

// Send an email
call "GMAIL_SEND_EMAIL" {
  "to": "colleague@company.com",
  "subject": "Project Update",
  "body": "Here's the latest status..."
}
```

**Company Workflow Example**
```javascript
// Discover company tools
tools/list → ["COMPANY", "PLATFORM", ...]

// Explore company workflows
call "COMPANY" → Shows: INVOICE_PROCESSOR, CUSTOMER_ONBOARDING, etc.

// Execute workflow
call "INVOICE_PROCESSOR" {
  "invoice_data": {...},
  "approval_required": true
}
```

### Configuration Requirements

**Authentication**
- **Required**: Valid Uru Platform API key (`URU_API_KEY` environment variable)
- **Permissions**: Token must have access to desired service integrations
- **Scope**: Different tools may require different permission levels

**Network Configuration**
- **Proxy URL**: Defaults to `https://mcp.uruenterprises.com`
- **Development**: Use `http://localhost:3001` for local development
- **Timeout**: Configurable request timeout (default: 30 seconds for discovery, 60 seconds for execution)

**Caching Configuration**
- **Tool Cache TTL**: 30 seconds (configurable via `cacheTimeout`)
- **App Cache TTL**: 30 seconds (configurable via `cacheTimeout`)
- **Benefits**: Reduces API calls and improves response times

**MCP Client Compatibility**
- **Protocol Version**: MCP 2025-06-18 specification
- **Transport**: STDIO (standard input/output)
- **Message Format**: JSON-RPC 2.0
- **Capabilities**: Tools (with listChanged support), Logging

**Environment Variables**
```bash
# Required
URU_API_KEY="your-uru-platform-token"

# Optional
URU_DEBUG="true"                                    # Enable debug logging
URU_PROXY_URL="https://mcp.uruenterprises.com"    # MCP proxy endpoint
```

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

Test the two-tier discovery system with your AI client:

```bash
# Test connection
npx uru-mcp --test

# Or ask your AI client:
"Please list available Uru tools"  # Shows service connections
"Call Gmail (Work - Kal)"          # Explore Gmail tools
"Send an email using GMAIL_SEND_EMAIL"  # Execute specific tool
```

### 3. Understanding the Two-Tier Workflow

When you first connect, you'll see service connections rather than individual tools:
- **Service Connections**: "Gmail (Work - Kal)", "COMPANY", "PLATFORM", etc.
- **Tool Exploration**: Call any service connection to see its available tools
- **Direct Execution**: Call specific tools by name with parameters

This design prevents overwhelming your AI client with 400+ tools while maintaining full access to all capabilities.

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

The Uru MCP server implements the Model Context Protocol over STDIO transport, enabling communication with any MCP-compatible client. The server uses the two-tier discovery system to efficiently manage tool access through standard MCP methods.

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
      "version": "2.0.0",
  "title": "Uru Platform MCP Server",
  "description": "Model Context Protocol server providing access to Uru Platform AI tools and capabilities"
}
```

#### Available Methods

##### tools/list - List Available Service Connections (Tier 1)

Returns service connection tools rather than individual tools to prevent overwhelming clients with 400+ tools.

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
        "name": "Gmail (Work - Kal)",
        "description": "Explore Gmail (Work - Kal) tools. Call this to see what specific tools are available for Gmail (Work - Kal), then call those tools directly by name.",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "required": []
        }
      },
      {
        "name": "COMPANY",
        "description": "Explore COMPANY tools. Call this to see what specific tools are available for COMPANY, then call those tools directly by name.",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    ]
  }
}
```

##### tools/call - Execute Tools (Tier 2 & 3)

Supports both service connection exploration (Tier 2) and direct tool execution (Tier 3).

**Service Connection Exploration (Tier 2):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/call",
  "params": {
    "name": "Gmail (Work - Kal)",
    "arguments": {}
  }
}
```

**Response (Tool List):**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "✅ **Gmail (Work - Kal) Tools Available** (15 tools)\n\n• **GMAIL_SEND_EMAIL**: Send emails via Gmail\n• **GMAIL_FETCH_EMAILS**: Retrieve emails from Gmail\n• **GMAIL_SEARCH**: Search Gmail messages\n\n**Next Step:** Call any of these tools directly by name with appropriate parameters."
      }
    ]
  }
}
```

**Direct Tool Execution (Tier 3):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "GMAIL_SEND_EMAIL",
    "arguments": {
      "to": "colleague@company.com",
      "subject": "Project Update",
      "body": "Here's the latest status..."
    }
  }
}
```

**Response (Execution Result):**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "Email sent successfully to colleague@company.com"
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

#### Two-Tier System Issues

**❌ "Only seeing connection tools, not specific tools"**
- This is expected behavior! The two-tier system shows service connections first
- Call a service connection (e.g., "Gmail (Work - Kal)") to explore its tools
- Then call specific tools directly by name

**❌ "Tool not found" errors**
- Ensure you're calling the exact tool name shown in the exploration phase
- Tool names are case-sensitive (e.g., "GMAIL_SEND_EMAIL" not "gmail_send_email")
- Use the help tool: call "uru_help" for workflow guidance

**❌ "Service connection returns no tools"**
- The service may not be properly configured in your Uru Platform account
- Check your token permissions for that specific service
- Contact your administrator to verify service integration setup

**❌ "Tools execute but use wrong account"**
- The system automatically routes to the correct account based on the service connection
- If you have multiple accounts for the same service, ensure you're calling the right connection
- Example: "Gmail (Work - Kal)" vs "Gmail (Personal)" will use different accounts

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

**Two-Tier System Testing:**
```bash
# Test the complete two-tier workflow
node test_client.js --token YOUR_TOKEN

# Test with debug logging to see tier transitions
node test_client.js --token YOUR_TOKEN --debug

# Test specific integration scenarios
node test_client.js --token YOUR_TOKEN --test-mode integration
```

**Manual Testing Workflow:**
1. Connect to MCP client and call `tools/list` - should see service connections
2. Call a service connection (e.g., "Gmail (Work - Kal)") - should see tool descriptions
3. Call a specific tool (e.g., "GMAIL_SEND_EMAIL") - should execute successfully
4. Verify tools are routed to correct accounts/services

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

### Two-Tier System Optimization

**Caching Strategy**
- Service connections are cached for 30 seconds to reduce API calls
- Tool definitions are cached per service to improve exploration performance
- Cache TTL can be configured via `cacheTimeout` parameter

**Performance Considerations**
- Initial `tools/list` call is fast (returns only service connections)
- Service exploration calls are cached and optimized
- Direct tool execution bypasses unnecessary discovery overhead
- Intelligent routing minimizes proxy round-trips

**Custom Integration Patterns**
```javascript
// Pattern 1: Service-specific workflows
async function handleEmailWorkflow(client) {
  // Explore Gmail tools
  const gmailTools = await client.callTool("Gmail (Work - Kal)", {});

  // Execute specific email operations
  await client.callTool("GMAIL_SEND_EMAIL", {
    to: "team@company.com",
    subject: "Automated Report",
    body: "Weekly summary attached"
  });
}

// Pattern 2: Multi-service orchestration
async function handleBusinessProcess(client) {
  // Get customer data from company tools
  const customerData = await client.callTool("CUSTOMER_LOOKUP", {id: "12345"});

  // Send notification via Slack
  await client.callTool("SLACK_SEND_MESSAGE", {
    channel: "#sales",
    message: `Customer ${customerData.name} updated`
  });
}
```

### Configuration File

The Uru MCP server automatically creates and manages a configuration file at `~/.uru-mcp.json` when you run the setup wizard. This file stores your authentication token and debug preferences.

You can manually edit this file if needed:

```json
{
  "token": "your-auth-token-here",
  "debug": false,
  "cacheTimeout": 30000
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

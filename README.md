# Uru MCP

A Model Context Protocol (MCP) server that provides AI assistants with access to Uru Platform capabilities through an advanced hierarchical tool namespace system that efficiently manages 400+ tools while maintaining full MCP protocol compliance.

## Overview

**Uru MCP v3.4.9** enables AI assistants to work directly with Uru Platform services through the Model Context Protocol. The server provides a standardized, MCP-compliant interface for accessing Uru's AI tools and capabilities via an innovative hierarchical tool namespace system with dynamic loading, intelligent caching, and automatic cleanup.

The server works seamlessly with MCP client applications such as [Claude Desktop](https://claude.ai/download), [VS Code](https://code.visualstudio.com/docs/copilot/chat/mcp-servers), [Cursor](https://www.cursor.com/), and other MCP-compatible clients.

## 🏗️ Advanced Hierarchical Tool Namespace System

The Uru MCP server implements an advanced hierarchical tool namespace system with dynamic loading capabilities that provides full MCP protocol compliance while efficiently managing large tool catalogs without overwhelming clients.

### System Architecture

**Core Components:**
- **Dynamic Tool Registry**: Runtime tool management with TTL-based cleanup and usage tracking
- **Intelligent Tool Loader**: Pre-loading and optimization with parallel loading capabilities
- **Namespace Manager**: Collision detection, normalization, and app-to-namespace mapping

**Namespace Discovery Tools**
- Tools ending in `__list_tools` (e.g., `gmail_work_kal__list_tools`, `platform__list_tools`)
- Each namespace represents a service integration or functional area
- Provides progressive tool discovery and dynamic loading

**Namespaced Tools**
- Tools prefixed with namespace (e.g., `gmail_work_kal__send_email`, `platform__manage_users`)
- Dynamic loading on-demand for optimal performance
- Intelligent pre-loading for high-priority namespaces

**MCP Protocol Compliance**
- Standard `tools/list` returns actual executable tools
- Proper pagination support with `nextCursor`
- Standard error codes and response formats
- Full capability declarations

### How It Works

1. **Discovery Phase**: Call `tools/list` to see namespace tools (list_tools and execute_tool for each namespace)
2. **Exploration Phase**: Call namespace list_tools (e.g., `gmail_work_kal__list_tools`) to see available tools
3. **Execution Phase**: Call namespace execute_tool (e.g., `gmail_work_kal__execute_tool`) with tool_name and parameters

### Example Workflow

```bash
# Step 1: Discover available namespace tools
tools/list → [gmail_work_kal__list_tools, gmail_work_kal__execute_tool, platform__list_tools, platform__execute_tool, ...]

# Step 2: Explore Gmail namespace
call gmail_work_kal__list_tools → Shows available Gmail tools

# Step 3: Execute specific tool via execute_tool
call gmail_work_kal__execute_tool with {"tool_name": "GMAIL_SEND_EMAIL", "parameters": {"to": "user@example.com", "subject": "Test"}} → Email sent via Gmail (Work - Kal)
```

### Tool Organization

The hierarchical system organizes tools into the following categories with intelligent caching and pre-loading:

**Discovery Tools**
- `uru_help` - Get help with the hierarchical tool system
- `*__list_tools` - Namespace discovery tools (e.g., `gmail_work_kal__list_tools`)

**Pre-loaded Namespaces** (automatically loaded for optimal performance)
- **Platform**: `platform__*` - Uru Platform management and administration
- **Company**: `company__*` - Workflow automation and business processes

**Dynamic Namespaces** (loaded on-demand)
- **Communication**: `gmail_work_kal__*`, `outlook_personal__*`, `slack_team__*`
- **Productivity**: `calendar__*`, `drive__*`, `tasks__*`
- **Development**: `github__*`, `deployment__*`, `monitoring__*`

**Tool Categories by Function**
- **Communication**: Email, messaging, notifications
- **Calendar**: Scheduling, meetings, events
- **Files**: Document management, storage, sharing
- **Administration**: User management, settings, configuration
- **Automation**: Workflow automation, integrations
- **Data**: Analytics, reporting, insights

### Discovery Process

The hierarchical tool discovery process follows MCP protocol standards with intelligent optimization:

1. **Initial Connection**: MCP client connects to Uru MCP server
2. **Namespace Discovery**: Server returns namespace discovery tools and pre-loaded high-priority tools
3. **Progressive Loading**: Namespace discovery tools (e.g., `gmail_work_kal_list_tools`) load tools on-demand
4. **Dynamic Registration**: Tools are registered in the dynamic tool registry for efficient access
5. **Direct Execution**: Namespaced tools are executed directly (e.g., `gmail_work_kal_send_email`)
6. **Intelligent Caching**: Tools and namespaces are cached with TTL and usage-based optimization

### Usage Examples

**Email Management Example (Hierarchical)**
```javascript
// Discover namespaces and tools
tools/list → [gmail_work_kal__list_tools, platform__list_tools, uru_help, ...]

// Explore Gmail namespace
call gmail_work_kal__list_tools → Loads and displays Gmail tools

// Send an email using namespaced tool
call gmail_work_kal__send_email {
  "to": "colleague@company.com",
  "subject": "Project Update",
  "body": "Here's the latest status..."
}
```

**Company Workflow Example (Two-Tool Pattern)**
```javascript
// Discover available namespace tools
tools/list → [company__list_tools, company__execute_tool, platform__list_tools, platform__execute_tool, ...]

// Explore company namespace
call company__list_tools → Shows: PROCESS_INVOICE, ONBOARD_CUSTOMER, etc.

// Execute workflow using execute_tool
call company__execute_tool {
  "tool_name": "PROCESS_INVOICE",
  "parameters": {
    "invoice_data": {...},
    "approval_required": true
  }
}
```

**Multi-Namespace Task Example**
```javascript
// Get platform information
call platform__list_tools → Shows platform management tools
call platform__execute_tool {
  "tool_name": "GET_USER_INFO",
  "parameters": { "user_id": "123" }
}

// Send notification about the user
call gmail_work_kal__execute_tool {
  "tool_name": "GMAIL_SEND_EMAIL",
  "parameters": {
    "to": "admin@company.com",
    "subject": "User Update",
    "body": "User information has been updated."
  }
}
```

### Configuration Requirements

**Authentication**
- **Required**: Valid Uru Platform API key (`URU_API_KEY` environment variable)
- **Permissions**: Token must have access to desired service integrations
- **Scope**: Different tools may require different permission levels

**Network Configuration**
- **Proxy URL**: Defaults to `https://mcp.uruintelligence.com`
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
URU_PROXY_URL="https://mcp.uruintelligence.com"    # MCP proxy endpoint
```

## ⚡ Quick Start

### Prerequisites

- **Node.js 18+** (required)
- **Uru Platform API key** (required)

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
        "URU_API_KEY": "your-auth-token-here",
        "URU_MAX_TOOLS_PER_PAGE": "50",
        "URU_PRELOAD_NAMESPACES": "platform,company"
      }
    }
  }
}
```

### 2. Test the Installation

Test the hierarchical namespace system with your AI client:

```bash
# Test connection and comprehensive functionality
npx uru-mcp --test

# Or ask your AI client:
"Please list available Uru tools"           # Shows namespace list_tools and execute_tool pairs
"Call gmail_work_kal__list_tools"           # Explore Gmail namespace
"Use gmail_work_kal__execute_tool to send an email"  # Execute specific tool
```

### 3. Understanding the Hierarchical Workflow

When you first connect, you'll see namespace discovery tools and pre-loaded tools:
- **Discovery Tools**: `gmail_work_kal__list_tools`, `platform__list_tools`, `uru_help`
- **Pre-loaded Tools**: High-priority tools from `platform` and `company` namespaces
- **Dynamic Loading**: Namespace tools are loaded on-demand when discovery tools are called
- **Direct Execution**: Namespaced tools are executed directly with full MCP compliance

This design prevents overwhelming your AI client with 400+ tools while maintaining full access to all capabilities.

## 🛠️ Setup & Configuration

### 1. Authentication

The Uru MCP server supports two authentication methods:

#### Method 1: Per-Request API Keys (Recommended)

Pass your API key as a parameter in each tool call. This method provides better security and flexibility:

```json
{
  "tool": "example-tool",
  "arguments": {
    "api_key": "your-auth-token-here",
    "message": "Hello world"
  }
}
```

When using this method, no server configuration is required.

#### Method 2: Server-Level Configuration (Legacy)

Configure a default API key at the server level using one of these methods:

**Interactive Setup:**
```bash
npx uru-mcp --setup
```

**Environment Variables:**
```bash
export URU_API_KEY="your-auth-token-here"
export URU_DEBUG="false"
```

**Command Line Options:**
```bash
npx uru-mcp --key your-api-key-here
```

> **Note:** When using per-request API keys, the server-level API key becomes optional. If both are provided, the per-request API key takes precedence.

### 2. Environment Variables

#### Required (for server-level authentication only)

- `URU_API_KEY`: Uru Platform authentication API key (optional if using per-request API keys)

#### Optional

- `URU_DEBUG`: Enable debug mode (`true` or `false`, defaults to `false`)
- `URU_PROXY_URL`: MCP proxy URL (defaults to `https://mcp.uruintelligence.com`, use `http://localhost:3001` for development)

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
      "args": ["uru-mcp@latest"],
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
      "version": "3.4.9",
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
npx uru-mcp --key your-api-key --debug

# Show help
npx uru-mcp --help
```

### Configuration Options

| Option | Environment Variable | Description |
|--------|---------------------|-------------|
| `--key` | `URU_API_KEY` | Uru Platform API key |
| `--debug` | `URU_DEBUG` | Enable debug logging |

## 🔍 Troubleshooting

### Common Issues

#### Connection Issues

**❌ "Cannot connect to proxy"**
- Verify your internet connection
- Test with: `npx uru-mcp --test`
- Check if `https://mcp.uruintelligence.com` is accessible

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
- Verify the Uru API key is provided
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
4. **Run comprehensive tests:** `node test_client.js --key YOUR_API_KEY`

**Two-Tier System Testing:**
```bash
# Test the complete two-tier workflow
node test_client.js --key YOUR_API_KEY

# Test with debug logging to see tier transitions
node test_client.js --key YOUR_API_KEY --debug

# Test specific integration scenarios
node test_client.js --key YOUR_API_KEY --test-mode integration
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
node test_client.js --key YOUR_API_KEY

# Run with debug logging
node test_client.js --key YOUR_API_KEY --debug

# Focus on MCP protocol compliance
node test_client.js --key YOUR_API_KEY --test-mode integration
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

The Uru MCP server automatically creates and manages a configuration file at `~/.uru-mcp.json` when you run the setup wizard. This file stores your Uru API key and debug preferences.

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
- **Authentication:** Bearer API key via environment variables or per-request API keys

## 🔒 Security

- **API Keys:** Never commit Uru API keys to version control
- **Per-Request Keys:** API keys in tool arguments provide better isolation than server-level keys
- **Environment Variables:** Use environment variables for sensitive data when using server-level authentication
- **Network:** All communication uses HTTPS with the Uru Platform
- **Permissions:** Only grant necessary permissions to Uru API keys
- **Key Rotation:** Per-request API keys make key rotation easier and more secure

## 📋 Changelog

### Version 3.4.9
- Version bump to 3.4.9 for latest package updates
- Complete version synchronization across all package files
- No breaking changes; maintains full backward compatibility

### Version 3.4.8
- Updated mcp-server.js with latest improvements and bug fixes
- Complete version synchronization across all package files
- No breaking changes; maintains full backward compatibility

### Version 3.4.7
- Version bump to 3.4.7 for latest package updates
- Fixed version inconsistency in bin/uru-mcp.js (was 3.4.5)
- Complete version synchronization across all package files
- No functional changes; release ensures consistent versioning

### Version 3.4.6
- Complete version synchronization across all package files
- Updated package.json, lib/mcp-server.js, and README.md to version 3.4.6
- Fixed version inconsistencies (mcp-server.js was 3.4.2, README was 3.2.15)
- No functional changes; release ensures consistent versioning for publish

### Version 3.2.15
- Version synchronization across package.json, CLI banner, server info, and documentation
- No functional changes; release ensures consistent versioning for publish

### Version 3.2.9
- **Execution Timeout**: Increased default tool execution timeout to 3 minutes (180s). You can still override via config.timeout (validated 1s–300s).
- **No Functional Changes**: All other behavior unchanged from 3.2.8.

### Version 3.2.8
- **Cache Invalidation**: Added automatic cache clearing on server startup to ensure fresh tools are always loaded
- **Development Experience**: Tools updated on Uru Platform now appear immediately when Claude restarts
- **Cache Management**: Added `clearCaches()` methods to DynamicToolRegistry, ToolNamespaceManager, and IntelligentToolLoader
- **Startup Optimization**: Server now clears all caches before pre-warming to guarantee fresh tool discovery

### Version 3.2.7
- **Clean Release**: Bumped to 3.2.7 to avoid npm registry caching issues after unpublishing 3.2.5
- **Complete Version Synchronization**: All files consistently updated to version 3.2.7
- **Package Integrity**: Resolved npm package corruption and republishing conflicts
- **Testing Verification**: Confirmed 93% test success rate with proper tool discovery and execution

### Version 3.2.5
- **Version Synchronization**: Fixed version mismatch between package.json and binary
- **Package Integrity**: Resolved npm package corruption issue where 3.2.4 contained 3.2.3 binary
- **Complete Version Alignment**: Updated all files to consistently use version 3.2.5
- **Testing Verification**: Confirmed 93% test success rate with proper tool discovery and execution

### Version 3.2.3
- **Bug Fix**: Fixed namespace parsing issue where underscores were incorrectly converted to spaces
- **Gmail Integration**: Resolved Gmail tool loading failures for namespaces like `gmail_f7518884`
- **Response Format**: Verified MCP response format compliance and text field preservation
- **Version Consistency**: Updated package version to 3.2.3 across all components

### Version 3.1.0
- **Version Consistency**: Updated package version to 3.1.0 across all components
- **Documentation Refinement**: Removed version-specific references for cleaner documentation
- **Package Maintenance**: Synchronized version numbers across all files

### Version 3.0.1
- **Documentation Updates**: Updated all documentation to use URU_API_KEY instead of URU_TOKEN
- **CLI Consistency**: Changed CLI argument from --token to --key for better clarity
- **Terminology Standardization**: Consistent use of "Uru API key" throughout documentation
- **Configuration Examples**: Updated all MCP client configuration examples

### Version 3.0.0
- **Hierarchical Tool Namespace System**: Complete architectural redesign with dynamic loading
- **Dynamic Tool Registry**: TTL-based cleanup, usage tracking, and intelligent caching
- **Intelligent Tool Loader**: Pre-loading, parallel loading, and performance optimization
- **Namespace Management**: Collision detection, normalization, and app-to-namespace mapping
- **Enhanced Performance**: Efficient management of 400+ tools with configurable limits
- **Full MCP Compliance**: JSON-RPC 2.0 over STDIO with hierarchical namespacing
- **Advanced Configuration**: Environment-based configuration with optimization options

### Version 2.2.0
- **Enhanced Authentication**: Added support for per-request API keys passed as tool parameters
- **Environment Variable Fallback**: Maintained backward compatibility with `URU_API_KEY` environment variable
- **Dynamic Tool Schemas**: API key parameter automatically added as required/optional based on server configuration
- **Improved Security**: Better isolation and key rotation capabilities with per-request authentication
- **Comprehensive Documentation**: Added detailed authentication and migration guides

### Version 2.1.0
- Added apps caching and improved tool discovery
- Enhanced two-tier tool system architecture

## 🤝 Support

- **Documentation:** [GitHub Repository](https://github.com/kkdraganov/Uru-MCP)
- **Issues:** [Report Issues](https://github.com/kkdraganov/Uru-MCP/issues)
- **Discussions:** [GitHub Discussions](https://github.com/kkdraganov/Uru-MCP/discussions)

## 🔗 Related Resources

- [Model Context Protocol Documentation](https://github.com/modelcontextprotocol)
- [Uru Platform Documentation](https://uruintelligence.com)
- [MCP Server Examples](https://github.com/modelcontextprotocol/servers)

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ by Uru Enterprises LLC**

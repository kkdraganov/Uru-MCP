# Uru Intelligence Platform - System Architecture

## Overview

The Uru Intelligence Platform is a multi-tenant SaaS application that provides businesses with AI-powered automation through a unified interface. The platform combines company-specific tools with personal integrations, accessible through an intelligent chat interface powered by AI agents.

## Core Architecture Principles

- **Service Separation**: Three distinct Docker services with clear responsibilities
- **Multi-tenancy**: Workspace-based isolation using Supabase Row-Level Security
- **Tool Aggregation**: Unified MCP proxy combining multiple tool sources via SSE connectors
- **Scalability**: Horizontally scalable services with stateless design
- **Security-First**: Industry-standard authentication with simplified token management
- **SSE-First Integration**: Composio Connector MCP Server Strategy with app-specific SSE endpoints

## High-Level Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    Frontend     │     │    Backend      │     │   MCP Proxy     │
│   (Port 3000)   │────▶│   (Port 8000)   │────▶│   (Port 3001)   │
└─────────────────┘     └────────┬────────┘     └────────┬────────┘
                                 │                       │
                                 │                       ├─────────▶ n8n Tools
                                 │                       │
                                 │                       ├─────────▶ Composio SSE Connectors
                                 │                       │           ├─ Gmail Connector (SSE)
                                 │                       │           ├─ Slack Connector (SSE)
                                 │                       │           └─ Drive Connector (SSE)
                                 │                       │
                                 │                       └─────────▶ Platform Tools
                    ┌────────────┴────────────┐
                    │      Supabase           │
                    │  (Auth + Database)      │
                    └─────────────────────────┘

Internal Tool Access (Backend):
┌─────────────────┐
│    Backend      │────▶ uru-mcp (MCP Server) ────▶ MCP Proxy
│  Chat Engine    │
└─────────────────┘

External Access:
┌─────────────────┐
│ Claude Desktop  │
│   Slack Bot     │────▶ uru-mcp (MCP Server) ────▶ MCP Proxy
│   Other Bots    │      (npm package)
└─────────────────┘
```

## Service Architecture (of which Uru MCP will have access)

### 1. MCP Proxy Service

The MCP Proxy acts as a **stateless unified gateway** for AI tool access, aggregating tools from multiple sources without managing integration state or OAuth flows.

**Key Responsibilities:**
- **Tool Aggregation**: Combine tools from n8n, Composio, and Platform sources
- **Stateless Tool Execution**: Route tool executions to appropriate backends without state management
- **Two-Tier Discovery**: Implement MCP-compliant app/tools discovery system
- **Authentication Delegation**: Validate API keys through Backend Service (no direct OAuth management)

**Service Boundaries (CRITICAL):**
- **DOES NOT**: Initiate OAuth connections, manage integration state, or handle user onboarding
- **DOES**: Aggregate tools from pre-configured integrations and execute tools on behalf of authenticated users
- **Backend Responsibility**: All OAuth flows, integration management, and user state handled by Backend Service

**Tool Sources:**
- **Company Tools**: Custom n8n workflows exposed as tools (client database queries, transcript analysis, vendor agreement search)
- **Personal Tools**: User-connected integrations via Composio SSE connectors following the Composio Connector MCP Server Strategy
- **Platform Tools**: Uru-native platform features proxied to Backend `/platform/*` endpoints

**Composio SSE Connector Integration:**
- **Single MCP Server Per App**: One Composio Connector MCP server per third-party application (Gmail, Slack, Google Drive, etc.)
- **Multi-tenant SSE Transport**: Each connector uses Server-Sent Events with user isolation through URL parameters
- **Connection Format**: `https://mcp.composio.dev/composio/server/{server_id}/mcp?user_id={supabase_user_id}&connected_account_id={ca_xxx}`
- **Automatic Token Management**: Composio handles OAuth token injection and SaaS API calls transparently
- **Normalized Responses**: Streamed JSON results with format `{data, successful, error, log_id}`

**Connector MCP Server Strategy**
- **TL;DR:** For every third-party application we spin up a Connector MCP server (an SSE-based MCP endpoint). Each connector is multi-tenant—it selects the correct Composio Connected Account by the user_id included in the call.
- The platform implements a sophisticated integration architecture using Composio's V3 SSE (Server-Sent Events) connector pattern:

**Core Strategy:**
- **Single MCP Server Per App**: Deploy one Composio Connector MCP server per third-party application (Gmail, Slack, Google Drive, etc.)
- **Multi-tenant SSE Transport**: Each connector uses Server-Sent Events with user isolation through URL parameters
- **Automatic Token Management**: Composio handles OAuth token injection and SaaS API calls transparently
- **Normalized Responses**: All tools return consistent JSON format: `{data, successful, error, log_id}`

**Connection Architecture:**
```
Agent → MCP Proxy → SSE Connector → Composio → Third-Party API
  ↓         ↓           ↓            ↓           ↓
User ID → Validation → User Context → OAuth Token → API Response
```

**Implementation Benefits:**
- **Simplified Integration**: No direct OAuth token management in application code
- **Better Multi-tenancy**: User isolation built into connection context
- **Real-time Streaming**: Immediate response streaming for long-running operations
- **MCP Compliance**: Follows Model Context Protocol standards for agent integration
- **Automatic Reconnection**: Built-in connection recovery and retry mechanisms

**Technology Stack:**
- Node.js with Express (stateless design)
- Composio V3 SDK for SSE connector management
- Connection to n8n via persistent SSE
- HTTP proxy for Platform Tools to Backend

**Composio SSE Connector Implementation:**
- **App-Specific Connectors**: Creates dedicated SSE connection per third-party app (Gmail, Slack, Google Drive)
- **Multi-Tenant Context**: Each connector handles multiple users through URL parameters
- **Connection Management**: Establishes and maintains SSE connections using Composio V3 SDK
- **Tool Aggregation**: Combines tools from all active SSE connectors into unified catalog
- **Message Protocol**: Handles `EXECUTE` messages with tool slugs and streams back normalized responses

**MCP Server Connection Pattern:**
```javascript
// Example MCP server setup in MCP Proxy
const gmailConnector = new ComposioConnector({
  serverId: 'gmail_server_123',
  apiKey: process.env.COMPOSIO_API_KEY
});

await gmailConnector.connect({
  userId: 'supabase_user_123'
});
```

**REST API Endpoints (Uru MCP Server Integration):**
- `GET /list/apps`: Returns array of available app names (includes "Company" for n8n tools, "Platform" for Uru-native tools)
- `GET /list/apps/{app_name}/tools`: Returns MCP-compliant tool schemas for the specified app from /list/apps
- `POST /execute/{tool_slug}`: Executes the specified tool using slug from /list/apps/{app_name}/tools response

**Authentication:**
- API key validation delegated to Backend Service
- Pre-validated user context received from Backend
- Workspace isolation enforced through Backend validation



## How the uru-mcp (MCP Server) fits in (THE PACKAGE DEFINED IN THIS REPOSITORY, github.com/kkdraganov/Uru-MCP)

A standalone npm package that creates an MCP Server for the Uru Platform, exposing MCP (Model Context Protocol) functionality following the MCP standard. It acts as a bridge between MCP-compliant clients (like Claude Desktop) and the MCP Proxy. Hosted separately at https://github.com/kkdraganov/Uru-MCP

**Key Features:**
- Installed via STDIO with npx: `npx uru-mcp`
- Standard MCP protocol implementation
- Pass-through to MCP Proxy HTTP API

**MCP Standard Endpoints:**
- `/tools/list`: List available tools (queries MCP Proxy)
- `/tools/execute`: Execute a specific tool (via MCP Proxy)
- `/resources`: List available apps/resources
- `/prompts`: Prompt-related operations (if implemented)

**Configuration:**
- Receives API key from Claude Desktop config
- Passes API key to MCP Proxy for all requests
- Maintains MCP protocol compliance while using HTTP backend

## Authentication & Authorization Architecture

### Core Authentication Components

**1. Primary Session Management (Web Application)**
- **JWT Access Tokens**: Short-lived (1 hour), workspace-scoped
- **Refresh Tokens**: Long-lived (30 days), secure rotation
- **Session Cookies**: HttpOnly, SameSite=Strict for web security

**2. API Key System (External Access)**
- **User API Keys**: Industry-standard API keys for external services
- **Format**: `uru_{64_hex_characters}` - 64 characters of cryptographically secure random data
- **Storage**: AES-256-GCM encryption-only for security and external service integration
- **Single Key Constraint**: One API key per user per workspace for simplified management
- **Scopes**: Granular permissions (read, write, execute)
- **Usage**: Claude Desktop, Slack bots, and other external integrations
- **User Management**: Automatic generation on account creation, user-controlled regeneration

### Authentication Flows

**Web Application Flow:**
1. User logs in via Supabase Auth
2. Backend generates JWT access token + refresh token pair
3. Frontend stores tokens securely
4. API requests use JWT access token in Authorization header
5. Automatic refresh when access token expires

**External Integration Flow:**
1. API key automatically created for user in settings dashboard
2. API key configured in external service (e.g. Claude Desktop)
3. External service sends requests with API key
4. Backend validates API key using decryption-based lookup and extracts workspace context

## Data Flow & Tool Execution

3. **Tool Discovery**:
   - Backend uses npx STDIO-installed uru-mcp MCP server for tool discovery
   - Implements two-tier discovery system (see "Tool Discovery Process" section below)
   - Discovers available apps and loads specific tools as needed
4. **Tool Selection**:
   - Agent determines which apps have relevant tools
   - Requests specific app tools via uru-mcp MCP server following MCP standards
5. **Tool Execution**:
   - Agent executes necessary tools through uru-mcp MCP server
   - **External Tools**: uru-mcp server routes execution requests to MCP Proxy
   - **Composio Tools**: MCP Proxy uses MCP servers to execute tools via Composio
     - Connects to MCP server: `https://mcp.composio.dev/composio/server/{server_id}/mcp?user_id={supabase_user_id}&connected_account_id={ca_xxx}`
     - Sends `EXECUTE` message with tool slug and arguments
     - Composio handles OAuth token injection automatically
     - Receives normalized response: `{data, successful, error, log_id}`
   - **Company Tools**: MCP Proxy routes to n8n workflows
   - **Platform Tools**: Backend executes platform tools directly via internal modules
6. **Response**: Results streamed back to user via SSE or API response

### Tool Discovery Process

**MCP Standards Compliant Two-Tier System** (to manage 400+ potential tools):

1. **Resource Discovery**:
   - Backend queries uru-mcp MCP server using standard MCP protocol
   - uru-mcp server exposes `/resources` endpoint that requests `/list/apps` from MCP Proxy
   - Returns high-level app list: `["CALENDAR", "DRIVE", "SLACK", "COMPANY", "PLATFORM"]`
     - `COMPANY` represents n8n workflows
     - `PLATFORM` represents Uru-native platform tools
   - Agent can understand available capabilities through MCP-compliant tool definitions

2. **Tool Listing**:
   - Backend requests specific tools via uru-mcp MCP server (`tools/list` method)
   - uru-mcp server queries `/list/apps/{app_name}/tools` from MCP Proxy which returns ~20 tools for that specific app in MCP-standard format
   - Backend agent selects only the apps it wants to load tools from
   - Manageable number for agent processing with proper MCP tool schemas

**MCP Standards Compliance:**
- All tool discovery follows MCP protocol specifications
- Tool definitions include proper JSON schemas for parameters
- Error handling follows MCP error response format
- Supports MCP resource and prompt discovery patterns

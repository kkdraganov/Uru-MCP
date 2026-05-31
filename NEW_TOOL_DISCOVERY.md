# MCP Proxy Server: Hierarchical Tool Namespace Support

## Executive Summary

This document outlines the architectural changes required for the MCP Proxy Server to support the Hierarchical Tool Namespace with Dynamic Loading pattern implemented in the Uru MCP Server. The changes enable efficient management of 400+ tools while maintaining full MCP protocol compliance and a canonical wrapper execution contract.

## Current State Analysis

### Existing MCP Proxy Architecture

The MCP Proxy Server currently operates as a **stateless unified gateway** with the following characteristics:

**Current Tool Discovery Flow:**
```
MCP Client → Uru MCP Server → MCP Proxy → Tool Sources
                ↓                ↓           ↓
            tools/list    GET /list/apps   [n8n, Composio, Platform]
                ↓                ↓
            Flat List    App-specific tools
```

**Current API Endpoints:**
- `GET /list/apps` - Returns array of available app names
- `GET /list/apps/{app_name}/tools` - Returns MCP-compliant tool schemas for specific app
- `POST /execute/{namespace}__execute_tool` - Executes provider tools through a namespace wrapper

**Current Tool Routing:**
- Top-level tools are namespace wrappers such as `outlook_lloyd__list_tools` and `outlook_lloyd__execute_tool`
- Provider tools are selected through the wrapper payload: `{ "tool_name": "OUTLOOK_GET_PROFILE", "parameters": {} }`
- Large provider catalogs are loaded progressively rather than all at startup
- Personal integrations do not use `_app_context` or `X-App-Context`; routing uses the wrapper name plus canonical namespace/connection headers

### Limitations of Current Architecture

1. **Naming Conflicts**: Tools with same names across different apps cause conflicts
2. **Performance Issues**: Loading 400+ tools simultaneously overwhelms MCP clients
3. **Poor Organization**: Flat tool structure makes discovery difficult
4. **Scalability Concerns**: No mechanism for dynamic loading/unloading
5. **Limited Discoverability**: No hierarchical organization for tool exploration

## New Architecture Requirements

### Hierarchical Tool Namespace Structure

**Namespace Format:** `{namespace}__list_tools` and `{namespace}__execute_tool`

**Examples:**
- `gmail_work_kal__execute_tool` - Executes Gmail provider tools in the work account namespace
- `platform__execute_tool` - Executes first-party platform tools
- `company__execute_tool` - Executes company workflow tools
- `slack_team__execute_tool` - Executes Slack provider tools in the team workspace

**Namespace Discovery Tools:**
- `{namespace}__list_tools` - Discover tools within specific namespace
- `{namespace}__execute_tool` - Execute a provider tool returned by discovery

### Advanced Dynamic Loading Capabilities

The implementation includes sophisticated loading mechanisms:

**Key Features:**
1. **Lazy Loading**: Load namespace tools only when requested via discovery tools
2. **Intelligent Caching**: Cache frequently used namespaces with configurable TTL (default: 5 minutes)
3. **Pre-loading**: Automatically pre-load high-priority namespaces (platform, company)
4. **Memory Management**: Automatic cleanup of unused namespaces with usage-based retention
5. **Parallel Loading**: Concurrent namespace loading for improved performance
6. **Collision Detection**: Automatic namespace collision detection and resolution
7. **Usage Tracking**: Monitor namespace access patterns for optimization

### Tool Registry Architecture

**Components:**
- **DynamicToolRegistry**: Manages tool caching, namespace lifecycle, and collision detection
- **ToolNamespaceManager**: Handles namespace normalization, app mapping, and denormalization
- **IntelligentToolLoader**: Implements loading strategies, pre-loading, and performance optimization

**Configuration Options:**
- `URU_MAX_NAMESPACES`: Maximum cached namespaces (default: 20)
- `URU_CACHE_TIMEOUT`: Cache timeout in milliseconds (default: 300000)
- `URU_PRELOAD_NAMESPACES`: Comma-separated list of namespaces to pre-load
- `URU_ENABLE_PARALLEL_LOADING`: Enable concurrent loading (default: true)

## Proxy Modifications Required

### 1. Enhanced Tool Discovery Endpoints

**New/Modified Endpoints:**

```javascript
// Enhanced app listing with namespace metadata
GET /list/apps
Response: [
  {
    "name": "Gmail Work Kal",
    "namespace": "gmail_work_kal",
    "icon": "📧",
    "category": "communication",
    "toolCount": 15
  },
  // ... other apps
]

// Namespace-aware tool listing
GET /list/apps/{app_name}/tools?namespace={namespace}
Response: {
  "namespace": "gmail_work_kal",
  "tools": [...],
  "metadata": {
    "loadedAt": "2025-01-12T10:30:00Z",
    "toolCount": 15,
    "category": "communication"
  }
}

// New namespace discovery endpoint
GET /namespaces
Response: {
  "namespaces": [
    {
      "name": "gmail_work_kal",
      "displayName": "Gmail Work Kal",
      "icon": "📧",
      "category": "communication",
      "priority": "high",
      "toolCount": 15,
      "loaded": true
    }
    // ... other namespaces
  ]
}
```

### 2. Tool Execution Routing Enhancement

**Current Execution Flow:**
```
POST /execute/{namespace}__execute_tool
Headers:
  X-Namespace: {namespace}
  X-Connected-Account-Id: {connection_id}   # optional when known
Body:
  { "tool_name": "{provider_tool}", "parameters": {} }
```

**Enhanced Execution Flow:**
```javascript
// Canonical wrapper execution
POST /execute/{namespace}__execute_tool
// Examples:
// POST /execute/outlook_lloyd__execute_tool
// POST /execute/platform__execute_tool

// Enhanced routing logic
function routeToolExecution(wrapperToolName, args, headers) {
  const namespace = wrapperToolName.replace(/__execute_tool$/, '');

  return executeOnBackend(wrapperToolName, {
    tool_name: args.tool_name,
    parameters: args.parameters || {}
  }, {
    namespace,
    connectedAccountId: headers['X-Connected-Account-Id']
  });
}
```

### 3. Namespace Management Layer

**New Proxy Components:**

```javascript
// Namespace Registry
class ProxyNamespaceRegistry {
  constructor() {
    this.namespaces = new Map();
    this.appMappings = new Map();
    this.loadedTools = new Map();
  }
  
  registerNamespace(appName, namespace, metadata) {
    this.namespaces.set(namespace, {
      appName,
      metadata,
      loadedAt: Date.now(),
      tools: new Set()
    });
    this.appMappings.set(appName, namespace);
  }
  
  getNamespaceForApp(appName) {
    return this.appMappings.get(appName);
  }
  
  isNamespaceLoaded(namespace) {
    return this.namespaces.has(namespace);
  }
}

// Tool Router with Wrapper Namespace Support
class NamespaceAwareToolRouter {
  constructor(namespaceRegistry) {
    this.registry = namespaceRegistry;
  }
  
  async routeExecution(toolName, args, context) {
    if (!toolName.endsWith('__execute_tool')) {
      throw new Error(`Use <namespace>__execute_tool instead of direct provider tool '${toolName}'`);
    }
    return this.handleWrapperTool(toolName, args, context);
  }
  
  async handleWrapperTool(wrapperToolName, args, context) {
    const namespace = wrapperToolName.replace(/__execute_tool$/, '');
    const namespaceInfo = this.registry.namespaces.get(namespace);
    
    if (!namespaceInfo) {
      throw new Error(`Namespace '${namespace}' not found`);
    }
    
    return this.executeOnBackend(wrapperToolName, {
      tool_name: args.tool_name,
      parameters: args.parameters || {}
    }, {
      ...context,
      namespace,
      connectedAccountId: namespaceInfo.connected_account_id
    });
  }
}
```

### 4. Canonical Direct-Call Rejection

**Direct Provider Tool Rejection:**
```javascript
class DirectProviderToolRejector {
  reject(toolName) {
    throw new Error(
      `Direct tool '${toolName}' is not supported. Use <namespace>__list_tools, then <namespace>__execute_tool with { tool_name, parameters }.`
    );
  }
}
```

## Implementation Steps

### Phase 1: Core Infrastructure (Week 1-2)

1. **Namespace Registry Implementation**
   - Create `ProxyNamespaceRegistry` class
   - Implement namespace-to-app mapping
   - Add namespace metadata storage

2. **Enhanced API Endpoints**
   - Modify `GET /list/apps` to include namespace metadata
   - Add `GET /namespaces` endpoint
   - Enhance `GET /list/apps/{app_name}/tools` with namespace support

3. **Tool Router Enhancement**
   - Implement `NamespaceAwareToolRouter`
   - Add wrapper tool name parsing
   - Reject obsolete direct provider-tool calls with clear recovery guidance

### Phase 2: Dynamic Loading (Week 3-4)

1. **Lazy Loading Implementation**
   - Add on-demand namespace loading
   - Implement caching with TTL
   - Add memory management

2. **Performance Optimization**
   - Implement parallel namespace loading
   - Add predictive loading for high-priority namespaces
   - Optimize tool discovery performance

### Phase 3: Advanced Features (Week 5-6)

1. **Intelligent Caching**
   - Usage-based cache prioritization
   - Automatic cache cleanup
   - Cache warming strategies

2. **Monitoring and Metrics**
   - Namespace usage tracking
   - Performance metrics
   - Error rate monitoring

## Testing Strategy

### Unit Tests

```javascript
describe('NamespaceAwareToolRouter', () => {
  test('should route wrapper tools correctly', async () => {
    const result = await router.routeExecution(
      'gmail_work_kal__execute_tool',
      {
        tool_name: 'GMAIL_SEND_EMAIL',
        parameters: { to: 'test@example.com' }
      },
      { userId: 'user123' }
    );
    expect(result).toBeDefined();
  });
  
  test('should reject direct provider tools with guidance', async () => {
    await expect(router.routeExecution(
      'GMAIL_SEND_EMAIL',
      { to: 'test@example.com' },
      { userId: 'user123' }
    )).rejects.toThrow('__execute_tool');
  });
});
```

### Integration Tests

```javascript
describe('MCP Proxy Integration', () => {
  test('should discover namespaces correctly', async () => {
    const response = await request(app)
      .get('/namespaces')
      .expect(200);
    
    expect(response.body.namespaces).toContainEqual(
      expect.objectContaining({
        name: 'gmail_work_kal',
        category: 'communication'
      })
    );
  });
  
  test('should execute wrapper tools', async () => {
    const response = await request(app)
      .post('/execute/gmail_work_kal__execute_tool')
      .send({
        tool_name: 'GMAIL_SEND_EMAIL',
        parameters: { to: 'test@example.com', subject: 'Test' }
      })
      .expect(200);
    
    expect(response.body).toHaveProperty('success', true);
  });
});
```

### End-to-End Tests

1. **MCP Client Compatibility**
   - Test with Claude Desktop
   - Test with custom MCP clients
   - Verify protocol compliance

2. **Performance Testing**
   - Load testing with 400+ tools
   - Namespace loading performance
   - Memory usage validation

3. **Contract Compatibility**
   - Test existing MCP clients continue using standard `tools/list` and `tools/call`
   - Verify direct provider tool execution is rejected with actionable guidance
   - Validate canonical wrapper execution scenarios

## Backward Compatibility

### Existing Client Support

**Canonical Compatibility:**
- MCP clients continue using standard `tools/list` and `tools/call`
- Direct provider tool names are no longer executed by guessing across namespaces
- Obsolete direct calls return an actionable error pointing to `<namespace>__list_tools` and `<namespace>__execute_tool`
- Platform compatibility is maintained at the MCP protocol boundary, not through hidden app-context routing

### Configuration Options

```javascript
// Proxy configuration
{
  "namespaceSupport": {
    "enabled": true,
    "canonicalWrapperExecution": true,
    "autoMigration": false
  },
  "performance": {
    "maxNamespaces": 20,
    "cacheTimeout": 300000,
    "preloadNamespaces": ["platform", "company"]
  }
}
```

## Benefits and Impact

### Scalability Improvements

1. **Tool Management**: Efficient handling of 400+ tools through dynamic loading
2. **Memory Optimization**: Reduced memory footprint through selective loading
3. **Performance**: Faster tool discovery and execution
4. **Organization**: Clear hierarchical structure for better UX

### Developer Experience

1. **Clear Namespacing**: Eliminates naming conflicts
2. **Better Discovery**: Hierarchical exploration of available tools
3. **Predictable Routing**: Consistent tool execution patterns
4. **Debugging**: Enhanced logging and error messages with namespace context

### Ecosystem Benefits

1. **MCP Compliance**: Full adherence to MCP protocol standards
2. **Future-Proof**: Extensible architecture for additional tool sources
3. **Interoperability**: Compatible with existing and future MCP clients
4. **Standards**: Establishes patterns for other MCP implementations

This architecture positions the MCP Proxy Server as a scalable, efficient, and standards-compliant gateway for AI tool access while keeping execution on a single canonical wrapper contract.

# MCP Proxy Server: Hierarchical Tool Namespace Support

## Executive Summary

This document outlines the architectural changes required for the MCP Proxy Server to support the new Hierarchical Tool Namespace with Dynamic Loading pattern implemented in the Uru MCP Server. The changes enable efficient management of 400+ tools while maintaining full MCP protocol compliance and backward compatibility.

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
- `POST /execute/{tool_slug}` - Executes specified tool using original tool name

**Current Tool Routing:**
- Tools are identified by their original names (e.g., `send_email`, `create_calendar_event`)
- No namespace separation - potential naming conflicts
- All tools loaded simultaneously - performance issues with 400+ tools
- App context passed via headers (`X-App-Context`) and request body (`_app_context`)

### Limitations of Current Architecture

1. **Naming Conflicts**: Tools with same names across different apps cause conflicts
2. **Performance Issues**: Loading 400+ tools simultaneously overwhelms MCP clients
3. **Poor Organization**: Flat tool structure makes discovery difficult
4. **Scalability Concerns**: No mechanism for dynamic loading/unloading
5. **Limited Discoverability**: No hierarchical organization for tool exploration

## New Architecture Requirements

### Hierarchical Tool Namespace Structure

**Namespace Format:** `{namespace}.{tool_name}`

**Examples:**
- `gmail_work_kal__send_email` - Gmail tool in work account namespace
- `platform__create_workspace` - Platform-specific tool
- `company__analyze_transcript` - Company n8n workflow tool
- `slack_team__send_message` - Slack tool in team workspace

**Namespace Discovery Tools:**
- `{namespace}__list_tools` - Discover tools within specific namespace
- `uru_help` - Global help and namespace discovery

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
POST /execute/{tool_slug}
Headers: X-App-Context: {app_name}
Body: { ..., _app_context: {app_name} }
```

**Enhanced Execution Flow:**
```javascript
// Hierarchical tool execution
POST /execute/{namespaced_tool_name}
// Examples:
// POST /execute/gmail_work_kal.send_email
// POST /execute/platform.create_workspace

// Enhanced routing logic
function routeToolExecution(namespacedToolName, args, headers) {
  const [namespace, ...toolParts] = namespacedToolName.split('.');
  const originalToolName = toolParts.join('.');
  const appName = denormalizeNamespace(namespace);
  
  // Route to appropriate backend with context
  return executeOnBackend(originalToolName, args, {
    appName,
    namespace,
    originalContext: headers['X-App-Context']
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

// Tool Router with Namespace Support
class NamespaceAwareToolRouter {
  constructor(namespaceRegistry) {
    this.registry = namespaceRegistry;
  }
  
  async routeExecution(toolName, args, context) {
    if (toolName.includes('.')) {
      return this.handleNamespacedTool(toolName, args, context);
    } else {
      return this.handleLegacyTool(toolName, args, context);
    }
  }
  
  async handleNamespacedTool(namespacedName, args, context) {
    const [namespace, ...toolParts] = namespacedName.split('.');
    const originalName = toolParts.join('.');
    const namespaceInfo = this.registry.namespaces.get(namespace);
    
    if (!namespaceInfo) {
      throw new Error(`Namespace '${namespace}' not found`);
    }
    
    return this.executeOnBackend(originalName, args, {
      ...context,
      appName: namespaceInfo.appName,
      namespace
    });
  }
}
```

### 4. Backward Compatibility Layer

**Legacy Tool Support:**
```javascript
// Backward compatibility handler
class LegacyToolHandler {
  constructor(namespaceRegistry, toolRouter) {
    this.registry = namespaceRegistry;
    this.router = toolRouter;
  }
  
  async handleLegacyTool(toolName, args, context) {
    // Try to find tool in loaded namespaces
    for (const [namespace, info] of this.registry.namespaces) {
      if (info.tools.has(toolName)) {
        console.warn(`Legacy tool '${toolName}' found in namespace '${namespace}'. Consider using '${namespace}.${toolName}'`);
        return this.router.handleNamespacedTool(`${namespace}.${toolName}`, args, context);
      }
    }
    
    // Fallback to original behavior
    return this.executeOriginalFlow(toolName, args, context);
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
   - Add hierarchical tool name parsing
   - Maintain backward compatibility

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
  test('should route namespaced tools correctly', async () => {
    const result = await router.routeExecution(
      'gmail_work_kal__send_email',
      { to: 'test@example.com' },
      { userId: 'user123' }
    );
    expect(result).toBeDefined();
  });
  
  test('should handle legacy tools with backward compatibility', async () => {
    const result = await router.routeExecution(
      'send_email',
      { to: 'test@example.com' },
      { userId: 'user123' }
    );
    expect(result).toBeDefined();
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
  
  test('should execute namespaced tools', async () => {
    const response = await request(app)
      .post('/execute/gmail_work_kal__send_email')
      .send({ to: 'test@example.com', subject: 'Test' })
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

3. **Backward Compatibility**
   - Test existing MCP clients continue working
   - Verify legacy tool execution
   - Validate migration scenarios

## Backward Compatibility

### Existing Client Support

**Guaranteed Compatibility:**
- All existing MCP clients continue working without modification
- Legacy tool names still function (with deprecation warnings)
- Original API endpoints remain functional
- No breaking changes to existing integrations

**Migration Path:**
1. **Phase 1**: Both legacy and namespaced tools work simultaneously
2. **Phase 2**: Deprecation warnings for legacy tool usage
3. **Phase 3**: Optional migration to namespaced tools
4. **Phase 4**: Legacy support maintained indefinitely for compatibility

### Configuration Options

```javascript
// Proxy configuration for backward compatibility
{
  "namespaceSupport": {
    "enabled": true,
    "legacySupport": true,
    "deprecationWarnings": true,
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

This architectural enhancement positions the MCP Proxy Server as a scalable, efficient, and standards-compliant gateway for AI tool access while maintaining full backward compatibility with existing integrations.

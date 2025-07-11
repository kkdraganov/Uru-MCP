/**
 * Tool Namespace Manager - Hierarchical Tool Management for Uru MCP Server
 * 
 * Manages hierarchical tool namespacing, dynamic loading, and intelligent caching
 * to achieve full MCP protocol compliance while efficiently handling 400+ tools.
 */

const axios = require('axios');

/**
 * Dynamic Tool Registry - Runtime tool management with caching and cleanup
 */
class DynamicToolRegistry {
  constructor(config = {}) {
    this.tools = new Map();
    this.namespaces = new Map();
    this.lastAccess = new Map();
    this.usageStats = new Map();
    this.maxCacheAge = config.maxCacheAge || 300000; // 5 minutes
    this.maxNamespaces = config.maxNamespaces || 20;
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanupStaleNamespaces();
    }, 60000); // Cleanup every minute
  }

  /**
   * Register tools for a namespace
   */
  registerNamespaceTools(namespace, tools) {
    const namespacedTools = tools.map(tool => ({
      ...tool,
      name: `${namespace}.${tool.originalName || tool.name}`,
      originalName: tool.originalName || tool.name,
      namespace: namespace,
      registeredAt: Date.now(),
      annotations: {
        ...tool.annotations,
        namespace: namespace,
        category: this.getToolCategory(tool),
        priority: this.getToolPriority(tool, namespace)
      }
    }));

    // Register individual tools
    for (const tool of namespacedTools) {
      this.tools.set(tool.name, tool);
    }

    // Track namespace
    this.namespaces.set(namespace, {
      tools: namespacedTools.map(t => t.name),
      loadedAt: Date.now(),
      toolCount: namespacedTools.length
    });

    this.lastAccess.set(namespace, Date.now());
    return namespacedTools;
  }

  /**
   * Get tool by name
   */
  getTool(toolName) {
    const tool = this.tools.get(toolName);
    if (tool) {
      this.lastAccess.set(tool.namespace, Date.now());
      this.trackUsage(tool.namespace);
    }
    return tool;
  }

  /**
   * Get all tools for a namespace
   */
  getNamespaceTools(namespace) {
    const namespaceInfo = this.namespaces.get(namespace);
    if (!namespaceInfo) return [];

    this.lastAccess.set(namespace, Date.now());
    this.trackUsage(namespace);

    return namespaceInfo.tools.map(toolName => this.tools.get(toolName)).filter(Boolean);
  }

  /**
   * Check if namespace is loaded
   */
  isNamespaceLoaded(namespace) {
    return this.namespaces.has(namespace);
  }

  /**
   * Track tool usage for optimization
   */
  trackUsage(namespace) {
    const count = this.usageStats.get(namespace) || 0;
    this.usageStats.set(namespace, count + 1);
  }

  /**
   * Get top used namespaces
   */
  getTopUsedNamespaces(limit = 5) {
    return Array.from(this.usageStats.entries())
      .sort(([,a], [,b]) => b - a)
      .slice(0, limit)
      .map(([namespace]) => namespace);
  }

  /**
   * Clean up stale namespaces
   */
  cleanupStaleNamespaces() {
    const now = Date.now();
    const namespacesToRemove = [];

    for (const [namespace, lastAccess] of this.lastAccess.entries()) {
      if (now - lastAccess > this.maxCacheAge) {
        namespacesToRemove.push(namespace);
      }
    }

    // Keep most used namespaces even if stale
    const topUsed = this.getTopUsedNamespaces(5);
    const toRemove = namespacesToRemove.filter(ns => !topUsed.includes(ns));

    for (const namespace of toRemove) {
      this.unregisterNamespace(namespace);
    }

    // Enforce max namespace limit
    if (this.namespaces.size > this.maxNamespaces) {
      const sortedByAccess = Array.from(this.lastAccess.entries())
        .sort(([,a], [,b]) => a - b);
      
      const excessCount = this.namespaces.size - this.maxNamespaces;
      for (let i = 0; i < excessCount; i++) {
        const [namespace] = sortedByAccess[i];
        if (!topUsed.includes(namespace)) {
          this.unregisterNamespace(namespace);
        }
      }
    }
  }

  /**
   * Unregister a namespace and its tools
   */
  unregisterNamespace(namespace) {
    const namespaceInfo = this.namespaces.get(namespace);
    if (namespaceInfo) {
      // Remove all tools for this namespace
      for (const toolName of namespaceInfo.tools) {
        this.tools.delete(toolName);
      }
      
      this.namespaces.delete(namespace);
      this.lastAccess.delete(namespace);
    }
  }

  /**
   * Get tool category based on name and description
   */
  getToolCategory(tool) {
    const name = tool.name.toLowerCase();
    const desc = (tool.description || '').toLowerCase();

    if (name.includes('email') || name.includes('gmail') || name.includes('send')) {
      return 'communication';
    }
    if (name.includes('calendar') || name.includes('meeting') || name.includes('schedule')) {
      return 'calendar';
    }
    if (name.includes('file') || name.includes('drive') || name.includes('document')) {
      return 'files';
    }
    if (name.includes('user') || name.includes('manage') || name.includes('admin')) {
      return 'administration';
    }
    if (name.includes('workflow') || name.includes('automation')) {
      return 'automation';
    }
    if (name.includes('list') || name.includes('search') || name.includes('fetch')) {
      return 'data';
    }
    
    return 'general';
  }

  /**
   * Get tool priority based on namespace and usage patterns
   */
  getToolPriority(tool, namespace) {
    const name = tool.name.toLowerCase();
    
    // High priority tools
    if (name.includes('send') || name.includes('create') || name.includes('list')) {
      return 'high';
    }
    
    // Platform and company tools are generally high priority
    if (namespace === 'platform' || namespace === 'company') {
      return 'high';
    }
    
    // Medium priority for common actions
    if (name.includes('get') || name.includes('fetch') || name.includes('search')) {
      return 'medium';
    }
    
    return 'low';
  }

  /**
   * Get registry statistics
   */
  getStats() {
    return {
      totalTools: this.tools.size,
      totalNamespaces: this.namespaces.size,
      topUsedNamespaces: this.getTopUsedNamespaces(5),
      memoryUsage: {
        tools: this.tools.size,
        namespaces: this.namespaces.size,
        lastAccess: this.lastAccess.size
      }
    };
  }

  /**
   * Cleanup resources
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.tools.clear();
    this.namespaces.clear();
    this.lastAccess.clear();
    this.usageStats.clear();
  }
}

/**
 * Tool Namespace Manager - Handles namespace normalization and tool organization
 */
class ToolNamespaceManager {
  constructor(config = {}) {
    this.config = config;
    this.proxyUrl = config.proxyUrl;
    this.token = config.token;
    this.debug = config.debug || false;
    this.appsCache = {
      data: null,
      lastFetch: null,
      ttl: config.cacheTimeout || 30000
    };
  }

  /**
   * Normalize app name to namespace format with collision detection
   */
  normalizeNamespace(appName) {
    const baseNamespace = appName.toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');

    // Check for collisions and add suffix if needed
    if (!this.namespaceCollisions) {
      this.namespaceCollisions = new Map();
    }

    // If this exact app name was already normalized, return the same namespace
    if (this.namespaceCollisions.has(appName)) {
      return this.namespaceCollisions.get(appName);
    }

    // Check if the base namespace is already taken by a different app
    let finalNamespace = baseNamespace;
    let suffix = 1;

    while (Array.from(this.namespaceCollisions.values()).includes(finalNamespace)) {
      finalNamespace = `${baseNamespace}_${suffix}`;
      suffix++;
    }

    // Store the mapping
    this.namespaceCollisions.set(appName, finalNamespace);
    return finalNamespace;
  }

  /**
   * Denormalize namespace back to app name
   */
  denormalizeNamespace(namespace) {
    // Try to find exact match first
    const cachedApps = this.getCachedApps();
    if (cachedApps) {
      for (const appName of cachedApps) {
        if (this.normalizeNamespace(appName) === namespace) {
          return appName;
        }
      }
    }

    // Fallback to basic conversion
    return namespace.replace(/_/g, ' ');
  }

  /**
   * Create namespace discovery tool
   */
  createNamespaceDiscoveryTool(appName) {
    const namespace = this.normalizeNamespace(appName);
    const icon = this.getNamespaceIcon(namespace);

    return {
      name: `${namespace}.list_tools`,
      description: `List all available tools in the ${appName} namespace`,
      inputSchema: {
        type: 'object',
        properties: {
          filter: {
            type: 'string',
            description: 'Optional filter for tool names or descriptions'
          },
          category: {
            type: 'string',
            description: 'Optional category filter (communication, files, administration, etc.)',
            enum: ['communication', 'calendar', 'files', 'administration', 'automation', 'data', 'general']
          }
        },
        required: []
      },
      annotations: {
        title: `${icon} ${appName} Tool Discovery`,
        category: 'discovery',
        namespace: appName,
        priority: 'high',
        readOnlyHint: true
      }
    };
  }

  /**
   * Get icon for namespace
   */
  getNamespaceIcon(namespace) {
    const icons = {
      'gmail_work_kal': '📧',
      'outlook_personal': '📮',
      'company': '🏢',
      'platform': '⚙️',
      'calendar': '📅',
      'drive': '💾',
      'slack': '💬',
      'teams': '👥'
    };
    return icons[namespace] || '🔧';
  }

  /**
   * Namespace tools with proper metadata
   */
  namespaceTools(appName, tools) {
    const namespace = this.normalizeNamespace(appName);
    const icon = this.getNamespaceIcon(namespace);

    return tools.map(tool => ({
      ...tool,
      name: `${namespace}.${tool.name}`,
      originalName: tool.name,
      namespace: namespace,
      annotations: {
        ...tool.annotations,
        title: `${icon} ${tool.name}`,
        namespace: appName,
        category: this.getToolCategory(tool),
        priority: this.getToolPriority(tool, namespace)
      }
    }));
  }

  /**
   * Fetch available apps from proxy with caching
   */
  async fetchAppsFromProxy() {
    try {
      // Use cached apps if available and fresh
      const cachedApps = this.getCachedApps();
      if (cachedApps) {
        this.log(`✅ Returning ${cachedApps.length} cached apps: ${cachedApps.join(', ')}`);
        return cachedApps;
      }

      const appsResponse = await axios.get(`${this.proxyUrl}/list/apps`, {
        timeout: this.config.timeout || 30000,
        headers: this.getAuthHeaders()
      });

      this.log(`📊 Available apps: ${JSON.stringify(appsResponse.data, null, 2)}`);

      if (!Array.isArray(appsResponse.data)) {
        throw new Error('Invalid apps response from proxy - expected array');
      }

      // Cache the results
      this.appsCache.data = appsResponse.data;
      this.appsCache.lastFetch = Date.now();

      return appsResponse.data;
    } catch (error) {
      this.log(`❌ Error fetching apps from proxy: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Fetch tools for a specific app
   */
  async fetchToolsForApp(appName) {
    try {
      const toolsResponse = await axios.get(`${this.proxyUrl}/list/apps/${encodeURIComponent(appName)}/tools`, {
        timeout: this.config.timeout || 30000,
        headers: this.getAuthHeaders()
      });

      this.log(`📊 Tools for app '${appName}': ${JSON.stringify(toolsResponse.data, null, 2)}`);

      if (!Array.isArray(toolsResponse.data)) {
        throw new Error(`Invalid tools response for app '${appName}' - expected array`);
      }

      // Process and validate tools
      const validTools = toolsResponse.data
        .map((tool, index) => {
          const originalName = tool.name || tool.function?.name || tool.id || `tool_${index}`;

          const cleanTool = {
            name: originalName,
            description: tool.description || `Tool from ${appName}`,
            inputSchema: tool.inputSchema || tool.function?.parameters || {
              type: 'object',
              properties: {},
              required: []
            },
            _appName: appName,
            _toolSlug: tool.slug || tool.id || originalName
          };

          // Validate input schema
          if (!cleanTool.inputSchema || typeof cleanTool.inputSchema !== 'object') {
            this.log(`⚠️ Tool '${cleanTool.name}' has invalid inputSchema, using default`, 'warn');
            cleanTool.inputSchema = {
              type: 'object',
              properties: {},
              required: []
            };
          }

          return cleanTool;
        })
        .filter(tool => tool !== null);

      this.log(`✅ Processed ${validTools.length} valid tools for app '${appName}'`);
      return validTools;
    } catch (error) {
      this.log(`❌ Error fetching tools for app '${appName}': ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get cached apps if available and fresh
   */
  getCachedApps() {
    if (!this.appsCache.data || !this.appsCache.lastFetch) {
      return null;
    }

    const age = Date.now() - this.appsCache.lastFetch;
    if (age > this.appsCache.ttl) {
      return null;
    }

    return this.appsCache.data;
  }

  /**
   * Get authentication headers
   */
  getAuthHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'Content-Type': 'application/json'
    };
  }

  /**
   * Get tool category
   */
  getToolCategory(tool) {
    const name = tool.name.toLowerCase();
    const desc = (tool.description || '').toLowerCase();

    if (name.includes('email') || name.includes('gmail') || name.includes('send')) {
      return 'communication';
    }
    if (name.includes('calendar') || name.includes('meeting') || name.includes('schedule')) {
      return 'calendar';
    }
    if (name.includes('file') || name.includes('drive') || name.includes('document')) {
      return 'files';
    }
    if (name.includes('user') || name.includes('manage') || name.includes('admin')) {
      return 'administration';
    }
    if (name.includes('workflow') || name.includes('automation')) {
      return 'automation';
    }
    if (name.includes('list') || name.includes('search') || name.includes('fetch')) {
      return 'data';
    }

    return 'general';
  }

  /**
   * Get tool priority
   */
  getToolPriority(tool, namespace) {
    const name = tool.name.toLowerCase();

    if (name.includes('send') || name.includes('create') || name.includes('list')) {
      return 'high';
    }

    if (namespace === 'platform' || namespace === 'company') {
      return 'high';
    }

    if (name.includes('get') || name.includes('fetch') || name.includes('search')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Logging helper
   */
  log(message, level = 'info') {
    if (this.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [NamespaceManager] ${message}`);
    }
  }
}

module.exports = { DynamicToolRegistry, ToolNamespaceManager };

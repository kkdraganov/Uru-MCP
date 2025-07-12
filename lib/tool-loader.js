/**
 * Intelligent Tool Loader - Dynamic tool loading with performance optimization
 * 
 * Handles intelligent pre-loading, pagination, and performance optimization
 * for the hierarchical tool namespace system.
 */

const { ToolNamespaceManager } = require('./namespace-manager');

/**
 * Intelligent Tool Loader with pre-loading and optimization
 */
class IntelligentToolLoader {
  constructor(namespaceManager, toolRegistry, config = {}) {
    this.namespaceManager = namespaceManager;
    this.toolRegistry = toolRegistry;
    this.config = config;
    
    // Configuration
    this.maxToolsPerPage = config.maxToolsPerPage || 50;
    this.preloadNamespaces = config.preloadNamespaces || ['platform', 'company'];
    this.enableParallelLoading = config.enableParallelLoading !== false;
    this.enablePredictiveLoading = config.enablePredictiveLoading || false;
    
    // State tracking
    this.loadedNamespaces = new Set();
    this.loadingPromises = new Map();
    this.initializationComplete = false;
    
    // Performance metrics
    this.metrics = {
      toolsLoaded: 0,
      namespacesLoaded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      averageLoadTime: 0,
      totalRequests: 0
    };
  }

  /**
   * Initialize with intelligent pre-loading
   */
  async initialize() {
    if (this.initializationComplete) return;
    
    const startTime = Date.now();
    this.log('🚀 Initializing intelligent tool loader...');
    
    try {
      // Pre-load high-priority namespaces
      await this.preloadPriorityNamespaces();
      
      this.initializationComplete = true;
      const loadTime = Date.now() - startTime;
      this.log(`✅ Tool loader initialized in ${loadTime}ms`);
      
    } catch (error) {
      this.log(`❌ Failed to initialize tool loader: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get tools for listing with pagination
   */
  async getToolsForListing(cursor = null, limit = null) {
    const startTime = Date.now();
    this.metrics.totalRequests++;
    
    try {
      const pageLimit = limit || this.maxToolsPerPage;
      
      // Get base discovery tools
      const discoveryTools = await this.getDiscoveryTools();
      
      // Get pre-loaded tools
      const preloadedTools = await this.getPreloadedTools();
      
      // Combine and sort tools
      const allTools = [...discoveryTools, ...preloadedTools];
      this.sortToolsByPriority(allTools);
      
      // Apply pagination
      const startIndex = cursor ? parseInt(cursor) : 0;
      const endIndex = Math.min(startIndex + pageLimit, allTools.length);
      const paginatedTools = allTools.slice(startIndex, endIndex);
      
      const nextCursor = endIndex < allTools.length ? endIndex.toString() : null;
      
      // Update metrics
      const loadTime = Date.now() - startTime;
      this.updateMetrics(loadTime, paginatedTools.length);
      
      this.log(`📋 Returning ${paginatedTools.length} tools (cursor: ${cursor || 'start'}, next: ${nextCursor || 'end'})`);
      
      return {
        tools: paginatedTools,
        nextCursor
      };
      
    } catch (error) {
      this.log(`❌ Error getting tools for listing: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Get discovery tools for all available namespaces
   */
  async getDiscoveryTools() {
    try {
      const apps = await this.namespaceManager.fetchAppsFromProxy();
      return apps.map(appName => 
        this.namespaceManager.createNamespaceDiscoveryTool(appName)
      );
    } catch (error) {
      this.log(`❌ Error getting discovery tools: ${error.message}`, 'error');
      return [];
    }
  }

  /**
   * Get pre-loaded tools from priority namespaces
   */
  async getPreloadedTools() {
    const preloadedTools = [];
    
    for (const namespace of this.loadedNamespaces) {
      const tools = this.toolRegistry.getNamespaceTools(namespace);
      preloadedTools.push(...tools);
    }
    
    return preloadedTools;
  }

  /**
   * Pre-load priority namespaces
   */
  async preloadPriorityNamespaces() {
    if (!this.preloadNamespaces.length) return;
    
    this.log(`🔄 Pre-loading priority namespaces: ${this.preloadNamespaces.join(', ')}`);
    
    const loadPromises = this.preloadNamespaces.map(async (namespaceName) => {
      try {
        await this.loadNamespace(namespaceName);
        this.log(`✅ Pre-loaded namespace: ${namespaceName}`);
      } catch (error) {
        this.log(`⚠️ Failed to pre-load namespace '${namespaceName}': ${error.message}`, 'warn');
      }
    });
    
    if (this.enableParallelLoading) {
      await Promise.allSettled(loadPromises);
    } else {
      for (const promise of loadPromises) {
        await promise.catch(() => {}); // Continue on errors
      }
    }
  }

  /**
   * Load a specific namespace
   */
  async loadNamespace(namespaceName) {
    // Check if already loaded
    if (this.toolRegistry.isNamespaceLoaded(namespaceName)) {
      this.metrics.cacheHits++;
      return this.toolRegistry.getNamespaceTools(namespaceName);
    }
    
    // Check if currently loading
    if (this.loadingPromises.has(namespaceName)) {
      return await this.loadingPromises.get(namespaceName);
    }
    
    // Start loading
    const loadPromise = this.doLoadNamespace(namespaceName);
    this.loadingPromises.set(namespaceName, loadPromise);
    
    try {
      const result = await loadPromise;
      this.loadingPromises.delete(namespaceName);
      return result;
    } catch (error) {
      this.loadingPromises.delete(namespaceName);
      throw error;
    }
  }

  /**
   * Actually load namespace tools
   */
  async doLoadNamespace(namespaceName) {
    const startTime = Date.now();
    this.metrics.cacheMisses++;
    
    try {
      // Find the app name for this namespace
      const appName = this.namespaceManager.denormalizeNamespace(namespaceName);
      
      this.log(`🔍 Loading namespace '${namespaceName}' (app: '${appName}')`);
      
      // Fetch tools from proxy
      const appTools = await this.namespaceManager.fetchToolsForApp(appName);
      
      // Namespace the tools
      const namespacedTools = this.namespaceManager.namespaceTools(appName, appTools);
      
      // Register in tool registry
      const registeredTools = this.toolRegistry.registerNamespaceTools(namespaceName, namespacedTools);
      
      // Track as loaded
      this.loadedNamespaces.add(namespaceName);
      
      // Update metrics
      this.metrics.namespacesLoaded++;
      this.metrics.toolsLoaded += registeredTools.length;
      
      const loadTime = Date.now() - startTime;
      this.log(`✅ Loaded namespace '${namespaceName}': ${registeredTools.length} tools in ${loadTime}ms`);
      
      return registeredTools;
      
    } catch (error) {
      this.log(`❌ Failed to load namespace '${namespaceName}': ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Sort tools by priority for optimal user experience
   */
  sortToolsByPriority(tools) {
    const priorityOrder = { 'high': 3, 'medium': 2, 'low': 1 };
    const categoryOrder = { 
      'discovery': 10, 
      'communication': 9, 
      'calendar': 8, 
      'files': 7, 
      'administration': 6, 
      'automation': 5, 
      'data': 4, 
      'general': 3 
    };
    
    tools.sort((a, b) => {
      // Discovery tools first
      const aCategory = a.annotations?.category || 'general';
      const bCategory = b.annotations?.category || 'general';
      
      if (aCategory !== bCategory) {
        return (categoryOrder[bCategory] || 0) - (categoryOrder[aCategory] || 0);
      }
      
      // Then by priority
      const aPriority = a.annotations?.priority || 'low';
      const bPriority = b.annotations?.priority || 'low';
      
      if (aPriority !== bPriority) {
        return (priorityOrder[bPriority] || 0) - (priorityOrder[aPriority] || 0);
      }
      
      // Finally by name
      return a.name.localeCompare(b.name);
    });
  }

  /**
   * Update performance metrics
   */
  updateMetrics(loadTime, toolCount) {
    this.metrics.averageLoadTime = (
      (this.metrics.averageLoadTime * (this.metrics.totalRequests - 1)) + loadTime
    ) / this.metrics.totalRequests;
  }

  /**
   * Get performance metrics
   */
  getMetrics() {
    return {
      ...this.metrics,
      loadedNamespaces: Array.from(this.loadedNamespaces),
      registryStats: this.toolRegistry.getStats()
    };
  }

  /**
   * Optimize based on usage patterns
   */
  async optimizeBasedOnUsage() {
    if (!this.enablePredictiveLoading) return;
    
    const topNamespaces = this.toolRegistry.getTopUsedNamespaces(3);
    const unloadedTopNamespaces = topNamespaces.filter(ns => !this.loadedNamespaces.has(ns));
    
    if (unloadedTopNamespaces.length > 0) {
      this.log(`🎯 Predictively loading top used namespaces: ${unloadedTopNamespaces.join(', ')}`);
      
      for (const namespace of unloadedTopNamespaces) {
        try {
          await this.loadNamespace(namespace);
        } catch (error) {
          this.log(`⚠️ Failed to predictively load '${namespace}': ${error.message}`, 'warn');
        }
      }
    }
  }

  /**
   * Logging helper
   */
  log(message, level = 'info') {
    if (this.config.debug) {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] [ToolLoader] ${message}`);
    }
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.loadedNamespaces.clear();
    this.loadingPromises.clear();
    this.initializationComplete = false;
  }
}

module.exports = { IntelligentToolLoader };

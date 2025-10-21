/**
 * Tool Namespace Manager - Hierarchical Tool Management for Uru MCP Server
 *
 * Manages hierarchical tool namespacing, dynamic loading, and intelligent caching
 * to achieve full MCP protocol compliance while efficiently handling 400+ tools.
 *
 * Enhanced with namespace discovery and connection metadata management for proper
 * routing to Composio connected accounts.
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
            name: `${namespace}__${tool.originalName || tool.name}`,
            originalName: tool.originalName || tool.name,
            namespace: namespace,
            registeredAt: Date.now(),
            annotations: {
                ...tool.annotations,
                namespace: namespace,
                category: this.getToolCategory(tool),
                priority: this.getToolPriority(tool, namespace),
            },
        }));

        // Register individual tools
        for (const tool of namespacedTools) {
            this.tools.set(tool.name, tool);
        }

        // Track namespace
        this.namespaces.set(namespace, {
            tools: namespacedTools.map(t => t.name),
            loadedAt: Date.now(),
            toolCount: namespacedTools.length,
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

        return namespaceInfo.tools
            .map(toolName => this.tools.get(toolName))
            .filter(Boolean);
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
            .sort(([, a], [, b]) => b - a)
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
            const sortedByAccess = Array.from(this.lastAccess.entries()).sort(
                ([, a], [, b]) => a - b
            );

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
        if (
            name.includes('calendar') ||
            name.includes('meeting') ||
            name.includes('schedule')
        ) {
            return 'calendar';
        }
        if (
            name.includes('file') ||
            name.includes('drive') ||
            name.includes('document')
        ) {
            return 'files';
        }
        if (
            name.includes('user') ||
            name.includes('manage') ||
            name.includes('admin')
        ) {
            return 'administration';
        }
        if (name.includes('workflow') || name.includes('automation')) {
            return 'automation';
        }
        if (
            name.includes('list') ||
            name.includes('search') ||
            name.includes('fetch')
        ) {
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
                lastAccess: this.lastAccess.size,
            },
        };
    }

    /**
     * Clear all caches (for startup refresh)
     */
    clearCaches() {
        this.tools.clear();
        this.namespaces.clear();
        this.lastAccess.clear();
        this.usageStats.clear();
    }

    /**
     * Cleanup resources
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.clearCaches();
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
            ttl: config.cacheTimeout || 30000,
        };

        // Cache for namespace metadata (connection info)
        this.namespacesCache = {
            data: null,
            lastFetch: 0,
            maxAge: config.cacheTimeout || 900000, // 15 minutes - longer cache for Claude Desktop performance
        };

        // Map namespace names to connection metadata
        this.namespaceMetadata = new Map();
    }

    /**
     * Normalize app name to namespace format with collision detection
     */
    normalizeNamespace(appName) {
        // Ensure appName is a string
        if (typeof appName !== 'string') {
            throw new Error(`Invalid app name: expected string, got ${typeof appName}`);
        }

        const baseNamespace = appName
            .toLowerCase()
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

        // If no cached match found, preserve the namespace format
        // This prevents converting underscores to spaces which breaks MCP proxy requests
        // The namespace format is already the correct identifier for the MCP proxy
        return namespace;
    }

    /**
     * Create namespace discovery tool
     * @param {string} appName - App name or namespace name
     * @param {string} displayName - Optional display name for enhanced presentation
     */
    createNamespaceDiscoveryTool(appName, displayName = null) {
        const namespace = this.normalizeNamespace(appName);
        const icon = this.getNamespaceIcon(namespace);
        const finalDisplayName = displayName || appName;

        return {
            name: `${namespace}__list_tools`,
            description: `List all available tools in the ${finalDisplayName} namespace`,
            inputSchema: {
                type: 'object',
                properties: {
                    filter: {
                        type: 'string',
                        description: 'Optional filter for tool names or descriptions',
                    },
                    category: {
                        type: 'string',
                        description:
                            'Optional category filter (communication, files, administration, etc.)',
                        enum: [
                            'communication',
                            'calendar',
                            'files',
                            'administration',
                            'automation',
                            'data',
                            'general',
                        ],
                    },
                },
                required: [],
            },
            annotations: {
                title: `${icon} ${finalDisplayName} Tool Discovery`,
                category: 'discovery',
                namespace: appName,
                priority: 'high',
                readOnlyHint: true,
            },
        };
    }

    /**
     * Create namespace execute tool
     * @param {string} appName - App name or namespace name
     * @param {string} displayName - Optional display name for enhanced presentation
     */
    createNamespaceExecuteTool(appName, displayName = null) {
        const namespace = this.normalizeNamespace(appName);
        const icon = this.getNamespaceIcon(namespace);
        const finalDisplayName = displayName || appName;

        return {
            name: `${namespace}__execute_tool`,
            description: `Execute a specific tool in the ${finalDisplayName} namespace`,
            inputSchema: {
                type: 'object',
                properties: {
                    tool_name: {
                        type: 'string',
                        description:
                            'Name of the tool to execute (as returned by list_tools)',
                    },
                    parameters: {
                        type: 'object',
                        description: 'Parameters to pass to the tool',
                        additionalProperties: true,
                    },
                },
                required: ['tool_name'],
            },
            annotations: {
                title: `${icon} ${finalDisplayName} Tool Execution`,
                category: 'execution',
                namespace: appName,
                priority: 'high',
            },
        };
    }

    /**
     * Get icon for namespace
     */
    getNamespaceIcon(namespace) {
        const icons = {
            gmail_work_kal: '📧',
            outlook_personal: '📮',
            company: '🏢',
            platform: '⚙️',
            calendar: '📅',
            drive: '💾',
            slack: '💬',
            teams: '👥',
        };
        // Use building emoji for any company namespaces (e.g., company_uru_intelligence)
        if (typeof namespace === 'string' && namespace.startsWith('company_')) {
            return '🏢';
        }
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
            name: `${namespace}__${tool.name}`,
            originalName: tool.name,
            namespace: namespace,
            annotations: {
                ...tool.annotations,
                title: `${icon} ${tool.name}`,
                namespace: appName,
                category: this.getToolCategory(tool),
                priority: this.getToolPriority(tool, namespace),
            },
        }));
    }

    /**
     * Fetch namespace metadata from proxy with connection information
     * @param {string} apiKey - Optional API key to use for this request
     */
    async fetchNamespacesFromProxy(apiKey = null, options = {}) {
        const { forceRefresh = false } = options || {};
        try {
            // Use cached namespaces if available and fresh
            const cachedNamespaces = this.getCachedNamespaces();
            if (!forceRefresh && cachedNamespaces) {
                this.log(`�o. Returning ${cachedNamespaces.length} cached namespaces`);
                return cachedNamespaces;
            }
           const namespacesResponse = await axios.get(`${this.proxyUrl}/namespaces`, {
                timeout: this.config.timeout || 30000,
                headers: this.getAuthHeaders(apiKey),
            });

            this.log(
                `📊 Namespaces response: ${JSON.stringify(
                    namespacesResponse.data,
                    null,
                    2
                )}`
            );

            if (!Array.isArray(namespacesResponse.data.namespaces)) {
                throw new Error(
                    'Invalid namespaces response from proxy - expected array in namespaces property'
                );
            }

            const namespaces = namespacesResponse.data.namespaces;

            // Store namespace metadata for routing
            this.namespaceMetadata.clear();
            for (const namespace of namespaces) {
                if (namespace.name && namespace.connected_account_id) {
                    this.namespaceMetadata.set(namespace.name, {
                        connected_account_id: namespace.connected_account_id,
                        server_id: namespace.server_id,
                        account_label: namespace.account_label,
                        connection_status: namespace.connection_status,
                        displayName: namespace.displayName,
                    });
                }
            }

            // Cache the namespaces
            this.namespacesCache.data = namespaces;
            this.namespacesCache.lastFetch = Date.now();

            this.log(
                `✅ Loaded ${namespaces.length} namespaces with connection metadata`
            );
            return namespaces;
        } catch (error) {
            this.log(
                `❌ Error fetching namespaces from proxy: ${error.message}`,
                'error'
            );

            // Enhanced error logging for debugging
            if (error.response) {
                this.log(`   HTTP Status: ${error.response.status}`, 'error');
                this.log(
                    `   Response data: ${JSON.stringify(error.response.data)}`,
                    'error'
                );
            }

            // Provide helpful error messages
            if (error.response?.status === 401) {
                throw new Error(
                    'Authentication failed when fetching namespaces. Check your API key.'
                );
            } else if (error.response?.status === 404) {
                throw new Error(
                    'Namespaces endpoint not found. The MCP proxy may not support enhanced namespace discovery.'
                );
            } else if (error.code === 'ECONNREFUSED') {
                throw new Error(
                    `Cannot connect to MCP proxy at ${this.proxyUrl}. Check if the proxy is running.`
                );
            } else {
                throw new Error(`Failed to fetch namespaces: ${error.message}`);
            }
        }
    }

    /**
     * Get cached namespaces if available and fresh
     */
    getCachedNamespaces() {
        return null;
    }

    /**
     * Clear all caches (for startup refresh)
     */
    clearCaches() {
        this.appsCache.data = null;
        this.appsCache.lastFetch = null;
        this.namespacesCache.data = null;
        this.namespacesCache.lastFetch = 0;
        this.namespaceMetadata.clear();
    }

    /**
     * Get connection metadata for a namespace
     * @param {string} namespace - Namespace name
     * @returns {object|null} Connection metadata or null if not found
     */
    getNamespaceMetadata(namespace) {
        return this.namespaceMetadata.get(namespace) || null;
    }

    /**
     * Fetch available apps from proxy with caching
     * @param {string} apiKey - Optional API key to use for this request
     */
    async fetchAppsFromProxy(apiKey = null) {
        try {
            // Use cached apps if available and fresh
            const cachedApps = this.getCachedApps();
            if (cachedApps) {
                this.log(
                    `✅ Returning ${cachedApps.length} cached apps: ${cachedApps.join(
                        ', '
                    )}`
                );
                return cachedApps;
            }

            const appsResponse = await axios.get(`${this.proxyUrl}/list/apps`, {
                timeout: this.config.timeout || 30000,
                headers: this.getAuthHeaders(apiKey),
            });

            this.log(
                `📊 Available apps: ${JSON.stringify(appsResponse.data, null, 2)}`
            );

            if (!Array.isArray(appsResponse.data)) {
                throw new Error('Invalid apps response from proxy - expected array');
            }

            // Extract app names from response objects
            // The API now returns objects with {name, namespace, icon, etc.} instead of just strings
            const appNames = appsResponse.data.map(app => {
                if (typeof app === 'string') {
                    return app; // Backward compatibility for string responses
                } else if (app && typeof app === 'object' && app.name) {
                    return app.name; // Extract name from object
                } else {
                    throw new Error(
                        `Invalid app format: expected string or object with name property, got ${typeof app}`
                    );
                }
            });

            // Cache the app names (not the full objects)
            this.appsCache.data = appNames;
            this.appsCache.lastFetch = Date.now();

            return appNames;
        } catch (error) {
            this.log(`❌ Error fetching apps from proxy: ${error.message}`, 'error');
            throw error;
        }
    }

    /**
     * Fetch tools for a specific app
     * @param {string} appName - Name of the app to fetch tools for
     * @param {string} apiKey - Optional API key to use for this request
     */
    async fetchToolsForApp(appName, apiKey = null) {
        try {
            const toolsResponse = await axios.get(
                `${this.proxyUrl}/list/apps/${encodeURIComponent(appName)}/tools`,
                {
                    timeout: this.config.timeout || 30000,
                    headers: this.getAuthHeaders(apiKey),
                }
            );

            this.log(
                `📊 Tools for app '${appName}': ${JSON.stringify(
                    toolsResponse.data,
                    null,
                    2
                )}`
            );

            // Extract tools array from response
            let toolsArray;
            if (Array.isArray(toolsResponse.data)) {
                // Direct array response (backward compatibility)
                toolsArray = toolsResponse.data;
            } else if (toolsResponse.data && Array.isArray(toolsResponse.data.tools)) {
                // Object response with tools array
                toolsArray = toolsResponse.data.tools;
            } else {
                throw new Error(
                    `Invalid tools response for app '${appName}' - expected array or object with tools array`
                );
            }

            // Process and validate tools
            const validTools = toolsArray
                .map((tool, index) => {
                    const originalName =
                        tool.name || tool.function?.name || tool.id || `tool_${index}`;

                    const cleanTool = {
                        name: originalName,
                        description: tool.description || `Tool from ${appName}`,
                        inputSchema: tool.inputSchema ||
                            tool.function?.parameters || {
                                type: 'object',
                                properties: {},
                                required: [],
                            },
                        _appName: appName,
                        _toolSlug: tool.slug || tool.id || originalName,
                    };

                    // Validate input schema
                    if (
                        !cleanTool.inputSchema ||
                        typeof cleanTool.inputSchema !== 'object'
                    ) {
                        this.log(
                            `⚠️ Tool '${cleanTool.name}' has invalid inputSchema, using default`,
                            'warn'
                        );
                        cleanTool.inputSchema = {
                            type: 'object',
                            properties: {},
                            required: [],
                        };
                    }

                    return cleanTool;
                })
                .filter(tool => tool !== null);

            this.log(
                `✅ Processed ${validTools.length} valid tools for app '${appName}'`
            );
            return validTools;
        } catch (error) {
            this.log(
                `❌ Error fetching tools for app '${appName}': ${error.message}`,
                'error'
            );
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
     * @param {string} apiKey - Optional API key to use instead of the configured token
     */
    getAuthHeaders(apiKey = null) {
        const headers = {
            'Content-Type': 'application/json',
        };

        // Use provided API key, fallback to configured token
        const tokenToUse = apiKey || this.token;
        if (tokenToUse) {
            headers['Authorization'] = `Bearer ${tokenToUse}`;
        }

        return headers;
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
        if (
            name.includes('calendar') ||
            name.includes('meeting') ||
            name.includes('schedule')
        ) {
            return 'calendar';
        }
        if (
            name.includes('file') ||
            name.includes('drive') ||
            name.includes('document')
        ) {
            return 'files';
        }
        if (
            name.includes('user') ||
            name.includes('manage') ||
            name.includes('admin')
        ) {
            return 'administration';
        }
        if (name.includes('workflow') || name.includes('automation')) {
            return 'automation';
        }
        if (
            name.includes('list') ||
            name.includes('search') ||
            name.includes('fetch')
        ) {
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

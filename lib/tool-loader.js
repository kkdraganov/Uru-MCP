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

        // Default to unlimited (no pagination) unless explicitly provided

        this.maxToolsPerPage = config.maxToolsPerPage ?? Infinity;

        this.preloadNamespaces = config.preloadNamespaces || ['platform', 'company'];

        this.enableParallelLoading = config.enableParallelLoading !== false;

        this.enablePredictiveLoading = config.enablePredictiveLoading || false;

        // State tracking

        this.loadedNamespaces = new Set();

        this.loadingPromises = new Map();

        this.initializationComplete = false;

        this.initializationStarted = false;

        this._preloadPromise = null;

        // Performance metrics

        this.metrics = {

            toolsLoaded: 0,

            namespacesLoaded: 0,

            cacheHits: 0,

            cacheMisses: 0,

            averageLoadTime: 0,

            totalRequests: 0,

        };

    }

        /**

     * Initialize with intelligent pre-loading

     */

    async initialize() {

        if (this.initializationComplete) return;

        if (this.initializationStarted) return;

        this.initializationStarted = true;

        const startTime = Date.now();

        this.log('dYs? Initializing intelligent tool loader (async preload)...');

        this._preloadPromise = (async () => {

            try {

                // Pre-load high-priority namespaces without blocking the caller

                await this.preloadPriorityNamespaces();

                const loadTime = Date.now() - startTime;

                this.log(`�o. Priority namespaces pre-loaded in ${loadTime}ms`);

            } catch (error) {

                this.log(

                    `�?O Failed to pre-load priority namespaces: ${error.message}`,

                    'warn'

                );

            } finally {

                this.initializationComplete = true;

                this.initializationStarted = false;

            }

        })();

    }

    /**

     * Get tools for listing with pagination (Two-tier system: only discovery tools)

     */

    async getToolsForListing(cursor = null, limit = null) {

        const startTime = Date.now();

        this.metrics.totalRequests++;

        try {

            const pageLimit = limit || this.maxToolsPerPage;

            // Two-tier system: Only return namespace discovery tools in tools/list

            // Actual tools are loaded when Claude calls namespace.list_tools

            const discoveryTools = await this.getDiscoveryTools();

            this.sortToolsByPriority(discoveryTools);

            // Apply pagination (though discovery tools should be small enough to fit in one page)

            const startIndex = cursor ? parseInt(cursor) : 0;

            const endIndex = Math.min(startIndex + pageLimit, discoveryTools.length);

            const paginatedTools = discoveryTools.slice(startIndex, endIndex);

            const nextCursor =

                endIndex < discoveryTools.length ? endIndex.toString() : null;

            // Update metrics

            const loadTime = Date.now() - startTime;

            this.updateMetrics(loadTime, paginatedTools.length);

            this.log(

                `ðŸ“‹ Two-tier discovery: Returning ${

                    paginatedTools.length

                } namespace discovery tools (cursor: ${cursor || 'start'}, next: ${

                    nextCursor || 'end'

                })`

            );

            const result = {

                tools: paginatedTools,

            };

            // Only include nextCursor if there are more pages (MCP protocol compliance)

            if (nextCursor) {

                result.nextCursor = nextCursor;

            }

            return result;

        } catch (error) {

            this.log(`âŒ Error getting tools for listing: ${error.message}`, 'error');

            throw error;

        }

    }

    /**

     * Get discovery tools for all available namespaces using enhanced namespace discovery

     * Creates both list_tools and execute_tool for each namespace

     * @param {string} apiKey - Optional API key to use for this request

     */

    async getDiscoveryTools(apiKey = null) {

        try {

            // Use the namespace discovery endpoint with configurable timeout

            const namespaces = await this.namespaceManager.fetchNamespacesFromProxy(

                apiKey

            );

            const tools = [];

            for (const namespace of namespaces) {

                const nsName = namespace.name || namespace.namespace; // accept either shape

                let displayName =

                    namespace.displayName || namespace.display_name || nsName;

                // Humanize unlabeled personal namespaces when the display name looks technical

                let label = (namespace.account_label || '').trim();

                if (!label) {

                    const tokenish = !displayName || /^[a-z0-9_]+$/i.test(displayName);

                    if (tokenish) {

                        const parts = (nsName || '').split('_');

                        const serviceToken = (parts[0] || '').toLowerCase();

                        const suffix = parts.length > 1 ? parts.slice(1).join(' ') : '';

                        const known = {

                            gmail: 'Gmail',

                            googledrive: 'Google Drive',

                            googlecalendar: 'Google Calendar',

                            slack: 'Slack',

                            github: 'GitHub',

                            trello: 'Trello',

                            notion: 'Notion',

                            discord: 'Discord',

                            dropbox: 'Dropbox',

                            linkedin: 'LinkedIn',

                            quickbooks: 'QuickBooks',

                        };

                        const humanService =

                            known[serviceToken] ||

                            serviceToken

                                .replace(/_/g, ' ')

                                .replace(/\b\w/g, s => s.toUpperCase());

                        displayName = suffix

                            ? `${humanService} ${suffix}`

                            : humanService;

                    }

                }

                // Sanitize display text

                const isCompany = nsName && String(nsName).startsWith('company_');

                // 1) Strip trailing 'Tools' for any namespace (prevents 'Tools Tool ...')

                displayName = (displayName || '').replace(/\s*Tools\s*$/i, '');

                // 2) De-duplicate consecutive words case-insensitively (e.g., 'docs docs' -> 'docs')

                const parts = displayName.trim().split(/\s+/);

                const deduped = [];

                // Normalize known service names for spacing/casing on unlabeled connections

                // Example: 'Googledrive Bf219151' -> 'Google Drive Bf219151'

                (function () {

                    const fixes = {

                        googledrive: 'Google Drive',

                        googlecalendar: 'Google Calendar',

                    };

                    const lower = (displayName || '').toLowerCase();

                    Object.keys(fixes).forEach(key => {

                        const human = fixes[key];

                        if (lower.startsWith(key)) {

                            // Replace the prefix with humanized form

                            displayName = human + displayName.slice(key.length);

                        }

                    });

                })();

                for (const p of parts) {

                    if (

                        deduped.length === 0 ||

                        deduped[deduped.length - 1].toLowerCase() !== p.toLowerCase()

                    ) {

                        deduped.push(p);

                    }

                }

                displayName = deduped.join(' ');

                label = (namespace.account_label || '').trim();

                // Build a friendly name, avoiding duplicate labels like "Personal (Personal)"

                let fullDisplayName = displayName;

                if (label) {

                    const dn = displayName.toLowerCase();

                    const lbl = label.toLowerCase();

                    if (!dn.includes(lbl)) {

                        fullDisplayName = `${displayName} (${label})`;

                    }

                }

                // Create both list_tools and execute_tool for each namespace

                tools.push(

                    this.namespaceManager.createNamespaceDiscoveryTool(

                        namespace.name,

                        fullDisplayName

                    ),

                    this.namespaceManager.createNamespaceExecuteTool(

                        namespace.name,

                        fullDisplayName

                    )

                );

            }

            return tools;

        } catch (error) {

            this.log(`âŒ Error getting discovery tools: ${error.message}`, 'error');

            // Fallback to legacy app-based discovery

            try {

                this.log(`ðŸ”„ Falling back to legacy app discovery`);

                const apps = await this.namespaceManager.fetchAppsFromProxy(apiKey);

                const tools = [];

                for (const appName of apps) {

                    tools.push(

                        this.namespaceManager.createNamespaceDiscoveryTool(appName),

                        this.namespaceManager.createNamespaceExecuteTool(appName)

                    );

                }

                return tools;

            } catch (fallbackError) {

                this.log(

                    `âŒ Fallback discovery also failed: ${fallbackError.message}`,

                    'error'

                );

                // Emergency fallback - return basic discovery tools for common namespaces

                this.log(`ðŸš¨ Using emergency fallback with basic discovery tools`);

                return this.getEmergencyDiscoveryTools();

            }

        }

    }

    /**

     * Emergency fallback discovery tools for Claude Desktop compatibility

     * Creates both list_tools and execute_tool for each namespace

     */

    getEmergencyDiscoveryTools() {

        const basicNamespaces = ['platform', 'company', 'gmail_work', 'gmail_work_kal'];

        const tools = [];

        for (const namespace of basicNamespaces) {

            tools.push(

                this.namespaceManager.createNamespaceDiscoveryTool(namespace),

                this.namespaceManager.createNamespaceExecuteTool(namespace)

            );

        }

        return tools;

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

        this.log(

            `ðŸ”„ Pre-loading priority namespaces: ${this.preloadNamespaces.join(', ')}`

        );

        const loadPromises = this.preloadNamespaces.map(async namespaceName => {

            try {

                await this.loadNamespace(namespaceName);

                this.log(`âœ… Pre-loaded namespace: ${namespaceName}`);

            } catch (error) {

                this.log(

                    `âš ï¸ Failed to pre-load namespace '${namespaceName}': ${error.message}`,

                    'warn'

                );

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

     * @param {string} namespaceName - Name of the namespace to load

     * @param {string} apiKey - Optional API key to use for this request

     */

    async loadNamespace(namespaceName, apiKey = null) {

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

        const loadPromise = this.doLoadNamespace(namespaceName, apiKey);

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

     * @param {string} namespaceName - Name of the namespace to load

     * @param {string} apiKey - Optional API key to use for this request

     */

    async doLoadNamespace(namespaceName, apiKey = null) {

        const startTime = Date.now();

        this.metrics.cacheMisses++;

        try {

            // Find the app name for this namespace

            const appName = this.namespaceManager.denormalizeNamespace(namespaceName);

            this.log(`ðŸ” Loading namespace '${namespaceName}' (app: '${appName}')`);

            // Fetch tools from proxy

            const appTools = await this.namespaceManager.fetchToolsForApp(

                appName,

                apiKey

            );

            // Namespace the tools

            const namespacedTools = this.namespaceManager.namespaceTools(

                appName,

                appTools

            );

            // Register in tool registry

            const registeredTools = this.toolRegistry.registerNamespaceTools(

                namespaceName,

                namespacedTools

            );

            // Track as loaded

            this.loadedNamespaces.add(namespaceName);

            // Update metrics

            this.metrics.namespacesLoaded++;

            this.metrics.toolsLoaded += registeredTools.length;

            const loadTime = Date.now() - startTime;

            this.log(

                `âœ… Loaded namespace '${namespaceName}': ${registeredTools.length} tools in ${loadTime}ms`

            );

            return registeredTools;

        } catch (error) {

            this.log(

                `âŒ Failed to load namespace '${namespaceName}': ${error.message}`,

                'error'

            );

            throw error;

        }

    }

    /**

     * Sort tools by priority for optimal user experience

     */

    sortToolsByPriority(tools) {

        const priorityOrder = { high: 3, medium: 2, low: 1 };

        const categoryOrder = {

            discovery: 10,

            communication: 9,

            calendar: 8,

            files: 7,

            administration: 6,

            automation: 5,

            data: 4,

            general: 3,

        };

        tools.sort((a, b) => {

            // Discovery tools first

            const aCategory = a.annotations?.category || 'general';

            const bCategory = b.annotations?.category || 'general';

            if (aCategory !== bCategory) {

                return (

                    (categoryOrder[bCategory] || 0) - (categoryOrder[aCategory] || 0)

                );

            }

            // Then by priority

            const aPriority = a.annotations?.priority || 'low';

            const bPriority = b.annotations?.priority || 'low';

            if (aPriority !== bPriority) {

                return (

                    (priorityOrder[bPriority] || 0) - (priorityOrder[aPriority] || 0)

                );

            }

            // Finally by name

            return a.name.localeCompare(b.name);

        });

    }

    /**

     * Update performance metrics

     */

    updateMetrics(loadTime, toolCount) {

        this.metrics.averageLoadTime =

            (this.metrics.averageLoadTime * (this.metrics.totalRequests - 1) +

                loadTime) /

            this.metrics.totalRequests;

    }

    /**

     * Get performance metrics

     */

    getMetrics() {

        return {

            ...this.metrics,

            loadedNamespaces: Array.from(this.loadedNamespaces),

            registryStats: this.toolRegistry.getStats(),

        };

    }

    /**

     * Optimize based on usage patterns

     */

    async optimizeBasedOnUsage() {

        if (!this.enablePredictiveLoading) return;

        const topNamespaces = this.toolRegistry.getTopUsedNamespaces(3);

        const unloadedTopNamespaces = topNamespaces.filter(

            ns => !this.loadedNamespaces.has(ns)

        );

        if (unloadedTopNamespaces.length > 0) {

            this.log(

                `ðŸŽ¯ Predictively loading top used namespaces: ${unloadedTopNamespaces.join(

                    ', '

                )}`

            );

            for (const namespace of unloadedTopNamespaces) {

                try {

                    await this.loadNamespace(namespace);

                } catch (error) {

                    this.log(

                        `âš ï¸ Failed to predictively load '${namespace}': ${error.message}`,

                        'warn'

                    );

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

     * Clear caches and reset state (for startup refresh)

     */

    clearCaches() {

        this.loadedNamespaces.clear();

        this.loadingPromises.clear();

        this.initializationComplete = false;

        this.initializationStarted = false;

        this._preloadPromise = null;

        // Reset metrics

        this.metrics = {

            toolsLoaded: 0,

            namespacesLoaded: 0,

            cacheHits: 0,

            cacheMisses: 0,

            averageLoadTime: 0,

            totalRequests: 0,

        };

    }

    /**

     * Cleanup resources

     */

    destroy() {

        this.clearCaches();

    }

}

module.exports = { IntelligentToolLoader };


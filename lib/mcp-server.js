/**
 * Uru MCP Server - Hierarchical Tool Namespace Implementation
 *
 * MCP-compliant server with hierarchical tool namespacing for efficient
 * management of 400+ tools while maintaining full protocol compliance.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
    InitializedNotificationSchema,
    McpError,
    ErrorCode,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const chalk = require('chalk');

// Import hierarchical namespace components
const { DynamicToolRegistry, ToolNamespaceManager } = require('./namespace-manager');
const { IntelligentToolLoader } = require('./tool-loader');

class UruMCPServer {
    constructor(config) {
        // Validate configuration
        this.validateConfig(config);

        this.config = config;
        this.proxyUrl = config.proxyUrl;
        this.token = config.token;
        this.debug = config.debug;
        this.isConnected = false;

        this.log('[INFO] Uru MCP Server initializing with hierarchical namespaces...');
        this.log(`[INFO] Proxy URL: ${this.proxyUrl}`);
        this.log(
            `[INFO] Token: ${this.token ? this.token.substring(0, 20) + '...' : 'none'}`
        );

        // Initialize hierarchical namespace components
        this.toolRegistry = new DynamicToolRegistry({
            maxCacheAge: config.cacheTimeout || 300000,
            maxNamespaces: config.maxNamespaces || 20,
        });

        this.namespaceManager = new ToolNamespaceManager({
            proxyUrl: this.proxyUrl,
            token: this.token,
            debug: this.debug,
            cacheTimeout: config.cacheTimeout || 30000,
            timeout: config.timeout || 30000,
        });

        this.toolLoader = new IntelligentToolLoader(
            this.namespaceManager,
            this.toolRegistry,
            {
                // No max tool limit by default; can be overridden via config if needed
                maxToolsPerPage: config.maxToolsPerPage ?? Infinity,
                preloadNamespaces: config.preloadNamespaces || ['platform', 'company'],
                enableParallelLoading: config.enableParallelLoading !== false,
                enablePredictiveLoading: config.enablePredictiveLoading || false,
                debug: this.debug,
            }
        );

        // Create MCP server instance with updated information
        this.server = new Server(
            {
                name: 'uru-mcp',
                version: '3.4.2',
                title: 'Uru Platform MCP Server',
                description:
                    'MCP-compliant server with hierarchical tool namespacing for efficient management of 400+ tools',
                instructions: `This server provides access to Uru Platform tools using hierarchical namespacing for optimal organization and discovery.

HOW TO USE:

1. DISCOVERY: Call tools/list to see namespace tools (e.g., gmail_work_kal__list_tools, gmail_work_kal__execute_tool)

2. EXPLORATION: Call namespace list_tools (e.g., gmail_work_kal__list_tools) to see available tools in that namespace

3. EXECUTION: Call namespace execute_tool (e.g., gmail_work_kal__execute_tool) with tool_name and parameters

EXAMPLE WORKFLOW:
- Call tools/list → See [gmail_work_kal__list_tools, gmail_work_kal__execute_tool, platform__list_tools, platform__execute_tool, ...]
- Call gmail_work_kal__list_tools → Shows available Gmail tools
- Call gmail_work_kal__execute_tool with {"tool_name": "GMAIL_SEND_EMAIL", "parameters": {"to": "user@example.com", "subject": "Test"}} → Email gets sent

This hierarchical approach provides full MCP compliance while efficiently managing large tool catalogs.`,
            },
            {
                capabilities: {
                    tools: {
                        listChanged: true,
                    },
                    resources: {},
                    prompts: {},
                    logging: {
                        level: 'info',
                    },
                },
            }
        );

        this.setupHandlers();
    }

    /**
     * Validate configuration parameters
     */
    validateConfig(config) {
        if (!config) {
            throw new Error('Configuration is required');
        }

        if (!config.proxyUrl) {
            throw new Error('Proxy URL is required in configuration');
        }

        // Validate URL format
        try {
            new URL(config.proxyUrl);
        } catch (error) {
            throw new Error(`Invalid proxy URL format: ${config.proxyUrl}`);
        }

        // Validate timeout values
        if (
            config.timeout &&
            (typeof config.timeout !== 'number' || config.timeout <= 0)
        ) {
            throw new Error('Timeout must be a positive number');
        }

        if (
            config.cacheTimeout &&
            (typeof config.cacheTimeout !== 'number' || config.cacheTimeout <= 0)
        ) {
            throw new Error('Cache timeout must be a positive number');
        }
    }

    /**
     * Log messages for internal debugging only
     * Always use stderr to avoid contaminating JSON-RPC on stdout
     * Note: MCP notifications should NOT be used for routine logging
     */
    log(message, level = 'info') {
        // Internal debug logging to stderr only
        if (this.debug) {
            console.error(chalk.gray(`[Uru MCP] ${message}`));
        }
    }

    /**
     * Create a proper MCP error with JSON-RPC error codes
     */
    createMcpError(code, message, data = null) {
        const error = new Error(message);
        error.code = code;
        if (data) {
            error.data = data;
        }
        return error;
    }

    /**
     * Start the MCP server
     */
    async start() {
        try {
            // Test connection to proxy (skip in test mode)
            if (!this.config.testMode) {
                try {
                    await this.testProxyConnection();
                    this.log('✅ Proxy connection successful');

                    // Clear all caches on startup to ensure fresh tools
                    this.log('[INFO] Clearing caches for fresh tool discovery...');
                    this.toolRegistry.clearCaches();
                    this.namespaceManager.clearCaches();
                    this.toolLoader.clearCaches();
                    this.log('✅ Caches cleared - fresh tools will be loaded');

                    // Pre-warm namespace cache for Claude Desktop performance
                    this.log('[INFO] Pre-warming namespace cache...');
                    try {
                        await this.namespaceManager.fetchNamespacesFromProxy();
                        // Start periodic watcher to notify clients when tool list changes
                        this.startToolChangeWatcher();
                        this.log('✅ Namespace cache pre-warmed successfully');
                    } catch (cacheError) {
                        this.log(
                            `[WARNING]: Cache pre-warming failed: ${cacheError.message}`,
                            'warn'
                        );
                    }
                } catch (error) {
                    this.log(
                        `[WARNING]: Proxy connection test failed: ${error.message}`,
                        'warn'
                    );
                    this.log(
                        '[WARNING]: Server will start anyway - tools may fail until proxy is available',
                        'warn'
                    );
                }
            } else {
                this.log(
                    '[WARNING]: Running in test mode - skipping proxy connection test'
                );
            }

            this.log('[INFO] Starting MCP server...');

            // Create transport and start server
            const transport = new StdioServerTransport();
            await this.server.connect(transport);

            // Mark as connected after successful connection
            this.isConnected = true;

            this.log('[INFO] MCP server started successfully');
        } catch (error) {
            this.log(`[ERROR]: Failed to start server: ${error.message}`);
            throw error;
        }
    }

    /**
     * Test connection to proxy with fallback endpoints
     */
    async testProxyConnection() {
        const testEndpoints = ['/health', '/list/apps', '/namespaces'];

        for (const endpoint of testEndpoints) {
            try {
                this.log(`🔍 Testing proxy connection with ${endpoint}...`);

                const response = await axios.get(`${this.proxyUrl}${endpoint}`, {
                    timeout: this.config.timeout || 10000,
                    headers: this.getAuthHeaders(),
                });

                if (response.status === 200) {
                    this.log(`✅ Proxy connection successful via ${endpoint}`);
                    return true;
                }
            } catch (error) {
                this.log(`⚠️ ${endpoint} failed: ${error.message}`, 'warn');

                // If this is the last endpoint, handle the error
                if (endpoint === testEndpoints[testEndpoints.length - 1]) {
                    if (error.code === 'ECONNREFUSED') {
                        throw new Error(
                            `Cannot connect to proxy at ${this.proxyUrl}. Is the server running?`
                        );
                    } else if (error.code === 'ENOTFOUND') {
                        throw new Error(
                            `Proxy URL not found: ${this.proxyUrl}. Check your configuration.`
                        );
                    } else if (error.response?.status === 401) {
                        // If no token is configured, this is expected - just warn
                        if (!this.token) {
                            this.log(
                                '⚠️ No authentication token configured - API keys must be provided in tool arguments'
                            );
                            return true;
                        }
                        throw new Error('Authentication failed. Check your token.');
                    } else if (error.response?.status === 403) {
                        throw new Error('Access forbidden. Check your permissions.');
                    }
                    // Continue to next endpoint for other errors
                }
            }
        }

        // If we get here, all endpoints failed
        throw new Error(
            `All proxy connection tests failed. Check if ${this.proxyUrl} is accessible.`
        );
    }

    /**
     * Get authentication headers
     * @param {string} apiKey - Optional API key to use instead of the configured token
     */
    getAuthHeaders(apiKey = null) {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Uru-MCP-Proxy/1.0.0',
        };

        // Use provided API key, fallback to configured token
        const tokenToUse = apiKey || this.token;
        if (tokenToUse) {
            headers['Authorization'] = `Bearer ${tokenToUse}`;
        }

        return headers;
    }

    /**
     * Setup MCP request handlers for hierarchical namespace system
     */
    setupHandlers() {
        // Handle tool listing with hierarchical namespacing
        this.server.setRequestHandler(ListToolsRequestSchema, async request => {
            try {
                this.log('📋 MCP client requesting tool list...');

                // Initialize tool loader if not already done
                if (!this.toolLoader.initializationComplete) {
                    await this.toolLoader.initialize();
                }

                const cursor = request.params?.cursor;
                const result = await this.toolLoader.getToolsForListing(cursor);

                // Removed legacy 'uru_help' injection to avoid duplicates and confusion.
                // Help is provided via top-level namespaces (e.g., Uru Platform Guide / Tool Info).

                // Enhance tools with API key parameter
                const enhancedTools = this.enhanceToolsWithApiKeyParam(result.tools);

                this.log(
                    `✅ Returning ${enhancedTools.length} tools (cursor: ${
                        cursor || 'start'
                    }, next: ${result.nextCursor || 'end'})`
                );

                const response = {
                    tools: enhancedTools,
                };

                // Only include nextCursor if there are more pages (MCP protocol compliance)
                if (result.nextCursor) {
                    response.nextCursor = result.nextCursor;
                }

                return response;
            } catch (error) {
                this.log(`❌ Error in tools/list: ${error.message}`, 'error');

                // Return proper MCP errors
                if (error.response?.status === 401) {
                    throw this.createMcpError(-32001, 'Authentication failed', {
                        suggestion: this.token
                            ? 'Check your URU_API_KEY environment variable'
                            : 'Provide an api_key parameter in your tool arguments',
                    });
                } else if (error.response?.status === 403) {
                    throw this.createMcpError(-32002, 'Access forbidden', {
                        suggestion:
                            'Your API key may not have the required permissions',
                    });
                } else if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ENOTFOUND'
                ) {
                    throw this.createMcpError(
                        -32003,
                        'Cannot connect to Uru Platform',
                        {
                            suggestion: 'Check your internet connection and try again',
                        }
                    );
                }

                // Return empty tools list for other errors
                this.log(
                    `Returning empty tools list due to error: ${error.message}`,
                    'warning'
                );
                return { tools: [] };
            }
        });

        // Handle notifications/initialized (required by MCP protocol)
        // Handle notifications/initialized (required by MCP protocol)
        this.server.setNotificationHandler(InitializedNotificationSchema, async () => {
            this.log('📨 Client initialized notification received');
            return {}; // Return empty object for notifications
        });

        // Handle tool execution with hierarchical namespacing
        this.server.setRequestHandler(CallToolRequestSchema, async request => {
            try {
                let { name, arguments: toolArgs } = request.params;

                // Strip server prefix if present (Claude adds "uru:" prefix)
                if (name.includes(':')) {
                    const [serverPrefix, toolName] = name.split(':', 2);
                    name = toolName;
                    this.log(
                        `🔧 Stripped server prefix '${serverPrefix}:' from tool name`
                    );
                }

                this.log(`🔧 Executing tool: ${name}`);
                this.log(`📝 Arguments: ${JSON.stringify(toolArgs, null, 2)}`);

                // Extract API key from tool arguments
                let apiKey = null;
                let cleanedArgs = toolArgs;

                if (toolArgs && typeof toolArgs === 'object' && toolArgs.api_key) {
                    apiKey = toolArgs.api_key;
                    cleanedArgs = { ...toolArgs };
                    delete cleanedArgs.api_key;
                    this.log(`🔑 Using API key from tool arguments`);
                } else if (this.token) {
                    this.log(`🔑 Using configured token as fallback`);
                } else {
                    throw this.createMcpError(-32001, 'Authentication required', {
                        suggestion:
                            'Provide an api_key parameter in your tool arguments, or configure URU_API_KEY environment variable',
                    });
                }

                // Legacy 'uru_help' tool removed. Use top-level guide/tool info namespaces instead.

                // Handle namespace discovery tools
                if (name.endsWith('__list_tools')) {
                    return await this.handleNamespaceDiscovery(
                        name,
                        cleanedArgs,
                        apiKey
                    );
                }

                // Handle namespace execute tools
                if (name.endsWith('__execute_tool')) {
                    return await this.handleNamespaceExecuteTool(
                        name,
                        cleanedArgs,
                        apiKey
                    );
                }

                // Handle namespaced tool execution (legacy/backward compatibility)
                if (
                    name.includes('__') &&
                    !name.endsWith('__list_tools') &&
                    !name.endsWith('__execute_tool')
                ) {
                    return await this.handleNamespacedToolExecution(
                        name,
                        cleanedArgs,
                        apiKey
                    );
                }

                // Handle legacy tool names (for backward compatibility during transition)
                return await this.handleLegacyToolExecution(name, cleanedArgs, apiKey);
            } catch (error) {
                this.log(`❌ Tool execution failed: ${error.message}`, 'error');

                // Return proper MCP errors
                if (error.response?.status === 404) {
                    throw this.createMcpError(
                        -32601,
                        `Tool '${request.params.name}' not found`,
                        {
                            suggestion:
                                'Use namespace_list_tools to discover available tools',
                        }
                    );
                } else if (error.response?.status === 400) {
                    throw this.createMcpError(
                        -32602,
                        `Invalid parameters for tool '${request.params.name}'`,
                        {
                            error: error.response.data?.message || 'Bad request',
                            suggestion: "Check the tool's input schema",
                        }
                    );
                } else if (error.response?.status === 401) {
                    throw this.createMcpError(
                        -32001,
                        'Authentication failed during tool execution',
                        {
                            suggestion:
                                'Check your api_key parameter or URU_API_KEY environment variable',
                        }
                    );
                } else if (error.response?.status === 403) {
                    throw this.createMcpError(
                        -32002,
                        `Access denied for tool '${request.params.name}'`,
                        {
                            suggestion:
                                'Your API key may not have permission to use this tool',
                        }
                    );
                } else if (
                    error.code === 'ECONNREFUSED' ||
                    error.code === 'ENOTFOUND'
                ) {
                    throw this.createMcpError(
                        -32003,
                        'Cannot connect to Uru Platform during tool execution',
                        {
                            suggestion: 'Check your internet connection and try again',
                        }
                    );
                }

                // For other errors, return a generic error response
                throw this.createMcpError(
                    -32000,
                    `Tool execution failed: ${error.message}`,
                    {
                        tool: request.params.name,
                        suggestion:
                            'Try again or contact support if the issue persists',
                    }
                );
            }
        });
    }

    // NOTE: Legacy help handler removed. Help content is now provided via
    // dedicated top-level namespaces (e.g., uru_platform_guide, uru_platform_tool_info).

    /**
     * Handle namespace discovery
     * @param {string} toolName - Name of the discovery tool
     * @param {object} args - Tool arguments
     * @param {string} apiKey - Optional API key to use for this request
     */
    async handleNamespaceDiscovery(toolName, args, apiKey = null) {
        const namespace = toolName.replace('__list_tools', '');
        const appName = this.namespaceManager.denormalizeNamespace(namespace);

        this.log(`📋 Discovering tools for namespace: ${namespace} (${appName})`);

        try {
            // Load tools for this namespace if not already loaded
            const namespacedTools = await this.toolLoader.loadNamespace(
                namespace,
                apiKey
            );

            // Get available tools in this namespace (excluding discovery tool)
            const availableTools = namespacedTools.filter(
                tool => !tool.name.endsWith('_list_tools')
            );

            // Apply filters if provided
            let filteredTools = availableTools;

            if (args?.filter) {
                const filter = args.filter.toLowerCase();
                filteredTools = availableTools.filter(
                    tool =>
                        tool.name.toLowerCase().includes(filter) ||
                        tool.description.toLowerCase().includes(filter)
                );
            }

            if (args?.category) {
                filteredTools = filteredTools.filter(
                    tool => tool.annotations?.category === args.category
                );
            }

            return {
                content: [
                    {
                        type: 'text',
                        text: this.formatToolDiscoveryResponse(
                            appName,
                            namespace,
                            filteredTools,
                            args
                        ),
                    },
                ],
            };
        } catch (error) {
            this.log(
                `❌ Failed to discover tools for namespace '${namespace}': ${error.message}`,
                'error'
            );
            throw this.createMcpError(
                -32001,
                `Failed to load namespace '${namespace}'`,
                {
                    error: error.message,
                    suggestion: 'Check your authentication and try again',
                }
            );
        }
    }

    /**
     * Format tool discovery response with detailed parameter information
     */
    formatToolDiscoveryResponse(appName, namespace, tools, args) {
        const icon = this.namespaceManager.getNamespaceIcon(namespace);
        const filterInfo = args?.filter ? ` (filtered by: ${args.filter})` : '';
        const categoryInfo = args?.category ? ` (category: ${args.category})` : '';

        // Categorize tools
        const categories = this.categorizeTools(tools);

        let response = `# ${icon} ${appName} Tools Available (${tools.length} tools)${filterInfo}${categoryInfo}\n\n`;

        if (tools.length === 0) {
            response += `No tools found${
                args?.filter || args?.category ? ' matching your criteria' : ''
            }.\n\n`;
            response += `**Try:** Call \`${namespace}__list_tools\` without filters to see all available tools.`;
            return response;
        }

        // Show tools by category with detailed parameter information
        for (const [categoryName, categoryTools] of Object.entries(categories)) {
            if (categoryTools.length > 0) {
                const categoryIcon = this.getCategoryIcon(categoryName);
                response += `## ${categoryIcon} ${this.formatCategoryName(
                    categoryName
                )}\n`;

                for (const tool of categoryTools) {
                    const priority = tool.annotations?.priority || 'low';
                    const priorityIcon =
                        priority === 'high'
                            ? '⭐'
                            : priority === 'medium'
                            ? '🔸'
                            : '🔹';
                    // Show the original tool name (without namespace prefix) for execute_tool usage
                    const displayName = tool.originalName || tool.name;
                    response += `${priorityIcon} **${displayName}** - ${tool.description}\n`;

                    // Add parameter information
                    if (
                        tool.inputSchema &&
                        tool.inputSchema.properties &&
                        Object.keys(tool.inputSchema.properties).length > 0
                    ) {
                        const properties = tool.inputSchema.properties;
                        const required = tool.inputSchema.required || [];

                        response += `   **Parameters:**\n`;
                        for (const [paramName, paramDef] of Object.entries(
                            properties
                        )) {
                            const isRequired = required.includes(paramName);
                            const requiredMark = isRequired
                                ? ' (required)'
                                : ' (optional)';
                            const paramType = paramDef.type || 'any';
                            const paramDesc = paramDef.description || 'No description';
                            response += `   - \`${paramName}\` (${paramType})${requiredMark}: ${paramDesc}\n`;
                        }
                    } else {
                        response += `   **Parameters:** No parameters required\n`;
                    }
                    response += '\n';
                }
            }
        }

        response += `\n**💡 Usage Instructions:**\n`;
        response += `To execute any tool above, use \`${namespace}__execute_tool\` with this structure:\n`;
        response += `\`\`\`json\n`;
        response += `{\n`;
        response += `  "tool_name": "EXACT_TOOL_NAME_FROM_ABOVE",\n`;
        response += `  "parameters": {\n`;
        response += `    "param1": "value1",\n`;
        response += `    "param2": "value2"\n`;
        response += `  }\n`;
        response += `}\n`;
        response += `\`\`\`\n`;

        // Add a specific example if tools are available
        if (tools.length > 0) {
            const exampleTool = tools[0];
            const exampleToolName = exampleTool.originalName || exampleTool.name;
            response += `\n**📋 Example for ${exampleToolName}:**\n`;
            response += `\`${namespace}__execute_tool\` with:\n`;
            response += `\`\`\`json\n`;
            response += `{\n`;
            response += `  "tool_name": "${exampleToolName}",\n`;
            response += `  "parameters": {\n`;

            // Add example parameters based on the tool's schema
            if (exampleTool.inputSchema && exampleTool.inputSchema.properties) {
                const properties = exampleTool.inputSchema.properties;
                const required = exampleTool.inputSchema.required || [];
                let paramCount = 0;

                for (const [paramName, paramDef] of Object.entries(properties)) {
                    if (paramCount >= 3) break; // Limit to 3 example parameters
                    const isRequired = required.includes(paramName);
                    if (isRequired || paramCount < 2) {
                        // Show required params and up to 2 optional ones
                        let exampleValue;
                        switch (paramDef.type) {
                            case 'string':
                                exampleValue = `"example_${paramName}"`;
                                break;
                            case 'number':
                                exampleValue = paramDef.default || 10;
                                break;
                            case 'boolean':
                                exampleValue = paramDef.default || true;
                                break;
                            case 'array':
                                exampleValue = '["item1", "item2"]';
                                break;
                            default:
                                exampleValue = '"example_value"';
                        }
                        response += `    "${paramName}": ${exampleValue}${
                            paramCount < Math.min(Object.keys(properties).length - 1, 2)
                                ? ','
                                : ''
                        }\n`;
                        paramCount++;
                    }
                }
            } else {
                response += `    // No parameters required\n`;
            }

            response += `  }\n`;
            response += `}\n`;
            response += `\`\`\`\n`;
        }

        return response;
    }

    /**
     * Handle namespace execute tool
     * @param {string} toolName - Name of the execute tool (e.g., gmail_work_kal__execute_tool)
     * @param {object} args - Tool arguments containing tool_name and parameters
     * @param {string} apiKey - Optional API key to use for this request
     */
    async handleNamespaceExecuteTool(toolName, args, apiKey = null) {
        const namespace = toolName.replace('__execute_tool', '');
        const appName = this.namespaceManager.denormalizeNamespace(namespace);

        this.log(
            `🚀 Executing tool via execute_tool: ${args.tool_name} in namespace: ${namespace} (${appName})`
        );

        // Validate required parameters
        if (!args.tool_name) {
            throw this.createMcpError(-32602, 'Missing required parameter: tool_name', {
                suggestion:
                    'Provide the tool_name parameter with the name of the tool to execute',
            });
        }

        // Extract tool name and parameters
        const targetToolName = args.tool_name;
        const toolParameters = args.parameters || {};

        this.log(
            `🔧 Executing tool '${targetToolName}' in app '${appName}' with namespace '${namespace}'`
        );

        try {
            // Execute the tool via proxy with namespace for connection routing
            const result = await this.executeToolOnProxy(
                targetToolName,
                toolParameters,
                appName,
                apiKey,
                namespace
            );

            // Debug logging to check the result format
            this.log(
                `🔍 Execute tool result: ${JSON.stringify(result, null, 2)}`,
                'debug'
            );

            // Ensure the result has the correct MCP format
            if (!result || !result.content || !Array.isArray(result.content)) {
                this.log(`⚠️ Invalid result format from executeToolOnProxy`, 'warn');
                return {
                    content: [
                        {
                            type: 'text',
                            text: `Tool execution completed but returned invalid format: ${JSON.stringify(
                                result
                            )}`,
                        },
                    ],
                };
            }

            // Validate each content item has required fields
            for (let i = 0; i < result.content.length; i++) {
                const item = result.content[i];
                if (item.type === 'text' && !item.text) {
                    this.log(`⚠️ Content item ${i} missing text field`, 'warn');
                    item.text = 'Empty response';
                }
            }

            return result;
        } catch (error) {
            this.log(
                `❌ Failed to execute tool '${targetToolName}' in namespace '${namespace}': ${error.message}`,
                'error'
            );
            throw this.createMcpError(
                -32001,
                `Failed to execute tool '${targetToolName}'`,
                {
                    error: error.message,
                    suggestion: `Use ${namespace}__list_tools to verify the tool name and parameters`,
                }
            );
        }
    }

    /**
     * Handle namespaced tool execution (legacy/backward compatibility)
     */
    async handleNamespacedToolExecution(toolName, args, apiKey) {
        this.log(`🔧 Executing namespaced tool: ${toolName}`);

        // Check if tool is in registry
        let tool = this.toolRegistry.getTool(toolName);

        if (!tool) {
            // Try to load the namespace for this tool
            const [namespace] = toolName.split('__');
            this.log(`🔍 Loading namespace ${namespace} for tool ${toolName}`);

            try {
                await this.toolLoader.loadNamespace(namespace);
                tool = this.toolRegistry.getTool(toolName);
            } catch (error) {
                this.log(
                    `❌ Failed to load namespace ${namespace}: ${error.message}`,
                    'error'
                );
            }
        }

        if (!tool) {
            throw this.createMcpError(-32601, `Tool '${toolName}' not found`, {
                suggestion: `Use ${
                    toolName.split('__')[0]
                }__list_tools to discover available tools`,
            });
        }

        // Extract original tool name and app context
        const namespace = tool.namespace;
        const originalToolName = tool.originalName;
        const appName = this.namespaceManager.denormalizeNamespace(namespace);

        this.log(
            `🔧 Executing tool '${originalToolName}' in app '${appName}' with namespace '${namespace}'`
        );

        // Execute the tool via proxy with namespace for connection routing
        return await this.executeToolOnProxy(
            originalToolName,
            args,
            appName,
            apiKey,
            namespace
        );
    }

    /**
     * Handle legacy tool execution (for backward compatibility)
     */
    async handleLegacyToolExecution(toolName, args, apiKey) {
        this.log(`🔍 Searching for legacy tool '${toolName}' across all namespaces`);

        try {
            const apps = await this.namespaceManager.fetchAppsFromProxy(apiKey);

            for (const appName of apps) {
                try {
                    const namespace = this.namespaceManager.normalizeNamespace(appName);

                    // Load namespace if not already loaded
                    if (!this.toolRegistry.isNamespaceLoaded(namespace)) {
                        await this.toolLoader.loadNamespace(namespace, apiKey);
                    }

                    // Check if tool exists in this namespace
                    const namespacedToolName = `${namespace}.${toolName}`;
                    const tool = this.toolRegistry.getTool(namespacedToolName);

                    if (tool) {
                        this.log(
                            `🔧 Found legacy tool '${toolName}' in namespace '${namespace}' - executing`
                        );
                        return await this.executeToolOnProxy(
                            tool.originalName || toolName,
                            args,
                            appName,
                            apiKey,
                            namespace
                        );
                    }
                } catch (error) {
                    this.log(
                        `⚠️ Error checking namespace '${appName}' for tool '${toolName}': ${error.message}`,
                        'warn'
                    );
                }
            }

            throw this.createMcpError(
                -32601,
                `Tool '${toolName}' not found in any namespace`,
                {
                    suggestion: 'Use namespace_list_tools to discover available tools',
                }
            );
        } catch (error) {
            if (error.code) throw error; // Re-throw MCP errors
            throw this.createMcpError(
                -32000,
                `Failed to search for tool '${toolName}': ${error.message}`
            );
        }
    }

    /**
     * Execute tool on proxy using REST API endpoint with enhanced namespace routing
     * @param {string} toolName - Name of the tool to execute
     * @param {object} parameters - Tool parameters
     * @param {string} appName - App name for context
     * @param {string} apiKey - Optional API key to use for this request
     * @param {string} namespace - Optional namespace for connection metadata lookup
     */
    async executeToolOnProxy(
        toolName,
        parameters,
        appName,
        apiKey = null,
        namespace = null
    ) {
        // Connection metadata for routing (declared outside try so catch can reference it)
        let connectionMetadata = null;

        try {
            this.log(
                `🔧 Executing tool '${toolName}' in app '${appName}' (namespace: ${
                    namespace || 'none'
                })`
            );

            // Use the tool name directly for proxy execution
            const toolSlug = toolName;

            // Get connection metadata if namespace is provided
            let connectionMetadata = null;
            if (namespace) {
                connectionMetadata =
                    this.namespaceManager.getNamespaceMetadata(namespace);
                if (connectionMetadata) {
                    this.log(
                        `🔗 Found connection metadata for namespace '${namespace}': ${JSON.stringify(
                            connectionMetadata
                        )}`
                    );
                } else {
                    this.log(
                        `⚠️ No connection metadata found for namespace '${namespace}', falling back to app context`
                    );
                }
            }

            // Build request body with enhanced routing context
            const requestBody = {
                ...(parameters || {}),
                _app_context: appName, // Legacy app context for backward compatibility
            };

            // Add connection metadata if available
            if (connectionMetadata && connectionMetadata.connected_account_id) {
                requestBody._connected_account_id =
                    connectionMetadata.connected_account_id;
                requestBody._server_id = connectionMetadata.server_id;
                this.log(
                    `🎯 Using connected_account_id: ${connectionMetadata.connected_account_id}`
                );
            }

            const headers = {
                ...this.getAuthHeaders(apiKey),
                'Content-Type': 'application/json',
                'X-App-Context': appName, // Legacy header for backward compatibility
            };

            // Add connection metadata to headers if available
            if (connectionMetadata && connectionMetadata.connected_account_id) {
                headers['X-Connected-Account-Id'] =
                    connectionMetadata.connected_account_id;
                if (connectionMetadata.server_id) {
                    headers['X-Server-Id'] = connectionMetadata.server_id;
                }
            }

            const response = await axios.post(
                `${this.proxyUrl}/execute/${encodeURIComponent(toolSlug)}`,
                requestBody,
                {
                    // Standardize timeout to 3 minutes
                    timeout: this.config.timeout || 180000,
                    headers,
                }
            );

            this.log(
                `📊 Tool execution response: ${JSON.stringify(response.data, null, 2)}`
            );

            // Handle the response according to the architecture
            // The architecture specifies normalized responses: {data, successful, error, log_id}
            // Also handle backend responses that use 'success' instead of 'successful'
            if (response.data && typeof response.data === 'object') {
                if (
                    response.data.successful === false ||
                    response.data.success === false
                ) {
                    // Return MCP-compliant error response instead of throwing
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Tool execution failed: ${
                                    response.data.error || 'Unknown error'
                                }`,
                            },
                        ],
                        isError: true,
                    };
                }

                // Return MCP-compliant response format
                let responseText;
                if (response.data.data !== undefined) {
                    responseText =
                        typeof response.data.data === 'string'
                            ? response.data.data
                            : JSON.stringify(response.data.data, null, 2);
                } else {
                    // Fallback if data field is missing - use the whole response
                    responseText = JSON.stringify(response.data, null, 2);
                }

                return {
                    content: [
                        {
                            type: 'text',
                            text: responseText,
                        },
                    ],
                };
            } else {
                // Fallback for non-standard response
                return {
                    content: [
                        {
                            type: 'text',
                            text:
                                typeof response.data === 'string'
                                    ? response.data
                                    : JSON.stringify(response.data, null, 2),
                        },
                    ],
                };
            }
        } catch (error) {
            // Enhanced error logging for debugging
            this.log(`❌ Tool execution failed for '${toolName}':`, 'error');
            this.log(`   App: ${appName}`, 'error');
            this.log(`   Namespace: ${namespace || 'none'}`, 'error');
            this.log(
                `   Connection metadata: ${
                    connectionMetadata ? JSON.stringify(connectionMetadata) : 'none'
                }`,
                'error'
            );
            this.log(`   Error: ${error.message}`, 'error');

            if (error.response) {
                this.log(`   HTTP Status: ${error.response.status}`, 'error');
                this.log(
                    `   Response data: ${JSON.stringify(error.response.data)}`,
                    'error'
                );
            }

            // Provide specific error messages based on HTTP status
            if (error.response?.status === 404) {
                const suggestion = namespace
                    ? `Tool '${toolName}' not found. Try calling ${namespace}_list_tools to see available tools.`
                    : `Tool '${toolName}' not found on proxy. Check if the tool name is correct.`;
                throw new Error(suggestion);
            } else if (error.response?.status === 400) {
                const details =
                    error.response.data?.message ||
                    error.response.data?.error ||
                    'Bad request';
                throw new Error(
                    `Invalid parameters for tool '${toolName}': ${details}`
                );
            } else if (error.response?.status === 401) {
                throw new Error('Authentication failed. Check your API key or token.');
            } else if (error.response?.status === 403) {
                const suggestion = connectionMetadata
                    ? `Access denied for tool '${toolName}'. The connected account may not have permission or the connection may be inactive.`
                    : `Access denied for tool '${toolName}'. Check your permissions.`;
                throw new Error(suggestion);
            } else if (error.response?.status === 500) {
                throw new Error(
                    `Server error executing tool '${toolName}'. This may be a temporary issue - please try again.`
                );
            } else {
                throw new Error(
                    `Proxy error executing '${toolName}': ${error.message}`
                );
            }
        }
    }

    /**
     * Categorize tools by type for better organization
     */
    categorizeTools(tools) {
        const categories = {
            communication: [],
            calendar: [],
            files: [],
            administration: [],
            automation: [],
            data: [],
            general: [],
        };

        for (const tool of tools) {
            const category = tool.annotations?.category || 'general';
            if (categories[category]) {
                categories[category].push(tool);
            } else {
                categories.general.push(tool);
            }
        }

        return categories;
    }

    /**
     * Get category icon
     */
    getCategoryIcon(category) {
        const icons = {
            communication: '📧',
            calendar: '📅',
            files: '📁',
            administration: '⚙️',
            automation: '🤖',
            data: '📊',
            general: '🔧',
        };
        return icons[category] || '🔧';
    }

    /**
     * Format category name for display
     */
    formatCategoryName(category) {
        return category.charAt(0).toUpperCase() + category.slice(1);
    }

    /**
     * Enhance tools with api_key parameter based on authentication configuration
     */
    enhanceToolsWithApiKeyParam(tools) {
        // Always add api_key parameter, but make it optional if we have a configured token
        return tools.map(tool => {
            const enhancedTool = { ...tool };

            // Ensure inputSchema exists
            if (!enhancedTool.inputSchema) {
                enhancedTool.inputSchema = {
                    type: 'object',
                    properties: {},
                    required: [],
                };
            }

            // Add api_key to properties if not already present
            if (!enhancedTool.inputSchema.properties.api_key) {
                enhancedTool.inputSchema.properties.api_key = {
                    type: 'string',
                    description: this.token
                        ? 'API key for authentication (optional, overrides configured token)'
                        : 'API key for authentication with the Uru Platform (required)',
                };

                // Only make api_key required if no token is configured
                if (!this.token) {
                    if (!enhancedTool.inputSchema.required) {
                        enhancedTool.inputSchema.required = [];
                    }
                    if (!enhancedTool.inputSchema.required.includes('api_key')) {
                        enhancedTool.inputSchema.required.push('api_key');
                    }
                }
            }

            return enhancedTool;
        });
    }

    /**
     * Periodically check for namespace changes and notify clients
     * so Claude refreshes the tool list without requiring a restart.
     */
    startToolChangeWatcher() {
        try {
            if (this._toolWatcher) {
                clearInterval(this._toolWatcher);
            }
            const intervalMs = this.config?.cacheTimeout || 30000; // default 30s
            this._lastNamespacesSig = null;

            const doCheck = async () => {
                try {
                    const sig = await this._getNamespacesSignature();
                    if (
                        sig &&
                        this._lastNamespacesSig &&
                        sig !== this._lastNamespacesSig
                    ) {
                        this.log('[INFO] Detected namespace change; notifying clients');
                        // Clear internal caches to ensure fresh data after client refresh
                        this.toolRegistry.clearCaches();
                        this.namespaceManager.clearCaches();
                        this.toolLoader.clearCaches();
                        // Notify clients that tool list changed (Claude will re-request tools/list)
                        await this.server.sendToolListChanged();
                    }
                    this._lastNamespacesSig = sig || this._lastNamespacesSig;
                } catch (err) {
                    this.log(
                        `[WARN] Tool change watcher check failed: ${err.message}`,
                        'warn'
                    );
                }
            };

            // Initial check eagerly (non-blocking)
            doCheck();
            this._toolWatcher = setInterval(doCheck, intervalMs);
            this.log(`[INFO] Tool change watcher started (interval=${intervalMs}ms)`);
        } catch (e) {
            this.log(
                `[WARN] Failed to start tool change watcher: ${e.message}`,
                'warn'
            );
        }
    }

    async _getNamespacesSignature() {
        try {
            const namespaces = await this.namespaceManager.fetchNamespacesFromProxy();
            if (!namespaces || !Array.isArray(namespaces)) return null;
            const names = namespaces
                .map(n => (n && (n.name || n.namespace)) || '')
                .filter(Boolean)
                .sort()
                .join('|');
            // Optionally include count in signature
            return `${names}#${namespaces.length}`;
        } catch (err) {
            return null;
        }
    }
}

module.exports = UruMCPServer;

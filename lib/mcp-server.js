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
  McpError,
  ErrorCode
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

    this.log('🔗 Uru MCP Server initializing with hierarchical namespaces...');
    this.log(`📡 Proxy URL: ${this.proxyUrl}`);
    this.log(`🔑 Token: ${this.token ? this.token.substring(0, 20) + '...' : 'none'}`);

    // Initialize hierarchical namespace components
    this.toolRegistry = new DynamicToolRegistry({
      maxCacheAge: config.cacheTimeout || 300000,
      maxNamespaces: config.maxNamespaces || 20
    });

    this.namespaceManager = new ToolNamespaceManager({
      proxyUrl: this.proxyUrl,
      token: this.token,
      debug: this.debug,
      cacheTimeout: config.cacheTimeout || 30000,
      timeout: config.timeout || 30000
    });

    this.toolLoader = new IntelligentToolLoader(
      this.namespaceManager,
      this.toolRegistry,
      {
        maxToolsPerPage: config.maxToolsPerPage || 50,
        preloadNamespaces: config.preloadNamespaces || ['platform', 'company'],
        enableParallelLoading: config.enableParallelLoading !== false,
        enablePredictiveLoading: config.enablePredictiveLoading || false,
        debug: this.debug
      }
    );

    // Create MCP server instance with updated information
    this.server = new Server(
      {
        name: 'uru-mcp',
        version: '3.1.0',
        title: 'Uru Platform MCP Server',
        description: 'MCP-compliant server with hierarchical tool namespacing for efficient management of 400+ tools',
        instructions: `This server provides access to Uru Platform tools using hierarchical namespacing for optimal organization and discovery.

HOW TO USE:

1. DISCOVERY: Call tools/list to see namespace discovery tools (e.g., gmail_work_kal.list_tools, platform.list_tools)

2. EXPLORATION: Call namespace discovery tools (e.g., gmail_work_kal.list_tools) to load and explore tools in that namespace

3. EXECUTION: Call specific namespaced tools directly (e.g., gmail_work_kal.send_email, platform.manage_users)

EXAMPLE WORKFLOW:
- Call tools/list → See [gmail_work_kal.list_tools, platform.list_tools, ...]
- Call gmail_work_kal.list_tools → Loads Gmail tools and shows available options
- Call gmail_work_kal.send_email with parameters → Email gets sent

This hierarchical approach provides full MCP compliance while efficiently managing large tool catalogs.`,
      },
      {
        capabilities: {
          tools: {
            listChanged: true
          },
          resources: {},
          prompts: {},
          logging: {
            level: 'info'
          }
        }
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
    if (config.timeout && (typeof config.timeout !== 'number' || config.timeout <= 0)) {
      throw new Error('Timeout must be a positive number');
    }

    if (config.cacheTimeout && (typeof config.cacheTimeout !== 'number' || config.cacheTimeout <= 0)) {
      throw new Error('Cache timeout must be a positive number');
    }
  }

  /**
   * Log messages with debug mode support and MCP logging capability
   * Always use stderr to avoid contaminating JSON-RPC on stdout
   */
  log(message, level = 'info') {
    // Internal debug logging to stderr
    if (this.debug) {
      console.error(chalk.gray(`[Uru MCP] ${message}`));
    }

    // Send structured log to MCP client if server is connected
    // Check if server is actually connected by verifying the transport exists
    if (this.server && this.server.notification && this.isConnected) {
      try {
        this.server.notification({
          method: 'notifications/message',
          params: {
            level: level,
            logger: 'uru-mcp',
            data: message,
          },
        });
      } catch (error) {
        // Ignore notification errors to prevent logging loops
      }
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
        await this.testProxyConnection();
        this.log('✅ Proxy connection successful');
      } else {
        this.log('⚠️ Running in test mode - skipping proxy connection test');
      }

      this.log('🚀 Starting MCP server...');

      // Create transport and start server
      const transport = new StdioServerTransport();
      await this.server.connect(transport);

      // Mark as connected after successful connection
      this.isConnected = true;

      this.log('✅ MCP server started successfully');

    } catch (error) {
      this.log(`❌ Failed to start server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Test connection to proxy
   */
  async testProxyConnection() {
    try {
      const response = await axios.get(`${this.proxyUrl}/health`, {
        timeout: this.config.timeout || 10000,
        headers: this.getAuthHeaders()
      });

      if (response.status !== 200) {
        throw new Error(`Proxy returned status ${response.status}`);
      }

      return true;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error(`Cannot connect to proxy at ${this.proxyUrl}. Is the server running?`);
      } else if (error.code === 'ENOTFOUND') {
        throw new Error(`Proxy URL not found: ${this.proxyUrl}. Check your configuration.`);
      } else if (error.response?.status === 401) {
        // If no token is configured, this is expected - just warn
        if (!this.token) {
          this.log('⚠️ No authentication token configured - API keys must be provided in tool arguments');
          return true;
        }
        throw new Error('Authentication failed. Check your token.');
      } else if (error.response?.status === 403) {
        throw new Error('Access forbidden. Check your permissions.');
      } else {
        throw new Error(`Proxy connection failed: ${error.message}`);
      }
    }
  }

  /**
   * Get authentication headers
   * @param {string} apiKey - Optional API key to use instead of the configured token
   */
  getAuthHeaders(apiKey = null) {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Uru-MCP-Proxy/1.0.0'
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
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      try {
        this.log('📋 MCP client requesting tool list...');

        // Initialize tool loader if not already done
        if (!this.toolLoader.initializationComplete) {
          await this.toolLoader.initialize();
        }

        const cursor = request.params?.cursor;
        const result = await this.toolLoader.getToolsForListing(cursor);

        // Add help tool if on first page
        if (!cursor) {
          result.tools.unshift({
            name: 'uru_help',
            description: 'Get help with Uru Platform hierarchical tool system and workflow',
            inputSchema: {
              type: 'object',
              properties: {},
              required: []
            },
            annotations: {
              title: '❓ Uru Help',
              category: 'help',
              priority: 'high'
            }
          });
        }

        // Enhance tools with API key parameter
        const enhancedTools = this.enhanceToolsWithApiKeyParam(result.tools);

        this.log(`✅ Returning ${enhancedTools.length} tools (cursor: ${cursor || 'start'}, next: ${result.nextCursor || 'end'})`);

        return {
          tools: enhancedTools,
          nextCursor: result.nextCursor
        };

      } catch (error) {
        this.log(`❌ Error in tools/list: ${error.message}`, 'error');

        // Return proper MCP errors
        if (error.response?.status === 401) {
          throw this.createMcpError(-32001, 'Authentication failed', {
            suggestion: this.token
              ? 'Check your URU_API_KEY environment variable'
              : 'Provide an api_key parameter in your tool arguments'
          });
        } else if (error.response?.status === 403) {
          throw this.createMcpError(-32002, 'Access forbidden', {
            suggestion: 'Your API key may not have the required permissions'
          });
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw this.createMcpError(-32003, 'Cannot connect to Uru Platform', {
            suggestion: 'Check your internet connection and try again'
          });
        }

        // Return empty tools list for other errors
        this.log(`Returning empty tools list due to error: ${error.message}`, 'warning');
        return { tools: [] };
      }
    });

    // Handle tool execution with hierarchical namespacing
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: toolArgs } = request.params;

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
            suggestion: 'Provide an api_key parameter in your tool arguments, or configure URU_API_KEY environment variable'
          });
        }

        // Handle help tool
        if (name === 'uru_help') {
          return await this.handleHelpTool(apiKey);
        }

        // Handle namespace discovery tools
        if (name.endsWith('.list_tools')) {
          return await this.handleNamespaceDiscovery(name, cleanedArgs, apiKey);
        }

        // Handle namespaced tool execution
        if (name.includes('.') && !name.endsWith('.list_tools')) {
          return await this.handleNamespacedToolExecution(name, cleanedArgs, apiKey);
        }

        // Handle legacy tool names (for backward compatibility during transition)
        return await this.handleLegacyToolExecution(name, cleanedArgs, apiKey);

      } catch (error) {
        this.log(`❌ Tool execution failed: ${error.message}`, 'error');

        // Return proper MCP errors
        if (error.response?.status === 404) {
          throw this.createMcpError(-32601, `Tool '${request.params.name}' not found`, {
            suggestion: 'Use namespace.list_tools to discover available tools'
          });
        } else if (error.response?.status === 400) {
          throw this.createMcpError(-32602, `Invalid parameters for tool '${request.params.name}'`, {
            error: error.response.data?.message || 'Bad request',
            suggestion: 'Check the tool\'s input schema'
          });
        } else if (error.response?.status === 401) {
          throw this.createMcpError(-32001, 'Authentication failed during tool execution', {
            suggestion: 'Check your api_key parameter or URU_API_KEY environment variable'
          });
        } else if (error.response?.status === 403) {
          throw this.createMcpError(-32002, `Access denied for tool '${request.params.name}'`, {
            suggestion: 'Your API key may not have permission to use this tool'
          });
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          throw this.createMcpError(-32003, 'Cannot connect to Uru Platform during tool execution', {
            suggestion: 'Check your internet connection and try again'
          });
        }

        // For other errors, return a generic error response
        throw this.createMcpError(-32000, `Tool execution failed: ${error.message}`, {
          tool: request.params.name,
          suggestion: 'Try again or contact support if the issue persists'
        });
      }
    });
  }

  /**
   * Handle help tool
   * @param {string} apiKey - Optional API key to use for this request
   */
  async handleHelpTool(apiKey = null) {
    this.log(`📋 Help tool called - returning hierarchical system instructions`);

    try {
      const apps = await this.namespaceManager.fetchAppsFromProxy(apiKey);
      const namespaces = apps.map(app => this.namespaceManager.normalizeNamespace(app));

      return {
        content: [
          {
            type: 'text',
            text: `# Uru Platform Hierarchical Tool System

**How to Use:**

1. **DISCOVERY**: You see namespace discovery tools like \`gmail_work_kal.list_tools\`, \`platform.list_tools\`, etc.

2. **EXPLORATION**: Call namespace discovery tools (e.g., \`gmail_work_kal.list_tools\`) to load and explore tools in that namespace.

3. **EXECUTION**: Call specific namespaced tools directly (e.g., \`gmail_work_kal.send_email\`, \`platform.manage_users\`).

**Example Workflow:**
\`\`\`
1. Call gmail_work_kal.list_tools → Loads Gmail tools and shows available options
2. Call gmail_work_kal.send_email with email parameters → Email gets sent
\`\`\`

**Available Namespaces:** ${namespaces.join(', ')}

**Why This Design:**
This hierarchical approach provides full MCP compliance while efficiently managing 400+ tools without overwhelming clients.`
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text',
            text: `# Uru Platform Hierarchical Tool System

**How to Use:**
1. Call namespace discovery tools (e.g., \`platform.list_tools\`)
2. Explore tools within namespaces
3. Execute specific namespaced tools

**Error:** Could not fetch current namespaces: ${error.message}`
          }
        ]
      };
    }
  }

  /**
   * Handle namespace discovery
   * @param {string} toolName - Name of the discovery tool
   * @param {object} args - Tool arguments
   * @param {string} apiKey - Optional API key to use for this request
   */
  async handleNamespaceDiscovery(toolName, args, apiKey = null) {
    const namespace = toolName.replace('.list_tools', '');
    const appName = this.namespaceManager.denormalizeNamespace(namespace);

    this.log(`📋 Discovering tools for namespace: ${namespace} (${appName})`);

    try {
      // Load tools for this namespace if not already loaded
      const namespacedTools = await this.toolLoader.loadNamespace(namespace, apiKey);

      // Get available tools in this namespace (excluding discovery tool)
      const availableTools = namespacedTools.filter(tool => !tool.name.endsWith('.list_tools'));

      // Apply filters if provided
      let filteredTools = availableTools;

      if (args?.filter) {
        const filter = args.filter.toLowerCase();
        filteredTools = availableTools.filter(tool =>
          tool.name.toLowerCase().includes(filter) ||
          tool.description.toLowerCase().includes(filter)
        );
      }

      if (args?.category) {
        filteredTools = filteredTools.filter(tool =>
          tool.annotations?.category === args.category
        );
      }

      return {
        content: [{
          type: 'text',
          text: this.formatToolDiscoveryResponse(appName, namespace, filteredTools, args)
        }]
      };

    } catch (error) {
      this.log(`❌ Failed to discover tools for namespace '${namespace}': ${error.message}`, 'error');
      throw this.createMcpError(-32001, `Failed to load namespace '${namespace}'`, {
        error: error.message,
        suggestion: 'Check your authentication and try again'
      });
    }
  }

  /**
   * Format tool discovery response
   */
  formatToolDiscoveryResponse(appName, namespace, tools, args) {
    const icon = this.namespaceManager.getNamespaceIcon(namespace);
    const filterInfo = args?.filter ? ` (filtered by: ${args.filter})` : '';
    const categoryInfo = args?.category ? ` (category: ${args.category})` : '';

    // Categorize tools
    const categories = this.categorizeTools(tools);

    let response = `# ${icon} ${appName} Tools Available (${tools.length} tools)${filterInfo}${categoryInfo}\n\n`;

    if (tools.length === 0) {
      response += `No tools found${args?.filter || args?.category ? ' matching your criteria' : ''}.\n\n`;
      response += `**Try:** Call \`${namespace}.list_tools\` without filters to see all available tools.`;
      return response;
    }

    // Show tools by category
    for (const [categoryName, categoryTools] of Object.entries(categories)) {
      if (categoryTools.length > 0) {
        const categoryIcon = this.getCategoryIcon(categoryName);
        response += `## ${categoryIcon} ${this.formatCategoryName(categoryName)}\n`;

        for (const tool of categoryTools) {
          const priority = tool.annotations?.priority || 'low';
          const priorityIcon = priority === 'high' ? '⭐' : priority === 'medium' ? '🔸' : '🔹';
          response += `${priorityIcon} **${tool.name}** - ${tool.description}\n`;
        }
        response += '\n';
      }
    }

    response += `**💡 Usage:** Call any tool directly: \`${tools[0]?.name}\`\n`;
    response += `**🔍 Filter:** Use \`${namespace}.list_tools\` with filter parameter for specific tools`;

    return response;
  }

  /**
   * Handle namespaced tool execution
   */
  async handleNamespacedToolExecution(toolName, args, apiKey) {
    this.log(`🔧 Executing namespaced tool: ${toolName}`);

    // Check if tool is in registry
    let tool = this.toolRegistry.getTool(toolName);

    if (!tool) {
      // Try to load the namespace for this tool
      const [namespace] = toolName.split('.');
      this.log(`🔍 Loading namespace ${namespace} for tool ${toolName}`);

      try {
        await this.toolLoader.loadNamespace(namespace);
        tool = this.toolRegistry.getTool(toolName);
      } catch (error) {
        this.log(`❌ Failed to load namespace ${namespace}: ${error.message}`, 'error');
      }
    }

    if (!tool) {
      throw this.createMcpError(-32601, `Tool '${toolName}' not found`, {
        suggestion: `Use ${toolName.split('.')[0]}.list_tools to discover available tools`
      });
    }

    // Extract original tool name and app context
    const [namespace, ...toolParts] = toolName.split('.');
    const originalToolName = tool.originalName || toolParts.join('.');
    const appName = this.namespaceManager.denormalizeNamespace(namespace);

    this.log(`🔧 Executing tool '${originalToolName}' in app '${appName}' with namespace '${namespace}'`);

    // Execute the tool via proxy with namespace for connection routing
    return await this.executeToolOnProxy(originalToolName, args, appName, apiKey, namespace);
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
            this.log(`🔧 Found legacy tool '${toolName}' in namespace '${namespace}' - executing`);
            return await this.executeToolOnProxy(tool.originalName || toolName, args, appName, apiKey, namespace);
          }

        } catch (error) {
          this.log(`⚠️ Error checking namespace '${appName}' for tool '${toolName}': ${error.message}`, 'warn');
        }
      }

      throw this.createMcpError(-32601, `Tool '${toolName}' not found in any namespace`, {
        suggestion: 'Use namespace.list_tools to discover available tools'
      });

    } catch (error) {
      if (error.code) throw error; // Re-throw MCP errors
      throw this.createMcpError(-32000, `Failed to search for tool '${toolName}': ${error.message}`);
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
  async executeToolOnProxy(toolName, parameters, appName, apiKey = null, namespace = null) {
    try {
      this.log(`🔧 Executing tool '${toolName}' in app '${appName}' (namespace: ${namespace || 'none'})`);

      // Use the tool name directly for proxy execution
      const toolSlug = toolName;

      // Get connection metadata if namespace is provided
      let connectionMetadata = null;
      if (namespace) {
        connectionMetadata = this.namespaceManager.getNamespaceMetadata(namespace);
        if (connectionMetadata) {
          this.log(`🔗 Found connection metadata for namespace '${namespace}': ${JSON.stringify(connectionMetadata)}`);
        } else {
          this.log(`⚠️ No connection metadata found for namespace '${namespace}', falling back to app context`);
        }
      }

      // Build request body with enhanced routing context
      const requestBody = {
        ...(parameters || {}),
        _app_context: appName // Legacy app context for backward compatibility
      };

      // Add connection metadata if available
      if (connectionMetadata && connectionMetadata.connected_account_id) {
        requestBody._connected_account_id = connectionMetadata.connected_account_id;
        requestBody._server_id = connectionMetadata.server_id;
        this.log(`🎯 Using connected_account_id: ${connectionMetadata.connected_account_id}`);
      }

      const headers = {
        ...this.getAuthHeaders(apiKey),
        'Content-Type': 'application/json',
        'X-App-Context': appName // Legacy header for backward compatibility
      };

      // Add connection metadata to headers if available
      if (connectionMetadata && connectionMetadata.connected_account_id) {
        headers['X-Connected-Account-Id'] = connectionMetadata.connected_account_id;
        if (connectionMetadata.server_id) {
          headers['X-Server-Id'] = connectionMetadata.server_id;
        }
      }

      const response = await axios.post(`${this.proxyUrl}/execute/${encodeURIComponent(toolSlug)}`, requestBody, {
        timeout: this.config.timeout || 60000,
        headers
      });

      this.log(`📊 Tool execution response: ${JSON.stringify(response.data, null, 2)}`);

      // Handle the response according to the architecture
      // The architecture specifies normalized responses: {data, successful, error, log_id}
      // Also handle backend responses that use 'success' instead of 'successful'
      if (response.data && typeof response.data === 'object') {
        if (response.data.successful === false || response.data.success === false) {
          // Return MCP-compliant error response instead of throwing
          return {
            content: [
              {
                type: 'text',
                text: `Tool execution failed: ${response.data.error || 'Unknown error'}`
              }
            ],
            isError: true
          };
        }

        // Return MCP-compliant response format
        return {
          content: [
            {
              type: 'text',
              text: typeof response.data.data === 'string' ? response.data.data : JSON.stringify(response.data.data, null, 2)
            }
          ]
        };
      } else {
        // Fallback for non-standard response
        return {
          content: [
            {
              type: 'text',
              text: typeof response.data === 'string' ? response.data : JSON.stringify(response.data, null, 2)
            }
          ]
        };
      }

    } catch (error) {
      // Enhanced error logging for debugging
      this.log(`❌ Tool execution failed for '${toolName}':`, 'error');
      this.log(`   App: ${appName}`, 'error');
      this.log(`   Namespace: ${namespace || 'none'}`, 'error');
      this.log(`   Connection metadata: ${connectionMetadata ? JSON.stringify(connectionMetadata) : 'none'}`, 'error');
      this.log(`   Error: ${error.message}`, 'error');

      if (error.response) {
        this.log(`   HTTP Status: ${error.response.status}`, 'error');
        this.log(`   Response data: ${JSON.stringify(error.response.data)}`, 'error');
      }

      // Provide specific error messages based on HTTP status
      if (error.response?.status === 404) {
        const suggestion = namespace ?
          `Tool '${toolName}' not found. Try calling ${namespace}.list_tools to see available tools.` :
          `Tool '${toolName}' not found on proxy. Check if the tool name is correct.`;
        throw new Error(suggestion);
      } else if (error.response?.status === 400) {
        const details = error.response.data?.message || error.response.data?.error || 'Bad request';
        throw new Error(`Invalid parameters for tool '${toolName}': ${details}`);
      } else if (error.response?.status === 401) {
        throw new Error('Authentication failed. Check your API key or token.');
      } else if (error.response?.status === 403) {
        const suggestion = connectionMetadata ?
          `Access denied for tool '${toolName}'. The connected account may not have permission or the connection may be inactive.` :
          `Access denied for tool '${toolName}'. Check your permissions.`;
        throw new Error(suggestion);
      } else if (error.response?.status === 500) {
        throw new Error(`Server error executing tool '${toolName}'. This may be a temporary issue - please try again.`);
      } else {
        throw new Error(`Proxy error executing '${toolName}': ${error.message}`);
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
      general: []
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
      general: '🔧'
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
          required: []
        };
      }

      // Add api_key to properties if not already present
      if (!enhancedTool.inputSchema.properties.api_key) {
        enhancedTool.inputSchema.properties.api_key = {
          type: 'string',
          description: this.token
            ? 'API key for authentication (optional, overrides configured token)'
            : 'API key for authentication with the Uru Platform (required)'
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
}

module.exports = UruMCPServer;

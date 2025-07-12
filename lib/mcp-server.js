/**
 * Uru MCP Server - Standalone Implementation
 *
 * Simplified MCP server that connects directly to Uru Platform backend
 * without requiring the full proxy infrastructure.
 */

const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js');
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require('@modelcontextprotocol/sdk/types.js');
const axios = require('axios');
const chalk = require('chalk');

class UruMCPServer {
  constructor(config) {
    this.config = config;
    this.proxyUrl = config.proxyUrl;
    this.token = config.token;
    this.debug = config.debug;
    this.isConnected = false; // Track connection state

    // Tool list caching to prevent repeated requests
    this.toolsCache = {
      data: null,
      lastFetch: null,
      ttl: config.cacheTimeout || 30000
    };

    // Apps list caching to prevent repeated requests
    this.appsCache = {
      data: null,
      lastFetch: null,
      ttl: config.cacheTimeout || 30000
    };

    this.log('🔗 Uru MCP Server initializing...');
    this.log(`📡 Proxy URL: ${this.proxyUrl}`);
    this.log(`🔑 Token: ${this.token ? this.token.substring(0, 20) + '...' : 'none'}`);

    // Create MCP server instance with comprehensive information
    this.server = new Server(
      {
        name: 'uru-mcp',
        version: '2.2.0',
        title: 'Uru Platform MCP Server',
        description: 'Model Context Protocol server providing access to Uru Platform AI tools and capabilities via a two-tier discovery system',
        instructions: `This server connects Claude Desktop to the Uru Platform using a two-tier tool discovery system to manage 400+ available tools efficiently.

HOW TO USE:

1. DISCOVERY PHASE: Call tools/list to see available service connections (e.g., "Gmail (Work - Kal)", "COMPANY", "PLATFORM")

2. EXPLORATION PHASE: Call a service connection tool (e.g., call "Gmail (Work - Kal)") to see what specific tools are available for that service. This returns a text description of available tools.

3. EXECUTION PHASE: Call specific tools directly by name (e.g., call "GMAIL_SEND_EMAIL" with appropriate parameters). The system will automatically find and execute the tool.

EXAMPLE WORKFLOW:
- Call tools/list → See ["Gmail (Work - Kal)", "COMPANY", ...]
- Call "Gmail (Work - Kal)" → See list of Gmail tools like GMAIL_SEND_EMAIL, GMAIL_FETCH_EMAILS, etc.
- Call "GMAIL_SEND_EMAIL" with parameters → Email gets sent

This approach prevents tool overload while providing access to all Uru Platform capabilities.`,
      },
      {
        capabilities: {
          tools: {
            listChanged: true,
          },
          logging: {
            level: 'info',
          },
        },
      }
    );

    this.setupHandlers();
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
      // Test connection to proxy
      await this.testProxyConnection();

      this.log('✅ Proxy connection successful');
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
   * Setup MCP request handlers
   */
  setupHandlers() {
    // Handle tool listing with caching
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        this.log('📋 Claude Desktop requesting tool list...');

        // Use cached tool list if available and fresh
        const cachedTools = this.getCachedTools();
        if (cachedTools) {
          this.log(`✅ Returning ${cachedTools.length} cached tools`);
          return { tools: cachedTools };
        }

        // Fetch tools from proxy (using configured token if available)
        const tools = await this.fetchToolsFromProxy();

        // Add api_key parameter to all tool schemas if no token is configured
        const enhancedTools = this.enhanceToolsWithApiKeyParam(tools);

        // Cache the results
        this.toolsCache.data = enhancedTools;
        this.toolsCache.lastFetch = Date.now();

        this.log(`✅ Returning ${enhancedTools.length} tools to Claude Desktop`);
        return { tools: enhancedTools };

      } catch (error) {
        this.log(`⚠️ Error fetching tools: ${error.message}`, 'error');

        // Return proper MCP error for critical failures
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

        // For other errors, return empty tools list but log the issue
        this.log(`Returning empty tools list due to error: ${error.message}`, 'warning');
        return { tools: [] };
      }
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const { name, arguments: toolArgs } = request.params;

        this.log(`🔧 Claude Desktop executing tool: ${name}`);
        this.log(`📝 Arguments: ${JSON.stringify(toolArgs, null, 2)}`);

        // Check if this is the help tool
        if (name === 'uru_help') {
          this.log(`📋 Help tool called - returning workflow instructions`);
          return {
            content: [
              {
                type: 'text',
                text: `# Uru Platform Two-Tier Tool System

**How to Use:**

1. **DISCOVERY**: You're seeing connection tools like "Gmail (Work - Kal)", "COMPANY", etc. These represent different service integrations.

2. **EXPLORATION**: Call any connection tool (e.g., call "Gmail (Work - Kal)") to see what specific tools are available for that service.

3. **EXECUTION**: Call specific tools directly by name (e.g., "GMAIL_SEND_EMAIL") with appropriate parameters.

**Example Workflow:**
\`\`\`
1. Call "Gmail (Work - Kal)" → See list of Gmail tools
2. Call "GMAIL_SEND_EMAIL" with email parameters → Email gets sent
\`\`\`

**Why This Design:**
This prevents overwhelming you with 400+ tools at once while still providing access to all Uru Platform capabilities.

**Available Services:** ${(await this.fetchAppsFromProxy()).join(', ')}`
              }
            ]
          };
        }

        // Extract API key from tool arguments if provided
        let apiKey = null;
        let cleanedArgs = toolArgs;

        if (toolArgs && typeof toolArgs === 'object' && toolArgs.api_key) {
          apiKey = toolArgs.api_key;
          // Create a copy of arguments without the api_key
          cleanedArgs = { ...toolArgs };
          delete cleanedArgs.api_key;
          this.log(`🔑 Using API key from tool arguments`);
        } else if (this.token) {
          // Fall back to configured token (from env var or config file)
          this.log(`🔑 Using configured token as fallback`);
        } else {
          // No API key provided and no configured token
          throw this.createMcpError(-32001, 'Authentication required', {
            suggestion: 'Provide an api_key parameter in your tool arguments, or configure URU_API_KEY environment variable'
          });
        }

        // Check if this is a connection tool (Stage 2 of two-tier system)
        const apps = await this.fetchAppsFromProxy();
        if (apps.includes(name)) {
          this.log(`📋 Connection tool called: ${name} - returning available tools`);

          // Fetch tools for this specific app
          const appTools = await this.fetchToolsForApp(name);

          // Return tool descriptions as text (don't permanently register them)
          return {
            content: [
              {
                type: 'text',
                text: `✅ **${name} Tools Available** (${appTools.length} tools)\n\n${appTools.map(tool =>
                  `• **${tool.name}**: ${tool.description}`
                ).join('\n')}\n\n**Next Step:** Call any of these tools directly by name with appropriate parameters. For example:\n- Call "${appTools[0]?.name}" to use the first tool\n- The system will automatically execute the tool via ${name}`
              }
            ]
          };
        }

        // Check if this is a direct tool call (Stage 3 of two-tier system)
        // Try to find which app this tool belongs to and execute it
        this.log(`🔍 Searching for tool '${name}' across ${apps.length} apps: ${apps.join(', ')}`);

        let searchErrors = [];

        for (const appName of apps) {
          try {
            this.log(`🔍 Checking app '${appName}' for tool '${name}'`);
            const appTools = await this.fetchToolsForApp(appName);
            this.log(`📊 App '${appName}' has ${appTools.length} tools: ${appTools.map(t => t.name).join(', ')}`);

            const matchingTool = appTools.find(tool => tool.name === name);

            if (matchingTool) {
              this.log(`🔧 Found tool '${name}' in app '${appName}' - executing directly`);

              // Execute the tool via proxy using the app context
              const result = await this.executeToolOnProxy(name, cleanedArgs, appName, apiKey);

              this.log(`✅ Tool execution completed: ${name}`);
              return result;
            } else {
              this.log(`❌ Tool '${name}' not found in app '${appName}'`);
            }
          } catch (error) {
            // Continue searching in other apps if this app fails
            const errorMsg = `Could not check app '${appName}' for tool '${name}': ${error.message}`;
            this.log(`⚠️ ${errorMsg}`, 'warn');
            searchErrors.push(`${appName}: ${error.message}`);
          }
        }

        this.log(`❌ Tool '${name}' not found in any of the ${apps.length} apps`);
        if (searchErrors.length > 0) {
          this.log(`⚠️ Search errors encountered: ${searchErrors.join('; ')}`, 'warn');
        }

        throw this.createMcpError(-32601, `Tool '${name}' not found`, {
          searchedApps: apps,
          searchErrors: searchErrors,
          suggestion: 'Use connection tools to explore available tools for each app'
        });



      } catch (error) {
        this.log(`❌ Tool execution failed: ${error.message}`, 'error');

        // Return proper MCP errors for different failure types
        if (error.response?.status === 404) {
          throw this.createMcpError(-32601, `Tool '${request.params.name}' not found`, {
            availableTools: 'Use tools/list to see available tools'
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
   * Get cached tools if available and fresh
   */
  getCachedTools() {
    if (!this.toolsCache.data || !this.toolsCache.lastFetch) {
      return null;
    }

    const age = Date.now() - this.toolsCache.lastFetch;
    if (age > this.toolsCache.ttl) {
      return null;
    }

    return this.toolsCache.data;
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
   * Fetch available apps from proxy (for two-tier system) with caching
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
        headers: this.getAuthHeaders(apiKey)
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
   * Create connection tools for two-tier system
   * Stage 1: Always return only connection tools (never permanently load app tools)
   */
  async fetchToolsFromProxy() {
    try {
      // Get available apps
      const apps = await this.fetchAppsFromProxy();

      // Always return only connection tools - never permanently load app tools
      const connectionTools = apps.map(appName => ({
        name: appName,
        description: `Explore ${appName} tools. Call this to see what specific tools are available for ${appName}, then call those tools directly by name.`,
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        },
        _isConnectionTool: true,
        _appName: appName
      }));

      this.log(`📊 Returning ${connectionTools.length} connection tools: ${apps.join(', ')}`);
      return connectionTools;

    } catch (error) {
      this.log(`❌ Error creating connection tools: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Fetch tools for a specific app (Stage 2 of two-tier system)
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

      // Add app context to each tool for execution routing and validate
      const validTools = toolsResponse.data
        .map((tool, index) => {
          // Handle different tool formats
          const originalName = tool.name || tool.function?.name || tool.id || `tool_${index}`;

          // Namespace the tool name to avoid conflicts between apps
          // This ensures tools from different apps (like gmail_work vs gmail_work_kal) are unique
          const namespacedName = `${appName}_${originalName}`;

          const cleanTool = {
            name: namespacedName,
            description: `[${appName}] ${tool.description || tool.function?.description || 'No description available'}`,
            inputSchema: tool.inputSchema || tool.function?.parameters || tool.parameters || {
              type: 'object',
              properties: {},
              required: []
            },
            _appName: appName, // Internal field for routing execution
            _originalName: originalName // Keep original name for proxy execution
          };

          // Validate required fields
          if (!cleanTool.name || typeof cleanTool.name !== 'string') {
            this.log(`⚠️ Skipping tool at index ${index}: missing or invalid name`, 'warn');
            return null;
          }

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
        .filter(tool => tool !== null); // Remove invalid tools

      this.log(`✅ Processed ${validTools.length} valid tools for app '${appName}'`);
      return validTools;
    } catch (error) {
      this.log(`❌ Error fetching tools for app '${appName}': ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Execute tool on proxy using new REST API endpoint
   * @param {string} toolName - Name of the tool to execute
   * @param {object} parameters - Tool parameters
   * @param {string} appName - Optional app name for context
   * @param {string} apiKey - Optional API key to use for this request
   */
  async executeToolOnProxy(toolName, parameters, appName = null, apiKey = null) {
    try {
      let tool = null;
      let toolSlug = null;

      if (appName) {
        // Dynamic execution: fetch tool info from specific app
        this.log(`🔍 Dynamically fetching tool '${toolName}' from app '${appName}'`);
        const appTools = await this.fetchToolsForApp(appName);
        tool = appTools.find(t => t.name === toolName);

        if (!tool) {
          throw new Error(`Tool '${toolName}' not found in app '${appName}'`);
        }
      } else {
        // Legacy execution: find tool in cached tools
        const cachedTools = this.getCachedTools();
        tool = cachedTools?.find(t => t.name === toolName);

        if (!tool) {
          throw new Error(`Tool '${toolName}' not found in cache. Try refreshing tools.`);
        }
      }

      // Use the original tool name for proxy execution (strip namespace)
      // For namespaced tools like "gmail_work_GMAIL_FETCH_EMAILS", use the original name
      const originalToolName = tool._originalName || tool.name;
      toolSlug = tool.slug || originalToolName;

      this.log(`🔧 Executing tool '${toolName}' with slug '${toolSlug}' (original: ${tool._originalName || 'N/A'})`);

      // Include app context in the request to help proxy determine which account to use
      const requestBody = {
        ...(parameters || {}),
        _app_context: appName // Add app context to help proxy route to correct account
      };

      const response = await axios.post(`${this.proxyUrl}/execute/${encodeURIComponent(toolSlug)}`, requestBody, {
        timeout: this.config.timeout || 60000,
        headers: {
          ...this.getAuthHeaders(apiKey),
          'Content-Type': 'application/json',
          'X-App-Context': appName // Also pass in header as backup
        }
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
      if (error.response?.status === 404) {
        throw new Error(`Tool '${toolName}' not found on proxy`);
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid parameters for tool '${toolName}': ${error.response.data?.message || 'Bad request'}`);
      } else if (error.response?.status === 401) {
        throw new Error('Authentication failed. Check your token.');
      } else if (error.response?.status === 403) {
        throw new Error(`Access denied for tool '${toolName}'`);
      } else {
        throw new Error(`Proxy error: ${error.message}`);
      }
    }
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

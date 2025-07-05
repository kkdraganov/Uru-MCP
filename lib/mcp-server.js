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
  LoggingLevel,
  McpError,
  ErrorCode,
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

    this.log('🔗 Uru MCP Server initializing...');
    this.log(`📡 Proxy URL: ${this.proxyUrl}`);
    this.log(`🔑 Token: ${this.token ? this.token.substring(0, 20) + '...' : 'none'}`);

    // Create MCP server instance with comprehensive information
    this.server = new Server(
      {
        name: 'uru-mcp',
        version: '1.1.1',
        title: 'Uru Platform MCP Server',
        description: 'Model Context Protocol server providing access to Uru Platform AI tools and capabilities',
        instructions: 'This server connects Claude Desktop to the Uru Platform, enabling seamless access to AI tools. Use the available tools to interact with Uru services.',
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
   */
  getAuthHeaders() {
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'Uru-MCP-Proxy/1.0.0'
    };
    
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
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

        // Fetch tools from proxy
        const tools = await this.fetchToolsFromProxy();

        // Cache the results
        this.toolsCache.data = tools;
        this.toolsCache.lastFetch = Date.now();

        this.log(`✅ Returning ${tools.length} tools to Claude Desktop`);
        return { tools };

      } catch (error) {
        this.log(`⚠️ Error fetching tools: ${error.message}`, 'error');

        // Return proper MCP error for critical failures
        if (error.response?.status === 401) {
          throw this.createMcpError(-32001, 'Authentication failed', {
            suggestion: 'Check your URU_TOKEN environment variable'
          });
        } else if (error.response?.status === 403) {
          throw this.createMcpError(-32002, 'Access forbidden', {
            suggestion: 'Your token may not have the required permissions'
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

        // Execute tool via proxy
        const result = await this.executeToolOnProxy(name, toolArgs);

        this.log(`✅ Tool execution completed: ${name}`);
        return result;

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
            suggestion: 'Check your URU_TOKEN environment variable'
          });
        } else if (error.response?.status === 403) {
          throw this.createMcpError(-32002, `Access denied for tool '${request.params.name}'`, {
            suggestion: 'Your token may not have permission to use this tool'
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
   * Fetch available tools from proxy
   */
  async fetchToolsFromProxy() {
    try {
      // Use MCP protocol format for tool listing
      const mcpRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      };

      const response = await axios.post(`${this.proxyUrl}/mcp/tools/list`, mcpRequest, {
        timeout: this.config.timeout || 30000,
        headers: this.getAuthHeaders()
      });

      this.log(`📊 Raw proxy response: ${JSON.stringify(response.data, null, 2)}`);

      let rawTools = [];

      // Handle MCP response format
      if (response.data && response.data.result && Array.isArray(response.data.result.tools)) {
        rawTools = response.data.result.tools;
      } else if (response.data && Array.isArray(response.data.tools)) {
        rawTools = response.data.tools;
      } else {
        throw new Error('Invalid tools response from proxy');
      }

      // Validate and clean up tool data
      const validTools = rawTools
        .map((tool, index) => {
          // Handle different tool formats
          const cleanTool = {
            name: tool.name || tool.function?.name || tool.id || `tool_${index}`,
            description: tool.description || tool.function?.description || 'No description available',
            inputSchema: tool.inputSchema || tool.function?.parameters || tool.parameters || {
              type: 'object',
              properties: {},
              required: []
            }
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

      this.log(`✅ Processed ${validTools.length} valid tools out of ${rawTools.length} total`);
      return validTools;

    } catch (error) {
      if (error.response?.status === 404) {
        this.log('⚠️ Proxy does not support MCP tools endpoint');
        return [];
      }
      throw error;
    }
  }

  /**
   * Execute tool on proxy
   */
  async executeToolOnProxy(toolName, parameters) {
    try {
      // Use MCP protocol format
      const mcpRequest = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/execute',
        params: {
          name: toolName,
          arguments: parameters || {}
        }
      };

      const response = await axios.post(`${this.proxyUrl}/mcp/tools/execute`, mcpRequest, {
        timeout: this.config.timeout || 60000,
        headers: this.getAuthHeaders()
      });

      // Handle MCP response format
      if (response.data && response.data.result) {
        return response.data.result;
      } else {
        // Fallback for non-MCP response
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
}

module.exports = UruMCPServer;

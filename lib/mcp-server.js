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
    
    // Tool list caching to prevent repeated requests
    this.toolsCache = {
      data: null,
      lastFetch: null,
      ttl: config.cacheTimeout || 30000
    };

    this.log('🔗 Uru MCP Server initializing...');
    this.log(`📡 Proxy URL: ${this.proxyUrl}`);
    this.log(`🔑 Token: ${this.token ? this.token.substring(0, 20) + '...' : 'none'}`);

    // Create MCP server instance
    this.server = new Server(
      {
        name: 'uru',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupHandlers();
  }

  /**
   * Log messages with debug mode support
   */
  log(message) {
    if (this.debug) {
      console.error(chalk.gray(`[Uru MCP] ${message}`));
    }
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
    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
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
        this.log(`⚠️ Error fetching tools: ${error.message}`);
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
        this.log(`❌ Tool execution failed: ${error.message}`);
        return {
          content: [
            {
              type: 'text',
              text: `Error executing tool: ${error.message}`
            }
          ],
          isError: true
        };
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

      // Handle MCP response format
      if (response.data && response.data.result && Array.isArray(response.data.result.tools)) {
        return response.data.result.tools;
      } else if (response.data && Array.isArray(response.data.tools)) {
        // Fallback for non-MCP response format
        return response.data.tools.map(tool => ({
          name: tool.name || tool.function?.name,
          description: tool.description || tool.function?.description,
          inputSchema: tool.inputSchema || tool.function?.parameters || {}
        }));
      } else {
        throw new Error('Invalid tools response from proxy');
      }

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

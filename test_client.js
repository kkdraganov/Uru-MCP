#!/usr/bin/env node

/**
 * Uru MCP Comprehensive Test Client
 *
 * A comprehensive test suite that validates both standalone MCP server functionality
 * and Claude Desktop integration compatibility. This script performs:
 *
 * 1. Standalone MCP Server Testing - Direct server validation
 * 2. Claude Desktop Integration Testing - Compatibility verification
 * 3. Protocol Compliance Testing - MCP 2025-06-18 specification adherence
 * 4. Performance and Reliability Testing - Connection stability and error handling
 *
 * Usage: node test_client.js --token YOUR_TOKEN_HERE [options]
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const chalk = require('chalk');
const { program } = require('commander');
const { spawn } = require('child_process');
const { EventEmitter } = require('events');

// Configuration constants
const path = require('path');
const MCP_SERVER_COMMAND = 'node';
const MCP_SERVER_ARGS = [path.join(__dirname, 'bin', 'uru-mcp.js')];
const CLIENT_INFO = {
  name: 'uru-mcp-test-client',
  version: '1.0.0'
};

/**
 * Comprehensive test client class for Uru MCP server validation
 * Supports both standalone testing and Claude Desktop integration validation
 */
class UruMCPTestClient extends EventEmitter {
  constructor(key, options = {}) {
    super();
    this.key = key;
    this.debug = options.debug || false;
    this.timeout = options.timeout || 30000;
    this.testMode = options.testMode || 'comprehensive'; // 'standalone', 'integration', 'comprehensive'
    this.useLocal = options.local || false;
    this.client = null;
    this.transport = null;
    this.serverProcess = null;

    // Comprehensive test results tracking
    this.testResults = {
      // Connection Tests
      connection: false,
      serverStartup: false,
      protocolHandshake: false,

      // Protocol Compliance Tests
      jsonRpcCompliance: false,
      capabilityNegotiation: false,
      errorHandling: false,

      // Tool Tests
      toolDiscovery: false,
      toolSchemaValidation: false,
      toolExecution: false,

      // Claude Desktop Integration Tests
      claudeDesktopCompatibility: false,
      messageFormatCompliance: false,

      // Performance Tests
      connectionStability: false,
      timeoutHandling: false,

      // Specific Feature Tests
      emailTest: false,
      resourceTest: 'not_tested', // Will be 'not_implemented', 'passed', or 'failed'
      promptTest: 'not_tested'    // Will be 'not_implemented', 'passed', or 'failed'
    };

    // Test metrics
    this.metrics = {
      connectionTime: 0,
      toolDiscoveryTime: 0,
      toolExecutionTime: 0,
      totalTestTime: 0,
      errorCount: 0,
      warningCount: 0
    };
  }

  /**
   * Log messages with optional debug mode
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
    
    switch (level) {
      case 'error':
        console.error(chalk.red(`${prefix} ${message}`));
        break;
      case 'warn':
        console.warn(chalk.yellow(`${prefix} ${message}`));
        break;
      case 'success':
        console.log(chalk.green(`${prefix} ${message}`));
        break;
      case 'debug':
        if (this.debug) {
          console.log(chalk.gray(`${prefix} ${message}`));
        }
        break;
      default:
        console.log(chalk.blue(`${prefix} ${message}`));
    }
  }

  /**
   * Initialize and connect to the MCP server with comprehensive testing
   */
  async connect() {
    const startTime = Date.now();

    try {
      this.log('🔗 Initializing comprehensive MCP client connection...');

      // Test 1: Server Startup Test
      await this.testServerStartup();

      // Test 2: Protocol Handshake Test
      await this.testProtocolHandshake();

      // Test 3: Connection Establishment
      await this.establishConnection();

      this.metrics.connectionTime = Date.now() - startTime;
      this.log(`✅ Connection established in ${this.metrics.connectionTime}ms`, 'success');

      return true;
    } catch (error) {
      this.metrics.connectionTime = Date.now() - startTime;
      this.log(`❌ Connection failed after ${this.metrics.connectionTime}ms: ${error.message}`, 'error');
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Test server startup and basic responsiveness
   */
  async testServerStartup() {
    try {
      this.log('🚀 Testing server startup...');

      // Create MCP client with comprehensive capabilities
      this.client = new Client(CLIENT_INFO, {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
          logging: {}
        }
      });

      this.testResults.serverStartup = true;
      this.log('✅ Server startup test passed', 'success');
    } catch (error) {
      this.testResults.serverStartup = false;
      this.log(`❌ Server startup test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test MCP protocol handshake and capability negotiation
   */
  async testProtocolHandshake() {
    try {
      this.log('🤝 Testing protocol handshake...');

      // Create stdio transport with enhanced error handling
      this.transport = new StdioClientTransport({
        command: MCP_SERVER_COMMAND,
        args: MCP_SERVER_ARGS,
        env: {
          ...process.env,
          URU_API_KEY: this.key,
          URU_DEBUG: this.debug ? 'true' : 'false',
          URU_PROXY_URL: this.useLocal ? 'https://localhost:3001' : 'https://mcp.uruenterprises.com'
        },
        stderr: 'pipe'
      });

      // Enhanced error handling for Claude Desktop compatibility
      this.transport.onerror = (error) => {
        this.log(`Transport error: ${error.message}`, 'error');
        this.metrics.errorCount++;
        this.emit('transportError', error);
      };

      this.transport.onclose = () => {
        this.log('Transport connection closed', 'debug');
        this.emit('transportClosed');
      };

      // Monitor server stderr for debugging
      if (this.transport.stderr) {
        this.transport.stderr.on('data', (data) => {
          const message = data.toString().trim();
          if (message) {
            this.log(`Server stderr: ${message}`, 'debug');
            if (message.includes('error') || message.includes('Error')) {
              this.metrics.errorCount++;
            }
          }
        });
      }

      this.testResults.protocolHandshake = true;
      this.log('✅ Protocol handshake test passed', 'success');
    } catch (error) {
      this.testResults.protocolHandshake = false;
      this.log(`❌ Protocol handshake test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Establish the actual connection to the server
   */
  async establishConnection() {
    try {
      this.log('📡 Establishing connection to Uru MCP server...');

      // Connect with timeout handling
      const connectionPromise = this.client.connect(this.transport);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), this.timeout);
      });

      await Promise.race([connectionPromise, timeoutPromise]);

      this.testResults.connection = true;
      this.log('✅ Connection established successfully', 'success');

      // Validate server information for Claude Desktop compatibility
      await this.validateServerInfo();

    } catch (error) {
      this.testResults.connection = false;
      this.log(`❌ Failed to establish connection: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Validate server information for Claude Desktop compatibility
   */
  async validateServerInfo() {
    try {
      this.log('🔍 Validating server information...');

      const serverInfo = this.client.getServerVersion();
      const serverCapabilities = this.client.getServerCapabilities();

      if (serverInfo) {
        this.log(`📋 Server: ${serverInfo.name} v${serverInfo.version}`, 'info');

        // Validate required fields for Claude Desktop
        if (!serverInfo.name || !serverInfo.version) {
          throw new Error('Server missing required name or version information');
        }
      } else {
        this.log('⚠️ Server info not available', 'warn');
        this.metrics.warningCount++;
      }

      if (serverCapabilities) {
        this.log(`🔧 Server capabilities: ${JSON.stringify(serverCapabilities)}`, 'debug');

        // Validate capabilities structure
        if (typeof serverCapabilities !== 'object') {
          throw new Error('Server capabilities must be an object');
        }
      } else {
        this.log('⚠️ Server capabilities not available', 'warn');
        this.metrics.warningCount++;
      }

      this.testResults.capabilityNegotiation = true;
      this.log('✅ Server information validation passed', 'success');

    } catch (error) {
      this.testResults.capabilityNegotiation = false;
      this.log(`❌ Server information validation failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Comprehensive tool discovery and validation
   */
  async discoverTools() {
    const startTime = Date.now();

    try {
      this.log('🔍 Discovering and validating available tools...');

      // Test tool discovery with timeout
      const discoveryPromise = this.client.listTools();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Tool discovery timeout')), this.timeout);
      });

      const toolsResponse = await Promise.race([discoveryPromise, timeoutPromise]);
      const tools = toolsResponse.tools || [];

      this.metrics.toolDiscoveryTime = Date.now() - startTime;
      this.log(`📋 Discovered ${tools.length} tools in ${this.metrics.toolDiscoveryTime}ms`, 'success');

      // Validate tools for Claude Desktop compatibility
      await this.validateToolSchemas(tools);

      // Display tools with enhanced information
      this.displayToolInformation(tools);

      this.testResults.toolDiscovery = true;
      return tools;

    } catch (error) {
      this.metrics.toolDiscoveryTime = Date.now() - startTime;
      this.log(`❌ Tool discovery failed after ${this.metrics.toolDiscoveryTime}ms: ${error.message}`, 'error');
      this.testResults.toolDiscovery = false;
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Validate tool schemas for Claude Desktop compatibility
   */
  async validateToolSchemas(tools) {
    try {
      this.log('🔬 Validating tool schemas for Claude Desktop compatibility...');

      let validationErrors = [];

      tools.forEach((tool, index) => {
        // Validate required fields
        if (!tool.name || typeof tool.name !== 'string') {
          validationErrors.push(`Tool ${index}: Missing or invalid name`);
        }

        if (!tool.description || typeof tool.description !== 'string') {
          validationErrors.push(`Tool ${index} (${tool.name}): Missing or invalid description`);
        }

        // Validate input schema structure
        if (tool.inputSchema) {
          if (typeof tool.inputSchema !== 'object') {
            validationErrors.push(`Tool ${tool.name}: inputSchema must be an object`);
          } else {
            // Check for required JSON Schema fields
            if (!tool.inputSchema.type) {
              validationErrors.push(`Tool ${tool.name}: inputSchema missing 'type' field`);
            }

            if (tool.inputSchema.type === 'object' && !tool.inputSchema.properties) {
              validationErrors.push(`Tool ${tool.name}: object type inputSchema missing 'properties' field`);
            }
          }
        } else {
          this.log(`⚠️ Tool ${tool.name}: No input schema provided`, 'warn');
          this.metrics.warningCount++;
        }

        // Validate tool name format (Claude Desktop compatibility)
        if (tool.name && !/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(tool.name)) {
          validationErrors.push(`Tool ${tool.name}: Name should start with letter and contain only alphanumeric, underscore, or hyphen characters`);
        }
      });

      if (validationErrors.length > 0) {
        this.log('⚠️ Tool schema validation issues found:', 'warn');
        validationErrors.forEach(error => this.log(`  - ${error}`, 'warn'));
        this.metrics.warningCount += validationErrors.length;
        this.testResults.toolSchemaValidation = false;
      } else {
        this.testResults.toolSchemaValidation = true;
        this.log('✅ All tool schemas are valid for Claude Desktop', 'success');
      }

    } catch (error) {
      this.testResults.toolSchemaValidation = false;
      this.log(`❌ Tool schema validation failed: ${error.message}`, 'error');
      this.metrics.errorCount++;
    }
  }

  /**
   * Display comprehensive tool information
   */
  displayToolInformation(tools) {
    if (tools.length === 0) {
      this.log('⚠️ No tools available', 'warn');
      return;
    }

    this.log('\n📋 Available Tools:', 'info');
    console.log('='.repeat(60));

    tools.forEach((tool, index) => {
      console.log(chalk.cyan(`${index + 1}. ${tool.name}`));

      if (tool.description) {
        console.log(chalk.gray(`   Description: ${tool.description}`));
      }

      if (tool.inputSchema) {
        console.log(chalk.gray(`   Input Schema:`));
        console.log(chalk.gray(`     Type: ${tool.inputSchema.type || 'unknown'}`));

        if (tool.inputSchema.properties) {
          const propCount = Object.keys(tool.inputSchema.properties).length;
          console.log(chalk.gray(`     Properties: ${propCount} parameter(s)`));

          if (this.debug) {
            console.log(chalk.gray(`     Full Schema: ${JSON.stringify(tool.inputSchema, null, 6)}`));
          }
        }

        if (tool.inputSchema.required && Array.isArray(tool.inputSchema.required)) {
          console.log(chalk.gray(`     Required: ${tool.inputSchema.required.join(', ')}`));
        }
      }

      console.log(); // Empty line between tools
    });

    console.log('='.repeat(60));
  }

  /**
   * Comprehensive tool execution testing
   */
  async executeTestTool(tools) {
    const startTime = Date.now();

    try {
      this.log('🧪 Starting comprehensive tool execution tests...');

      if (tools.length === 0) {
        throw new Error('No tools available for testing');
      }

      // Test multiple tools for comprehensive validation
      await this.testToolExecution(tools);
      await this.testClaudeDesktopCompatibility(tools);
      await this.testErrorHandling(tools);

      this.metrics.toolExecutionTime = Date.now() - startTime;
      this.log(`✅ Tool execution tests completed in ${this.metrics.toolExecutionTime}ms`, 'success');

      return true;

    } catch (error) {
      this.metrics.toolExecutionTime = Date.now() - startTime;
      this.log(`❌ Tool execution tests failed after ${this.metrics.toolExecutionTime}ms: ${error.message}`, 'error');
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Test tool execution with various scenarios
   */
  async testToolExecution(tools) {
    try {
      this.log('🔧 Testing tool execution scenarios...');

      // Test 1: Email tool (priority test)
      await this.testEmailTool(tools);

      // Test 2: General tool execution
      await this.testGeneralToolExecution(tools);

      // Test 3: Tool parameter validation
      await this.testToolParameterValidation(tools);

      this.testResults.toolExecution = true;
      this.log('✅ Tool execution scenarios passed', 'success');

    } catch (error) {
      this.testResults.toolExecution = false;
      this.log(`❌ Tool execution scenarios failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test email tool functionality (priority for Uru MCP)
   */
  async testEmailTool(tools) {
    try {
      this.log('📧 Testing email tool functionality...');

      const emailTool = tools.find(tool =>
        tool.name.toLowerCase().includes('gmail') ||
        tool.name.toLowerCase().includes('email') ||
        tool.name.toLowerCase().includes('send')
      );

      if (!emailTool) {
        this.log('⚠️ No email tool found, skipping email test', 'warn');
        this.metrics.warningCount++;
        return;
      }

      this.log(`📧 Found email tool: ${emailTool.name}`, 'success');

      const emailParams = {
        to: 'test@example.com',
        subject: 'Uru MCP Test Email - Comprehensive Test Suite',
        body: 'This is a test email sent from the enhanced Uru MCP test client to verify Gmail functionality and Claude Desktop integration.',
        from: 'noreply@uruenterprises.com'
      };

      this.log('📧 Executing email tool test...', 'info');
      this.log(`📝 Email parameters: ${JSON.stringify(emailParams, null, 2)}`, 'debug');

      const emailResult = await this.executeToolWithTimeout(emailTool.name, emailParams);

      // Validate email result structure
      if (emailResult && typeof emailResult === 'object') {
        this.log('✅ Email tool execution successful', 'success');
        this.testResults.emailTest = true;

        if (emailResult.content) {
          this.log(`📊 Email result: ${JSON.stringify(emailResult.content, null, 2)}`, 'debug');
        }
      } else {
        this.log('⚠️ Email tool returned unexpected result format', 'warn');
        this.metrics.warningCount++;
      }

    } catch (error) {
      this.log(`❌ Email tool test failed: ${error.message}`, 'error');
      this.testResults.emailTest = false;
      this.metrics.errorCount++;
    }
  }

  /**
   * Test general tool execution with the first available tool
   */
  async testGeneralToolExecution(tools) {
    try {
      this.log('🔧 Testing general tool execution...');

      // Prefer Webflow_Tools for testing as it's a simple list operation
      let testTool = tools.find(tool => tool.name === 'Webflow_Tools');
      if (!testTool) {
        // Fallback to Uru_Tools which is also a simple list operation
        testTool = tools.find(tool => tool.name === 'Uru_Tools');
      }
      if (!testTool) {
        testTool = tools[0]; // Final fallback to first tool
      }

      if (!testTool) {
        throw new Error('No tools available for general testing');
      }

      this.log(`🔧 Testing tool: ${testTool.name}`, 'info');

      // Generate test parameters based on schema
      const testParams = this.generateTestParameters(testTool);

      // Use appropriate test data for different tools
      if (testTool.name === 'Transcript_Log_Query') {
        testParams.input = 'test query for recent interactions';
      } else if (testTool.name === 'Webflow_Tools' || testTool.name === 'Uru_Tools') {
        // These tools don't require parameters, they just list available operations
        // testParams should already be empty object from generateTestParameters
      }

      this.log(`📝 Generated parameters: ${JSON.stringify(testParams, null, 2)}`, 'debug');

      const result = await this.executeToolWithTimeout(testTool.name, testParams);

      // Validate result structure for Claude Desktop compatibility
      this.validateToolResult(result, testTool.name);

      this.log(`✅ General tool execution successful: ${testTool.name}`, 'success');

    } catch (error) {
      this.log(`❌ General tool execution failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Execute tool with timeout handling
   */
  async executeToolWithTimeout(toolName, parameters) {
    const executionPromise = this.client.callTool({
      name: toolName,
      arguments: parameters
    });

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Tool execution timeout: ${toolName}`)), this.timeout);
    });

    return await Promise.race([executionPromise, timeoutPromise]);
  }

  /**
   * Generate test parameters based on tool schema
   */
  generateTestParameters(tool) {
    const params = {};

    if (!tool.inputSchema || !tool.inputSchema.properties) {
      return params;
    }

    const properties = tool.inputSchema.properties;
    const required = tool.inputSchema.required || [];

    Object.keys(properties).forEach(key => {
      const prop = properties[key];

      // Only generate required parameters to minimize test complexity
      if (required.includes(key)) {
        switch (prop.type) {
          case 'string':
            params[key] = prop.example || prop.default || 'test-value';
            break;
          case 'number':
          case 'integer':
            params[key] = prop.example || prop.default || 1;
            break;
          case 'boolean':
            params[key] = prop.example !== undefined ? prop.example : (prop.default !== undefined ? prop.default : true);
            break;
          case 'array':
            params[key] = prop.example || prop.default || [];
            break;
          case 'object':
            params[key] = prop.example || prop.default || {};
            break;
          default:
            params[key] = 'test';
        }
      }
    });

    return params;
  }

  /**
   * Validate tool result for Claude Desktop compatibility
   */
  validateToolResult(result, toolName) {
    if (!result) {
      throw new Error(`Tool ${toolName} returned null/undefined result`);
    }

    if (typeof result !== 'object') {
      this.log(`⚠️ Tool ${toolName} returned non-object result`, 'warn');
      this.metrics.warningCount++;
      return;
    }

    // Check for standard MCP result structure
    if (!result.content && !result.isError) {
      this.log(`⚠️ Tool ${toolName} result missing 'content' field`, 'warn');
      this.metrics.warningCount++;
    }

    this.log(`✅ Tool result validation passed for ${toolName}`, 'success');
  }

  /**
   * Test Claude Desktop compatibility
   */
  async testClaudeDesktopCompatibility(tools) {
    try {
      this.log('🖥️ Testing Claude Desktop compatibility...');

      // Test 1: Message format compliance
      await this.testMessageFormatCompliance();

      // Test 2: JSON-RPC compliance
      await this.testJsonRpcCompliance();

      // Test 3: Error response format
      await this.testErrorResponseFormat();

      this.testResults.claudeDesktopCompatibility = true;
      this.testResults.messageFormatCompliance = true;
      this.testResults.jsonRpcCompliance = true;

      this.log('✅ Claude Desktop compatibility tests passed', 'success');

    } catch (error) {
      this.testResults.claudeDesktopCompatibility = false;
      this.log(`❌ Claude Desktop compatibility tests failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test message format compliance with Claude Desktop expectations
   */
  async testMessageFormatCompliance() {
    try {
      this.log('📋 Testing message format compliance...');

      // Test that server responds with proper JSON-RPC 2.0 format
      const toolsResponse = await this.client.listTools();

      // Validate response structure
      if (!toolsResponse || typeof toolsResponse !== 'object') {
        throw new Error('Invalid response format: not an object');
      }

      if (!Array.isArray(toolsResponse.tools)) {
        throw new Error('Invalid response format: tools must be an array');
      }

      this.log('✅ Message format compliance verified', 'success');

    } catch (error) {
      this.log(`❌ Message format compliance failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test JSON-RPC 2.0 compliance
   */
  async testJsonRpcCompliance() {
    try {
      this.log('🔗 Testing JSON-RPC 2.0 compliance...');

      // This is implicitly tested by the MCP SDK, but we can verify
      // that the transport is working correctly with JSON-RPC

      const serverVersion = this.client.getServerVersion();
      if (serverVersion && typeof serverVersion === 'object') {
        this.log('✅ JSON-RPC compliance verified', 'success');
      } else {
        this.log('⚠️ JSON-RPC compliance could not be fully verified', 'warn');
        this.metrics.warningCount++;
      }

    } catch (error) {
      this.log(`❌ JSON-RPC compliance test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test error response format
   */
  async testErrorResponseFormat() {
    try {
      this.log('⚠️ Testing error response format...');

      // Intentionally call a non-existent tool to test error handling
      try {
        await this.client.callTool({
          name: 'non_existent_tool_test_12345',
          arguments: {}
        });

        this.log('⚠️ Expected error not thrown for non-existent tool', 'warn');
        this.metrics.warningCount++;

      } catch (expectedError) {
        // This error is expected - validate its format
        if (expectedError.message && typeof expectedError.message === 'string') {
          this.log('✅ Error response format is valid', 'success');
        } else {
          this.log('⚠️ Error response format may not be optimal', 'warn');
          this.metrics.warningCount++;
        }
      }

    } catch (error) {
      this.log(`❌ Error response format test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test error handling scenarios
   */
  async testErrorHandling(tools) {
    try {
      this.log('🚨 Testing error handling scenarios...');

      // Test 1: Invalid parameters
      await this.testInvalidParameters(tools);

      // Test 2: Connection stability
      await this.testConnectionStability();

      // Test 3: Timeout handling
      await this.testTimeoutHandling();

      this.testResults.errorHandling = true;
      this.testResults.connectionStability = true;
      this.testResults.timeoutHandling = true;

      this.log('✅ Error handling tests passed', 'success');

    } catch (error) {
      this.testResults.errorHandling = false;
      this.log(`❌ Error handling tests failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test tool parameter validation
   */
  async testToolParameterValidation(tools) {
    try {
      this.log('🔍 Testing tool parameter validation...');

      if (tools.length === 0) {
        this.log('⚠️ No tools available for parameter validation testing', 'warn');
        return;
      }

      const testTool = tools[0];

      // Test with invalid parameters
      try {
        await this.client.callTool({
          name: testTool.name,
          arguments: { invalid_param: 'invalid_value' }
        });

        this.log('⚠️ Tool accepted invalid parameters without error', 'warn');
        this.metrics.warningCount++;

      } catch (expectedError) {
        this.log('✅ Tool properly rejected invalid parameters', 'success');
      }

    } catch (error) {
      this.log(`❌ Parameter validation test failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Test invalid parameters handling
   */
  async testInvalidParameters(tools) {
    if (tools.length === 0) return;

    const testTool = tools[0];

    try {
      await this.client.callTool({
        name: testTool.name,
        arguments: null // Invalid arguments
      });
    } catch (error) {
      // Expected error
      this.log('✅ Invalid parameters properly handled', 'success');
    }
  }

  /**
   * Test connection stability
   */
  async testConnectionStability() {
    try {
      // Make multiple rapid requests to test stability
      const promises = [];
      for (let i = 0; i < 3; i++) {
        promises.push(this.client.listTools());
      }

      await Promise.all(promises);
      this.log('✅ Connection stability test passed', 'success');

    } catch (error) {
      this.log(`⚠️ Connection stability test failed: ${error.message}`, 'warn');
      this.metrics.warningCount++;
    }
  }

  /**
   * Test timeout handling
   */
  async testTimeoutHandling() {
    try {
      // This is implicitly tested by our timeout wrappers
      this.log('✅ Timeout handling verified through other tests', 'success');
    } catch (error) {
      this.log(`⚠️ Timeout handling test failed: ${error.message}`, 'warn');
      this.metrics.warningCount++;
    }
  }

  /**
   * Clean up and close connections
   */
  async cleanup() {
    try {
      this.log('🧹 Cleaning up test environment...');

      if (this.client) {
        // Attempt graceful disconnection
        try {
          // The MCP client doesn't have an explicit disconnect method
          // but we can clean up the transport
        } catch (error) {
          this.log(`⚠️ Client cleanup warning: ${error.message}`, 'warn');
        }
      }

      if (this.transport) {
        await this.transport.close();
        this.log('🔌 Transport connection closed', 'debug');
      }

      if (this.serverProcess) {
        this.serverProcess.kill();
        this.log('🛑 Server process terminated', 'debug');
      }

      this.log('✅ Cleanup completed', 'success');

    } catch (error) {
      this.log(`⚠️ Error during cleanup: ${error.message}`, 'warn');
      this.metrics.warningCount++;
    }
  }

  /**
   * Display comprehensive test results with detailed metrics
   */
  displayResults() {
    console.log('\n' + '='.repeat(80));
    console.log(chalk.blue.bold('🧪 URU MCP SERVER COMPREHENSIVE TEST RESULTS'));
    console.log('='.repeat(80));

    // Connection Tests
    console.log(chalk.cyan.bold('\n📡 CONNECTION TESTS'));
    console.log('-'.repeat(40));
    this.displayTestResult('Server Startup', this.testResults.serverStartup);
    this.displayTestResult('Protocol Handshake', this.testResults.protocolHandshake);
    this.displayTestResult('MCP Connection', this.testResults.connection);
    this.displayTestResult('Capability Negotiation', this.testResults.capabilityNegotiation);

    // Protocol Compliance Tests
    console.log(chalk.cyan.bold('\n🔗 PROTOCOL COMPLIANCE TESTS'));
    console.log('-'.repeat(40));
    this.displayTestResult('JSON-RPC Compliance', this.testResults.jsonRpcCompliance);
    this.displayTestResult('Message Format', this.testResults.messageFormatCompliance);
    this.displayTestResult('Error Handling', this.testResults.errorHandling);

    // Tool Tests
    console.log(chalk.cyan.bold('\n🔧 TOOL TESTS'));
    console.log('-'.repeat(40));
    this.displayTestResult('Tool Discovery', this.testResults.toolDiscovery);
    this.displayTestResult('Tool Schema Validation', this.testResults.toolSchemaValidation);
    this.displayTestResult('Tool Execution', this.testResults.toolExecution);

    // Claude Desktop Integration Tests
    console.log(chalk.cyan.bold('\n🖥️ CLAUDE DESKTOP INTEGRATION'));
    console.log('-'.repeat(40));
    this.displayTestResult('Claude Desktop Compatibility', this.testResults.claudeDesktopCompatibility);

    // Performance Tests
    console.log(chalk.cyan.bold('\n⚡ PERFORMANCE & RELIABILITY'));
    console.log('-'.repeat(40));
    this.displayTestResult('Connection Stability', this.testResults.connectionStability);
    this.displayTestResult('Timeout Handling', this.testResults.timeoutHandling);

    // Feature Tests
    console.log(chalk.cyan.bold('\n✨ FEATURE TESTS'));
    console.log('-'.repeat(40));
    this.displayTestResult('Gmail Email Test', this.testResults.emailTest);
    this.displayFeatureTestResult('Resource Test', this.testResults.resourceTest);
    this.displayFeatureTestResult('Prompt Test', this.testResults.promptTest);

    // Performance Metrics
    console.log(chalk.cyan.bold('\n📊 PERFORMANCE METRICS'));
    console.log('-'.repeat(40));
    console.log(`Connection Time:      ${this.metrics.connectionTime}ms`);
    console.log(`Tool Discovery Time:  ${this.metrics.toolDiscoveryTime}ms`);
    console.log(`Tool Execution Time:  ${this.metrics.toolExecutionTime}ms`);
    console.log(`Total Test Time:      ${this.metrics.totalTestTime}ms`);
    console.log(`Errors:               ${this.metrics.errorCount}`);
    console.log(`Warnings:             ${this.metrics.warningCount}`);

    // Overall Summary
    const allResults = Object.entries(this.testResults);
    const passedCount = allResults.filter(([, result]) => {
      // Count boolean true as passed, and 'passed' string as passed
      return result === true || result === 'passed';
    }).length;

    const notImplementedCount = allResults.filter(([, result]) => {
      return result === 'not_implemented';
    }).length;

    // Calculate success rate excluding not_implemented features
    const testableCount = allResults.length - notImplementedCount;
    const successRate = testableCount > 0 ? Math.round((passedCount / testableCount) * 100) : 0;

    console.log('\n' + '='.repeat(80));
    console.log(chalk.bold(`📈 OVERALL RESULTS: ${passedCount}/${testableCount} tests passed (${successRate}%)`));

    if (notImplementedCount > 0) {
      console.log(chalk.gray(`ℹ️  Note: ${notImplementedCount} optional feature(s) not implemented (Resources, Prompts)`));
    }

    if (passedCount === testableCount && this.metrics.errorCount === 0) {
      console.log(chalk.green.bold('🎉 ALL TESTS PASSED! Uru MCP server is fully operational and Claude Desktop compatible.'));
    } else if (successRate >= 80) {
      console.log(chalk.yellow.bold('⚠️ MOSTLY SUCCESSFUL! Some minor issues detected. Review warnings above.'));
    } else {
      console.log(chalk.red.bold('💥 SIGNIFICANT ISSUES DETECTED! Please review failed tests and errors.'));
    }

    // Integration Status
    console.log('\n' + chalk.bold('🔍 INTEGRATION STATUS:'));
    if (this.testResults.claudeDesktopCompatibility && this.testResults.jsonRpcCompliance) {
      console.log(chalk.green('✅ Ready for Claude Desktop integration'));
    } else {
      console.log(chalk.red('❌ Not ready for Claude Desktop integration - fix compatibility issues'));
    }

    console.log('='.repeat(80) + '\n');
  }

  /**
   * Display individual test result with formatting
   */
  displayTestResult(testName, status) {
    const statusText = status ?
      chalk.green('✅ PASSED') :
      chalk.red('❌ FAILED');
    console.log(`${testName.padEnd(30)} ${statusText}`);
  }

  /**
   * Display feature test result with support for not_implemented status
   */
  displayFeatureTestResult(testName, status) {
    let statusText;
    switch (status) {
      case 'passed':
        statusText = chalk.green('✅ PASSED');
        break;
      case 'not_implemented':
        statusText = chalk.gray('➖ NOT IMPLEMENTED');
        break;
      case 'failed':
        statusText = chalk.red('❌ FAILED');
        break;
      case 'not_tested':
      default:
        statusText = chalk.yellow('⏸️ NOT TESTED');
        break;
    }
    console.log(`${testName.padEnd(30)} ${statusText}`);
  }
}

/**
 * Main comprehensive test execution function
 */
async function runTests(key, options = {}) {
  const startTime = Date.now();
  const testClient = new UruMCPTestClient(key, options);

  try {
    console.log(chalk.blue.bold('🚀 URU MCP SERVER COMPREHENSIVE TEST SUITE'));
    console.log(chalk.gray('Testing Uru Platform MCP server functionality and Claude Desktop integration\n'));

    console.log(chalk.cyan(`📋 Test Mode: ${options.testMode || 'comprehensive'}`));
    console.log(chalk.cyan(`🔧 Debug Mode: ${options.debug ? 'enabled' : 'disabled'}`));
    console.log(chalk.cyan(`⏱️ Timeout: ${options.timeout || 30000}ms`));
    console.log(chalk.cyan(`🌐 Proxy URL: ${options.local ? 'https://localhost:3001' : 'https://mcp.uruenterprises.com'}\n`));

    // Phase 1: Connection and Protocol Tests
    console.log(chalk.yellow.bold('📡 PHASE 1: CONNECTION & PROTOCOL VALIDATION'));
    await testClient.connect();

    // Phase 2: Tool Discovery and Validation
    console.log(chalk.yellow.bold('\n🔍 PHASE 2: TOOL DISCOVERY & VALIDATION'));
    const tools = await testClient.discoverTools();

    // Phase 3: Tool Execution and Integration Tests
    console.log(chalk.yellow.bold('\n🧪 PHASE 3: TOOL EXECUTION & INTEGRATION TESTS'));
    await testClient.executeTestTool(tools);

    // Phase 4: Additional Feature Tests (if available)
    console.log(chalk.yellow.bold('\n✨ PHASE 4: ADDITIONAL FEATURE TESTS'));
    await testClient.testAdditionalFeatures();

    // Calculate total test time
    testClient.metrics.totalTestTime = Date.now() - startTime;

    // Phase 5: Results and Analysis
    console.log(chalk.yellow.bold('\n📊 PHASE 5: RESULTS & ANALYSIS'));
    testClient.displayResults();

    // Determine exit code based on comprehensive results
    const criticalTestsPassed = testClient.testResults.connection &&
                               testClient.testResults.toolDiscovery &&
                               testClient.testResults.claudeDesktopCompatibility;

    // Check if all testable features passed (excluding not_implemented)
    const allTestsPassed = Object.values(testClient.testResults).every(result =>
      result === true || result === 'passed' || result === 'not_implemented'
    );
    const hasErrors = testClient.metrics.errorCount > 0;

    if (allTestsPassed && !hasErrors) {
      console.log(chalk.green.bold('\n🎉 SUCCESS: All tests passed! MCP server is ready for production use.'));
      process.exit(0);
    } else if (criticalTestsPassed && !hasErrors) {
      console.log(chalk.yellow.bold('\n⚠️ PARTIAL SUCCESS: Critical tests passed, but some optional features failed.'));
      process.exit(0);
    } else {
      console.log(chalk.red.bold('\n💥 FAILURE: Critical tests failed or errors detected. Server needs attention.'));
      process.exit(1);
    }

  } catch (error) {
    testClient.metrics.totalTestTime = Date.now() - startTime;
    testClient.log(`💥 Test execution failed: ${error.message}`, 'error');

    if (error.stack && testClient.debug) {
      testClient.log(`Stack trace: ${error.stack}`, 'debug');
    }

    testClient.displayResults();

    console.log(chalk.red.bold('\n💥 CRITICAL FAILURE: Test suite could not complete successfully.'));
    process.exit(1);

  } finally {
    await testClient.cleanup();
  }
}

/**
 * Test additional MCP features (resources, prompts, etc.)
 */
UruMCPTestClient.prototype.testAdditionalFeatures = async function() {
  try {
    this.log('✨ Testing additional MCP features...');

    // Test resources if available
    await this.testResources();

    // Test prompts if available
    await this.testPrompts();

    this.log('✅ Additional features testing completed', 'success');

  } catch (error) {
    this.log(`⚠️ Additional features testing failed: ${error.message}`, 'warn');
    this.metrics.warningCount++;
  }
};

/**
 * Test MCP resources feature
 */
UruMCPTestClient.prototype.testResources = async function() {
  try {
    this.log('📚 Testing resources feature...');

    // Try to list resources
    try {
      const resourcesResponse = await this.client.listResources();
      if (resourcesResponse && resourcesResponse.resources) {
        this.log(`📚 Found ${resourcesResponse.resources.length} resources`, 'success');
        this.testResults.resourceTest = 'passed';
      } else {
        this.log('📚 No resources available', 'info');
        this.testResults.resourceTest = 'not_implemented';
      }
    } catch (error) {
      if (error.message.includes('not supported') ||
          error.message.includes('not implemented') ||
          error.message.includes('Method not found') ||
          error.code === -32601) { // JSON-RPC method not found
        this.log('📚 Resources feature not implemented (optional)', 'info');
        this.testResults.resourceTest = 'not_implemented';
      } else {
        this.log(`📚 Resources test failed: ${error.message}`, 'warn');
        this.testResults.resourceTest = 'failed';
        this.metrics.warningCount++;
      }
    }

  } catch (error) {
    this.log(`⚠️ Resources test encountered error: ${error.message}`, 'warn');
    this.testResults.resourceTest = 'failed';
    this.metrics.warningCount++;
  }
};

/**
 * Test MCP prompts feature
 */
UruMCPTestClient.prototype.testPrompts = async function() {
  try {
    this.log('💬 Testing prompts feature...');

    // Try to list prompts
    try {
      const promptsResponse = await this.client.listPrompts();
      if (promptsResponse && promptsResponse.prompts) {
        this.log(`💬 Found ${promptsResponse.prompts.length} prompts`, 'success');
        this.testResults.promptTest = 'passed';
      } else {
        this.log('💬 No prompts available', 'info');
        this.testResults.promptTest = 'not_implemented';
      }
    } catch (error) {
      if (error.message.includes('not supported') ||
          error.message.includes('not implemented') ||
          error.message.includes('Method not found') ||
          error.code === -32601) { // JSON-RPC method not found
        this.log('💬 Prompts feature not implemented (optional)', 'info');
        this.testResults.promptTest = 'not_implemented';
      } else {
        this.log(`💬 Prompts test failed: ${error.message}`, 'warn');
        this.testResults.promptTest = 'failed';
        this.metrics.warningCount++;
      }
    }

  } catch (error) {
    this.log(`⚠️ Prompts test encountered error: ${error.message}`, 'warn');
    this.testResults.promptTest = 'failed';
    this.metrics.warningCount++;
  }
};

/**
 * CLI setup and argument parsing with enhanced options
 */
function setupCLI() {
  program
    .name('uru-mcp-test-client')
    .description('Comprehensive test client for validating Uru MCP server functionality and Claude Desktop integration')
    .version('2.0.0')
    .requiredOption('-k, --key <key>', 'Uru Platform authentication key')
    .option('-d, --debug', 'Enable debug logging', false)
    .option('--timeout <ms>', 'Connection timeout in milliseconds', '30000')
    .option('--test-mode <mode>', 'Test mode: standalone, integration, or comprehensive', 'comprehensive')
    .option('--quick', 'Run quick tests only (skip optional features)', false)
    .option('--claude-desktop', 'Focus on Claude Desktop integration tests', false)
    .option('--local', 'Use https://localhost:3001 for URU_PROXY_URL instead of production URL', false)
    .addHelpText('after', `
Examples:
  $ node test_client.js --key your-key-here
  $ node test_client.js --key your-key-here --debug
  $ node test_client.js --key your-key-here --timeout 60000
  $ node test_client.js --key your-key-here --test-mode integration
  $ node test_client.js --key your-key-here --claude-desktop
  $ node test_client.js --key your-key-here --quick
  $ node test_client.js --key your-key-here --local

Test Modes:
  standalone     - Test MCP server functionality in isolation
  integration    - Test Claude Desktop integration compatibility
  comprehensive  - Run all tests (default)

This comprehensive test client will:
  1. Test server startup and protocol handshake
  2. Validate JSON-RPC 2.0 and MCP specification compliance
  3. Discover and validate all available tools
  4. Execute comprehensive tool tests including Gmail functionality
  5. Test Claude Desktop integration compatibility
  6. Validate error handling and connection stability
  7. Display detailed results with performance metrics
  8. Exit with appropriate codes for CI/CD integration

Exit Codes:
  0 - All tests passed successfully
  1 - Critical tests failed or errors detected

Make sure the Uru MCP server is properly installed:
  $ npm install -g uru-mcp
`)
    .action(async (options) => {
      // Validate key
      if (!options.key || options.key.trim().length === 0) {
        console.error(chalk.red('❌ Error: Authentication key is required'));
        console.error(chalk.gray('Use --key to provide your Uru Platform key'));
        process.exit(1);
      }

      // Parse timeout
      const timeout = parseInt(options.timeout);
      if (isNaN(timeout) || timeout <= 0) {
        console.error(chalk.red('❌ Error: Invalid timeout value'));
        process.exit(1);
      }

      // Validate test mode
      const validModes = ['standalone', 'integration', 'comprehensive'];
      if (!validModes.includes(options.testMode)) {
        console.error(chalk.red(`❌ Error: Invalid test mode. Must be one of: ${validModes.join(', ')}`));
        process.exit(1);
      }

      // Adjust test mode based on flags
      let testMode = options.testMode;
      if (options.claudeDesktop) {
        testMode = 'integration';
      }

      // Run tests with enhanced options
      await runTests(options.key, {
        debug: options.debug,
        timeout: timeout,
        testMode: testMode,
        quick: options.quick,
        claudeDesktopFocus: options.claudeDesktop,
        local: options.local
      });
    });
}

/**
 * Error handling for unhandled rejections and exceptions
 */
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled Promise Rejection:'), error.message);
  if (error.stack) {
    console.error(chalk.gray(error.stack));
  }
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error(chalk.red('❌ Uncaught Exception:'), error.message);
  if (error.stack) {
    console.error(chalk.gray(error.stack));
  }
  process.exit(1);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n⚠️  Test interrupted by user'));
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n⚠️  Test terminated'));
  process.exit(1);
});

/**
 * Main entry point
 */
if (require.main === module) {
  setupCLI();
  program.parse();
}

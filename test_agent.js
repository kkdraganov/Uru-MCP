/**
 * Agent Simulation Test - Claude Desktop Interaction Patterns
 * 
 * Simulates how Claude Desktop or Cursor would interact with the hierarchical
 * tool namespace system, testing the complete discovery and execution workflow.
 */

const axios = require('axios');
const chalk = require('chalk');

class AgentSimulator {
  constructor(config) {
    this.config = config;
    this.serverUrl = config.serverUrl || 'http://localhost:3001';
    this.apiKey = config.apiKey;
    this.debug = config.debug || false;
    
    // Simulation state
    this.discoveredNamespaces = new Set();
    this.loadedTools = new Map();
    this.executionHistory = [];
  }

  /**
   * Log messages with color coding
   */
  log(message, level = 'info') {
    const timestamp = new Date().toISOString();
    let coloredMessage;
    
    switch (level) {
      case 'success':
        coloredMessage = chalk.green(`✅ ${message}`);
        break;
      case 'error':
        coloredMessage = chalk.red(`❌ ${message}`);
        break;
      case 'warn':
        coloredMessage = chalk.yellow(`⚠️ ${message}`);
        break;
      case 'info':
        coloredMessage = chalk.blue(`ℹ️ ${message}`);
        break;
      case 'debug':
        coloredMessage = chalk.gray(`🔍 ${message}`);
        break;
      default:
        coloredMessage = message;
    }
    
    console.log(`[${timestamp}] [AgentSim] ${coloredMessage}`);
  }

  /**
   * Make MCP JSON-RPC request
   */
  async makeRequest(method, params = {}) {
    try {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: method,
        params: params
      };

      this.log(`Making request: ${method}`, 'debug');
      if (this.debug) {
        this.log(`Request params: ${JSON.stringify(params, null, 2)}`, 'debug');
      }

      const response = await axios.post(this.serverUrl, request, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      if (response.data.error) {
        throw new Error(`MCP Error: ${response.data.error.message}`);
      }

      return response.data.result;

    } catch (error) {
      this.log(`Request failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Simulate initial tool discovery
   */
  async simulateInitialDiscovery() {
    this.log('🚀 Starting agent simulation - Initial Discovery Phase', 'info');
    
    try {
      // Step 1: Get initial tool list
      this.log('Step 1: Requesting initial tool list...', 'info');
      const toolsResult = await this.makeRequest('tools/list');
      
      this.log(`Discovered ${toolsResult.tools.length} tools`, 'success');
      
      // Analyze discovered tools
      const namespaceTools = toolsResult.tools.filter(tool => tool.name.endsWith('.list_tools'));
      const regularTools = toolsResult.tools.filter(tool => !tool.name.endsWith('.list_tools') && tool.name !== 'uru_help');
      
      this.log(`Found ${namespaceTools.length} namespace discovery tools`, 'info');
      this.log(`Found ${regularTools.length} pre-loaded tools`, 'info');
      
      // Store discovered namespaces
      for (const tool of namespaceTools) {
        const namespace = tool.name.replace('.list_tools', '');
        this.discoveredNamespaces.add(namespace);
      }
      
      this.log(`Discovered namespaces: ${Array.from(this.discoveredNamespaces).join(', ')}`, 'success');
      
      return {
        totalTools: toolsResult.tools.length,
        namespaces: Array.from(this.discoveredNamespaces),
        preloadedTools: regularTools.length,
        nextCursor: toolsResult.nextCursor
      };
      
    } catch (error) {
      this.log(`Initial discovery failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Simulate namespace exploration
   */
  async simulateNamespaceExploration(namespace) {
    this.log(`🔍 Exploring namespace: ${namespace}`, 'info');
    
    try {
      const toolName = `${namespace}.list_tools`;
      const result = await this.makeRequest('tools/call', {
        name: toolName,
        arguments: {}
      });
      
      // Parse the response to extract available tools
      const content = result.content[0].text;
      const toolMatches = content.match(/\*\*([^*]+\.[^*]+)\*\*/g);
      
      if (toolMatches) {
        const tools = toolMatches.map(match => match.replace(/\*\*/g, ''));
        this.loadedTools.set(namespace, tools);
        
        this.log(`Loaded ${tools.length} tools for namespace ${namespace}`, 'success');
        this.log(`Tools: ${tools.slice(0, 3).join(', ')}${tools.length > 3 ? '...' : ''}`, 'info');
        
        return tools;
      } else {
        this.log(`No tools found in namespace ${namespace}`, 'warn');
        return [];
      }
      
    } catch (error) {
      this.log(`Namespace exploration failed for ${namespace}: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Simulate tool execution
   */
  async simulateToolExecution(toolName, args = {}) {
    this.log(`🔧 Executing tool: ${toolName}`, 'info');
    
    try {
      // Add API key if configured
      const toolArgs = this.apiKey ? { ...args, api_key: this.apiKey } : args;
      
      const result = await this.makeRequest('tools/call', {
        name: toolName,
        arguments: toolArgs
      });
      
      this.executionHistory.push({
        tool: toolName,
        timestamp: new Date().toISOString(),
        success: true,
        result: result
      });
      
      this.log(`Tool execution successful: ${toolName}`, 'success');
      
      // Log result summary
      if (result.content && result.content[0]) {
        const resultText = result.content[0].text;
        const summary = resultText.length > 100 ? resultText.substring(0, 100) + '...' : resultText;
        this.log(`Result: ${summary}`, 'info');
      }
      
      return result;
      
    } catch (error) {
      this.executionHistory.push({
        tool: toolName,
        timestamp: new Date().toISOString(),
        success: false,
        error: error.message
      });
      
      this.log(`Tool execution failed for ${toolName}: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Simulate multi-namespace task coordination
   */
  async simulateMultiNamespaceTask() {
    this.log('🎯 Simulating multi-namespace task coordination', 'info');
    
    try {
      // Scenario: Send an email about a platform update
      this.log('Scenario: Send email about platform update', 'info');
      
      // Step 1: Explore platform namespace for information
      if (this.discoveredNamespaces.has('platform')) {
        await this.simulateNamespaceExploration('platform');
      }
      
      // Step 2: Explore email namespace
      const emailNamespaces = Array.from(this.discoveredNamespaces).filter(ns => 
        ns.includes('gmail') || ns.includes('email') || ns.includes('mail')
      );
      
      if (emailNamespaces.length > 0) {
        await this.simulateNamespaceExploration(emailNamespaces[0]);
        
        // Step 3: Try to execute an email tool (this will likely fail without proper setup)
        const emailTools = this.loadedTools.get(emailNamespaces[0]) || [];
        const sendEmailTool = emailTools.find(tool => tool.includes('send'));
        
        if (sendEmailTool) {
          try {
            await this.simulateToolExecution(sendEmailTool, {
              to: 'test@example.com',
              subject: 'Platform Update',
              body: 'This is a test email from the agent simulation.'
            });
          } catch (error) {
            this.log('Expected failure for email tool (no real credentials)', 'warn');
          }
        }
      }
      
    } catch (error) {
      this.log(`Multi-namespace task failed: ${error.message}`, 'error');
    }
  }

  /**
   * Simulate error handling and fallback scenarios
   */
  async simulateErrorHandling() {
    this.log('🚨 Simulating error handling scenarios', 'info');
    
    // Test 1: Invalid tool name
    try {
      await this.simulateToolExecution('nonexistent.tool');
    } catch (error) {
      this.log('✅ Correctly handled invalid tool name', 'success');
    }
    
    // Test 2: Invalid namespace
    try {
      await this.simulateNamespaceExploration('nonexistent_namespace');
    } catch (error) {
      this.log('✅ Correctly handled invalid namespace', 'success');
    }
    
    // Test 3: Missing required parameters
    if (this.loadedTools.size > 0) {
      const [namespace, tools] = this.loadedTools.entries().next().value;
      if (tools.length > 0) {
        try {
          await this.simulateToolExecution(tools[0], {}); // Empty args
        } catch (error) {
          this.log('✅ Correctly handled missing parameters', 'success');
        }
      }
    }
  }

  /**
   * Generate simulation report
   */
  generateReport() {
    this.log('📊 Generating simulation report', 'info');
    
    const report = {
      summary: {
        namespacesDiscovered: this.discoveredNamespaces.size,
        namespacesExplored: this.loadedTools.size,
        toolsExecuted: this.executionHistory.length,
        successfulExecutions: this.executionHistory.filter(h => h.success).length,
        failedExecutions: this.executionHistory.filter(h => !h.success).length
      },
      namespaces: Array.from(this.discoveredNamespaces),
      loadedTools: Object.fromEntries(this.loadedTools),
      executionHistory: this.executionHistory
    };
    
    console.log('\n' + chalk.bold('🎯 AGENT SIMULATION REPORT'));
    console.log('=' * 50);
    console.log(chalk.green(`✅ Namespaces Discovered: ${report.summary.namespacesDiscovered}`));
    console.log(chalk.blue(`🔍 Namespaces Explored: ${report.summary.namespacesExplored}`));
    console.log(chalk.yellow(`🔧 Tools Executed: ${report.summary.toolsExecuted}`));
    console.log(chalk.green(`✅ Successful: ${report.summary.successfulExecutions}`));
    console.log(chalk.red(`❌ Failed: ${report.summary.failedExecutions}`));
    
    return report;
  }

  /**
   * Run complete simulation
   */
  async runSimulation() {
    this.log('🎬 Starting complete agent simulation', 'info');
    
    try {
      // Phase 1: Initial Discovery
      await this.simulateInitialDiscovery();
      
      // Phase 2: Namespace Exploration
      const namespacesToExplore = Array.from(this.discoveredNamespaces).slice(0, 3); // Limit for demo
      for (const namespace of namespacesToExplore) {
        await this.simulateNamespaceExploration(namespace);
      }
      
      // Phase 3: Multi-namespace task
      await this.simulateMultiNamespaceTask();
      
      // Phase 4: Error handling
      await this.simulateErrorHandling();
      
      // Phase 5: Generate report
      const report = this.generateReport();
      
      this.log('🎉 Agent simulation completed successfully', 'success');
      return report;
      
    } catch (error) {
      this.log(`Simulation failed: ${error.message}`, 'error');
      throw error;
    }
  }
}

// Main execution if run directly
async function main() {
  const config = {
    serverUrl: process.env.URU_PROXY_URL || 'http://localhost:3001',
    apiKey: process.env.URU_API_KEY || 'uru_14edb191569cfb3618859094b004451eedc35ff1a6ca23a576055f6ff8c55664',
    debug: process.env.URU_DEBUG === 'true'
  };

  console.log(chalk.bold.blue('🤖 Uru MCP Agent Simulation'));
  console.log(chalk.gray('Simulating Claude Desktop interaction patterns with hierarchical tool namespaces\n'));

  const simulator = new AgentSimulator(config);

  try {
    const report = await simulator.runSimulation();

    console.log('\n' + chalk.bold.green('🎉 Simulation completed successfully!'));
    console.log(chalk.gray('This demonstrates how Claude Desktop would interact with the hierarchical namespace system.'));

    // Save report to file
    const fs = require('fs');
    const reportPath = 'agent-simulation-report.json';
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(chalk.blue(`📄 Detailed report saved to: ${reportPath}`));

  } catch (error) {
    console.error(chalk.red(`❌ Simulation failed: ${error.message}`));
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red(`❌ Unexpected error: ${error.message}`));
    process.exit(1);
  });
}

module.exports = AgentSimulator;

#!/usr/bin/env node

/**
 * Simple test script for Uru MCP
 *
 * Tests basic functionality without requiring full MCP setup
 */

const UruMCPServer = require('./lib/mcp-server');
const ConfigManager = require('./lib/config-manager');
const chalk = require('chalk');

async function runTests() {
  console.log(chalk.blue.bold('🧪 Uru MCP Tests\n'));

  let passed = 0;
  let failed = 0;

  // Test 1: Configuration Manager
  try {
    console.log(chalk.yellow('Test 1: Configuration Manager'));
    const configManager = new ConfigManager();
    
    // Test default config
    const config = await configManager.loadConfig();
    
    if (config.proxyUrl === 'https://mcp.uruenterprises.com') {
      console.log(chalk.green('✅ Default proxy URL is correct'));
      passed++;
    } else {
      console.log(chalk.red('❌ Default proxy URL is incorrect'));
      failed++;
    }

    // Test config validation
    const validConfig = configManager.validateConfig({
      proxyUrl: 'https://mcp.uruenterprises.com',
      token: 'test-token',
      debug: false
    });

    if (validConfig.proxyUrl && validConfig.token) {
      console.log(chalk.green('✅ Configuration validation works'));
      passed++;
    } else {
      console.log(chalk.red('❌ Configuration validation failed'));
      failed++;
    }

  } catch (error) {
    console.log(chalk.red(`❌ Configuration Manager test failed: ${error.message}`));
    failed++;
  }

  console.log();

  // Test 2: MCP Server Creation and Compliance
  try {
    console.log(chalk.yellow('Test 2: MCP Server Creation and Compliance'));

    const testConfig = {
      proxyUrl: 'https://mcp.uruenterprises.com',
      token: 'test-token',
      debug: false,
      timeout: 5000
    };

    const server = new UruMCPServer(testConfig);

    if (server && server.config && server.config.proxyUrl === testConfig.proxyUrl) {
      console.log(chalk.green('✅ MCP Server creation works'));
      passed++;
    } else {
      console.log(chalk.red('❌ MCP Server creation failed'));
      failed++;
    }

    // Test server instance exists and has proper structure
    if (server.server && typeof server.server.setRequestHandler === 'function') {
      console.log(chalk.green('✅ Server instance properly initialized'));
      passed++;
    } else {
      console.log(chalk.red('❌ Server instance initialization failed'));
      failed++;
    }

    // Test that server has proper configuration
    if (server.config && server.config.proxyUrl && server.config.token) {
      console.log(chalk.green('✅ Server configuration compliance'));
      passed++;
    } else {
      console.log(chalk.red('❌ Server configuration incomplete'));
      failed++;
    }

    // Test error handling method
    if (typeof server.createMcpError === 'function') {
      const testError = server.createMcpError(-32000, 'Test error', { test: true });
      if (testError instanceof Error && testError.code === -32000) {
        console.log(chalk.green('✅ Error handling compliance'));
        passed++;
      } else {
        console.log(chalk.red('❌ Error handling compliance failed'));
        failed++;
      }
    } else {
      console.log(chalk.red('❌ Error handling method missing'));
      failed++;
    }

  } catch (error) {
    console.log(chalk.red(`❌ MCP Server compliance test failed: ${error.message}`));
    failed++;
  }

  console.log();

  // Test 3: Logging Capability
  try {
    console.log(chalk.yellow('Test 3: Logging Capability'));

    const testConfig = {
      proxyUrl: 'https://mcp.uruenterprises.com',
      token: 'test-token',
      debug: true,
      timeout: 5000
    };

    const server = new UruMCPServer(testConfig);

    // Test logging method with different levels
    if (typeof server.log === 'function') {
      // This should not throw an error
      server.log('Test info message', 'info');
      server.log('Test warning message', 'warning');
      server.log('Test error message', 'error');
      console.log(chalk.green('✅ Logging capability works'));
      passed++;
    } else {
      console.log(chalk.red('❌ Logging method missing'));
      failed++;
    }

  } catch (error) {
    console.log(chalk.red(`❌ Logging capability test failed: ${error.message}`));
    failed++;
  }

  console.log();

  // Test 4: Claude Desktop Config Generation
  try {
    console.log(chalk.yellow('Test 4: Claude Desktop Config Generation'));
    
    const configManager = new ConfigManager();
    const claudeConfig = configManager.getClaudeDesktopConfig();
    
    if (claudeConfig.mcpServers && 
        claudeConfig.mcpServers['uru-platform'] && 
        claudeConfig.mcpServers['uru-platform'].command === 'npx') {
      console.log(chalk.green('✅ Claude Desktop config generation works'));
      passed++;
    } else {
      console.log(chalk.red('❌ Claude Desktop config generation failed'));
      failed++;
    }

  } catch (error) {
    console.log(chalk.red(`❌ Claude Desktop config test failed: ${error.message}`));
    failed++;
  }

  console.log();

  // Test Results
  console.log(chalk.blue.bold('📊 Test Results:'));
  console.log(chalk.green(`✅ Passed: ${passed}`));
  console.log(chalk.red(`❌ Failed: ${failed}`));
  console.log(chalk.gray(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`));

  if (failed === 0) {
    console.log(chalk.green.bold('\n🎉 All tests passed! The package is ready to use.'));
    process.exit(0);
  } else {
    console.log(chalk.red.bold('\n💥 Some tests failed. Please check the implementation.'));
    process.exit(1);
  }
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled error:'), error.message);
  process.exit(1);
});

// Run tests
runTests().catch((error) => {
  console.error(chalk.red('❌ Test runner error:'), error.message);
  process.exit(1);
});

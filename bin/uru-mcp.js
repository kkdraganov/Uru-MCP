#!/usr/bin/env node

/**
 * Uru MCP - Standalone CLI Entry Point
 *
 * This is the main entry point for the npx command.
 * It handles CLI arguments, configuration, and starts the MCP server.
 */

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs-extra');
const os = require('os');

// Import our MCP server
const UruMCPServer = require('../lib/mcp-server');
const ConfigManager = require('../lib/config-manager');

const program = new Command();

program
  .name('uru-mcp')
  .description('Standalone MCP server for Uru Platform integration with Claude Desktop')
  .version('1.1.2')
  .option('-t, --token <token>', 'Authentication token')
  .option('-d, --debug', 'Enable debug mode')
  .option('--setup', 'Run interactive setup wizard')
  .option('--test', 'Test connection to backend')
  .option('--claude-config', 'Show Claude Desktop configuration example')
  .addHelpText('after', `
Examples:
  $ npx uru-mcp --setup                    # Interactive setup
  $ npx uru-mcp --test                     # Test connection
  $ npx uru-mcp --claude-config            # Show Claude config
  $ npx uru-mcp --token your-token-here    # Start with token

Environment Variables:
  URU_TOKEN          Authentication token (required)
  URU_DEBUG          Enable debug mode (true/false)

Proxy URL: https://mcp.uruenterprises.com (fixed)
For more help: https://github.com/kkdraganov/Uru-MCP`)
  .parse();

const options = program.opts();

async function main() {
  try {
    // Only show startup messages for special commands, not for normal MCP server operation
    // When running as MCP server, all output must go to stderr to avoid contaminating JSON-RPC on stdout

    // Handle special commands (these can use console.log since they don't run the MCP server)
    if (options.setup) {
      console.log(chalk.blue.bold('🚀 Uru MCP'));
      console.log(chalk.gray('Connecting Uru Platform to Claude Desktop\n'));
      await runSetupWizard();
      return;
    }

    if (options.test) {
      console.log(chalk.blue.bold('🚀 Uru MCP'));
      console.log(chalk.gray('Connecting Uru Platform to Claude Desktop\n'));
      await testConnection();
      return;
    }

    if (options.claudeConfig) {
      console.log(chalk.blue.bold('🚀 Uru MCP'));
      console.log(chalk.gray('Connecting Uru Platform to Claude Desktop\n'));
      showClaudeConfig();
      return;
    }

    // For MCP server operation, redirect all output to stderr
    // This ensures only JSON-RPC messages go to stdout
    const originalConsoleLog = console.log;
    const originalConsoleError = console.error;

    console.log = (...args) => originalConsoleError(...args);
    console.error = (...args) => originalConsoleError(...args);

    // Load configuration
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig(options);

    // Validate configuration
    if (!config.token) {
      console.error(chalk.red('❌ Authentication token is required. Use --token or run --setup'));
      process.exit(1);
    }

    // Start MCP server (all logging will go to stderr)
    if (config.debug) {
      console.error(chalk.green('✅ Starting Uru MCP Server...'));
      console.error(chalk.gray(`   Proxy: ${config.proxyUrl}`));
      console.error(chalk.gray(`   Token: ${config.token.substring(0, 20)}...`));
      console.error(chalk.gray(`   Debug: enabled`));
      console.error();
    }

    const server = new UruMCPServer(config);
    await server.start();

  } catch (error) {
    console.error(chalk.red('❌ Error:'), error.message);
    if (options.debug) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}

async function runSetupWizard() {
  const inquirer = require('inquirer');

  console.log(chalk.yellow('🔧 Uru MCP Setup Wizard\n'));
  console.log(chalk.gray('Proxy URL: https://mcp.uruenterprises.com (fixed)\n'));

  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'token',
      message: 'Enter your authentication token:',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'Authentication token is required';
        }
        return true;
      }
    },
    {
      type: 'confirm',
      name: 'debug',
      message: 'Enable debug mode?',
      default: false
    }
  ]);

  // Save configuration
  const configManager = new ConfigManager();
  await configManager.saveConfig(answers);
  
  console.log(chalk.green('\n✅ Configuration saved!'));
  console.log(chalk.yellow('\n📋 Next steps:'));
  console.log('1. Run: npx uru-mcp');
  console.log('2. Add the server to Claude Desktop (run: npx uru-mcp --claude-config)');
}

async function testConnection() {
  const spinner = ora('Testing connection to proxy...').start();

  try {
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig(options);

    if (!config.token) {
      spinner.fail('No authentication token configured. Run --setup first.');
      return;
    }

    const axios = require('axios');
    const response = await axios.get(`${config.proxyUrl}/health`, {
      timeout: 10000,
      headers: config.token ? { 'Authorization': `Bearer ${config.token}` } : {}
    });

    spinner.succeed(`Connection successful! Proxy is healthy (${response.status})`);
    console.log(chalk.gray(`Response: ${JSON.stringify(response.data, null, 2)}`));
    
  } catch (error) {
    spinner.fail(`Connection failed: ${error.message}`);
    if (options.debug) {
      console.error(chalk.gray(error.stack));
    }
  }
}

function showClaudeConfig() {
  console.log(chalk.yellow('📋 Claude Desktop Configuration\n'));
  console.log('Add this to your Claude Desktop MCP settings:\n');

  const configExample = {
    "mcpServers": {
      "uru": {
        "command": "npx",
        "args": ["uru-mcp"],
        "env": {
          "URU_TOKEN": "your-auth-token-here"
        }
      }
    }
  };

  console.log(chalk.cyan(JSON.stringify(configExample, null, 2)));
  console.log();
  console.log(chalk.gray('Configuration file location:'));
  console.log(chalk.gray('• macOS: ~/Library/Application Support/Claude/claude_desktop_config.json'));
  console.log(chalk.gray('• Windows: %APPDATA%\\Claude\\claude_desktop_config.json'));
  console.log(chalk.gray('• Linux: ~/.config/Claude/claude_desktop_config.json'));
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  console.log(chalk.yellow('\n👋 Shutting down Uru MCP...'));
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log(chalk.yellow('\n👋 Shutting down Uru MCP...'));
  process.exit(0);
});

// Run the main function
main().catch((error) => {
  console.error(chalk.red('❌ Unexpected error:'), error.message);
  process.exit(1);
});

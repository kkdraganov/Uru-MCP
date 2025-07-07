#!/usr/bin/env node

/**
 * Simple test to debug MCP server connection issues
 */

const { spawn } = require('child_process');
const chalk = require('chalk');
const { program } = require('commander');

async function testMCPServer(token, options = {}) {
  console.log(chalk.blue('🧪 Simple MCP Server Test'));
  console.log(chalk.gray('Testing basic server startup and communication\n'));

  if (options.debug) {
    console.log(chalk.gray(`Using token: ${token.substring(0, 20)}...`));
  }
  
  // Start the MCP server process
  const serverProcess = spawn('node', ['bin/uru-mcp.js'], {
    env: {
      ...process.env,
      URU_TOKEN: token,
      URU_DEBUG: options.debug ? 'true' : 'false'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  let serverOutput = '';
  let serverError = '';

  // Capture server output
  serverProcess.stdout.on('data', (data) => {
    serverOutput += data.toString();
    console.log(chalk.green('Server stdout:'), data.toString().trim());
  });

  serverProcess.stderr.on('data', (data) => {
    serverError += data.toString();
    console.log(chalk.yellow('Server stderr:'), data.toString().trim());
  });

  serverProcess.on('error', (error) => {
    console.error(chalk.red('Server process error:'), error.message);
  });

  serverProcess.on('exit', (code, signal) => {
    console.log(chalk.blue(`Server process exited with code ${code}, signal ${signal}`));
  });

  // Wait a moment for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Send a simple JSON-RPC initialize request
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: 'simple-test-client',
        version: '1.0.0'
      }
    }
  };

  console.log(chalk.blue('\n📤 Sending initialize request:'));
  console.log(JSON.stringify(initRequest, null, 2));

  try {
    serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
    
    // Wait for response
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    console.log(chalk.blue('\n📥 Server responses:'));
    console.log('stdout:', serverOutput);
    console.log('stderr:', serverError);
    
  } catch (error) {
    console.error(chalk.red('Error sending request:'), error.message);
  }

  // Clean up
  serverProcess.kill();
  
  console.log(chalk.blue('\n✅ Test completed'));
}

/**
 * CLI setup and argument parsing
 */
function setupCLI() {
  program
    .name('uru-mcp-simple-test')
    .description('Simple test for debugging MCP server connection issues')
    .version('1.0.0')
    .requiredOption('-t, --token <token>', 'Uru Platform authentication token')
    .option('-d, --debug', 'Enable debug logging', false)
    .addHelpText('after', `
Examples:
  $ node test_simple.js --token your-token-here
  $ node test_simple.js --token your-token-here --debug

This simple test will:
  1. Start the Uru MCP server with the provided token
  2. Send a basic JSON-RPC initialize request
  3. Display server output and responses
  4. Exit after a short test period

This is useful for debugging basic server startup and communication issues.
`)
    .action(async (options) => {
      try {
        // Validate token
        if (!options.token || options.token.trim().length === 0) {
          console.error(chalk.red('❌ Error: Authentication token is required'));
          console.error(chalk.gray('Use --token to provide your Uru Platform token'));
          process.exit(1);
        }

        // Run test
        await testMCPServer(options.token, {
          debug: options.debug
        });

      } catch (error) {
        console.error(chalk.red('❌ Test failed:'), error.message);
        if (options.debug) {
          console.error(chalk.gray(error.stack));
        }
        process.exit(1);
      }
    });
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error(chalk.red('❌ Unhandled error:'), error.message);
  process.exit(1);
});

// Setup CLI and run
setupCLI();
program.parse();

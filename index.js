/**
 * Uru MCP - Main Entry Point
 *
 * Model Context Protocol (MCP) server for Uru Platform integration.
 * This is the main entry point when the package is run directly
 * (not through the CLI). It starts the MCP server with default configuration.
 */

const UruMCPServer = require('./lib/mcp-server');
const ConfigManager = require('./lib/config-manager');

async function main() {
  try {
    // Ensure all console output goes to stderr to avoid contaminating JSON-RPC on stdout
    console.log = (...args) => console.error(...args);

    // Load configuration
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();

    // Validate configuration - token is now optional
    if (!config.token) {
      console.error('⚠️  No authentication token configured. API key must be provided in tool arguments.');
      console.error('   To configure a default token: Set URU_TOKEN environment variable or run: npx uru-mcp --setup');
      console.error('   For MCP client configuration examples, run: npx uru-mcp --claude-config');
    }

    // Start MCP server
    const server = new UruMCPServer(config);
    await server.start();

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Handle process signals gracefully
process.on('SIGINT', () => {
  process.exit(0);
});

process.on('SIGTERM', () => {
  process.exit(0);
});

// Start the server
main().catch((error) => {
  console.error('❌ Unexpected error:', error.message);
  process.exit(1);
});

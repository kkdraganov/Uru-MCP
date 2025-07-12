/**
 * Configuration Manager for Uru MCP
 *
 * Handles loading and saving configuration from multiple sources:
 * 1. Command line arguments (highest priority)
 * 2. Environment variables
 * 3. Configuration file
 * 4. Default values (lowest priority)
 */

const fs = require('fs-extra');
const path = require('path');
const os = require('os');
require('dotenv').config();

class ConfigManager {
  constructor(configPath = null) {
    this.configPath = configPath || this.getDefaultConfigPath();
  }

  /**
   * Get the default configuration file path
   */
  getDefaultConfigPath() {
    const homeDir = os.homedir();
    return path.join(homeDir, '.uru-mcp.json');
  }

  /**
   * Load configuration from all sources with proper precedence
   */
  async loadConfig(cliOptions = {}) {
    // Start with defaults - proxy URL can now be configured
    const config = {
      proxyUrl: 'https://mcp.uruenterprises.com',
      token: null,
      debug: false,
      timeout: 30000,
      retries: 3,
      cacheTimeout: 30000,
      // Hierarchical tool namespace configuration
      maxToolsPerPage: 50,
      maxNamespaces: 20,
      preloadNamespaces: ['platform', 'company'],
      enableParallelLoading: true,
      enablePredictiveLoading: false
    };

    // Load from config file (if exists)
    try {
      if (await fs.pathExists(this.configPath)) {
        const fileConfig = await fs.readJson(this.configPath);
        // Allow token, debug, and proxyUrl settings from config file
        if (fileConfig.token) config.token = fileConfig.token;
        if (fileConfig.debug !== undefined) config.debug = fileConfig.debug;
        if (fileConfig.proxyUrl) config.proxyUrl = fileConfig.proxyUrl;
      }
    } catch (error) {
      // Config file errors are non-fatal, just warn
      if (cliOptions.debug) {
        console.warn(`Warning: Could not load config file: ${error.message}`);
      }
    }

    // Load from environment variables
    if (process.env.URU_API_KEY) {
      config.token = process.env.URU_API_KEY;
    }
    if (process.env.URU_DEBUG === 'true') {
      config.debug = true;
    }
    if (process.env.URU_PROXY_URL) {
      config.proxyUrl = process.env.URU_PROXY_URL;
    }

    // Hierarchical tool configuration from environment
    if (process.env.URU_MAX_TOOLS_PER_PAGE) {
      config.maxToolsPerPage = parseInt(process.env.URU_MAX_TOOLS_PER_PAGE);
    }
    if (process.env.URU_MAX_NAMESPACES) {
      config.maxNamespaces = parseInt(process.env.URU_MAX_NAMESPACES);
    }
    if (process.env.URU_PRELOAD_NAMESPACES) {
      config.preloadNamespaces = process.env.URU_PRELOAD_NAMESPACES.split(',').map(ns => ns.trim());
    }
    if (process.env.URU_ENABLE_PARALLEL_LOADING === 'false') {
      config.enableParallelLoading = false;
    }
    if (process.env.URU_ENABLE_PREDICTIVE_LOADING === 'true') {
      config.enablePredictiveLoading = true;
    }

    // Override with CLI options (highest priority)
    if (cliOptions.token) {
      config.token = cliOptions.token;
    }
    if (cliOptions.debug) {
      config.debug = true;
    }
    if (cliOptions.proxyUrl) {
      config.proxyUrl = cliOptions.proxyUrl;
    }

    // Validate and normalize configuration
    return this.validateConfig(config);
  }

  /**
   * Save configuration to file
   */
  async saveConfig(config) {
    try {
      // Ensure directory exists
      await fs.ensureDir(path.dirname(this.configPath));
      
      // Save configuration
      await fs.writeJson(this.configPath, config, { spaces: 2 });
      
      return true;
    } catch (error) {
      throw new Error(`Failed to save configuration: ${error.message}`);
    }
  }

  /**
   * Validate and normalize configuration
   */
  validateConfig(config) {
    const validated = { ...config };

    // Validate proxy URL
    if (validated.proxyUrl) {
      try {
        const url = new URL(validated.proxyUrl);
        // Ensure no trailing slash
        validated.proxyUrl = url.toString().replace(/\/$/, '');
      } catch (error) {
        throw new Error(`Invalid proxy URL: ${validated.proxyUrl}`);
      }
    }

    // Validate timeout
    if (validated.timeout && (validated.timeout < 1000 || validated.timeout > 300000)) {
      throw new Error('Timeout must be between 1000ms and 300000ms');
    }

    // Validate retries
    if (validated.retries && (validated.retries < 0 || validated.retries > 10)) {
      throw new Error('Retries must be between 0 and 10');
    }

    return validated;
  }

  /**
   * Get configuration file path
   */
  getConfigPath() {
    return this.configPath;
  }

  /**
   * Check if configuration file exists
   */
  async configExists() {
    return await fs.pathExists(this.configPath);
  }

  /**
   * Delete configuration file
   */
  async deleteConfig() {
    try {
      if (await this.configExists()) {
        await fs.remove(this.configPath);
        return true;
      }
      return false;
    } catch (error) {
      throw new Error(`Failed to delete configuration: ${error.message}`);
    }
  }

  /**
   * Get example configuration for documentation
   */
  getExampleConfig() {
    return {
      proxyUrl: 'https://mcp.uruenterprises.com', // or 'http://localhost:3001' for development
      token: 'your-auth-token-here',
      debug: false,
      timeout: 30000,
      retries: 3,
      cacheTimeout: 30000
    };
  }

  /**
   * Get Claude Desktop configuration example
   */
  getClaudeDesktopConfig(config = null) {
    const exampleConfig = config || this.getExampleConfig();

    return {
      mcpServers: {
        'uru': {
          command: 'npx',
          args: ['uru-mcp'],
          env: {
            URU_API_KEY: exampleConfig.token || 'your-auth-token-here'
          }
        }
      }
    };
  }
}

module.exports = ConfigManager;

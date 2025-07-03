/**
 * Configuration Manager for Uru MCP Proxy
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
    return path.join(homeDir, '.uru-mcp-proxy.json');
  }

  /**
   * Load configuration from all sources with proper precedence
   */
  async loadConfig(cliOptions = {}) {
    // Start with defaults - proxy URL is always the same
    const config = {
      proxyUrl: 'https://mcp.uruenterprises.com',
      token: null,
      debug: false,
      timeout: 30000,
      retries: 3,
      cacheTimeout: 30000
    };

    // Load from config file (if exists)
    try {
      if (await fs.pathExists(this.configPath)) {
        const fileConfig = await fs.readJson(this.configPath);
        // Only allow token and debug settings from config file
        if (fileConfig.token) config.token = fileConfig.token;
        if (fileConfig.debug !== undefined) config.debug = fileConfig.debug;
      }
    } catch (error) {
      // Config file errors are non-fatal, just warn
      if (cliOptions.debug) {
        console.warn(`Warning: Could not load config file: ${error.message}`);
      }
    }

    // Load from environment variables
    if (process.env.URU_TOKEN) {
      config.token = process.env.URU_TOKEN;
    }
    if (process.env.URU_DEBUG === 'true') {
      config.debug = true;
    }

    // Override with CLI options (highest priority)
    if (cliOptions.token) {
      config.token = cliOptions.token;
    }
    if (cliOptions.debug) {
      config.debug = true;
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
      proxyUrl: 'https://mcp.uruenterprises.com',
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
        'uru-platform': {
          command: 'npx',
          args: ['uru-mcp-proxy'],
          env: {
            URU_TOKEN: exampleConfig.token || 'your-auth-token-here'
          }
        }
      }
    };
  }
}

module.exports = ConfigManager;

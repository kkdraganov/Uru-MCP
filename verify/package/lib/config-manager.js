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
            proxyUrl: 'https://mcp.uruintelligence.com',
            token: null,
            debug: false,
            // Standardize all MCP timeouts to 3 minutes (180000 ms)
            timeout: 180000,
            retries: 3,
            cacheTimeout: 30000,
            toolSyncPollMs: 60000,
            enableToolListChanged: true,
            // Hierarchical tool namespace configuration
            maxToolsPerPage: 200,
            maxNamespaces: 20,
            preloadNamespaces: ['platform', 'company'],
            enableParallelLoading: true,
            enablePredictiveLoading: false,
        };

        // Load from config file (if exists)
        try {
            if (await fs.pathExists(this.configPath)) {
                const fileConfig = await fs.readJson(this.configPath);
                // Allow token, debug, and proxyUrl settings from config file
                if (fileConfig.token) config.token = fileConfig.token;
                if (fileConfig.debug !== undefined) config.debug = fileConfig.debug;
                if (fileConfig.proxyUrl) config.proxyUrl = fileConfig.proxyUrl;
                if (fileConfig.timeout !== undefined) {
                    config.timeout = Number(fileConfig.timeout);
                }
                if (fileConfig.retries !== undefined) {
                    config.retries = Number(fileConfig.retries);
                }
                if (fileConfig.cacheTimeout !== undefined) {
                    config.cacheTimeout = Number(fileConfig.cacheTimeout);
                }
                if (fileConfig.toolSyncPollMs !== undefined) {
                    config.toolSyncPollMs = Number(fileConfig.toolSyncPollMs);
                }
                if (fileConfig.enableToolListChanged !== undefined) {
                    config.enableToolListChanged =
                        fileConfig.enableToolListChanged === true ||
                        fileConfig.enableToolListChanged === 'true';
                }
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
        if (process.env.URU_TOOL_SYNC_POLL_MS) {
            config.toolSyncPollMs = parseInt(process.env.URU_TOOL_SYNC_POLL_MS, 10);
        }
        if (process.env.URU_ENABLE_TOOL_LIST_CHANGED) {
            config.enableToolListChanged =
                process.env.URU_ENABLE_TOOL_LIST_CHANGED === 'true';
        }

        // Hierarchical tool configuration from environment
        if (process.env.URU_MAX_TOOLS_PER_PAGE) {
            config.maxToolsPerPage = parseInt(process.env.URU_MAX_TOOLS_PER_PAGE);
        }
        if (process.env.URU_MAX_NAMESPACES) {
            config.maxNamespaces = parseInt(process.env.URU_MAX_NAMESPACES);
        }
        if (process.env.URU_PRELOAD_NAMESPACES) {
            config.preloadNamespaces = process.env.URU_PRELOAD_NAMESPACES.split(
                ','
            ).map(ns => ns.trim());
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
        if (
            validated.timeout &&
            (validated.timeout < 1000 || validated.timeout > 300000)
        ) {
            throw new Error('Timeout must be between 1000ms and 300000ms');
        }

        // Validate retries
        if (validated.retries && (validated.retries < 0 || validated.retries > 10)) {
            throw new Error('Retries must be between 0 and 10');
        }

        if (
            validated.toolSyncPollMs &&
            (validated.toolSyncPollMs < 1000 || validated.toolSyncPollMs > 3600000)
        ) {
            throw new Error(
                'Tool sync poll interval must be between 1000ms and 3600000ms'
            );
        }

        if (
            validated.enableToolListChanged !== undefined &&
            typeof validated.enableToolListChanged !== 'boolean'
        ) {
            throw new Error('enableToolListChanged must be a boolean');
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
            proxyUrl: 'https://mcp.uruintelligence.com', // or 'http://localhost:3001' for development
            token: 'your-auth-token-here',
            debug: false,
            timeout: 30000,
            retries: 3,
            cacheTimeout: 30000,
            toolSyncPollMs: 60000,
            enableToolListChanged: true,
        };
    }

    /**
     * Get Claude Desktop configuration example
     */
    getClaudeDesktopConfig(config = null) {
        const exampleConfig = config || this.getExampleConfig();

        return {
            mcpServers: {
                uru: {
                    command: 'npx',
                    args: ['-y', 'uru-mcp@latest'],
                    env: {
                        URU_API_KEY: exampleConfig.token || 'your-auth-token-here',
                    },
                },
            },
        };
    }
}

module.exports = ConfigManager;

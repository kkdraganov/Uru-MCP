#!/usr/bin/env node

/**
 * Post-install script for Uru MCP
 *
 * Runs after npm install to provide setup guidance and check system requirements.
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const os = require('os');

function checkNodeVersion() {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);

    if (majorVersion < 18) {
        console.warn(
            chalk.yellow('Warning: Node.js 18+ is recommended. You have:'),
            nodeVersion
        );
        return false;
    }

    return true;
}

function getClaudeConfigPath() {
    const platform = os.platform();
    const homeDir = os.homedir();

    switch (platform) {
        case 'darwin': // macOS
            return path.join(
                homeDir,
                'Library',
                'Application Support',
                'Claude',
                'claude_desktop_config.json'
            );
        case 'win32': // Windows
            return path.join(
                process.env.APPDATA || path.join(homeDir, 'AppData', 'Roaming'),
                'Claude',
                'claude_desktop_config.json'
            );
        case 'linux': // Linux
            return path.join(
                homeDir,
                '.config',
                'Claude',
                'claude_desktop_config.json'
            );
        default:
            return null;
    }
}

function checkClaudeDesktop() {
    const configPath = getClaudeConfigPath();
    if (!configPath) {
        return { exists: false, reason: 'Unsupported platform' };
    }

    try {
        const exists = fs.existsSync(configPath);
        return { exists, path: configPath };
    } catch (error) {
        return { exists: false, reason: error.message };
    }
}

function showWelcomeMessage() {
    console.log();
    console.log(chalk.blue.bold('Uru MCP installed successfully!'));
    console.log(chalk.gray('   Connecting Uru Platform to Claude Desktop'));
    console.log();
}

function showQuickStart() {
    console.log(chalk.green.bold('Quick Start:'));
    console.log();
    console.log(chalk.white('1. Configure the proxy:'));
    console.log(chalk.cyan('   npx uru-mcp --setup'));
    console.log();
    console.log(chalk.white('2. Test the connection:'));
    console.log(chalk.cyan('   npx uru-mcp --test'));
    console.log();
    console.log(chalk.white('3. Get Claude Desktop configuration:'));
    console.log(chalk.cyan('   npx uru-mcp --claude-config'));
    console.log();
}

function showClaudeDesktopInfo() {
    const claudeInfo = checkClaudeDesktop();

    console.log(chalk.green.bold('Claude Desktop Integration:'));
    console.log();

    if (claudeInfo.exists) {
        console.log(chalk.green('Claude Desktop configuration file found'));
        console.log(chalk.gray(`   Location: ${claudeInfo.path}`));
    } else {
        console.log(chalk.yellow('Claude Desktop configuration not found'));
        if (claudeInfo.reason) {
            console.log(chalk.gray(`   Reason: ${claudeInfo.reason}`));
        }
        console.log(chalk.gray("   You'll need to create the configuration manually"));
    }
    console.log();
}

function showEnvironmentVariables() {
    console.log(chalk.green.bold('Environment Variables:'));
    console.log();
    console.log(chalk.white('Required:'));
    console.log(
        chalk.cyan('   URU_TOKEN') + chalk.gray('      - Authentication token')
    );
    console.log();
    console.log(chalk.white('Optional:'));
    console.log(
        chalk.cyan('   URU_DEBUG') +
            chalk.gray('      - Enable debug mode (true/false)')
    );
    console.log();
    console.log(chalk.white('Proxy URL:'));
    console.log(chalk.gray('   https://mcp.uruenterprises.com (fixed)'));
    console.log();
}

function showTroubleshooting() {
    console.log(chalk.green.bold('Troubleshooting:'));
    console.log();
    console.log(chalk.white('Common issues:'));
    console.log(chalk.gray('- Connection refused: Check if proxy is running'));
    console.log(chalk.gray('- Authentication failed: Verify your token'));
    console.log(
        chalk.gray('- Tools not appearing: Check Claude Desktop configuration')
    );
    console.log();
    console.log(chalk.white('Get help:'));
    console.log(chalk.cyan('   npx uru-mcp --help'));
    console.log(chalk.cyan('   npx uru-mcp --test'));
    console.log();
}

function showNextSteps() {
    console.log(chalk.green.bold('Next Steps:'));
    console.log();
    console.log(chalk.white('1. Run the setup wizard:'));
    console.log(chalk.cyan('   npx uru-mcp --setup'));
    console.log();
    console.log(chalk.white('2. Add to Claude Desktop:'));
    console.log(chalk.cyan('   npx uru-mcp --claude-config'));
    console.log();
    console.log(chalk.white('3. Start using Uru tools in Claude Desktop!'));
    console.log();
}

function ensureBinExecutable() {
    try {
        const binPath = path.join(__dirname, '..', 'bin', 'uru-mcp.js');
        if (fs.existsSync(binPath)) {
            // 0755 executable for owner/group/others
            fs.chmodSync(binPath, 0o755);
            // eslint-disable-next-line no-console
            console.log('[INFO] Ensured executable permissions on bin/uru-mcp.js');
        }
    } catch (e) {
        // eslint-disable-next-line no-console
        console.warn(
            '[WARNING] Could not set executable bit on bin/uru-mcp.js:',
            e && e.message
        );
    }
}

function main() {
    try {
        showWelcomeMessage();

        // Ensure CLI entry is executable on POSIX systems (npx wrapper requires target to be +x)
        ensureBinExecutable();

        // Check system requirements
        const nodeOk = checkNodeVersion();
        if (!nodeOk) {
            console.log();
        }

        showQuickStart();
        showClaudeDesktopInfo();
        showEnvironmentVariables();
        showTroubleshooting();
        showNextSteps();

        console.log(chalk.gray('-'.repeat(60)));
        console.log(
            chalk.gray(
                'For more information, visit: https://github.com/kkdraganov/Uru-MCP'
            )
        );
        console.log();
    } catch (error) {
        console.error(chalk.red('❌ Post-install script error:'), error.message);
    }
}

// Only run if this script is executed directly (not required)
if (require.main === module) {
    main();
}

module.exports = {
    checkNodeVersion,
    getClaudeConfigPath,
    checkClaudeDesktop,
};

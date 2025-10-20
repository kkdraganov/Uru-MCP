#!/usr/bin/env node

/**
 * Claude-like MCP E2E smoke test
 * - Spawns the local Uru MCP server (STDIO transport)
 * - Calls tools/list (must complete < 5s)
 * - Calls one namespace __list_tools (platform) with api_key
 *
 * Usage:
 *   node Uru-MCP/test_claude_like.js --key <URU_API_KEY> [--proxy http://localhost:3001] [--timeout 5000] [--debug]
 */

const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

async function main() {
    program
        .requiredOption('-k, --key <key>', 'Uru API key (starts with uru_)')
        .option('-p, --proxy <url>', 'Proxy URL', 'http://localhost:3001')
        .option('-t, --timeout <ms>', 'Timeout in ms for tools/list', '5000')
        .option('-d, --debug', 'Enable debug logging', false)
        .parse(process.argv);

    const opts = program.opts();
    const API_KEY = opts.key;
    const PROXY_URL = opts.proxy;
    const TIMEOUT_MS = parseInt(opts.timeout, 10) || 5000;
    const DEBUG = !!opts.debug;

    console.error(`[INFO] Starting Claude-like MCP test`);
    console.error(`[INFO] Proxy URL: ${PROXY_URL}`);
    console.error(`[INFO] Timeout (tools/list): ${TIMEOUT_MS} ms`);

    // 1) Start MCP server via STDIO transport (exactly how Claude does)
    const transport = new StdioClientTransport({
        command: 'node',
        args: [path.join(__dirname, 'bin', 'uru-mcp.js')],
        env: {
            ...process.env,
            URU_API_KEY: API_KEY,
            URU_PROXY_URL: PROXY_URL,
            URU_DEBUG: DEBUG ? 'true' : 'false',
        },
        stderr: 'pipe',
    });

    if (transport.stderr) {
        transport.stderr.on('data', data => {
            const msg = data.toString();
            if (DEBUG) console.error(`[SERVER] ${msg.trim()}`);
        });
    }

    const client = new Client(
        { name: 'claude-like-test', version: '1.0.0' },
        { capabilities: { tools: {}, logging: {} } }
    );

    // 2) Connect
    await client.connect(transport);
    console.error(`[INFO] Connected to MCP server`);

    // 3) tools/list with strict timeout
    const t0 = Date.now();
    const discovery = Promise.race([
        client.listTools(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('tools/list timeout')), TIMEOUT_MS)),
    ]);

    let listResp;
    try {
        listResp = await discovery;
    } catch (err) {
        console.error(chalk.red(`[ERROR] tools/list failed: ${err.message}`));
        console.log(`FAIL tools-list: ${err.message}`);
        await transport.close();
        process.exit(1);
    }
    const elapsedList = Date.now() - t0;

    const tools = Array.isArray(listResp?.tools) ? listResp.tools : [];
    console.error(`[INFO] tools/list returned ${tools.length} tools in ${elapsedList} ms`);

    if (elapsedList > TIMEOUT_MS) {
        console.error(chalk.red(`[ERROR] tools/list exceeded timeout (${elapsedList} ms > ${TIMEOUT_MS} ms)`));
        console.log(`FAIL tools-list-timeout: ${elapsedList}`);
        await transport.close();
        process.exit(1);
    }

    // Ensure namespace wrappers are present (e.g., platform__list_tools)
    const wrapperNames = tools.map(t => t.name).filter(Boolean);
    const hasPlatform = wrapperNames.some(n => n.endsWith('__list_tools') && n.startsWith('platform'));
    const sample = wrapperNames.filter(n => n.endsWith('__list_tools')).slice(0, 5);
    console.error(`[INFO] Sample namespace wrappers: ${JSON.stringify(sample)}`);

    if (!hasPlatform) {
        console.error(chalk.red(`[ERROR] platform__list_tools not present in tools/list response`));
        console.log("FAIL no-platform-wrapper");
        await transport.close();
        process.exit(1);
    }

    // 4) Call platform__list_tools, pass api_key, assert non-empty text content
    try {
        const t1 = Date.now();
        const res = await client.callTool({
            name: 'platform__list_tools',
            arguments: { api_key: API_KEY },
        });
        const elapsedNs = Date.now() - t1;
        console.error(`[INFO] platform__list_tools responded in ${elapsedNs} ms`);

        const content = res?.content || [];
        const text = content.find(c => c.type === 'text');
        if (!text || typeof text.text !== 'string' || text.text.length === 0) {
            throw new Error('platform__list_tools returned empty/invalid content');
        }
        console.error(`[INFO] platform__list_tools content length: ${text.text.length}`);
    } catch (err) {
        console.error(chalk.red(`[ERROR] platform__list_tools failed: ${err.message}`));
        console.log(`FAIL platform-list-tools: ${err.message}`);
        await transport.close();
        process.exit(1);
    }

    // Success
    console.error(chalk.green(`[OK] Claude-like MCP smoke test passed`));
    console.log("PASS claude-like");
    await transport.close();
    process.exit(0);
}

main().catch(async err => {
    console.error(chalk.red(`[FATAL] ${err.message}`));
    process.exit(1);
});


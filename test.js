#!/usr/bin/env node

const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

const ConfigManager = require('./lib/config-manager');
const UruMCPServer = require('./lib/mcp-server');

async function main() {
    const configManager = new ConfigManager('/tmp/uru-mcp-test-config.json');

    const claudeConfig = configManager.getClaudeDesktopConfig({
        token: 'uru_test_token',
    });
    assert.deepStrictEqual(claudeConfig.mcpServers.uru.args, [
        '-y',
        'uru-mcp@latest',
    ]);
    assert.strictEqual(
        claudeConfig.mcpServers.uru.env.URU_API_KEY,
        'uru_test_token'
    );

    const baseConfig = configManager.validateConfig({
        proxyUrl: 'https://mcp.uruintelligence.com',
        token: 'uru_test_token',
        debug: false,
        timeout: 30000,
        retries: 3,
        cacheTimeout: 30000,
        toolSyncPollMs: 60000,
        enableToolListChanged: true,
    });

    const defaultServer = new UruMCPServer(baseConfig);
    assert.strictEqual(
        defaultServer.server._capabilities.tools.listChanged,
        true
    );

    const staticServer = new UruMCPServer({
        ...baseConfig,
        enableToolListChanged: false,
    });
    assert.deepStrictEqual(staticServer.server._capabilities.tools, {
        listChanged: false,
    });

    const workspaceErrorResult = defaultServer.buildToolErrorResultFromProxyPayload(
        {
            message:
                'No current workspace is set for this API key. Call set_current_workspace with a valid workspace_id before using other tools.',
            code: 'workspace_selection_required',
            details: {
                recovery_tools: ['list_workspaces', 'set_current_workspace'],
            },
        },
        409
    );

    const originalAxiosPost = axios.post;
    const postCalls = [];
    axios.post = async (url, body, options) => {
        postCalls.push({ url, body, options });
        return {
            data: {
                success: true,
                successful: true,
                data: { ok: true },
            },
        };
    };

    try {
        defaultServer.namespaceManager.namespaceMetadata.set('outlook_lloyd', {
            connected_account_id: 'ca_U2OlXIVld_vj',
            server_id: 'server_123',
        });

        const result = await defaultServer.handleNamespaceExecuteTool(
            'outlook_lloyd__execute_tool',
            {
                tool_name: 'OUTLOOK_GET_PROFILE',
                parameters: {},
            },
            'uru_call_specific_key'
        );

        assert.deepStrictEqual(result, {
            content: [
                {
                    type: 'text',
                    text: JSON.stringify({ ok: true }, null, 2),
                },
            ],
        });
        assert.strictEqual(postCalls.length, 1);
        assert.strictEqual(
            postCalls[0].url,
            'https://mcp.uruintelligence.com/execute/outlook_lloyd__execute_tool'
        );
        assert.deepStrictEqual(postCalls[0].body, {
            tool_name: 'OUTLOOK_GET_PROFILE',
            parameters: {},
        });
        assert.strictEqual(postCalls[0].body._app_context, undefined);
        assert.strictEqual(
            postCalls[0].options.headers['X-App-Context'],
            undefined
        );
        assert.strictEqual(
            postCalls[0].options.headers.Authorization,
            'Bearer uru_call_specific_key'
        );
        assert.strictEqual(
            postCalls[0].options.headers['X-Namespace'],
            'outlook_lloyd'
        );
        assert.strictEqual(
            postCalls[0].options.headers['X-Connected-Account-Id'],
            'ca_U2OlXIVld_vj'
        );
        assert.strictEqual(postCalls[0].options.headers['X-Server-Id'], 'server_123');

        await assert.rejects(
            () =>
                defaultServer.rejectDirectProviderToolExecution(
                    'OUTLOOK_GET_PROFILE',
                    {},
                    'uru_call_specific_key'
                ),
            error =>
                error &&
                error.code === -32601 &&
                String(error.message).includes('Direct tool')
        );
        assert.strictEqual(
            postCalls.length,
            1,
            'legacy direct execution must not post a bare provider tool slug'
        );
    } finally {
        axios.post = originalAxiosPost;
    }
    assert.strictEqual(workspaceErrorResult.isError, true);
    assert.ok(
        workspaceErrorResult.content[0].text.includes(
            'No current workspace is set for this API key.'
        )
    );
    assert.ok(
        workspaceErrorResult.content[0].text.includes(
            'Recovery tools: list_workspaces, set_current_workspace'
        )
    );

    const originalSetInterval = global.setInterval;
    const originalClearInterval = global.clearInterval;
    let intervalCalls = 0;

    global.setInterval = () => {
        intervalCalls += 1;
        return 123;
    };
    global.clearInterval = () => {};

    try {
        defaultServer._pollToolsVersion = async () => {};
        staticServer._pollToolsVersion = async () => {};

        defaultServer.startToolsVersionMonitor();
        assert.strictEqual(intervalCalls, 1);

        staticServer.startToolsVersionMonitor();
        assert.strictEqual(intervalCalls, 1);
    } finally {
        global.setInterval = originalSetInterval;
        global.clearInterval = originalClearInterval;
        defaultServer._toolsVersionMonitor = null;
        staticServer._toolsVersionMonitor = null;
    }

    const childScript = `
const UruMCPServer = require(${JSON.stringify(path.join(__dirname, 'lib', 'mcp-server.js'))});
(async () => {
  const server = new UruMCPServer({
    proxyUrl: 'https://mcp.uruintelligence.com',
    token: null,
    debug: false,
    timeout: 1000,
    retries: 0,
    cacheTimeout: 1000,
    toolSyncPollMs: 60000,
    enableToolListChanged: true,
  });
  server.testProxyConnection = async () => {};
  server.namespaceManager.fetchNamespacesFromProxy = async () => {};
  await server.start();
  process.stderr.write('SERVER_READY\\n');
})().catch(error => {
  process.stderr.write(String(error && error.stack || error) + '\\n');
  process.exit(1);
});
`;

    await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['-e', childScript], {
            stdio: ['pipe', 'pipe', 'pipe'],
        });

        let ready = false;
        let exited = false;
        let stderr = '';

        const fail = message => {
            if (!exited) {
                child.kill('SIGKILL');
            }
            reject(new Error(message));
        };

        const timeout = setTimeout(() => {
            fail(`Timed out waiting for child shutdown. stderr=${stderr}`);
        }, 5000);

        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
            if (!ready && stderr.includes('SERVER_READY')) {
                ready = true;
                child.stdin.end();
            }
        });

        child.on('exit', code => {
            exited = true;
            clearTimeout(timeout);
            if (!ready) {
                reject(new Error(`Child exited before ready with code ${code}. stderr=${stderr}`));
                return;
            }
            if (code !== 0) {
                reject(new Error(`Child exited with code ${code}. stderr=${stderr}`));
                return;
            }
            resolve();
        });
    });

    await defaultServer.shutdown('test');
    await staticServer.shutdown('test');

    console.log('PASS regression checks');
    process.exit(0);
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

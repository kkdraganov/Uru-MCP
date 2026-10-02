#!/usr/bin/env node

const assert = require('assert');
const { spawn } = require('child_process');
const path = require('path');
const axios = require('axios');

const ConfigManager = require('./lib/config-manager');
const UruMCPServer = require('./lib/mcp-server');
const { IntelligentToolLoader } = require('./lib/tool-loader');
const {
    ToolsSyncMonitor,
    classifyToolsSyncResponse,
    computeBackoffMs,
    describeToolsSyncStop,
    parseRetryAfterMs,
} = require('./lib/tools-sync-monitor');
const packageJson = require('./package.json');

async function main() {
    const configManager = new ConfigManager('/tmp/uru-mcp-test-config.json');

    const claudeConfig = configManager.getClaudeDesktopConfig({
        token: 'uru_test_token',
        workspaceId: '11111111-1111-4111-8111-111111111111',
    });
    assert.deepStrictEqual(claudeConfig.mcpServers.uru.args, [
        '-y',
        'uru-mcp@latest',
    ]);
    assert.strictEqual(
        claudeConfig.mcpServers.uru.env.URU_API_KEY,
        'uru_test_token'
    );
    assert.strictEqual(
        claudeConfig.mcpServers.uru.env.URU_WORKSPACE_ID,
        '11111111-1111-4111-8111-111111111111'
    );

    const originalWorkspaceId = process.env.URU_WORKSPACE_ID;
    process.env.URU_WORKSPACE_ID = '22222222-2222-4222-8222-222222222222';
    try {
        const envConfig = await configManager.loadConfig();
        assert.strictEqual(
            envConfig.workspaceId,
            '22222222-2222-4222-8222-222222222222'
        );
    } finally {
        if (originalWorkspaceId === undefined) {
            delete process.env.URU_WORKSPACE_ID;
        } else {
            process.env.URU_WORKSPACE_ID = originalWorkspaceId;
        }
    }
    assert.throws(
        () => configManager.validateConfig({ workspaceId: 'bad\nheader' }),
        /Workspace ID must be a valid UUID/
    );

    const baseConfig = configManager.validateConfig({
        proxyUrl: 'https://mcp.uruintelligence.com',
        token: 'uru_test_token',
        workspaceId: '11111111-1111-4111-8111-111111111111',
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

    const labelRegressionLoader = new IntelligentToolLoader(
        {
            fetchNamespacesFromProxy: async () => [
                {
                    name: 'gmail_ignition_email',
                    displayName: 'Gmail - ignition email',
                    account_label: 'ignition email',
                },
                {
                    name: 'external_mcp_ignition_notes',
                    displayName: 'Granola - Ignition Notes',
                    account_label: 'Ignition Notes',
                },
            ],
            createNamespaceDiscoveryTool(appName, displayName) {
                return {
                    name: `${appName}__list_tools`,
                    description: `List tools for ${displayName}`,
                    annotations: { title: `${displayName} Discovery` },
                };
            },
            createNamespaceExecuteTool(appName, displayName) {
                return {
                    name: `${appName}__execute_tool`,
                    description: `Execute a tool in ${displayName}`,
                    annotations: { title: `${displayName} Execution` },
                };
            },
        },
        { getNamespaceTools: () => [] },
        {}
    );
    const discoveryTools = await labelRegressionLoader.getDiscoveryTools();
    const discoveryText = JSON.stringify(discoveryTools);
    assert.ok(discoveryText.includes('Gmail - ignition email Discovery'));
    assert.ok(discoveryText.includes('Gmail - ignition email Execution'));
    assert.ok(discoveryText.includes('Granola - Ignition Notes Discovery'));
    assert.ok(!discoveryText.includes('Gmail - ignition email (ignition email)'));
    assert.ok(
        !discoveryText.includes(
            'Granola - Ignition Notes (Ignition Notes)'
        )
    );
    assert.ok(!discoveryText.includes('Gmail Ignition Email Ignition Email'));

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
            postCalls[0].options.headers['X-Uru-Workspace-Id'],
            '11111111-1111-4111-8111-111111111111'
        );
        assert.strictEqual(
            defaultServer.namespaceManager.getAuthHeaders()[
                'X-Uru-Workspace-Id'
            ],
            '11111111-1111-4111-8111-111111111111'
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

    let defaultPolls = 0;
    let staticPolls = 0;
    defaultServer._pollToolsVersion = async () => {
        defaultPolls += 1;
        return { action: 'ok', status: 304 };
    };
    staticServer._pollToolsVersion = async () => {
        staticPolls += 1;
        return { action: 'ok', status: 304 };
    };

    defaultServer.startToolsVersionMonitor();
    defaultServer.startToolsVersionMonitor();
    staticServer.startToolsVersionMonitor();
    await flushAsync();
    assert.strictEqual(defaultPolls, 1, 'a second start must not add a poll chain');
    assert.strictEqual(defaultServer._toolsSyncMonitor.state, 'running');
    assert.strictEqual(staticPolls, 0);
    assert.strictEqual(staticServer._toolsSyncMonitor, null);

    await toolsSyncChecks(baseConfig);

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
    assert.strictEqual(defaultServer._toolsSyncMonitor.state, 'idle');

    console.log('PASS regression checks');
    process.exit(0);
}

function flushAsync() {
    return new Promise(resolve => setImmediate(resolve));
}

/**
 * Timers that fire only when a test says so. Records every scheduled delay.
 */
function createFakeScheduler() {
    const pending = new Map();
    const delays = [];
    let nextId = 1;
    return {
        pending,
        delays,
        setTimer(fn, ms) {
            const id = nextId++;
            pending.set(id, fn);
            delays.push(ms);
            return id;
        },
        clearTimer(id) {
            pending.delete(id);
        },
        async fireNext() {
            assert.strictEqual(pending.size, 1, 'exactly one timer must be pending');
            const [id, fn] = pending.entries().next().value;
            pending.delete(id);
            fn();
            await flushAsync();
        },
    };
}

async function toolsSyncChecks(baseConfig) {
    const MINUTE = 60 * 1000;
    const CAP = 15 * MINUTE;
    const NOW = Date.parse('2026-10-02T12:00:00Z');

    // Classification: permanent refusals stop.
    for (const status of [401, 403]) {
        assert.deepStrictEqual(
            classifyToolsSyncResponse({ status, data: {}, headers: {} }, NOW),
            { action: 'stop', status, code: null }
        );
    }
    assert.strictEqual(
        classifyToolsSyncResponse(
            { status: 403, data: { success: false, code: 'workspace_not_accessible' } },
            NOW
        ).code,
        'workspace_not_accessible'
    );
    const workspaceBodies = [
        { success: false, code: 'workspace_required', message: 'needs a workspace' },
        { error: { code: 'workspace_id_invalid', message: 'bad id', status: 400 } },
        JSON.stringify({ code: 'workspace_required' }),
        { detail: { code: 'workspace_required' } },
        { error: 'workspace_id_invalid' },
        { error_code: 'WORKSPACE_REQUIRED' },
        { code: 'bad_request', details: { code: 'workspace_id_invalid' } },
    ];
    for (const data of workspaceBodies) {
        const outcome = classifyToolsSyncResponse({ status: 400, data, headers: {} }, NOW);
        assert.strictEqual(outcome.action, 'stop', `400 body must stop: ${JSON.stringify(data)}`);
        assert.ok(['workspace_required', 'workspace_id_invalid'].includes(outcome.code));
    }
    for (const data of [{ code: 'bad_request' }, 'not json', null, '', { error: 42 }]) {
        assert.strictEqual(
            classifyToolsSyncResponse({ status: 400, data, headers: {} }, NOW).action,
            'retry',
            `400 without a workspace code must back off: ${JSON.stringify(data)}`
        );
    }
    for (const status of [429, 500, 502, 503, 504, 404]) {
        assert.strictEqual(
            classifyToolsSyncResponse({ status, data: {}, headers: {} }, NOW).action,
            'retry'
        );
    }
    for (const status of [200, 304]) {
        assert.strictEqual(classifyToolsSyncResponse({ status }, NOW).action, 'ok');
    }

    // Retry-After: seconds or HTTP date, any header case.
    assert.strictEqual(parseRetryAfterMs('120', NOW), 120000);
    assert.strictEqual(parseRetryAfterMs(' 7 ', NOW), 7000);
    assert.strictEqual(
        parseRetryAfterMs(new Date(NOW + 90 * 1000).toUTCString(), NOW),
        90000
    );
    assert.strictEqual(parseRetryAfterMs(new Date(NOW - 5000).toUTCString(), NOW), 0);
    assert.strictEqual(parseRetryAfterMs('soon', NOW), null);
    assert.strictEqual(parseRetryAfterMs(undefined, NOW), null);
    assert.strictEqual(
        classifyToolsSyncResponse(
            { status: 429, data: {}, headers: { 'Retry-After': '30' } },
            NOW
        ).retryAfterMs,
        30000
    );
    assert.strictEqual(
        classifyToolsSyncResponse(
            {
                status: 503,
                data: {},
                headers: { 'retry-after': new Date(NOW + 2 * MINUTE).toUTCString() },
            },
            NOW
        ).retryAfterMs,
        2 * MINUTE
    );

    // Full jitter: random(0, min(cap, base * 2^n)).
    const ceilings = [2, 4, 8, 15, 15, 15].map(minutes => minutes * MINUTE);
    ceilings.forEach((ceiling, index) => {
        const failures = index + 1;
        const options = { baseMs: MINUTE, capMs: CAP };
        assert.strictEqual(computeBackoffMs(failures, { ...options, random: () => 0 }), 0);
        assert.strictEqual(
            computeBackoffMs(failures, { ...options, random: () => 0.5 }),
            ceiling / 2
        );
        const high = computeBackoffMs(failures, { ...options, random: () => 0.999999 });
        assert.ok(high < ceiling && high >= ceiling - 1000, `n=${failures} high=${high}`);
        for (let draw = 0; draw < 200; draw += 1) {
            const delay = computeBackoffMs(failures, { ...options, random: Math.random });
            assert.ok(delay >= 0 && delay < ceiling, `n=${failures} delay=${delay}`);
        }
    });
    assert.strictEqual(
        computeBackoffMs(500, { baseMs: MINUTE, capMs: CAP, random: () => 0.5 }),
        CAP / 2,
        'huge failure counts stay at the cap'
    );

    // Monitor: backoff grows, honors Retry-After, caps, and resets after success.
    {
        const scheduler = createFakeScheduler();
        const outcomes = [
            { action: 'retry', status: 503, retryAfterMs: null },
            { action: 'retry', status: 503, retryAfterMs: null },
            { action: 'retry', status: 503, retryAfterMs: null },
            { action: 'retry', status: 503, retryAfterMs: null },
            { action: 'retry', status: 503, retryAfterMs: null },
            { action: 'ok', status: 200 },
            { action: 'ok', status: 304 },
            { action: 'retry', status: 429, retryAfterMs: 5 * MINUTE },
            { action: 'retry', status: 429, retryAfterMs: 60 * MINUTE },
            { action: 'ok', status: 304 },
        ];
        const failureLog = [];
        let polls = 0;
        const monitor = new ToolsSyncMonitor({
            poll: async () => {
                polls += 1;
                const outcome = outcomes.shift();
                if (!outcome) {
                    throw new Error('ECONNRESET');
                }
                return outcome;
            },
            intervalMs: MINUTE,
            random: () => 0.5,
            setTimer: scheduler.setTimer,
            clearTimer: scheduler.clearTimer,
            onRetry: info => failureLog.push(info.failures),
            onStop: () => assert.fail('retryable outcomes must not stop'),
        });
        monitor.start();
        await flushAsync();
        for (let fire = 0; fire < 10; fire += 1) {
            await scheduler.fireNext();
        }
        assert.strictEqual(polls, 11);
        assert.deepStrictEqual(scheduler.delays, [
            1 * MINUTE, // 503, n=1: 0.5 * 2 min
            2 * MINUTE, // 503, n=2: 0.5 * 4 min
            4 * MINUTE, // 503, n=3: 0.5 * 8 min
            7.5 * MINUTE, // 503, n=4: 0.5 * 15 min cap
            7.5 * MINUTE, // 503, n=5: still capped
            1 * MINUTE, // 200: normal cadence, backoff reset
            1 * MINUTE, // 304: normal cadence
            5 * MINUTE, // 429, n=1: Retry-After 5 min beats 1 min jitter
            15 * MINUTE, // 429, n=2: Retry-After 60 min clamped to the cap
            1 * MINUTE, // 304: reset again
            1 * MINUTE, // network error, n=1: 0.5 * 2 min
        ]);
        assert.deepStrictEqual(failureLog, [1, 2, 3, 4, 5, 1, 2, 1]);
        assert.strictEqual(monitor.failures, 1);
        monitor.stop();
        assert.strictEqual(scheduler.pending.size, 0);
        assert.strictEqual(monitor.state, 'idle');
    }

    // Monitor: never two polls at once, and never two timers.
    {
        const scheduler = createFakeScheduler();
        let release;
        let inFlight = 0;
        let maxInFlight = 0;
        let polls = 0;
        const monitor = new ToolsSyncMonitor({
            poll: () => {
                polls += 1;
                inFlight += 1;
                maxInFlight = Math.max(maxInFlight, inFlight);
                return new Promise(resolve => {
                    release = () => {
                        inFlight -= 1;
                        resolve({ action: 'ok', status: 304 });
                    };
                });
            },
            intervalMs: MINUTE,
            setTimer: scheduler.setTimer,
            clearTimer: scheduler.clearTimer,
        });
        monitor.start();
        monitor.start();
        await flushAsync();
        assert.strictEqual(polls, 1);
        assert.strictEqual(scheduler.pending.size, 0, 'no timer while a poll runs');

        // stop + start while the poll is in flight must not start a second poll.
        monitor.stop();
        monitor.start();
        await flushAsync();
        assert.strictEqual(polls, 1);
        assert.strictEqual(scheduler.pending.size, 0);

        release();
        await flushAsync();
        assert.strictEqual(scheduler.pending.size, 1, 'one timer after the poll settles');

        // A slow poll: the next timer is armed only after it settles.
        await scheduler.fireNext();
        assert.strictEqual(polls, 2);
        assert.strictEqual(scheduler.pending.size, 0);
        await monitor._runPoll();
        assert.strictEqual(polls, 2, 'a stray tick during a poll is ignored');
        release();
        await flushAsync();
        assert.strictEqual(scheduler.pending.size, 1);
        assert.strictEqual(maxInFlight, 1);

        // stop during a poll: the poll finishes, nothing is scheduled.
        await scheduler.fireNext();
        monitor.stop();
        release();
        await flushAsync();
        assert.strictEqual(scheduler.pending.size, 0);
        assert.strictEqual(monitor.state, 'idle');
        assert.strictEqual(maxInFlight, 1);
    }

    // Server: the real poll stops for good on 401, 403, and 400 workspace codes.
    const stopCases = [
        { status: 401, data: { error: 'Unauthorized' }, expect: /HTTP 401/ },
        {
            status: 403,
            data: { success: false, code: 'workspace_not_allowed_for_credential' },
            expect: /HTTP 403, workspace_not_allowed_for_credential/,
        },
        {
            status: 400,
            data: { success: false, code: 'workspace_required', message: 'x' },
            expect: /workspace is missing or invalid \(HTTP 400, workspace_required\)/,
        },
        {
            status: 400,
            data: { error: { code: 'workspace_id_invalid', message: 'x', status: 400 } },
            expect: /HTTP 400, workspace_id_invalid/,
        },
    ];
    const originalAxiosGet = axios.get;
    const originalConsoleError = console.error;
    try {
        for (const stopCase of stopCases) {
            const getCalls = [];
            const errorLines = [];
            axios.get = async (url, options) => {
                getCalls.push({ url, options });
                return { status: stopCase.status, data: stopCase.data, headers: {} };
            };
            console.error = (...args) => errorLines.push(args.join(' '));

            const server = new UruMCPServer(baseConfig);
            server.startToolsVersionMonitor();
            await flushAsync();
            console.error = originalConsoleError;

            assert.strictEqual(getCalls.length, 1);
            assert.strictEqual(
                getCalls[0].url,
                'https://mcp.uruintelligence.com/tools/sync/version'
            );
            assert.strictEqual(
                getCalls[0].options.validateStatus(stopCase.status),
                true,
                'every status must reach the classifier'
            );
            assert.strictEqual(server._toolsSyncMonitor.state, 'halted');
            assert.strictEqual(server._toolsSyncMonitor._timer, null, 'no poll after a stop');
            assert.strictEqual(errorLines.length, 1, `one log line for ${stopCase.status}`);
            assert.ok(!errorLines[0].includes('\n'));
            assert.match(errorLines[0], stopCase.expect);
            assert.ok(errorLines[0].includes('uru mcp install --workspace <id>'));
            assert.ok(errorLines[0].includes('URU_API_KEY'));

            server.startToolsVersionMonitor();
            await flushAsync();
            assert.strictEqual(getCalls.length, 1, 'a halted monitor never polls again');
            await server.shutdown('test');
        }

        // Server: User-Agent carries the package version; 200 is healthy.
        const getCalls = [];
        axios.get = async (url, options) => {
            getCalls.push({ url, options });
            return {
                status: 200,
                data: { version: 7 },
                headers: { etag: '"tools-v7"' },
            };
        };
        const server = new UruMCPServer(baseConfig);
        assert.strictEqual(server.server._serverInfo.version, packageJson.version);
        const outcome = await server._pollToolsVersion();
        assert.deepStrictEqual(outcome, { action: 'ok', status: 200 });
        assert.strictEqual(server._toolsSyncEtag, '"tools-v7"');
        assert.strictEqual(server._lastToolsVersion, 7);
        assert.strictEqual(
            getCalls[0].options.headers['User-Agent'],
            `Uru-MCP/${packageJson.version}`
        );
        assert.strictEqual(
            server.namespaceManager.getAuthHeaders()['User-Agent'],
            `Uru-MCP/${packageJson.version}`
        );

        // Server: 503 with Retry-After is retryable; a network error throws.
        axios.get = async () => ({
            status: 503,
            data: { success: false, code: 'tools_sync_version_failed', retryable: true },
            headers: { 'retry-after': '45' },
        });
        assert.deepStrictEqual(await server._pollToolsVersion(), {
            action: 'retry',
            status: 503,
            retryAfterMs: 45000,
        });
        axios.get = async () => {
            const error = new Error('connect ECONNREFUSED');
            error.code = 'ECONNREFUSED';
            throw error;
        };
        await assert.rejects(() => server._pollToolsVersion(), /ECONNREFUSED/);
        await server.shutdown('test');
    } finally {
        axios.get = originalAxiosGet;
        console.error = originalConsoleError;
    }

    assert.ok(
        describeToolsSyncStop({ status: 401, code: null }).startsWith(
            '[Uru MCP] Tool sync stopped:'
        )
    );
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

#!/usr/bin/env node

const assert = require('assert');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

const UruMCPServer = require('../lib/mcp-server');

const CLI_KEY = 'uru_diagnostic_test_key_never_log';

async function main() {
    await testCliSuccess();
    await testCliFailure(401, { error: 'invalid_key' }, /Authentication failed/);
    await testCliFailure(403, { error: 'forbidden' }, /Access forbidden/);
    await testCliMissingWorkspace();
    await testCliMalformedResponse();
    await testCliMalformedWorkspaceResponse();
    await testCliNetworkFailure();
    await testStartupPreflightRouting();
    testRuntimeDebugDoesNotLogKey();
    await testToolCallDebugDoesNotLogPerRequestKey();

    console.log('PASS authenticated diagnostics checks');
}

async function testCliSuccess() {
    const fixture = await startFixture((request, response) => {
        if (request.url === '/health') {
            return sendJson(response, 200, { status: 'healthy' });
        }
        if (request.url === '/namespaces') {
            return sendJson(response, 200, {
                namespaces: [{ name: 'platform' }, { name: 'company' }],
            });
        }
        return sendJson(response, 200, { version: 7, degraded: false });
    });

    try {
        const result = await spawnCli(fixture.baseUrl);
        assert.strictEqual(result.code, 0, result.output);
        assert.match(
            result.output,
            /Authenticated connection successful \(2 namespaces; workspace context ready\)/
        );
        assertAuthenticatedRequests(
            fixture.requests,
            ['/namespaces', '/tools/sync/version'],
            result.output
        );
    } finally {
        await fixture.close();
    }
}

async function testCliFailure(status, payload, expectedMessage) {
    const fixture = await startFixture((request, response) => {
        if (request.url === '/health') {
            return sendJson(response, 200, { status: 'healthy' });
        }
        return sendJson(response, status, payload);
    });

    try {
        const result = await spawnCli(fixture.baseUrl);
        assert.notStrictEqual(result.code, 0, result.output);
        assert.match(result.output, expectedMessage);
        assertAuthenticatedRequests(fixture.requests, ['/namespaces'], result.output);
    } finally {
        await fixture.close();
    }
}

async function testCliMissingWorkspace() {
    const fixture = await startFixture((request, response) => {
        if (request.url === '/namespaces') {
            return sendJson(response, 200, {
                namespaces: [{ name: 'platform', recovery: true }],
            });
        }
        if (request.url === '/health') {
            return sendJson(response, 200, { status: 'healthy' });
        }
        return sendJson(response, 409, {
            code: 'workspace_selection_required',
        });
    });

    try {
        const result = await spawnCli(fixture.baseUrl);
        assert.notStrictEqual(result.code, 0, result.output);
        assert.match(result.output, /No current workspace is set/);
        assertAuthenticatedRequests(
            fixture.requests,
            ['/namespaces', '/tools/sync/version'],
            result.output
        );
    } finally {
        await fixture.close();
    }
}

async function testCliMalformedResponse() {
    const fixture = await startFixture((_request, response) => {
        sendJson(response, 200, { namespaces: { platform: true } });
    });

    try {
        const result = await spawnCli(fixture.baseUrl);
        assert.notStrictEqual(result.code, 0, result.output);
        assert.match(result.output, /expected a namespaces array/);
        assertAuthenticatedRequests(fixture.requests, ['/namespaces'], result.output);
    } finally {
        await fixture.close();
    }
}

async function testCliMalformedWorkspaceResponse() {
    const fixture = await startFixture((request, response) => {
        if (request.url === '/namespaces') {
            return sendJson(response, 200, { namespaces: [] });
        }
        return sendJson(response, 200, { version: 'not-a-number' });
    });

    try {
        const result = await spawnCli(fixture.baseUrl);
        assert.notStrictEqual(result.code, 0, result.output);
        assert.match(result.output, /expected a numeric version/);
        assertAuthenticatedRequests(
            fixture.requests,
            ['/namespaces', '/tools/sync/version'],
            result.output
        );
    } finally {
        await fixture.close();
    }
}

async function testCliNetworkFailure() {
    const fixture = await startFixture((_request, response) => {
        sendJson(response, 200, { namespaces: [] });
    });
    const unreachableUrl = fixture.baseUrl;
    await fixture.close();

    const result = await spawnCli(unreachableUrl);
    assert.notStrictEqual(result.code, 0, result.output);
    assert.match(result.output, /Unable to connect to the Uru MCP proxy/);
    assertKeyIsNotLogged(result.output);
}

async function testStartupPreflightRouting() {
    const fixture = await startFixture((request, response) => {
        if (request.url === '/health') {
            return sendJson(response, 200, { status: 'healthy' });
        }
        if (request.url === '/namespaces') {
            return sendJson(response, 200, {
                namespaces: [{ name: 'platform', recovery: true }],
            });
        }
        return sendJson(response, 409, {
            code: 'workspace_selection_required',
        });
    });

    const configuredServer = createServer(fixture.baseUrl, CLI_KEY);
    const tokenlessServer = createServer(fixture.baseUrl, null);
    try {
        await assert.rejects(
            () => configuredServer.testProxyConnection(),
            /No current workspace is set/
        );
        assert.deepStrictEqual(
            fixture.requests.map(request => request.url),
            ['/namespaces', '/tools/sync/version']
        );

        fixture.requests.length = 0;
        assert.strictEqual(await tokenlessServer.testProxyConnection(), true);
        assert.deepStrictEqual(
            fixture.requests.map(request => request.url),
            ['/health']
        );
    } finally {
        configuredServer.toolRegistry.destroy();
        tokenlessServer.toolRegistry.destroy();
        await fixture.close();
    }
}

function testRuntimeDebugDoesNotLogKey() {
    const originalConsoleError = console.error;
    let debugOutput = '';
    console.error = (...values) => {
        debugOutput += `${values.join(' ')}\n`;
    };

    let server;
    try {
        server = new UruMCPServer({
            proxyUrl: 'http://127.0.0.1:1',
            token: CLI_KEY,
            debug: true,
            timeout: 1000,
            retries: 0,
            cacheTimeout: 1000,
            toolSyncPollMs: 60000,
            enableToolListChanged: true,
        });
    } finally {
        console.error = originalConsoleError;
        server?.toolRegistry.destroy();
    }

    assert.match(debugOutput, /Authentication: configured/);
    assertKeyIsNotLogged(debugOutput);
}

async function testToolCallDebugDoesNotLogPerRequestKey() {
    const originalConsoleError = console.error;
    let debugOutput = '';
    console.error = (...values) => {
        debugOutput += `${values.join(' ')}\n`;
    };

    const request = {
        method: 'tools/call',
        params: {
            name: 'obsolete_provider_tool',
            arguments: {
                api_key: CLI_KEY,
                visible_parameter: 'safe-to-log',
            },
        },
    };
    let server;
    try {
        server = new UruMCPServer({
            proxyUrl: 'http://127.0.0.1:1',
            token: null,
            debug: true,
            timeout: 1000,
            retries: 0,
            cacheTimeout: 1000,
            toolSyncPollMs: 60000,
            enableToolListChanged: true,
        });
        const handler = server.server._requestHandlers.get('tools/call');
        assert.strictEqual(typeof handler, 'function');
        await handler(request, {});
    } finally {
        console.error = originalConsoleError;
        server?.toolRegistry.destroy();
    }

    assert.strictEqual(request.params.arguments.api_key, CLI_KEY);
    assert.match(debugOutput, /"api_key": "\[REDACTED\]"/);
    assert.match(debugOutput, /safe-to-log/);
    assertKeyIsNotLogged(debugOutput);
}

function createServer(proxyUrl, token) {
    return new UruMCPServer({
        proxyUrl,
        token,
        debug: false,
        timeout: 1000,
        retries: 0,
        cacheTimeout: 1000,
        toolSyncPollMs: 60000,
        enableToolListChanged: true,
    });
}

function assertAuthenticatedRequests(requests, expectedUrls, output) {
    assert.deepStrictEqual(
        requests.map(request => request.url),
        expectedUrls
    );
    for (const request of requests) {
        assert.strictEqual(request.authorization, `Bearer ${CLI_KEY}`);
    }
    assertKeyIsNotLogged(output);
}

function assertKeyIsNotLogged(output) {
    assert.ok(!output.includes(CLI_KEY), 'CLI output must never contain the API key');
}

async function startFixture(responder) {
    const requests = [];
    const server = http.createServer((request, response) => {
        requests.push({
            url: request.url,
            authorization: request.headers.authorization,
        });
        responder(request, response);
    });

    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert.ok(address && typeof address === 'object');

    return {
        baseUrl: `http://127.0.0.1:${address.port}`,
        requests,
        close: () => new Promise(resolve => server.close(resolve)),
    };
}

function sendJson(response, status, payload) {
    response.writeHead(status, { 'Content-Type': 'application/json' });
    response.end(JSON.stringify(payload));
}

function spawnCli(proxyUrl) {
    return new Promise((resolve, reject) => {
        const env = { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0' };
        delete env.URU_API_KEY;
        delete env.URU_PROXY_URL;

        const child = spawn(
            process.execPath,
            [
                path.join(__dirname, '..', 'bin', 'uru-mcp.js'),
                '--test',
                '--key',
                CLI_KEY,
                '--proxy-url',
                proxyUrl,
            ],
            { env, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        let stdout = '';
        let stderr = '';
        const timeout = setTimeout(() => {
            child.kill();
            reject(new Error('Timed out waiting for the diagnostic CLI to exit'));
        }, 5000);

        child.stdout.on('data', chunk => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', chunk => {
            stderr += chunk.toString();
        });
        child.once('error', error => {
            clearTimeout(timeout);
            reject(error);
        });
        child.once('exit', (code, signal) => {
            clearTimeout(timeout);
            resolve({
                code,
                signal,
                stdout,
                stderr,
                output: `${stdout}\n${stderr}`,
            });
        });
    });
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});

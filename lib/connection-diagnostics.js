const axios = require('axios');

class ConnectionDiagnosticError extends Error {
    constructor(code, message, status = null) {
        super(message);
        this.name = 'ConnectionDiagnosticError';
        this.code = code;
        this.status = status;
    }
}

async function testAuthenticatedAccess({ proxyUrl, token, timeout = 10000 }) {
    if (!token) {
        throw new ConnectionDiagnosticError(
            'missing_api_key',
            'No Uru API key configured. Run --setup first.'
        );
    }

    try {
        const requestConfig = {
            timeout,
            headers: {
                Authorization: `Bearer ${token}`,
                'User-Agent': 'Uru-MCP-Proxy/1.0.0',
            },
        };
        const namespacesResponse = await axios.get(
            `${proxyUrl}/namespaces`,
            requestConfig
        );
        const namespacesPayload = namespacesResponse.data;

        if (
            !namespacesPayload ||
            !Array.isArray(namespacesPayload.namespaces)
        ) {
            throw new ConnectionDiagnosticError(
                'malformed_namespaces_response',
                'Invalid namespaces response: expected a namespaces array.',
                namespacesResponse.status
            );
        }

        // This read-only endpoint explicitly requires a current workspace. Unlike
        // /namespaces, it returns workspace_selection_required when the key is
        // authenticated but has no selected workspace.
        const workspaceResponse = await axios.get(
            `${proxyUrl}/tools/sync/version`,
            requestConfig
        );
        const workspacePayload = workspaceResponse.data;
        if (
            !workspacePayload ||
            typeof workspacePayload.version !== 'number' ||
            !Number.isFinite(workspacePayload.version)
        ) {
            throw new ConnectionDiagnosticError(
                'malformed_workspace_response',
                'Invalid workspace validation response: expected a numeric version.',
                workspaceResponse.status
            );
        }

        return {
            status: workspaceResponse.status,
            namespaceCount: namespacesPayload.namespaces.length,
            workspaceVersion: workspacePayload.version,
        };
    } catch (error) {
        if (error instanceof ConnectionDiagnosticError) {
            throw error;
        }
        throw mapRequestError(error, 'authenticated_access_failed');
    }
}

async function testPublicConnectivity({ proxyUrl, timeout = 10000 }) {
    try {
        const response = await axios.get(`${proxyUrl}/health`, { timeout });
        return { status: response.status };
    } catch (error) {
        throw mapRequestError(error, 'proxy_connectivity_failed');
    }
}

function isWorkspaceSelectionRequired(payload) {
    if (!payload || typeof payload !== 'object') {
        return false;
    }

    const code = payload.code || payload.error?.code || payload.details?.code;
    return code === 'workspace_selection_required';
}

function mapRequestError(error, fallbackCode) {
    const status = error?.response?.status ?? null;
    const payload = error?.response?.data;

    if (isWorkspaceSelectionRequired(payload)) {
        return new ConnectionDiagnosticError(
            'workspace_selection_required',
            'No current workspace is set for this API key.',
            status
        );
    }
    if (status === 401) {
        return new ConnectionDiagnosticError(
            'authentication_failed',
            'Authentication failed. Check your API key.',
            status
        );
    }
    if (status === 403) {
        return new ConnectionDiagnosticError(
            'access_forbidden',
            'Access forbidden. Check your API key permissions.',
            status
        );
    }
    if (status === 409) {
        return new ConnectionDiagnosticError(
            'workspace_selection_required',
            'No current workspace is set for this API key.',
            status
        );
    }
    if (
        ['ECONNABORTED', 'ECONNREFUSED', 'ENETUNREACH', 'ENOTFOUND', 'ETIMEDOUT'].includes(
            error?.code
        )
    ) {
        return new ConnectionDiagnosticError(
            'proxy_unreachable',
            'Unable to connect to the Uru MCP proxy.'
        );
    }

    const statusSuffix = status === null ? '' : ` (HTTP ${status})`;
    return new ConnectionDiagnosticError(
        fallbackCode,
        `Proxy connection check failed${statusSuffix}.`,
        status
    );
}

module.exports = {
    ConnectionDiagnosticError,
    testAuthenticatedAccess,
    testPublicConnectivity,
};

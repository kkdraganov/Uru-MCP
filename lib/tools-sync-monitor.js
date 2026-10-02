/**
 * Tools Sync Monitor - schedules polls of GET /tools/sync/version
 *
 * Rules:
 * - Healthy (200 or 304): poll again after the normal interval (60 s default).
 * - Retryable (5xx, 429, network error, or any other unexpected status):
 *   back off with full jitter, random(0, min(cap, base * 2^n)), where n is the
 *   count of consecutive failures and base is the poll interval. The wait is
 *   never shorter than Retry-After and never longer than the cap (15 min).
 *   A healthy poll resets the backoff.
 * - Permanent refusal (401, 403, or 400 with workspace_required or
 *   workspace_id_invalid): stop for good. Polling cannot recover until the
 *   user fixes the key or the workspace and restarts the client.
 *
 * Only one timer exists at a time, and the next poll is scheduled only after
 * the current poll settles, so two polls never run at once.
 */

const DEFAULT_POLL_INTERVAL_MS = 60 * 1000;
const MAX_BACKOFF_MS = 15 * 60 * 1000;
const STOP_ON_400_CODES = new Set(['workspace_required', 'workspace_id_invalid']);

const STATE_IDLE = 'idle';
const STATE_RUNNING = 'running';
const STATE_HALTED = 'halted';

/**
 * Parse a response body into an object. Axios returns a string when the body
 * is not valid JSON or the server sent a non-JSON content type.
 * @param {unknown} data
 * @returns {Record<string, unknown> | null}
 */
function parseBody(data) {
    if (typeof data === 'string') {
        const text = data.trim();
        if (!text) {
            return null;
        }
        try {
            const parsed = JSON.parse(text);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }
    return data && typeof data === 'object' ? data : null;
}

/**
 * @param {unknown} value
 * @returns {string | null}
 */
function normalizeCode(value) {
    if (typeof value !== 'string') {
        return null;
    }
    // The code reaches a log line, so keep only short, plain identifier text.
    const code = value
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_')
        .replace(/[^a-z0-9_.:]/g, '')
        .slice(0, 64);
    return code || null;
}

/**
 * Read every error code an error body carries. Uru services use several
 * shapes: { code }, { error_code }, { error: 'code' }, { error: { code } },
 * { detail: { code } }, and { details: { code } }.
 * @param {unknown} data
 * @returns {string[]}
 */
function readErrorCodes(data) {
    const body = parseBody(data);
    if (!body) {
        return [];
    }
    const nestedCode = value =>
        value && typeof value === 'object' ? value.code : value;
    const candidates = [
        body.code,
        body.error_code,
        nestedCode(body.error),
        nestedCode(body.detail),
        body.details && typeof body.details === 'object' ? body.details.code : null,
    ];
    const codes = [];
    for (const candidate of candidates) {
        const code = normalizeCode(candidate);
        if (code && !codes.includes(code)) {
            codes.push(code);
        }
    }
    return codes;
}

/**
 * Read a header from a plain object or an AxiosHeaders instance.
 * @param {unknown} headers
 * @param {string} name lower-case header name
 * @returns {unknown}
 */
function readHeader(headers, name) {
    if (!headers || typeof headers !== 'object') {
        return undefined;
    }
    if (typeof headers.get === 'function') {
        const value = headers.get(name);
        if (value !== undefined && value !== null) {
            return value;
        }
    }
    for (const key of Object.keys(headers)) {
        if (key.toLowerCase() === name) {
            return headers[key];
        }
    }
    return undefined;
}

/**
 * Parse Retry-After (RFC 9110): delay in seconds or an HTTP date.
 * @param {unknown} value
 * @param {number} nowMs
 * @returns {number | null} milliseconds to wait, or null when absent/invalid
 */
function parseRetryAfterMs(value, nowMs) {
    const raw = Array.isArray(value) ? value[0] : value;
    if (raw === undefined || raw === null) {
        return null;
    }
    const text = String(raw).trim();
    if (!text) {
        return null;
    }
    if (/^\d+(\.\d+)?$/.test(text)) {
        return Math.round(Number(text) * 1000);
    }
    const dateMs = Date.parse(text);
    if (Number.isNaN(dateMs)) {
        return null;
    }
    return Math.max(0, dateMs - nowMs);
}

/**
 * Decide what one /tools/sync/version response means for the poll loop.
 * @param {{ status: number, data?: unknown, headers?: unknown }} response
 * @param {number} [nowMs]
 * @returns {{ action: 'ok', status: number }
 *   | { action: 'stop', status: number, code: string | null }
 *   | { action: 'retry', status: number, retryAfterMs: number | null }}
 */
function classifyToolsSyncResponse(response, nowMs = Date.now()) {
    const status = response.status;
    if (status === 200 || status === 304) {
        return { action: 'ok', status };
    }

    const codes = readErrorCodes(response.data);
    if (status === 401 || status === 403) {
        return { action: 'stop', status, code: codes[0] || null };
    }
    if (status === 400) {
        const code = codes.find(candidate => STOP_ON_400_CODES.has(candidate));
        if (code) {
            return { action: 'stop', status, code };
        }
    }

    return {
        action: 'retry',
        status,
        retryAfterMs: parseRetryAfterMs(readHeader(response.headers, 'retry-after'), nowMs),
    };
}

/**
 * Full-jitter backoff: random(0, min(cap, base * 2^failures)).
 * @param {number} failures consecutive failures, 1 for the first
 * @param {{ baseMs: number, capMs: number, random: () => number }} options
 * @returns {number}
 */
function computeBackoffMs(failures, { baseMs, capMs, random }) {
    const ceiling = Math.min(capMs, baseMs * 2 ** failures);
    return Math.floor(random() * ceiling);
}

/**
 * One clear line that tells the user why tool sync stopped and how to fix it.
 * @param {{ status: number, code: string | null }} outcome
 * @returns {string}
 */
function describeToolsSyncStop(outcome) {
    let cause;
    if (outcome.status === 401) {
        cause = 'the Uru API key is missing or was rejected (HTTP 401)';
    } else if (outcome.status === 403) {
        cause = outcome.code
            ? `Uru refused access (HTTP 403, ${outcome.code})`
            : 'Uru refused access (HTTP 403)';
    } else {
        cause = `the Uru workspace is missing or invalid (HTTP ${outcome.status}, ${outcome.code})`;
    }
    return `[Uru MCP] Tool sync stopped: ${cause}. Run \`uru mcp install --workspace <id>\` or fix URU_API_KEY, then restart your MCP client.`;
}

class ToolsSyncMonitor {
    /**
     * @param {object} options
     * @param {() => Promise<{ action: string, retryAfterMs?: number | null }>} options.poll
     * @param {number} [options.intervalMs]
     * @param {number} [options.maxBackoffMs]
     * @param {() => number} [options.random]
     * @param {(fn: () => void, ms: number) => unknown} [options.setTimer]
     * @param {(handle: unknown) => void} [options.clearTimer]
     * @param {(info: { outcome: object, delayMs: number, failures: number }) => void} [options.onRetry]
     * @param {(outcome: object) => void} [options.onStop]
     */
    constructor({
        poll,
        intervalMs = DEFAULT_POLL_INTERVAL_MS,
        maxBackoffMs = MAX_BACKOFF_MS,
        random = Math.random,
        setTimer = (fn, ms) => setTimeout(fn, ms),
        clearTimer = handle => clearTimeout(handle),
        onRetry = () => {},
        onStop = () => {},
    }) {
        this._poll = poll;
        this._intervalMs = intervalMs;
        // A long configured interval must not make failures poll faster.
        this._maxBackoffMs = Math.max(maxBackoffMs, intervalMs);
        this._random = random;
        this._setTimer = setTimer;
        this._clearTimer = clearTimer;
        this._onRetry = onRetry;
        this._onStop = onStop;

        this._state = STATE_IDLE;
        this._timer = null;
        this._inFlight = false;
        this._failures = 0;
    }

    get state() {
        return this._state;
    }

    get failures() {
        return this._failures;
    }

    /**
     * Poll now, then keep polling. No-op when already running or halted.
     */
    start() {
        if (this._state !== STATE_IDLE) {
            return;
        }
        this._state = STATE_RUNNING;
        void this._runPoll();
    }

    /**
     * Cancel the pending poll. A poll already in flight finishes but does not
     * schedule another.
     */
    stop() {
        if (this._state === STATE_RUNNING) {
            this._state = STATE_IDLE;
        }
        this._cancelTimer();
    }

    async _runPoll() {
        if (this._state !== STATE_RUNNING || this._inFlight) {
            return;
        }

        this._inFlight = true;
        let outcome;
        try {
            outcome = await this._poll();
        } catch (error) {
            outcome = { action: 'retry', status: null, retryAfterMs: null, error };
        } finally {
            this._inFlight = false;
        }

        if (this._state !== STATE_RUNNING) {
            return;
        }

        if (outcome && outcome.action === 'stop') {
            this._state = STATE_HALTED;
            this._cancelTimer();
            this._onStop(outcome);
            return;
        }

        if (outcome && outcome.action === 'retry') {
            this._failures += 1;
            const backoffMs = computeBackoffMs(this._failures, {
                baseMs: this._intervalMs,
                capMs: this._maxBackoffMs,
                random: this._random,
            });
            const retryAfterMs =
                typeof outcome.retryAfterMs === 'number' ? outcome.retryAfterMs : 0;
            const delayMs = Math.min(this._maxBackoffMs, Math.max(backoffMs, retryAfterMs));
            this._onRetry({ outcome, delayMs, failures: this._failures });
            this._schedule(delayMs);
            return;
        }

        this._failures = 0;
        this._schedule(this._intervalMs);
    }

    _schedule(delayMs) {
        this._cancelTimer();
        this._timer = this._setTimer(() => {
            this._timer = null;
            void this._runPoll();
        }, delayMs);
        if (this._timer && typeof this._timer.unref === 'function') {
            this._timer.unref();
        }
    }

    _cancelTimer() {
        if (this._timer !== null) {
            this._clearTimer(this._timer);
            this._timer = null;
        }
    }
}

module.exports = {
    DEFAULT_POLL_INTERVAL_MS,
    MAX_BACKOFF_MS,
    ToolsSyncMonitor,
    classifyToolsSyncResponse,
    computeBackoffMs,
    describeToolsSyncStop,
    parseRetryAfterMs,
    readErrorCodes,
};

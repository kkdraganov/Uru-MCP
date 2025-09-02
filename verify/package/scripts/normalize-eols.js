const fs = require('fs');
const path = require('path');

function listFiles(dir, filterFn) {
    const out = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            out.push(...listFiles(full, filterFn));
        } else if (filterFn(full)) {
            out.push(full);
        }
    }
    return out;
}

function normalizeFile(file) {
    const buf = fs.readFileSync(file);
    // replace CRLF with LF
    const content = buf.toString('utf8').replace(/\r\n/g, '\n');
    fs.writeFileSync(file, content, 'utf8');
}

(function main() {
    const root = path.resolve(__dirname, '..');
    const candidates = listFiles(root, f => {
        const rel = path.relative(root, f).replace(/\\/g, '/');
        if (rel.startsWith('node_modules/')) return false;
        if (rel.startsWith('.git/')) return false;
        return (
            rel.startsWith('bin/') ||
            rel.startsWith('lib/') ||
            rel.startsWith('scripts/') ||
            rel === 'index.js' ||
            rel.endsWith('.js')
        );
    });

    for (const file of candidates) {
        try {
            normalizeFile(file);
            // eslint-disable-next-line no-console
            console.log('[INFO] Normalized LF:', path.relative(root, file));
        } catch (e) {
            // eslint-disable-next-line no-console
            console.error('[WARNING] Failed to normalize', file, e && e.message);
        }
    }
})();


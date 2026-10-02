/**
 * Package version, read from package.json at runtime.
 *
 * npm always ships package.json in the tarball, so this is the one place the
 * version lives. The CLI, the MCP server info, and the User-Agent header all
 * read it from here.
 */

const { version } = require('../package.json');

const PACKAGE_VERSION = version;
const USER_AGENT = `Uru-MCP/${PACKAGE_VERSION}`;

module.exports = {
    PACKAGE_VERSION,
    USER_AGENT,
};

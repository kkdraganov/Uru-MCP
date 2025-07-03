# Uru MCP Proxy - Distribution Guide

This document outlines how to distribute and publish the Uru MCP Proxy package.

## 📦 Package Overview

The Uru MCP Proxy is now a standalone, distributable npm package that allows users to easily connect Claude Desktop to the Uru Platform with minimal configuration.

### Key Features

- **Single Command Installation**: `npx uru-mcp-proxy --setup`
- **Minimal Configuration**: Only requires authentication token
- **Fixed Proxy URL**: Always connects to `https://mcp.uruenterprises.com`
- **Interactive Setup**: Guided configuration wizard
- **Comprehensive Error Handling**: User-friendly error messages
- **Claude Desktop Integration**: Automatic configuration generation

## 🚀 Distribution Methods

### Method 1: NPM Registry (Recommended)

1. **Prepare for publishing:**
   ```bash
   cd mcp-proxy/claude-desktop
   npm install
   npm run test
   ```

2. **Publish to npm:**
   ```bash
   npm login
   npm publish
   ```

3. **Users can then install with:**
   ```bash
   npx uru-mcp-proxy --setup
   ```

### Method 2: GitHub Packages

1. **Configure package.json for GitHub:**
   ```json
   {
     "publishConfig": {
       "registry": "https://npm.pkg.github.com"
     }
   }
   ```

2. **Publish:**
   ```bash
   npm publish
   ```

### Method 3: Direct Distribution

Users can run directly from the repository:
```bash
npx github:JaxMoss/uru-workspace-platform/mcp-proxy/claude-desktop
```

## 🔧 Pre-Distribution Checklist

- [x] Package structure validated
- [x] All required files present
- [x] Configuration simplified (token-only)
- [x] CLI interface complete
- [x] Error handling implemented
- [x] Documentation written
- [x] License included
- [ ] Dependencies installed and tested
- [ ] Integration testing with Claude Desktop
- [ ] Version number finalized

## 📋 User Experience Flow

1. **Installation**: `npx uru-mcp-proxy --setup`
2. **Configuration**: Enter authentication token
3. **Testing**: `npx uru-mcp-proxy --test`
4. **Claude Setup**: `npx uru-mcp-proxy --claude-config`
5. **Usage**: Add to Claude Desktop and start using

## 🛠️ Maintenance

### Version Updates

Update version in `package.json` and publish:
```bash
npm version patch  # or minor/major
npm publish
```

### Dependency Updates

Keep dependencies current:
```bash
npm update
npm audit fix
```

## 📚 Support Documentation

### For End Users

- **README.md**: Complete installation and usage guide
- **CLI Help**: `npx uru-mcp-proxy --help`
- **Interactive Setup**: `npx uru-mcp-proxy --setup`

### For Developers

- **DISTRIBUTION.md**: This file
- **validate.js**: Package structure validation
- **test.js**: Functionality testing

## 🔒 Security Considerations

- **Token Handling**: Never log or expose authentication tokens
- **HTTPS Only**: All communication uses HTTPS
- **Environment Variables**: Secure token storage
- **No Hardcoded Secrets**: All sensitive data from environment

## 🌐 Backend Requirements

The proxy at `https://mcp.uruenterprises.com` must support:

- **Health Check**: `GET /health`
- **Tool Listing**: `POST /mcp/tools/list` (MCP protocol)
- **Tool Execution**: `POST /mcp/tools/execute` (MCP protocol)
- **Authentication**: Bearer token support

## 📈 Analytics & Monitoring

Consider adding:
- Usage analytics (with user consent)
- Error reporting
- Performance monitoring
- User feedback collection

## 🤝 Contributing

For contributors:
1. Fork the repository
2. Make changes in `mcp-proxy/claude-desktop/`
3. Run `node validate.js` to check structure
4. Submit pull request

## 📞 Support Channels

- **GitHub Issues**: Bug reports and feature requests
- **GitHub Discussions**: Community support
- **Documentation**: README.md and inline help

---

**Ready for Distribution**: ✅

The package is now ready to be distributed via npm or other channels. Users will be able to install and configure the Uru MCP Proxy with minimal effort.

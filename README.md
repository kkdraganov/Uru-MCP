# Uru MCP

A standalone MCP (Model Context Protocol) server that connects Claude Desktop to the Uru Platform, enabling seamless access to Uru's AI tools and capabilities directly within Claude Desktop.

## 🚀 Quick Start

### Installation & Setup

1. **Install and configure in one command:**
   ```bash
   npx uru-mcp --setup
   ```

2. **Test your connection:**
   ```bash
   npx uru-mcp --test
   ```

3. **Get Claude Desktop configuration:**
   ```bash
   npx uru-mcp --claude-config
   ```

4. **Add to Claude Desktop** (see [Claude Desktop Setup](#claude-desktop-setup) below)

5. **Start using Uru tools in Claude Desktop!**

## 📋 Requirements

- **Node.js 18+** (required)
- **Claude Desktop** (for MCP integration)
- **Uru Platform authentication token** (required)

## 🔧 Configuration

### Method 1: Interactive Setup (Recommended)

```bash
npx uru-mcp --setup
```

This will guide you through configuring:
- Authentication token (required)
- Debug mode preferences

### Method 2: Environment Variables

```bash
export URU_TOKEN="your-auth-token-here"
export URU_DEBUG="false"
```

### Method 3: Command Line Options

```bash
npx uru-mcp --token your-auth-token-here
```

## 🖥️ Claude Desktop Setup

### Step 1: Get Configuration

Run this command to see the exact configuration for your setup:

```bash
npx uru-mcp --claude-config
```

### Step 2: Add to Claude Desktop

1. **Find your Claude Desktop config file:**
   - **macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows:** `%APPDATA%\Claude\claude_desktop_config.json`
   - **Linux:** `~/.config/Claude/claude_desktop_config.json`

2. **Add the MCP server configuration:**

```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_TOKEN": "your-auth-token-here"
      }
    }
  }
}
```

3. **Restart Claude Desktop**

### Step 3: Verify Integration

1. Open Claude Desktop
2. Start a new conversation
3. Look for Uru tools in the available tools list
4. Try using a tool to confirm everything works

## 🛠️ Usage

### Available Commands

```bash
# Interactive setup wizard
npx uru-mcp --setup

# Test connection to backend
npx uru-mcp --test

# Show Claude Desktop configuration
npx uru-mcp --claude-config

# Start server with custom settings
npx uru-mcp --token your-token --debug

# Show help
npx uru-mcp --help
```

### Configuration Options

| Option | Environment Variable | Description |
|--------|---------------------|-------------|
| `--token` | `URU_TOKEN` | Authentication token |
| `--debug` | `URU_DEBUG` | Enable debug logging |

## 🔍 Troubleshooting

### Common Issues

**❌ "Cannot connect to proxy"**
- Verify your internet connection
- Test with: `npx uru-mcp --test`

**❌ "Authentication failed"**
- Verify your token is correct and hasn't expired
- Check if your token has the required permissions
- Reconfigure with: `npx uru-mcp --setup`

**❌ "Tools not appearing in Claude Desktop"**
- Restart Claude Desktop after configuration changes
- Check the MCP server configuration in Claude Desktop
- Verify the server is running: `npx uru-mcp --test`

**❌ "Proxy endpoint not found"**
- The proxy may be offline
- Contact your administrator

### Debug Mode

Enable debug mode for detailed logging:

```bash
# Via command line
npx uru-mcp --debug

# Via environment variable
URU_DEBUG=true npx uru-mcp
```

### Getting Help

1. **Check configuration:** `npx uru-mcp --claude-config`
2. **Test connection:** `npx uru-mcp --test`
3. **View help:** `npx uru-mcp --help`
4. **Enable debug mode:** `npx uru-mcp --debug`

## 🔒 Security

- **Tokens:** Never commit authentication tokens to version control
- **Environment Variables:** Use environment variables for sensitive data
- **Network:** Ensure your proxy uses HTTPS in production
- **Permissions:** Only grant necessary permissions to authentication tokens

## 📚 Advanced Usage

### Configuration File

The Uru MCP server automatically creates and manages a configuration file at `~/.uru-mcp.json` when you run the setup wizard. This file stores your authentication token and debug preferences.

You can manually edit this file if needed:

```json
{
  "token": "your-auth-token-here",
  "debug": false
}
```

## 🤝 Support

- **Documentation:** [GitHub Repository](https://github.com/kkdraganov/Uru-MCP)
- **Issues:** [Report Issues](https://github.com/kkdraganov/Uru-MCP/issues)
- **Discussions:** [GitHub Discussions](https://github.com/kkdraganov/Uru-MCP/discussions)

## 📄 License

Apache License 2.0 - see [LICENSE](LICENSE) file for details.

---

**Made with ❤️ by Uru Enterprises LLC**

# Migration Guide: API Key Authentication

This guide helps you migrate from the old server-level authentication to the new per-request API key authentication system.

## What Changed

The Uru MCP server now supports **two authentication methods**:

1. **Per-Request API Keys** (New, Recommended)
2. **Server-Level Configuration** (Legacy, Still Supported)

### Key Benefits of Per-Request Authentication

- ✅ **Enhanced Security**: API keys are not stored in configuration files
- ✅ **Multi-User Support**: Different API keys for different users/contexts
- ✅ **Better Isolation**: Each request is independently authenticated
- ✅ **Easier Key Rotation**: No server restart required to change keys
- ✅ **Flexible Deployment**: Same server can handle multiple API keys

## Migration Scenarios

### Scenario 1: Keep Current Setup (No Changes Required)

If you're happy with your current server-level authentication, **no changes are required**. Your existing configuration will continue to work exactly as before.

**Current Configuration (Still Works):**
```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

### Scenario 2: Migrate to Per-Request Authentication

To migrate to the new per-request authentication system:

#### Step 1: Update Claude Desktop Configuration

Remove the `env` section from your Claude Desktop configuration:

**Before:**
```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

**After:**
```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"]
    }
  }
}
```

#### Step 2: Remove Environment Variables (Optional)

If you set environment variables, you can remove them:

```bash
# Remove these if you set them
unset URU_API_KEY
unset URU_TOKEN
```

#### Step 3: Remove Config File (Optional)

If you have a config file, you can remove it:

```bash
rm ~/.uru-mcp.json
```

#### Step 4: Restart the MCP Server

Restart Claude Desktop or the MCP server to pick up the new configuration.

#### Step 5: Use API Keys in Tool Calls

Now provide your API key in each tool call:

```json
{
  "tool": "example-tool",
  "arguments": {
    "api_key": "your-api-key-here",
    "message": "Hello world",
    "other_param": "value"
  }
}
```

### Scenario 3: Hybrid Approach (Recommended)

Keep your server-level authentication as a fallback, but use per-request API keys when needed:

#### Configuration

Keep your existing Claude Desktop configuration:

```json
{
  "mcpServers": {
    "uru": {
      "command": "npx",
      "args": ["uru-mcp"],
      "env": {
        "URU_API_KEY": "default-api-key"
      }
    }
  }
}
```

#### Usage

**Regular tool calls (uses default key):**
```json
{
  "tool": "example-tool",
  "arguments": {
    "message": "Uses default API key"
  }
}
```

**Override with specific key:**
```json
{
  "tool": "example-tool",
  "arguments": {
    "api_key": "specific-api-key",
    "message": "Uses specific API key"
  }
}
```

## Testing Your Migration

### Test 1: Verify Server Starts

```bash
npx uru-mcp --test
```

This should show a successful connection regardless of your authentication method.

### Test 2: Check Tool Schemas

When you list tools in Claude Desktop, you should see:

- **With server-level auth**: `api_key` parameter is optional
- **Without server-level auth**: `api_key` parameter is required

### Test 3: Test Authentication

Try making a tool call:

- **With server-level auth**: Should work with or without `api_key` parameter
- **Without server-level auth**: Should only work with `api_key` parameter

## Troubleshooting

### "Authentication required" Error

**Cause**: No API key provided and no server-level authentication configured.

**Solution**: Either:
1. Add `api_key` parameter to your tool call, OR
2. Configure server-level authentication

### "Authentication failed" Error

**Cause**: The provided API key is invalid.

**Solution**: 
1. Check that your API key is correct
2. Verify the API key has necessary permissions
3. Try regenerating your API key

### Tools Don't Show `api_key` Parameter

**Cause**: Server-level authentication is configured.

**Solution**: This is expected behavior. The `api_key` parameter is optional when server-level auth exists.

### Server Won't Start

**Cause**: Configuration error or network issue.

**Solution**:
1. Run `npx uru-mcp --test` to diagnose
2. Check your network connection
3. Verify proxy URL is accessible

## Best Practices After Migration

### For Development
- Use per-request API keys for testing different scenarios
- Keep server-level auth as fallback for convenience

### For Production
- Use per-request API keys for better security
- Implement proper key rotation procedures
- Monitor API key usage

### For Multi-User Environments
- Use per-request API keys exclusively
- Each user should have their own API key
- Implement proper access controls

## Rollback Plan

If you need to rollback to the old authentication method:

1. **Restore your original Claude Desktop configuration** with the `env` section
2. **Restart Claude Desktop**
3. **Remove `api_key` parameters** from your tool calls

The server will automatically detect the server-level authentication and work as before.

## Support

If you encounter issues during migration:

1. **Check the logs**: Enable debug mode with `URU_DEBUG=true`
2. **Test connectivity**: Run `npx uru-mcp --test`
3. **Verify configuration**: Run `npx uru-mcp --claude-config`
4. **Review documentation**: See `AUTHENTICATION_GUIDE.md` for detailed examples

## Summary

The new authentication system provides:
- **Backward compatibility**: Existing setups continue to work
- **Enhanced security**: Per-request API keys offer better isolation
- **Flexibility**: Choose the authentication method that works best for you
- **Easy migration**: Gradual migration path available

Choose the approach that best fits your security requirements and usage patterns.

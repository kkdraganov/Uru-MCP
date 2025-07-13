# Uru MCP Comprehensive Test Suite Documentation

## Overview

The enhanced `test_client.js` is a comprehensive test suite that validates both standalone MCP server functionality and Claude Desktop integration compatibility. This test suite ensures that the Uru MCP server works correctly in isolation and integrates seamlessly with Claude Desktop.

## Features

### 🔍 Comprehensive Testing Coverage
- **Standalone MCP Server Testing**: Direct server validation without external dependencies
- **Claude Desktop Integration Testing**: Compatibility verification with Claude Desktop's MCP client
- **Protocol Compliance Testing**: MCP 2025-06-18 specification adherence validation
- **Performance and Reliability Testing**: Connection stability and error handling verification

### 🧪 Test Categories

#### 1. Connection & Protocol Tests
- **Server Startup**: Validates server initialization and basic responsiveness
- **Protocol Handshake**: Tests MCP protocol handshake and capability negotiation
- **Connection Establishment**: Verifies stable connection to the MCP server
- **Capability Negotiation**: Validates server capabilities and client compatibility

#### 2. Protocol Compliance Tests
- **JSON-RPC 2.0 Compliance**: Ensures proper JSON-RPC message format
- **Message Format Compliance**: Validates Claude Desktop expected message structures
- **Error Handling**: Tests proper error response formats and codes

#### 3. Tool Tests
- **Tool Discovery**: Discovers and lists all available tools
- **Tool Schema Validation**: Validates tool schemas for Claude Desktop compatibility
- **Tool Execution**: Tests actual tool functionality with various parameters
- **Parameter Validation**: Tests tool parameter validation and error handling

#### 4. Claude Desktop Integration Tests
- **Compatibility Verification**: Ensures the server works with Claude Desktop's MCP client
- **Message Format Validation**: Verifies proper JSON-RPC 2.0 message formatting
- **Error Response Testing**: Tests error handling expected by Claude Desktop

#### 5. Performance & Reliability Tests
- **Connection Stability**: Tests multiple rapid requests and connection resilience
- **Timeout Handling**: Validates proper timeout behavior
- **Error Recovery**: Tests graceful error handling and recovery

#### 6. Feature Tests
- **Gmail Email Test**: Priority test for Uru Platform's email functionality
- **Resource Test**: Tests MCP resources feature (if available)
- **Prompt Test**: Tests MCP prompts feature (if available)

## Usage

### Basic Usage
```bash
# Run comprehensive tests
node test_client.js --key YOUR_API_KEY_HERE

# Run with debug logging
node test_client.js --key YOUR_API_KEY_HERE --debug

# Run with custom timeout
node test_client.js --key YOUR_API_KEY_HERE --timeout 60000

# Use local proxy for development
node test_client.js --key YOUR_API_KEY_HERE --local
```

### Advanced Usage
```bash
# Focus on Claude Desktop integration tests
node test_client.js --key YOUR_API_KEY_HERE --test-mode integration

# Run quick tests only (skip optional features)
node test_client.js --key YOUR_API_KEY_HERE --quick

# Run standalone server tests
node test_client.js --key YOUR_API_KEY_HERE --test-mode standalone

# Run with specific API key for testing
node test_client.js --key uru_14edb191569cfb3618859094b004451eedc35ff1a6ca23a576055f6ff8c55664 --local
```

### Test Modes

#### Comprehensive Mode (Default)
- Runs all available tests including hierarchical namespace system
- Includes optional feature testing (resources, prompts)
- Provides complete validation coverage with performance metrics
- Tests dynamic tool registry and intelligent tool loader

#### Integration Mode
- Focuses on Claude Desktop compatibility
- Emphasizes protocol compliance with MCP 2025-06-18 specification
- Tests message format compatibility and error handling
- Validates hierarchical tool discovery workflow

#### Standalone Mode
- Tests server functionality in isolation
- Minimal external dependencies
- Core functionality validation including namespace management
- Direct MCP server testing without client simulation

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-k, --key <key>` | Uru Platform API key | Required |
| `-d, --debug` | Enable debug logging | false |
| `--timeout <ms>` | Connection timeout in milliseconds | 30000 |
| `--test-mode <mode>` | Test mode: standalone, integration, comprehensive | comprehensive |
| `--quick` | Run quick tests only | false |
| `--claude-desktop` | Focus on Claude Desktop integration | false |

## Exit Codes

- **0**: All tests passed successfully - Server is ready for production
- **1**: Critical tests failed or errors detected - Server needs attention

## Test Results Interpretation

### Success Indicators
- ✅ **All Tests Passed**: Server is fully operational and Claude Desktop compatible
- ⚠️ **Mostly Successful**: Critical tests passed, minor issues with optional features
- ❌ **Significant Issues**: Critical tests failed, server needs attention

### Critical Tests
The following tests must pass for Claude Desktop integration:
- Connection establishment
- Tool discovery
- Claude Desktop compatibility
- JSON-RPC compliance

### Performance Metrics
The test suite provides detailed performance metrics:
- Connection time
- Tool discovery time
- Tool execution time
- Total test time
- Error and warning counts

## Integration with CI/CD

The test suite is designed for CI/CD integration:

```yaml
# Example GitHub Actions workflow
- name: Test MCP Server
  run: node test_client.js --key ${{ secrets.URU_API_KEY }} --quick
  env:
    URU_API_KEY: ${{ secrets.URU_API_KEY }}
```

## Troubleshooting

### Common Issues

#### Connection Failures
- Verify URU_TOKEN is valid and has proper permissions
- Check network connectivity to Uru Platform
- Ensure MCP server is properly installed

#### Tool Discovery Issues
- Verify server has tools configured
- Check server logs for initialization errors
- Validate proxy connectivity

#### Claude Desktop Integration Issues
- Ensure JSON-RPC 2.0 compliance
- Verify message format compatibility
- Check error response formats

### Debug Mode
Enable debug mode for detailed logging:
```bash
node test_client.js --key YOUR_API_KEY_HERE --debug
```

Debug mode provides:
- Detailed connection information
- Server stderr output
- Full tool schemas
- Complete error stack traces

## Best Practices

1. **Regular Testing**: Run tests after any server configuration changes
2. **CI Integration**: Include tests in your deployment pipeline
3. **Debug Logging**: Use debug mode when troubleshooting issues
4. **Token Security**: Never commit tokens to version control
5. **Timeout Adjustment**: Increase timeout for slow network connections

## Support

For issues with the test suite:
1. Run with `--debug` flag for detailed information
2. Check server logs for additional context
3. Verify all prerequisites are met
4. Review the test results for specific failure points

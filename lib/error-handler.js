/**
 * Error Handler for Uru MCP Proxy
 * 
 * Provides comprehensive error handling and user-friendly error messages
 * for common setup and runtime issues.
 */

const chalk = require('chalk');

class ErrorHandler {
  /**
   * Handle and format errors with user-friendly messages
   */
  static handleError(error, context = 'general') {
    const errorInfo = this.analyzeError(error, context);
    
    console.error(chalk.red('❌ Error:'), errorInfo.message);
    
    if (errorInfo.suggestions.length > 0) {
      console.error(chalk.yellow('\n💡 Suggestions:'));
      errorInfo.suggestions.forEach((suggestion, index) => {
        console.error(chalk.yellow(`   ${index + 1}. ${suggestion}`));
      });
    }
    
    if (errorInfo.showOriginal && error.stack) {
      console.error(chalk.gray('\n🔍 Technical details:'));
      console.error(chalk.gray(error.stack));
    }
    
    return errorInfo;
  }

  /**
   * Analyze error and provide context-specific guidance
   */
  static analyzeError(error, context) {
    const result = {
      message: error.message,
      suggestions: [],
      showOriginal: false,
      exitCode: 1
    };

    // Network-related errors
    if (error.code === 'ECONNREFUSED') {
      result.message = 'Cannot connect to the Uru MCP Proxy server';
      result.suggestions = [
        'Check if the proxy URL is correct',
        'Verify the proxy server is running',
        'Check your internet connection',
        'Try running: npx uru-mcp-proxy --test'
      ];
    } else if (error.code === 'ENOTFOUND') {
      result.message = 'Proxy server hostname could not be resolved';
      result.suggestions = [
        'Check if the proxy URL is spelled correctly',
        'Verify you have internet access',
        'Try using an IP address instead of hostname',
        'Run: npx uru-mcp-proxy --setup to reconfigure'
      ];
    } else if (error.code === 'ETIMEDOUT') {
      result.message = 'Connection to proxy server timed out';
      result.suggestions = [
        'Check your internet connection',
        'The proxy server might be overloaded',
        'Try again in a few minutes',
        'Increase timeout with URU_TIMEOUT environment variable'
      ];
    }

    // HTTP status errors
    else if (error.response?.status === 401) {
      result.message = 'Authentication failed - invalid or missing token';
      result.suggestions = [
        'Check if your authentication token is correct',
        'Run: npx uru-mcp-proxy --setup to reconfigure',
        'Contact your administrator for a valid token',
        'Verify the token hasn\'t expired'
      ];
    } else if (error.response?.status === 403) {
      result.message = 'Access forbidden - insufficient permissions';
      result.suggestions = [
        'Your token may not have the required permissions',
        'Contact your administrator to grant MCP access',
        'Verify you\'re using the correct backend URL'
      ];
    } else if (error.response?.status === 404) {
      result.message = 'Proxy endpoint not found';
      result.suggestions = [
        'The proxy may not support MCP functionality',
        'Check if you\'re using the correct proxy URL',
        'Verify the proxy version supports MCP',
        'Contact your administrator for assistance'
      ];
    } else if (error.response?.status >= 500) {
      result.message = 'Proxy server error';
      result.suggestions = [
        'The proxy server is experiencing issues',
        'Try again in a few minutes',
        'Contact your administrator if the problem persists',
        'Check proxy server logs for more details'
      ];
    }

    // Configuration errors
    else if (error.message.includes('Invalid proxy URL')) {
      result.suggestions = [
        'Ensure the URL starts with http:// or https://',
        'Check for typos in the URL',
        'Run: npx uru-mcp-proxy --setup to reconfigure'
      ];
    } else if (error.message.includes('Authentication token is required')) {
      result.suggestions = [
        'Run: npx uru-mcp-proxy --setup to configure',
        'Set URU_TOKEN environment variable',
        'Use --token command line option'
      ];
    }

    // MCP-specific errors
    else if (context === 'mcp' && error.message.includes('transport')) {
      result.message = 'MCP transport connection failed';
      result.suggestions = [
        'Ensure Claude Desktop is properly configured',
        'Check the MCP server configuration in Claude Desktop',
        'Restart Claude Desktop and try again',
        'Run: npx uru-mcp-proxy --claude-config for setup help'
      ];
    }

    // File system errors
    else if (error.code === 'EACCES') {
      result.message = 'Permission denied accessing configuration file';
      result.suggestions = [
        'Check file permissions in your home directory',
        'Try running with appropriate permissions',
        'Ensure the configuration directory is writable'
      ];
    } else if (error.code === 'ENOENT' && error.path) {
      result.message = `File or directory not found: ${error.path}`;
      result.suggestions = [
        'Check if the path exists and is accessible',
        'Verify file permissions',
        'Try creating the directory manually'
      ];
    }

    // Generic errors - show more details
    else {
      result.showOriginal = true;
      result.suggestions = [
        'Try running with --debug for more information',
        'Check the troubleshooting guide in the documentation',
        'Report this issue if it persists'
      ];
    }

    return result;
  }

  /**
   * Handle validation errors
   */
  static handleValidationError(field, value, requirements) {
    console.error(chalk.red(`❌ Invalid ${field}: ${value}`));
    console.error(chalk.yellow('Requirements:'));
    requirements.forEach((req, index) => {
      console.error(chalk.yellow(`   ${index + 1}. ${req}`));
    });
  }

  /**
   * Handle warnings (non-fatal issues)
   */
  static handleWarning(message, suggestions = []) {
    console.warn(chalk.yellow('⚠️  Warning:'), message);
    if (suggestions.length > 0) {
      console.warn(chalk.yellow('💡 Suggestions:'));
      suggestions.forEach((suggestion, index) => {
        console.warn(chalk.yellow(`   ${index + 1}. ${suggestion}`));
      });
    }
  }

  /**
   * Create user-friendly error for common issues
   */
  static createUserError(type, details = {}) {
    const errors = {
      'missing-config': {
        message: 'No configuration found',
        suggestions: [
          'Run: npx uru-mcp-proxy --setup',
          'Set environment variables (URU_BACKEND_URL, URU_TOKEN)',
          'Use command line options (--backend-url, --token)'
        ]
      },
      'invalid-url': {
        message: `Invalid URL: ${details.url}`,
        suggestions: [
          'URL must start with http:// or https://',
          'Check for typos in the URL',
          'Example: https://api.uruenterprises.com'
        ]
      },
      'connection-failed': {
        message: 'Failed to connect to proxy',
        suggestions: [
          'Check your internet connection',
          'Verify the proxy URL is correct',
          'Run: npx uru-mcp-proxy --test'
        ]
      }
    };

    const errorInfo = errors[type] || {
      message: 'Unknown error occurred',
      suggestions: ['Contact support for assistance']
    };

    const error = new Error(errorInfo.message);
    error.suggestions = errorInfo.suggestions;
    return error;
  }
}

module.exports = ErrorHandler;

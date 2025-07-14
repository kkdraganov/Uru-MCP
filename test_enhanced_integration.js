#!/usr/bin/env node

/**
 * Enhanced Integration Test for Uru MCP Server
 * 
 * Tests the complete flow with enhanced namespace discovery and routing:
 * 1. Namespace discovery using /namespaces endpoint
 * 2. Tool listing for specific namespaces
 * 3. Tool execution with proper account routing
 */

const UruMCPServer = require('./lib/mcp-server');
const ConfigManager = require('./lib/config-manager');

async function testEnhancedIntegration() {
  console.log('🧪 Starting Enhanced Integration Test for Uru MCP Server');
  console.log('=' .repeat(60));

  try {
    // Load configuration
    const configManager = new ConfigManager();
    const config = await configManager.loadConfig();
    
    // Override with test configuration
    config.proxyUrl = process.env.TEST_PROXY_URL || 'http://localhost:3001';
    config.token = process.env.URU_API_KEY || 'uru_14edb191569cfb3618859094b004451eedc35ff1a6ca23a576055f6ff8c55664';
    config.debug = true;

    console.log(`📡 Testing with proxy: ${config.proxyUrl}`);
    console.log(`🔑 Using API key: ${config.token.substring(0, 20)}...`);

    // Create server instance
    const server = new UruMCPServer(config);

    // Test 1: Enhanced Namespace Discovery
    console.log('\n🔍 Test 1: Enhanced Namespace Discovery');
    console.log('-'.repeat(40));
    
    try {
      const namespaces = await server.namespaceManager.fetchNamespacesFromProxy(config.token);
      console.log(`✅ Found ${namespaces.length} namespaces:`);
      
      for (const namespace of namespaces) {
        console.log(`   📦 ${namespace.name} (${namespace.displayName || namespace.name})`);
        console.log(`      Account: ${namespace.account_label || 'N/A'}`);
        console.log(`      Connected Account ID: ${namespace.connected_account_id}`);
        console.log(`      Status: ${namespace.connection_status}`);
      }
    } catch (error) {
      console.log(`⚠️ Enhanced namespace discovery failed: ${error.message}`);
      console.log('   Falling back to legacy app discovery...');
      
      const apps = await server.namespaceManager.fetchAppsFromProxy(config.token);
      console.log(`✅ Found ${apps.length} apps: ${apps.join(', ')}`);
    }

    // Test 2: Tool Discovery for Specific Namespace
    console.log('\n🔧 Test 2: Tool Discovery for Gmail Work Kal');
    console.log('-'.repeat(40));
    
    try {
      const testNamespace = 'gmail_work_kal';
      const metadata = server.namespaceManager.getNamespaceMetadata(testNamespace);
      
      if (metadata) {
        console.log(`✅ Found metadata for ${testNamespace}:`);
        console.log(`   Connected Account ID: ${metadata.connected_account_id}`);
        console.log(`   Server ID: ${metadata.server_id}`);
      } else {
        console.log(`⚠️ No metadata found for ${testNamespace}`);
      }

      // Load tools for the namespace
      await server.toolLoader.loadNamespace(testNamespace, config.token);
      const tools = server.toolRegistry.getNamespaceTools(testNamespace);
      
      console.log(`✅ Loaded ${tools.length} tools for ${testNamespace}:`);
      tools.slice(0, 5).forEach(tool => {
        console.log(`   🔧 ${tool.name}: ${tool.description}`);
      });
      
      if (tools.length > 5) {
        console.log(`   ... and ${tools.length - 5} more tools`);
      }
    } catch (error) {
      console.log(`❌ Tool discovery failed: ${error.message}`);
    }

    // Test 3: Tool Execution with Enhanced Routing
    console.log('\n⚡ Test 3: Tool Execution with Enhanced Routing');
    console.log('-'.repeat(40));
    
    try {
      // Test with a namespace that has connection metadata
      const testTool = 'googlecalendar_26fa5c56.GOOGLECALENDAR_LIST_EVENTS';
      console.log(`🔧 Testing tool execution with connection metadata: ${testTool}`);

      const result = await server.handleNamespacedToolExecution(testTool, {}, config.token);
      console.log(`✅ Tool execution successful:`);
      console.log(`   Result: ${JSON.stringify(result, null, 2)}`);
    } catch (error) {
      console.log(`❌ Tool execution failed: ${error.message}`);

      // Try a fallback test with gmail (no connection metadata)
      try {
        console.log('🔄 Trying fallback tool execution with gmail...');
        const fallbackTool = 'gmail_work_kal.GMAIL_GET_PROFILE';
        const fallbackResult = await server.handleNamespacedToolExecution(fallbackTool, {}, config.token);
        console.log(`✅ Fallback tool execution successful:`);
        console.log(`   Result: ${JSON.stringify(fallbackResult, null, 2)}`);
      } catch (fallbackError) {
        console.log(`❌ Fallback tool execution also failed: ${fallbackError.message}`);

        // Try platform tool as final fallback
        try {
          console.log('🔄 Trying platform tool as final fallback...');
          const platformTool = 'platform.list_users';
          const platformResult = await server.handleNamespacedToolExecution(platformTool, {}, config.token);
          console.log(`✅ Platform tool execution successful:`);
          console.log(`   Result: ${JSON.stringify(platformResult, null, 2)}`);
        } catch (platformError) {
          console.log(`❌ Platform tool execution also failed: ${platformError.message}`);
        }
      }
    }

    // Test 4: Connection Metadata Validation
    console.log('\n🔗 Test 4: Connection Metadata Validation');
    console.log('-'.repeat(40));
    
    const testNamespaces = ['gmail_work_kal', 'googlecalendar_26fa5c56', 'googledrive_665c9340'];
    
    for (const namespace of testNamespaces) {
      const metadata = server.namespaceManager.getNamespaceMetadata(namespace);
      if (metadata) {
        console.log(`✅ ${namespace}:`);
        console.log(`   Connected Account ID: ${metadata.connected_account_id}`);
        console.log(`   Connection Status: ${metadata.connection_status}`);
      } else {
        console.log(`⚠️ ${namespace}: No metadata found`);
      }
    }

    console.log('\n🎉 Enhanced Integration Test Complete!');
    console.log('=' .repeat(60));

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.stack) {
      console.error('Stack trace:', error.stack);
    }
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testEnhancedIntegration().catch(error => {
    console.error('❌ Unexpected error:', error.message);
    process.exit(1);
  });
}

module.exports = testEnhancedIntegration;

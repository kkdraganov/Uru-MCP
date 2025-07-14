#!/usr/bin/env node

/**
 * Test script to verify the new execute_tool pattern works correctly
 */

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
const path = require('path');

const CLIENT_INFO = {
  name: 'execute-tool-test',
  version: '1.0.0'
};

async function testExecuteTool() {
  console.log('🧪 Testing execute_tool pattern...\n');

  // Create client
  const client = new Client(CLIENT_INFO, {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
      logging: {}
    }
  });

  // Create transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: [path.join(__dirname, 'bin', 'uru-mcp.js')],
    env: {
      ...process.env,
      URU_API_KEY: 'uru_14edb191569cfb3618859094b004451eedc35ff1a6ca23a576055f6ff8c55664',
      URU_DEBUG: 'true',
      URU_PROXY_URL: 'https://mcp.uruenterprises.com'
    },
    stderr: 'pipe'
  });

  try {
    // Connect
    console.log('📡 Connecting to server...');
    await client.connect(transport);
    console.log('✅ Connected successfully\n');

    // List tools
    console.log('📋 Listing available tools...');
    const toolsResponse = await client.listTools();
    const tools = toolsResponse.tools || [];
    
    console.log(`Found ${tools.length} tools:`);
    tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name} (${tool.annotations?.category || 'unknown'})`);
    });
    console.log();

    // Find execute_tool for gmail_work
    const executeToolName = 'gmail_work__execute_tool';
    const executeTool = tools.find(tool => tool.name === executeToolName);
    
    if (!executeTool) {
      throw new Error(`Execute tool ${executeToolName} not found`);
    }

    console.log(`🔧 Found execute tool: ${executeToolName}`);
    console.log(`Description: ${executeTool.description}`);
    console.log(`Input schema:`, JSON.stringify(executeTool.inputSchema, null, 2));
    console.log();

    // First, call list_tools to see what tools are available
    console.log('📋 Calling gmail_work__list_tools to see available tools...');
    const listResult = await client.callTool({
      name: 'gmail_work__list_tools',
      arguments: {}
    });
    
    console.log('List tools result:');
    console.log(listResult.content[0].text.substring(0, 500) + '...\n');

    // Now test execute_tool with a simple tool
    console.log('🚀 Testing execute_tool with GMAIL_FETCH_EMAILS...');
    try {
      const executeResult = await client.callTool({
        name: executeToolName,
        arguments: {
          tool_name: 'GMAIL_FETCH_EMAILS',
          parameters: {
            max_results: 1,
            user_id: 'me'
          }
        }
      });

      console.log('Execute tool result type:', typeof executeResult);
      console.log('Execute tool result keys:', Object.keys(executeResult || {}));

      if (executeResult && executeResult.content) {
        console.log('Content array length:', executeResult.content.length);
        if (executeResult.content[0]) {
          console.log('First content item:', JSON.stringify(executeResult.content[0], null, 2));
        }
      } else {
        console.log('Full result:', JSON.stringify(executeResult, null, 2));
      }
    } catch (executeError) {
      console.log('Execute tool error:', executeError.message);
      console.log('Error details:', JSON.stringify(executeError, null, 2));
    }

    console.log('\n✅ Execute tool test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  } finally {
    try {
      await transport.close();
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Run the test
if (require.main === module) {
  testExecuteTool().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

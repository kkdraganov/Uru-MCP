#!/usr/bin/env node

/**
 * Debug Response Format Test
 * 
 * This script tests the actual response format from the Uru MCP server
 * to verify if the text field is being preserved correctly.
 */

const { spawn } = require('child_process');
const path = require('path');

async function testResponseFormat() {
  console.log('🔍 Testing Uru MCP Server Response Format...\n');

  // Test request for Gmail tool
  const testRequest = {
    jsonrpc: '2.0',
    id: 'debug-test',
    method: 'tools/call',
    params: {
      name: 'gmail_f7518884.list_tools',
      arguments: {
        api_key: 'uru_8d51c4379735aab3b70fed88d17934e62834fae9e79e623aaa925c7c713ded4d'
      }
    }
  };

  return new Promise((resolve, reject) => {
    // Start the MCP server
    const serverProcess = spawn('node', ['./bin/uru-mcp.js'], {
      cwd: __dirname,
      env: {
        ...process.env,
        URU_PROXY_URL: 'http://localhost:3001',
        URU_API_KEY: 'uru_8d51c4379735aab3b70fed88d17934e62834fae9e79e623aaa925c7c713ded4d'
      },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let responseData = '';
    let errorData = '';

    // Send the test request
    serverProcess.stdin.write(JSON.stringify(testRequest) + '\n');
    serverProcess.stdin.end();

    // Collect response data
    serverProcess.stdout.on('data', (data) => {
      responseData += data.toString();
    });

    // Collect error data (server logs)
    serverProcess.stderr.on('data', (data) => {
      errorData += data.toString();
    });

    // Handle process completion
    serverProcess.on('close', (code) => {
      console.log('📋 Server Logs:');
      console.log(errorData);
      console.log('\n📊 Raw Response:');
      console.log(responseData);

      try {
        // Parse the JSON response
        const lines = responseData.trim().split('\n');
        const lastLine = lines[lines.length - 1];
        const response = JSON.parse(lastLine);

        console.log('\n🔍 Parsed Response Structure:');
        console.log(JSON.stringify(response, null, 2));

        // Check if text field exists
        if (response.result && response.result.content && response.result.content[0]) {
          const content = response.result.content[0];
          console.log('\n✅ Content Object:');
          console.log(`  - type: ${content.type}`);
          console.log(`  - text field exists: ${content.hasOwnProperty('text')}`);
          console.log(`  - text length: ${content.text ? content.text.length : 'N/A'}`);
          
          if (content.text) {
            console.log(`  - text preview: ${content.text.substring(0, 200)}...`);
          }
        } else {
          console.log('\n❌ No content array found in response');
        }

        resolve(response);
      } catch (error) {
        console.log('\n❌ Failed to parse response:', error.message);
        reject(error);
      }
    });

    // Handle process errors
    serverProcess.on('error', (error) => {
      console.error('❌ Process error:', error.message);
      reject(error);
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      serverProcess.kill();
      reject(new Error('Test timeout'));
    }, 30000);
  });
}

// Run the test
testResponseFormat()
  .then(() => {
    console.log('\n✅ Response format test completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  });

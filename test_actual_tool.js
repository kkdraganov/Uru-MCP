#!/usr/bin/env node

/**
 * Test actual tool execution (not list tools) with server prefix
 */

const { spawn } = require('child_process');
const readline = require('readline');

async function testActualToolExecution() {
  console.log('🧪 Testing ACTUAL tool execution with uru: prefix...\n');

  // Start the MCP server
  const serverProcess = spawn('node', ['index.js'], {
    env: {
      ...process.env,
      URU_API_KEY: 'uru_14edb191569cfb3618859094b004451eedc35ff1a6ca23a576055f6ff8c55664',
      URU_PROXY_URL: 'https://mcp.uruenterprises.com',
      URU_DEBUG: 'true'
    },
    stdio: ['pipe', 'pipe', 'pipe']
  });

  const rl = readline.createInterface({
    input: serverProcess.stdout,
    output: process.stdout,
    terminal: false
  });

  let responses = [];
  
  rl.on('line', (line) => {
    try {
      const response = JSON.parse(line);
      responses.push(response);
      console.log('📨 Server response:', JSON.stringify(response, null, 2));
    } catch (e) {
      console.log('📝 Server log:', line);
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log('🔍 Server stderr:', data.toString());
  });

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 2000));

  try {
    // Step 1: Initialize
    console.log('\n📡 Step 1: Initializing MCP connection...');
    const initRequest = {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        clientInfo: { name: 'test-client', version: '1.0.0' }
      }
    };
    
    serverProcess.stdin.write(JSON.stringify(initRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Step 2: Load company namespace first
    console.log('\n📋 Step 2: Loading company namespace...');
    const loadRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'company__list_tools',
        arguments: {}
      }
    };
    
    serverProcess.stdin.write(JSON.stringify(loadRequest) + '\n');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 3: Test actual tool WITHOUT prefix
    console.log('\n🔧 Step 3: Testing Transcript_Log_Query WITHOUT uru: prefix...');
    const callRequest1 = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'company__Transcript_Log_Query',
        arguments: {
          input: 'test query for transcripts'
        }
      }
    };
    
    serverProcess.stdin.write(JSON.stringify(callRequest1) + '\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Step 4: Test actual tool WITH prefix (this is what Claude does!)
    console.log('\n🔧 Step 4: Testing Transcript_Log_Query WITH uru: prefix...');
    const callRequest2 = {
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'uru:company__Transcript_Log_Query',
        arguments: {
          input: 'test query for transcripts with prefix'
        }
      }
    };
    
    serverProcess.stdin.write(JSON.stringify(callRequest2) + '\n');
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Analyze results
    console.log('\n📊 ANALYSIS:');
    const step3Response = responses.find(r => r.id === 3);
    const step4Response = responses.find(r => r.id === 4);

    console.log('\n🔍 Step 3 Response (without prefix):');
    if (step3Response && !step3Response.error) {
      console.log('✅ Tool execution without prefix: SUCCESS');
      console.log('📄 Response type:', step3Response.result?.content?.[0]?.type || 'unknown');
    } else {
      console.log('❌ Tool execution without prefix: FAILED');
      if (step3Response?.error) console.log('   Error:', step3Response.error.message);
    }

    console.log('\n🔍 Step 4 Response (with uru: prefix):');
    if (step4Response && !step4Response.error) {
      console.log('✅ Tool execution with uru: prefix: SUCCESS');
      console.log('📄 Response type:', step4Response.result?.content?.[0]?.type || 'unknown');
      console.log('🎉 ACTUAL TOOL EXECUTION WITH PREFIX WORKS!');
    } else {
      console.log('❌ Tool execution with uru: prefix: FAILED');
      if (step4Response?.error) console.log('   Error:', step4Response.error.message);
      console.log('❌ ACTUAL TOOL EXECUTION WITH PREFIX STILL BROKEN');
    }

    // Compare responses
    if (step3Response && step4Response && !step3Response.error && !step4Response.error) {
      const response3Text = step3Response.result?.content?.[0]?.text || '';
      const response4Text = step4Response.result?.content?.[0]?.text || '';
      
      if (response3Text === response4Text) {
        console.log('\n✅ Both responses are identical - prefix stripping works perfectly!');
      } else {
        console.log('\n⚠️ Responses differ - there might be an issue');
      }
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    serverProcess.kill();
  }
}

testActualToolExecution().catch(console.error);

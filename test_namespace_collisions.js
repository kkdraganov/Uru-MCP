#!/usr/bin/env node

/**
 * Test script to verify the improvements made to the Uru MCP Server
 */

const UruMCPServer = require('./lib/mcp-server');
const { ToolNamespaceManager } = require('./lib/namespace-manager');
const chalk = require('chalk');

async function testImprovements() {
  console.log(chalk.blue.bold('🧪 Testing Uru MCP Server Improvements'));
  console.log('='.repeat(50));

  let testsPassed = 0;
  let testsTotal = 0;

  // Test 1: Configuration Validation
  testsTotal++;
  console.log(chalk.cyan('\n1. Testing Configuration Validation...'));
  try {
    // Should throw error for missing config
    try {
      new UruMCPServer();
      console.log(chalk.red('❌ Should have thrown error for missing config'));
    } catch (error) {
      console.log(chalk.green('✅ Correctly validates missing config'));
      testsPassed++;
    }
  } catch (error) {
    console.log(chalk.red(`❌ Unexpected error: ${error.message}`));
  }

  // Test 2: Namespace Collision Prevention
  testsTotal++;
  console.log(chalk.cyan('\n2. Testing Namespace Collision Prevention...'));
  try {
    const namespaceManager = new ToolNamespaceManager({
      proxyUrl: 'http://localhost:3001',
      token: 'test-token'
    });

    // Test collision detection
    const ns1 = namespaceManager.normalizeNamespace('Gmail Work-Kal');
    const ns2 = namespaceManager.normalizeNamespace('Gmail Work_Kal');
    const ns3 = namespaceManager.normalizeNamespace('Gmail Work Kal');

    console.log(`  "Gmail Work-Kal" → "${ns1}"`);
    console.log(`  "Gmail Work_Kal" → "${ns2}"`);
    console.log(`  "Gmail Work Kal" → "${ns3}"`);

    if (ns1 !== ns2 || ns2 !== ns3) {
      console.log(chalk.green('✅ Namespace collision prevention working'));
      testsPassed++;
    } else {
      console.log(chalk.red('❌ Namespace collision prevention not working'));
    }
  } catch (error) {
    console.log(chalk.red(`❌ Error testing namespace collision: ${error.message}`));
  }

  // Test 3: Test Mode Support
  testsTotal++;
  console.log(chalk.cyan('\n3. Testing Test Mode Support...'));
  try {
    const config = {
      proxyUrl: 'http://localhost:3001',
      token: 'test-token',
      testMode: true,
      debug: false
    };

    const server = new UruMCPServer(config);
    console.log(chalk.green('✅ Test mode configuration accepted'));
    testsPassed++;
  } catch (error) {
    console.log(chalk.red(`❌ Error testing test mode: ${error.message}`));
  }

  // Test 4: URL Validation
  testsTotal++;
  console.log(chalk.cyan('\n4. Testing URL Validation...'));
  try {
    try {
      new UruMCPServer({
        proxyUrl: 'invalid-url',
        token: 'test-token'
      });
      console.log(chalk.red('❌ Should have thrown error for invalid URL'));
    } catch (error) {
      if (error.message.includes('Invalid proxy URL format')) {
        console.log(chalk.green('✅ Correctly validates URL format'));
        testsPassed++;
      } else {
        console.log(chalk.red(`❌ Wrong error type: ${error.message}`));
      }
    }
  } catch (error) {
    console.log(chalk.red(`❌ Unexpected error: ${error.message}`));
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log(chalk.bold(`📊 Test Results: ${testsPassed}/${testsTotal} tests passed`));
  
  if (testsPassed === testsTotal) {
    console.log(chalk.green.bold('🎉 All improvements working correctly!'));
    process.exit(0);
  } else {
    console.log(chalk.red.bold('💥 Some improvements need attention'));
    process.exit(1);
  }
}

// Run tests
testImprovements().catch(error => {
  console.error(chalk.red('❌ Test execution failed:'), error.message);
  process.exit(1);
});

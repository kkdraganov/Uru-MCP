#!/usr/bin/env node

/**
 * Package validation script for Uru MCP Proxy
 * 
 * Validates the package structure without requiring dependencies
 */

const fs = require('fs');
const path = require('path');

function validatePackageStructure() {
  console.log('🔍 Validating Uru MCP Proxy package structure...\n');

  let passed = 0;
  let failed = 0;

  // Required files
  const requiredFiles = [
    'package.json',
    'README.md',
    'LICENSE',
    'index.js',
    'bin/uru-mcp-proxy.js',
    'lib/mcp-server.js',
    'lib/config-manager.js',
    'lib/error-handler.js',
    'scripts/postinstall.js'
  ];

  console.log('📁 Checking required files:');
  for (const file of requiredFiles) {
    if (fs.existsSync(file)) {
      console.log(`✅ ${file}`);
      passed++;
    } else {
      console.log(`❌ ${file} - MISSING`);
      failed++;
    }
  }

  console.log();

  // Validate package.json
  console.log('📦 Validating package.json:');
  try {
    const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    
    if (packageJson.name === 'uru-mcp-proxy') {
      console.log('✅ Package name is correct');
      passed++;
    } else {
      console.log('❌ Package name is incorrect');
      failed++;
    }

    if (packageJson.bin && packageJson.bin['uru-mcp-proxy']) {
      console.log('✅ Binary entry point is configured');
      passed++;
    } else {
      console.log('❌ Binary entry point is missing');
      failed++;
    }

    if (packageJson.dependencies && packageJson.dependencies['@modelcontextprotocol/sdk']) {
      console.log('✅ MCP SDK dependency is present');
      passed++;
    } else {
      console.log('❌ MCP SDK dependency is missing');
      failed++;
    }

    if (packageJson.engines && packageJson.engines.node) {
      console.log('✅ Node.js version requirement is specified');
      passed++;
    } else {
      console.log('❌ Node.js version requirement is missing');
      failed++;
    }

  } catch (error) {
    console.log(`❌ package.json validation failed: ${error.message}`);
    failed++;
  }

  console.log();

  // Validate executable permissions
  console.log('🔧 Checking executable files:');
  const executableFiles = [
    'bin/uru-mcp-proxy.js',
    'scripts/postinstall.js'
  ];

  for (const file of executableFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8');
      if (content.startsWith('#!/usr/bin/env node')) {
        console.log(`✅ ${file} has correct shebang`);
        passed++;
      } else {
        console.log(`❌ ${file} missing shebang`);
        failed++;
      }
    }
  }

  console.log();

  // Validate configuration defaults
  console.log('⚙️  Checking configuration:');
  try {
    const configContent = fs.readFileSync('lib/config-manager.js', 'utf8');

    if (configContent.includes('https://mcp.uruenterprises.com') && configContent.includes('proxyUrl:')) {
      console.log('✅ Default proxy URL is correct');
      passed++;
    } else {
      console.log('❌ Default proxy URL is incorrect');
      failed++;
    }

    if (configContent.includes('URU_TOKEN')) {
      console.log('✅ Token environment variable is configured');
      passed++;
    } else {
      console.log('❌ Token environment variable is missing');
      failed++;
    }

  } catch (error) {
    console.log(`❌ Configuration validation failed: ${error.message}`);
    failed++;
  }

  console.log();

  // Validate CLI interface
  console.log('💻 Checking CLI interface:');
  try {
    const cliContent = fs.readFileSync('bin/uru-mcp-proxy.js', 'utf8');
    
    if (cliContent.includes('--setup')) {
      console.log('✅ Setup command is available');
      passed++;
    } else {
      console.log('❌ Setup command is missing');
      failed++;
    }

    if (cliContent.includes('--test')) {
      console.log('✅ Test command is available');
      passed++;
    } else {
      console.log('❌ Test command is missing');
      failed++;
    }

    if (cliContent.includes('--claude-config')) {
      console.log('✅ Claude config command is available');
      passed++;
    } else {
      console.log('❌ Claude config command is missing');
      failed++;
    }

  } catch (error) {
    console.log(`❌ CLI validation failed: ${error.message}`);
    failed++;
  }

  console.log();

  // Results
  console.log('📊 Validation Results:');
  console.log(`✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📈 Success Rate: ${Math.round((passed / (passed + failed)) * 100)}%`);

  if (failed === 0) {
    console.log('\n🎉 Package structure is valid! Ready for distribution.');
    return true;
  } else {
    console.log('\n💥 Package structure has issues. Please fix before distribution.');
    return false;
  }
}

// Run validation
const isValid = validatePackageStructure();
process.exit(isValid ? 0 : 1);

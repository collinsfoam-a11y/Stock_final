#!/usr/bin/env node
/**
 * Script to verify that shared packages don't import platform-specific modules
 * This enforces the multi-platform architecture boundary rules
 */

const fs = require('fs');
const path = require('path');

// Define forbidden imports for shared packages
const FORBIDDEN_IMPORTS = [
  'react-native',
  'expo-', // All expo packages
  'react-native-', // All react native packages
  'window',
  'document',
  'navigator',
  'localStorage',
  'IndexedDB',
  'serviceWorker',
  '@react-native/',
  'expo-sqlite',
  'expo-secure-store',
  'react-native-async-storage',
  'react-native-ble-plx',
  'expo-camera',
  'expo-file-system',
  'expo-font',
  'expo-image',
  'expo-sharing',
  'expo-task-manager',
  'expo-background-fetch',
  'react-native-community/'
];

const SHARED_PACKAGES_DIR = path.join(__dirname, '../packages/shared');

function checkFileForForbiddenImports(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const violations = [];

  lines.forEach((line, index) => {
    FORBIDDEN_IMPORTS.forEach(forbiddenImport => {
      if (line.includes(forbiddenImport) && 
          (line.includes('import') || line.includes('require'))) {
        violations.push({
          file: filePath,
          line: index + 1,
          content: line.trim(),
          forbidden: forbiddenImport
        });
      }
    });
  });

  return violations;
}

function scanDirectory(dirPath) {
  const files = [];
  const items = fs.readdirSync(dirPath);

  items.forEach(item => {
    const fullPath = path.join(dirPath, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...scanDirectory(fullPath));
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      files.push(fullPath);
    }
  });

  return files;
}

function main() {
  console.log('🔍 Checking package boundaries...\n');
  
  const sharedFiles = scanDirectory(SHARED_PACKAGES_DIR);
  let totalViolations = 0;
  let hasViolations = false;

  sharedFiles.forEach(file => {
    const violations = checkFileForForbiddenImports(file);
    
    if (violations.length > 0) {
      hasViolations = true;
      console.log(`❌ Violations found in: ${file}\n`);
      
      violations.forEach(violation => {
        console.log(`  Line ${violation.line}: ${violation.content}`);
        console.log(`  Forbidden import: ${violation.forbidden}\n`);
      });
      
      totalViolations += violations.length;
    }
  });

  console.log(`📊 Summary:`);
  console.log(`  Files checked: ${sharedFiles.length}`);
  console.log(`  Violations found: ${totalViolations}`);
  
  if (hasViolations) {
    console.log(`\n❌ Boundary violations detected!`);
    console.log(`Shared packages must not import platform-specific modules.`);
    console.log(`See multi-platform architecture specification for details.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All shared packages comply with boundary rules.`);
    console.log(`No platform-specific imports found in shared packages.`);
  }
}

if (require.main === module) {
  main();
}
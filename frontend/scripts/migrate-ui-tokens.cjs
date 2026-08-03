const fs = require('fs');
const path = require('path');

const BATCH_DIRS = [
  'frontend/src',
  'frontend/app',
  'frontend/__tests__'
];

function getAllFiles(dirPath, arrayOfFiles) {
  files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });

  return arrayOfFiles;
}

let allFiles = [];
BATCH_DIRS.forEach(dir => {
  if (fs.existsSync(dir)) {
    allFiles = getAllFiles(dir, allFiles);
  }
});

let modifiedCount = 0;

allFiles.forEach(file => {
  // DO NOT MODIFY theme infrastructure directly
  if (file.includes('themeTokens.ts') || file.includes('legacyCompat.ts') || file.includes('themeLegacy.ts') || file.includes('modernDesignSystem.ts') || file.includes('unified/index.ts')) {
    return;
  }

  let content = fs.readFileSync(file, 'utf8');
  let originalContent = content;

  // 1. Replace ALL forms of legacy imports
  content = content.replace(/from\s+["'][^"']*(?:legacyCompat|themeLegacy|modernDesignSystem)["']/g, 'from "@/theme/unified"');

  // 2. Replace gray -> neutral
  content = content.replace(/\.gray\[/g, '.neutral[');
  content = content.replace(/\.gray\./g, '.neutral.');

  // 3. Replace xxl spacing
  content = content.replace(/\.xxl/g, '["2xl"]');

  if (content !== originalContent) {
    fs.writeFileSync(file, content);
    console.log(`Modified: ${file}`);
    modifiedCount++;
  }
});

console.log(`\nCompleted Absolute Final Codemod. Modified ${modifiedCount} files.`);

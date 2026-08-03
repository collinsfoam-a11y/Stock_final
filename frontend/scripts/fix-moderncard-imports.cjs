const fs = require('fs');
const { execSync } = require('child_process');

try {
  const files = execSync("grep -rl 'import ModernCard from' src/ app/").toString().trim().split('\n');
  files.forEach(f => {
    if (!f) return;
    const content = fs.readFileSync(f, 'utf8');
    fs.writeFileSync(f, content.replace(/import ModernCard from/g, "import { ModernCard } from"));
  });
  console.log("Updated ModernCard imports in " + files.length + " files.");
} catch (e) {
  console.log("No files needed updating or error occurred.", e.message);
}

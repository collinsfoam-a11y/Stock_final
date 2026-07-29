const fs = require('fs');

const file = 'src/components/admin/dashboard/dashboardWebShared.ts';
let content = fs.readFileSync(file, 'utf8');

const replacements = [
  { regex: /gap: 24/g, rep: 'gap: uiTokens.spacing.lg' },
  { regex: /padding: 24/g, rep: 'padding: uiTokens.spacing.lg' },
  { regex: /paddingHorizontal: 24/g, rep: 'paddingHorizontal: uiTokens.spacing.lg' },
  { regex: /gap: 16/g, rep: 'gap: uiTokens.spacing.md' },
  { regex: /padding: 16/g, rep: 'padding: uiTokens.spacing.md' },
  { regex: /paddingHorizontal: 16/g, rep: 'paddingHorizontal: uiTokens.spacing.md' },
  { regex: /paddingVertical: 16/g, rep: 'paddingVertical: uiTokens.spacing.md' },
  { regex: /marginBottom: 24/g, rep: 'marginBottom: uiTokens.spacing.lg' },
  { regex: /marginBottom: 16/g, rep: 'marginBottom: uiTokens.spacing.md' },
  { regex: /marginTop: 24/g, rep: 'marginTop: uiTokens.spacing.lg' },
  { regex: /marginTop: 16/g, rep: 'marginTop: uiTokens.spacing.md' },
  { regex: /padding: 20/g, rep: 'padding: uiTokens.spacing.lg' }, // 20 is close to 24 (lg), wait, let's make it uiTokens.spacing.md (16) or lg(24)
  { regex: /gap: 12/g, rep: 'gap: uiTokens.spacing.sm' }, // 12 -> 8
  { regex: /paddingVertical: 12/g, rep: 'paddingVertical: uiTokens.spacing.sm' },
  { regex: /padding: 18/g, rep: 'padding: uiTokens.spacing.md' } // 18 -> 16
];

replacements.forEach(({ regex, rep }) => {
  content = content.replace(regex, rep);
});

fs.writeFileSync(file, content);
console.log("Tokens migrated.");

const { Project, SyntaxKind } = require("ts-morph");
const path = require("path");
const fs = require("fs");

const project = new Project({
  tsConfigFilePath: path.join(__dirname, "../tsconfig.json"),
});

// We only process specific directories
project.addSourceFilesAtPaths([
  path.join(__dirname, "../src/**/*.ts"),
  path.join(__dirname, "../src/**/*.tsx"),
  path.join(__dirname, "../app/**/*.ts"),
  path.join(__dirname, "../app/**/*.tsx")
]);

const uiBarrelFile = project.getSourceFile(path.join(__dirname, "../src/components/ui/index.ts"));
const themeBarrelFile = project.getSourceFile(path.join(__dirname, "../src/theme/index.ts"));

if (!uiBarrelFile || !themeBarrelFile) {
  console.error("Could not find barrel files");
  process.exit(1);
}

// Map ExportedName -> SourceModuleSpecifier
const uiMap = new Map();
for (const [name, declarations] of uiBarrelFile.getExportedDeclarations()) {
  if (declarations.length > 0) {
    const decl = declarations[0];
    const sourceFile = decl.getSourceFile();
    // get relative path from ui barrel to the source file
    let relPath = path.relative(path.join(__dirname, "../src"), sourceFile.getFilePath());
    relPath = relPath.replace(/\.(ts|tsx)$/, "");
    // if the export is from the same directory as the barrel, we could use relative, but we'll use absolute aliases if possible.
    uiMap.set(name, `../../src/${relPath}`); 
  }
}

const themeMap = new Map();
for (const [name, declarations] of themeBarrelFile.getExportedDeclarations()) {
  if (declarations.length > 0) {
    const decl = declarations[0];
    const sourceFile = decl.getSourceFile();
    let relPath = path.relative(path.join(__dirname, "../src"), sourceFile.getFilePath());
    relPath = relPath.replace(/\.(ts|tsx)$/, "");
    themeMap.set(name, `../../src/${relPath}`);
  }
}

let changedFiles = 0;

project.getSourceFiles().forEach(sourceFile => {
  // Skip the barrel files themselves
  if (sourceFile === uiBarrelFile || sourceFile === themeBarrelFile) return;

  const imports = sourceFile.getImportDeclarations();
  let fileChanged = false;

  imports.forEach(importDecl => {
    const moduleSpecifier = importDecl.getModuleSpecifierValue();
    
    // Check if it imports from UI barrel
    let isUi = moduleSpecifier.endsWith("components/ui") || moduleSpecifier.endsWith("components/ui/") || moduleSpecifier.endsWith("components/ui/index");
    let isTheme = moduleSpecifier.endsWith("src/theme") || moduleSpecifier.endsWith("src/theme/") || moduleSpecifier.endsWith("src/theme/index");
    
    // Sometimes it's aliased
    if (moduleSpecifier === "@/theme" || moduleSpecifier === "@/theme/index" || moduleSpecifier === "../theme" || moduleSpecifier === "../../theme" || moduleSpecifier === "../../src/theme") {
      isTheme = true;
    }

    if (isUi || isTheme) {
      const namedImports = importDecl.getNamedImports();
      if (namedImports.length > 0) {
        // Build replacements
        const replacements = new Map();
        
        namedImports.forEach(ni => {
          const name = ni.getName();
          const alias = ni.getAliasNode()?.getText();
          let targetModule = isUi ? uiMap.get(name) : themeMap.get(name);
          
          if (!targetModule) {
            console.warn(`Could not resolve UI export: ${name} in ${sourceFile.getFilePath()}`);
            targetModule = moduleSpecifier; // fallback
          }

          // Use the alias @/components/ui/X if the project supports it, but let's compute relative path
          // Actually, let's just use @/components/... if targetModule is ../../src/...
          if (targetModule.startsWith("../../src/")) {
            targetModule = targetModule.replace("../../src/", "@/");
          }

          if (!replacements.has(targetModule)) {
            replacements.set(targetModule, []);
          }
          replacements.get(targetModule).push({ name, alias });
        });

        // Add new imports
        for (const [targetModule, imports] of replacements.entries()) {
          sourceFile.addImportDeclaration({
            moduleSpecifier: targetModule,
            namedImports: imports.map(i => i.alias ? `${i.name} as ${i.alias}` : i.name),
            isTypeOnly: importDecl.isTypeOnly()
          });
        }
        
        // Remove original import
        importDecl.remove();
        fileChanged = true;
      }
    }
  });

  if (fileChanged) {
    changedFiles++;
    console.log(`Updated ${sourceFile.getFilePath()}`);
  }
});

if (changedFiles > 0) {
  project.saveSync();
  console.log(`Replaced barrel imports in ${changedFiles} files.`);
} else {
  console.log("No files needed updating.");
}

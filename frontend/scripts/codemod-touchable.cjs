module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let hasTouchableOpacity = false;

  // 1. Remove TouchableOpacity from react-native imports
  root.find(j.ImportDeclaration, { source: { value: 'react-native' } }).forEach(path => {
    const specifiers = path.node.specifiers;
    if (specifiers) {
      const idx = specifiers.findIndex(s => s.imported && s.imported.name === 'TouchableOpacity');
      if (idx !== -1) {
        hasTouchableOpacity = true;
        specifiers.splice(idx, 1);
        if (specifiers.length === 0) {
          j(path).remove();
        }
      }
    }
  });

  if (!hasTouchableOpacity) {
    return fileInfo.source; // No changes
  }

  // 2. Add import { AppTouchable } from "@/components/ui/AppTouchable"
  const newImport = j.importDeclaration(
    [j.importSpecifier(j.identifier('AppTouchable'))],
    j.stringLiteral('@/components/ui/AppTouchable')
  );
  
  const imports = root.find(j.ImportDeclaration);
  if (imports.length > 0) {
    j(imports.at(imports.length - 1).get()).insertAfter(newImport);
  } else {
    root.get().node.program.body.unshift(newImport);
  }

  // 3. Rename JSX Elements and add accessibilityLabel if missing
  root.find(j.JSXOpeningElement, { name: { name: 'TouchableOpacity' } }).forEach(path => {
    path.node.name.name = 'AppTouchable';

    let hasLabel = false;
    let hasSpread = false;
    if (path.node.attributes) {
      path.node.attributes.forEach(attr => {
        if (attr.type === 'JSXAttribute' && attr.name && attr.name.name === 'accessibilityLabel') {
          hasLabel = true;
        }
        // Detect spread attributes (e.g. {...getAccessibleButtonProps(...)})
        // which may set accessibilityLabel — don't override them.
        if (attr.type === 'JSXSpreadAttribute') {
          hasSpread = true;
        }
      });
      // Only add a fallback label when there is no direct label AND no spread
      // that could be providing one. Adding a label after a spread would
      // override the spread's accessibilityLabel.
      if (!hasLabel && !hasSpread) {
        path.node.attributes.push(
          j.jsxAttribute(
            j.jsxIdentifier('accessibilityLabel'),
            j.stringLiteral('Action button')
          )
        );
      }
    }
  });

  root.find(j.JSXClosingElement, { name: { name: 'TouchableOpacity' } }).forEach(path => {
    path.node.name.name = 'AppTouchable';
  });

  return root.toSource();
};

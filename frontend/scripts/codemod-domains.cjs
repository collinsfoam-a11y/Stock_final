module.exports = function (fileInfo, api) {
  const j = api.jscodeshift;
  const root = j(fileInfo.source);

  let modified = false;

  const replaceSrc = (src) => {
    if (typeof src !== 'string') return src;
    let newSrc = src;
    newSrc = newSrc.replace(/^@\/domain\//, '@/core/');
    newSrc = newSrc.replace(/^@\/domains\//, '@/features/');
    newSrc = newSrc.replace(/^((\.\.\/)+|\.\/)domain\//, '$1core/');
    newSrc = newSrc.replace(/^((\.\.\/)+|\.\/)domains\//, '$1features/');
    newSrc = newSrc.replace(/^((\.\.\/)+|\.\/)src\/domain\//, '$1src/core/');
    newSrc = newSrc.replace(/^((\.\.\/)+|\.\/)src\/domains\//, '$1src/features/');
    // Handle specific index imports
    if (newSrc === '@/domain') newSrc = '@/core';
    if (newSrc === '@/domains') newSrc = '@/features';
    return newSrc;
  };

  root.find(j.ImportDeclaration).forEach(path => {
    const src = path.node.source.value;
    const newSrc = replaceSrc(src);
    if (newSrc !== src) {
      path.node.source.value = newSrc;
      modified = true;
    }
  });

  root.find(j.ExportAllDeclaration).forEach(path => {
    const src = path.node.source.value;
    const newSrc = replaceSrc(src);
    if (newSrc !== src) {
      path.node.source.value = newSrc;
      modified = true;
    }
  });
  
  root.find(j.ExportNamedDeclaration).forEach(path => {
    if (!path.node.source) return;
    const src = path.node.source.value;
    const newSrc = replaceSrc(src);
    if (newSrc !== src) {
      path.node.source.value = newSrc;
      modified = true;
    }
  });

  return modified ? root.toSource() : fileInfo.source;
};

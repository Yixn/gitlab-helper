const fs = require('fs');
const path = require('path');
const babel = require('@babel/core');
const glob = require('glob');
const targetDir = process.argv[2] || '.';
const extensions = ['.js', '.jsx', '.ts', '.tsx'];
const babelOptions = {
  ast: true,
  plugins: [["transform-remove-console", {
    exclude: ["error", "warn"]
  }], function removeCommentsPlugin() {
    return {
      visitor: {
        Program(path) {
          path.traverse({
            enter(path) {
              if (path.node.leadingComments) {
                path.node.leadingComments = [];
              }
              if (path.node.trailingComments) {
                path.node.trailingComments = [];
              }
              if (path.node.innerComments) {
                path.node.innerComments = [];
              }
            }
          });
        }
      }
    };
  }]
};
const excludedFiles = ['main.js'];
function shouldExcludeFile(filePath) {
  const fileName = path.basename(filePath);
  return excludedFiles.some(excluded => filePath.endsWith(excluded) || fileName === excluded);
}
function processFile(filePath) {
  try {
    if (shouldExcludeFile(filePath)) {
      return true;
    }
    const code = fs.readFileSync(filePath, 'utf8');
    const result = babel.transformSync(code, {
      ...babelOptions,
      filename: filePath
    });
    if (result && result.code) {
      fs.writeFileSync(filePath, result.code, 'utf8');
      return true;
    } else {
      console.error(`⚠ No output generated for: ${filePath}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Error processing file ${filePath}:`, error.message);
    return false;
  }
}
function cleanCodebase() {
  let stats = {
    totalFiles: 0,
    processedFiles: 0,
    errorFiles: 0
  };
  const absTargetDir = path.resolve(targetDir);
  const patterns = extensions.map(ext => `${absTargetDir}/**/*${ext}`);
  let allFiles = [];
  patterns.forEach(pattern => {
    const files = glob.sync(pattern, {
      ignore: ['**/node_modules/**', '**/dist/**', '**/build/**']
    });
    allFiles = [...allFiles, ...files];
  });
  stats.totalFiles = allFiles.length;
  allFiles.forEach(file => {
    try {
      const success = processFile(file);
      if (success) {
        stats.processedFiles++;
      } else {
        stats.errorFiles++;
      }
    } catch (error) {
      console.error(`❌ Error with file ${file}:`, error.message);
      stats.errorFiles++;
    }
  });
}
if (!fs.existsSync(targetDir)) {
  console.error(`Error: Directory "${targetDir}" does not exist`);
  process.exit(1);
}
cleanCodebase();
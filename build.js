const fs = require('fs');
const path = require('path');
const {
  minify
} = require('terser');
const glob = require('glob');
let envConfig = {};
try {
  if (fs.existsSync('.env')) {
    const envContent = fs.readFileSync('.env', 'utf8');
    envContent.split('\n').forEach(line => {
      const parts = line.split('=');
      if (parts.length === 2) {
        const key = parts[0].trim();
        const value = parts[1].trim();
        envConfig[key] = value;
      }
    });
  }
} catch (error) {
  console.error('Error loading .env file:', error);
}
const CONFIG = {
  sourceDir: './lib',
  mainFile: './main.js',
  outputFile: './dist/gitlab-sprint-helper.js',
  devOutputFile: envConfig.DEV_OUTPUT_PATH || null,
  fileOrder: ['core/Utils.js', 'api/APIUtils.js', 'api/GitLabAPI.js', 'core/DataProcessor.js', 'core/HistoryManager.js', 'storage/LocalStorage.js', 'storage/SettingsStorage.js', 'ui/components/Notification.js', 'ui/components/CommandShortcut.js', 'ui/components/SelectionDisplay.js', 'ui/components/IssueSelector.js', 'ui/managers/TabManager.js', 'ui/managers/CommandManager.js', 'ui/managers/LabelManager.js', 'ui/managers/AssigneeManager.js', 'ui/managers/MilestoneManager.js', 'ui/managers/SettingsManager.js', 'ui/views/SummaryView.js', 'ui/views/BoardsView.js', 'ui/views/SprintManagementView.js', 'ui/views/BulkCommentsView.js', 'ui/views/StatsView.js', 'ui/UIManager.js', 'ui/index.js', 'index.js'],
  variablesToFix: [{
    name: 'gitlabApi',
    pattern: /const\s+gitlabApi\s*=\s*new\s+GitLabAPI\(\);/g,
    replacement: 'window.gitlabApi = window.gitlabApi || new GitLabAPI();'
  }, {
    name: 'uiManager',
    pattern: /const\s+uiManager\s*=\s*new\s+UIManager\(\);/g,
    replacement: 'window.uiManager = window.uiManager || new UIManager();'
  }, {
    name: 'uiManager',
    pattern: /var\s+uiManager\s*=\s*new\s+UIManager\(\);/g,
    replacement: 'window.uiManager = window.uiManager || new UIManager();'
  }, {
    name: 'historyManager',
    pattern: /const\s+historyManager\s*=\s*new\s+HistoryManager\(\);/g,
    replacement: 'window.historyManager = window.historyManager || new HistoryManager();'
  }],
  keywordsToPreserve: ['gitlabApi', 'uiManager', 'GitLabAPI', 'UIManager', 'TabManager', 'SummaryView', 'BoardsView', 'CommandManager', 'BulkCommentsView', 'IssueSelector', 'CommandShortcut', 'updateSummary', 'LabelManager', 'SettingsManager', 'SelectionDisplay', 'getPathFromUrl', 'getLabelWhitelist', 'processBoards', 'formatHours', 'historyManager', 'HistoryManager', 'StatsView'],
  ignorePatterns: ['dist/**', 'node_modules/**']
};
const outputDir = path.dirname(CONFIG.outputFile);
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, {
    recursive: true
  });
}
if (CONFIG.devOutputFile) {
  const devOutputDir = path.dirname(CONFIG.devOutputFile);
  if (!fs.existsSync(devOutputDir)) {
    fs.mkdirSync(devOutputDir, {
      recursive: true
    });
  }
}
function extractUserScriptHeader(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const headerMatch = content.match(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/);
  if (!headerMatch) {
    console.error('UserScript header not found in main.js');
    process.exit(1);
  }
  return headerMatch[0];
}
function findAllJsFiles() {
  return glob.sync(`${CONFIG.sourceDir}/**/*.js`, {
    ignore: CONFIG.ignorePatterns
  });
}
function processFileContent(filePath, alreadyIncluded) {
  try {
    if (alreadyIncluded.includes(filePath)) {
      return '';
    }
    alreadyIncluded.push(filePath);
    let content = fs.readFileSync(filePath, 'utf8');
    const fileName = path.basename(filePath);
    content = content.replace(/\/\*[\s\S]*?\*\//g, '');
    content = content.replace(/export\s+async\s+function\s+([A-Za-z0-9_]+)/g, 'window.$1 = async function');
    content = content.replace(/export\s+default\s+class\s+([A-Za-z0-9_]+)/g, 'class $1');
    content = content.replace(/export\s+class\s+([A-Za-z0-9_]+)/g, 'class $1');
    content = content.replace(/class\s+([A-Za-z0-9_]+)\s*{/g, 'window.$1 = class $1 {');
    content = content.replace(/export\s+function\s+([A-Za-z0-9_]+)/g, 'window.$1 = function $1');
    content = content.replace(/export\s+(const|let|var)\s+([A-Za-z0-9_]+)\s*=/g, 'window.$2 =');
    content = content.replace(/export\s+default\s+([A-Za-z0-9_]+);?/g, 'window.$1 = $1;');
    content = content.replace(/export\s+{[^}]+};?\s*/g, '');
    content = content.replace(/import\s+.*?from\s+['"][^'"]+['"];?\s*/g, '');
    content = content.replace(/import\s+{[^}]+}\s+from\s+['"][^'"]+['"];?\s*/g, '');
    content = content.replace(/import\s+\*\s+as\s+[A-Za-z0-9_]+\s+from\s+['"][^'"]+['"];?\s*/g, '');
    CONFIG.variablesToFix.forEach(variable => {
      content = content.replace(variable.pattern, variable.replacement);
    });
    return `\n// File: ${path.relative(process.cwd(), filePath)}\n${content}\n`;
  } catch (error) {
    console.error(`Error reading file ${filePath}:`, error);
    return `\n// Error reading file: ${filePath}\n`;
  }
}
function getMainScriptContent() {
  const content = fs.readFileSync(CONFIG.mainFile, 'utf8');
  const withoutHeader = content.replace(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return withoutHeader;
}
async function buildBundle() {
  const header = extractUserScriptHeader(CONFIG.mainFile);
  let bundle = '';
  const alreadyIncluded = [];
  bundle += `
// GitLab Sprint Helper - Combined Script
(function(window) {
`;
  const allFiles = findAllJsFiles();
  const fileMap = new Map();
  allFiles.forEach(filePath => {
    const relativePath = path.relative(CONFIG.sourceDir, filePath);
    fileMap.set(relativePath, filePath);
    const fileName = path.basename(filePath);
    fileMap.set(fileName, filePath);
  });
  for (const fileEntry of CONFIG.fileOrder) {
    let filePath = path.join(CONFIG.sourceDir, fileEntry);
    if (!fs.existsSync(filePath)) {
      if (fileMap.has(fileEntry)) {
        filePath = fileMap.get(fileEntry);
      } else {
        console.warn(`Warning: File not found: ${fileEntry}`);
        continue;
      }
    }
    if (alreadyIncluded.includes(filePath)) {
      continue;
    }
    bundle += processFileContent(filePath, alreadyIncluded);
  }
  const processedPaths = new Set(alreadyIncluded.map(p => path.normalize(p)));
  const remainingFiles = allFiles.filter(file => !alreadyIncluded.some(included => path.normalize(included) === path.normalize(file)));
  for (const filePath of remainingFiles) {
    bundle += processFileContent(filePath, alreadyIncluded);
  }
  const mainContent = getMainScriptContent();
  bundle += `\n// File: main.js (main script content)\n${mainContent}\n`;
  bundle += `
})(window);
`;
  const unminifiedOutput = path.join(path.dirname(CONFIG.outputFile), path.basename(CONFIG.outputFile, '.js') + '.debug.js');
  fs.writeFileSync(unminifiedOutput, header + '\n' + bundle);
  if (CONFIG.devOutputFile) {
    fs.writeFileSync(CONFIG.devOutputFile, header + '\n' + bundle);
  }
  try {
    const minifyOptions = {
      toplevel: true,
      compress: {
        dead_code: true,
        drop_console: false,
        drop_debugger: true,
        keep_classnames: true,
        keep_fnames: true
      },
      mangle: {
        keep_classnames: true,
        keep_fnames: true,
        reserved: CONFIG.keywordsToPreserve
      },
      format: {
        comments: false
      }
    };
    const minifyResult = await minify(bundle, minifyOptions);
    if (!minifyResult || !minifyResult.code) {
      throw new Error('Minification failed to produce code');
    }
    fs.writeFileSync(CONFIG.outputFile, header + '\n\n' + minifyResult.code);
    const originalSize = Buffer.byteLength(bundle, 'utf8');
    const minifiedSize = Buffer.byteLength(minifyResult.code, 'utf8');
    const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(2);
  } catch (error) {
    console.error('Error during minification:', error);
    console.error(error.stack);
    fs.writeFileSync(CONFIG.outputFile, header + '\n\n' + bundle);
  }
}
buildBundle();
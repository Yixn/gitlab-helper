/**
 * Build script for GitLab Sprint Helper
 *
 * This Node.js script combines and minifies all JavaScript files into a single output file.
 * It handles variable redeclarations and preserves the UserScript header.
 *
 * Usage: node build.js
 */

const fs = require('fs');
const path = require('path');
const { minify } = require('terser');
const glob = require('glob');

// Load .env file if it exists
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
        console.log('Loaded .env file');
    }
} catch (error) {
    console.error('Error loading .env file:', error);
}

// Configuration
const CONFIG = {
    sourceDir: './lib',
    mainFile: './main.js',
    outputFile: './dist/gitlab-sprint-helper.js',
    // Use dev path from .env if available, otherwise use null
    devOutputFile: envConfig.DEV_OUTPUT_PATH || null,
    fileOrder: [
        // Core utilities first
        'utils.js',
        'api.js',
        'dataProcessor.js',
        'history.js',

        // UI components in dependency order
        'ui/TabManager.js',
        'ui/CommentShortcuts.js',  // CommentShortcuts needs to be earlier

        // New refactored components in correct dependency order
        'ui/ShortcutManager.js',   // ShortcutManager first
        'ui/LabelManager.js',      // LabelManager depends on ShortcutManager
        'ui/IssueSelectionDisplay.js',
        'ui/SettingsManager.js',   // SettingsManager depends on LabelManager
        'ui/ApiTabView.js',        // ApiTabView depends on all the above

        // Remaining UI components
        'ui/SummaryTabView.js',
        'ui/BoardsTabView.js',
        'ui/HistoryTabView.js',
        'ui/IssueSelector.js',
        'ui/UIManager.js',
        'ui.js',
    ],

    // Variables to fix redeclarations for
    variablesToFix: [
        { name: 'gitlabApi', pattern: /const\s+gitlabApi\s*=\s*new\s+GitLabAPI\(\);/g,
            replacement: 'window.gitlabApi = window.gitlabApi || new GitLabAPI();' },
        { name: 'uiManager', pattern: /const\s+uiManager\s*=\s*new\s+UIManager\(\);/g,
            replacement: 'window.uiManager = window.uiManager || new UIManager();' },
        { name: 'uiManager', pattern: /var\s+uiManager\s*=\s*new\s+UIManager\(\);/g,
            replacement: 'window.uiManager = window.uiManager || new UIManager();' }
    ],

    // Keywords to preserve during minification
    keywordsToPreserve: [
        'gitlabApi', 'uiManager', 'GitLabAPI', 'UIManager', 'TabManager',
        'SummaryTabView', 'BoardsTabView', 'HistoryTabView', 'ShortcutManager', 'ApiTabView',
        'IssueSelector', 'CommentShortcuts', 'updateSummary', 'renderHistory',
        'LabelManager', 'SettingsManager', 'IssueSelectionDisplay'
    ],

    // Ignore patterns for file scanning
    ignorePatterns: ['dist/**'] // Explicitly ignore the dist folder
};

// Ensure output directory exists
const outputDir = path.dirname(CONFIG.outputFile);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

// Ensure dev output directory exists if specified
if (CONFIG.devOutputFile) {
    const devOutputDir = path.dirname(CONFIG.devOutputFile);
    if (!fs.existsSync(devOutputDir)) {
        fs.mkdirSync(devOutputDir, { recursive: true });
    }
}

// Extract UserScript header from main.js
function extractUserScriptHeader(filePath) {
    const content = fs.readFileSync(filePath, 'utf8');
    const headerMatch = content.match(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/);

    if (!headerMatch) {
        console.error('UserScript header not found in main.js');
        process.exit(1);
    }

    // Update the header to remove @require directives since we're bundling the files
    let header = headerMatch[0];
    const lines = header.split('\n');
    const filteredLines = lines.filter(line => !line.includes('@require'));

    // Re-add the first and last lines (UserScript markers)
    return filteredLines.join('\n');
}

// Find all JS files in the source directory
function findAllJsFiles() {
    return glob.sync(`${CONFIG.sourceDir}/**/*.js`, {
        ignore: CONFIG.ignorePatterns // Add ignore patterns
    });
}

// Process file content and fix variable redeclarations
function processFileContent(filePath, alreadyIncluded) {
    try {
        if (alreadyIncluded.includes(filePath)) {
            return '';
        }

        alreadyIncluded.push(filePath);

        let content = fs.readFileSync(filePath, 'utf8');
        const fileName = path.basename(filePath);

        // Fix class declarations to prevent redeclaration errors
        const classPattern = /class\s+([A-Za-z0-9_]+)\s*{/g;
        content = content.replace(classPattern, (match, className) => {
            return `window.${className} = window.${className} || class ${className} {`;
        });

        // Apply variable fixes
        CONFIG.variablesToFix.forEach(variable => {
            content = content.replace(variable.pattern, variable.replacement);
        });

        // Add filename as comment
        return `\n// File: ${path.relative(process.cwd(), filePath)}\n${content}\n`;

    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return `\n// Error reading file: ${filePath}\n`;
    }
}

// Get the main script content (excluding the UserScript header)
function getMainScriptContent() {
    const content = fs.readFileSync(CONFIG.mainFile, 'utf8');
    const withoutHeader = content.replace(/(\/\/ ==UserScript==[\s\S]*?\/\/ ==\/UserScript==)/, '');
    return withoutHeader;
}

// Create a simple JavaScript bundler
async function buildBundle() {
    console.log('Starting build process...');

    // Extract UserScript header
    const header = extractUserScriptHeader(CONFIG.mainFile);
    console.log('Extracted UserScript header');

    let bundle = '';
    const alreadyIncluded = [];

    // Start the bundle with an IIFE wrapper
    bundle += `
// GitLab Sprint Helper - Combined Script
(function(window) {
`;

    // Process files in the specified order
    const allFiles = findAllJsFiles();
    const fileMap = new Map(); // Map filename to full path

    // Build a map of file names to full paths for easier lookup
    allFiles.forEach(filePath => {
        const fileName = path.basename(filePath);
        fileMap.set(fileName, filePath);

        // Also map by the relative path from sourceDir
        const relativePath = path.relative(CONFIG.sourceDir, filePath);
        fileMap.set(relativePath, filePath);
    });

    // Process files in the specified order
    for (const fileEntry of CONFIG.fileOrder) {
        // Try direct match with full path
        let filePath = path.join(CONFIG.sourceDir, fileEntry);

        // If file doesn't exist directly, try to find it in our map
        if (!fs.existsSync(filePath)) {
            // Try to match by filename or relative path
            const fileName = path.basename(fileEntry);
            if (fileMap.has(fileEntry)) {
                filePath = fileMap.get(fileEntry);
            } else if (fileMap.has(fileName)) {
                filePath = fileMap.get(fileName);
            } else {
                console.warn(`Warning: File not found: ${fileEntry}`);
                continue;
            }
        }

        // Check if we've already processed this file
        if (alreadyIncluded.includes(filePath)) {
            console.log(`Skipping already processed file: ${fileEntry}`);
            continue;
        }

        console.log(`Adding ${fileEntry}`);
        bundle += processFileContent(filePath, alreadyIncluded);
    }

    // Check for any remaining files that weren't in the specified order
    const processedPaths = new Set(alreadyIncluded.map(p => path.normalize(p)));
    const remainingFiles = allFiles.filter(file =>
        !alreadyIncluded.some(included => path.normalize(included) === path.normalize(file))
    );

    for (const filePath of remainingFiles) {
        console.log(`Adding unlisted file: ${path.relative(process.cwd(), filePath)}`);
        bundle += processFileContent(filePath, alreadyIncluded);
    }

    // Add main file content (without header)
    const mainContent = getMainScriptContent();
    bundle += `\n// File: main.js (main script content)\n${mainContent}\n`;

    // Close the IIFE
    bundle += `
})(window);
`;

    console.log('All files combined. Creating unminified version...');

    // Create unminified version with header for debugging
    const unminifiedOutput = path.join(
        path.dirname(CONFIG.outputFile),
        path.basename(CONFIG.outputFile, '.js') + '.debug.js'
    );

    fs.writeFileSync(unminifiedOutput, header + '\n' + bundle);
    console.log(`Debug version written to ${unminifiedOutput}`);

    // Write to dev output path if configured
    if (CONFIG.devOutputFile) {
        fs.writeFileSync(CONFIG.devOutputFile, header + '\n' + bundle);
        console.log(`Debug version also written to custom dev path: ${CONFIG.devOutputFile}`);
    }

    console.log('Minifying...');

    try {
        // Minify the bundle
        const minifyOptions = {
            toplevel: true, // Important! This enables top-level variable elimination
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

        // Write the minified code with header
        fs.writeFileSync(CONFIG.outputFile, header + '\n\n' + minifyResult.code);
        console.log(`Minified version written to ${CONFIG.outputFile}`);

        // Log file size information
        const originalSize = Buffer.byteLength(bundle, 'utf8');
        const minifiedSize = Buffer.byteLength(minifyResult.code, 'utf8');
        const reduction = ((1 - minifiedSize / originalSize) * 100).toFixed(2);

        console.log(`Original size: ${(originalSize / 1024).toFixed(2)}KB`);
        console.log(`Minified size: ${(minifiedSize / 1024).toFixed(2)}KB`);
        console.log(`Size reduction: ${reduction}%`);

    } catch (error) {
        console.error('Error during minification:', error);
        console.error(error.stack);

        // Fall back to unminified version if minification fails
        console.log('Minification failed. Creating non-minified production version...');
        fs.writeFileSync(CONFIG.outputFile, header + '\n\n' + bundle);
        console.log(`Non-minified version written to ${CONFIG.outputFile}`);
    }

    console.log('Build completed!');
}

// Run the build
buildBundle();
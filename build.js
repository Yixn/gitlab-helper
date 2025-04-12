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

// Configuration
const CONFIG = {
    sourceDir: './lib',
    mainFile: './main.js',
    outputFile: './dist/gitlab-sprint-helper.js',
    fileOrder: [
        // Core utilities first
        'utils.js',
        'api.js',
        'dataProcessor.js',
        'history.js',

        // UI components in dependency order
        'ui/TabManager.js',
        'ui/SummaryTabView.js',
        'ui/BoardsTabView.js',
        'ui/HistoryTabView.js',
        'ui/CommentShortcuts.js',
        'ui/IssueSelector.js',
        'ui/ApiTabView.js',
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
        'SummaryTabView', 'BoardsTabView', 'HistoryTabView', 'ApiTabView',
        'IssueSelector', 'CommentShortcuts', 'updateSummary', 'renderHistory'
    ]
};

// Ensure output directory exists
const outputDir = path.dirname(CONFIG.outputFile);
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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
    return glob.sync(`${CONFIG.sourceDir}/**/*.js`);
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

    for (const fileName of CONFIG.fileOrder) {
        const filePath = path.join(CONFIG.sourceDir, fileName);
        const matchingFiles = allFiles.filter(file => file.endsWith(fileName));

        if (matchingFiles.length > 0) {
            console.log(`Adding ${fileName}`);
            bundle += processFileContent(matchingFiles[0], alreadyIncluded);
        } else {
            console.warn(`Warning: File not found: ${fileName}`);
        }
    }

    // Include any remaining files
    const remainingFiles = allFiles.filter(file => !alreadyIncluded.includes(file));

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
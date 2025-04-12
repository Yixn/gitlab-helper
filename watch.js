/**
 * Watch script for GitLab Sprint Helper
 *
 * This script watches for changes in your JavaScript files and automatically
 * rebuilds the combined script when files are modified.
 *
 * Usage: node watch.js
 *
 * Requirements:
 * - Node.js
 * - npm packages: chokidar
 *
 * Install dependencies:
 * npm install chokidar
 */

const chokidar = require('chokidar');
const { spawn } = require('child_process');
const path = require('path');

// Configuration
const CONFIG = {
    sourceDir: './lib',
    mainFile: './main.js',
    buildScript: './build.js',
    watchPaths: ['./lib/**/*.js', './main.js'],
    ignorePaths: ['./dist/**'] // Ignore the dist folder
};

// Log function with timestamp
function log(message) {
    const now = new Date();
    const timestamp = now.toLocaleTimeString();
    console.log(`[${timestamp}] ${message}`);
}

// Run the build script
function runBuild() {
    log('File change detected, rebuilding...');

    const build = spawn('node', [CONFIG.buildScript], {
        stdio: 'inherit'
    });

    build.on('close', (code) => {
        if (code === 0) {
            log('Build completed successfully');
        } else {
            log(`Build failed with code ${code}`);
        }
    });
}

// Initialize watcher
function initWatcher() {
    log('Starting file watcher...');

    const watcher = chokidar.watch(CONFIG.watchPaths, {
        ignored: [/(^|[\/\\])\../, ...CONFIG.ignorePaths], // ignore dotfiles and dist folder
        persistent: true
    });

    // Add event listeners
    // Flag to track initial build
    let initialBuildDone = false;

    watcher
        .on('ready', () => {
            log('Initial scan complete. Watching for changes...');
            // Run just one build at startup
            if (!initialBuildDone) {
                initialBuildDone = true;
                runBuild();
            }
        })
        .on('change', (filePath) => {
            // Only respond to changes after initial scan
            if (initialBuildDone) {
                const relativePath = path.relative('.', filePath);
                log(`File changed: ${relativePath}`);
                runBuild();
            }
        })
        .on('add', (filePath) => {
            // Only respond to new files after initial scan
            if (initialBuildDone) {
                const relativePath = path.relative('.', filePath);
                log(`New file detected: ${relativePath}`);
                runBuild();
            }
        })
        .on('unlink', (filePath) => {
            const relativePath = path.relative('.', filePath);
            log(`File deleted: ${relativePath}`);
            runBuild();
        })
        .on('error', (error) => {
            log(`Watcher error: ${error}`);
        });

    // Handle interruption
    process.on('SIGINT', () => {
        log('File watcher stopped.');
        watcher.close();
        process.exit(0);
    });
}

// Start watching
initWatcher();
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
    watchPaths: ['./lib/**/*.js', './main.js']
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
        ignored: /(^|[\/\\])\../, // ignore dotfiles
        persistent: true
    });

    // Add event listeners
    watcher
        .on('ready', () => {
            log('Initial scan complete. Watching for changes...');
            runBuild(); // Run initial build
        })
        .on('change', (filePath) => {
            const relativePath = path.relative('.', filePath);
            log(`File changed: ${relativePath}`);
            runBuild();
        })
        .on('add', (filePath) => {
            const relativePath = path.relative('.', filePath);
            log(`New file detected: ${relativePath}`);
            runBuild();
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
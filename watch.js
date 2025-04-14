const chokidar = require('chokidar');
const {
  spawn
} = require('child_process');
const path = require('path');
const CONFIG = {
  sourceDir: './lib',
  mainFile: './main.js',
  buildScript: './build.js',
  watchPaths: ['./lib/**/*.js', './main.js'],
  ignorePaths: ['./dist/**', 'node_modules/**']
};
function log(message) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();
}
function runBuild() {
  log('File change detected, rebuilding...');
  const build = spawn('node', [CONFIG.buildScript], {
    stdio: 'inherit'
  });
  build.on('close', code => {
    if (code === 0) {
      log('Build completed successfully');
    } else {
      log(`Build failed with code ${code}`);
    }
  });
}
function initWatcher() {
  log('Starting file watcher...');
  const watcher = chokidar.watch(CONFIG.watchPaths, {
    ignored: [/(^|[\/\\])\../, ...CONFIG.ignorePaths],
    persistent: true
  });
  let initialBuildDone = false;
  watcher.on('ready', () => {
    log('Initial scan complete. Watching for changes...');
    if (!initialBuildDone) {
      initialBuildDone = true;
      runBuild();
    }
  }).on('change', filePath => {
    if (initialBuildDone) {
      const relativePath = path.relative('.', filePath);
      log(`File changed: ${relativePath}`);
      runBuild();
    }
  }).on('add', filePath => {
    if (initialBuildDone) {
      const relativePath = path.relative('.', filePath);
      log(`New file detected: ${relativePath}`);
      runBuild();
    }
  }).on('unlink', filePath => {
    const relativePath = path.relative('.', filePath);
    log(`File deleted: ${relativePath}`);
    runBuild();
  }).on('error', error => {
    log(`Watcher error: ${error}`);
  });
  process.on('SIGINT', () => {
    log('File watcher stopped.');
    watcher.close();
    process.exit(0);
  });
}
initWatcher();
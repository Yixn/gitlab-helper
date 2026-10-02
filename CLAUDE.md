# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GitLab Sprint Helper is a Tampermonkey browser extension that enhances GitLab issue boards with time tracking, multi-issue selection, and comment shortcuts. It runs as a userscript injected into GitLab board pages.

## Development Commands

```bash
# Install dependencies
npm install

# Build for production (minified + debug versions)
npm run build

# Watch mode for development (auto-rebuilds on file changes)
npm run watch
```

**Build outputs:**
- `dist/gitlab-sprint-helper.js` - Minified production version
- `dist/gitlab-sprint-helper.debug.js` - Unminified debug version
- Custom dev path from `.env` `DEV_OUTPUT_PATH` if configured

## Architecture

### Build System

The project uses a custom bundler (`build.js`) that:
- Combines ES6 modules into a single IIFE for Tampermonkey
- Converts `export/import` statements to `window.*` assignments
- Maintains strict file ordering for dependency resolution
- Applies Terser minification while preserving specified class/function names

**Key globals after build:** `window.gitlabApi`, `window.uiManager`, `window.historyManager`

### Module Structure

Files must be processed in specific order defined in `build.js:CONFIG.fileOrder`:

1. **Core Layer** (`lib/core/`)
   - `Utils.js` - Helper functions (URL parsing, formatting)
   - `DataProcessor.js` - Board data extraction and processing
   - `HistoryManager.js` - Historical tracking of estimate changes

2. **API Layer** (`lib/api/`)
   - `APIUtils.js` - Request helpers
   - `GitLabAPI.js` - GitLab REST API integration (issues, comments, labels, milestones)

3. **Storage Layer** (`lib/storage/`)
   - `LocalStorage.js` - Key-value persistence
   - `SettingsStorage.js` - User preferences

4. **UI Layer** (`lib/ui/`)
   - **Components** - Reusable UI elements (`CommandShortcut.js`, `IssueSelector.js`, `Notification.js`, etc.)
   - **Managers** - Feature controllers (`TabManager.js`, `LabelManager.js`, `AssigneeManager.js`, etc.)
   - **Views** - Tab implementations (`SummaryView.js`, `BoardsView.js`, `BulkCommentsView.js`, `StatsView.js`, `SprintManagementView.js`)
   - `UIManager.js` - Main UI orchestrator
   - `index.js` - UI exports and initialization

5. **Entry Point**
   - `main.js` - UserScript header and initialization logic

### Adding New Functionality

**New Tab:** Create `lib/ui/views/YourView.js`, register in `TabManager.js`, initialize in `UIManager.js`

**New Command Shortcut:** Use `addCustomShortcut` in `CommandShortcut.js`, initialize in `BulkCommentsView.js`

**New Manager:** Create `lib/ui/managers/YourManager.js`, add to `CONFIG.fileOrder` in `build.js`, initialize in `UIManager.js`

### Version Management

Version is defined in `build.js:VERSION` constant (currently `1.13`). It updates both the UserScript header and `window.gitLabHelperVersion`.

## Development Setup

1. Enable "Allow access to file URLs" in Tampermonkey settings
2. Create `.env` with `DEV_OUTPUT_PATH=/absolute/path/to/dev.js`
3. Run `npm run watch`
4. Create Tampermonkey dev script pointing to your dev.js path

## Debugging

- Use the `.debug.js` version for readable code
- Check browser console (F12) for errors
- Run `window.uiManager.bulkCommentsView.runAssigneeDiagnostics()` for assignee issues
- The extension only activates on URLs matching `*/boards/*`

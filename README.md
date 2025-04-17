# GitLab Sprint Helper

A powerful browser extension for GitLab that enhances issue management with time tracking, multi-issue selection, and comment shortcuts.

![GitLab Sprint Helper Screenshot](https://example.com/screenshot.png)

## Features

### Time Tracking & Analysis
- **Assignee Time Summary**: View total estimated hours per assignee
- **Board-specific Breakdowns**: See time distribution across different board lists
- **Historical Tracking**: Keep track of how estimates change over time

### Multi-Issue Selection
- **Select Multiple Issues**: Select and act on multiple issues at once
- **Batch Comments**: Add the same comment to multiple issues simultaneously
- **Visual Selection**: Clear visual indicators for selected issues

### Comment Shortcuts
- **Time Estimation**: Quickly add `/estimate` commands with predefined values
- **Labels**: Easily apply labels to issues via dropdown
- **Milestone Management**: Set milestones without typing the full command
- **Assignee Management**: Quickly assign issues to yourself or saved assignees
- **Due Date Handling**: Set due dates with predefined options or custom dates
- **Custom Values**: Support for custom inputs when standard options aren't enough

### GitLab API Integration
- **Direct API Access**: Seamless integration with GitLab's API
- **Issue Information**: View detailed issue information
- **Comment Management**: Add and manage comments directly from the extension
- **Project/Group Context**: Automatically detects and works with project or group boards

## Installation

### Manual Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Create a new script in Tampermonkey
3. Copy the contents of `dist/gitlab-sprint-helper.js` and paste into the new script
4. Save the script
5. ...
6. Profit?

## Usage

### Time Tracking Panel

Once installed, the GitLab Sprint Helper panel appears in the bottom-right corner of GitLab board pages. The panel includes:

1. **Summary Tab**: Shows total hours per assignee
2. **Boards Tab**: Shows time distribution across board lists
3. **History Tab**: Tracks historical changes in time estimates
4. **Bulk Comments Tab**: Provides tools for working with multiple issues at once

### Multi-Issue Selection

To select and work with multiple issues:

1. Navigate to the **Bulk Comments Tab**
2. Click the **Select** button
3. Click on issues to select them (click again to deselect)
4. Use the **Done** button or press **ESC** to confirm selection
5. Add your comment in the text area
6. Click **Send** to apply to all selected issues

### Comment Shortcuts

The Bulk Comments tab includes helpful shortcuts for common GitLab commands:

1. **/estimate**: Set time estimates (1h, 2h, 4h, 8h, 16h, 32h, or custom)
2. **/label**: Add labels to issues
3. **/milestone**: Set or change milestone
4. **/assign**: Assign issues to users
5. **/due**: Set due dates
6. **/weight**: Set issue weight

Simply select an option from the dropdown menu, and the command will be inserted into your comment.

## Development

### Project Structure

```
├── dist/                 # Build output
├── lib/                  # Source code modules
│   ├── api/              # GitLab API integration
│   ├── core/             # Core functionality
│   ├── storage/          # Storage utilities
│   └── ui/               # UI Components
│       ├── components/   # Reusable UI components
│       ├── managers/     # Feature managers
│       └── views/        # Tab views
├── main.js               # Main entry point with UserScript header
├── build.js              # Build script
└── watch.js              # Development file watcher
```

### Setting Up Development Environment

#### Prerequisites

- Node.js (v12 or newer)
- npm (comes with Node.js)
- Tampermonkey browser extension

#### Setup Steps

1. Clone the repository
   ```
   git clone https://gitlab.com/daniel_linkster/gitlab-helper.git
   cd gitlab-helper
   ```

2. Install dependencies
   ```
   npm install
   ```

3. **Important**: Enable local file access in Tampermonkey:
   - Open Tampermonkey settings
   - Go to the "Settings" tab
   - Under "Security", set "Allow access to file URLs" to "Enabled"

4. Create a `.env` file in the project root with your development path:
   ```
   DEV_OUTPUT_PATH=/absolute/path/to/your/dev.js
   ```
   This tells the build script where to output the development version.

5. Start the development watch script:
   ```
   npm run watch
   ```
   This will build the script and watch for changes, rebuilding automatically when files are modified.

6. In Tampermonkey, create a new script with the following content:
   ```javascript
   // ==UserScript==
   // @name         GitLab Sprint Helper (Dev)
   // @namespace    http://tampermonkey.net/
   // @version      1.0
   // @description  Development version of GitLab Sprint Helper
   // @author       You
   // @match        https://gitlab.com/*/boards/*
   // @grant        GM_setValue
   // @grant        GM_getValue
   // @run-at       document-idle
   // ==/UserScript==

   (function() {
       'use strict';
       const script = document.createElement('script');
       script.src = 'file:///absolute/path/to/your/dev.js';
       document.head.appendChild(script);
   })();
   ```

7. Replace the path in the script with the absolute path to your `dist/dev.js` file (same as your DEV_OUTPUT_PATH in .env)

8. Save the script and visit a GitLab board page to test your changes

### Building for Production

To create a production-ready minified script:

```
npm run build
```

This creates:
- `dist/gitlab-sprint-helper.js` - Minified for production
- `dist/gitlab-sprint-helper.debug.js` - Unminified for debugging

### Working with the Codebase

#### Module System

The codebase uses ES6 modules with imports/exports that are bundled during build. The build script handles:

1. Combining all modules into a single file
2. Converting ES6 module syntax to IIFE
3. Minifying the code for production

#### Adding New Features

1. **Adding a New Tab**:
   - Create a new view class in `lib/ui/views/YourTabView.js`
   - Update `TabManager.js` to include your new tab
   - Add any necessary logic to `UIManager.js`

2. **Adding a New Comment Shortcut**:
   - Open `lib/ui/components/CommandShortcut.js`
   - Add a new shortcut using the `addCustomShortcut` method
   - Update the BulkCommentsView to initialize your shortcut

3. **Adding a New Manager**:
   - Create a new manager class in `lib/ui/managers/YourManager.js`
   - Update `UIManager.js` to initialize and use your manager

#### Debugging Tips

1. Use the debug version of the script during development
2. Check the browser console (F12) for logs and errors
3. Use the `console.log()` statements throughout your code for tracing execution
4. For complex issues, the script provides diagnostic functions like `runAssigneeDiagnostics()`

### Recent Changes

Recent updates to the codebase include:

1. **Fixed UI Initialization**: Resolved issues with duplicate initialization and improved error handling.

2. **Notification Positioning**: Changed notification position to bottom-left for better visibility.

3. **Shortcut Order Consistency**: Fixed issues with assign/label shortcuts changing order during initialization.

4. **Label Settings Improvements**:
   - Now shows all available labels, not just whitelisted ones
   - Auto-saves changes when checkboxes are toggled
   - Removed unnecessary input fields and buttons

5. **Assignee Management Fixes**:
   - Improved tab refresh functionality when clicking headers
   - Fixed height consistency to prevent layout shifts
   - More robust assignee loading with multiple fallback methods

6. **Storage Access Improvement**: Enhanced how the script accesses saved data with better error handling and fallbacks.

## Compatibility

- **Browsers**: Chrome, Firefox, Edge, Safari (with Tampermonkey)
- **GitLab Versions**: 13.0+

## Troubleshooting

### Common Issues

1. **Panel not appearing**
   - Make sure you're on a GitLab board page (URL contains `/boards`)
   - Try refreshing the page
   - Check browser console for errors

2. **Issues not loading**
   - GitLab's Vue.js components may have changed structure
   - Check browser console for errors
   - Verify you have sufficient permissions in GitLab

3. **Comment shortcuts not working**
   - Ensure the Bulk Comments tab is active
   - Check if GitLab has changed their comment command syntax

4. **Assignees Not Appearing in Dropdown**
   - Open browser console (F12)
   - Run: `window.uiManager.bulkCommentsView.runAssigneeDiagnostics()`
   - Check the console output to see where your assignees are stored

5. **Labels Not Loading in Settings**
   - Check if you have access to the GitLab API
   - Ensure you're on a valid GitLab project/group board
   - Try refreshing the page and reopening settings

### Reporting Bugs

If you encounter any issues:

1. Check the [issue tracker](https://gitlab.com/daniel_linkster/gitlab-helper/issues)
2. Include your browser and GitLab version
3. Provide steps to reproduce the issue
4. If possible, include screenshots or error messages

## Contributing

We welcome contributions! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Build the script (`npm run build`)
5. Test thoroughly
6. Commit your changes (`git commit -m 'Add amazing feature'`)
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped improve this extension
- GitLab for their excellent API documentation
- Tampermonkey for making browser extensions easier to develop
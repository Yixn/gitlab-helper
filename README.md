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
- **Custom Values**: Support for custom inputs when standard options aren't enough

### GitLab API Integration
- **Direct API Access**: Seamless integration with GitLab's API
- **Issue Information**: View detailed issue information
- **Comment Management**: Add and manage comments directly from the extension

## Installation

### Option 1: Install from Tampermonkey Gallery (Recommended)
1. Make sure you have the [Tampermonkey](https://www.tampermonkey.net/) browser extension installed
2. Visit [our script page](https://example.com/gitlab-sprint-helper) in the Tampermonkey gallery
3. Click "Install"

### Option 2: Manual Installation
1. Install [Tampermonkey](https://www.tampermonkey.net/) for your browser
2. Create a new script in Tampermonkey
3. Copy the contents of `dist/gitlab-sprint-helper.user.js` and paste into the new script
4. Save the script

### Option 3: Development Version
1. Clone this repository
2. Install dependencies with `npm install`
3. Build the script with `npm run build`
4. In Tampermonkey, create a new script and paste the contents of `dist/gitlab-sprint-helper.user.js`

## Usage

### Time Tracking Panel

Once installed, the GitLab Sprint Helper panel appears in the bottom-right corner of GitLab board pages. The panel includes:

1. **Summary Tab**: Shows total hours per assignee
2. **Boards Tab**: Shows time distribution across board lists
3. **History Tab**: Tracks historical changes in time estimates
4. **API Tab**: Provides API tools for working with issues

### Multi-Issue Selection

To select and work with multiple issues:

1. Navigate to the **API Tab**
2. Click the **Select Issues** button
3. Click on issues to select them (click again to deselect)
4. Use the **DONE** button to confirm selection
5. Add your comment in the text area
6. Click **Add Comment** to apply to all selected issues

### Comment Shortcuts

The API tab includes helpful shortcuts for common GitLab commands:

1. **/estimate**: Set time estimates (1h, 2h, 4h, 8h, 16h, 32h, or custom)
2. **/label**: Add labels to issues
3. **/milestone**: Set or change milestone
4. **/assign**: Assign issues to users
5. **/due**: Set due dates

Simply select an option from the dropdown menu, and the command will be inserted into your comment.

## Development

### Project Structure

```
├── dist/                  # Build output
├── lib/                   # Source code modules
│   ├── GitLabAPI.js             # GitLab API integration
│   ├── dataProcessor.js   # Data processing logic
│   ├── history.js         # History tracking functions
│   ├── utils.js           # Utility functions
│   ├── ui/                # UI Components
│   │   ├── ApiTabView.js
│   │   ├── BoardsTabView.js
│   │   ├── CommentShortcuts.js
│   │   ├── HistoryTabView.js
│   │   ├── IssueSelector.js
│   │   ├── SummaryTabView.js
│   │   ├── TabManager.js
│   │   └── UIManager.js
│   └── ui.js              # UI integration
├── main.js                # Main entry point with UserScript header
├── build.js               # Build script
├── watch.js               # Development file watcher
└── package.json           # Project configuration
```

### Building the Extension

#### Prerequisites

- Node.js (v12 or newer)
- npm (comes with Node.js)

#### Setup

1. Clone the repository
   ```
   git clone https://github.com/yourusername/gitlab-sprint-helper.git
   cd gitlab-sprint-helper
   ```

2. Install dependencies
   ```
   npm install
   ```

#### Development Build

For development with automatic rebuilding when files change:

```
npm run watch
```

#### Production Build

To create a production-ready minified script:

```
npm run build
```

This creates:
- `dist/gitlab-sprint-helper.user.js` - Minified for production
- `dist/gitlab-sprint-helper.debug.user.js` - Unminified for debugging

### Adding New Features

#### Adding a New Tab

1. Create a new view class in `lib/ui/YourTabView.js`
2. Update `TabManager.js` to include your new tab
3. Add any necessary logic to `UIManager.js`

#### Adding a New Comment Shortcut

1. Open `lib/ui/CommentShortcuts.js`
2. Add a new shortcut definition using the `addCustomShortcut` method
3. Update the ApiTabView to initialize your shortcut

### Testing

Currently, we use manual testing on GitLab board pages. Future plans include automated testing.

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
   - Ensure the API tab is active
   - Check if GitLab has changed their comment command syntax

### Reporting Bugs

If you encounter any issues:

1. Check the [issue tracker](https://github.com/yourusername/gitlab-sprint-helper/issues)
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

### Code Style

- Use clear, descriptive function and variable names
- Add comments for complex logic
- Follow JavaScript best practices

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Thanks to all contributors who have helped improve this extension
- GitLab for their excellent API documentation
- Tampermonkey for making browser extensions easier to develop
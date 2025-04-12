// LabelManager.js - Handles fetching and filtering labels

class LabelManager {
    constructor(apiTabView) {
        this.apiTabView = apiTabView;

        // Default whitelist (used if no saved whitelist exists)
        this.defaultLabelWhitelist = ['bug', 'feature', 'documentation', 'enhancement', 'security',
            'priority', 'high', 'medium', 'low', 'critical',
            'frontend', 'backend', 'ui', 'ux', 'api',
            'wontfix', 'duplicate', 'invalid', 'question',
            'ready', 'in progress', 'review', 'blocked'];

        // Load saved whitelist or use default
        this.labelWhitelist = this.loadSavedWhitelist();
    }

    /**
     * Load whitelist from localStorage or return default
     * @returns {Array} Whitelist array
     */
    loadSavedWhitelist() {
        const savedWhitelist = localStorage.getItem('gitLabHelperLabelWhitelist');
        if (savedWhitelist) {
            try {
                return JSON.parse(savedWhitelist);
            } catch (e) {
                console.error('Error parsing saved whitelist:', e);
                return [...this.defaultLabelWhitelist];
            }
        }
        return [...this.defaultLabelWhitelist];
    }

    /**
     * Save whitelist to localStorage
     * @param {Array} whitelist - Array of whitelist terms
     */
    saveWhitelist(whitelist) {
        this.labelWhitelist = whitelist;
        localStorage.setItem('gitLabHelperLabelWhitelist', JSON.stringify(whitelist));
    }

    /**
     * Reset whitelist to default values
     */
    resetToDefaultWhitelist() {
        this.labelWhitelist = [...this.defaultLabelWhitelist];
        localStorage.setItem('gitLabHelperLabelWhitelist', JSON.stringify(this.defaultLabelWhitelist));
    }

    /**
     * Check if a label matches the whitelist
     * @param {string} labelName - Label name to check
     * @param {Array} whitelist - Whitelist to check against (optional)
     * @returns {boolean} True if label matches whitelist
     */
    isLabelInWhitelist(labelName, whitelist = this.labelWhitelist) {
        const lowerName = labelName.toLowerCase();
        return whitelist.some(term => lowerName.includes(term.toLowerCase()));
    }

    /**
     * Get the current path from URL (project or group)
     * @returns {Object} Path info object or null if not found
     */
    getPathFromUrl() {
        try {
            // Log the full current URL for debugging
            console.log('Current URL:', window.location.href);
            console.log('Current pathname:', window.location.pathname);

            const pathname = window.location.pathname;

            // Check if this is a group board
            if (pathname.includes('/groups/') && pathname.includes('/-/boards')) {
                // Extract group path for group boards
                // Format: /groups/[group-path]/-/boards
                const groupPattern = /\/groups\/([^\/]+(?:\/[^\/]+)*)\/?\-?\/?boards/;
                const match = pathname.match(groupPattern);

                if (!match || !match[1]) {
                    console.warn('Could not extract group path from URL:', pathname);
                    return null;
                }

                const path = match[1];
                console.log('Extracted group path:', path);

                // Make sure we don't have "/-" at the end of the path
                const cleanPath = path.replace(/\/-$/, '');

                // Correctly encode the path
                const encodedPath = encodeURIComponent(cleanPath);
                console.log('Encoded group path for API:', encodedPath);

                // Construct group API URL
                const apiUrl = `groups/${encodedPath}/labels`;
                console.log('Group API URL that will be used:', apiUrl);

                return {
                    path: cleanPath,
                    encodedPath,
                    type: 'group',
                    apiUrl
                };
            }
            // Check if this is a project board
            else if (pathname.includes('/-/boards')) {
                // Extract project path for project boards
                // Format: /[project-path]/-/boards
                const projectPattern = /^\/([^\/]+(?:\/[^\/]+)*)\/-\/boards/;
                const match = pathname.match(projectPattern);

                if (!match || !match[1]) {
                    console.warn('Could not extract project path from URL pattern:', pathname);
                    return null;
                }

                const path = match[1];
                console.log('Extracted project path:', path);

                // Correctly encode the path
                const encodedPath = encodeURIComponent(path);
                console.log('Encoded project path for API:', encodedPath);

                // Construct project API URL
                const apiUrl = `projects/${encodedPath}/labels`;
                console.log('Project API URL that will be used:', apiUrl);

                return {
                    path,
                    encodedPath,
                    type: 'project',
                    apiUrl
                };
            } else {
                console.warn('Not on a GitLab boards page:', pathname);
                return null;
            }
        } catch (error) {
            console.error('Error extracting path from URL:', error);
            return null;
        }
    }

    /**
     * Fetch labels from GitLab API
     * @returns {Promise<Array>} Array of label objects
     */
    async fetchAllLabels() {
        try {
            // Get path info (project or group)
            const pathInfo = this.getPathFromUrl();
            if (!pathInfo) {
                console.warn('Path info not found, returning empty labels array');
                return [];
            }

            // Fetch labels from API using the correct endpoint
            return await gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                params: { per_page: 100 }
            }).catch(error => {
                console.error(`Error fetching ${pathInfo.type} labels from API:`, error);
                return [];
            });
        } catch (error) {
            console.error('Error in fetchAllLabels:', error);
            return [];
        }
    }

    /**
     * Safe method to insert command that doesn't depend on ShortcutManager
     * @param {HTMLElement} textarea - Textarea element
     * @param {string} command - Command text to insert
     * @param {RegExp} regex - Regex to find existing command
     */
    safeInsertOrReplaceCommand(textarea, command, regex) {
        if (!textarea) return;

        const currentText = textarea.value;

        // Check if there's already a command of this type
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            textarea.value = currentText.replace(regex, command);
            textarea.focus();
        } else {
            // Insert new command at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Add newline if needed
            let insertText = command;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Set cursor position
            const newCursorPos = startPos + insertText.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
            textarea.focus();
        }
    }

    /**
     * Create a styled label element for dropdowns
     * @param {string} labelName - Name of the label
     * @param {string} color - Color of the label (optional)
     * @returns {HTMLElement} Styled label element
     */
    createStyledLabel(labelName, color) {
        const labelElement = document.createElement('span');
        labelElement.textContent = labelName;

        // Use provided color or generate one based on name
        const bgColor = color || this.getColorForLabel(labelName);

        // Calculate text color (black or white) based on background color brightness
        const textColor = this.getContrastColor(bgColor);

        // Apply GitLab label styles
        labelElement.style.backgroundColor = bgColor;
        labelElement.style.color = textColor;
        labelElement.style.padding = '4px 8px';
        labelElement.style.borderRadius = '100px'; // Rounded pill shape
        labelElement.style.fontSize = '12px';
        labelElement.style.fontWeight = '500';
        labelElement.style.display = 'inline-block';
        labelElement.style.margin = '2px';
        labelElement.style.maxWidth = '100%';
        labelElement.style.overflow = 'hidden';
        labelElement.style.textOverflow = 'ellipsis';
        labelElement.style.whiteSpace = 'nowrap';

        return labelElement;
    }

    /**
     * Generate a color based on the label name
     * This ensures consistent colors for the same label names
     * @param {string} name - Label name
     * @returns {string} HEX color code
     */
    getColorForLabel(name) {
        // Simple hash function for the string
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }

        // Generate pastel colors for better readability
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 75%)`;
    }

    /**
     * Determine if text should be black or white based on background color
     * @param {string} bgColor - Background color (hex, rgb, or named color)
     * @returns {string} 'black' or 'white'
     */
    getContrastColor(bgColor) {
        // For HSL colors
        if (bgColor.startsWith('hsl')) {
            // Extract lightness from HSL
            const matches = bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
            if (matches && matches[1]) {
                const lightness = parseInt(matches[1], 10);
                return lightness > 60 ? 'black' : 'white';
            }
        }

        // Convert other color formats to RGB for contrast calculation
        let r = 0, g = 0, b = 0;

        // Try to parse color
        try {
            // Create a temporary element to compute the color
            const elem = document.createElement('div');
            elem.style.backgroundColor = bgColor;
            document.body.appendChild(elem);

            // Get computed style
            const style = window.getComputedStyle(elem);
            const rgb = style.backgroundColor;

            // Remove element
            document.body.removeChild(elem);

            // Parse RGB values
            const rgbMatch = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (rgbMatch) {
                r = parseInt(rgbMatch[1], 10);
                g = parseInt(rgbMatch[2], 10);
                b = parseInt(rgbMatch[3], 10);
            }
        } catch (e) {
            // Fallback for HSL and other formats
            if (bgColor.startsWith('hsl')) {
                return bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/) ?
                    (parseInt(bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/)[1], 10) > 60 ? 'black' : 'white') :
                    'black';
            }
            return 'black'; // Default to black on error
        }

        // Calculate luminance (perceived brightness)
        const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

        // Use white text on dark backgrounds, black on light
        return luminance > 0.5 ? 'black' : 'white';
    }

    /**
     * Fetch labels and add them to shortcuts
     */
    fetchAndAddLabels() {
        try {
            // Get path info (project or group)
            const pathInfo = this.getPathFromUrl();
            if (!pathInfo) {
                console.warn('Could not get path info, using fallback labels');
                this.addFallbackLabels();
                return;
            }

            console.log(`About to call GitLab API for ${pathInfo.type} labels with URL:`, pathInfo.apiUrl);

            // Fetch labels from API
            gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                params: { per_page: 100 }
            }).then(labels => {
                console.log('API call succeeded, received labels:', labels);

                if (!labels || labels.length === 0) {
                    console.warn('No labels found, using fallback labels');
                    this.addFallbackLabels();
                    return;
                }

                // Filter labels using whitelist
                const filteredLabels = labels.filter(label =>
                    this.isLabelInWhitelist(label.name)
                );

                // Sort labels alphabetically
                const sortedLabels = filteredLabels.sort((a, b) =>
                    a.name.localeCompare(b.name)
                );

                // Map to format needed for dropdown with color information
                const labelOptions = sortedLabels.map(label => ({
                    value: label.name,
                    label: label.name,
                    color: label.color
                }));

                // Add empty option at the beginning
                labelOptions.unshift({ value: '', label: 'Add Label' });

                // Add label shortcut if we have labels
                if (labelOptions.length > 1) {
                    this.addLabelShortcut(labelOptions);
                } else {
                    console.warn('No matching labels found after filtering, using fallback');
                    this.addFallbackLabels();
                }
            }).catch(error => {
                console.error(`Error fetching ${pathInfo.type} labels from API:`, error);
                console.error('API URL was:', pathInfo.apiUrl);
                // Use fallback labels on error
                this.addFallbackLabels();
            });
        } catch (error) {
            console.error('Error in fetchAndAddLabels:', error);
            // Use fallback labels on error
            this.addFallbackLabels();
        }
    }

    /**
     * Add fallback labels when API fails
     */
    addFallbackLabels() {
        const fallbackLabels = [
            { value: '', label: 'Add Label' },
            { value: 'bug', label: 'Bug', color: '#d9534f' },
            { value: 'feature', label: 'Feature', color: '#428bca' },
            { value: 'documentation', label: 'Documentation', color: '#5cb85c' },
            { value: 'enhancement', label: 'Enhancement', color: '#5bc0de' },
            { value: 'priority', label: 'Priority', color: '#f0ad4e' }
        ];

        this.addLabelShortcut(fallbackLabels);
    }

    /**
     * Add label shortcut to the shortcuts panel
     * @param {Array} labelOptions - Array of label options for dropdown
     */
    addLabelShortcut(labelOptions) {
        if (!this.apiTabView.commentShortcuts) return;

        // Create custom dropdown renderer that uses GitLab-style labels
        const customLabelRenderer = (label) => {
            // Create a styled label element for each option in the dropdown
            const labelElement = this.createStyledLabel(label.label, label.color);
            return labelElement;
        };

        this.apiTabView.commentShortcuts.addCustomShortcut({
            type: 'label',
            label: '/label',
            items: labelOptions,
            customOptionRenderer: customLabelRenderer, // Custom renderer for GitLab-style labels
            onSelect: (value) => {
                // Get the textarea
                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                // Create the label command
                const labelText = `/label ~${value}`;

                // Check if there's already a label command
                const labelRegex = /\/label\s+~[^\n]+/g;

                // Call the replacement logic - try to use ShortcutManager if available
                if (this.apiTabView.shortcutManager) {
                    this.apiTabView.shortcutManager.replaceOrInsertCommand(textarea, 'label', labelText, labelRegex, () => {
                        // This function is executed if no existing label command is found
                        // Get current cursor position
                        const startPos = textarea.selectionStart;
                        const endPos = textarea.selectionEnd;

                        // Get existing text
                        const currentText = textarea.value;

                        // Check if we need to add a new line before the label
                        let insertText = labelText;
                        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                            insertText = '\n' + insertText;
                        }

                        // Insert text at cursor position
                        const newText = currentText.substring(0, startPos) +
                            insertText +
                            currentText.substring(endPos);

                        // Update textarea value
                        textarea.value = newText;

                        // Set cursor position after inserted text
                        const newCursorPos = startPos + insertText.length;
                        textarea.setSelectionRange(newCursorPos, newCursorPos);
                    });
                } else {
                    // Fallback to our internal method if ShortcutManager isn't available
                    this.safeInsertOrReplaceCommand(textarea, labelText, labelRegex);
                }
            }
        });
    }
}
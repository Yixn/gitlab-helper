// BulkCommentsView.js - Complete Updated Version

/**
 * View for the Bulk Comments tab (previously API tab)
 */
export default class BulkCommentsView {
    /**
     * Constructor for BulkCommentsView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    /**
     * Constructor for BulkCommentsView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssues = []; // Store selected issues
        this.commandShortcuts = null; // Will be initialized when Bulk Comments tab is rendered
        this.isLoading = false;
        this.initializedShortcuts = new Set(); // Track which shortcuts have been initialized

        // Get the GitLab API instance from the window object or uiManager
        this.gitlabApi = window.gitlabApi || (uiManager && uiManager.gitlabApi);

        // Create a notification instance
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Important: Initialize labelManager manually if it's not in uiManager
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else if (typeof LabelManager === 'function') {
            // Make sure LabelManager is imported and available
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    if (this.commandShortcuts) {
                        this.addLabelShortcut();
                    }
                }
            });
        } else {
            // Create a simple placeholder that won't cause errors
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([])
            };
        }

        // Initialize the selection display
        this.selectionDisplay = new SelectionDisplay({
            selectedIssues: this.selectedIssues,
            onRemoveIssue: (index) => this.onRemoveIssue(index)
        });
    }
    /**
     * Initialize all shortcut types
     */
    initializeAllShortcuts() {
        if (!this.commandShortcuts) return;

        // Add label shortcut with fallback labels
        this.addLabelShortcut();

        // Add milestone shortcut
        this.addMilestoneShortcut();

        // Add assign shortcut
        this.addAssignShortcut();

        // We no longer add due date and weight shortcuts
        // This is part of the fix requested by the user
    }

    /**
     * Add milestone shortcut
     */
    addMilestoneShortcut() {
        if (!this.commandShortcuts) return;

        this.commandShortcuts.addCustomShortcut({
            type: 'milestone',
            label: '/milestone',
            items: [
                { value: '', label: 'Set Milestone' },
                { value: '%current', label: 'Current Sprint' },
                { value: '%next', label: 'Next Sprint' },
                { value: '%upcoming', label: 'Upcoming' },
                { value: 'none', label: 'Remove Milestone' },
                { value: 'custom', label: 'Custom...' }
            ],
            onSelect: (value) => {
                if (!value) return;

                if (value === 'custom') {
                    const customMilestone = prompt('Enter milestone name:');
                    if (!customMilestone) return;
                    value = customMilestone;
                }

                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                // Format milestone text based on value
                let milestoneText = '/milestone ';
                if (value === 'none') {
                    milestoneText += '%""';
                } else if (value.startsWith('%')) {
                    milestoneText += value;
                } else {
                    milestoneText += `%"${value}"`;
                }

                this.insertTextAtCursor(textarea, milestoneText);
                this.notification.info(`Milestone set to ${value === 'none' ? 'none' : value}`);
            }
        });
    }

    /**
     * Add assign shortcut
     */
    addAssignShortcut() {
        if (!this.commandShortcuts) return;

        // Start with basic assign items
        let assignItems = [
            { value: '', label: 'Assign to...' },
            { value: '@me', label: 'Myself' },
            { value: 'none', label: 'Unassign' }
        ];

        // Show loading state initially
        this.commandShortcuts.addCustomShortcut({
            type: 'assign',
            label: '/assign',
            items: [
                { value: '', label: 'Loading assignees...' }
            ],
            onSelect: () => {} // No-op while loading
        });

        // Try to fetch group members in the background
        this.fetchGroupMembers()
            .then(members => {
                // Add whitelisted assignees if available
                if (this.assigneeManager) {
                    const whitelistedAssignees = this.assigneeManager.getAssigneeWhitelist();

                    if (whitelistedAssignees.length > 0) {
                        // Add a separator
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

                        // Add whitelisted assignees
                        const whitelistItems = whitelistedAssignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                }

                // Add fetched group members if available
                if (members && members.length > 0) {
                    // Add a separator
                    assignItems.push({ value: 'separator2', label: '────── Group Members ──────' });

                    // Add group members
                    const memberItems = members.map(member => ({
                        value: member.username,
                        label: member.name || member.username
                    }));

                    assignItems = assignItems.concat(memberItems);
                }

                // Update the shortcut with all the items
                this.updateAssignShortcut(assignItems);
            })
            .catch(error => {
                console.error('Error fetching group members:', error);

                // Fallback to just whitelisted assignees
                if (this.assigneeManager) {
                    const whitelistedAssignees = this.assigneeManager.getAssigneeWhitelist();

                    if (whitelistedAssignees.length > 0) {
                        const whitelistItems = whitelistedAssignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                }

                // Update with fallback items
                this.updateAssignShortcut(assignItems);
            });
    }
    /**
     * Update assign shortcut with the provided items
     * @param {Array} items - Items to show in the assign dropdown
     */
    updateAssignShortcut(items) {
        if (!this.commandShortcuts) return;

        // First remove existing shortcut if it exists
        if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign']) {
            this.commandShortcuts.removeShortcut('assign');
        }

        // Then add the new shortcut
        this.commandShortcuts.addCustomShortcut({
            type: 'assign',
            label: '/assign',
            items: items,
            onSelect: (value) => {
                if (!value || value === 'separator' || value === 'separator2') return;

                if (value === 'custom') {
                    const customUser = prompt('Enter GitLab username (without @):');
                    if (!customUser) return;
                    value = customUser;
                }

                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                let assignText = '/assign ';

                if (value === 'none') {
                    assignText += '@none';
                } else if (value === '@me') {
                    assignText += '@me';
                } else {
                    // Handle usernames - prefix with @ if not already there
                    assignText += value.startsWith('@') ? value : `@${value}`;
                }

                this.insertTextAtCursor(textarea, assignText);

                if (value === 'none') {
                    this.notification.info('Issue will be unassigned');
                } else if (value === '@me') {
                    this.notification.info('Issue will be assigned to you');
                } else {
                    this.notification.info(`Issue will be assigned to ${value.replace('@', '')}`);
                }
            }
        });
    }

    /**
     * Fetch members from the current group/project
     * @returns {Promise<Array>} Promise resolving to array of members
     */
    async fetchGroupMembers() {
        try {
            // First, ensure we have an API instance
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                throw new Error('GitLab API not available');
            }

            // Get path info to determine project or group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }

            // Fetch members based on path type
            let members;
            if (pathInfo.type === 'project') {
                members = await this.gitlabApi.callGitLabApi(
                    `projects/${pathInfo.encodedPath}/members`,
                    { params: { per_page: 100 } }
                );
            } else if (pathInfo.type === 'group') {
                members = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    { params: { per_page: 100 } }
                );
            } else {
                throw new Error('Unsupported path type: ' + pathInfo.type);
            }

            // Process members
            return members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));
        } catch (error) {
            console.error('Error fetching group members:', error);
            return [];
        }
    }

    /**
     * Handler when an issue is removed from the selection
     * @param {number} index - Index of the removed issue
     */
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            // Store the removed issue for debugging
            const removedIssue = this.selectedIssues[index];

            // Remove the issue
            this.selectedIssues.splice(index, 1);

            // Update UI manager's issue selector if available
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }
        }

        // Update status message if it exists
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
                statusEl.style.color = '#666';
            }
        }

        // Log for debugging
        console.log(`Removed issue at index ${index}, remaining: ${this.selectedIssues.length}`);
    }

    /**
     * Set multiple selected issues
     * @param {Array} issues - Array of selected issue objects
     */
    setSelectedIssues(issues) {
        // Make a defensive copy to prevent reference issues
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];

        // Update the SelectionDisplay with the new issues
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }

        // Update status message if it exists
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected. Enter your comment and click "Add Comment".`;
                statusEl.style.color = 'green';
            } else if (!this.isLoading) {
                statusEl.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
                statusEl.style.color = '#666';
            }
        }

        // Log for debugging
        console.log(`BulkCommentsView: Set ${this.selectedIssues.length} selected issues`);
    }

    /**
     * Create action buttons (select, submit, clear)
     * @param {HTMLElement} container - Container element
     */
    createActionButtons(container) {
        // Buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';

        // Add select issues button
        const selectBtn = document.createElement('button');
        selectBtn.textContent = '📎 Select Issues';
        selectBtn.style.padding = '8px 12px';
        selectBtn.style.backgroundColor = '#6c757d';
        selectBtn.style.color = 'white';
        selectBtn.style.border = 'none';
        selectBtn.style.borderRadius = '4px';
        selectBtn.style.cursor = 'pointer';
        selectBtn.style.fontSize = '14px';
        selectBtn.style.transition = 'background-color 0.2s ease';
        selectBtn.style.display = 'flex';
        selectBtn.style.alignItems = 'center';
        selectBtn.style.justifyContent = 'center';

        // Add hover effect
        selectBtn.addEventListener('mouseenter', () => {
            selectBtn.style.backgroundColor = '#5a6268';
        });
        selectBtn.addEventListener('mouseleave', () => {
            selectBtn.style.backgroundColor = '#6c757d';
        });

        selectBtn.onclick = () => {
            if (this.uiManager && this.uiManager.issueSelector) {
                // Pass the current selection to maintain it
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                this.uiManager.issueSelector.startSelection();
            } else {
                console.error('Issue selector not initialized');
                const statusEl = document.getElementById('comment-status');
                if (statusEl) {
                    statusEl.textContent = 'Error: Issue selector not initialized.';
                    statusEl.style.color = '#dc3545';
                }
            }
        };
        buttonContainer.appendChild(selectBtn);

        // Add comment button
        const submitBtn = document.createElement('button');
        submitBtn.textContent = '💬 Add Comment';
        submitBtn.style.padding = '8px 12px';
        submitBtn.style.backgroundColor = '#1f75cb';
        submitBtn.style.color = 'white';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '4px';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.fontSize = '14px';
        submitBtn.style.transition = 'background-color 0.2s ease';
        submitBtn.style.display = 'flex';
        submitBtn.style.alignItems = 'center';
        submitBtn.style.justifyContent = 'center';
        submitBtn.style.flex = '1';

        // Add hover effect
        submitBtn.addEventListener('mouseenter', () => {
            submitBtn.style.backgroundColor = '#1a63ac';
        });
        submitBtn.addEventListener('mouseleave', () => {
            submitBtn.style.backgroundColor = '#1f75cb';
        });

        submitBtn.onclick = () => this.submitComments();
        buttonContainer.appendChild(submitBtn);

        // Clear selection button
        const clearBtn = document.createElement('button');
        clearBtn.textContent = '🗑️ Clear';
        clearBtn.style.padding = '8px 12px';
        clearBtn.style.backgroundColor = '#dc3545';
        clearBtn.style.color = 'white';
        clearBtn.style.border = 'none';
        clearBtn.style.borderRadius = '4px';
        clearBtn.style.cursor = 'pointer';
        clearBtn.style.fontSize = '14px';
        clearBtn.style.transition = 'background-color 0.2s ease';
        clearBtn.style.display = 'flex';
        clearBtn.style.alignItems = 'center';
        clearBtn.style.justifyContent = 'center';

        // Add hover effect
        clearBtn.addEventListener('mouseenter', () => {
            clearBtn.style.backgroundColor = '#c82333';
        });
        clearBtn.addEventListener('mouseleave', () => {
            clearBtn.style.backgroundColor = '#dc3545';
        });

        clearBtn.onclick = () => {
            this.clearSelectedIssues();

            // Also clear the selection in IssueSelector
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.clearSelection();
            }
        };
        buttonContainer.appendChild(clearBtn);

        container.appendChild(buttonContainer);
    }

    /**
     * Clear selected issues
     */
    clearSelectedIssues() {
        // Clear local selection
        this.selectedIssues = [];

        // Update the selection display
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues([]);
        }

        // Update status message
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }

        // Show notification
        if (this.notification) {
            this.notification.info('Selection cleared');
        }

        // Log for debugging
        console.log('Cleared selected issues');
    }

    /**
     * For backwards compatibility - set a single selected issue
     * @param {Object} issue - Selected issue object
     */
    setSelectedIssue(issue) {
        this.setSelectedIssues(issue ? [issue] : []);
    }

    /**
     * Render the Bulk Comments tab
     */
    render() {
        const bulkCommentsContent = document.getElementById('bulk-comments-content');
        if (!bulkCommentsContent) return;

        // Clear previous content
        bulkCommentsContent.innerHTML = '';

        // Add comment section
        this.addCommentSection(bulkCommentsContent);
    }

    /**
     * Add comment utility section to Bulk Comments tab
     * @param {HTMLElement} container - Container element
     */
    addCommentSection(container) {
        // Create comment tool section
        const commentSection = document.createElement('div');
        commentSection.classList.add('api-section');
        commentSection.style.marginBottom = '15px';
        commentSection.style.padding = '10px';
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '8px';
        commentSection.style.border = '1px solid #e0e0e0';

        // Add selected issues container
        this.selectionDisplay.createSelectionContainer(commentSection);

        // Add comment input with shortcuts - initially with loading state
        this.createCommentInput(commentSection);

        // Add action buttons
        this.createActionButtons(commentSection);

        // Add status and progress elements
        this.createStatusElements(commentSection);

        // Show loading state
        this.isLoading = true;
        this.showLoadingState();

        // Initialize the shortcuts with placeholder labels
        try {
            this.initializeAllShortcuts();

            // Show initial label shortcut with "Loading..." state
            this.addLabelShortcut([
                { value: '', label: 'Loading labels...' }
            ]);

            // Now try to fetch labels asynchronously
            if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                // Try to fetch labels in the background
                this.labelManager.fetchAllLabels()
                    .then(labels => {
                        // Update the label shortcut with fetched labels
                        this.addLabelShortcut();
                        this.isLoading = false;
                        this.hideLoadingState();
                    })
                    .catch(error => {
                        console.error('Error loading labels:', error);
                        // If fetching fails, update with fallback labels
                        this.addLabelShortcut(this.getFallbackLabels());
                        this.isLoading = false;
                        this.hideLoadingState();
                    });
            } else {
                // No label manager, just use fallbacks
                console.warn('Label manager not available, using fallback labels');
                this.addLabelShortcut(this.getFallbackLabels());
                this.isLoading = false;
                this.hideLoadingState();
            }
        } catch (error) {
            console.error('Error initializing shortcuts:', error);
            this.isLoading = false;
            this.hideLoadingState();
        }

        container.appendChild(commentSection);
    }
    /**
     * Get fallback labels when fetching fails
     * @returns {Array} Array of fallback label items
     */
    getFallbackLabels() {
        return [
            { value: '', label: 'Add Label' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
            { value: 'enhancement', label: 'Enhancement' },
            { value: 'documentation', label: 'Documentation' },
            { value: 'custom', label: 'Custom...' }
        ];
    }
    /**
     * Create comment input and initialize shortcuts
     * @param {HTMLElement} container - Container element
     */
    createCommentInput(container) {
        // Create a wrapper for shortcuts that's full width
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.id = 'shortcuts-wrapper';
        shortcutsWrapper.style.width = '100%';
        shortcutsWrapper.style.marginBottom = '15px';
        container.appendChild(shortcutsWrapper);

        // Comment textarea with improved styling
        const commentInput = document.createElement('textarea');
        commentInput.id = 'issue-comment-input';
        commentInput.placeholder = 'Enter your comment here...';
        commentInput.style.width = '100%';
        commentInput.style.padding = '8px';
        commentInput.style.marginBottom = '12px';
        commentInput.style.borderRadius = '4px';
        commentInput.style.border = '1px solid #ccc';
        commentInput.style.minHeight = '60px';
        commentInput.style.fontSize = '14px';
        commentInput.style.transition = 'border-color 0.2s ease';
        commentInput.style.resize = 'vertical';

        // Add focus effect
        commentInput.addEventListener('focus', () => {
            commentInput.style.borderColor = '#1f75cb';
            commentInput.style.outline = 'none';
            commentInput.style.boxShadow = '0 0 0 2px rgba(31, 117, 203, 0.2)';
        });

        commentInput.addEventListener('blur', () => {
            commentInput.style.borderColor = '#ccc';
            commentInput.style.boxShadow = 'none';
        });

        // Add the textarea after the shortcuts wrapper
        container.appendChild(commentInput);

        // Initialize CommandShortcut with the newly created textarea
        this.commandShortcuts = new CommandShortcut({
            targetElement: commentInput,
            onShortcutInsert: (type, value) => {
                console.log(`Shortcut inserted: ${type} with value ${value}`);
            }
        });

        // Initialize shortcuts container in the wrapper
        this.commandShortcuts.initialize(shortcutsWrapper);
    }

    /**
     * Insert text at cursor position in textarea
     * @param {HTMLElement} textarea - The textarea element
     * @param {string} text - Text to insert
     */
    insertTextAtCursor(textarea, text) {
        if (!textarea) return;

        // Get current text
        const currentText = textarea.value;

        // Get cursor position
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;

        // Check if we need to add a new line before the text
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }

        // Insert text at cursor position
        textarea.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);

        // Set cursor position after inserted text
        const newCursorPos = startPos + insertText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);

        // Focus textarea
        textarea.focus();
    }

    /**
     * Create status message and progress bar elements
     * @param {HTMLElement} container - Container element
     */
    createStatusElements(container) {
        // Status message
        const statusMsg = document.createElement('div');
        statusMsg.id = 'comment-status';
        statusMsg.style.fontSize = '12px';
        statusMsg.style.marginTop = '5px';
        statusMsg.style.fontStyle = 'italic';
        statusMsg.textContent = 'Loading shortcuts...';
        statusMsg.style.color = '#1f75cb';
        container.appendChild(statusMsg);

        // Progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.id = 'comment-progress-container';
        progressContainer.style.display = 'none';
        progressContainer.style.marginTop = '10px';

        const progressLabel = document.createElement('div');
        progressLabel.id = 'comment-progress-label';
        progressLabel.textContent = 'Submitting comments...';
        progressLabel.style.fontSize = '12px';
        progressLabel.style.marginBottom = '5px';
        progressContainer.appendChild(progressLabel);

        const progressBarOuter = document.createElement('div');
        progressBarOuter.style.height = '10px';
        progressBarOuter.style.backgroundColor = '#e9ecef';
        progressBarOuter.style.borderRadius = '5px';
        progressBarOuter.style.overflow = 'hidden';

        const progressBarInner = document.createElement('div');
        progressBarInner.id = 'comment-progress-bar';
        progressBarInner.style.height = '100%';
        progressBarInner.style.width = '0%';
        progressBarInner.style.backgroundColor = '#1f75cb';
        progressBarInner.style.transition = 'width 0.3s ease';

        progressBarOuter.appendChild(progressBarInner);
        progressContainer.appendChild(progressBarOuter);
        container.appendChild(progressContainer);
    }

    /**
     * Show loading state for shortcuts
     */
    showLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Loading shortcuts...';
            statusEl.style.color = '#1f75cb';
        }

        // Disable comment input while loading
        const commentInput = document.getElementById('issue-comment-input');
        if (commentInput) {
            commentInput.disabled = true;
            commentInput.style.opacity = '0.7';
            commentInput.style.cursor = 'not-allowed';
        }

        // Disable buttons while loading
        const buttons = document.querySelectorAll('.api-section button');
        buttons.forEach(button => {
            button.disabled = true;
            button.style.opacity = '0.7';
            button.style.cursor = 'not-allowed';
        });
    }

    /**
     * Hide loading state for shortcuts
     */
    hideLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'Ready. Select issues to add comments.';
                statusEl.style.color = '#28a745';
            }
        }

        // Enable comment input
        const commentInput = document.getElementById('issue-comment-input');
        if (commentInput) {
            commentInput.disabled = false;
            commentInput.style.opacity = '1';
            commentInput.style.cursor = 'text';
        }

        // Enable buttons
        const buttons = document.querySelectorAll('.api-section button');
        buttons.forEach(button => {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        });
    }

    /**
     * Submit comments to all selected issues
     */
    async submitComments() {
        const commentEl = document.getElementById('issue-comment-input');
        const statusEl = document.getElementById('comment-status');
        const progressContainer = document.getElementById('comment-progress-container');
        const progressBar = document.getElementById('comment-progress-bar');
        const progressLabel = document.getElementById('comment-progress-label');

        if (this.selectedIssues.length === 0) {
            this.notification.error('No issues selected');
            if (statusEl) {
                statusEl.textContent = 'Error: No issues selected.';
                statusEl.style.color = '#dc3545';
            }
            return;
        }

        const comment = commentEl.value.trim();
        if (!comment) {
            this.notification.error('Comment cannot be empty');
            if (statusEl) {
                statusEl.textContent = 'Error: Comment cannot be empty.';
                statusEl.style.color = '#dc3545';
            }
            return;
        }

        // Update status and show progress bar
        if (statusEl) {
            statusEl.textContent = `Submitting comments to ${this.selectedIssues.length} issues...`;
            statusEl.style.color = '#1f75cb';
        }

        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';

        // Disable submit button during operation
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent && b.textContent.includes('Add Comment'));

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        let successCount = 0;
        let failCount = 0;

        // Check if gitlabApi is available
        const gitlabApi = window.gitlabApi || (this.uiManager && this.uiManager.gitlabApi);

        if (!gitlabApi) {
            this.notification.error('GitLab API not available');
            if (statusEl) {
                statusEl.textContent = 'Error: GitLab API not available.';
                statusEl.style.color = '#dc3545';
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }

            return;
        }

        // Process issues one by one
        for (let i = 0; i < this.selectedIssues.length; i++) {
            const issue = this.selectedIssues[i];

            // Update progress
            const progress = Math.round((i / this.selectedIssues.length) * 100);
            progressBar.style.width = `${progress}%`;
            progressLabel.textContent = `Processing ${i+1} of ${this.selectedIssues.length} issues...`;

            try {
                // Submit comment to this issue
                await gitlabApi.addComment(issue, comment);
                successCount++;
            } catch (error) {
                console.error(`Failed to add comment to issue #${issue.iid}:`, error);
                failCount++;
            }
        }

        // Final progress update
        progressBar.style.width = '100%';

        // Enable submit button again
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }

        // Update status based on results
        if (successCount === this.selectedIssues.length) {
            if (statusEl) {
                statusEl.textContent = `Successfully added comment to all ${successCount} issues!`;
                statusEl.style.color = 'green';
            }

            this.notification.success(`Added comment to ${successCount} issues`);

            // Clear the input after success
            commentEl.value = '';

            // Hide progress bar after a delay
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);

            // Clear selected issues after a delay
            setTimeout(() => {
                this.clearSelectedIssues();
                if (statusEl) {
                    statusEl.textContent = '';
                }
            }, 3000);
        } else {
            if (statusEl) {
                statusEl.textContent = `Added comment to ${successCount} issues, failed for ${failCount} issues.`;
                statusEl.style.color = successCount > 0 ? '#ff9900' : '#dc3545';
            }

            // Show appropriate notification
            if (successCount > 0) {
                this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);
            } else {
                this.notification.error(`Failed to add comments to all ${failCount} issues`);
            }

            // Keep progress bar visible for failed operations
            progressBar.style.backgroundColor = successCount > 0 ? '#ff9900' : '#dc3545';
        }
    }

    /**
     * Add label shortcut using provided labels or from label manager
     * @param {Array} customLabels - Optional custom labels to use instead of from labelManager
     */
    addLabelShortcut(customLabels) {
        if (!this.commandShortcuts) return;

        // Use provided labels, or try to get them from labelManager, or use fallbacks
        let labelItems;

        if (customLabels) {
            // Use provided custom labels
            labelItems = customLabels;
        } else if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
            // Get labels from label manager if available
            labelItems = [{ value: '', label: 'Add Label' }];

            // Add actual labels from label manager
            const labels = this.labelManager.filteredLabels.map(label => ({
                value: label.name,
                label: label.name
            }));

            labelItems = labelItems.concat(labels);

            // Add custom option
            labelItems.push({ value: 'custom', label: 'Custom...' });
        } else {
            // Fallback if no labels available
            labelItems = this.getFallbackLabels();
        }

        // First remove existing shortcut if it exists
        if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label']) {
            this.commandShortcuts.removeShortcut('label');
        }

        // Then add the new shortcut
        this.commandShortcuts.addCustomShortcut({
            type: 'label',
            label: '/label',
            items: labelItems,
            onSelect: (value) => {
                if (!value) return;

                if (value === 'custom') {
                    const customLabel = prompt('Enter custom label name:');
                    if (!customLabel) return;
                    value = customLabel;
                }

                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                // Create the label command
                const labelText = `/label ~"${value}"`;

                this.insertTextAtCursor(textarea, labelText);
                this.notification.info(`Label added: ${value}`);
            }
        });
    }
}
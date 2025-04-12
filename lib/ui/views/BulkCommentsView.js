// BulkCommentsView.js - Complete Updated Version

/**
 * View for the Bulk Comments tab (previously API tab)
 */
export default class BulkCommentsView {
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
        const gitlabApi = window.gitlabApi || (uiManager && uiManager.gitlabApi);

        // Create a notification instance
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Initialize managers with proper dependencies
        this.labelManager = new LabelManager({
            gitlabApi: gitlabApi,
            onLabelsLoaded: (labels) => {
                console.log('Labels loaded:', labels.length);
                // Refresh shortcuts when labels are loaded
                if (this.commandShortcuts) {
                    this.addLabelShortcut();
                }
            }
        });

        // Initialize the selection display with proper configuration
        this.selectionDisplay = new SelectionDisplay({
            selectedIssues: this.selectedIssues,
            onRemoveIssue: (index) => this.onRemoveIssue(index)
        });
    }

    /**
     * Handler when an issue is removed from the selection
     * @param {number} index - Index of the removed issue
     */
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            this.selectedIssues.splice(index, 1);
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

        // Add comment input with shortcuts
        this.createCommentInput(commentSection);

        // Add action buttons
        this.createActionButtons(commentSection);

        // Add status and progress elements
        this.createStatusElements(commentSection);

        // Show loading state
        this.isLoading = true;
        this.showLoadingState();

        // Initialize the shortcuts
        setTimeout(() => {
            this.initializeAllShortcuts();

            // Fetch labels in the background
            this.labelManager.fetchAllLabels()
                .then(() => {
                    // Once labels are loaded, refresh the label shortcut
                    this.addLabelShortcut();
                    this.isLoading = false;
                    this.hideLoadingState();
                })
                .catch(error => {
                    console.error('Error loading labels:', error);
                    this.isLoading = false;
                    this.hideLoadingState();
                });
        }, 100);

        container.appendChild(commentSection);
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

        // Add due date shortcut
        this.addDueDateShortcut();

        // Add weight shortcut
        this.addWeightShortcut();
    }

    /**
     * Add label shortcut using available labels or fallbacks
     */
    addLabelShortcut() {
        if (!this.commandShortcuts) return;

        // Get labels from label manager if available
        let labelItems = [{ value: '', label: 'Add Label' }];

        if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
            // Add actual labels from label manager
            const labels = this.labelManager.filteredLabels.map(label => ({
                value: label.name,
                label: label.name
            }));

            labelItems = labelItems.concat(labels);
        } else {
            // Add fallback labels
            labelItems = labelItems.concat([
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' },
                { value: 'enhancement', label: 'Enhancement' },
                { value: 'documentation', label: 'Documentation' }
            ]);
        }

        // Add custom label option
        labelItems.push({ value: 'custom', label: 'Custom...' });

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

        this.commandShortcuts.addCustomShortcut({
            type: 'assign',
            label: '/assign',
            items: [
                { value: '', label: 'Assign to...' },
                { value: '@me', label: 'Myself' },
                { value: 'none', label: 'Unassign' },
                { value: 'custom', label: 'Custom User...' }
            ],
            onSelect: (value) => {
                if (!value) return;

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
     * Add due date shortcut
     */
    addDueDateShortcut() {
        if (!this.commandShortcuts) return;

        // Calculate some common dates
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        // Format the dates
        const formatDate = (date) => {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        this.commandShortcuts.addCustomShortcut({
            type: 'due',
            label: '/due',
            items: [
                { value: '', label: 'Set Due Date' },
                { value: formatDate(today), label: 'Today' },
                { value: formatDate(tomorrow), label: 'Tomorrow' },
                { value: formatDate(nextWeek), label: 'Next Week' },
                { value: 'none', label: 'Remove Due Date' },
                { value: 'custom', label: 'Custom Date...' }
            ],
            onSelect: (value) => {
                if (!value) return;

                if (value === 'custom') {
                    const customDate = prompt('Enter due date (YYYY-MM-DD):', formatDate(today));
                    if (!customDate) return;

                    // Validate date format
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
                        this.notification.error('Invalid date format. Please use YYYY-MM-DD');
                        return;
                    }

                    value = customDate;
                }

                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                // Create the due date command
                let dueText = '/due ';

                if (value === 'none') {
                    dueText += 'none';
                } else {
                    dueText += value;
                }

                this.insertTextAtCursor(textarea, dueText);

                if (value === 'none') {
                    this.notification.info('Due date will be removed');
                } else {
                    this.notification.info(`Due date set to ${value}`);
                }
            }
        });
    }

    /**
     * Add weight shortcut
     */
    addWeightShortcut() {
        if (!this.commandShortcuts) return;

        this.commandShortcuts.addCustomShortcut({
            type: 'weight',
            label: '/weight',
            items: [
                { value: '', label: 'Set Weight' },
                { value: '1', label: '1 (Trivial)' },
                { value: '2', label: '2 (Small)' },
                { value: '3', label: '3 (Medium)' },
                { value: '5', label: '5 (Large)' },
                { value: '8', label: '8 (Very Large)' },
                { value: 'none', label: 'Remove Weight' },
                { value: 'custom', label: 'Custom Weight...' }
            ],
            onSelect: (value) => {
                if (!value) return;

                if (value === 'custom') {
                    const customWeight = prompt('Enter weight (number):', '');
                    if (!customWeight) return;

                    // Validate weight
                    const weight = parseInt(customWeight, 10);
                    if (isNaN(weight) || weight < 0) {
                        this.notification.error('Invalid weight. Please enter a positive number');
                        return;
                    }

                    value = customWeight;
                }

                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                // Create the weight command
                let weightText = '/weight ';

                if (value === 'none') {
                    weightText += 'none';
                } else {
                    weightText += value;
                }

                this.insertTextAtCursor(textarea, weightText);

                if (value === 'none') {
                    this.notification.info('Weight will be removed');
                } else {
                    this.notification.info(`Weight set to ${value}`);
                }
            }
        });
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

        clearBtn.onclick = () => this.clearSelectedIssues();
        buttonContainer.appendChild(clearBtn);

        container.appendChild(buttonContainer);
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
     * Clear selected issues
     */
    clearSelectedIssues() {
        this.selectedIssues = [];

        // Update the selection display
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues([]);
        }

        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }

        this.notification.info('Selection cleared');
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
     * Set multiple selected issues
     * @param {Array} issues - Array of selected issue objects
     */
    setSelectedIssues(issues) {
        this.selectedIssues = issues || [];

        // Update the SelectionDisplay with the new issues
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }

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
    }

    /**
     * For backwards compatibility - set a single selected issue
     * @param {Object} issue - Selected issue object
     */
    setSelectedIssue(issue) {
        this.setSelectedIssues(issue ? [issue] : []);
    }
}
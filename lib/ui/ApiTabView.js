// ApiTabView.js - Main coordinator for the Bulk Comments tab UI

class ApiTabView {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssues = []; // Store selected issues
        this.commentShortcuts = null; // Will be initialized when Bulk Comments tab is rendered
        this.isLoading = false;
        this.initializedShortcuts = new Set(); // Track which shortcuts have been initialized

        // Initialize managers
        this.labelManager = new LabelManager(this);
        this.shortcutManager = new ShortcutManager(this);
        this.selectionDisplay = new IssueSelectionDisplay(this);
    }

    /**
     * Render the Bulk Comments tab
     */
    render() {
        const apiContent = document.getElementById('bulk-comments-content');
        if (!apiContent) return;

        // Clear previous content
        apiContent.innerHTML = '';

        // Add comment section
        this.addCommentSection(apiContent);
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

        // Load labels and initialize shortcuts
        this.isLoading = true;
        this.showLoadingState();

        // Initialize the shortcuts first with placeholders
        this.initializeShortcuts();

        // Then fetch actual data
        Promise.all([
            this.labelManager.fetchAndAddLabels(),
            this.shortcutManager.addCustomShortcuts(),
            this.shortcutManager.fetchGitLabAssignees()
        ]).then(() => {
            this.isLoading = false;
            this.hideLoadingState();
        }).catch(error => {
            console.error('Error initializing shortcuts:', error);
            this.isLoading = false;
            this.hideLoadingState();
        });

        container.appendChild(commentSection);
    }

    /**
     * Create comment input and initialize shortcuts
     * @param {HTMLElement} container - Container element
     */
    createCommentInput(container) {
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

        // Initialize shortcuts
        this.commentShortcuts = new CommentShortcuts({
            targetElement: commentInput,
            onShortcutInsert: (type, value) => {
                console.log(`Shortcut inserted: ${type} with value ${value}`);
            }
        });

        container.appendChild(commentInput);

        // Initialize shortcuts container
        this.commentShortcuts.initialize(container);
    }

    /**
     * Initialize shortcuts with placeholder data while loading
     */
    initializeShortcuts() {
        if (!this.commentShortcuts) return;

        // Add placeholder label shortcut
        if (!this.initializedShortcuts.has('label')) {
            this.labelManager.addFallbackLabels();
            this.initializedShortcuts.add('label');
        }

        // Initialize other shortcuts if not already done
        if (!this.initializedShortcuts.has('shortcuts')) {
            this.shortcutManager.addCustomShortcuts();
            this.initializedShortcuts.add('shortcuts');
        }
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
            statusEl.textContent = 'Ready. Select issues to add comments.';
            statusEl.style.color = '#28a745';
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
     * Clear selected issues
     */
    clearSelectedIssues() {
        this.selectedIssues = [];
        this.selectionDisplay.updateDisplay();

        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }
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
            statusEl.textContent = 'Error: No issues selected.';
            statusEl.style.color = '#dc3545';
            return;
        }

        const comment = commentEl.value.trim();
        if (!comment) {
            statusEl.textContent = 'Error: Comment cannot be empty.';
            statusEl.style.color = '#dc3545';
            return;
        }

        // Update status and show progress bar
        statusEl.textContent = `Submitting comments to ${this.selectedIssues.length} issues...`;
        statusEl.style.color = '#1f75cb';
        progressContainer.style.display = 'block';
        progressBar.style.width = '0%';

        // Disable submit button during operation
        const submitBtn = document.querySelector('button');
        if (submitBtn && submitBtn.textContent.includes('Add Comment')) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        let successCount = 0;
        let failCount = 0;

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
        if (submitBtn && submitBtn.textContent.includes('Add Comment')) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }

        // Update status based on results
        if (successCount === this.selectedIssues.length) {
            statusEl.textContent = `Successfully added comment to all ${successCount} issues!`;
            statusEl.style.color = 'green';

            // Clear the input after success
            commentEl.value = '';

            // Create notification for better user feedback
            this.showSuccessNotification(successCount);

            // Hide progress bar after a delay
            setTimeout(() => {
                progressContainer.style.display = 'none';
            }, 2000);

            // Clear selected issues after a delay
            setTimeout(() => {
                this.clearSelectedIssues();
                statusEl.textContent = '';
            }, 3000);
        } else {
            statusEl.textContent = `Added comment to ${successCount} issues, failed for ${failCount} issues.`;
            statusEl.style.color = successCount > 0 ? '#ff9900' : '#dc3545';

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
        this.selectionDisplay.updateDisplay();

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

    /**
     * Show a temporary success notification
     * @param {number} count - Number of successful comments
     */
    showSuccessNotification(count = 1) {
        const notification = document.createElement('div');
        notification.textContent = count === 1
            ? 'Comment added successfully!'
            : `Comments added to ${count} issues successfully!`;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = '#28a745';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        notification.style.zIndex = '1001';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Animate out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';

            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}
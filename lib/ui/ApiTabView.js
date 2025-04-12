// ApiTabView.js - Manages the API tab UI with multi-issue selection and shortcuts

class ApiTabView {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssues = []; // Now an array to support multiple issues
        this.commentShortcuts = null; // Will be initialized when API tab is rendered
    }

    /**
     * Render the API tab
     */
    render() {
        const apiContent = document.getElementById('api-info-content');
        if (!apiContent) return;

        // Clear previous content
        apiContent.innerHTML = '';

        // Create header
        const header = document.createElement('h4');
        header.textContent = 'GitLab API Tools';
        header.style.margin = '0 0 10px 0';
        apiContent.appendChild(header);

        // Create loading indicator
        const loadingDiv = document.createElement('div');
        loadingDiv.id = 'api-loading';
        loadingDiv.textContent = 'Loading user info...';
        loadingDiv.style.fontSize = '12px';
        loadingDiv.style.color = '#666';
        loadingDiv.style.fontStyle = 'italic';
        apiContent.appendChild(loadingDiv);

        // Load user info
        this.loadUserInfo(apiContent);
    }

    /**
     * Load user information from GitLab API
     * @param {HTMLElement} container - Container element
     */
    loadUserInfo(container) {
        gitlabApi.getCurrentUser()
            .then(user => {
                // Remove loading indicator
                document.getElementById('api-loading')?.remove();

                // Add user info
                const userInfo = document.createElement('div');
                userInfo.classList.add('api-section');
                userInfo.style.marginBottom = '15px';

                const userHeader = document.createElement('div');
                userHeader.style.fontWeight = 'bold';
                userHeader.style.marginBottom = '5px';
                userHeader.textContent = 'Current User:';
                userInfo.appendChild(userHeader);

                const userName = document.createElement('div');
                userName.textContent = `${user.name} (${user.username})`;
                userInfo.appendChild(userName);

                container.appendChild(userInfo);

                // Add utility sections after user loaded
                this.addCommentSection(container);
            })
            .catch(error => {
                const errorDiv = document.getElementById('api-loading');
                if (errorDiv) {
                    errorDiv.textContent = `Error: ${error.message}`;
                    errorDiv.style.color = '#dc3545';
                }
                console.error("Error fetching user info:", error);

                // Still add utility section even if user info fails
                this.addCommentSection(container);
            });
    }

    /**
     * Add comment utility section to API tab with multi-selection support
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

        const commentHeader = document.createElement('div');
        commentHeader.style.fontWeight = 'bold';
        commentHeader.style.marginBottom = '10px';
        commentHeader.textContent = 'Add Comment to Selected Issues';
        commentSection.appendChild(commentHeader);

        // Selected issues container - enhanced to show multiple
        const selectedIssuesContainer = document.createElement('div');
        selectedIssuesContainer.style.marginBottom = '12px';
        selectedIssuesContainer.style.padding = '8px';
        selectedIssuesContainer.style.borderRadius = '4px';
        selectedIssuesContainer.style.border = '1px dashed #ccc';
        selectedIssuesContainer.style.backgroundColor = '#f9f9f9';
        selectedIssuesContainer.style.maxHeight = '150px';
        selectedIssuesContainer.style.overflowY = 'auto';

        const issueLabel = document.createElement('div');
        issueLabel.style.fontSize = '12px';
        issueLabel.style.color = '#666';
        issueLabel.style.marginBottom = '5px';
        issueLabel.textContent = 'Selected Issues:';
        selectedIssuesContainer.appendChild(issueLabel);

        // This will be our container for issue list
        const selectedIssuesList = document.createElement('div');
        selectedIssuesList.id = 'selected-issues-list';
        selectedIssuesList.style.fontSize = '14px';

        // Display "No issues selected" initially
        const noIssuesSelected = document.createElement('div');
        noIssuesSelected.id = 'no-issues-selected';
        noIssuesSelected.textContent = 'No issues selected';
        noIssuesSelected.style.color = '#666';
        noIssuesSelected.style.fontStyle = 'italic';
        selectedIssuesList.appendChild(noIssuesSelected);

        selectedIssuesContainer.appendChild(selectedIssuesList);
        commentSection.appendChild(selectedIssuesContainer);

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

        // Initialize shortcuts after textarea is created but before adding to DOM
        // This is important so the shortcuts appear above the textarea
        this.commentShortcuts = new CommentShortcuts({
            targetElement: commentInput,
            onShortcutInsert: (type, value) => {
                console.log(`Shortcut inserted: ${type} with value ${value}`);
                // Additional logic can be added here if needed
            }
        });

        // Add comment shortcuts before the textarea
        commentSection.appendChild(commentInput);

        // Initialize shortcuts after adding textarea to the DOM
        this.commentShortcuts.initialize(commentSection);

        // Buttons container for better alignment
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';

        // Add select issue button with improved styling
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

        selectBtn.onclick = () => this.uiManager.issueSelector.startSelection();
        buttonContainer.appendChild(selectBtn);

        // Submit button with improved styling
        const submitBtn = document.createElement('button');
        submitBtn.textContent = '💬 Add Commenta';
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

        // Clear button for selected issues
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

        commentSection.appendChild(buttonContainer);

        // Status message with improved styling
        const statusMsg = document.createElement('div');
        statusMsg.id = 'comment-status';
        statusMsg.style.fontSize = '12px';
        statusMsg.style.marginTop = '5px';
        statusMsg.style.fontStyle = 'italic';
        commentSection.appendChild(statusMsg);

        // Progress bar container for showing multi-comment progress
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
        commentSection.appendChild(progressContainer);

        // Add custom shortcuts if needed
        this.addCustomShortcuts();

        container.appendChild(commentSection);
    }

    /**
     * Add custom shortcuts beyond the default estimate shortcut
     */
    addCustomShortcuts() {
        if (!this.commentShortcuts) return;

        // Example of adding a custom label shortcut
        this.commentShortcuts.addCustomShortcut({
            type: 'label',
            label: '/label',
            items: [
                { value: '', label: 'Add Label' },
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' },
                { value: 'documentation', label: 'Documentation' },
                { value: 'enhancement', label: 'Enhancement' },
                { value: 'security', label: 'Security' }
            ],
            onSelect: (value) => {
                // Get the textarea
                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                // Insert label command
                const labelText = `/label ~${value}`;

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

                // Set focus back to textarea
                textarea.focus();

                // Set cursor position after inserted text
                const newCursorPos = startPos + insertText.length;
                textarea.setSelectionRange(newCursorPos, newCursorPos);
            }
        });
    }

    /**
     * Clear selected issues
     */
    clearSelectedIssues() {
        this.selectedIssues = [];
        this.updateSelectedIssuesDisplay();

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
     * Set multiple selected issues with improved UI
     * @param {Array} issues - Array of selected issue objects
     */
    setSelectedIssues(issues) {
        this.selectedIssues = issues || [];
        this.updateSelectedIssuesDisplay();

        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected. Enter your comment and click "Add Comment".`;
            statusEl.style.color = 'green';
        }
    }

    /**
     * Update the display of selected issues
     */
    updateSelectedIssuesDisplay() {
        const listEl = document.getElementById('selected-issues-list');
        const noIssuesEl = document.getElementById('no-issues-selected');

        if (!listEl) return;

        // Clear existing list
        listEl.innerHTML = '';

        if (this.selectedIssues.length === 0) {
            // Show "No issues selected" message
            const noIssues = document.createElement('div');
            noIssues.id = 'no-issues-selected';
            noIssues.textContent = 'No issues selected';
            noIssues.style.color = '#666';
            noIssues.style.fontStyle = 'italic';
            listEl.appendChild(noIssues);

            // Reset container styling
            const container = listEl.parentElement;
            if (container) {
                container.style.borderColor = '#ccc';
                container.style.backgroundColor = '#f9f9f9';
            }

            return;
        }

        // Enhance container styling
        const container = listEl.parentElement;
        if (container) {
            container.style.borderColor = '#1f75cb';
            container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
        }

        // Create list of issues
        this.selectedIssues.forEach((issue, index) => {
            const issueItem = document.createElement('div');
            issueItem.className = 'selected-issue-item';
            issueItem.style.padding = '5px';
            issueItem.style.marginBottom = '3px';
            issueItem.style.borderRadius = '3px';
            issueItem.style.backgroundColor = 'rgba(31, 117, 203, 0.1)';
            issueItem.style.display = 'flex';
            issueItem.style.justifyContent = 'space-between';
            issueItem.style.alignItems = 'center';

            const issueInfo = document.createElement('div');
            issueInfo.innerHTML = `<strong>#${issue.iid}</strong> - ${issue.title}`;
            issueInfo.style.overflow = 'hidden';
            issueInfo.style.textOverflow = 'ellipsis';
            issueInfo.style.whiteSpace = 'nowrap';
            issueInfo.style.marginRight = '5px';
            issueItem.appendChild(issueInfo);

            // Add remove button
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.style.backgroundColor = 'transparent';
            removeBtn.style.border = 'none';
            removeBtn.style.color = '#dc3545';
            removeBtn.style.fontSize = '16px';
            removeBtn.style.fontWeight = 'bold';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.padding = '0 5px';
            removeBtn.title = 'Remove this issue';

            // Add hover effect
            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.color = '#c82333';
            });

            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.color = '#dc3545';
            });

            // Add click handler to remove this issue
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.selectedIssues.splice(index, 1);
                this.updateSelectedIssuesDisplay();

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
            };

            issueItem.appendChild(removeBtn);
            listEl.appendChild(issueItem);
        });
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
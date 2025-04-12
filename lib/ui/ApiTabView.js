// ApiTabView.js - Manages the API tab UI with improved issue selection

class ApiTabView {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssue = null;
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
     * Add comment utility section to API tab with improved selection UI
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
        commentHeader.textContent = 'Add Comment to Selected Issue';
        commentSection.appendChild(commentHeader);

        // Selected issue display with improved styling
        const selectedIssueContainer = document.createElement('div');
        selectedIssueContainer.style.marginBottom = '12px';
        selectedIssueContainer.style.padding = '8px';
        selectedIssueContainer.style.borderRadius = '4px';
        selectedIssueContainer.style.border = '1px dashed #ccc';
        selectedIssueContainer.style.backgroundColor = '#f9f9f9';

        const issueLabel = document.createElement('div');
        issueLabel.style.fontSize = '12px';
        issueLabel.style.color = '#666';
        issueLabel.style.marginBottom = '3px';
        issueLabel.textContent = 'Selected Issue:';
        selectedIssueContainer.appendChild(issueLabel);

        const selectedIssue = document.createElement('div');
        selectedIssue.id = 'selected-issue-display';
        selectedIssue.style.fontSize = '14px';
        selectedIssue.style.color = '#666';
        selectedIssue.textContent = 'No issue selected';
        selectedIssueContainer.appendChild(selectedIssue);

        commentSection.appendChild(selectedIssueContainer);

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

        commentSection.appendChild(commentInput);

        // Buttons container for better alignment
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';

        // Add select issue button with improved styling
        const selectBtn = document.createElement('button');
        selectBtn.textContent = '📎 Select Issue';
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

        submitBtn.onclick = () => this.submitComment();
        buttonContainer.appendChild(submitBtn);

        commentSection.appendChild(buttonContainer);

        // Status message with improved styling
        const statusMsg = document.createElement('div');
        statusMsg.id = 'comment-status';
        statusMsg.style.fontSize = '12px';
        statusMsg.style.marginTop = '5px';
        statusMsg.style.fontStyle = 'italic';
        commentSection.appendChild(statusMsg);

        container.appendChild(commentSection);
    }

    /**
     * Submit a comment to the selected issue
     */
    submitComment() {
        const commentEl = document.getElementById('issue-comment-input');
        const statusEl = document.getElementById('comment-status');

        if (!this.selectedIssue) {
            statusEl.textContent = 'Error: No issue selected.';
            statusEl.style.color = '#dc3545';
            return;
        }

        const comment = commentEl.value.trim();
        if (!comment) {
            statusEl.textContent = 'Error: Comment cannot be empty.';
            statusEl.style.color = '#dc3545';
            return;
        }

        // Update status
        statusEl.textContent = 'Submitting comment...';
        statusEl.style.color = '#1f75cb';

        // Submit comment
        gitlabApi.addComment(this.selectedIssue, comment)
            .then(response => {
                statusEl.textContent = 'Comment added successfully!';
                statusEl.style.color = 'green';

                // Clear the input
                commentEl.value = '';

                // Create notification for better user feedback
                this.showSuccessNotification();

                // Clear selected issue after success
                setTimeout(() => {
                    this.selectedIssue = null;
                    document.getElementById('selected-issue-display').textContent = 'No issue selected';
                    document.getElementById('selected-issue-display').style.color = '#666';
                    document.getElementById('selected-issue-display').style.fontWeight = 'normal';
                    statusEl.textContent = '';
                }, 3000);
            })
            .catch(error => {
                statusEl.textContent = `Error: ${error.message}`;
                statusEl.style.color = '#dc3545';
                console.error('Failed to add comment:', error);
            });
    }

    /**
     * Set the selected issue with improved UI
     * @param {Object} issue - Selected issue object
     */
    setSelectedIssue(issue) {
        this.selectedIssue = issue;
        const displayEl = document.getElementById('selected-issue-display');
        if (displayEl && issue) {
            displayEl.innerHTML = `<strong>#${issue.iid}</strong> - ${issue.title}`;
            displayEl.style.color = '#1f75cb';
            displayEl.style.fontWeight = 'normal';

            // Add visual highlight to the selected issue container
            const container = displayEl.parentElement;
            if (container) {
                container.style.borderColor = '#1f75cb';
                container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
            }

            const statusEl = document.getElementById('comment-status');
            if (statusEl) {
                statusEl.textContent = 'Issue selected. Enter your comment and click "Add Comment".';
                statusEl.style.color = 'green';
            }
        }
    }

    /**
     * Show a temporary success notification
     */
    showSuccessNotification() {
        const notification = document.createElement('div');
        notification.textContent = 'Comment added successfully!';
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
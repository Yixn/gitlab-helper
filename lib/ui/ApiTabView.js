// ApiTabView.js - Manages the API tab UI

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
     * Add comment utility section to API tab
     * @param {HTMLElement} container - Container element
     */
    addCommentSection(container) {
        // Create comment tool section
        const commentSection = document.createElement('div');
        commentSection.classList.add('api-section');
        commentSection.style.marginBottom = '15px';
        commentSection.style.padding = '10px';
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '4px';

        const commentHeader = document.createElement('div');
        commentHeader.style.fontWeight = 'bold';
        commentHeader.style.marginBottom = '10px';
        commentHeader.textContent = 'Add Comment to Selected Issue';
        commentSection.appendChild(commentHeader);

        // Instructions
        const instructions = document.createElement('div');
        instructions.style.fontSize = '12px';
        instructions.style.marginBottom = '10px';
        instructions.textContent = 'Select a card on the board, then enter your comment below:';
        commentSection.appendChild(instructions);

        // Selected issue display
        const selectedIssue = document.createElement('div');
        selectedIssue.id = 'selected-issue-display';
        selectedIssue.style.fontSize = '12px';
        selectedIssue.style.color = '#666';
        selectedIssue.style.marginBottom = '10px';
        selectedIssue.textContent = 'No issue selected';
        commentSection.appendChild(selectedIssue);

        // Comment textarea
        const commentInput = document.createElement('textarea');
        commentInput.id = 'issue-comment-input';
        commentInput.placeholder = 'Enter your comment here...';
        commentInput.style.width = '100%';
        commentInput.style.padding = '5px';
        commentInput.style.marginBottom = '10px';
        commentInput.style.borderRadius = '3px';
        commentInput.style.border = '1px solid #ccc';
        commentInput.style.minHeight = '60px';
        commentSection.appendChild(commentInput);

        // Add select issue button
        const selectBtn = document.createElement('button');
        selectBtn.textContent = 'Select Issue';
        selectBtn.style.padding = '5px 10px';
        selectBtn.style.backgroundColor = '#6c757d';
        selectBtn.style.color = 'white';
        selectBtn.style.border = 'none';
        selectBtn.style.borderRadius = '3px';
        selectBtn.style.cursor = 'pointer';
        selectBtn.style.marginRight = '5px';
        selectBtn.onclick = () => this.uiManager.issueSelector.startSelection();
        commentSection.appendChild(selectBtn);

        // Submit button
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Add Comment';
        submitBtn.style.padding = '5px 10px';
        submitBtn.style.backgroundColor = '#1f75cb';
        submitBtn.style.color = 'white';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '3px';
        submitBtn.style.cursor = 'pointer';
        submitBtn.onclick = () => this.submitComment();
        commentSection.appendChild(submitBtn);

        // Status message
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

                // Clear selected issue after 3 seconds
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
     * Set the selected issue
     * @param {Object} issue - Selected issue object
     */
    setSelectedIssue(issue) {
        this.selectedIssue = issue;
        const displayEl = document.getElementById('selected-issue-display');
        if (displayEl && issue) {
            displayEl.textContent = `Selected: #${issue.iid} - ${issue.title}`;
            displayEl.style.color = '#1f75cb';
            displayEl.style.fontWeight = 'bold';

            const statusEl = document.getElementById('comment-status');
            if (statusEl) {
                statusEl.textContent = 'Issue selected. Enter your comment and click "Add Comment".';
                statusEl.style.color = 'green';
            }
        }
    }
}
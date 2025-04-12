// SelectionDisplay.js - Handles display and management of selected issues

/**
 * Component to display and manage selected issues
 */
export default class SelectionDisplay {
    /**
     * Constructor for SelectionDisplay
     * @param {Object} options - Configuration options
     * @param {Array} options.selectedIssues - Array of selected issue objects
     * @param {Function} options.onRemoveIssue - Callback when issue is removed
     */
    constructor(options = {}) {
        this.selectedIssues = options.selectedIssues || [];
        this.onRemoveIssue = options.onRemoveIssue || null;
        this.container = null;
    }

    /**
     * Create the selected issues container
     * @param {HTMLElement} container - Parent container to append to
     */
    createSelectionContainer(container) {
        this.container = container;

        // Selected issues container with improved styling
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
        container.appendChild(selectedIssuesContainer);

        // Update display with any existing issues
        this.updateDisplay();
    }

    /**
     * Update the display of selected issues
     */
    updateDisplay() {
        const listEl = document.getElementById('selected-issues-list');
        if (!listEl) return;

        // Clear existing list
        listEl.innerHTML = '';

        // If no issues are selected
        if (!this.selectedIssues || this.selectedIssues.length === 0) {
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

        // Enhance container styling when issues are selected
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
            issueInfo.innerHTML = `<strong>#${issue.iid}</strong> - ${issue.title || 'Untitled Issue'}`;
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
                this.removeIssue(index);
            };

            issueItem.appendChild(removeBtn);
            listEl.appendChild(issueItem);
        });
    }

    /**
     * Remove an issue from the selection
     * @param {number} index - Index of the issue to remove
     */
    removeIssue(index) {
        if (index >= 0 && index < this.selectedIssues.length) {
            this.selectedIssues.splice(index, 1);
            this.updateDisplay();

            // Call callback if provided
            if (typeof this.onRemoveIssue === 'function') {
                this.onRemoveIssue(index);
            }
        }
    }

    /**
     * Set the selected issues
     * @param {Array} issues - Array of issue objects to display
     */
    setSelectedIssues(issues) {
        this.selectedIssues = issues || [];
        this.updateDisplay();
    }

    /**
     * Get the current selected issues
     * @returns {Array} Currently selected issues
     */
    getSelectedIssues() {
        return this.selectedIssues;
    }
}
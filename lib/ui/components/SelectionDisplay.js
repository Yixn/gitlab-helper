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
        this.issuesList = null;
    }

    /**
     * Create the selected issues container
     * @param {HTMLElement} container - Parent container to append to
     */
    createSelectionContainer(container) {
        this.container = container;
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
        const selectedIssuesList = document.createElement('div');
        selectedIssuesList.id = 'selected-issues-list';
        selectedIssuesList.style.fontSize = '14px';
        this.issuesList = selectedIssuesList;
        this.displayNoIssuesMessage();

        selectedIssuesContainer.appendChild(selectedIssuesList);
        container.appendChild(selectedIssuesContainer);
        this.updateDisplay();
    }

    /**
     * Display "No issues selected" message
     */
    displayNoIssuesMessage() {
        if (!this.issuesList) return;
        const existingMessage = this.issuesList.querySelector('#no-issues-selected');
        if (existingMessage) return;

        const noIssuesSelected = document.createElement('div');
        noIssuesSelected.id = 'no-issues-selected';
        noIssuesSelected.textContent = 'No issues selected';
        noIssuesSelected.style.color = '#666';
        noIssuesSelected.style.fontStyle = 'italic';
        this.issuesList.appendChild(noIssuesSelected);
    }

    /**
     * Update the display of selected issues
     */
    updateDisplay() {
        if (!this.issuesList) {
            console.error('Issues list not initialized');
            return;
        }
        this.issuesList.innerHTML = '';
        if (!this.selectedIssues || this.selectedIssues.length === 0) {
            this.displayNoIssuesMessage();
            const container = this.issuesList.parentElement;
            if (container) {
                container.style.borderColor = '#ccc';
                container.style.backgroundColor = '#f9f9f9';
            }

            return;
        }
        const container = this.issuesList.parentElement;
        if (container) {
            container.style.borderColor = '#1f75cb';
            container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
        }
        this.selectedIssues.forEach((issue, index) => {
            if (!issue) return;

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
            const issueId = issue.iid || 'Unknown';
            const issueTitle = issue.title || 'Untitled Issue';
            issueInfo.innerHTML = `<strong>#${issueId}</strong> - ${issueTitle}`;
            issueInfo.style.overflow = 'hidden';
            issueInfo.style.textOverflow = 'ellipsis';
            issueInfo.style.whiteSpace = 'nowrap';
            issueInfo.style.marginRight = '5px';
            issueItem.appendChild(issueInfo);
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
            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.color = '#c82333';
            });

            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.color = '#dc3545';
            });
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeIssue(index);
            };

            issueItem.appendChild(removeBtn);
            this.issuesList.appendChild(issueItem);
        });
    }

    /**
     * Handler when an issue is removed from the selection
     * @param {number} index - Index of the removed issue
     */
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            const removedIssue = this.selectedIssues[index];
            this.selectedIssues.splice(index, 1);
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.issueSelector) {
                window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }
        }
        // Remove status message update since we removed the status element
    }


    /**
     * Set the selected issues
     * @param {Array} issues - Array of issue objects to display
     */
    setSelectedIssues(issues) {
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        this.updateDisplay();
    }
}
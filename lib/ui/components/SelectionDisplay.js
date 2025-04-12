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

        // Store reference to the list for updates
        this.issuesList = selectedIssuesList;

        // Display "No issues selected" initially
        this.displayNoIssuesMessage();

        selectedIssuesContainer.appendChild(selectedIssuesList);
        container.appendChild(selectedIssuesContainer);

        // Update display with any existing issues
        this.updateDisplay();
    }

    /**
     * Display "No issues selected" message
     */
    displayNoIssuesMessage() {
        if (!this.issuesList) return;

        // Check if message already exists
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

        // Clear existing list
        this.issuesList.innerHTML = '';

        // If no issues are selected
        if (!this.selectedIssues || this.selectedIssues.length === 0) {
            // Show "No issues selected" message
            this.displayNoIssuesMessage();

            // Reset container styling
            const container = this.issuesList.parentElement;
            if (container) {
                container.style.borderColor = '#ccc';
                container.style.backgroundColor = '#f9f9f9';
            }

            return;
        }

        // Enhance container styling when issues are selected
        const container = this.issuesList.parentElement;
        if (container) {
            container.style.borderColor = '#1f75cb';
            container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
        }

        // Create list of issues
        this.selectedIssues.forEach((issue, index) => {
            // Skip null or undefined issues
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
            // Use safe access to issue properties
            const issueId = issue.iid || 'Unknown';
            const issueTitle = issue.title || 'Untitled Issue';
            issueInfo.innerHTML = `<strong>#${issueId}</strong> - ${issueTitle}`;
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
            this.issuesList.appendChild(issueItem);
        });

        // Log for debugging
            }

    /**
     * Remove an issue from the selection
     * @param {number} index - Index of the issue to remove
     */
    removeIssue(index) {
        if (index >= 0 && index < this.selectedIssues.length) {
            // Store the issue before removing for logging
            const removedIssue = this.selectedIssues[index];

            // Remove the issue
            this.selectedIssues.splice(index, 1);

            // Update display
            this.updateDisplay();

            // Call callback if provided - this is important for syncing with IssueSelector
            if (typeof this.onRemoveIssue === 'function') {
                this.onRemoveIssue(index);
            } else {
                // Fallback sync with IssueSelector if callback not provided
                try {
                    // Try to find IssueSelector through global uiManager
                    if (window.uiManager && window.uiManager.issueSelector) {
                        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    }
                } catch (e) {
                    console.error('Error syncing with IssueSelector:', e);
                }
            }

            // Log for debugging
                    }
    }


    /**
     * Set the selected issues
     * @param {Array} issues - Array of issue objects to display
     */
    setSelectedIssues(issues) {
        // Make a copy of the array to avoid reference issues
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];

        // Update the display
        this.updateDisplay();

        // Log for debugging
            }

    /**
     * Get the current selected issues
     * @returns {Array} Currently selected issues
     */
    getSelectedIssues() {
        return [...this.selectedIssues];
    }
}
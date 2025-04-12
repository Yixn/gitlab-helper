// Complete IssueSelector with UI update fixes
export default class IssueSelector {
    /**
     * Constructor for IssueSelector
     * @param {Object} options - Configuration options
     * @param {Function} options.onSelectionChange - Callback function when selection changes
     * @param {Function} options.onSelectionComplete - Callback function when selection is completed
     * @param {Array} options.initialSelection - Initial selection of issues
     */
    constructor(options = {}) {
        this.uiManager = options.uiManager;
        this.onSelectionChange = options.onSelectionChange || null;
        this.onSelectionComplete = options.onSelectionComplete || null;

        this.isSelectingIssue = false;
        this.selectionOverlays = [];
        this.selectedOverlays = []; // Track which overlays are selected
        this.selectedIssues = options.initialSelection || []; // Store multiple selected issues

        // Add escape key handler to document
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSelectingIssue) {
                this.exitSelectionMode();
            }
        });
    }

    /**
     * Start issue selection mode with improved overlay UI
     */
    startSelection() {
        console.log('Starting issue selection mode');
        this.isSelectingIssue = true;

        // Don't reset selected issues when starting selection mode
        // Instead, maintain the current selection
        const currentSelection = [...this.selectedIssues];

        // Update status message
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            statusMsg.textContent = 'Click on cards to select/deselect issues. Press ESC or click DONE when finished.';
            statusMsg.style.color = '#1f75cb';
        }

        // Add semi-transparent page overlay
        const pageOverlay = document.createElement('div');
        pageOverlay.id = 'selection-page-overlay';
        pageOverlay.style.position = 'fixed';
        pageOverlay.style.top = '0';
        pageOverlay.style.left = '0';
        pageOverlay.style.width = '100%';
        pageOverlay.style.height = '100%';
        pageOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        pageOverlay.style.zIndex = '998';
        pageOverlay.style.pointerEvents = 'none';
        document.body.appendChild(pageOverlay);

        // Create clickable overlays for each card
        this.createCardOverlays(currentSelection);

        // Add cancel button for clarity
        this.createCancelButton();

        console.log(`Selection mode started with ${currentSelection.length} issues`);
    }

    /**
     * Create cancel button for exiting selection mode
     */
    createCancelButton() {
        const cancelButton = document.createElement('div');
        cancelButton.id = 'selection-cancel-button';
        cancelButton.textContent = 'DONE';
        cancelButton.style.position = 'fixed';
        cancelButton.style.bottom = '20px';
        cancelButton.style.right = '380px'; // Position next to the summary panel
        cancelButton.style.backgroundColor = '#6c757d';
        cancelButton.style.color = 'white';
        cancelButton.style.padding = '10px 20px';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontWeight = 'bold';
        cancelButton.style.zIndex = '999';
        cancelButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        cancelButton.style.transition = 'all 0.2s ease';

        // Hover effect
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.backgroundColor = '#5a6268';
            cancelButton.style.transform = 'translateY(-2px)';
            cancelButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        });

        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.backgroundColor = '#6c757d';
            cancelButton.style.transform = 'translateY(0)';
            cancelButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        });

        // Click handler to exit selection mode
        cancelButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exitSelectionMode();
        });

        document.body.appendChild(cancelButton);
        this.selectionOverlays.push(cancelButton);

        // Also add selection counter
        const selectionCounter = document.createElement('div');
        selectionCounter.id = 'selection-counter';
        selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
        selectionCounter.style.position = 'fixed';
        selectionCounter.style.bottom = '20px';
        selectionCounter.style.left = '20px';
        selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ?
            'rgba(40, 167, 69, 0.8)' : 'rgba(0, 0, 0, 0.7)';
        selectionCounter.style.color = 'white';
        selectionCounter.style.padding = '8px 16px';
        selectionCounter.style.borderRadius = '20px';
        selectionCounter.style.fontSize = '14px';
        selectionCounter.style.zIndex = '999';
        selectionCounter.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';

        document.body.appendChild(selectionCounter);
        this.selectionOverlays.push(selectionCounter);
    }

    /**
     * Create semi-transparent clickable overlays for each card
     * @param {Array} currentSelection - Currently selected issues to maintain
     */
    createCardOverlays(currentSelection = []) {
        console.log('Creating card overlays for selection');
        const boardCards = document.querySelectorAll('.board-card');
        console.log(`Found ${boardCards.length} board cards to overlay`);

        // Clear previous selection state, but remember currently selected issues
        this.selectedIssues = currentSelection || [];
        this.selectedOverlays = [];

        boardCards.forEach((card, index) => {
            try {
                // Get card position and dimensions
                const rect = card.getBoundingClientRect();

                // Create overlay for this card
                const overlay = document.createElement('div');
                overlay.className = 'card-selection-overlay';
                overlay.style.position = 'absolute';
                overlay.style.left = `${rect.left}px`;
                overlay.style.top = `${rect.top}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.border = '2px solid rgba(31, 117, 203, 0.6)';
                overlay.style.borderRadius = '4px';
                overlay.style.zIndex = '999';
                overlay.style.cursor = 'pointer';
                overlay.style.transition = 'background-color 0.2s ease';
                overlay.dataset.cardId = card.id || `card-${Date.now()}-${index}`;
                overlay.dataset.selected = 'false';

                // Store reference to the original card
                overlay.originalCard = card;

                // Get issue data to check if this card was previously selected
                const issueItem = this.getIssueItemFromCard(card);

                if (issueItem) {
                    overlay.dataset.issueId = `${issueItem.iid}-${issueItem.referencePath}`;

                    // If the card's issue is in the currentSelection array, mark it as selected
                    if (currentSelection.some(issue =>
                        issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)) {
                        // This card should be pre-selected
                        overlay.dataset.selected = 'true';
                        overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                        overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                        overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

                        // Add badge number
                        const badgeNumber = this.selectedOverlays.length + 1;
                        const badge = document.createElement('div');
                        badge.className = 'selection-badge';
                        badge.textContent = badgeNumber;
                        badge.style.position = 'absolute';
                        badge.style.top = '-10px';
                        badge.style.right = '-10px';
                        badge.style.width = '20px';
                        badge.style.height = '20px';
                        badge.style.borderRadius = '50%';
                        badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
                        badge.style.color = 'white';
                        badge.style.display = 'flex';
                        badge.style.alignItems = 'center';
                        badge.style.justifyContent = 'center';
                        badge.style.fontWeight = 'bold';
                        badge.style.fontSize = '12px';
                        badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                        overlay.appendChild(badge);

                        // Add to selected overlays
                        this.selectedOverlays.push(overlay);
                    }
                }

                // Hover effect
                overlay.addEventListener('mouseenter', () => {
                    if (overlay.dataset.selected !== 'true') {
                        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.3)';
                        overlay.style.boxShadow = '0 0 8px rgba(31, 117, 203, 0.5)';
                    }
                });

                overlay.addEventListener('mouseleave', () => {
                    if (overlay.dataset.selected !== 'true') {
                        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                        overlay.style.boxShadow = 'none';
                    }
                });

                // Click handler - now toggles selection
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleCardSelection(card, overlay);
                });

                document.body.appendChild(overlay);
                this.selectionOverlays.push(overlay);
            } catch (error) {
                console.error('Error creating overlay for card:', error);
            }
        });

        // Add a help text
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on issues to select/deselect them • Press ESC or click DONE when finished';
        helpText.style.position = 'fixed';
        helpText.style.top = '10px';
        helpText.style.left = '50%';
        helpText.style.transform = 'translateX(-50%)';
        helpText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        helpText.style.color = 'white';
        helpText.style.padding = '8px 16px';
        helpText.style.borderRadius = '20px';
        helpText.style.fontSize = '14px';
        helpText.style.zIndex = '999';
        helpText.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        document.body.appendChild(helpText);
        this.selectionOverlays.push(helpText);

        // Update initial counter
        this.updateSelectionCounter();

        console.log(`Created ${this.selectionOverlays.length} selection overlays`);
    }

    /**
     * Update selection counter
     */
    updateSelectionCounter() {
        const counter = document.getElementById('selection-counter');
        if (counter) {
            const count = this.selectedIssues.length;
            counter.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;

            // Change color based on selection count
            if (count > 0) {
                counter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
            } else {
                counter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            }
        }

        // Notify listeners of selection change
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this.selectedIssues);
        }

        // Update the selection display in bulk comments view
        this.syncSelectionWithBulkCommentsView();
    }

    /**
     * Sync selection with BulkComments view
     */
    syncSelectionWithBulkCommentsView() {
        try {
            // Update the selection display
            if (this.uiManager && this.uiManager.bulkCommentsView) {
                this.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.bulkCommentsView) {
                window.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
            }
        } catch (error) {
            console.error('Error syncing selection with bulk comments view:', error);
        }
    }

    /**
     * Get issue item from card using Vue component
     * @param {HTMLElement} boardCard - DOM element representing a board card
     * @returns {Object|null} - Issue item object or null if not found
     */
    getIssueItemFromCard(boardCard) {
        try {
            // Try to access Vue component
            if (boardCard.__vue__) {
                // Check if the card has $children
                if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
                    // Find the issue in the $children array
                    const issueComponent = boardCard.__vue__.$children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }

                // Alternative: try $options.children
                if (boardCard.__vue__.$options &&
                    boardCard.__vue__.$options.children &&
                    boardCard.__vue__.$options.children.length > 0) {

                    // Find the issue component through $options.children
                    const issueComponent = boardCard.__vue__.$options.children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }

                // Alternative: try direct props access
                if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
                    return boardCard.__vue__.$props.item;
                }
            }

            // Last resort: try to find through DOM inspection
            const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
            const titleElement = boardCard.querySelector('.board-card-title');

            if (issueId && titleElement) {
                // Create a minimal issue item with essential properties
                return {
                    iid: issueId,
                    title: titleElement.textContent.trim(),
                    referencePath: window.location.pathname.split('/boards')[0],
                    // Add other necessary properties as needed
                };
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }

        return null;
    }

    /**
     * Toggle card selection state (select/deselect)
     * @param {HTMLElement} card - The original card element
     * @param {HTMLElement} overlay - The selection overlay element
     */
    toggleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;

        // Get issue data from card
        const issueItem = this.getIssueItemFromCard(card);

        if (issueItem) {
            console.log('Toggle selection for issue:', issueItem.iid);

            // Check if already selected
            const isSelected = overlay.dataset.selected === 'true';

            if (isSelected) {
                // Deselect
                overlay.dataset.selected = 'false';
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                overlay.style.boxShadow = 'none';

                // Remove from selected issues
                this.selectedIssues = this.selectedIssues.filter(issue =>
                    !(issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)
                );

                // Remove from selected overlays
                this.selectedOverlays = this.selectedOverlays.filter(o => o !== overlay);

                // Remove badge
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());

                // Renumber badges on remaining selected overlays
                this.renumberBadges();
            } else {
                // Select
                overlay.dataset.selected = 'true';
                overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

                // Add number badge to indicate selection order
                const badgeNumber = this.selectedIssues.length + 1;

                const badge = document.createElement('div');
                badge.className = 'selection-badge';
                badge.textContent = badgeNumber;
                badge.style.position = 'absolute';
                badge.style.top = '-10px';
                badge.style.right = '-10px';
                badge.style.width = '20px';
                badge.style.height = '20px';
                badge.style.borderRadius = '50%';
                badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
                badge.style.color = 'white';
                badge.style.display = 'flex';
                badge.style.alignItems = 'center';
                badge.style.justifyContent = 'center';
                badge.style.fontWeight = 'bold';
                badge.style.fontSize = '12px';
                badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                // Remove existing badge if any
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                overlay.appendChild(badge);

                // Add to selected issues
                this.selectedIssues.push(issueItem);

                // Add to selected overlays
                this.selectedOverlays.push(overlay);
            }

            // Update the selection counter
            this.updateSelectionCounter();
        } else {
            console.error('Failed to get issue item from card');

            // Visual feedback for failure
            overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
            overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';

            setTimeout(() => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
            }, 500);

            // Update status message
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
                statusMsg.style.color = '#dc3545';
            }
        }
    }

    /**
     * Renumber the badges on selected overlays
     */
    renumberBadges() {
        this.selectedOverlays.forEach((overlay, index) => {
            const badge = overlay.querySelector('.selection-badge');
            if (badge) {
                badge.textContent = index + 1;
            }
        });
    }

    /**
     * Exit selection mode and clean up overlays, keeping the current selection
     */
    exitSelectionMode() {
        console.log('Exiting selection mode');
        this.isSelectingIssue = false;

        // Remove page overlay
        document.getElementById('selection-page-overlay')?.remove();

        // Remove all card overlays
        this.selectionOverlays.forEach(overlay => {
            overlay.remove();
        });
        this.selectionOverlays = [];
        this.selectedOverlays = [];

        // We don't clear selectedIssues as we want to keep the current selection

        // Ensure selection is synced with bulk comments view
        this.syncSelectionWithBulkCommentsView();

        // Call completion callback if provided
        if (typeof this.onSelectionComplete === 'function') {
            this.onSelectionComplete(this.selectedIssues);
        }

        // Update status based on whether issues were selected
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            if (this.selectedIssues.length > 0) {
                statusMsg.textContent = `${this.selectedIssues.length} issues selected. Enter your comment and click "Add Comment".`;
                statusMsg.style.color = 'green';
            } else {
                statusMsg.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
                statusMsg.style.color = '#666';
            }
        }

        console.log(`Selection mode exited with ${this.selectedIssues.length} issues selected`);
    }

    /**
     * Reposition overlays when window is scrolled or resized
     * Only necessary if selection mode is active for a long time
     */
    repositionOverlays() {
        if (!this.isSelectingIssue) return;

        // Reposition card overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay.className === 'card-selection-overlay' && overlay.originalCard) {
                const card = overlay.originalCard;
                const rect = card.getBoundingClientRect();

                overlay.style.left = `${rect.left}px`;
                overlay.style.top = `${rect.top}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
            }
        });

        // Reposition fixed elements like the done button and counter
        const doneButton = document.getElementById('selection-cancel-button');
        if (doneButton) {
            doneButton.style.bottom = '20px';
            doneButton.style.right = '380px';
        }

        const counter = document.getElementById('selection-counter');
        if (counter) {
            counter.style.bottom = '20px';
            counter.style.left = '20px';
        }
    }

    /**
     * Get currently selected issues
     * @returns {Array} Array of selected issue objects
     */
    getSelectedIssues() {
        return [...this.selectedIssues];
    }

    /**
     * Set selected issues programmatically
     * @param {Array} issues - Array of issue objects
     */
    setSelectedIssues(issues) {
        this.selectedIssues = issues || [];

        // Update the UI in bulk comments view
        this.syncSelectionWithBulkCommentsView();

        // Notify listeners of selection change if active
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedIssues);
        }
    }

    /**
     * Clear selected issues
     */
    clearSelection() {
        this.selectedIssues = [];

        // Update the UI in bulk comments view
        this.syncSelectionWithBulkCommentsView();

        // Notify listeners of selection change
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedIssues);
        }
    }
}
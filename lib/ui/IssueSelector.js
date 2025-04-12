// IssueSelector.js - Handles multi-issue selection from board cards

class IssueSelector {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.isSelectingIssue = false;
        this.selectionOverlays = [];
        this.selectedOverlays = []; // Track which overlays are selected
        this.selectedIssues = []; // Store multiple selected issues

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
        this.isSelectingIssue = true;
        this.selectedIssues = []; // Reset selected issues when starting selection mode

        // Update status message
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            statusMsg.textContent = 'Click on cards to select issues. Press ESC to cancel or DONE to confirm.';
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
        this.createCardOverlays();

        // Add "Done" button for finishing selection
        this.createDoneButton();
    }

    /**
     * Create Done button for completing multi-selection
     */
    createDoneButton() {
        const doneButton = document.createElement('div');
        doneButton.id = 'selection-done-button';
        doneButton.textContent = 'DONE';
        doneButton.style.position = 'fixed';
        doneButton.style.bottom = '20px';
        doneButton.style.right = '330px'; // Position next to the summary panel
        doneButton.style.backgroundColor = '#28a745';
        doneButton.style.color = 'white';
        doneButton.style.padding = '10px 20px';
        doneButton.style.borderRadius = '4px';
        doneButton.style.cursor = 'pointer';
        doneButton.style.fontWeight = 'bold';
        doneButton.style.zIndex = '999';
        doneButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        doneButton.style.transition = 'all 0.2s ease';

        // Hover effect
        doneButton.addEventListener('mouseenter', () => {
            doneButton.style.backgroundColor = '#218838';
            doneButton.style.transform = 'translateY(-2px)';
            doneButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        });

        doneButton.addEventListener('mouseleave', () => {
            doneButton.style.backgroundColor = '#28a745';
            doneButton.style.transform = 'translateY(0)';
            doneButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        });

        // Click handler
        doneButton.addEventListener('click', () => {
            if (this.selectedIssues.length > 0) {
                this.confirmSelection();
            } else {
                // Show message that no issues are selected
                const statusMsg = document.getElementById('comment-status');
                if (statusMsg) {
                    statusMsg.textContent = 'No issues selected. Please select at least one issue.';
                    statusMsg.style.color = '#dc3545';
                }
            }
        });

        document.body.appendChild(doneButton);
        this.selectionOverlays.push(doneButton);

        // Also add selection counter
        const selectionCounter = document.createElement('div');
        selectionCounter.id = 'selection-counter';
        selectionCounter.textContent = '0 issues selected';
        selectionCounter.style.position = 'fixed';
        selectionCounter.style.bottom = '20px';
        selectionCounter.style.left = '20px';
        selectionCounter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
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
    }

    /**
     * Confirm selection and pass selected issues to API tab
     */
    confirmSelection() {
        if (this.selectedIssues.length > 0) {
            // Pass the selected issues to the API tab
            this.uiManager.apiView.setSelectedIssues(this.selectedIssues);
            this.exitSelectionMode();
        }
    }

    /**
     * Create semi-transparent clickable overlays for each card
     */
    createCardOverlays() {
        const boardCards = document.querySelectorAll('.board-card');

        boardCards.forEach(card => {
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
            overlay.dataset.cardId = card.id || Date.now() + Math.random().toString(36).substring(2, 9);
            overlay.dataset.selected = 'false';

            // Store reference to the original card
            overlay.dataset.originalCard = card.id || card.innerText.substring(0, 20);

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
        });

        // Add a help text
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on issues to select/deselect them • Press ESC to cancel';
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
    }

    /**
     * Toggle card selection state (select/deselect)
     * @param {HTMLElement} card - The original card element
     * @param {HTMLElement} overlay - The selection overlay element
     */
    toggleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;

        // Get issue data from card
        const issueItem = gitlabApi.getIssueItemFromCard(card);

        if (issueItem) {
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
     * Exit selection mode and clean up overlays
     */
    exitSelectionMode() {
        this.isSelectingIssue = false;

        // Remove page overlay
        document.getElementById('selection-page-overlay')?.remove();

        // Remove all card overlays
        this.selectionOverlays.forEach(overlay => {
            overlay.remove();
        });
        this.selectionOverlays = [];
        this.selectedOverlays = [];

        // Update status based on whether issues were selected
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            if (this.selectedIssues.length > 0) {
                statusMsg.textContent = `${this.selectedIssues.length} issues selected. Enter your comment and click "Add Comment".`;
                statusMsg.style.color = 'green';
            } else {
                statusMsg.textContent = 'Selection canceled. Try again.';
                statusMsg.style.color = '#666';
            }
        }
    }

    /**
     * Reposition overlays when window is scrolled or resized
     * Only necessary if selection mode is active for a long time
     */
    repositionOverlays() {
        if (!this.isSelectingIssue) return;

        const boardCards = document.querySelectorAll('.board-card');

        boardCards.forEach((card) => {
            // Find matching overlay
            const overlay = this.selectionOverlays.find(o =>
                o.dataset && o.className === 'card-selection-overlay' &&
                o.dataset.originalCard === (card.id || card.innerText.substring(0, 20))
            );

            if (overlay) {
                // Update position based on current card position
                const rect = card.getBoundingClientRect();
                overlay.style.left = `${rect.left}px`;
                overlay.style.top = `${rect.top}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
            }
        });

        // Reposition fixed elements like the done button and counter
        const doneButton = document.getElementById('selection-done-button');
        if (doneButton) {
            doneButton.style.bottom = '20px';
            doneButton.style.right = '330px';
        }

        const counter = document.getElementById('selection-counter');
        if (counter) {
            counter.style.bottom = '20px';
            counter.style.left = '20px';
        }
    }
}
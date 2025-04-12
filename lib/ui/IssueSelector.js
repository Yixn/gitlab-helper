// IssueSelector.js - Handles issue selection from board cards with improved selection UI

class IssueSelector {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.isSelectingIssue = false;
        this.selectionOverlays = [];

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

        // Update status message
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            statusMsg.textContent = 'Click on a card to select an issue. Press ESC to cancela.';
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

            // Store reference to the original card
            overlay.dataset.originalCard = card.id || card.innerText.substring(0, 20);

            // Hover effect
            overlay.addEventListener('mouseenter', () => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.3)';
                overlay.style.boxShadow = '0 0 8px rgba(31, 117, 203, 0.5)';
            });

            overlay.addEventListener('mouseleave', () => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.boxShadow = 'none';
            });

            // Click handler
            overlay.addEventListener('click', (e) => {
                e.stopPropagation();
                this.handleCardSelection(card, overlay);
            });

            document.body.appendChild(overlay);
            this.selectionOverlays.push(overlay);
        });

        // Add a help text
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on an issue to select it';
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
     * Handle card selection event with visual feedback
     * @param {HTMLElement} card - The original card element
     * @param {HTMLElement} overlay - The selection overlay element
     */
    handleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;

        // Get issue data from card
        const issueItem = gitlabApi.getIssueItemFromCard(card);

        if (issueItem) {
            // Flash selection overlay to provide visual feedback
            overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.4)';
            overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';

            // Update selected issue in API tab view
            this.uiManager.apiView.setSelectedIssue(issueItem);

            // Wait briefly to show visual feedback before removing overlays
            setTimeout(() => {
                this.exitSelectionMode();
            }, 300);
        } else {
            // Visual feedback for failure
            overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
            overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';

            // Update status message
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
                statusMsg.style.color = '#dc3545';
            }

            // Keep selection mode active so user can try another card
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

        // Update status if no issue was selected
        if (!this.uiManager.apiView.selectedIssue) {
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
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

        boardCards.forEach((card, index) => {
            // Find matching overlay
            const overlay = this.selectionOverlays.find(o =>
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
    }
}/**/
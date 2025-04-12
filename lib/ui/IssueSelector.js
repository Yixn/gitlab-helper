// IssueSelector.js - Handles issue selection from board cards

class IssueSelector {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.isSelectingIssue = false;

        // Add escape key handler to document
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSelectingIssue) {
                this.exitSelectionMode();
            }
        });
    }

    /**
     * Start issue selection mode
     */
    startSelection() {
        this.isSelectingIssue = true;

        // Update status message
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            statusMsg.textContent = 'Click on a card to select an issue. Press ESC to cancel.';
            statusMsg.style.color = '#1f75cb';
        }

        // Add temporary overlay for visual indication
        const overlay = document.createElement('div');
        overlay.id = 'selection-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100%';
        overlay.style.height = '100%';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
        overlay.style.zIndex = '999';
        overlay.style.cursor = 'crosshair';
        overlay.style.pointerEvents = 'none';
        document.body.appendChild(overlay);

        // Add click listeners to all cards
        const boardCards = document.querySelectorAll('.board-card');
        boardCards.forEach(card => {
            card.style.cursor = 'pointer';
            card.dataset.originalZIndex = card.style.zIndex || '';
            card.style.zIndex = '1000';
            card.addEventListener('click', this.handleCardSelection.bind(this));
        });
    }

    /**
     * Handle card selection event
     * @param {Event} e - Click event
     */
    handleCardSelection(e) {
        if (!this.isSelectingIssue) return;

        const card = e.currentTarget;
        const issueItem = gitlabApi.getIssueItemFromCard(card);

        if (issueItem) {
            // Update selected issue in API tab view
            this.uiManager.apiView.setSelectedIssue(issueItem);
        }

        this.exitSelectionMode();
        e.stopPropagation();
    }

    /**
     * Exit selection mode
     */
    exitSelectionMode() {
        this.isSelectingIssue = false;

        // Remove overlay
        document.getElementById('selection-overlay')?.remove();

        // Remove click listeners
        const boardCards = document.querySelectorAll('.board-card');
        boardCards.forEach(card => {
            card.style.cursor = '';
            card.style.zIndex = card.dataset.originalZIndex || '';
            card.removeEventListener('click', this.handleCardSelection.bind(this));
        });

        // Update status if no issue was selected
        if (!this.uiManager.apiView.selectedIssue) {
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Selection canceled. Try again.';
                statusMsg.style.color = '#666';
            }
        }
    }
}
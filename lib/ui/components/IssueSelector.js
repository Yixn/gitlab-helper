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
        this.pageOverlay = null; // Track the page overlay separately
        this.selectionCounter = null; // Track the selection counter element
        this.helpText = null; // Track the help text element

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSelectingIssue) {
                this.exitSelectionMode();
            }
        });
    }

    startSelection() {
        if (this.isSelectingIssue) {
            return;
        }

        this.isSelectingIssue = true;
        const currentSelection = [...this.selectedIssues];

        // Create page overlay for the whole board area
        let boardsContainer = document.querySelector('.boards-list');
        if (!boardsContainer) {
            const possibleSelectors = [
                '[data-testid="boards-list"]',
                '.boards-app',
                '.js-boards-selector',
                '.board',
                '.boards-app-content',
                '.board-wrapper',
                '.boards-selector'
            ];

            for (const selector of possibleSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    boardsContainer = element;
                    break;
                }
            }
        }

        if (!boardsContainer) {
            console.warn('Could not find boards container, falling back to document.body');
            boardsContainer = document.body;
        }

        boardsContainer.style.position = 'relative';

        // Create semi-transparent overlay for the entire boards area
        const pageOverlay = document.createElement('div');
        pageOverlay.id = 'selection-page-overlay';
        pageOverlay.style.position = 'absolute';
        pageOverlay.style.top = '0';
        pageOverlay.style.left = '0';
        pageOverlay.style.width = '100%';
        pageOverlay.style.height = '100%';
        pageOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        pageOverlay.style.zIndex = '98';
        pageOverlay.style.pointerEvents = 'none'; // This allows clicking on the overlay

        // Add click handler to page overlay to exit selection mode
        pageOverlay.addEventListener('click', (e) => {
            // Only exit if clicked directly on the overlay, not on a child element
            if (e.target === pageOverlay) {
                this.exitSelectionMode();
            }
        });

        boardsContainer.appendChild(pageOverlay);

        // Store direct reference to the page overlay
        this.pageOverlay = pageOverlay;

        // Create card overlays for each board-list
        this.createCardOverlays(currentSelection, boardsContainer);

        // Create fixed UI elements
        this.createFixedControls();

        // Update the select button state
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'true';
            selectButton.style.backgroundColor = '#28a745'; // Green when active
            selectButton.textContent = '✓ Done';
        }

        // Add scroll event listener for repositioning
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);
    }

    /**
     * Create semi-transparent clickable overlays for each card
     * @param {Array} currentSelection - Currently selected issues to maintain
     * @param {HTMLElement} attachmentElement - Element to attach overlays to
     */
    createCardOverlays(currentSelection = [], attachmentElement = document.body) {
        // First clear any existing overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });

        // Reset tracking arrays
        this.selectionOverlays = [];
        this.selectedIssues = currentSelection || [];
        this.selectedOverlays = [];

        // Directly target the card areas using the data-testid
        const cardAreas = document.querySelectorAll('.board-list');

        cardAreas.forEach(cardArea => {
            try {

                // Get all cards in this area
                const cards = cardArea.querySelectorAll('.board-card');
                console.log(`Found ${cards.length} cards in card area`);

                // Process each card
                cards.forEach((card, index) => {
                    // Make sure the card area has position relative
                    const cardStyle = window.getComputedStyle(card);
                    if (cardStyle.position !== 'relative' && cardStyle.position !== 'absolute') {
                        cardArea.style.position = 'relative';
                    }

                    try {
                        const issueItem = this.getIssueItemFromCard(card);
                        if (!issueItem) return;

                        // Create overlay directly above the card
                        const overlay = document.createElement('div');
                        overlay.className = 'card-selection-overlay';
                        overlay.style.position = 'absolute';
                        overlay.style.zIndex = '99';
                        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                        overlay.style.border = '2px solid rgba(31, 117, 203, 0.6)';
                        overlay.style.borderRadius = '4px';
                        overlay.style.cursor = 'pointer';
                        overlay.style.transition = 'background-color 0.2s ease';
                        overlay.style.boxSizing = 'border-box';
                        overlay.dataset.cardId = card.id || `card-${Date.now()}-${index}`;
                        overlay.dataset.selected = 'false';
                        overlay.originalCard = card;
                        overlay.dataset.issueId = `${issueItem.iid}-${issueItem.referencePath}`;

                        // Position the overlay directly over the card
                        this.positionOverlay(overlay, card, cardArea);

                        // Check if this issue is already in the current selection
                        if (currentSelection.some(issue =>
                            issue.iid === issueItem.iid &&
                            issue.referencePath === issueItem.referencePath)) {

                            overlay.dataset.selected = 'true';
                            overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                            overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                            overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

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

                            card.appendChild(badge);
                            this.selectedOverlays.push(overlay);
                        }

                        // Add event listeners
                        overlay.addEventListener('mouseenter', function () {
                            if (this.dataset.selected !== 'true') {
                                this.style.backgroundColor = 'rgba(31, 117, 203, 0.3)';
                                this.style.boxShadow = '0 0 8px rgba(31, 117, 203, 0.5)';
                            }
                        });

                        overlay.addEventListener('mouseleave', function () {
                            if (this.dataset.selected !== 'true') {
                                this.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                                this.style.boxShadow = 'none';
                            }
                        });

                        overlay.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.toggleCardSelection(card, overlay);
                        });

                        card.appendChild(overlay);
                        this.selectionOverlays.push(overlay);
                    } catch (error) {
                        console.error('Error creating overlay for card:', error);
                    }
                });
            } catch (error) {
                console.error('Error processing card area:', error);
            }
        });
    }

    /**
     * Update selection counter
     */
    updateSelectionCounter() {
        if (this.selectionCounter) {
            const count = this.selectedIssues.length;
            this.selectionCounter.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;
            if (count > 0) {
                this.selectionCounter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
            } else {
                this.selectionCounter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            }
        }
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this.selectedIssues);
        }
        this.syncSelectionWithBulkCommentsView();
    }

    /**
     * Get issue item from card using Vue component
     * @param {HTMLElement} boardCard - DOM element representing a board card
     * @returns {Object|null} - Issue item object or null if not found
     */
    getIssueItemFromCard(boardCard) {
        try {
            if (boardCard.__vue__) {
                if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
                    const issueComponent = boardCard.__vue__.$children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }
                if (boardCard.__vue__.$options &&
                    boardCard.__vue__.$options.children &&
                    boardCard.__vue__.$options.children.length > 0) {
                    const issueComponent = boardCard.__vue__.$options.children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }
                if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
                    return boardCard.__vue__.$props.item;
                }
            }
            const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
            const titleElement = boardCard.querySelector('.board-card-title');

            if (issueId && titleElement) {
                return {
                    iid: issueId,
                    title: titleElement.textContent.trim(),
                    referencePath: window.location.pathname.split('/boards')[0],
                };
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }

        return null;
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
        if (!this.isSelectingIssue) return;

        this.isSelectingIssue = false;

        // Make sure we directly remove the page overlay
        if (this.pageOverlay && this.pageOverlay.parentNode) {
            this.pageOverlay.parentNode.removeChild(this.pageOverlay);
            this.pageOverlay = null;
        }

        // Remove the selection counter and help text
        if (this.selectionCounter && this.selectionCounter.parentNode) {
            this.selectionCounter.parentNode.removeChild(this.selectionCounter);
            this.selectionCounter = null;
        }

        if (this.helpText && this.helpText.parentNode) {
            this.helpText.parentNode.removeChild(this.helpText);
            this.helpText = null;
        }

        // Clean up the other overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });

        this.selectionOverlays = [];
        this.selectedOverlays = [];

        // Update the select button state
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'false';
            selectButton.style.backgroundColor = '#6c757d'; // Gray when inactive
            selectButton.textContent = '📎 Select Issues';
        }

        this.syncSelectionWithBulkCommentsView();

        if (typeof this.onSelectionComplete === 'function') {
            this.onSelectionComplete(this.selectedIssues);
        }

        // Remove scroll and resize event listeners
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);
    }


    toggleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;
        const issueItem = this.getIssueItemFromCard(card);

        if (issueItem) {
            const isSelected = overlay.dataset.selected === 'true';

            if (isSelected) {
                overlay.dataset.selected = 'false';
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                overlay.style.boxShadow = 'none';
                this.selectedIssues = this.selectedIssues.filter(issue =>
                    !(issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)
                );
                this.selectedOverlays = this.selectedOverlays.filter(o => o !== overlay);
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                this.renumberBadges();
            } else {
                overlay.dataset.selected = 'true';
                overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
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
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                overlay.appendChild(badge);
                this.selectedIssues.push(issueItem);
                this.selectedOverlays.push(overlay);
            }
            this.updateSelectionCounter();
            this.syncSelectionWithBulkCommentsView();
        } else {
            console.error('Failed to get issue item from card');
            overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
            overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';

            setTimeout(() => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
            }, 500);
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
                statusMsg.style.color = '#dc3545';
            }
        }
    }

    /**
     * Sync selection with BulkComments view
     */
    syncSelectionWithBulkCommentsView() {
        try {
            if (this.uiManager && this.uiManager.bulkCommentsView) {
                this.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.bulkCommentsView) {
                window.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
            } else {
                const bulkCommentsView = document.querySelector('.bulk-comments-view');
                if (bulkCommentsView && bulkCommentsView.__vue__ && bulkCommentsView.__vue__.setSelectedIssues) {
                    bulkCommentsView.__vue__.setSelectedIssues([...this.selectedIssues]);
                } else {
                    console.warn('BulkCommentsView not found for synchronization');
                }
            }
        } catch (error) {
            console.error('Error syncing selection with bulk comments view:', error);
        }
    }

    /**
     * Reposition overlays when window is scrolled or resized
     * Only necessary if selection mode is active for a long time
     */
    repositionOverlays() {
        if (!this.isSelectingIssue) return;

        // Update the position of the help text
        if (this.helpText) {
            this.helpText.style.top = '10px';
            this.helpText.style.left = '50%';
        }

        // Update the position of the selection counter
        if (this.selectionCounter) {
            this.selectionCounter.style.top = '50px';
            this.selectionCounter.style.left = '50%';
        }

        // Update positions of card overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.className === 'card-selection-overlay' && overlay.originalCard) {
                const card = overlay.originalCard;
                const container = overlay.parentNode;

                if (card && container) {
                    this.positionOverlay(overlay, card, container);
                }
            }
        });
    }

    /**
     * Set selected issues programmatically
     * @param {Array} issues - Array of issue objects
     */
    setSelectedIssues(issues) {
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        if (this.isSelectingIssue && this.selectionOverlays.length > 0) {
            this.updateOverlaysFromSelection();
        }
        const statusEl = document.getElementById('comment-status');
        if (statusEl && !this.isSelectingIssue) { // Only update if not in selection mode
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'No issues selected. Click "Select" to choose issues.';
                statusEl.style.color = '#666';
            }
        }
        this.syncSelectionWithBulkCommentsView();
    }

    positionOverlay(overlay, card, container) {
        try {
            const cardRect = card.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            // Calculate position relative to container
            const top = cardRect.top - containerRect.top + (container.scrollTop || 0);
            const left = cardRect.left - containerRect.left + (container.scrollLeft || 0);

            overlay.style.top = `${top}px`;
            overlay.style.left = `${left}px`;
            overlay.style.width = `${cardRect.width}px`;
            overlay.style.height = `${cardRect.height}px`;
        } catch (e) {
            console.error('Error positioning overlay:', e);
        }
    }

    updateOverlaysFromSelection() {
        if (!this.isSelectingIssue) return;

        try {
            const cardOverlays = this.selectionOverlays.filter(o => o.className === 'card-selection-overlay');

            cardOverlays.forEach(overlay => {
                if (overlay.dataset && overlay.originalCard) {
                    overlay.dataset.selected = 'false';
                    overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                    overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                    overlay.style.boxShadow = 'none';
                    overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                }
            });
            this.selectedOverlays = [];
            this.selectedIssues.forEach((issue, index) => {
                if (!issue) return;
                const matchingOverlay = cardOverlays.find(overlay => {
                    if (!overlay.dataset || !overlay.dataset.issueId) return false;
                    return overlay.dataset.issueId === `${issue.iid}-${issue.referencePath}`;
                });

                if (matchingOverlay) {
                    matchingOverlay.dataset.selected = 'true';
                    matchingOverlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                    matchingOverlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                    matchingOverlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
                    const badgeNumber = index + 1;
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

                    matchingOverlay.appendChild(badge);
                    this.selectedOverlays.push(matchingOverlay);
                }
            });
            this.updateSelectionCounter();
        } catch (error) {
            console.error('Error updating overlays from selection:', error);
        }
    }

    createFixedControls() {
        // Create help text at the top
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on issues to select/deselect them • Press ESC or click button when finished';
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
        this.helpText = helpText;
        document.body.appendChild(helpText);
        this.selectionOverlays.push(helpText);

        // Create selection counter below the help text
        const selectionCounter = document.createElement('div');
        selectionCounter.id = 'selection-counter';
        selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
        selectionCounter.style.position = 'fixed';
        selectionCounter.style.top = '50px'; // Position below help text
        selectionCounter.style.left = '50%';
        selectionCounter.style.transform = 'translateX(-50%)';
        selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ?
            'rgba(40, 167, 69, 0.9)' : 'rgba(0, 0, 0, 0.8)';
        selectionCounter.style.color = 'white';
        selectionCounter.style.padding = '8px 16px';
        selectionCounter.style.borderRadius = '20px';
        selectionCounter.style.fontSize = '14px';
        selectionCounter.style.zIndex = '999';
        selectionCounter.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
        this.selectionCounter = selectionCounter;
        document.body.appendChild(selectionCounter);
        this.selectionOverlays.push(selectionCounter);
    }

    /**
     * Handle scroll events (bound to this)
     */
    handleScroll = () => {
        this.repositionOverlays();
    }

    /**
     * Handle resize events (bound to this)
     */
    handleResize = () => {
        this.repositionOverlays();
    }
}
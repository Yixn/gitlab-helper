export default class LabelDisplayManager {
    constructor(options = {}) {
        this.initialized = false;
        this.uiManager = options.uiManager || window.uiManager;
        this.priorityLabels = ['priority', 'Priority', 'high', 'High', 'medium', 'Medium', 'low', 'Low', 'critical', 'Critical'];
        this.indicatorElements = [];
        this.processedCards = new WeakMap(); // Track processed cards
        this.isUpdating = false; // Prevent concurrent updates

        // Define all methods before binding
        this.handleScroll = function() {
            if (!this.initialized || !this.checkEnabled()) return;
            // Update positions immediately
            this.updatePositions();
        };

        this.handleResize = function() {
            if (!this.initialized || !this.checkEnabled()) return;
            // Update positions immediately
            this.updatePositions();
        };

        this.refreshCards = function() {
            if (this.isUpdating) return;
            this.isUpdating = true;

            try {
                // Process all cards
                const cards = document.querySelectorAll('.board-card');
                cards.forEach(card => {
                    // Skip cards we've already processed
                    if (!this.processedCards.has(card)) {
                        this.processCard(card);
                        this.processedCards.set(card, true);
                    }
                });

                // Update positions immediately
                this.updatePositions();
            } finally {
                this.isUpdating = false;
            }
        };

        this.updatePositions = function() {
            if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
                return;
            }

            this.isUpdating = true;

            try {
                this.indicatorElements.forEach(({element, card}) => {
                    if (element && card && element.parentNode) {
                        const container = card.closest('[data-testid="board-list-cards-area"]');
                        if (container) {
                            const cardRect = card.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();

                            const top = cardRect.top - containerRect.top + container.scrollTop;
                            const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

                            element.style.top = `${top}px`;
                            element.style.left = `${left}px`;
                            element.style.width = `${cardRect.width - 4}px`;
                        }
                    }
                });
            } finally {
                this.isUpdating = false;
            }
        };

        // Now bind all methods to this instance
        this.handleScroll = this.handleScroll.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.refreshCards = this.refreshCards.bind(this);
        this.updatePositions = this.updatePositions.bind(this);

        // Setup listeners
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);
        this.setupMutationObserver();

        // Check if enabled
        this.checkEnabled();
    }

// Update the setupMutationObserver method to provide instant updates
    setupMutationObserver() {
        if (this.boardObserver) {
            this.boardObserver.disconnect();
        }

        this.boardObserver = new MutationObserver(mutations => {
            if (!this.initialized || !this.checkEnabled()) {
                return;
            }

            let needsUpdate = false;

            mutations.forEach(mutation => {
                // Only process mutations that add/remove elements
                if (mutation.type === 'childList') {
                    const addedCards = Array.from(mutation.addedNodes).filter(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList?.contains('board-card') || node.querySelector?.('.board-card'))
                    );

                    if (addedCards.length > 0) {
                        needsUpdate = true;
                    }
                }
            });

            if (needsUpdate) {
                // Process immediately without debouncing
                this.refreshCards();
            }
        });

        // Only observe the board containers
        const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
        boardContainers.forEach(container => {
            this.boardObserver.observe(container, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false
            });
        });
    }

// Also update initialize to set up continuous checks
    initialize() {
        if (!this.checkEnabled()) {
            return;
        }

        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.applyOverflowFixes();
        this.processCards();

        // Use a more frequent interval for smoother updates
        this.refreshInterval = setInterval(() => {
            if (!this.isUpdating) {
                this.checkForNewCards();
                this.updatePositions(); // Update positions regularly
            }
        }, 500); // More frequent updates
    }
    checkEnabled() {
        try {
            const enabled = localStorage.getItem('gitLabHelperHideLabelsEnabled');
            return localStorage.getItem('gitLabHelperHideLabelsEnabled') === null ? true : enabled === 'true';
        } catch (e) {
            console.error('Error checking hide labels enabled state:', e);
            return true;
        }
    }

    applyOverflowFixes() {
        this.originalStyles = [];
        const ulElements = document.querySelectorAll('ul.board-list');
        ulElements.forEach(ul => {
            this.originalStyles.push({
                element: ul,
                property: 'overflow-x',
                value: ul.style.overflowX
            });
            ul.style.setProperty('overflow-x', 'unset', 'important');
            ul.style.setProperty('overflow-y', 'unset', 'important');
        });

        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        cardAreas.forEach(area => {
            this.originalStyles.push({
                element: area,
                property: 'overflow',
                value: area.style.overflow
            });
            this.originalStyles.push({
                element: area,
                property: 'position',
                value: area.style.position
            });
            area.style.overflow = 'auto';
            area.style.position = 'relative';
        });

        return cardAreas;
    }

    processCards() {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            // Process all cards
            const cards = document.querySelectorAll('.board-card');
            cards.forEach(card => {
                // Skip cards we've already processed
                if (!this.processedCards.has(card)) {
                    this.processCard(card);
                    this.processedCards.set(card, true);
                }
            });
        } finally {
            this.isUpdating = false;
        }
    }

    processCard(card) {
        // Find the labels container
        const labelsContainer = card.querySelector('.board-card-labels');
        if (!labelsContainer) return;

        // Hide the labels container
        labelsContainer.style.display = 'none';

        // Find priority labels
        const labels = Array.from(labelsContainer.querySelectorAll('.gl-label'));
        const priorityLabel = labels.find(label => {
            const labelText = label.textContent.trim();
            return this.priorityLabels.some(priority =>
                labelText.includes(priority)
            );
        });

        if (priorityLabel) {
            // Get the background color of the priority label
            const style = window.getComputedStyle(priorityLabel);
            const backgroundColor = style.backgroundColor;

            // Store a unique ID for this card if it doesn't have one
            if (!card.id) {
                card.id = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            }

            // Find the board-list-cards-area container
            const container = card.closest('[data-testid="board-list-cards-area"]');
            if (!container) return;

            // Create indicator line
            const indicator = document.createElement('div');
            indicator.className = 'priority-indicator';
            indicator.dataset.cardId = card.id;

            // Position relative to the container (similar to dropdown)
            const cardRect = card.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            const top = cardRect.top - containerRect.top + container.scrollTop;
            const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

            indicator.style.position = 'absolute';
            indicator.style.top = `${top}px`;
            indicator.style.left = `${left}px`;
            indicator.style.width = `${cardRect.width - 4}px`;
            indicator.style.height = '4px';
            indicator.style.backgroundColor = backgroundColor;
            indicator.style.zIndex = '98'; // Below dropdown z-index
            indicator.style.borderRadius = '2px';

            // Add indicator to the board-list-cards-area
            container.appendChild(indicator);
            this.indicatorElements.push({
                element: indicator,
                card: card
            });
        }
    }

    checkForNewCards() {
        if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
            return;
        }

        const cards = document.querySelectorAll('.board-card');
        let newCardsFound = false;

        cards.forEach(card => {
            if (!this.processedCards.has(card)) {
                newCardsFound = true;
            }
        });

        if (newCardsFound) {
            this.processCards();
        }
    }

    updatePositions() {
        if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
            return;
        }

        this.isUpdating = true;

        try {
            this.indicatorElements.forEach(({element, card}) => {
                if (element && card && element.parentNode) {
                    const container = card.closest('[data-testid="board-list-cards-area"]');
                    if (container) {
                        const cardRect = card.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        const top = cardRect.top - containerRect.top + container.scrollTop;
                        const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

                        element.style.top = `${top}px`;
                        element.style.left = `${left}px`;
                        element.style.width = `${cardRect.width - 4}px`;
                    }
                }
            });
        } finally {
            this.isUpdating = false;
        }
    }

    handleScroll() {
        if (!this.initialized || !this.checkEnabled()) return;

        // Only update positions when scrolling stops
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.updatePositions();
        }, 100);
    }

    handleResize() {
        if (!this.initialized || !this.checkEnabled()) return;

        // Only update positions when resizing stops
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.updatePositions();
        }, 100);
    }



    cleanup() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        if (this.boardObserver) {
            this.boardObserver.disconnect();
            this.boardObserver = null;
        }

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }

        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }

        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }

        // Show all label containers again
        document.querySelectorAll('.board-card-labels').forEach(container => {
            container.style.display = '';
        });

        // Remove all indicator elements
        this.indicatorElements.forEach(({element}) => {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });

        this.indicatorElements = [];
        this.processedCards = new WeakMap();
        this.initialized = false;
        this.isUpdating = false;
    }
}
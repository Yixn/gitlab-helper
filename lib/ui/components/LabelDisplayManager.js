export default class LabelDisplayManager {
    constructor(options = {}) {
        this.initialized = false;
        this.uiManager = options.uiManager || window.uiManager;
        this.priorityLabels = ['priority', 'Priority', 'high', 'High', 'medium', 'Medium', 'low', 'Low', 'critical', 'Critical'];
        this.indicatorElements = [];
        this.processedCards = new WeakMap(); // Track processed cards
        this.isUpdating = false; // Prevent concurrent updates
        this.cardIdMap = new Map(); // Track card IDs to indicators for better cleanup
        this.cardContainerMap = new Map(); // Track which container each card belongs to

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
                    } else {
                        // Check if the card has moved to a different container
                        this.checkCardContainer(card);
                    }
                });

                // Update positions immediately
                this.updatePositions();

                // Check for removed cards and clean up their indicators
                this.cleanupOrphanedIndicators();
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
                // Filter and update valid indicators
                const validIndicators = [];

                for (let i = 0; i < this.indicatorElements.length; i++) {
                    const {element, card} = this.indicatorElements[i];

                    // Skip invalid elements or dragging cards
                    if (!element || !element.parentNode || !card || !card.parentNode ||
                        card.classList.contains('is-dragging') || card.classList.contains('is-ghost')) {
                        if (element && element.parentNode) {
                            element.parentNode.removeChild(element);
                        }
                        continue;
                    }

                    // Check if card moved to a different container
                    const container = card.closest('[data-testid="board-list-cards-area"]');
                    if (!container) continue;

                    const cardRect = card.getBoundingClientRect();
                    const containerRect = container.getBoundingClientRect();

                    const top = cardRect.top - containerRect.top + container.scrollTop;
                    const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

                    element.style.top = `${top}px`;
                    element.style.left = `${left}px`;
                    element.style.width = `${cardRect.width - 4}px`;

                    validIndicators.push({element, card});
                }

                // Replace array with only valid indicators
                this.indicatorElements = validIndicators;
            } finally {
                this.isUpdating = false;
            }
        };

        // Now bind all methods to this instance
        this.handleScroll = this.handleScroll.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.refreshCards = this.refreshCards.bind(this);
        this.updatePositions = this.updatePositions.bind(this);
        this.handleDragEvents = this.handleDragEvents.bind(this);

        // Setup listeners
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);
        document.addEventListener('dragstart', this.handleDragEvents);
        document.addEventListener('dragend', this.handleDragEvents);
        document.addEventListener('drop', this.handleDragEvents);

        this.setupMutationObserver();

        // Check if enabled
        this.checkEnabled();
    }

    // Handle drag events to improve cleanup
    handleDragEvents(e) {
        if (!this.initialized || !this.checkEnabled()) return;

        // If it's dragstart, store all indicators that need cleanup
        if (e.type === 'dragstart') {
            // Remove all indicators immediately when dragging starts
            this.cleanupAllIndicators();
        } else if (e.type === 'dragend' || e.type === 'drop') {
            // Wait a bit to let the DOM update
            setTimeout(() => {
                this.cleanupAllIndicators();
                this.processCards();
            }, 100);
        }
    }

    // Check if a card has moved to a different container
    checkCardContainer(card) {
        if (!card.id) return;

        const currentContainer = card.closest('[data-testid="board-list-cards-area"]');
        if (!currentContainer) return;

        const previousContainer = this.cardContainerMap.get(card.id);

        // If the card has moved to a different container
        if (previousContainer && previousContainer !== currentContainer) {
            // Find and remove the indicator for this card
            const indicator = this.cardIdMap.get(card.id);
            if (indicator && indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);

                // Remove from tracking
                this.cardIdMap.delete(card.id);

                // Filter out this indicator from the array
                this.indicatorElements = this.indicatorElements.filter(item =>
                    item.element !== indicator
                );

                // Reprocess the card in its new container
                this.processCard(card);
            }
        }

        // Update the container map
        this.cardContainerMap.set(card.id, currentContainer);
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
            let cardRemoved = false;
            let cardMoved = false;
            let classChanged = false;

            mutations.forEach(mutation => {
                // Process mutations that add/remove elements
                if (mutation.type === 'childList') {
                    // Check for added cards
                    const addedCards = Array.from(mutation.addedNodes).filter(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList?.contains('board-card') || node.querySelector?.('.board-card'))
                    );

                    if (addedCards.length > 0) {
                        needsUpdate = true;
                        cardMoved = true;
                    }

                    // Check for removed cards
                    const removedCards = Array.from(mutation.removedNodes).filter(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList?.contains('board-card') || node.querySelector?.('.board-card'))
                    );

                    if (removedCards.length > 0) {
                        cardRemoved = true;
                    }
                } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                    // Track class changes on cards
                    if (mutation.target.classList &&
                        (mutation.target.classList.contains('board-card') ||
                            mutation.target.classList.contains('is-dragging') ||
                            mutation.target.classList.contains('is-ghost'))) {
                        classChanged = true;
                    }
                }
            });

            // If cards are changing classes (like adding/removing is-dragging)
            if (classChanged) {
                setTimeout(() => this.updatePositions(), 50);
            }

            // If cards are moved or removed, do a full cleanup
            if (cardMoved || cardRemoved) {
                setTimeout(() => {
                    this.cleanupOrphanedIndicators();
                    this.refreshCards();
                }, 100);
            } else if (needsUpdate) {
                // Process immediately without debouncing for other updates
                this.refreshCards();
            }
        });

        // Observe the board containers with class attribute changes too
        const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
        boardContainers.forEach(container => {
            this.boardObserver.observe(container, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['class']
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

        // Clear any existing indicators first
        this.cleanupAllIndicators();

        // Process cards
        this.processCards();

        // Use a more frequent interval for smoother updates
        this.refreshInterval = setInterval(() => {
            if (!this.isUpdating) {
                this.checkForNewCards();
                this.updatePositions(); // Update positions regularly
                this.cleanupOrphanedIndicators(); // Periodically check for orphaned indicators
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
        // Skip ghost/dragging cards
        if (card.classList.contains('is-dragging') || card.classList.contains('is-ghost')) {
            return;
        }

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

            // Store the container for this card
            this.cardContainerMap.set(card.id, container);

            // Check if an indicator already exists for this card
            if (this.cardIdMap.has(card.id)) {
                const existingIndicator = this.cardIdMap.get(card.id);
                if (existingIndicator && existingIndicator.parentNode) {
                    existingIndicator.parentNode.removeChild(existingIndicator);

                    // Remove from tracking
                    this.indicatorElements = this.indicatorElements.filter(item =>
                        item.element !== existingIndicator
                    );
                }
            }

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

            // Track the relationship between card ID and indicator
            this.cardIdMap.set(card.id, indicator);

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

    cleanupOrphanedIndicators() {
        if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
            return;
        }

        this.isUpdating = true;

        try {
            // Get all current card IDs
            const currentCardIds = new Set();
            document.querySelectorAll('.board-card').forEach(card => {
                if (card.id) {
                    currentCardIds.add(card.id);
                }
            });

            // Check each indicator against current cards
            for (let i = this.indicatorElements.length - 1; i >= 0; i--) {
                const {element, card} = this.indicatorElements[i];

                // Remove indicator if either:
                // 1. The element has no parent (already removed from DOM)
                // 2. The card is not in the DOM anymore
                // 3. The card's ID doesn't match any current cards
                // 4. The card is being dragged

                const elementRemoved = !element || !element.parentNode;
                const cardMissing = !card || !card.parentNode;
                const cardIdMissing = card && card.id && !currentCardIds.has(card.id);
                const cardDragging = card && (card.classList.contains('is-dragging') || card.classList.contains('is-ghost'));

                if (elementRemoved || cardMissing || cardIdMissing || cardDragging) {
                    // Remove the element from DOM if it still exists
                    if (element && element.parentNode) {
                        element.parentNode.removeChild(element);
                    }

                    // Remove from our tracking arrays
                    this.indicatorElements.splice(i, 1);

                    // Remove from card ID map
                    if (card && card.id) {
                        this.cardIdMap.delete(card.id);
                    }

                    // Clear from processed cards WeakMap (card will be GC'd if not in DOM)
                    if (card) {
                        this.processedCards.delete(card);
                    }
                }
            }

            // Also find and remove any indicators that are orphaned but still in the DOM
            document.querySelectorAll('.priority-indicator').forEach(indicator => {
                const cardId = indicator.dataset.cardId;
                if (!cardId || !currentCardIds.has(cardId)) {
                    if (indicator.parentNode) {
                        indicator.parentNode.removeChild(indicator);
                    }

                    // Make sure it's removed from our maps
                    if (cardId) {
                        this.cardIdMap.delete(cardId);
                    }
                }
            });
        } finally {
            this.isUpdating = false;
        }
    }

    cleanupAllIndicators() {
        // Remove all indicator elements from the DOM
        this.indicatorElements.forEach(({element}) => {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });

        // Also find and remove any other indicators in the DOM
        document.querySelectorAll('.priority-indicator').forEach(indicator => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        });

        // Clear tracking arrays and maps
        this.indicatorElements = [];
        this.cardIdMap.clear();
        this.cardContainerMap.clear();
        this.processedCards = new WeakMap();
    }

    updatePositions() {
        if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
            return;
        }

        this.isUpdating = true;

        try {
            // Filter out invalid indicators before positioning
            const validIndicators = [];

            for (let i = 0; i < this.indicatorElements.length; i++) {
                const {element, card} = this.indicatorElements[i];

                // Skip invalid elements or dragging cards
                if (!element || !element.parentNode || !card || !card.parentNode ||
                    card.classList.contains('is-dragging') || card.classList.contains('is-ghost')) {
                    if (element && element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                    continue;
                }

                try {
                    const container = card.closest('[data-testid="board-list-cards-area"]');
                    if (container) {
                        const cardRect = card.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        const top = cardRect.top - containerRect.top + container.scrollTop;
                        const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

                        element.style.top = `${top}px`;
                        element.style.left = `${left}px`;
                        element.style.width = `${cardRect.width - 4}px`;

                        validIndicators.push({element, card});
                    }
                } catch (e) {
                    console.error('Error updating indicator position:', e);
                    if (element && element.parentNode) {
                        element.parentNode.removeChild(element);
                    }
                }
            }

            // Replace array with only valid indicators
            this.indicatorElements = validIndicators;
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

        // Remove drag event listeners
        document.removeEventListener('dragstart', this.handleDragEvents);
        document.removeEventListener('dragend', this.handleDragEvents);
        document.removeEventListener('drop', this.handleDragEvents);

        // Remove scroll/resize listeners
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);

        // Show all label containers again
        document.querySelectorAll('.board-card-labels').forEach(container => {
            container.style.display = '';
        });

        // Clean up all indicators
        this.cleanupAllIndicators();

        this.initialized = false;
        this.isUpdating = false;
    }
}
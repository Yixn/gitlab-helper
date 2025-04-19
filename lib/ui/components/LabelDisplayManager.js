export default class LabelDisplayManager {
  constructor(options = {}) {
    this.initialized = false;
    this.uiManager = options.uiManager || window.uiManager;
    this.priorityLabels = ['priority', 'Priority', 'high', 'High', 'medium', 'Medium', 'low', 'Low', 'critical', 'Critical'];
    this.indicatorElements = [];
    this.processedCards = new WeakMap();
    this.isUpdating = false;
    this.cardIdMap = new Map();
    this.cardContainerMap = new Map();
    this.draggedCards = new Set();
    this.handleScroll = function () {
      if (!this.initialized || !this.checkEnabled()) return;
      this.updatePositions();
    };
    this.handleResize = function () {
      if (!this.initialized || !this.checkEnabled()) return;
      this.updatePositions();
    };
    this.refreshCards = function () {
      if (this.isUpdating) return;
      this.isUpdating = true;
      try {
        const cards = document.querySelectorAll('.board-card');
        cards.forEach(card => {
          if (!this.processedCards.has(card)) {
            this.processCard(card);
            this.processedCards.set(card, true);
          } else {
            this.checkCardContainer(card);
          }
        });
        this.updatePositions();
        this.cleanupOrphanedIndicators();
      } finally {
        this.isUpdating = false;
      }
    };
    this.updatePositions = function () {
      if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
        return;
      }
      this.isUpdating = true;
      try {
        const validIndicators = [];
        for (let i = 0; i < this.indicatorElements.length; i++) {
          const {
            element,
            card
          } = this.indicatorElements[i];
          if (!element || !element.parentNode || !card || !card.parentNode) {
            if (element && element.parentNode) {
              element.parentNode.removeChild(element);
            }
            continue;
          }
          if (card.classList.contains('is-dragging') || card.classList.contains('is-ghost')) {
            element.style.opacity = '0';
            validIndicators.push({
              element,
              card
            });
            continue;
          } else {
            element.style.opacity = '1';
          }
          const container = card.closest('[data-testid="board-list-cards-area"]');
          if (!container) continue;
          const cardRect = card.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          const top = cardRect.top - containerRect.top + container.scrollTop;
          const left = cardRect.left - containerRect.left + container.scrollLeft + 2;
          element.style.top = `${top}px`;
          element.style.left = `${left}px`;
          element.style.width = `${cardRect.width - 4}px`;
          validIndicators.push({
            element,
            card
          });
        }
        this.indicatorElements = validIndicators;
      } finally {
        this.isUpdating = false;
      }
    };
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.refreshCards = this.refreshCards.bind(this);
    this.updatePositions = this.updatePositions.bind(this);
    this.handleDragEvents = this.handleDragEvents.bind(this);
    window.addEventListener('scroll', this.handleScroll);
    window.addEventListener('resize', this.handleResize);
    document.addEventListener('dragstart', this.handleDragEvents);
    document.addEventListener('dragend', this.handleDragEvents);
    document.addEventListener('drop', this.handleDragEvents);
    this.setupMutationObserver();
    this.checkEnabled();
  }
  handleDragEvents(e) {
    if (!this.initialized || !this.checkEnabled()) return;
    let card = null;
    if (e.target && e.target.classList && e.target.classList.contains('board-card')) {
      card = e.target;
    } else if (e.target) {
      card = e.target.closest('.board-card');
    }
    if (!card) return;
    if (e.type === 'dragstart') {
      if (card.id) {
        this.draggedCards.add(card.id);
        const indicator = this.cardIdMap.get(card.id);
        if (indicator) {
          indicator.style.opacity = '0';
        }
      }
    } else if (e.type === 'dragend' || e.type === 'drop') {
      if (card.id) {
        this.draggedCards.delete(card.id);
        const indicator = this.cardIdMap.get(card.id);
        if (indicator) {
          indicator.style.opacity = '1';
        }
      }
      setTimeout(() => {
        this.refreshCards();
      }, 100);
    }
  }
  checkCardContainer(card) {
    if (!card.id) return;
    const currentContainer = card.closest('[data-testid="board-list-cards-area"]');
    if (!currentContainer) return;
    const previousContainer = this.cardContainerMap.get(card.id);
    if (previousContainer && previousContainer !== currentContainer) {
      const indicator = this.cardIdMap.get(card.id);
      if (indicator && indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
        this.cardIdMap.delete(card.id);
        this.indicatorElements = this.indicatorElements.filter(item => item.element !== indicator);
        this.processCard(card);
      }
    }
    this.cardContainerMap.set(card.id, currentContainer);
  }
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
      let dragStateChanged = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          const addedCards = Array.from(mutation.addedNodes).filter(node => node.nodeType === Node.ELEMENT_NODE && (node.classList?.contains('board-card') || node.querySelector?.('.board-card')));
          if (addedCards.length > 0) {
            needsUpdate = true;
            cardMoved = true;
          }
          const removedCards = Array.from(mutation.removedNodes).filter(node => node.nodeType === Node.ELEMENT_NODE && (node.classList?.contains('board-card') || node.querySelector?.('.board-card')));
          if (removedCards.length > 0) {
            cardRemoved = true;
          }
        } else if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
          if (mutation.target.classList?.contains('board-card')) {
            classChanged = true;
            const isDragging = mutation.target.classList.contains('is-dragging') || mutation.target.classList.contains('is-ghost');
            const wasDragging = this.draggedCards.has(mutation.target.id);
            if (isDragging !== wasDragging) {
              dragStateChanged = true;
              if (isDragging) {
                if (mutation.target.id) {
                  this.draggedCards.add(mutation.target.id);
                  const indicator = this.cardIdMap.get(mutation.target.id);
                  if (indicator) {
                    indicator.style.opacity = '0';
                  }
                }
              } else {
                if (mutation.target.id) {
                  this.draggedCards.delete(mutation.target.id);
                  const indicator = this.cardIdMap.get(mutation.target.id);
                  if (indicator) {
                    indicator.style.opacity = '1';
                  } else {
                    this.processCard(mutation.target);
                  }
                }
              }
            }
          }
        }
      });
      if (dragStateChanged) {
        setTimeout(() => this.updatePositions(), 0);
      }
      if (classChanged && !dragStateChanged) {
        setTimeout(() => this.updatePositions(), 50);
      }
      if (cardMoved || cardRemoved) {
        setTimeout(() => {
          this.cleanupOrphanedIndicators();
          this.refreshCards();
        }, 100);
      } else if (needsUpdate) {
        this.refreshCards();
      }
    });
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
  initialize() {
    if (!this.checkEnabled()) {
      return;
    }
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.applyOverflowFixes();
    this.cleanupAllIndicators();
    this.processCards();
    this.refreshInterval = setInterval(() => {
      if (!this.isUpdating) {
        this.checkForNewCards();
        this.updatePositions();
        this.cleanupOrphanedIndicators();
      }
    }, 500);
  }
  checkEnabled() {
    try {
      const enabled = localStorage.getItem('gitLabHelperHideLabelsEnabled');
      return enabled === 'true';
    } catch (e) {
      console.error('Error checking hide labels enabled state:', e);
      return false;
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
      const cards = document.querySelectorAll('.board-card');
      cards.forEach(card => {
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
    if (card.classList.contains('is-ghost')) {
      return;
    }
    const labelsContainer = card.querySelector('.board-card-labels');
    if (!labelsContainer) return;
    labelsContainer.style.display = 'none';
    const labels = Array.from(labelsContainer.querySelectorAll('.gl-label'));
    const priorityLabel = labels.find(label => {
      const labelText = label.textContent.trim();
      return this.priorityLabels.some(priority => labelText.includes(priority));
    });
    if (priorityLabel) {
      const style = window.getComputedStyle(priorityLabel);
      const backgroundColor = style.backgroundColor;
      if (!card.id) {
        card.id = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      }
      const container = card.closest('[data-testid="board-list-cards-area"]');
      if (!container) return;
      this.cardContainerMap.set(card.id, container);
      if (this.cardIdMap.has(card.id)) {
        const existingIndicator = this.cardIdMap.get(card.id);
        if (existingIndicator && existingIndicator.parentNode) {
          existingIndicator.parentNode.removeChild(existingIndicator);
          this.indicatorElements = this.indicatorElements.filter(item => item.element !== existingIndicator);
        }
      }
      const indicator = document.createElement('div');
      indicator.className = 'priority-indicator';
      indicator.dataset.cardId = card.id;
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
      indicator.style.zIndex = '98';
      indicator.style.borderRadius = '2px';
      indicator.style.transition = 'opacity 0.2s ease';
      if (card.classList.contains('is-dragging')) {
        indicator.style.opacity = '0';
        if (card.id) {
          this.draggedCards.add(card.id);
        }
      } else {
        indicator.style.opacity = '1';
      }
      container.appendChild(indicator);
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
      const currentCardIds = new Set();
      document.querySelectorAll('.board-card').forEach(card => {
        if (card.id) {
          currentCardIds.add(card.id);
        }
      });
      for (let i = this.indicatorElements.length - 1; i >= 0; i--) {
        const {
          element,
          card
        } = this.indicatorElements[i];
        const elementRemoved = !element || !element.parentNode;
        const cardMissing = !card || !card.parentNode;
        const cardIdMissing = card && card.id && !currentCardIds.has(card.id);
        if (elementRemoved || cardMissing || cardIdMissing) {
          if (element && element.parentNode) {
            element.parentNode.removeChild(element);
          }
          this.indicatorElements.splice(i, 1);
          if (card && card.id) {
            this.cardIdMap.delete(card.id);
            this.draggedCards.delete(card.id);
          }
          if (card) {
            this.processedCards.delete(card);
          }
        }
      }
      document.querySelectorAll('.priority-indicator').forEach(indicator => {
        const cardId = indicator.dataset.cardId;
        if (!cardId || !currentCardIds.has(cardId)) {
          if (indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
          if (cardId) {
            this.cardIdMap.delete(cardId);
            this.draggedCards.delete(cardId);
          }
        }
      });
    } finally {
      this.isUpdating = false;
    }
  }
  cleanupAllIndicators() {
    this.indicatorElements.forEach(({
      element
    }) => {
      if (element && element.parentNode) {
        element.parentNode.removeChild(element);
      }
    });
    document.querySelectorAll('.priority-indicator').forEach(indicator => {
      if (indicator.parentNode) {
        indicator.parentNode.removeChild(indicator);
      }
    });
    this.indicatorElements = [];
    this.cardIdMap.clear();
    this.cardContainerMap.clear();
    this.draggedCards.clear();
    this.processedCards = new WeakMap();
  }
  handleScroll() {
    if (!this.initialized || !this.checkEnabled()) return;
    clearTimeout(this.scrollTimeout);
    this.scrollTimeout = setTimeout(() => {
      this.updatePositions();
    }, 100);
  }
  handleResize() {
    if (!this.initialized || !this.checkEnabled()) return;
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
    document.removeEventListener('dragstart', this.handleDragEvents);
    document.removeEventListener('dragend', this.handleDragEvents);
    document.removeEventListener('drop', this.handleDragEvents);
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
    document.querySelectorAll('.board-card-labels').forEach(container => {
      container.style.display = '';
    });
    this.cleanupAllIndicators();
    this.initialized = false;
    this.isUpdating = false;
  }
}
export default class IssueSelector {
  constructor(options = {}) {
    this.uiManager = options.uiManager;
    this.onSelectionChange = options.onSelectionChange || null;
    this.onSelectionComplete = options.onSelectionComplete || null;
    this.isSelectingIssue = false;
    this.selectionOverlays = [];
    this.selectedOverlays = [];
    this.selectedIssues = options.initialSelection || [];
    this.pageOverlay = null;
    this.selectionCounter = null;
    this.helpText = null;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isSelectingIssue) {
        this.exitSelectionMode();
      }
    });
  }
  startSelection() {
    if (this.isSelectingIssue) return;
    this.isSelectingIssue = true;
    const currentSelection = [...this.selectedIssues];
    this.applyOverflowFixes();
    this.createCardOverlays(currentSelection);
    this.createFixedControls();
    const selectButton = document.getElementById('select-issues-button');
    if (selectButton) {
      selectButton.dataset.active = 'true';
      selectButton.style.backgroundColor = '#28a745';
      selectButton.textContent = '✓ Done';
    }
    window.addEventListener('scroll', this.handleScroll);
    window.addEventListener('resize', this.handleResize);
    this.setupMutationObserver();
  }
  applyOverflowFixes() {
    this.originalStyles = [];
    const ulElements = document.querySelectorAll('ul.board-list');
    ulElements.forEach(ul => {
      this.originalStyles = [{
        element: ul,
        property: 'overflow-x',
        value: ul.style.overflowX
      }];
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
  createCardOverlays(currentSelection = []) {
    this.selectionOverlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    this.selectionOverlays = [];
    this.selectedIssues = currentSelection || [];
    this.selectedOverlays = [];
    const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
    cardAreas.forEach(cardArea => {
      try {
        const cards = cardArea.querySelectorAll('.board-card');
        cards.forEach((card, index) => {
          try {
            const issueItem = this.getIssueItemFromCard(card);
            if (!issueItem) return;
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
            this.positionOverlay(overlay, card, cardArea);
            if (currentSelection.some(issue => issue.iid === issueItem.iid && issue.referencePath === issueItem.referencePath)) {
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
              overlay.appendChild(badge);
              this.selectedOverlays.push(overlay);
            }
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
            overlay.addEventListener('click', e => {
              e.stopPropagation();
              this.toggleCardSelection(card, overlay);
            });
            cardArea.appendChild(overlay);
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
  getIssueItemFromCard(boardCard) {
    try {
      if (boardCard.__vue__) {
        if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
          const issueComponent = boardCard.__vue__.$children.find(child => child.$props && child.$props.item);
          if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
            return issueComponent.$props.item;
          }
        }
        if (boardCard.__vue__.$options && boardCard.__vue__.$options.children && boardCard.__vue__.$options.children.length > 0) {
          const issueComponent = boardCard.__vue__.$options.children.find(child => child.$props && child.$props.item);
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
          referencePath: window.location.pathname.split('/boards')[0]
        };
      }
    } catch (e) {
      console.error('Error getting issue item from card:', e);
    }
    return null;
  }
  renumberBadges() {
    this.selectedOverlays.forEach((overlay, index) => {
      const badge = overlay.querySelector('.selection-badge');
      if (badge) {
        badge.textContent = index + 1;
      }
    });
  }
  exitSelectionMode() {
    if (!this.isSelectingIssue) return;
    this.isSelectingIssue = false;
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    if (this.overflowFixTimeout) {
      clearTimeout(this.overflowFixTimeout);
      this.overflowFixTimeout = null;
    }
    if (this.boardObserver) {
      this.boardObserver.disconnect();
      this.boardObserver = null;
    }
    this.selectionOverlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    if (this.selectionCounter && this.selectionCounter.parentNode) {
      this.selectionCounter.parentNode.removeChild(this.selectionCounter);
      this.selectionCounter = null;
    }
    if (this.helpText && this.helpText.parentNode) {
      this.helpText.parentNode.removeChild(this.helpText);
      this.helpText = null;
    }
    this.selectionOverlays = [];
    this.selectedOverlays = [];
    const selectButton = document.getElementById('select-issues-button');
    if (selectButton) {
      selectButton.dataset.active = 'false';
      selectButton.style.backgroundColor = '#6c757d';
      selectButton.textContent = 'Select';
    }
    this.syncSelectionWithBulkCommentsView();
    if (typeof this.onSelectionComplete === 'function') {
      this.onSelectionComplete(this.selectedIssues);
    }
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
        this.selectedIssues = this.selectedIssues.filter(issue => !(issue.iid === issueItem.iid && issue.referencePath === issueItem.referencePath));
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
  repositionOverlays() {
    if (!this.isSelectingIssue) return;
    if (this.helpText) {
      this.helpText.style.top = '10px';
      this.helpText.style.left = '50%';
    }
    if (this.selectionCounter) {
      this.selectionCounter.style.top = '50px';
      this.selectionCounter.style.left = '50%';
    }
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
  setSelectedIssues(issues) {
    this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
    if (this.isSelectingIssue && this.selectionOverlays.length > 0) {
      this.updateOverlaysFromSelection();
    }
    const statusEl = document.getElementById('comment-status');
    if (statusEl && !this.isSelectingIssue) {
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
  positionOverlay(overlay, card, cardArea) {
    try {
      const cardRect = card.getBoundingClientRect();
      const areaRect = cardArea.getBoundingClientRect();
      const top = cardRect.top - areaRect.top + cardArea.scrollTop;
      const left = cardRect.left - areaRect.left + cardArea.scrollLeft;
      overlay.style.top = `${top}px`;
      overlay.style.left = `${left}px`;
      overlay.style.width = `${cardRect.width}px`;
      overlay.style.height = `${cardRect.height}px`;
    } catch (e) {
      console.error('Error positioning overlay:', e);
    }
  }
  selectAllCards() {
    if (!this.isSelectingIssue) return;

    const allCards = [];
    const cardOverlays = this.selectionOverlays.filter(o => o.className === 'card-selection-overlay');

    cardOverlays.forEach(overlay => {
      if (overlay.dataset && overlay.originalCard && overlay.dataset.selected !== 'true') {
        const card = overlay.originalCard;
        const issueItem = this.getIssueItemFromCard(card);
        if (issueItem) {
          allCards.push({
            overlay: overlay,
            issueItem: issueItem
          });
        }
      }
    });

    // Clear current selection
    this.selectedIssues = [];
    this.selectedOverlays = [];

    // Reset all overlays
    cardOverlays.forEach(overlay => {
      overlay.dataset.selected = 'false';
      overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
      overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
      overlay.style.boxShadow = 'none';
      overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
    });

    // Select all cards
    allCards.forEach((item, index) => {
      const overlay = item.overlay;
      const issueItem = item.issueItem;

      overlay.dataset.selected = 'true';
      overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
      overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
      overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

      const badge = document.createElement('div');
      badge.className = 'selection-badge';
      badge.textContent = index + 1;
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

      this.selectedIssues.push(issueItem);
      this.selectedOverlays.push(overlay);
    });

    this.updateSelectionCounter();
    this.syncSelectionWithBulkCommentsView();
  }
  deselectAllCards() {
    if (!this.isSelectingIssue) return;

    // Clear selection
    this.selectedIssues = [];
    this.selectedOverlays = [];

    // Reset all overlays
    const cardOverlays = this.selectionOverlays.filter(o => o.className === 'card-selection-overlay');
    cardOverlays.forEach(overlay => {
      overlay.dataset.selected = 'false';
      overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
      overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
      overlay.style.boxShadow = 'none';
      overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
    });

    this.updateSelectionCounter();
    this.syncSelectionWithBulkCommentsView();
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

    const selectionCounter = document.createElement('div');
    selectionCounter.id = 'selection-counter';
    selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
    selectionCounter.style.position = 'fixed';
    selectionCounter.style.top = '50px';
    selectionCounter.style.left = '50%';
    selectionCounter.style.transform = 'translateX(-50%)';
    selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ? 'rgba(40, 167, 69, 0.9)' : 'rgba(0, 0, 0, 0.8)';
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
  handleScroll = () => {
    this.repositionOverlays();
  };
  handleResize = () => {
    this.repositionOverlays();
  };
  setupMutationObserver() {
    if (this.boardObserver) {
      this.boardObserver.disconnect();
    }
    this.boardObserver = new MutationObserver(mutations => {
      if (!this.isSelectingIssue) return;
      let needsUpdate = false;
      let overflowReset = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          const hasCardChanges = Array.from(mutation.addedNodes).some(node => node.classList && node.classList.contains('board-card'));
          if (hasCardChanges) {
            needsUpdate = true;
          }
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target;
          if (target.matches('[data-testid="board-list-cards-area"]') || target.matches('.board-list ul')) {
            const style = window.getComputedStyle(target);
            if (target.matches('[data-testid="board-list-cards-area"]') && style.overflow !== 'auto') {
              overflowReset = true;
            }
            if (target.matches('.board-list ul') && style.overflowX !== 'unset') {
              overflowReset = true;
            }
          }
        }
      });
      if (overflowReset) {
        clearTimeout(this.overflowFixTimeout);
        this.overflowFixTimeout = setTimeout(() => {
          this.applyOverflowFixes();
        }, 50);
      }
      if (needsUpdate) {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
          this.createCardOverlays(this.selectedIssues);
        }, 100);
      }
    });
    const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
    boardContainers.forEach(container => {
      this.boardObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    });
  }
}
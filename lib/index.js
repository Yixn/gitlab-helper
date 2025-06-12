import GitLabAPI from './api/GitLabAPI';
import { processBoards } from './core/DataProcessor';
import SettingsManager from './ui/managers/SettingsManager';
import HistoryManager from './core/HistoryManager';
import UIManager from './ui/UIManager';
import LabelManager from './ui/managers/LabelManager';
import AssigneeManager from './ui/managers/AssigneeManager';
import LinkedItemsManager from './ui/components/LinkedItemsManager';
import LabelDisplayManager from './ui/components/LabelDisplayManager';
function injectCustomCSS() {
  const style = document.createElement('style');
  style.textContent = `
    [data-testid="board-card-title-link"] {
      height: 33px !important;
      display: flex;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  `;
  document.head.appendChild(style);
}
injectCustomCSS();
let linkedItemsManager = null;
let labelDisplayManager = null;
function initializeLinkedItemsManager() {
  if (!linkedItemsManager) {
    linkedItemsManager = new LinkedItemsManager({
      uiManager: window.uiManager
    });
    window.linkedItemsManager = linkedItemsManager;
    linkedItemsManager.initialize();
  }
}
function toggleLinkedItems() {
  if (!linkedItemsManager) {
    initializeLinkedItemsManager();
  } else {
    if (linkedItemsManager.initialized) {
      linkedItemsManager.cleanup();
    } else {
      linkedItemsManager.initialize();
    }
  }
}
function initializeLabelDisplayManager() {
  if (!labelDisplayManager) {
    labelDisplayManager = new LabelDisplayManager({
      uiManager: window.uiManager
    });
    window.labelDisplayManager = labelDisplayManager;
    labelDisplayManager.initialize();
  }
}
function toggleHideLabels() {
  if (!labelDisplayManager) {
    initializeLabelDisplayManager();
    initializeLinkedItemsManager();
  } else {
    if (labelDisplayManager.initialized) {
      labelDisplayManager.cleanup();
      linkedItemsManager.repositionDropdowns();
    } else {
      labelDisplayManager.initialize();
      linkedItemsManager.repositionDropdowns();
    }
  }
}
window.toggleLinkedItems = toggleLinkedItems;
window.toggleHideLabels = toggleHideLabels;
var gitlabApi = window.gitlabApi || new GitLabAPI();
function createUIManager(attachmentElement = document.body) {
  if (!window.gitlabApi) {
    try {
      window.gitlabApi = new GitLabAPI();
    } catch (e) {
      console.error('Error creating GitLabAPI instance:', e);
    }
  }
  try {
    const uiManager = new UIManager();
    uiManager.initialize(attachmentElement);
    window.uiManager = uiManager;
    if (!window.settingsManager && typeof SettingsManager === 'function') {
      try {
        window.settingsManager = new SettingsManager({
          labelManager: uiManager?.labelManager,
          assigneeManager: uiManager?.assigneeManager,
          gitlabApi: window.gitlabApi,
          onSettingsChanged: type => {
            if (uiManager?.bulkCommentsView) {
              if (type === 'all' || type === 'labels') {
                uiManager.bulkCommentsView.addLabelShortcut();
              }
              if (type === 'all' || type === 'assignees') {
                uiManager.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
      } catch (e) {
        console.error('Error creating SettingsManager:', e);
      }
    }
    return uiManager;
  } catch (e) {
    console.error('Error creating UI Manager:', e);
    return null;
  }
}
let isInitialized = false;
function checkAndInit() {
  if (isInitialized) {
    return;
  }
  if (window.location.href.includes('/boards')) {
    waitForBoardsElement().then(boardsElement => {
      const uiManager = createUIManager(boardsElement);
      if (!window.historyManager) {
        try {
          window.historyManager = new HistoryManager();
        } catch (e) {
          console.error('Error initializing HistoryManager:', e);
        }
      }
      isInitialized = true;
      initializeLabelDisplayManager();
      initializeLinkedItemsManager();
      waitForBoards();
    }).catch(error => {
      console.error('Error initializing UI:', error);
      const uiManager = createUIManager(document.body);
      if (!window.historyManager) {
        try {
          window.historyManager = new HistoryManager();
        } catch (e) {
          console.error('Error initializing HistoryManager:', e);
        }
      }
      isInitialized = true;
      initializeLabelDisplayManager();
      initializeLinkedItemsManager();
      waitForBoards();
    });
  }
}
function waitForBoardsElement(maxAttempts = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkForElement = () => {
      attempts++;
      const boardsElement = document.querySelector('[data-testid="boards-list"]');
      if (boardsElement) {
        resolve(boardsElement);
        return;
      }
      const fallbackSelectors = ['.boards-list', '.board-list-component', '.boards-app'];
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
      }
      if (attempts >= maxAttempts) {
        console.warn('Maximum attempts reached, attaching to body as fallback');
        resolve(document.body);
        return;
      }
      setTimeout(checkForElement, interval);
    };
    checkForElement();
  });
}

function updateSummary() {
  if (!window.uiManager) {
    console.warn('UI Manager not initialized, cannot update summary');
    return;
  }
  try {
    const result = processBoards();
    const {
      assigneeTimeMap,
      boardData,
      boardAssigneeData,
      totalEstimate,
      cardsProcessed,
      cardsWithTime,
      currentMilestone,
      closedBoardCards,
      needsMergeCards
    } = result;
    window.uiManager.updateBoardStats({
      totalCards: cardsProcessed,
      withTimeCards: cardsWithTime,
      closedCards: closedBoardCards,
      needsMergeCards: needsMergeCards
    });
    const totalHours = totalEstimate / 3600;

    // Calculate done hours
    let doneHours = 0;
    for (const boardName in boardData) {
      const lowerBoardName = boardName.toLowerCase();
      if (lowerBoardName.includes('done') || lowerBoardName.includes('closed') ||
          lowerBoardName.includes('complete') || lowerBoardName.includes('finished') ||
          lowerBoardName.includes('needs-merge')) {
        doneHours += boardData[boardName].timeEstimate || 0;
      }
    }
    const doneHoursFormatted = doneHours / 3600;

    // Update header with both total hours and done hours
    window.uiManager.updateHeader(`Summary ${totalHours.toFixed(1)}h - <span style="color:#28a745">${doneHoursFormatted.toFixed(1)}h</span>`);

    const validBoardData = boardData || {};
    const validBoardAssigneeData = boardAssigneeData || {};
    if (window.uiManager.summaryView) {
      window.uiManager.summaryView.render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, validBoardData, validBoardAssigneeData);
    }
    if (window.uiManager.boardsView) {
      window.uiManager.boardsView.render(validBoardData, validBoardAssigneeData);
    }
    const sprintManagementContent = document.getElementById('sprint-management-content');
    if (sprintManagementContent && sprintManagementContent.style.display === 'block' && window.uiManager.sprintManagementView) {
      window.uiManager.sprintManagementView.render();
    }
    const bulkCommentsContent = document.getElementById('bulk-comments-content');
    if (bulkCommentsContent && bulkCommentsContent.style.display === 'block' && window.uiManager.bulkCommentsView) {
      window.uiManager.bulkCommentsView.render();
    }
  } catch (e) {
    console.error('Error updating summary:', e);
  }
}

function addBoardChangeListeners() {
  try {
    const boardLists = document.querySelectorAll('.board-list');
    boardLists.forEach(boardList => {
      const boardObserver = new MutationObserver(() => {
        setTimeout(() => {
          if ($(".is-dragging").length === 0) updateSummary();
        });
      });
      boardObserver.observe(boardList, {
        childList: true,
        subtree: true
      });
    });

    // Watch for new cards added under tree-root-wrapper
    const treeRootObserver = new MutationObserver((mutations) => {
      let newCardAdded = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          mutation.addedNodes.forEach(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // Check if the added node is a board card or contains board cards
              if (node.matches && (
                  node.matches('[data-testid="board-card"]') ||
                  node.querySelector && node.querySelector('[data-testid="board-card"]')
              )) {
                newCardAdded = true;
              }
            }
          });
        }
      });

      if (newCardAdded && $(".is-dragging").length === 0) {
        // Debounce the update
        clearTimeout(window.boardCardUpdateTimeout);
        window.boardCardUpdateTimeout = setTimeout(() => {
          updateSummary();
        }, 500);
      }
    });

    // Find and observe tree-root-wrapper
    const treeRootWrapper = document.querySelector('[data-testid="tree-root-wrapper"]');
    if (treeRootWrapper) {
      treeRootObserver.observe(treeRootWrapper, {
        childList: true,
        subtree: true
      });
    }

  } catch (e) {
    console.error('Error adding board change listeners:', e);
  }
}
function setupSettingsManager(uiManager) {
  if (!window.settingsManager && typeof SettingsManager === 'function') {
    try {
      window.settingsManager = new SettingsManager({
        labelManager: uiManager?.labelManager,
        assigneeManager: uiManager?.assigneeManager,
        gitlabApi: window.gitlabApi,
        onSettingsChanged: type => {
          if (uiManager?.bulkCommentsView) {
            if (type === 'all' || type === 'labels') {
              uiManager.bulkCommentsView.addLabelShortcut();
            }
            if (type === 'all' || type === 'assignees') {
              uiManager.bulkCommentsView.addAssignShortcut();
            }
          }
        }
      });
    } catch (e) {
      console.error('Error creating SettingsManager:', e);
    }
  }
}
function waitForBoards() {
  if (window.boardsInitialized) {
    return;
  }
  let statusDiv = document.getElementById('board-stats-summary');
  if (!statusDiv) {
    statusDiv = document.createElement('div');
    statusDiv.id = 'board-stats-summary';
    statusDiv.style.fontSize = '13px';
    statusDiv.style.color = '#555';
    statusDiv.style.marginBottom = '10px';
    if (window.uiManager?.container) {
      window.uiManager.container.appendChild(statusDiv);
    } else {
      const tempContainer = document.createElement('div');
      tempContainer.id = 'temp-stats-container';
      tempContainer.appendChild(statusDiv);
      document.body.appendChild(tempContainer);
    }
  }
  statusDiv.textContent = 'Waiting for boards to load...';
  let attempts = 0;
  const maxAttempts = 30;
  const boardCheckInterval = setInterval(() => {
    attempts++;
    if (window.linkedItemsManager && !window.linkedItemsManager.initialized) {
      initializeLinkedItemsManager();
    } else if (window.linkedItemsManager && window.linkedItemsManager.initialized) {
      window.linkedItemsManager.refreshDropdowns();
    }
    const boardLists = document.querySelectorAll('.board-list');
    if (boardLists.length >= 3) {
      clearInterval(boardCheckInterval);
      if (statusDiv) {
        statusDiv.textContent = `Found ${boardLists.length} boards, initializing...`;
      }
      setTimeout(() => {
        updateSummary();
        addBoardChangeListeners();
        window.boardsInitialized = true;
      }, 1000);
    } else if (attempts >= maxAttempts) {
      clearInterval(boardCheckInterval);
      if (statusDiv) {
        statusDiv.textContent = `Found ${boardLists.length} boards, continuing anyway...`;
      }
      setTimeout(() => {
        updateSummary();
        addBoardChangeListeners();
        window.boardsInitialized = true;
      }, 1000);
    } else if (boardLists.length > 0 && statusDiv) {
      statusDiv.textContent = `Found ${boardLists.length} boards, waiting for more...`;
    }
  }, 500);
}
checkAndInit();
let lastUrl = window.location.href;
try {
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(checkAndInit, 1000);
    }
  });
  urlObserver.observe(document, {
    subtree: true,
    childList: true
  });
} catch (e) {
  console.error('Error setting up URL observer:', e);
}
window.updateSummary = updateSummary;
window.checkAndInit = checkAndInit;
window.waitForBoards = waitForBoards;
window.SettingsManager = SettingsManager;
window.LabelManager = LabelManager;
window.AssigneeManager = AssigneeManager;
window.addEventListener('scroll', () => {
  if (window.uiManager?.issueSelector) {
    if (typeof window.uiManager.issueSelector.repositionOverlays === 'function') {
      window.uiManager.issueSelector.repositionOverlays();
    }
  }
});
window.addEventListener('resize', () => {
  if (window.uiManager?.issueSelector) {
    if (typeof window.uiManager.issueSelector.repositionOverlays === 'function') {
      window.uiManager.issueSelector.repositionOverlays();
    }
  }
});
export { gitlabApi, updateSummary, checkAndInit, waitForBoards, processBoards, HistoryManager };
window.hasOnlyAllowedParams = hasOnlyAllowedParams;
import UIManager from './UIManager';
import { processBoards } from '../core/DataProcessor';
import SummaryView from './views/SummaryView';
import BoardsView from './views/BoardsView';
import BulkCommentsView from './views/BulkCommentsView';
import SprintManagementView from './views/SprintManagementView';
const uiManager = new UIManager();
export function createSummaryContainer() {
  uiManager.initialize();
  return uiManager.container;
}
function createUIManager() {
  const uiManager = new UIManager();
  if (uiManager.settingsBtn) {
    uiManager.settingsBtn.onclick = e => {
      e.stopPropagation();
      if (uiManager.bulkCommentsView && uiManager.bulkCommentsView.settingsManager) {
        uiManager.bulkCommentsView.settingsManager.openSettingsModal();
      } else if (window.settingsManager) {
        window.settingsManager.openSettingsModal();
      } else {
        const settingsManager = new SettingsManager({
          labelManager: uiManager.labelManager,
          assigneeManager: uiManager.assigneeManager,
          gitlabApi: window.gitlabApi || uiManager.gitlabApi,
          onSettingsChanged: type => {
            if (type === 'all' || type === 'labels') {
              if (uiManager.bulkCommentsView) {
                uiManager.bulkCommentsView.addLabelShortcut();
              }
            }
            if (type === 'all' || type === 'assignees') {
              if (uiManager.bulkCommentsView) {
                uiManager.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
        if (uiManager.bulkCommentsView) {
          uiManager.bulkCommentsView.settingsManager = settingsManager;
        }
        window.settingsManager = settingsManager;
        settingsManager.openSettingsModal();
      }
    };
  }
  return uiManager;
}
export async function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
  if (typeof processBoards === 'function') {
    const {
      closedBoardCards
    } = processBoards();
    uiManager.updateBoardStats({
      totalCards: cardsProcessed,
      withTimeCards: cardsWithTime,
      closedCards: closedBoardCards || 0
    });
  }
  await uiManager.summaryView.render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData);
}
export function updateBoardsTab(boardData, boardAssigneeData) {
  uiManager.boardsView.render(boardData, boardAssigneeData);
}
export function updateBulkCommentsTab() {
  uiManager.bulkCommentsView.render();
}
export function renderHistory() {
  uiManager.historyView.render();
}
window.addEventListener('scroll', () => {
  if (uiManager && uiManager.issueSelector) {
    if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
      uiManager.issueSelector.repositionOverlays();
    }
  }
});
window.addEventListener('resize', () => {
  if (uiManager && uiManager.issueSelector) {
    if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
      uiManager.issueSelector.repositionOverlays();
    }
  }
});
window.uiManager = uiManager;
window.updateSummaryTab = updateSummaryTab;
window.updateBoardsTab = updateBoardsTab;
window.updateBulkCommentsTab = updateBulkCommentsTab;
window.renderHistory = renderHistory;
window.createSummaryContainer = createSummaryContainer;
window.SettingsManager = SettingsManager;
setTimeout(() => {
  const settingsBtn = document.querySelector('#assignee-time-summary button[title="Settings"]');
  if (settingsBtn) {
    settingsBtn.onclick = e => {
      e.stopPropagation();
      try {
        const settingsManager = new SettingsManager({
          labelManager: window.uiManager?.labelManager,
          assigneeManager: window.uiManager?.assigneeManager,
          gitlabApi: window.gitlabApi,
          onSettingsChanged: type => {
            if (window.uiManager?.bulkCommentsView) {
              if (type === 'all' || type === 'labels') {
                window.uiManager.bulkCommentsView.addLabelShortcut();
              }
              if (type === 'all' || type === 'assignees') {
                window.uiManager.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
        settingsManager.openSettingsModal();
      } catch (error) {
        console.error('Error creating settings manager:', error);
      }
    };
  } else {
    console.warn('Settings button not found');
  }
}, 2000);
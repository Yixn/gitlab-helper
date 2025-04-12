// UI integration file for GitLab Assignee Time Summary
// This file loads all the UI components and provides the interface for the main script
import UIManager from './UIManager';
import { processBoards } from '../core/DataProcessor';
import { saveHistoryEntry } from '../core/History';
import { getHistoryKey } from '../api/APIUtils';

// Create instance of the UI Manager
const uiManager = new UIManager();

/**
 * Create summary container wrapper function (used in main.js)
 * @returns {HTMLElement} The summary container element
 */
export function createSummaryContainer() {
    uiManager.initialize();
    return uiManager.container;
}

/**
 * Update the Summary Tab wrapper function
 * @param {Object} assigneeTimeMap - Map of assignees to time estimates
 * @param {number} totalEstimate - Total estimate in seconds
 * @param {number} cardsProcessed - Total cards processed
 * @param {number} cardsWithTime - Cards with time estimates
 * @param {string} currentMilestone - Current milestone name
 */
export function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone) {
    // Update board stats in UI Manager (if available from dataProcessor)
    if (typeof processBoards === 'function') {
        const { closedBoardCards } = processBoards();

        // Update the board stats display
        uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: closedBoardCards || 0
        });
    }

    // Render the summary view
    uiManager.summaryView.render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone);
}

/**
 * Update the Boards Tab wrapper function
 * @param {Object} boardData - Data for each board
 * @param {Object} boardAssigneeData - Assignee data for each board
 */
export function updateBoardsTab(boardData, boardAssigneeData) {
    uiManager.boardsView.render(boardData, boardAssigneeData);
}

/**
 * Update Bulk Comments Tab wrapper function (previously API tab)
 */
export function updateBulkCommentsTab() {
    uiManager.bulkCommentsView.render();
}

/**
 * Override renderHistory function to use our class (called from history.js)
 */
export function renderHistory() {
    uiManager.historyView.render();
}

// Add event listeners for board changes to reposition overlays if window is scrolled
window.addEventListener('scroll', () => {
    if (uiManager && uiManager.issueSelector) {
        if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
            uiManager.issueSelector.repositionOverlays();
        }
    }
});

// Add event listeners for window resize to reposition overlays
window.addEventListener('resize', () => {
    if (uiManager && uiManager.issueSelector) {
        if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
            uiManager.issueSelector.repositionOverlays();
        }
    }
});

// Expose the UI Manager and functions globally for backwards compatibility
window.uiManager = uiManager;
window.updateSummaryTab = updateSummaryTab;
window.updateBoardsTab = updateBoardsTab;
window.updateBulkCommentsTab = updateBulkCommentsTab;
window.renderHistory = renderHistory;
window.createSummaryContainer = createSummaryContainer;
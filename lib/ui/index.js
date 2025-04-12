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
 * Create the UI Manager and connect settings
 */
function createUIManager() {
    const uiManager = new UIManager();

    // Ensure the settings button works
    if (uiManager.settingsBtn) {
        uiManager.settingsBtn.onclick = (e) => {
            e.stopPropagation();

            // Check if we have a SettingsManager
            if (uiManager.bulkCommentsView && uiManager.bulkCommentsView.settingsManager) {
                uiManager.bulkCommentsView.settingsManager.openSettingsModal();
            } else if (window.settingsManager) {
                window.settingsManager.openSettingsModal();
            } else {
                // Create a new SettingsManager if not available
                const settingsManager = new SettingsManager({
                    labelManager: uiManager.labelManager,
                    assigneeManager: uiManager.assigneeManager,
                    gitlabApi: window.gitlabApi || uiManager.gitlabApi,
                    onSettingsChanged: (type) => {
                        console.log(`Settings changed: ${type}`);
                        // Refresh relevant UI components
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

                // Store it for future access
                if (uiManager.bulkCommentsView) {
                    uiManager.bulkCommentsView.settingsManager = settingsManager;
                }
                window.settingsManager = settingsManager;

                // Open the settings modal
                settingsManager.openSettingsModal();
            }
        };
    }

    return uiManager;
}
/**
 * Update the Summary Tab wrapper function
 * @param {Object} assigneeTimeMap - Map of assignees to time estimates
 * @param {number} totalEstimate - Total estimate in seconds
 * @param {number} cardsProcessed - Total cards processed
 * @param {number} cardsWithTime - Cards with time estimates
 * @param {string} currentMilestone - Current milestone name
 */
/**
 * Update the Summary Tab wrapper function
 * @param {Object} assigneeTimeMap - Map of assignees to time estimates
 * @param {number} totalEstimate - Total estimate in seconds
 * @param {number} cardsProcessed - Total cards processed
 * @param {number} cardsWithTime - Cards with time estimates
 * @param {string} currentMilestone - Current milestone name
 * @param {Object} boardData - Data for each board
 * @param {Object} boardAssigneeData - Assignee data for each board
 */
export function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
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

    // Render the summary view with board data for distribution
    uiManager.summaryView.render(
        assigneeTimeMap,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone,
        boardData,
        boardAssigneeData
    );
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

// Fix for settings button
// Insert this at the end of your user script, after all initializations

// Add global access to SettingsManager
window.SettingsManager = SettingsManager;

// Add direct click handler to settings button
setTimeout(() => {
    // Find the settings button
    const settingsBtn = document.querySelector('#assignee-time-summary button[title="Settings"]');

    if (settingsBtn) {
        console.log('Found settings button, attaching direct handler');

        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            console.log('Settings button clicked');

            // Create and open new settings manager
            try {
                const settingsManager = new SettingsManager({
                    labelManager: window.uiManager?.labelManager,
                    assigneeManager: window.uiManager?.assigneeManager,
                    gitlabApi: window.gitlabApi,
                    onSettingsChanged: (type) => {
                        console.log(`Settings changed: ${type}`);
                        // Refresh UI components when settings change
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

        console.log('Settings button handler attached');
    } else {
        console.warn('Settings button not found');
    }
}, 2000); // Wait 2 seconds to ensure all elements are loaded
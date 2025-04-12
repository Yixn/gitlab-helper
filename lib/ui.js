// UI integration file for GitLab Assignee Time Summary
// This file loads all the UI components and provides the interface for the main script

// Create UIManager instance if it doesn't exist
if (typeof uiManager === 'undefined') {
    var uiManager = new UIManager();
}

// Create summary container wrapper function (used in main.js)
function createSummaryContainer() {
    uiManager.initialize();
    return uiManager.container;
}

// Update the Summary Tab wrapper function
function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone) {
    uiManager.summaryView.render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone);
}

// Update the Boards Tab wrapper function
function updateBoardsTab(boardData, boardAssigneeData) {
    uiManager.boardsView.render(boardData, boardAssigneeData);
}

// Update API Info Tab wrapper function
function updateApiInfoTab() {
    uiManager.apiView.render();
}

// Override renderHistory function to use our class (called from history.js)
function renderHistory() {
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

// Expose the UI Manager globally for debugging
window.uiManager = uiManager;
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

// Expose the UI Manager globally for debugging
window.uiManager = uiManager;
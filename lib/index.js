// Main index file for GitLab Sprint Helper
// This file serves as the main entry point for the module

// Import API
import GitLabAPI from './api/GitLabAPI';
import * as APIUtils from './api/APIUtils';

// Import core modules
import * as Utils from './core/Utils';
import { processBoards } from './core/DataProcessor';
import { saveHistoryEntry, renderHistory } from './core/History';

// Import storage modules
import * as LocalStorage from './storage/LocalStorage';
import * as SettingsStorage from './storage/SettingsStorage';

// Import UI modules
import UIManager from './ui/UIManager';
import {
    createSummaryContainer,
    updateSummaryTab,
    updateBoardsTab,
    updateBulkCommentsTab
} from './ui/index';

// Create API instance
const gitlabApi = new GitLabAPI();

/**
 * Check if we're on a board page and initialize
 */
function checkAndInit() {
    if (window.location.href.includes('/boards')) {
        // Create the summary container
        if (!document.getElementById('assignee-time-summary')) {
            createSummaryContainer();
        }

        // Start waiting for boards
        waitForBoards();
    }
}

/**
 * Update summary information
 * @param {boolean} forceHistoryUpdate - Whether to force a history update
 */
function updateSummary(forceHistoryUpdate = false) {
    // Reset loading state
    let boardFullyLoaded = false;
    let loadingTimeout;

    clearTimeout(loadingTimeout);

    // Process the board data
    const {
        assigneeTimeMap,
        boardData,
        boardAssigneeData,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone
    } = processBoards();

    // Wait to make sure the board is fully loaded before saving to history
    clearTimeout(loadingTimeout);
    loadingTimeout = setTimeout(() => {
        boardFullyLoaded = true;
        // Only save history when fully loaded
        if (boardFullyLoaded) {
            saveHistoryEntry(totalEstimate, currentMilestone, forceHistoryUpdate);
        }
    }, 3000); // 3 second delay

    // Update the UI - SUMMARY TAB
    updateSummaryTab(
        assigneeTimeMap,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone
    );

    // Update the UI - BOARDS TAB
    updateBoardsTab(boardData, boardAssigneeData);

    // Update Bulk Comments Tab if it exists and is visible
    const bulkCommentsContent = document.getElementById('bulk-comments-content');
    if (bulkCommentsContent && bulkCommentsContent.style.display === 'block') {
        updateBulkCommentsTab();
    }
}

/**
 * Add change event listeners to each board
 */
function addBoardChangeListeners() {
    const boardLists = document.querySelectorAll('.board-list');
    boardLists.forEach(boardList => {
        // Create a MutationObserver for each board list
        const boardObserver = new MutationObserver(() => {
            // Recalculate on board changes
            updateSummary();
        });

        // Observe changes to the board's contents
        boardObserver.observe(boardList, {
            childList: true,
            subtree: true
        });
    });
}

/**
 * Wait for boards to load before initializing
 */
function waitForBoards() {
    const statusDiv = document.getElementById('assignee-time-summary-status');
    if (statusDiv) {
        statusDiv.textContent = 'Waiting for boards to load...';
    }

    let attempts = 0;
    const maxAttempts = 30; // Max wait time: 30*500ms = 15 seconds

    const boardCheckInterval = setInterval(() => {
        attempts++;
        const boardLists = document.querySelectorAll('.board-list');

        if (boardLists.length >= 5) {
            // Found at least 5 boards, proceed with initialization
            clearInterval(boardCheckInterval);
            if (statusDiv) {
                statusDiv.textContent = `Found ${boardLists.length} boards, initializing...`;
            }
            setTimeout(() => {
                updateSummary();
                addBoardChangeListeners();
            }, 1000);
        } else if (attempts >= maxAttempts) {
            // Timeout reached, proceed with whatever boards we have
            clearInterval(boardCheckInterval);
            if (statusDiv) {
                statusDiv.textContent = `Found ${boardLists.length} boards, initializing...`;
            }
            setTimeout(() => {
                updateSummary();
                addBoardChangeListeners();
            }, 1000);
        } else if (boardLists.length > 0 && statusDiv) {
            // Update status with current count
            statusDiv.textContent = `Found ${boardLists.length} of 5 boards...`;
        }
    }, 500);
}

// Initial check
checkAndInit();

// Watch for URL changes (for SPA navigation)
let lastUrl = window.location.href;
new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        setTimeout(checkAndInit, 1000); // Delay to ensure page has loaded
    }
}).observe(document, {subtree: true, childList: true});

// Expose functions globally for compatibility with existing codebase
window.gitlabApi = gitlabApi;
window.updateSummary = updateSummary;
window.checkAndInit = checkAndInit;
window.waitForBoards = waitForBoards;

// Export for module usage
export {
    gitlabApi,
    updateSummary,
    checkAndInit,
    waitForBoards,
    processBoards,
    renderHistory
};
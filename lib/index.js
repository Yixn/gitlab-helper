// Main index file for GitLab Sprint Helper
// This file serves as the main entry point for the module

// Import API
import GitLabAPI from './api/GitLabAPI';
import * as APIUtils from './api/APIUtils';

// Import core modules
import * as Utils from './core/Utils';
import { processBoards } from './core/DataProcessor';
import { saveHistoryEntry } from './core/History';
import SettingsManager from './ui/managers/SettingsManager';

// Import storage modules
import * as LocalStorage from './storage/LocalStorage';
import * as SettingsStorage from './storage/SettingsStorage';

// Import UI modules
import UIManager from './ui/UIManager';
import LabelManager from './ui/managers/LabelManager';
import AssigneeManager from './ui/managers/AssigneeManager';

/**
 * Create the UI Manager with proper initialization
 * @returns {UIManager} The UI Manager instance
 */
function createUIManager() {
    // Create a GitLabAPI instance if it doesn't exist
    if (!window.gitlabApi) {
        try {
            window.gitlabApi = new GitLabAPI();
        } catch (e) {
            console.error('Error creating GitLabAPI instance:', e);
        }
    }

    // Create a new UI Manager
    try {
        const uiManager = new UIManager();

        // Initialize UI
        uiManager.initialize();

        // Make UI Manager available globally
        window.uiManager = uiManager;

        return uiManager;
    } catch (e) {
        console.error('Error creating UI Manager:', e);
        return null;
    }
}

// Add a global initialization flag to prevent duplicate initialization
let isInitialized = false;

/**
 * Check if we're on a board page and initialize
 */
function checkAndInit() {
    // Prevent duplicate initialization
    if (isInitialized) {
        console.log('GitLab Sprint Helper already initialized');
        return;
    }

    if (window.location.href.includes('/boards')) {
        // Create the summary container
        if (!document.getElementById('assignee-time-summary')) {
            // Create UI Manager
            const uiManager = createUIManager();

            // Ensure SettingsManager is available globally
            if (!window.settingsManager && typeof SettingsManager === 'function') {
                try {
                    window.settingsManager = new SettingsManager({
                        labelManager: uiManager?.labelManager,
                        assigneeManager: uiManager?.assigneeManager,
                        gitlabApi: window.gitlabApi,
                        onSettingsChanged: (type) => {
                            console.log(`Settings changed: ${type}`);
                            // Refresh UI components when settings change
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

        // Start waiting for boards
        waitForBoards();
        // Mark as initialized to prevent duplicate calls
        isInitialized = true;
    }
}


/**
 * Update summary information
 * @param {boolean} forceHistoryUpdate - Whether to force a history update
 */
function updateSummary(forceHistoryUpdate = false) {
    if (!window.uiManager) {
        console.warn('UI Manager not initialized, cannot update summary');
        return;
    }

    // Reset loading state
    let boardFullyLoaded = false;
    let loadingTimeout;

    clearTimeout(loadingTimeout);

    try {
        // Process the board data
        const result = processBoards();

        // Debug logging
        console.log('Board data processing result:', result);

        const {
            assigneeTimeMap,
            boardData,
            boardAssigneeData,
            totalEstimate,
            cardsProcessed,
            cardsWithTime,
            currentMilestone,
            closedBoardCards
        } = result;

        // Wait to make sure the board is fully loaded before saving to history
        clearTimeout(loadingTimeout);
        loadingTimeout = setTimeout(() => {
            boardFullyLoaded = true;
            // Only save history when fully loaded
            if (boardFullyLoaded) {
                try {
                    saveHistoryEntry(totalEstimate, currentMilestone, forceHistoryUpdate);
                } catch (e) {
                    console.error('Error saving history:', e);
                }
            }
        }, 3000); // 3 second delay

        // Update the UI stats
        window.uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: closedBoardCards || 0
        });

        // Update the UI header text
        const totalHours = (totalEstimate / 3600).toFixed(1);
        window.uiManager.updateHeader(`Summary ${totalHours}h`);

        // Ensure we have valid board data and assignee data objects
        const validBoardData = boardData || {};
        const validBoardAssigneeData = boardAssigneeData || {};

        // Update the summary view with board data for distribution
        if (window.uiManager.summaryView) {
            window.uiManager.summaryView.render(
                assigneeTimeMap,
                totalEstimate,
                cardsProcessed,
                cardsWithTime,
                currentMilestone,
                validBoardData,       // Ensure we pass valid object
                validBoardAssigneeData // Ensure we pass valid object
            );
        }

        // Update the boards view
        if (window.uiManager.boardsView) {
            window.uiManager.boardsView.render(validBoardData, validBoardAssigneeData);
        }

        // Update Bulk Comments Tab if it exists and is visible
        const bulkCommentsContent = document.getElementById('bulk-comments-content');
        if (bulkCommentsContent &&
            bulkCommentsContent.style.display === 'block' &&
            window.uiManager.bulkCommentsView) {
            window.uiManager.bulkCommentsView.render();
        }
    } catch (e) {
        console.error('Error updating summary:', e);
    }
}
/**
 * Add change event listeners to each board
 */
function addBoardChangeListeners() {
    try {
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
    } catch (e) {
        console.error('Error adding board change listeners:', e);
    }
}

/**
 * Wait for boards to load before initializing
 */
/**
 * Wait for boards to load before initializing
 */
function waitForBoards() {
    // Check if we've already completed initialization
    if (window.boardsInitialized) {
        console.log('Boards already initialized, skipping');
        return;
    }

    const statusDiv = document.createElement('div');
    statusDiv.id = 'assignee-time-summary-status';
    statusDiv.style.color = '#666';
    statusDiv.style.fontStyle = 'italic';
    statusDiv.style.marginBottom = '10px';
    statusDiv.textContent = 'Waiting for boards to load...';

    if (window.uiManager?.contentWrapper) {
        // Remove any existing status div first to prevent duplicates
        const existingStatus = document.getElementById('assignee-time-summary-status');
        if (existingStatus) {
            existingStatus.remove();
        }
        window.uiManager.contentWrapper.prepend(statusDiv);
    }

    let attempts = 0;
    const maxAttempts = 30; // Max wait time: 30*500ms = 15 seconds

    const boardCheckInterval = setInterval(() => {
        attempts++;
        const boardLists = document.querySelectorAll('.board-list');

        if (boardLists.length >= 3) {
            // Found at least 3 boards, proceed with initialization
            clearInterval(boardCheckInterval);
            if (statusDiv) {
                statusDiv.textContent = `Found ${boardLists.length} boards, initializing...`;
            }
            setTimeout(() => {
                updateSummary();
                addBoardChangeListeners();
                // Mark boards as initialized to prevent duplicate setup
                window.boardsInitialized = true;

                // Remove status message after successful initialization
                if (statusDiv) {
                    statusDiv.remove();
                }
            }, 1000);
        } else if (attempts >= maxAttempts) {
            // Timeout reached, proceed with whatever boards we have
            clearInterval(boardCheckInterval);
            if (statusDiv) {
                statusDiv.textContent = `Found ${boardLists.length} boards, continuing anyway...`;
            }
            setTimeout(() => {
                updateSummary();
                addBoardChangeListeners();
                // Mark boards as initialized to prevent duplicate setup
                window.boardsInitialized = true;

                // Remove status message after initialization
                if (statusDiv) {
                    statusDiv.remove();
                }
            }, 1000);
        } else if (boardLists.length > 0 && statusDiv) {
            // Update status with current count
            statusDiv.textContent = `Found ${boardLists.length} boards, waiting for more...`;
        }
    }, 500);
}

/**
 * Initialize renderHistory function for the history tab
 */
function renderHistory() {
    try {
        if (window.uiManager?.historyView) {
            window.uiManager.historyView.render();
        }
    } catch (e) {
        console.error('Error rendering history:', e);
    }
}

// Initial check
checkAndInit();

// Watch for URL changes (for SPA navigation)
let lastUrl = window.location.href;
try {
    const urlObserver = new MutationObserver(() => {
        if (window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            setTimeout(checkAndInit, 1000); // Delay to ensure page has loaded
        }
    });

    urlObserver.observe(document, {subtree: true, childList: true});
} catch (e) {
    console.error('Error setting up URL observer:', e);
}

// Expose functions globally for compatibility with existing codebase
window.gitlabApi = window.gitlabApi || new GitLabAPI();
window.updateSummary = updateSummary;
window.checkAndInit = checkAndInit;
window.waitForBoards = waitForBoards;
window.renderHistory = renderHistory;
window.SettingsManager = SettingsManager;
window.LabelManager = LabelManager;
window.AssigneeManager = AssigneeManager;

// Add event listeners for board changes to reposition overlays if window is scrolled
window.addEventListener('scroll', () => {
    if (window.uiManager?.issueSelector) {
        if (typeof window.uiManager.issueSelector.repositionOverlays === 'function') {
            window.uiManager.issueSelector.repositionOverlays();
        }
    }
});

// Add event listeners for window resize to reposition overlays
window.addEventListener('resize', () => {
    if (window.uiManager?.issueSelector) {
        if (typeof window.uiManager.issueSelector.repositionOverlays === 'function') {
            window.uiManager.issueSelector.repositionOverlays();
        }
    }
});

// Export for module usage
export {
    gitlabApi,
    updateSummary,
    checkAndInit,
    waitForBoards,
    processBoards,
    renderHistory
};
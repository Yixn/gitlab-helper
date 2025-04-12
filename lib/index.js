
import GitLabAPI from './api/GitLabAPI';
import * as APIUtils from './api/APIUtils';

import * as Utils from './core/Utils';
import { processBoards } from './core/DataProcessor';
import { saveHistoryEntry } from './core/History';
import SettingsManager from './ui/managers/SettingsManager';

import * as LocalStorage from './storage/LocalStorage';
import * as SettingsStorage from './storage/SettingsStorage';

import UIManager from './ui/UIManager';
import LabelManager from './ui/managers/LabelManager';
import AssigneeManager from './ui/managers/AssigneeManager';

/**
 * Create the UI Manager with proper initialization
 * @param {HTMLElement} attachmentElement - Element to attach the UI to
 * @returns {UIManager} The UI Manager instance
 */
function createUIManager(attachmentElement = document.body) {
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

        // Initialize UI with the attachment element
        uiManager.initialize(attachmentElement);

        // Make UI Manager available globally
        window.uiManager = uiManager;

        // Setup settings manager
        if (!window.settingsManager && typeof SettingsManager === 'function') {
            try {
                window.settingsManager = new SettingsManager({
                    labelManager: uiManager?.labelManager,
                    assigneeManager: uiManager?.assigneeManager,
                    gitlabApi: window.gitlabApi,
                    onSettingsChanged: (type) => {
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

        return uiManager;
    } catch (e) {
        console.error('Error creating UI Manager:', e);
        return null;
    }
}


let isInitialized = false;

/**
 * Check if we're on a board page and initialize
 */
function checkAndInit() {
    // Prevent duplicate initialization
    if (isInitialized) {
                return;
    }

    if (window.location.href.includes('/boards')) {
        
        // Wait for boards element before initializing
        waitForBoardsElement()
            .then(boardsElement => {
                
                // Create UI Manager, passing the attachment element
                const uiManager = createUIManager(boardsElement);

                // Mark as initialized to prevent duplicate calls
                isInitialized = true;

                // Start waiting for boards
                waitForBoards();
            })
            .catch(error => {
                console.error('Error initializing UI:', error);
                // Fallback initialization with body attachment
                const uiManager = createUIManager(document.body);
                isInitialized = true;
                waitForBoards();
            });
    }
}

/**
 * Wait for the boards element to be available in the DOM
 * @param {number} maxAttempts - Maximum number of attempts to find the element
 * @param {number} interval - Interval between attempts in ms
 * @returns {Promise<HTMLElement>} Promise resolving to the boards element
 */
function waitForBoardsElement(maxAttempts = 30, interval = 500) {
    return new Promise((resolve, reject) => {
        let attempts = 0;

        const checkForElement = () => {
            attempts++;
            
            // Try to find the element
            const boardsElement = document.querySelector('[data-testid="boards-list"]');

            if (boardsElement) {
                                resolve(boardsElement);
                return;
            }

            // Fallback to other possible selectors if the first one doesn't exist
            const fallbackSelectors = [
                '.boards-list',
                '.board-list-component',
                '.boards-app'
            ];

            for (const selector of fallbackSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                                        resolve(element);
                    return;
                }
            }

            // If we've hit the maximum attempts, attach to body anyway
            if (attempts >= maxAttempts) {
                console.warn('Maximum attempts reached, attaching to body as fallback');
                resolve(document.body);
                return;
            }

            // Try again after interval
            setTimeout(checkForElement, interval);
        };

        // Start checking
        checkForElement();
    });
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
 * Set up the settings manager
 * @param {UIManager} uiManager - The UI manager instance
 */
function setupSettingsManager(uiManager) {
    if (!window.settingsManager && typeof SettingsManager === 'function') {
        try {
            window.settingsManager = new SettingsManager({
                labelManager: uiManager?.labelManager,
                assigneeManager: uiManager?.assigneeManager,
                gitlabApi: window.gitlabApi,
                onSettingsChanged: (type) => {
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
/**
 * Wait for boards to load before initializing
 */
function waitForBoards() {
    // Check if we've already completed initialization
    if (window.boardsInitialized) {
                return;
    }

    // Use the existing board stats element if it exists
    let statusDiv = document.getElementById('board-stats-summary');

    // If board stats div doesn't exist yet, create a temporary one
    if (!statusDiv) {
        statusDiv = document.createElement('div');
        statusDiv.id = 'board-stats-summary';
        statusDiv.style.fontSize = '13px';
        statusDiv.style.color = '#555';
        statusDiv.style.marginBottom = '10px';

        if (window.uiManager?.container) {
            window.uiManager.container.appendChild(statusDiv);
        } else {
            // If UI manager container doesn't exist, add to a temporary location
            const tempContainer = document.createElement('div');
            tempContainer.id = 'temp-stats-container';
            tempContainer.appendChild(statusDiv);
            document.body.appendChild(tempContainer);
        }
    }

    // Update the text
    statusDiv.textContent = 'Waiting for boards to load...';

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

                // The status div will be naturally updated by updateSummary
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

                // The status div will be naturally updated by updateSummary
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

checkAndInit();

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

window.gitlabApi = window.gitlabApi || new GitLabAPI();
window.updateSummary = updateSummary;
window.checkAndInit = checkAndInit;
window.waitForBoards = waitForBoards;
window.renderHistory = renderHistory;
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

export {
    gitlabApi,
    updateSummary,
    checkAndInit,
    waitForBoards,
    processBoards,
    renderHistory
};
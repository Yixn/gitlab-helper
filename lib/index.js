import GitLabAPI from './api/GitLabAPI';

import { processBoards } from './core/DataProcessor';
import SettingsManager from './ui/managers/SettingsManager';

import UIManager from './ui/UIManager';
import LabelManager from './ui/managers/LabelManager';
import AssigneeManager from './ui/managers/AssigneeManager';

/**
 * Create the UI Manager with proper initialization
 * @param {HTMLElement} attachmentElement - Element to attach the UI to
 * @returns {UIManager} The UI Manager instance
 */
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
                    onSettingsChanged: (type) => {
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
    if (isInitialized) {
        return;
    }

    if (window.location.href.includes('/boards')) {
        waitForBoardsElement()
            .then(boardsElement => {
                const uiManager = createUIManager(boardsElement);
                isInitialized = true;
                waitForBoards();
            })
            .catch(error => {
                console.error('Error initializing UI:', error);
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
            const boardsElement = document.querySelector('[data-testid="boards-list"]');

            if (boardsElement) {
                resolve(boardsElement);
                return;
            }
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

/**
 * Update summary information
 * @param {boolean} forceHistoryUpdate - Whether to force a history update
 */
function updateSummary(forceHistoryUpdate = false) {
    if (!window.uiManager) {
        console.warn('UI Manager not initialized, cannot update summary');
        return;
    }
    let boardFullyLoaded = false;
    let loadingTimeout;

    clearTimeout(loadingTimeout);

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
            closedBoardCards
        } = result;
        clearTimeout(loadingTimeout);
        loadingTimeout = setTimeout(() => {
            boardFullyLoaded = true;
        }, 3000); // 3 second delay
        window.uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: closedBoardCards || 0
        });
        const totalHours = (totalEstimate / 3600).toFixed(1);
        window.uiManager.updateHeader(`Summary ${totalHours}h`);
        const validBoardData = boardData || {};
        const validBoardAssigneeData = boardAssigneeData || {};
        if (window.uiManager.summaryView) {
            window.uiManager.summaryView.render(
                assigneeTimeMap,
                totalEstimate,
                cardsProcessed,
                cardsWithTime,
                currentMilestone,
                validBoardData,
                validBoardAssigneeData
            );
        }
        if (window.uiManager.boardsView) {
            window.uiManager.boardsView.render(validBoardData, validBoardAssigneeData);
        }

        // Update Sprint Management tab if it's visible
        const sprintManagementContent = document.getElementById('sprint-management-content');
        if (sprintManagementContent &&
            sprintManagementContent.style.display === 'block' &&
            window.uiManager.sprintManagementView) {
            window.uiManager.sprintManagementView.render();
        }

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
            const boardObserver = new MutationObserver(() => {
                updateSummary();
            });
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
    const maxAttempts = 30; // Max wait time: 30*500ms = 15 seconds

    const boardCheckInterval = setInterval(() => {
        attempts++;
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
    processBoards
};
// ==UserScript==
// @name         GitLab Sprint Helper
// @namespace    http://tampermonkey.net/
// @version      1.1
// @description  Display a summary of assignees' time estimates on GitLab boards with API integration
// @author       You
// @match        https://gitlab.com/*/boards/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/utils.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/api.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/dataProcessor.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/history.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/TabManager.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/SummaryTabView.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/BoardsTabView.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/HistoryTabView.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/ApiTabView.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/IssueSelector.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui/UIManager.js
// @require      https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/lib/ui.js
// @updateURL    https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/main.js
// @downloadURL  https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/main.js
// ==/UserScript==

(function() {
    'use strict';
    // Track if board is fully loaded
    let boardFullyLoaded = false;
    let loadingTimeout;

    // Update summary information
    function updateSummary(forceHistoryUpdate = false) {
        // Reset loading state
        boardFullyLoaded = false;
        clearTimeout(loadingTimeout);

        const statusDiv = document.getElementById('assignee-time-summary-status');
        if (statusDiv) {
            statusDiv.textContent = 'Analyzing board...';
        }

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

        // Update API Info Tab if it exists and is visible
        const apiInfoTab = document.getElementById('api-info-content');
        if (apiInfoTab && apiInfoTab.style.display === 'block') {
            updateApiInfoTab();
        }
    }

    // Add change event listeners to each board
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

    // Function to initialize the summary panel
    function initSummary() {
        // Create container if it doesn't exist
        if (!document.getElementById('assignee-time-summary')) {
            createSummaryContainer();
        }

        // Do initial calculation
        updateSummary();

        // Add change listeners to each board
        addBoardChangeListeners();
    }

    // Wait for boards to load before initializing
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

    // Check if we're on a board page and initialize
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

    // Expose functions globally for easier debugging
    window.gitlabHelper = {
        updateSummary,
        gitlabApi,
        uiManager
    };
})();
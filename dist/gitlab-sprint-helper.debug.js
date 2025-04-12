// ==UserScript==
// @name         GitLab Sprint Helper
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Display a summary of assignees' time estimates on GitLab boards with API integration and comment shortcuts
// @author       Daniel Samer | Linkster
// @match        https://gitlab.com/*/boards/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// @downloadURL  https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// ==/UserScript==

// GitLab Sprint Helper - Combined Script
(function(window) {

// File: lib/core/Utils.js
// Utility functions for GitLab Assignee Time Summary

/**
 * Format seconds to hours with 1 decimal place
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted hours string
 */
window.formatHours = function formatHours(seconds) {
    return (seconds / 3600).toFixed(1);
}

/**
 * Format seconds to human-readable duration (e.g. 1h 30m)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted duration string
 */
window.formatDuration = function formatDuration(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    if (hours > 0 && minutes > 0) {
        return `${hours}h ${minutes}m`;
    } else if (hours > 0) {
        return `${hours}h`;
    } else {
        return `${minutes}m`;
    }
}

/**
 * Safely access nested properties of an object
 * @param {Object} obj - Object to access
 * @param {string} path - Dot-separated path to property
 * @returns {*} Property value or null if not found
 */
window.getNestedProperty = function getNestedProperty(obj, path) {
    return path.split('.').reduce((prev, curr) => {
        return prev && prev[curr] ? prev[curr] : null;
    }, obj);
}

/**
 * Truncate text to a specified length with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
window.truncateText = function truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength) + '...';
}

/**
 * Safely parse JSON with error handling
 * @param {string} str - JSON string to parse
 * @param {*} defaultValue - Default value if parsing fails
 * @returns {*} Parsed object or default value
 */
window.safeJSONParse = function safeJSONParse(str, defaultValue = {}) {
    try {
        return JSON.parse(str);
    } catch (e) {
        console.error('Error parsing JSON:', e);
        return defaultValue;
    }
}

/**
 * Wait for an element to exist in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<Element>} Promise resolving to the element
 */
window.waitForElement = function waitForElement(selector, timeout = 10000) {
    return new Promise((resolve, reject) => {
        if (document.querySelector(selector)) {
            return resolve(document.querySelector(selector));
        }

        const observer = new MutationObserver(() => {
            if (document.querySelector(selector)) {
                observer.disconnect();
                resolve(document.querySelector(selector));
            }
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        // Add timeout
        setTimeout(() => {
            observer.disconnect();
            reject(new Error(`Timeout waiting for element: ${selector}`));
        }, timeout);
    });
}

/**
 * Generate a color based on a string input
 * @param {string} str - Input string
 * @returns {string} HSL color string
 */
window.generateColorFromString = function generateColorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }

    // Generate pastel colors for better readability
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 75%)`;
}

/**
 * Determine if text should be black or white based on background color
 * @param {string} bgColor - Background color (hex, rgb, or named color)
 * @returns {string} 'black' or 'white'
 */
window.getContrastColor = function getContrastColor(bgColor) {
    // For HSL colors
    if (bgColor.startsWith('hsl')) {
        // Extract lightness from HSL
        const matches = bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
        if (matches && matches[1]) {
            const lightness = parseInt(matches[1], 10);
            return lightness > 60 ? 'black' : 'white';
        }
    }

    // Convert other color formats to RGB for contrast calculation
    let r = 0, g = 0, b = 0;

    // Try to parse color
    try {
        // Create a temporary element to compute the color
        const elem = document.createElement('div');
        elem.style.backgroundColor = bgColor;
        document.body.appendChild(elem);

        // Get computed style
        const style = window.getComputedStyle(elem);
        const rgb = style.backgroundColor;

        // Remove element
        document.body.removeChild(elem);

        // Parse RGB values
        const rgbMatch = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
        }
    } catch (e) {
        // Fallback for HSL and other formats
        if (bgColor.startsWith('hsl')) {
            return bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/) ?
                (parseInt(bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/)[1], 10) > 60 ? 'black' : 'white') :
                'black';
        }
        return 'black'; // Default to black on error
    }

    // Calculate luminance (perceived brightness)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

    // Use white text on dark backgrounds, black on light
    return luminance > 0.5 ? 'black' : 'white';
}

// File: lib/api/APIUtils.js
// API utility functions for GitLab Sprint Helper

/**
 * Extract project or group path from URL
 * @returns {Object|null} Path info object with type, path, encodedPath, and apiUrl
 */
window.getPathFromUrl = function getPathFromUrl() {
    try {
        console.log('Current URL:', window.location.href);
        console.log('Current pathname:', window.location.pathname);

        const pathname = window.location.pathname;

        // Check if this is a group board
        if (pathname.includes('/groups/') && pathname.includes('/-/boards')) {
            // Extract group path for group boards
            // Format: /groups/[group-path]/-/boards
            const groupPattern = /\/groups\/([^\/]+(?:\/[^\/]+)*)\/?\-?\/?boards/;
            const match = pathname.match(groupPattern);

            if (!match || !match[1]) {
                console.warn('Could not extract group path from URL:', pathname);
                return null;
            }

            const path = match[1];
            console.log('Extracted group path:', path);

            // Make sure we don't have "/-" at the end of the path
            const cleanPath = path.replace(/\/-$/, '');

            // Correctly encode the path
            const encodedPath = encodeURIComponent(cleanPath);
            console.log('Encoded group path for API:', encodedPath);

            // Construct group API URL
            const apiUrl = `groups/${encodedPath}/labels`;
            console.log('Group API URL that will be used:', apiUrl);

            return {
                path: cleanPath,
                encodedPath,
                type: 'group',
                apiUrl
            };
        }
        // Check if this is a project board
        else if (pathname.includes('/-/boards')) {
            // Extract project path for project boards
            // Format: /[project-path]/-/boards
            const projectPattern = /^\/([^\/]+(?:\/[^\/]+)*)\/-\/boards/;
            const match = pathname.match(projectPattern);

            if (!match || !match[1]) {
                console.warn('Could not extract project path from URL pattern:', pathname);
                return null;
            }

            const path = match[1];
            console.log('Extracted project path:', path);

            // Correctly encode the path
            const encodedPath = encodeURIComponent(path);
            console.log('Encoded project path for API:', encodedPath);

            // Construct project API URL
            const apiUrl = `projects/${encodedPath}/labels`;
            console.log('Project API URL that will be used:', apiUrl);

            return {
                path,
                encodedPath,
                type: 'project',
                apiUrl
            };
        } else {
            console.warn('Not on a GitLab boards page:', pathname);
            return null;
        }
    } catch (error) {
        console.error('Error extracting path from URL:', error);
        return null;
    }
}

/**
 * Get current URL key for storing history
 * @returns {string} Sanitized URL string
 */
window.getCurrentUrlKey = function getCurrentUrlKey() {
    const url = window.location.href;
    // Remove any fragment identifiers
    return url.split('#')[0];
}

/**
 * Get URL specific history key
 * @returns {string} Key for storing history data
 */
window.getHistoryKey = function getHistoryKey() {
    return `timeEstimateHistory_${getCurrentUrlKey()}`;
}

// File: lib/api/GitLabAPI.js
// GitLab API Class for Sprint Helper

window.GitLabAPI = class GitLabAPI {
    constructor() {
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        this.baseUrl = '/api/v4';
    }

    /**
     * Make an API call to GitLab
     * @param {string} endpoint - API endpoint (without /api/v4 prefix)
     * @param {Object} options - Request options
     * @param {string} options.method - HTTP method (GET, POST, PATCH, etc.)
     * @param {Object} options.data - Data to send (for POST, PATCH, etc.)
     * @param {Object} options.params - URL query parameters
     * @returns {Promise} - Promise resolving to JSON response
     */
    callGitLabApi(endpoint, options = {}) {
        const {
            method = 'GET',
            data = null,
            params = null
        } = options;

        // Build URL with query parameters if provided
        let url = `${this.baseUrl}/${endpoint}`;
        if (params) {
            const queryParams = new URLSearchParams();
            Object.entries(params).forEach(([key, value]) => {
                if (value !== null && value !== undefined) {
                    queryParams.append(key, value);
                }
            });

            const queryString = queryParams.toString();
            if (queryString) {
                url += `?${queryString}`;
            }
        }

        // Set up fetch options
        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin' // Include cookies
        };

        // Add CSRF token for non-GET requests
        if (method !== 'GET' && this.csrfToken) {
            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
        }

        // Add request body for methods that support it
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            fetchOptions.body = JSON.stringify(data);
        }

        // Execute the fetch request
        return fetch(url, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }
                return response.json();
            });
    }

    /**
     * Get issue details
     * @param {Object} issueItem - Issue item from Vue component
     * @returns {Promise} - Promise resolving to issue data
     */
    getIssue(issueItem) {
        const projectPath = issueItem.referencePath.split('#')[0];
        const issueIid = issueItem.iid;

        const encodedPath = encodeURIComponent(projectPath);
        return this.callGitLabApi(`projects/${encodedPath}/issues/${issueIid}`);
    }

    /**
     * Add a comment to an issue
     * @param {Object} issueItem - Issue item from Vue component
     * @param {string} commentBody - Comment text
     * @returns {Promise} - Promise resolving to created note data
     */
    addComment(issueItem, commentBody) {
        const projectPath = issueItem.referencePath.split('#')[0];
        const issueIid = issueItem.iid;

        const encodedPath = encodeURIComponent(projectPath);
        return this.callGitLabApi(
            `projects/${encodedPath}/issues/${issueIid}/notes`,
            {
                method: 'POST',
                data: { body: commentBody }
            }
        );
    }

    /**
     * Get current user information
     * @returns {Promise} - Promise resolving to user data
     */
    getCurrentUser() {
        return this.callGitLabApi('user');
    }

    /**
     * Get project information
     * @param {string} projectId - Project ID or encoded path
     * @returns {Promise} - Promise resolving to project data
     */
    getProject(projectId) {
        return this.callGitLabApi(`projects/${projectId}`);
    }

    /**
     * Get project issues
     * @param {string} projectId - Project ID or encoded path
     * @param {Object} params - Query parameters (state, labels, etc.)
     * @returns {Promise} - Promise resolving to issues array
     */
    getProjectIssues(projectId, params = {}) {
        return this.callGitLabApi(`projects/${projectId}/issues`, { params });
    }

    /**
     * Get milestone details
     * @param {string} projectId - Project ID or encoded path
     * @param {number} milestoneId - Milestone ID
     * @returns {Promise} - Promise resolving to milestone data
     */
    getMilestone(projectId, milestoneId) {
        return this.callGitLabApi(`projects/${projectId}/milestones/${milestoneId}`);
    }

    /**
     * Update an issue
     * @param {Object} issueItem - Issue item from Vue component
     * @param {Object} updateData - Data to update (title, description, etc.)
     * @returns {Promise} - Promise resolving to updated issue data
     */
    updateIssue(issueItem, updateData) {
        const projectPath = issueItem.referencePath.split('#')[0];
        const issueIid = issueItem.iid;

        const encodedPath = encodeURIComponent(projectPath);
        return this.callGitLabApi(
            `projects/${encodedPath}/issues/${issueIid}`,
            {
                method: 'PUT',
                data: updateData
            }
        );
    }

    /**
     * Extract issue item from board card Vue component
     * @param {HTMLElement} boardCard - DOM element representing a board card
     * @returns {Object|null} - Issue item from Vue component or null if not found
     */
    getIssueItemFromCard(boardCard) {
        try {
            if (boardCard.__vue__ && boardCard.__vue__.$children) {
                // Find the issue in the $children array
                const issueComponent = boardCard.__vue__.$children.find(child =>
                    child.$props && child.$props.item);

                if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                    return issueComponent.$props.item;
                }
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }
        return null;
    }
}

// Export the class - will be initialized in main.js
window.GitLabAPI = GitLabAPI;

// File: lib/core/DataProcessor.js
// Data processing functions for GitLab Assignee Time Summary

/**
 * Process all boards and extract data
 * @returns {Object} Object containing processed board data
 */
window.processBoards = function processBoards() {
    const assigneeTimeMap = {};
    const boardData = {};
    const boardAssigneeData = {};
    let totalEstimate = 0;
    let cardsProcessed = 0;
    let cardsWithTime = 0;
    let currentMilestone = null;
    let closedBoardCards = 0;

    // Loop over all board lists
    const boardLists = document.querySelectorAll('.board-list');

    boardLists.forEach((boardList, listIndex) => {
        // Get board title from the board list's Vue component
        let boardTitle = "U" + listIndex.toString();

        try {
            // First attempt to get the title from the Vue component
            if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                const boardComponent = boardList.__vue__.$children.find(child =>
                    child.$props && child.$props.list && child.$props.list.title);

                if (boardComponent && boardComponent.$props.list.title) {
                    boardTitle = boardComponent.$props.list.title;
                }
            }

            // Fallback to DOM if Vue component approach failed
            if (boardTitle === 'Unknown') {
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim();
                }
            }
        } catch (e) {
            console.error('Error getting board title:', e);
            // Fallback to DOM
            const boardHeader = boardList.querySelector('.board-title-text');
            if (boardHeader) {
                boardTitle = boardHeader.textContent.trim();
            }
        }

        // Initialize board data only if we have a valid title
        if (boardTitle !== 'Unknown') {
            if (!boardData[boardTitle]) {
                boardData[boardTitle] = {
                    tickets: 0,
                    timeEstimate: 0
                };
            }

            if (!boardAssigneeData[boardTitle]) {
                boardAssigneeData[boardTitle] = {};
            }

            // Check if this is a closed/done board
            const lowerTitle = boardTitle.toLowerCase();
            const isClosedBoard = lowerTitle.includes('done') ||
                lowerTitle.includes('closed') ||
                lowerTitle.includes('complete') ||
                lowerTitle.includes('finished');
        } else {
            return; // Skip processing this board
        }

        // Find all board-list-items in this list
        const boardItems = boardList.querySelectorAll('.board-card');

        // Check if this is a closed/done board
        const lowerTitle = boardTitle.toLowerCase();
        const isClosedBoard = lowerTitle.includes('done') ||
            lowerTitle.includes('closed') ||
            lowerTitle.includes('complete') ||
            lowerTitle.includes('finished');

        // If this is a closed board, count its cards
        if (isClosedBoard) {
            closedBoardCards += boardItems.length;
        }

        boardItems.forEach(item => {
            try {
                cardsProcessed++;
                boardData[boardTitle].tickets++;

                // Access the Vue instance on the board-card element
                // and get the issue from $children, then access the $props
                if (item.__vue__ && item.__vue__.$children) {
                    // Find the issue in the $children array
                    const issue = item.__vue__.$children.find(child =>
                        child.$props && child.$props.item && child.$props.item.timeEstimate !== undefined);

                    if (issue && issue.$props) {
                        const props = issue.$props;

                        // Try to get milestone information if not already found
                        if (!currentMilestone && props.item && props.item.milestone) {
                            currentMilestone = props.item.milestone.title;
                        }

                        if (props.item && props.item.timeEstimate) {
                            cardsWithTime++;
                            const timeEstimate = props.item.timeEstimate; // In seconds
                            totalEstimate += timeEstimate;
                            boardData[boardTitle].timeEstimate += timeEstimate;

                            let assignees = [];
                            if (props.item.assignees && props.item.assignees.nodes && props.item.assignees.nodes.length) {
                                assignees = props.item.assignees.nodes;
                            } else if (props.item.assignees && props.item.assignees.length > 0) {
                                assignees = props.item.assignees;
                            }

                            if (assignees.length > 0) {
                                assignees.forEach(assignee => {
                                    // Split time estimate equally among assignees if multiple
                                    const assigneeShare = timeEstimate / assignees.length;
                                    const name = assignee.name;

                                    // Update global assignee data
                                    if (!assigneeTimeMap[name]) {
                                        assigneeTimeMap[name] = 0;
                                    }
                                    assigneeTimeMap[name] += assigneeShare;

                                    // Update board-specific assignee data
                                    if (!boardAssigneeData[boardTitle][name]) {
                                        boardAssigneeData[boardTitle][name] = {
                                            tickets: 0,
                                            timeEstimate: 0
                                        };
                                    }
                                    boardAssigneeData[boardTitle][name].tickets++;
                                    boardAssigneeData[boardTitle][name].timeEstimate += assigneeShare;
                                });
                            } else {
                                // Handle unassigned
                                // Global unassigned
                                if (!assigneeTimeMap['Unassigned']) {
                                    assigneeTimeMap['Unassigned'] = 0;
                                }
                                assigneeTimeMap['Unassigned'] += timeEstimate;

                                // Board-specific unassigned
                                if (!boardAssigneeData[boardTitle]['Unassigned']) {
                                    boardAssigneeData[boardTitle]['Unassigned'] = {
                                        tickets: 0,
                                        timeEstimate: 0
                                    };
                                }
                                boardAssigneeData[boardTitle]['Unassigned'].tickets++;
                                boardAssigneeData[boardTitle]['Unassigned'].timeEstimate += timeEstimate;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error processing card:', e);
            }
        });
    });

    return {
        assigneeTimeMap,
        boardData,
        boardAssigneeData,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone,
        closedBoardCards
    };
}

// File: lib/core/History.js
// History functions for GitLab Assignee Time Summary
/**
 * Save history entry
 * @param {number} totalEstimate - Total time estimate in seconds
 * @param {string} milestoneInfo - Current milestone info
 * @param {boolean} forceUpdate - Whether to force update even if no changes
 */
window.saveHistoryEntry = function saveHistoryEntry(totalEstimate, milestoneInfo, forceUpdate = false) {
    try {
        const now = new Date();
        const dateString = now.toISOString();
        const totalHours = (totalEstimate / 3600).toFixed(1);

        // Get current URL for storing history by URL
        const urlKey = getHistoryKey();

        // Prepare milestone info for storage
        let currentMilestone = "None";
        if (milestoneInfo) {
            // Clean up milestone text (remove line breaks, trim whitespace)
            currentMilestone = milestoneInfo.replace(/\n/g, ' ').trim();
        }

        // Get existing history for this URL
        let history = GM_getValue(urlKey, []);

        // Create the new entry
        const newEntry = {
            date: dateString,
            timestamp: now.getTime(),
            totalHours: totalHours,
            milestone: currentMilestone,
            url: window.location.href
        };

        // Check if the new entry is different from the last one
        let shouldSave = false;

        if (history.length === 0) {
            // Always save if this is the first entry
            shouldSave = true;
        } else {
            const lastEntry = history[history.length - 1];
            // Only save if the hours or milestone changed, even on forced updates
            if (lastEntry.totalHours !== newEntry.totalHours || lastEntry.milestone !== newEntry.milestone) {
                shouldSave = true;
            } else if (forceUpdate) {
                // If forcing update but values are identical, maybe just update timestamp
                // without creating a duplicate entry
            }
        }

        // Save the new entry if it's different
        if (shouldSave) {
            history.push(newEntry);
            // Limit history size (keep last 100 entries)
            if (history.length > 100) {
                history = history.slice(-100);
            }
            GM_setValue(urlKey, history);

            // Re-render the history tab if it's currently visible
            if (document.getElementById('history-time-summary-content').style.display === 'block') {
                // Importing UIManager would create circular dependencies,
                // so we'll rely on the global function to re-render
                if (typeof window.renderHistory === 'function') {
                    window.renderHistory();
                }
            }
        }
    } catch (error) {
        console.error('Error saving history:', error);
    }
}

// File: lib/storage/LocalStorage.js
// LocalStorage wrapper for GitLab Sprint Helper

/**
 * Save value to localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified if it's an object)
 * @returns {boolean} Success status
 */
window.saveToStorage = function saveToStorage(key, value) {
    try {
        if (typeof value === 'object') {
            localStorage.setItem(key, JSON.stringify(value));
        } else {
            localStorage.setItem(key, value);
        }
        return true;
    } catch (error) {
        console.error(`Error saving to localStorage (${key}):`, error);
        return false;
    }
}

/**
 * Load value from localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist or error occurs
 * @returns {*} Stored value or defaultValue
 */
window.loadFromStorage = function loadFromStorage(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) {
            return defaultValue;
        }

        // Only try to parse as JSON if it looks like JSON (starts with { or [)
        if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
            try {
                return JSON.parse(value);
            } catch (e) {
                console.warn(`Failed to parse value for ${key} as JSON, returning as string instead`);
                return value;
            }
        }

        // Otherwise return as plain string
        return value;
    } catch (error) {
        console.error(`Error loading from localStorage (${key}):`, error);
        return defaultValue;
    }
}

/**
 * Remove item from localStorage with error handling
 * @param {string} key - Storage key to remove
 * @returns {boolean} Success status
 */
window.removeFromStorage = function removeFromStorage(key) {
    try {
        localStorage.removeItem(key);
        return true;
    } catch (error) {
        console.error(`Error removing from localStorage (${key}):`, error);
        return false;
    }
}

/**
 * Clear all localStorage for this application
 * @param {string} prefix - Optional prefix to only clear keys starting with this prefix
 * @returns {boolean} Success status
 */
window.clearStorage = function clearStorage(prefix = null) {
    try {
        if (prefix) {
            // Clear only items with the given prefix
            const keysToRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith(prefix)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => localStorage.removeItem(key));
        } else {
            // Clear all localStorage items
            localStorage.clear();
        }
        return true;
    } catch (error) {
        console.error('Error clearing localStorage:', error);
        return false;
    }
}

/**
 * Check if a key exists in localStorage
 * @param {string} key - Storage key to check
 * @returns {boolean} Whether the key exists
 */
window.hasStorageKey = function hasStorageKey(key) {
    try {
        return localStorage.getItem(key) !== null;
    } catch (error) {
        console.error(`Error checking localStorage for key (${key}):`, error);
        return false;
    }
}

/**
 * Wrapper for GM_setValue (Tampermonkey storage) for compatibility
 * @param {string} key - Storage key
 * @param {*} value - Value to store
 */
window.setGMValue = function setGMValue(key, value) {
    try {
        if (typeof GM_setValue === 'function') {
            GM_setValue(key, value);
            return true;
        } else {
            console.warn('GM_setValue not available, falling back to localStorage');
            return saveToStorage(key, value);
        }
    } catch (error) {
        console.error(`Error in GM_setValue (${key}):`, error);
        return false;
    }
}

/**
 * Wrapper for GM_getValue (Tampermonkey storage) for compatibility
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if key doesn't exist
 * @returns {*} Stored value or defaultValue
 */
window.getGMValue = function getGMValue(key, defaultValue = null) {
    try {
        if (typeof GM_getValue === 'function') {
            const value = GM_getValue(key, defaultValue);
            return value;
        } else {
            console.warn('GM_getValue not available, falling back to localStorage');
            return loadFromStorage(key, defaultValue);
        }
    } catch (error) {
        console.error(`Error in GM_getValue (${key}):`, error);
        return defaultValue;
    }
}

// File: lib/storage/SettingsStorage.js
// Settings storage module for GitLab Sprint Helper
// Constants for storage keys
const STORAGE_KEYS = {
    LABEL_WHITELIST: 'gitLabHelperLabelWhitelist',
    ASSIGNEE_WHITELIST: 'gitLabHelperAssigneeWhitelist',
    LAST_ACTIVE_TAB: 'gitLabHelperLastActiveTab',
    UI_COLLAPSED: 'gitlabTimeSummaryCollapsed'
};

// Default values for settings
const DEFAULT_SETTINGS = {
    labelWhitelist: [
        'bug', 'feature', 'documentation', 'enhancement', 'security',
        'priority', 'high', 'medium', 'low', 'critical',
        'frontend', 'backend', 'ui', 'ux', 'api',
        'wontfix', 'duplicate', 'invalid', 'question',
        'ready', 'in progress', 'review', 'blocked'
    ],
    assigneeWhitelist: [],
    lastActiveTab: 'summary',
    uiCollapsed: false
};

/**
 * Get label whitelist with error handling
 * @returns {Array} Label whitelist array
 */
window.getLabelWhitelist = function getLabelWhitelist() {
    try {
        const whitelist = loadFromStorage(STORAGE_KEYS.LABEL_WHITELIST, null);

        // Handle various scenarios
        if (whitelist === null) {
            // Return a copy of the default whitelist
            return [...DEFAULT_SETTINGS.labelWhitelist];
        }

        // Ensure it's an array
        if (!Array.isArray(whitelist)) {
            console.warn('Label whitelist is not an array, using default');
            return [...DEFAULT_SETTINGS.labelWhitelist];
        }

        // Ensure all elements are strings
        const cleanedWhitelist = whitelist.filter(item => typeof item === 'string');

        // If everything was filtered out, use default
        if (cleanedWhitelist.length === 0 && whitelist.length > 0) {
            console.warn('Label whitelist contained no valid strings, using default');
            return [...DEFAULT_SETTINGS.labelWhitelist];
        }

        return cleanedWhitelist;
    } catch (error) {
        console.error('Error getting label whitelist:', error);
        return [...DEFAULT_SETTINGS.labelWhitelist];
    }
}

/**
 * Save label whitelist with error handling
 * @param {Array} whitelist - Label whitelist array
 * @returns {boolean} Success status
 */
window.saveLabelWhitelist = function saveLabelWhitelist(whitelist) {
    try {
        // Validate whitelist
        if (!Array.isArray(whitelist)) {
            console.warn('Attempting to save invalid whitelist (not an array), using empty array instead');
            whitelist = [];
        }

        // Filter out non-string items
        const cleanedWhitelist = whitelist.filter(item => typeof item === 'string');

        // Save the cleaned whitelist
        return saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, cleanedWhitelist);
    } catch (error) {
        console.error('Error saving label whitelist:', error);
        return false;
    }
}

/**
 * Reset label whitelist to default values with error handling
 * @returns {Array} The default whitelist
 */
window.resetLabelWhitelist = function resetLabelWhitelist() {
    try {
        // Create a copy of the default whitelist
        const defaultWhitelist = [...DEFAULT_SETTINGS.labelWhitelist];

        // Save it to storage
        saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, defaultWhitelist);

        // Return the default whitelist
        return defaultWhitelist;
    } catch (error) {
        console.error('Error resetting label whitelist:', error);
        return [...DEFAULT_SETTINGS.labelWhitelist];
    }
}

/**
 * Get assignee whitelist with error handling
 * @returns {Array} Assignee whitelist array
 */
window.getAssigneeWhitelist = function getAssigneeWhitelist() {
    try {
        const whitelist = loadFromStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, null);

        // Handle various scenarios
        if (whitelist === null) {
            // Return a copy of the default whitelist (empty array)
            return [];
        }

        // Ensure it's an array
        if (!Array.isArray(whitelist)) {
            console.warn('Assignee whitelist is not an array, using empty array');
            return [];
        }

        // Ensure all elements are objects with username
        const cleanedWhitelist = whitelist.filter(item =>
            item && typeof item === 'object' && typeof item.username === 'string'
        );

        return cleanedWhitelist;
    } catch (error) {
        console.error('Error getting assignee whitelist:', error);
        return [];
    }
}

/**
 * Save assignee whitelist with error handling
 * @param {Array} whitelist - Assignee whitelist array
 * @returns {boolean} Success status
 */
window.saveAssigneeWhitelist = function saveAssigneeWhitelist(whitelist) {
    try {
        // Validate whitelist
        if (!Array.isArray(whitelist)) {
            console.warn('Attempting to save invalid assignee whitelist (not an array), using empty array instead');
            whitelist = [];
        }

        // Filter out invalid items
        const cleanedWhitelist = whitelist.filter(item =>
            item && typeof item === 'object' && typeof item.username === 'string'
        );

        // Save the cleaned whitelist
        return saveToStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, cleanedWhitelist);
    } catch (error) {
        console.error('Error saving assignee whitelist:', error);
        return false;
    }
}

/**
 * Get last active tab from storage with error handling
 * @returns {string} Tab ID
 */
window.getLastActiveTab = function getLastActiveTab() {
    try {
        const tabId = loadFromStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, null);

        // Validate the tab ID
        if (tabId === null) {
            return DEFAULT_SETTINGS.lastActiveTab;
        }

        // Ensure it's a string
        if (typeof tabId !== 'string') {
            const stringTabId = String(tabId);
            // Check if we can convert to string sensibly
            if (stringTabId && ['summary', 'boards', 'history', 'bulkcomments'].includes(stringTabId)) {
                return stringTabId;
            }
            console.warn('Invalid tab ID format, using default');
            return DEFAULT_SETTINGS.lastActiveTab;
        }

        // Check if it's a valid tab ID
        if (!['summary', 'boards', 'history', 'bulkcomments'].includes(tabId)) {
            console.warn(`Unknown tab ID: ${tabId}, using default`);
            return DEFAULT_SETTINGS.lastActiveTab;
        }

        return tabId;
    } catch (error) {
        console.error('Error getting last active tab:', error);
        return DEFAULT_SETTINGS.lastActiveTab;
    }
}

/**
 * Save last active tab to storage with error handling
 * @param {string} tabId - Tab ID
 * @returns {boolean} Success status
 */
window.saveLastActiveTab = function saveLastActiveTab(tabId) {
    try {
        // Convert to string just in case
        const tabIdStr = String(tabId);

        // Validate the tab ID
        if (!['summary', 'boards', 'history', 'bulkcomments'].includes(tabIdStr)) {
            console.warn(`Attempting to save invalid tab ID: ${tabIdStr}, using default`);
            return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, DEFAULT_SETTINGS.lastActiveTab);
        }

        // Save the tab ID
        return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, tabIdStr);
    } catch (error) {
        console.error('Error saving last active tab:', error);
        return false;
    }
}

/**
 * Get UI collapsed state with error handling
 * @returns {boolean} Collapsed state
 */
window.getUICollapsedState = function getUICollapsedState() {
    try {
        const state = loadFromStorage(STORAGE_KEYS.UI_COLLAPSED, null);

        // Handle various scenarios
        if (state === null) {
            return DEFAULT_SETTINGS.uiCollapsed;
        }

        // Convert string "true" or "false" to boolean if needed
        if (typeof state === 'string') {
            return state.toLowerCase() === 'true';
        }

        // Use directly if it's already a boolean
        if (typeof state === 'boolean') {
            return state;
        }

        // Default for any other type
        return DEFAULT_SETTINGS.uiCollapsed;
    } catch (error) {
        console.error('Error getting UI collapsed state:', error);
        return DEFAULT_SETTINGS.uiCollapsed;
    }
}

/**
 * Save UI collapsed state with error handling
 * @param {boolean} collapsed - Collapsed state
 * @returns {boolean} Success status
 */
window.saveUICollapsedState = function saveUICollapsedState(collapsed) {
    try {
        // Convert to boolean if it's a string
        let collapsedBool = collapsed;
        if (typeof collapsed === 'string') {
            collapsedBool = collapsed.toLowerCase() === 'true';
        }

        // Ensure it's a boolean
        collapsedBool = Boolean(collapsedBool);

        // Save as string for consistency
        return saveToStorage(STORAGE_KEYS.UI_COLLAPSED, String(collapsedBool));
    } catch (error) {
        console.error('Error saving UI collapsed state:', error);
        return false;
    }
}

// File: lib/ui/components/Dropdown.js
// Dropdown.js - Reusable dropdown component

/**
 * Class that creates custom styled dropdown components
 */
window.Dropdown = class Dropdown {
    /**
     * Constructor for Dropdown component
     * @param {Object} options - Configuration options
     * @param {Array} options.items - Array of {value, label} objects
     * @param {Function} options.onChange - Callback function when selection changes
     * @param {string} options.placeholder - Placeholder text when no selection (optional)
     * @param {Function} options.optionRenderer - Custom renderer for options (optional)
     * @param {boolean} options.searchable - Whether to enable search (optional)
     * @param {string} options.width - Width of dropdown (optional)
     */
    constructor(options) {
        this.items = options.items || [];
        this.onChange = options.onChange;
        this.placeholder = options.placeholder || 'Select an option...';
        this.optionRenderer = options.optionRenderer;
        this.searchable = options.searchable || false;
        this.width = options.width || '100%';

        this.container = null;
        this.selectElement = null;
        this.selectedValue = null;
        this.open = false;
    }

    /**
     * Render the dropdown
     * @param {HTMLElement} parentElement - Element to attach dropdown to
     * @returns {HTMLElement} Dropdown container element
     */
    render(parentElement) {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'custom-dropdown';
        this.container.style.position = 'relative';
        this.container.style.display = 'inline-block';
        this.container.style.width = this.width;

        // Create select-like box
        this.selectElement = document.createElement('div');
        this.selectElement.className = 'custom-dropdown-select';
        this.selectElement.style.border = '1px solid #ddd';
        this.selectElement.style.borderRadius = '4px';
        this.selectElement.style.padding = '6px 10px';
        this.selectElement.style.backgroundColor = '#fff';
        this.selectElement.style.cursor = 'pointer';
        this.selectElement.style.display = 'flex';
        this.selectElement.style.justifyContent = 'space-between';
        this.selectElement.style.alignItems = 'center';
        this.selectElement.style.fontSize = '13px';

        // Placeholder text
        const placeholderText = document.createElement('span');
        placeholderText.className = 'dropdown-placeholder';
        placeholderText.textContent = this.placeholder;
        placeholderText.style.color = '#666';

        // Arrow icon
        const arrowIcon = document.createElement('span');
        arrowIcon.className = 'dropdown-arrow';
        arrowIcon.innerHTML = '▼';
        arrowIcon.style.fontSize = '10px';
        arrowIcon.style.marginLeft = '5px';
        arrowIcon.style.transition = 'transform 0.2s ease';

        this.selectElement.appendChild(placeholderText);
        this.selectElement.appendChild(arrowIcon);

        // Create dropdown menu (initially hidden)
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.style.position = 'absolute';
        dropdownMenu.style.top = '100%';
        dropdownMenu.style.left = '0';
        dropdownMenu.style.right = '0';
        dropdownMenu.style.backgroundColor = '#fff';
        dropdownMenu.style.border = '1px solid #ddd';
        dropdownMenu.style.borderRadius = '0 0 4px 4px';
        dropdownMenu.style.maxHeight = '200px';
        dropdownMenu.style.overflowY = 'auto';
        dropdownMenu.style.zIndex = '1000';
        dropdownMenu.style.display = 'none';
        dropdownMenu.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';

        // Add search input if searchable
        if (this.searchable) {
            const searchContainer = document.createElement('div');
            searchContainer.style.padding = '5px';
            searchContainer.style.position = 'sticky';
            searchContainer.style.top = '0';
            searchContainer.style.backgroundColor = '#fff';
            searchContainer.style.borderBottom = '1px solid #eee';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Search...';
            searchInput.style.width = '100%';
            searchInput.style.padding = '5px';
            searchInput.style.border = '1px solid #ccc';
            searchInput.style.borderRadius = '3px';
            searchInput.style.fontSize = '12px';

            searchInput.addEventListener('input', (e) => {
                const searchText = e.target.value.toLowerCase();
                this.filterItems(searchText, dropdownMenu);
            });

            searchContainer.appendChild(searchInput);
            dropdownMenu.appendChild(searchContainer);
        }

        // Add items to dropdown
        this.populateDropdown(dropdownMenu);

        // Toggle dropdown on click
        this.selectElement.addEventListener('click', () => {
            this.toggleDropdown(dropdownMenu, arrowIcon);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target) && this.open) {
                this.closeDropdown(dropdownMenu, arrowIcon);
            }
        });

        // Add elements to container
        this.container.appendChild(this.selectElement);
        this.container.appendChild(dropdownMenu);

        // Add to parent
        if (parentElement) {
            parentElement.appendChild(this.container);
        }

        return this.container;
    }

    /**
     * Populate dropdown with items
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     */
    populateDropdown(dropdownMenu) {
        // Create option elements
        this.items.forEach(item => {
            const option = document.createElement('div');
            option.className = 'dropdown-item';
            option.dataset.value = item.value;
            option.style.padding = '8px 10px';
            option.style.cursor = 'pointer';
            option.style.transition = 'background-color 0.2s ease';

            // Hover effect
            option.addEventListener('mouseenter', () => {
                option.style.backgroundColor = '#f5f5f5';
            });

            option.addEventListener('mouseleave', () => {
                option.style.backgroundColor = '';
            });

            // Use custom renderer if provided, otherwise use default
            if (this.optionRenderer && typeof this.optionRenderer === 'function') {
                const customContent = this.optionRenderer(item);
                if (customContent instanceof HTMLElement) {
                    option.appendChild(customContent);
                } else {
                    option.innerHTML = customContent;
                }
            } else {
                option.textContent = item.label;
            }

            // Set click handler
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectItem(item, option);
                this.closeDropdown(dropdownMenu);
            });

            dropdownMenu.appendChild(option);
        });
    }

    /**
     * Filter dropdown items based on search text
     * @param {string} searchText - Text to filter by
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     */
    filterItems(searchText, dropdownMenu) {
        const items = dropdownMenu.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            const itemText = item.textContent.toLowerCase();
            if (itemText.includes(searchText)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * Toggle dropdown open/closed state
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     * @param {HTMLElement} arrowIcon - Arrow icon element
     */
    toggleDropdown(dropdownMenu, arrowIcon) {
        if (this.open) {
            this.closeDropdown(dropdownMenu, arrowIcon);
        } else {
            this.openDropdown(dropdownMenu, arrowIcon);
        }
    }

    /**
     * Open the dropdown
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     * @param {HTMLElement} arrowIcon - Arrow icon element
     */
    openDropdown(dropdownMenu, arrowIcon) {
        dropdownMenu.style.display = 'block';
        arrowIcon.style.transform = 'rotate(180deg)';
        this.open = true;

        // Focus search input if searchable
        if (this.searchable) {
            const searchInput = dropdownMenu.querySelector('input');
            if (searchInput) {
                searchInput.focus();
            }
        }
    }

    /**
     * Close the dropdown
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     * @param {HTMLElement} arrowIcon - Arrow icon element
     */
    closeDropdown(dropdownMenu, arrowIcon) {
        dropdownMenu.style.display = 'none';
        if (arrowIcon) {
            arrowIcon.style.transform = '';
        }
        this.open = false;
    }

    /**
     * Handle item selection
     * @param {Object} item - Selected item {value, label}
     * @param {HTMLElement} optionElement - Selected option element
     */
    selectItem(item, optionElement) {
        this.selectedValue = item.value;

        // Update select box display
        const placeholder = this.selectElement.querySelector('.dropdown-placeholder');

        if (this.optionRenderer && typeof this.optionRenderer === 'function') {
            // Clear existing content
            placeholder.innerHTML = '';

            // Create a copy of the rendered option
            const renderedContent = this.optionRenderer(item);
            if (renderedContent instanceof HTMLElement) {
                placeholder.appendChild(renderedContent.cloneNode(true));
            } else {
                placeholder.innerHTML = renderedContent;
            }

            // Update styling to show it's selected
            placeholder.style.color = '';
        } else {
            placeholder.textContent = item.label;
            placeholder.style.color = '';
        }

        // Call onChange callback
        if (typeof this.onChange === 'function') {
            this.onChange(item.value, item);
        }
    }

    /**
     * Set value programmatically
     * @param {string} value - Value to select
     * @returns {boolean} Whether the value was found and selected
     */
    setValue(value) {
        const item = this.items.find(item => item.value === value);
        if (item) {
            // Find the option element
            const optionElement = this.container.querySelector(`.dropdown-item[data-value="${value}"]`);
            if (optionElement) {
                this.selectItem(item, optionElement);
                return true;
            }
        }
        return false;
    }

    /**
     * Get current selected value
     * @returns {*} Currently selected value
     */
    getValue() {
        return this.selectedValue;
    }

    /**
     * Reset dropdown to placeholder state
     */
    reset() {
        this.selectedValue = null;
        const placeholder = this.selectElement.querySelector('.dropdown-placeholder');
        placeholder.textContent = this.placeholder;
        placeholder.style.color = '#666';
    }

    /**
     * Update dropdown items
     * @param {Array} newItems - New items array
     */
    updateItems(newItems) {
        this.items = newItems;

        // Clear dropdown menu
        const dropdownMenu = this.container.querySelector('.dropdown-menu');

        // Remove all items but keep the search box if present
        const searchBox = this.searchable ? dropdownMenu.firstChild : null;
        dropdownMenu.innerHTML = '';

        if (searchBox) {
            dropdownMenu.appendChild(searchBox);
        }

        // Re-populate with new items
        this.populateDropdown(dropdownMenu);

        // Reset selection
        this.reset();
    }

    /**
     * Disable the dropdown
     */
    disable() {
        this.selectElement.style.opacity = '0.6';
        this.selectElement.style.pointerEvents = 'none';
    }

    /**
     * Enable the dropdown
     */
    enable() {
        this.selectElement.style.opacity = '1';
        this.selectElement.style.pointerEvents = 'auto';
    }
}

// File: lib/ui/components/Notification.js
// Notification.js - Toast notification component

/**
 * Create and show toast notifications
 */
window.Notification = class Notification {
    /**
     * Constructor
     * @param {Object} options - Configuration options
     * @param {string} options.position - Position of notification (default: 'bottom-right')
     * @param {number} options.duration - Duration in ms (default: 3000)
     * @param {string} options.animationDuration - Animation duration (default: '0.3s')
     */
    constructor(options = {}) {
        this.position = 'bottom-left';
        this.duration = options.duration || 3000;
        this.animationDuration = options.animationDuration || '0.3s';
        this.container = null;

        // Initialize container
        this.createContainer();
    }

    /**
     * Create notification container
     */
    createContainer() {
        // Check if container already exists
        if (document.getElementById('gitlab-helper-notifications')) {
            this.container = document.getElementById('gitlab-helper-notifications');
            return;
        }

        // Create container based on position
        this.container = document.createElement('div');
        this.container.id = 'gitlab-helper-notifications';
        this.container.style.position = 'fixed';
        this.container.style.zIndex = '10000';

        // Set position styling
        switch (this.position) {
            case 'top-right':
                this.container.style.top = '20px';
                this.container.style.right = '20px';
                break;
            case 'top-left':
                this.container.style.top = '20px';
                this.container.style.left = '20px';
                break;
            case 'top-center':
                this.container.style.top = '20px';
                this.container.style.left = '50%';
                this.container.style.transform = 'translateX(-50%)';
                break;
            case 'bottom-left':
                this.container.style.bottom = '20px';
                this.container.style.left = '20px';
                break;
            case 'bottom-center':
                this.container.style.bottom = '20px';
                this.container.style.left = '50%';
                this.container.style.transform = 'translateX(-50%)';
                break;
            case 'bottom-right':
            default:
                this.container.style.bottom = '20px';
                this.container.style.right = '20px';
                break;
        }

        // Add container to document
        document.body.appendChild(this.container);
    }

    /**
     * Show a notification
     * @param {Object} options - Notification options
     * @param {string} options.message - Notification message
     * @param {string} options.type - Notification type (success, error, warning, info)
     * @param {number} options.duration - Duration in ms (optional)
     * @param {Function} options.onClose - Callback on close (optional)
     * @returns {HTMLElement} Notification element
     */
    show(options) {
        // Get options
        const message = options.message || '';
        const type = options.type || 'info';
        const duration = options.duration || this.duration;
        const onClose = options.onClose || null;

        // Create notification element
        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.style.padding = '12px 16px';
        notification.style.marginBottom = '10px';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        notification.style.display = 'flex';
        notification.style.alignItems = 'center';
        notification.style.justifyContent = 'space-between';
        notification.style.minWidth = '200px';
        notification.style.maxWidth = '350px';
        notification.style.opacity = '0';
        notification.style.transform = this.getInitialTransform();
        notification.style.transition = `opacity ${this.animationDuration} ease, transform ${this.animationDuration} ease`;

        // Set color based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#28a745';
                notification.style.color = 'white';
                break;
            case 'error':
                notification.style.backgroundColor = '#dc3545';
                notification.style.color = 'white';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ffc107';
                notification.style.color = 'black';
                break;
            case 'info':
            default:
                notification.style.backgroundColor = '#17a2b8';
                notification.style.color = 'white';
                break;
        }

        // Add message
        const messageContainer = document.createElement('div');
        messageContainer.style.flex = '1';
        messageContainer.textContent = message;

        // Add close button
        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.color = notification.style.color;
        closeButton.style.fontSize = '18px';
        closeButton.style.marginLeft = '10px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.style.opacity = '0.7';
        closeButton.style.transition = 'opacity 0.2s ease';
        closeButton.style.outline = 'none';

        // Hover effect for close button
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.opacity = '1';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.opacity = '0.7';
        });

        // Close notification on click
        closeButton.addEventListener('click', () => {
            this.close(notification, onClose);
        });

        // Add elements to notification
        notification.appendChild(messageContainer);
        notification.appendChild(closeButton);

        // Add notification to container
        this.container.appendChild(notification);

        // Trigger animation
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Auto-close after duration
        if (duration > 0) {
            setTimeout(() => {
                this.close(notification, onClose);
            }, duration);
        }

        return notification;
    }

    /**
     * Close a notification
     * @param {HTMLElement} notification - Notification element
     * @param {Function} callback - Callback function
     */
    close(notification, callback = null) {
        // Skip if already animating out
        if (notification.dataset.closing === 'true') {
            return;
        }

        // Mark as closing
        notification.dataset.closing = 'true';

        // Animate out
        notification.style.opacity = '0';
        notification.style.transform = this.getInitialTransform();

        // Remove after animation
        setTimeout(() => {
            if (notification.parentNode === this.container) {
                this.container.removeChild(notification);
            }

            // Call callback if provided
            if (callback && typeof callback === 'function') {
                callback();
            }
        }, parseFloat(this.animationDuration) * 1000);
    }

    /**
     * Get initial transform based on position
     * @returns {string} Transform value
     */
    getInitialTransform() {
        // Different animations based on position
        if (this.position.startsWith('top')) {
            return 'translateY(-20px)';
        } else {
            return 'translateY(20px)';
        }
    }

    /**
     * Show a success notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    success(message, options = {}) {
        return this.show({
            message,
            type: 'success',
            ...options
        });
    }

    /**
     * Show an error notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    error(message, options = {}) {
        return this.show({
            message,
            type: 'error',
            ...options
        });
    }

    /**
     * Show a warning notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    warning(message, options = {}) {
        return this.show({
            message,
            type: 'warning',
            ...options
        });
    }

    /**
     * Show an info notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    info(message, options = {}) {
        return this.show({
            message,
            type: 'info',
            ...options
        });
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }
}

// File: lib/ui/components/CommandShortcut.js
// CommandShortcut.js - Reusable module for command action shortcuts in comments

/**
 * Class that manages command shortcuts for GitLab comments
 */
window.CommandShortcut = class CommandShortcut {
    /**
     * Constructor for CommandShortcut module
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.targetElement - The textarea or input element to insert shortcuts into
     * @param {Function} options.onShortcutInsert - Callback function that runs after shortcut insertion (optional)
     */
    constructor(options) {
        this.targetElement = options.targetElement;
        this.onShortcutInsert = options.onShortcutInsert || null;
        this.shortcutsContainer = null;
        this.shortcuts = {};
        this.customDropdowns = [];
    }

    /**
     * Initialize shortcuts container
     * @param {HTMLElement} parentElement - Element to attach the shortcuts container to
     */
    initialize(parentElement) {
        // Clear existing container if present
        if (this.shortcutsContainer && this.shortcutsContainer.parentNode) {
            this.shortcutsContainer.parentNode.removeChild(this.shortcutsContainer);
        }

        // Create shortcuts container
        this.shortcutsContainer = document.createElement('div');
        this.shortcutsContainer.className = 'command-shortcuts-container';
        this.shortcutsContainer.style.marginBottom = '10px';
        this.shortcutsContainer.style.display = 'flex';
        this.shortcutsContainer.style.flexDirection = 'column'; // Changed to column to ensure consistent order
        this.shortcutsContainer.style.gap = '8px';
        this.shortcutsContainer.style.alignItems = 'stretch';

        // Append to parent element
        parentElement.appendChild(this.shortcutsContainer);

        // Initialize default shortcuts
        this.initializeEstimateShortcut();
    }

    /**
     * Initialize the estimate shortcut with dropdown
     */
    initializeEstimateShortcut() {
        // Check if the shortcut already exists and remove it if it does
        if (this.shortcuts['estimate']) {
            this.removeShortcut('estimate');
        }

        // Create shortcut and add it to shortcuts container
        this.addCustomShortcut({
            type: 'estimate',
            label: '/estimate',
            items: [
                { value: '', label: 'Estimate Hours' },
                { value: '1', label: '1h' },
                { value: '2', label: '2h' },
                { value: '4', label: '4h' },
                { value: '8', label: '8h' },
                { value: '16', label: '16h' },
                { value: '32', label: '32h' },
                { value: 'custom', label: 'Custom...' }
            ],
            onSelect: (value) => {
                if (value === 'custom') {
                    this.handleCustomEstimate();
                } else if (value) {
                    this.insertEstimateText(value);
                }
            }
        });
    }

    /**
     * Remove a shortcut by type
     * @param {string} type - Shortcut type to remove
     */
    removeShortcut(type) {
        if (this.shortcuts[type] && this.shortcuts[type].element) {
            // Remove shortcut from DOM
            const element = this.shortcuts[type].element;
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }

            // Remove from shortcuts object
            delete this.shortcuts[type];
        }
    }

    /**
     * Handle custom estimate option with prompt
     */
    handleCustomEstimate() {
        const customValue = prompt('Enter custom estimate hours (whole numbers only):', '');

        // Validate input - must be a positive integer
        if (customValue === null || customValue === '') {
            // User cancelled or entered empty string
            return;
        }

        const parsedValue = parseInt(customValue, 10);
        if (isNaN(parsedValue) || parsedValue <= 0 || parsedValue !== parseFloat(customValue)) {
            alert('Please enter a valid positive whole number.');
            return;
        }

        // Insert the valid estimate
        this.insertEstimateText(parsedValue.toString());
    }

    /**
     * Insert estimate text into target element, replacing any existing estimate
     * @param {string} hours - Number of hours to estimate
     */
    insertEstimateText(hours) {
        if (!this.targetElement) return;

        const estimateText = `/estimate ${hours}h`;

        // Get current text
        const currentText = this.targetElement.value;

        // Check if there's already an estimate command
        const estimateRegex = /\/estimate\s+\d+h/g;
        const hasEstimate = estimateRegex.test(currentText);

        if (hasEstimate) {
            // Replace existing estimate with new one
            const newText = currentText.replace(estimateRegex, estimateText);
            this.targetElement.value = newText;
        } else {
            // Insert new estimate at cursor position
            const startPos = this.targetElement.selectionStart;
            const endPos = this.targetElement.selectionEnd;

            // Check if we need to add a new line before the estimate
            let insertText = estimateText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text at cursor position
            const newText = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Update textarea value
            this.targetElement.value = newText;

            // Set cursor position after inserted text
            const newCursorPos = startPos + insertText.length;
            this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
        }

        // Set focus back to textarea
        this.targetElement.focus();

        // Call the callback if provided
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert('estimate', hours);
        }
    }

    /**
     * Add a custom shortcut dropdown with consistent styling
     * @param {Object} options - Shortcut configuration
     * @param {string} options.type - Type identifier for the shortcut
     * @param {string} options.label - Label text to display
     * @param {Array} options.items - Array of {value, label} objects for dropdown
     * @param {Function} options.onSelect - Function to call when an item is selected
     * @param {Function} options.customOptionRenderer - Optional function to render custom option elements
     * @returns {HTMLElement} The created shortcut element
     */
    addCustomShortcut(options) {
        if (!this.shortcutsContainer) {
            console.error("Shortcuts container not initialized");
            return null;
        }

        // Check if already exists and remove it first
        if (this.shortcuts && this.shortcuts[options.type]) {
            this.removeShortcut(options.type);
        }

        // Create shortcut container with consistent styling
        const shortcutContainer = document.createElement('div');
        shortcutContainer.className = `shortcut-item ${options.type}-shortcut`;
        shortcutContainer.style.display = 'flex';
        shortcutContainer.style.alignItems = 'center';
        shortcutContainer.style.width = '100%';
        shortcutContainer.style.marginBottom = '8px';
        shortcutContainer.style.justifyContent = 'space-between';
        shortcutContainer.style.border = '1px solid #ddd';
        shortcutContainer.style.borderRadius = '4px';
        shortcutContainer.style.padding = '6px 10px';
        shortcutContainer.style.backgroundColor = '#f8f9fa';
        shortcutContainer.style.height = '36px'; // Fixed height
        shortcutContainer.style.boxSizing = 'border-box';
        shortcutContainer.dataset.shortcutType = options.type; // Add data attribute for ordering

        // Create label with consistent styling
        const shortcutLabel = document.createElement('div');
        shortcutLabel.textContent = options.label;
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.fontWeight = 'bold';
        shortcutLabel.style.color = '#555';
        shortcutLabel.style.minWidth = '100px';
        shortcutLabel.style.flexShrink = '0'; // Prevent shrinking
        shortcutLabel.style.whiteSpace = 'nowrap';

        // Create dropdown container with fixed width
        const dropdownContainer = document.createElement('div');
        dropdownContainer.style.flex = '1';
        dropdownContainer.style.position = 'relative';
        dropdownContainer.style.height = '24px'; // Fixed height
        dropdownContainer.style.marginLeft = '10px';

        // Create select element with consistent width
        const dropdown = document.createElement('select');
        dropdown.className = `${options.type}-dropdown`;
        dropdown.style.width = '100%';
        dropdown.style.height = '100%';
        dropdown.style.appearance = 'auto'; // Use native appearance for stability
        dropdown.style.padding = '0 25px 0 8px'; // Add some padding for the arrow
        dropdown.style.fontSize = '13px';
        dropdown.style.border = '1px solid #ccc';
        dropdown.style.borderRadius = '4px';
        dropdown.style.backgroundColor = '#fff';
        dropdown.style.boxSizing = 'border-box';

        // Add placeholder option first
        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = options.items[0]?.label || 'Select...';
        placeholderOption.selected = true;
        dropdown.appendChild(placeholderOption);

        // Add other options
        if (options.items && options.items.length > 0) {
            options.items.forEach((item, index) => {
                if (index === 0) return; // Skip the first one, already added as placeholder

                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label;
                dropdown.appendChild(option);
            });
        }

        // Add change event listener
        dropdown.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            if (selectedValue && options.onSelect) {
                options.onSelect(selectedValue);
                e.target.value = ''; // Reset after selection
            }
        });

        // Append elements to container
        dropdownContainer.appendChild(dropdown);
        shortcutContainer.appendChild(shortcutLabel);
        shortcutContainer.appendChild(dropdownContainer);

        // Find the correct position to insert this shortcut (based on a predefined order)
        const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
        const thisTypeIndex = shortcutOrder.indexOf(options.type);

        if (thisTypeIndex === -1) {
            // Not in predefined order, just append
            this.shortcutsContainer.appendChild(shortcutContainer);
        } else {
            // Find the right position based on the order
            let inserted = false;
            const existingShortcuts = this.shortcutsContainer.querySelectorAll('.shortcut-item');

            for (let i = 0; i < existingShortcuts.length; i++) {
                const existingType = existingShortcuts[i].dataset.shortcutType;
                const existingIndex = shortcutOrder.indexOf(existingType);

                if (existingIndex > thisTypeIndex) {
                    // Insert before this shortcut
                    this.shortcutsContainer.insertBefore(shortcutContainer, existingShortcuts[i]);
                    inserted = true;
                    break;
                }
            }

            // If not inserted yet, append at the end
            if (!inserted) {
                this.shortcutsContainer.appendChild(shortcutContainer);
            }
        }

        // Store reference
        this.shortcuts[options.type] = {
            element: shortcutContainer,
            dropdown: dropdown,
            options: options
        };

        return shortcutContainer;
    }


    /**
     * Apply replacement logic for commands
     * @param {string} type - Type of shortcut (e.g., 'label', 'milestone')
     * @param {string} command - The command to insert (e.g., '/label ~bug')
     * @param {RegExp} regex - Regular expression to match existing commands
     * @param {Function} replacementFn - Function to handle the insertion/replacement
     */
    replaceOrInsertCommand(type, command, regex, replacementFn) {
        if (!this.targetElement) return;

        // Get current text
        const currentText = this.targetElement.value;

        // Check if there's already a command of this type
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            const newText = currentText.replace(regex, command);
            this.targetElement.value = newText;
        } else {
            // Execute the provided insertion function
            replacementFn();
        }

        // Set focus back to textarea
        this.targetElement.focus();

        // Call the callback if provided
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert(type, command);
        }
    }
}

// File: lib/ui/components/SelectionDisplay.js
// SelectionDisplay.js - Improved to handle UI updates better
window.SelectionDisplay = class SelectionDisplay {
    /**
     * Constructor for SelectionDisplay
     * @param {Object} options - Configuration options
     * @param {Array} options.selectedIssues - Array of selected issue objects
     * @param {Function} options.onRemoveIssue - Callback when issue is removed
     */
    constructor(options = {}) {
        this.selectedIssues = options.selectedIssues || [];
        this.onRemoveIssue = options.onRemoveIssue || null;
        this.container = null;
        this.issuesList = null;
    }

    /**
     * Create the selected issues container
     * @param {HTMLElement} container - Parent container to append to
     */
    createSelectionContainer(container) {
        this.container = container;

        // Selected issues container with improved styling
        const selectedIssuesContainer = document.createElement('div');
        selectedIssuesContainer.style.marginBottom = '12px';
        selectedIssuesContainer.style.padding = '8px';
        selectedIssuesContainer.style.borderRadius = '4px';
        selectedIssuesContainer.style.border = '1px dashed #ccc';
        selectedIssuesContainer.style.backgroundColor = '#f9f9f9';
        selectedIssuesContainer.style.maxHeight = '150px';
        selectedIssuesContainer.style.overflowY = 'auto';

        const issueLabel = document.createElement('div');
        issueLabel.style.fontSize = '12px';
        issueLabel.style.color = '#666';
        issueLabel.style.marginBottom = '5px';
        issueLabel.textContent = 'Selected Issues:';
        selectedIssuesContainer.appendChild(issueLabel);

        // This will be our container for issue list
        const selectedIssuesList = document.createElement('div');
        selectedIssuesList.id = 'selected-issues-list';
        selectedIssuesList.style.fontSize = '14px';

        // Store reference to the list for updates
        this.issuesList = selectedIssuesList;

        // Display "No issues selected" initially
        this.displayNoIssuesMessage();

        selectedIssuesContainer.appendChild(selectedIssuesList);
        container.appendChild(selectedIssuesContainer);

        // Update display with any existing issues
        this.updateDisplay();
    }

    /**
     * Display "No issues selected" message
     */
    displayNoIssuesMessage() {
        if (!this.issuesList) return;

        // Check if message already exists
        const existingMessage = this.issuesList.querySelector('#no-issues-selected');
        if (existingMessage) return;

        const noIssuesSelected = document.createElement('div');
        noIssuesSelected.id = 'no-issues-selected';
        noIssuesSelected.textContent = 'No issues selected';
        noIssuesSelected.style.color = '#666';
        noIssuesSelected.style.fontStyle = 'italic';
        this.issuesList.appendChild(noIssuesSelected);
    }

    /**
     * Update the display of selected issues
     */
    updateDisplay() {
        if (!this.issuesList) {
            console.error('Issues list not initialized');
            return;
        }

        // Clear existing list
        this.issuesList.innerHTML = '';

        // If no issues are selected
        if (!this.selectedIssues || this.selectedIssues.length === 0) {
            // Show "No issues selected" message
            this.displayNoIssuesMessage();

            // Reset container styling
            const container = this.issuesList.parentElement;
            if (container) {
                container.style.borderColor = '#ccc';
                container.style.backgroundColor = '#f9f9f9';
            }

            return;
        }

        // Enhance container styling when issues are selected
        const container = this.issuesList.parentElement;
        if (container) {
            container.style.borderColor = '#1f75cb';
            container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
        }

        // Create list of issues
        this.selectedIssues.forEach((issue, index) => {
            // Skip null or undefined issues
            if (!issue) return;

            const issueItem = document.createElement('div');
            issueItem.className = 'selected-issue-item';
            issueItem.style.padding = '5px';
            issueItem.style.marginBottom = '3px';
            issueItem.style.borderRadius = '3px';
            issueItem.style.backgroundColor = 'rgba(31, 117, 203, 0.1)';
            issueItem.style.display = 'flex';
            issueItem.style.justifyContent = 'space-between';
            issueItem.style.alignItems = 'center';

            const issueInfo = document.createElement('div');
            // Use safe access to issue properties
            const issueId = issue.iid || 'Unknown';
            const issueTitle = issue.title || 'Untitled Issue';
            issueInfo.innerHTML = `<strong>#${issueId}</strong> - ${issueTitle}`;
            issueInfo.style.overflow = 'hidden';
            issueInfo.style.textOverflow = 'ellipsis';
            issueInfo.style.whiteSpace = 'nowrap';
            issueInfo.style.marginRight = '5px';
            issueItem.appendChild(issueInfo);

            // Add remove button
            const removeBtn = document.createElement('button');
            removeBtn.textContent = '×';
            removeBtn.style.backgroundColor = 'transparent';
            removeBtn.style.border = 'none';
            removeBtn.style.color = '#dc3545';
            removeBtn.style.fontSize = '16px';
            removeBtn.style.fontWeight = 'bold';
            removeBtn.style.cursor = 'pointer';
            removeBtn.style.padding = '0 5px';
            removeBtn.title = 'Remove this issue';

            // Add hover effect
            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.color = '#c82333';
            });

            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.color = '#dc3545';
            });

            // Add click handler to remove this issue
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeIssue(index);
            };

            issueItem.appendChild(removeBtn);
            this.issuesList.appendChild(issueItem);
        });

        // Log for debugging
        console.log(`Updated selection display with ${this.selectedIssues.length} issues`);
    }

    /**
     * Remove an issue from the selection
     * @param {number} index - Index of the issue to remove
     */
    removeIssue(index) {
        if (index >= 0 && index < this.selectedIssues.length) {
            // Store the issue before removing for logging
            const removedIssue = this.selectedIssues[index];

            // Remove the issue
            this.selectedIssues.splice(index, 1);

            // Update display
            this.updateDisplay();

            // Call callback if provided - this is important for syncing with IssueSelector
            if (typeof this.onRemoveIssue === 'function') {
                this.onRemoveIssue(index);
            } else {
                // Fallback sync with IssueSelector if callback not provided
                try {
                    // Try to find IssueSelector through global uiManager
                    if (window.uiManager && window.uiManager.issueSelector) {
                        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    }
                } catch (e) {
                    console.error('Error syncing with IssueSelector:', e);
                }
            }

            // Log for debugging
            console.log(`Removed issue at index ${index}:`, removedIssue);
        }
    }


    /**
     * Set the selected issues
     * @param {Array} issues - Array of issue objects to display
     */
    setSelectedIssues(issues) {
        // Make a copy of the array to avoid reference issues
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];

        // Update the display
        this.updateDisplay();

        // Log for debugging
        console.log(`Set ${this.selectedIssues.length} selected issues in SelectionDisplay`);
    }

    /**
     * Get the current selected issues
     * @returns {Array} Currently selected issues
     */
    getSelectedIssues() {
        return [...this.selectedIssues];
    }
}

// File: lib/ui/components/IssueSelector.js
// Complete IssueSelector with UI update fixes
window.IssueSelector = class IssueSelector {
    /**
     * Constructor for IssueSelector
     * @param {Object} options - Configuration options
     * @param {Function} options.onSelectionChange - Callback function when selection changes
     * @param {Function} options.onSelectionComplete - Callback function when selection is completed
     * @param {Array} options.initialSelection - Initial selection of issues
     */
    constructor(options = {}) {
        this.uiManager = options.uiManager;
        this.onSelectionChange = options.onSelectionChange || null;
        this.onSelectionComplete = options.onSelectionComplete || null;

        this.isSelectingIssue = false;
        this.selectionOverlays = [];
        this.selectedOverlays = []; // Track which overlays are selected
        this.selectedIssues = options.initialSelection || []; // Store multiple selected issues

        // Add escape key handler to document
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSelectingIssue) {
                this.exitSelectionMode();
            }
        });
    }

    /**
     * Start issue selection mode with improved overlay UI
     */
    startSelection() {
        console.log('Starting issue selection mode');

        // If already in selection mode, don't create duplicate overlays
        if (this.isSelectingIssue) {
            console.log('Already in selection mode, ignoring duplicate call');
            return;
        }

        this.isSelectingIssue = true;

        // Don't reset selected issues when starting selection mode
        // Instead, maintain the current selection
        const currentSelection = [...this.selectedIssues];

        // Update status message
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            statusMsg.textContent = 'Click on cards to select/deselect issues. Press ESC or click DONE when finished.';
            statusMsg.style.color = '#1f75cb';
        }

        // Add semi-transparent page overlay
        const pageOverlay = document.createElement('div');
        pageOverlay.id = 'selection-page-overlay';
        pageOverlay.style.position = 'fixed';
        pageOverlay.style.top = '0';
        pageOverlay.style.left = '0';
        pageOverlay.style.width = '100%';
        pageOverlay.style.height = '100%';
        pageOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        pageOverlay.style.zIndex = '998';
        pageOverlay.style.pointerEvents = 'none';
        document.body.appendChild(pageOverlay);

        // Create clickable overlays for each card
        this.createCardOverlays(currentSelection);

        // Add cancel button for clarity
        this.createCancelButton();

        // Update Select Issues button if it exists
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'true';
            selectButton.style.backgroundColor = '#28a745'; // Green when active
            selectButton.textContent = '✓ Selecting...';
        }

        console.log(`Selection mode started with ${currentSelection.length} issues`);
    }

    /**
     * Create cancel button for exiting selection mode
     */
    createCancelButton() {
        const cancelButton = document.createElement('div');
        cancelButton.id = 'selection-cancel-button';
        cancelButton.textContent = 'DONE';
        cancelButton.style.position = 'fixed';
        cancelButton.style.bottom = '20px';
        cancelButton.style.right = '450px'; // Position next to the summary panel
        cancelButton.style.backgroundColor = '#6c757d';
        cancelButton.style.color = 'white';
        cancelButton.style.padding = '10px 20px';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontWeight = 'bold';
        cancelButton.style.zIndex = '999';
        cancelButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        cancelButton.style.transition = 'all 0.2s ease';

        // Hover effect
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.backgroundColor = '#5a6268';
            cancelButton.style.transform = 'translateY(-2px)';
            cancelButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.3)';
        });

        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.backgroundColor = '#6c757d';
            cancelButton.style.transform = 'translateY(0)';
            cancelButton.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.2)';
        });

        // Click handler to exit selection mode
        cancelButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exitSelectionMode();
        });

        document.body.appendChild(cancelButton);
        this.selectionOverlays.push(cancelButton);

        // Also add selection counter
        const selectionCounter = document.createElement('div');
        selectionCounter.id = 'selection-counter';
        selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
        selectionCounter.style.position = 'fixed';
        selectionCounter.style.bottom = '20px';
        selectionCounter.style.left = '20px';
        selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ?
            'rgba(40, 167, 69, 0.8)' : 'rgba(0, 0, 0, 0.7)';
        selectionCounter.style.color = 'white';
        selectionCounter.style.padding = '8px 16px';
        selectionCounter.style.borderRadius = '20px';
        selectionCounter.style.fontSize = '14px';
        selectionCounter.style.zIndex = '999';
        selectionCounter.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';

        document.body.appendChild(selectionCounter);
        this.selectionOverlays.push(selectionCounter);
    }

    /**
     * Create semi-transparent clickable overlays for each card
     * @param {Array} currentSelection - Currently selected issues to maintain
     */
    createCardOverlays(currentSelection = []) {
        console.log('Creating card overlays for selection');
        const boardCards = document.querySelectorAll('.board-card');
        console.log(`Found ${boardCards.length} board cards to overlay`);

        // Clear previous selection state, but remember currently selected issues
        this.selectedIssues = currentSelection || [];
        this.selectedOverlays = [];

        boardCards.forEach((card, index) => {
            try {
                // Get card position and dimensions
                const rect = card.getBoundingClientRect();

                // Create overlay for this card
                const overlay = document.createElement('div');
                overlay.className = 'card-selection-overlay';
                overlay.style.position = 'absolute';
                overlay.style.left = `${rect.left}px`;
                overlay.style.top = `${rect.top}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.border = '2px solid rgba(31, 117, 203, 0.6)';
                overlay.style.borderRadius = '4px';
                overlay.style.zIndex = '999';
                overlay.style.cursor = 'pointer';
                overlay.style.transition = 'background-color 0.2s ease';
                overlay.dataset.cardId = card.id || `card-${Date.now()}-${index}`;
                overlay.dataset.selected = 'false';

                // Store reference to the original card
                overlay.originalCard = card;

                // Get issue data to check if this card was previously selected
                const issueItem = this.getIssueItemFromCard(card);

                if (issueItem) {
                    overlay.dataset.issueId = `${issueItem.iid}-${issueItem.referencePath}`;

                    // If the card's issue is in the currentSelection array, mark it as selected
                    if (currentSelection.some(issue =>
                        issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)) {
                        // This card should be pre-selected
                        overlay.dataset.selected = 'true';
                        overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                        overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                        overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

                        // Add badge number
                        const badgeNumber = this.selectedOverlays.length + 1;
                        const badge = document.createElement('div');
                        badge.className = 'selection-badge';
                        badge.textContent = badgeNumber;
                        badge.style.position = 'absolute';
                        badge.style.top = '-10px';
                        badge.style.right = '-10px';
                        badge.style.width = '20px';
                        badge.style.height = '20px';
                        badge.style.borderRadius = '50%';
                        badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
                        badge.style.color = 'white';
                        badge.style.display = 'flex';
                        badge.style.alignItems = 'center';
                        badge.style.justifyContent = 'center';
                        badge.style.fontWeight = 'bold';
                        badge.style.fontSize = '12px';
                        badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                        overlay.appendChild(badge);

                        // Add to selected overlays
                        this.selectedOverlays.push(overlay);
                    }
                }

                // Hover effect
                overlay.addEventListener('mouseenter', () => {
                    if (overlay.dataset.selected !== 'true') {
                        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.3)';
                        overlay.style.boxShadow = '0 0 8px rgba(31, 117, 203, 0.5)';
                    }
                });

                overlay.addEventListener('mouseleave', () => {
                    if (overlay.dataset.selected !== 'true') {
                        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                        overlay.style.boxShadow = 'none';
                    }
                });

                // Click handler - now toggles selection
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleCardSelection(card, overlay);
                });

                document.body.appendChild(overlay);
                this.selectionOverlays.push(overlay);
            } catch (error) {
                console.error('Error creating overlay for card:', error);
            }
        });

        // Add a help text
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on issues to select/deselect them • Press ESC or click DONE when finished';
        helpText.style.position = 'fixed';
        helpText.style.top = '10px';
        helpText.style.left = '50%';
        helpText.style.transform = 'translateX(-50%)';
        helpText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        helpText.style.color = 'white';
        helpText.style.padding = '8px 16px';
        helpText.style.borderRadius = '20px';
        helpText.style.fontSize = '14px';
        helpText.style.zIndex = '999';
        helpText.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
        document.body.appendChild(helpText);
        this.selectionOverlays.push(helpText);

        // Update initial counter
        this.updateSelectionCounter();

        console.log(`Created ${this.selectionOverlays.length} selection overlays`);
    }

    /**
     * Update selection counter
     */
    updateSelectionCounter() {
        const counter = document.getElementById('selection-counter');
        if (counter) {
            const count = this.selectedIssues.length;
            counter.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;

            // Change color based on selection count
            if (count > 0) {
                counter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
            } else {
                counter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            }
        }

        // Notify listeners of selection change
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this.selectedIssues);
        }

        // Update the selection display in bulk comments view
        this.syncSelectionWithBulkCommentsView();
    }

    /**
     * Get issue item from card using Vue component
     * @param {HTMLElement} boardCard - DOM element representing a board card
     * @returns {Object|null} - Issue item object or null if not found
     */
    getIssueItemFromCard(boardCard) {
        try {
            // Try to access Vue component
            if (boardCard.__vue__) {
                // Check if the card has $children
                if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
                    // Find the issue in the $children array
                    const issueComponent = boardCard.__vue__.$children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }

                // Alternative: try $options.children
                if (boardCard.__vue__.$options &&
                    boardCard.__vue__.$options.children &&
                    boardCard.__vue__.$options.children.length > 0) {

                    // Find the issue component through $options.children
                    const issueComponent = boardCard.__vue__.$options.children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }

                // Alternative: try direct props access
                if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
                    return boardCard.__vue__.$props.item;
                }
            }

            // Last resort: try to find through DOM inspection
            const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
            const titleElement = boardCard.querySelector('.board-card-title');

            if (issueId && titleElement) {
                // Create a minimal issue item with essential properties
                return {
                    iid: issueId,
                    title: titleElement.textContent.trim(),
                    referencePath: window.location.pathname.split('/boards')[0],
                    // Add other necessary properties as needed
                };
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }

        return null;
    }

    /**
     * Toggle card selection state (select/deselect)
     * @param {HTMLElement} card - The original card element
     * @param {HTMLElement} overlay - The selection overlay element
     */
    toggleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;

        // Get issue data from card
        const issueItem = this.getIssueItemFromCard(card);

        if (issueItem) {
            console.log('Toggle selection for issue:', issueItem.iid);

            // Check if already selected
            const isSelected = overlay.dataset.selected === 'true';

            if (isSelected) {
                // Deselect
                overlay.dataset.selected = 'false';
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                overlay.style.boxShadow = 'none';

                // Remove from selected issues
                this.selectedIssues = this.selectedIssues.filter(issue =>
                    !(issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)
                );

                // Remove from selected overlays
                this.selectedOverlays = this.selectedOverlays.filter(o => o !== overlay);

                // Remove badge
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());

                // Renumber badges on remaining selected overlays
                this.renumberBadges();
            } else {
                // Select
                overlay.dataset.selected = 'true';
                overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

                // Add number badge to indicate selection order
                const badgeNumber = this.selectedIssues.length + 1;

                const badge = document.createElement('div');
                badge.className = 'selection-badge';
                badge.textContent = badgeNumber;
                badge.style.position = 'absolute';
                badge.style.top = '-10px';
                badge.style.right = '-10px';
                badge.style.width = '20px';
                badge.style.height = '20px';
                badge.style.borderRadius = '50%';
                badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
                badge.style.color = 'white';
                badge.style.display = 'flex';
                badge.style.alignItems = 'center';
                badge.style.justifyContent = 'center';
                badge.style.fontWeight = 'bold';
                badge.style.fontSize = '12px';
                badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                // Remove existing badge if any
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                overlay.appendChild(badge);

                // Add to selected issues
                this.selectedIssues.push(issueItem);

                // Add to selected overlays
                this.selectedOverlays.push(overlay);
            }

            // Update the selection counter
            this.updateSelectionCounter();
        } else {
            console.error('Failed to get issue item from card');

            // Visual feedback for failure
            overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
            overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';

            setTimeout(() => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
            }, 500);

            // Update status message
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
                statusMsg.style.color = '#dc3545';
            }
        }
    }

    /**
     * Renumber the badges on selected overlays
     */
    renumberBadges() {
        this.selectedOverlays.forEach((overlay, index) => {
            const badge = overlay.querySelector('.selection-badge');
            if (badge) {
                badge.textContent = index + 1;
            }
        });
    }

    /**
     * Exit selection mode and clean up overlays, keeping the current selection
     */
    exitSelectionMode() {
        console.log('Exiting selection mode');
        this.isSelectingIssue = false;

        // Remove page overlay
        document.getElementById('selection-page-overlay')?.remove();

        // Remove all card overlays
        this.selectionOverlays.forEach(overlay => {
            overlay.remove();
        });
        this.selectionOverlays = [];
        this.selectedOverlays = [];

        // We don't clear selectedIssues as we want to keep the current selection

        // Update the Select Issues button if it exists
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'false';
            selectButton.style.backgroundColor = '#6c757d'; // Gray when inactive
            selectButton.textContent = '📎 Select Issues';
        }

        // Ensure selection is synced with bulk comments view
        this.syncSelectionWithBulkCommentsView();

        // Call completion callback if provided
        if (typeof this.onSelectionComplete === 'function') {
            this.onSelectionComplete(this.selectedIssues);
        }

        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            if (this.selectedIssues.length > 0) {
                statusMsg.textContent = `${this.selectedIssues.length} issues selected.`;
                statusMsg.style.color = '#28a745';
                statusMsg.style.backgroundColor = '#f8f9fa';
                statusMsg.style.border = '1px solid #e9ecef';
            } else {
                statusMsg.textContent = 'No issues selected. Click "Select" to choose issues.';
                statusMsg.style.color = '#666';
                statusMsg.style.backgroundColor = '#f8f9fa';
                statusMsg.style.border = '1px solid #e9ecef';
            }
        }
        console.log(`Selection mode exited with ${this.selectedIssues.length} issues selected`);
    }


    toggleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;

        // Get issue data from card
        const issueItem = this.getIssueItemFromCard(card);

        if (issueItem) {
            console.log('Toggle selection for issue:', issueItem.iid);

            // Check if already selected
            const isSelected = overlay.dataset.selected === 'true';

            if (isSelected) {
                // Deselect
                overlay.dataset.selected = 'false';
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                overlay.style.boxShadow = 'none';

                // Remove from selected issues
                this.selectedIssues = this.selectedIssues.filter(issue =>
                    !(issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)
                );

                // Remove from selected overlays
                this.selectedOverlays = this.selectedOverlays.filter(o => o !== overlay);

                // Remove badge
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());

                // Renumber badges on remaining selected overlays
                this.renumberBadges();
            } else {
                // Select
                overlay.dataset.selected = 'true';
                overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

                // Add number badge to indicate selection order
                const badgeNumber = this.selectedIssues.length + 1;

                const badge = document.createElement('div');
                badge.className = 'selection-badge';
                badge.textContent = badgeNumber;
                badge.style.position = 'absolute';
                badge.style.top = '-10px';
                badge.style.right = '-10px';
                badge.style.width = '20px';
                badge.style.height = '20px';
                badge.style.borderRadius = '50%';
                badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
                badge.style.color = 'white';
                badge.style.display = 'flex';
                badge.style.alignItems = 'center';
                badge.style.justifyContent = 'center';
                badge.style.fontWeight = 'bold';
                badge.style.fontSize = '12px';
                badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                // Remove existing badge if any
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                overlay.appendChild(badge);

                // Add to selected issues
                this.selectedIssues.push(issueItem);

                // Add to selected overlays
                this.selectedOverlays.push(overlay);
            }

            // Update the selection counter
            this.updateSelectionCounter();

            // Immediately update the BulkCommentsView UI to keep it in sync
            this.syncSelectionWithBulkCommentsView();
        } else {
            console.error('Failed to get issue item from card');

            // Visual feedback for failure
            overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
            overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';

            setTimeout(() => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
            }, 500);

            // Update status message
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
                statusMsg.style.color = '#dc3545';
            }
        }
    }

    /**
     * Sync selection with BulkComments view
     */
    syncSelectionWithBulkCommentsView() {
        try {
            // Update the selection display
            if (this.uiManager && this.uiManager.bulkCommentsView) {
                this.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.bulkCommentsView) {
                window.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
            } else {
                const bulkCommentsView = document.querySelector('.bulk-comments-view');
                if (bulkCommentsView && bulkCommentsView.__vue__ && bulkCommentsView.__vue__.setSelectedIssues) {
                    bulkCommentsView.__vue__.setSelectedIssues([...this.selectedIssues]);
                } else {
                    console.warn('BulkCommentsView not found for synchronization');
                }
            }
        } catch (error) {
            console.error('Error syncing selection with bulk comments view:', error);
        }
    }
    /**
     * Reposition overlays when window is scrolled or resized
     * Only necessary if selection mode is active for a long time
     */
    repositionOverlays() {
        if (!this.isSelectingIssue) return;

        // Reposition card overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay.className === 'card-selection-overlay' && overlay.originalCard) {
                const card = overlay.originalCard;
                const rect = card.getBoundingClientRect();

                overlay.style.left = `${rect.left}px`;
                overlay.style.top = `${rect.top}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
            }
        });

        // Reposition fixed elements like the done button and counter
        const doneButton = document.getElementById('selection-cancel-button');
        if (doneButton) {
            doneButton.style.bottom = '20px';
            doneButton.style.right = '380px';
        }

        const counter = document.getElementById('selection-counter');
        if (counter) {
            counter.style.bottom = '20px';
            counter.style.left = '20px';
        }
    }

    /**
     * Get currently selected issues
     * @returns {Array} Array of selected issue objects
     */
    getSelectedIssues() {
        return [...this.selectedIssues];
    }

    /**
     * Set selected issues programmatically
     * @param {Array} issues - Array of issue objects
     */
    setSelectedIssues(issues) {
        // Make a defensive copy to prevent reference issues
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];

        // If we're in selection mode, update the visual overlays to match the new selection
        if (this.isSelectingIssue && this.selectionOverlays.length > 0) {
            this.updateOverlaysFromSelection();
        }

        // Update status message if it exists
        const statusEl = document.getElementById('comment-status');
        if (statusEl && !this.isSelectingIssue) { // Only update if not in selection mode
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'No issues selected. Click "Select" to choose issues.';
                statusEl.style.color = '#666';
            }
        }

        // Ensure other components are updated
        this.syncSelectionWithBulkCommentsView();

        // Log for debugging
        console.log(`IssueSelector: Set ${this.selectedIssues.length} selected issues`);
    }
    updateOverlaysFromSelection() {
        if (!this.isSelectingIssue) return;

        try {
            // Reset all card overlays to unselected state
            const cardOverlays = this.selectionOverlays.filter(o => o.className === 'card-selection-overlay');

            cardOverlays.forEach(overlay => {
                if (overlay.dataset && overlay.originalCard) {
                    // Set to unselected state
                    overlay.dataset.selected = 'false';
                    overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                    overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                    overlay.style.boxShadow = 'none';

                    // Remove any existing badges
                    overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                }
            });

            // Clear selected overlays
            this.selectedOverlays = [];

            // Now go through selected issues and update corresponding overlays
            this.selectedIssues.forEach((issue, index) => {
                if (!issue) return;

                // Find the corresponding overlay for this issue
                const matchingOverlay = cardOverlays.find(overlay => {
                    if (!overlay.dataset || !overlay.dataset.issueId) return false;
                    return overlay.dataset.issueId === `${issue.iid}-${issue.referencePath}`;
                });

                if (matchingOverlay) {
                    // Mark as selected
                    matchingOverlay.dataset.selected = 'true';
                    matchingOverlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                    matchingOverlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                    matchingOverlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

                    // Add badge with selection order
                    const badgeNumber = index + 1;
                    const badge = document.createElement('div');
                    badge.className = 'selection-badge';
                    badge.textContent = badgeNumber;
                    badge.style.position = 'absolute';
                    badge.style.top = '-10px';
                    badge.style.right = '-10px';
                    badge.style.width = '20px';
                    badge.style.height = '20px';
                    badge.style.borderRadius = '50%';
                    badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
                    badge.style.color = 'white';
                    badge.style.display = 'flex';
                    badge.style.alignItems = 'center';
                    badge.style.justifyContent = 'center';
                    badge.style.fontWeight = 'bold';
                    badge.style.fontSize = '12px';
                    badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';

                    matchingOverlay.appendChild(badge);

                    // Add to selected overlays
                    this.selectedOverlays.push(matchingOverlay);
                }
            });

            // Update the selection counter
            this.updateSelectionCounter();
        } catch (error) {
            console.error('Error updating overlays from selection:', error);
        }
    }
    /**
     * Clear selected issues
     */
    clearSelection() {
        this.selectedIssues = [];

        // Update the UI in bulk comments view
        this.syncSelectionWithBulkCommentsView();

        // Notify listeners of selection change
        if (this.onSelectionChange) {
            this.onSelectionChange(this.selectedIssues);
        }
    }
}

// File: lib/ui/managers/TabManager.js
// TabManager.js - Manages tab switching and tab UI
/**
 * Manager for tab switching and tab UI
 */
window.TabManager = class TabManager {
    /**
     * Constructor for TabManager
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.tabContainer = null;
        this.tabs = {};
        this.contentAreas = {};

        // Get last active tab or default to 'summary'
        try {
            this.currentTab = getLastActiveTab() || 'summary';
        } catch (e) {
            console.warn('Error loading last active tab:', e);
            this.currentTab = 'summary';
        }

        console.log('Initial active tab:', this.currentTab);
    }

    /**
     * Initialize the tab navigation
     * @param {HTMLElement} parentElement - Element to append tabs to
     */
    initialize(parentElement) {
        // Create tab container
        this.tabContainer = document.createElement('div');
        this.tabContainer.style.display = 'flex';
        this.tabContainer.style.marginBottom = '10px';
        this.tabContainer.style.borderBottom = '1px solid #ddd';

        // Create tabs
        this.createTab('summary', 'Summary', this.currentTab === 'summary');
        this.createTab('boards', 'Boards', this.currentTab === 'boards');
        this.createTab('history', 'History', this.currentTab === 'history');
        this.createTab('bulkcomments', 'Bulk Comments', this.currentTab === 'bulkcomments'); // Renamed from "API" to "Bulk Comments"

        // Append tab container to parent
        parentElement.appendChild(this.tabContainer);

        // Create content areas for each tab
        this.createContentAreas(parentElement);
    }

    /**
     * Create a tab element
     * @param {string} id - Tab identifier
     * @param {string} label - Tab display label
     * @param {boolean} isActive - Whether tab is initially active
     */
    createTab(id, label, isActive = false) {
        const tab = document.createElement('div');
        tab.textContent = label;
        tab.dataset.tab = id;
        tab.style.padding = '5px 10px';
        tab.style.cursor = 'pointer';

        if (isActive) {
            tab.style.borderBottom = '2px solid #1f75cb';
            tab.style.fontWeight = 'bold';
            this.currentTab = id;
        }

        tab.addEventListener('click', () => {
            this.switchToTab(id);
        });

        this.tabs[id] = tab;
        this.tabContainer.appendChild(tab);
    }

    /**
     * Create content areas for each tab
     * @param {HTMLElement} parentElement - Element to append content areas to
     */
    createContentAreas(parentElement) {
        // Summary tab content
        const summaryContent = document.createElement('div');
        summaryContent.id = 'assignee-time-summary-content';
        summaryContent.style.display = this.currentTab === 'summary' ? 'block' : 'none';
        summaryContent.style.position = 'relative'; // Explicitly set position relative
        summaryContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(summaryContent);
        this.contentAreas['summary'] = summaryContent;

        // Add loading screen to summary tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(summaryContent, 'summary-tab', 'Loading summary data...');
        }

        // Boards tab content
        const boardsContent = document.createElement('div');
        boardsContent.id = 'boards-time-summary-content';
        boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
        boardsContent.style.position = 'relative'; // Explicitly set position relative
        boardsContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(boardsContent);
        this.contentAreas['boards'] = boardsContent;

        // Add loading screen to boards tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(boardsContent, 'boards-tab', 'Loading board data...');
        }

        // History tab content
        const historyContent = document.createElement('div');
        historyContent.id = 'history-time-summary-content';
        historyContent.style.display = this.currentTab === 'history' ? 'block' : 'none';
        historyContent.style.position = 'relative'; // Explicitly set position relative
        historyContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(historyContent);
        this.contentAreas['history'] = historyContent;

        // Add loading screen to history tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(historyContent, 'history-tab', 'Loading history data...');
        }

        // Bulk Comments tab content (renamed from API)
        const bulkCommentsContent = document.createElement('div');
        bulkCommentsContent.id = 'bulk-comments-content';
        bulkCommentsContent.style.display = this.currentTab === 'bulkcomments' ? 'block' : 'none';
        bulkCommentsContent.style.position = 'relative'; // Explicitly set position relative
        bulkCommentsContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(bulkCommentsContent);
        this.contentAreas['bulkcomments'] = bulkCommentsContent;

        // Add loading screen to bulk comments tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
        }
    }

    /**
     * Switch to a specific tab
     * @param {string} tabId - ID of tab to switch to
     */
    switchToTab(tabId) {
        // Reset all tabs
        Object.keys(this.tabs).forEach(id => {
            this.tabs[id].style.borderBottom = 'none';
            this.tabs[id].style.fontWeight = 'normal';
            this.contentAreas[id].style.display = 'none';
        });

        // Activate the selected tab
        this.tabs[tabId].style.borderBottom = '2px solid #1f75cb';
        this.tabs[tabId].style.fontWeight = 'bold';
        this.contentAreas[tabId].style.display = 'block';

        // Store the current tab
        this.currentTab = tabId;
        try {
            // Add error handling for saving the tab
            saveLastActiveTab(tabId);
        } catch(e) {
            console.warn('Error saving tab selection:', e);
        }

        // Initialize tab content if needed
        if (tabId === 'history' && typeof window.renderHistory === 'function') {
            window.renderHistory(); // Call external renderHistory function

            // Remove loading screen if exists
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('history-tab');
            }
        } else if (tabId === 'bulkcomments' && this.uiManager.bulkCommentsView) {
            this.uiManager.bulkCommentsView.render();

            // Remove loading screen if exists
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
        }
    }

    /**
     * Get the content element for a specific tab
     * @param {string} tabId - ID of the tab
     * @returns {HTMLElement} Content area element
     */
    getContentArea(tabId) {
        return this.contentAreas[tabId];
    }

    /**
     * Get the current active tab ID
     * @returns {string} Active tab ID
     */
    getCurrentTab() {
        return this.currentTab;
    }
}

// File: lib/ui/managers/CommandManager.js
// CommandManager.js - Handles GitLab commands and shortcuts
/**
 * Manager for GitLab commands and shortcuts
 */
window.CommandManager = class CommandManager {
    /**
     * Constructor for CommandManager
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.targetElement - Target textarea element
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Object} options.labelManager - Label manager instance
     * @param {Function} options.onCommandInsert - Callback when command is inserted
     */
    constructor(options = {}) {
        this.targetElement = options.targetElement;
        this.gitlabApi = options.gitlabApi;
        this.labelManager = options.labelManager;
        this.onCommandInsert = options.onCommandInsert || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Load assignee whitelist from storage
        this.assigneeWhitelist = getAssigneeWhitelist();

        // Initialize shortcuts container
        this.shortcutContainer = null;
        this.commandShortcut = null;
    }

    /**
     * Initialize the command shortcuts UI
     * @param {HTMLElement} container - Container to add shortcuts to
     */
    initialize(container) {
        this.shortcutContainer = container;

        // Create command shortcut instance
        this.commandShortcut = new CommandShortcut({
            targetElement: this.targetElement,
            onShortcutInsert: (type, value) => {
                // Handle shortcut insertion
                console.log(`Shortcut inserted: ${type} with value ${value}`);

                // Call callback if provided
                if (typeof this.onCommandInsert === 'function') {
                    this.onCommandInsert(type, value);
                }
            }
        });

        // Initialize shortcuts
        this.commandShortcut.initialize(container);

        // Add custom shortcuts beyond the default estimate shortcut
        this.addCustomShortcuts();
    }

    /**
     * Add custom shortcuts beyond the default estimate shortcut
     */
    addCustomShortcuts() {
        if (!this.commandShortcut) return;

        // Add milestone shortcut
        this.addMilestoneShortcut();

        // Add assign shortcut
        this.addAssignShortcut();

        // Add due date shortcut
        this.addDueDateShortcut();

        // Add weight shortcut
        this.addWeightShortcut();
    }

    /**
     * Add milestone shortcut
     */
    addMilestoneShortcut() {
        this.commandShortcut.addCustomShortcut({
            type: 'milestone',
            label: '/milestone',
            items: [
                { value: '', label: 'Set Milestone' },
                { value: '%current', label: 'Current Sprint' },
                { value: '%next', label: 'Next Sprint' },
                { value: '%upcoming', label: 'Upcoming' },
                { value: '%backlog', label: 'Backlog' },
                { value: 'none', label: 'Remove Milestone' }
            ],
            onSelect: (value) => {
                // Get the textarea
                if (!this.targetElement) return;

                // Format milestone text based on value
                let milestoneText = '/milestone ';
                if (value === 'none') {
                    milestoneText += '%""';
                } else if (value.startsWith('%')) {
                    milestoneText += value;
                } else {
                    milestoneText += `%"${value}"`;
                }

                // Check if there's already a milestone command
                const milestoneRegex = /\/milestone\s+%[^\n]+/g;

                this.replaceOrInsertCommand(
                    'milestone',
                    milestoneText,
                    milestoneRegex,
                    () => this.insertTextAtCursor(milestoneText)
                );

                // Show notification
                this.notification.info(`Milestone command added: ${value}`);
            }
        });
    }

    /**
     * Add assign shortcut with whitelist support
     */
    /**
     * Add assign shortcut
     */
    addAssignShortcut() {
        if (!this.commandShortcuts) return;

        try {
            // Start with basic assign items
            let assignItems = [
                { value: '', label: 'Assign to...' },
                { value: '@me', label: 'Myself' },
                { value: 'none', label: 'Unassign' }
            ];

            // Try to add whitelisted assignees if available
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    const whitelistedAssignees = this.assigneeManager.getAssigneeWhitelist();
                    console.log('Loaded assignees from manager:', whitelistedAssignees);

                    if (Array.isArray(whitelistedAssignees) && whitelistedAssignees.length > 0) {
                        // Add a separator
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

                        // Add whitelisted assignees
                        const whitelistItems = whitelistedAssignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                } catch (e) {
                    console.error('Error getting assignee whitelist from manager:', e);

                    // Fallback to direct storage access
                    try {
                        const assignees = getAssigneeWhitelist();
                        console.log('Fallback loaded assignees:', assignees);

                        if (Array.isArray(assignees) && assignees.length > 0) {
                            // Add a separator
                            assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

                            // Add whitelisted assignees
                            const whitelistItems = assignees.map(assignee => ({
                                value: assignee.username,
                                label: assignee.name || assignee.username
                            }));

                            assignItems = assignItems.concat(whitelistItems);
                        }
                    } catch (storageError) {
                        console.error('Error accessing assignee whitelist from storage:', storageError);
                    }
                }
            } else {
                // Direct access to storage if manager not available
                try {
                    // Import the storage function if not already available
                    let assignees = [];
                    if (typeof getAssigneeWhitelist === 'function') {
                        assignees = getAssigneeWhitelist();
                    } else if (window.getAssigneeWhitelist) {
                        assignees = window.getAssigneeWhitelist();
                    } else {
                        console.warn('getAssigneeWhitelist function not available, no assignees will be loaded');
                    }

                    console.log('Direct loaded assignees:', assignees);

                    if (Array.isArray(assignees) && assignees.length > 0) {
                        // Add a separator
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

                        // Add whitelisted assignees
                        const whitelistItems = assignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                } catch (directError) {
                    console.error('Error directly accessing assignee whitelist:', directError);
                }
            }

            // Try to fetch group members in the background
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        // Add a separator if we have members
                        assignItems.push({ value: 'separator2', label: '────── Group Members ──────' });

                        // Add group members
                        const memberItems = members.map(member => ({
                            value: member.username,
                            label: member.name || member.username
                        }));

                        assignItems = assignItems.concat(memberItems);

                        // Update the shortcut with all the items
                        this.updateAssignShortcut(assignItems);
                    }
                })
                .catch(error => {
                    console.error('Error fetching group members:', error);
                });

            // Add custom option at the end
            assignItems.push({ value: 'custom', label: 'Custom...' });
            // Add option to manage assignees
            assignItems.push({ value: 'manage', label: '✏️ Manage Assignees...' });

            // Update shortcut with these items
            this.updateAssignShortcut(assignItems);
        } catch (e) {
            console.error('Error adding assign shortcut:', e);
        }
    }

    /**
     * Add due date shortcut
     */
    addDueDateShortcut() {
        // Calculate some common dates
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // Format the dates
        const formatDate = (date) => {
            return date.toISOString().substring(0, 10); // YYYY-MM-DD
        };

        this.commandShortcut.addCustomShortcut({
            type: 'due',
            label: '/due',
            items: [
                { value: '', label: 'Set Due Date' },
                { value: formatDate(today), label: 'Today' },
                { value: formatDate(tomorrow), label: 'Tomorrow' },
                { value: formatDate(nextWeek), label: 'Next Week' },
                { value: formatDate(nextMonth), label: 'Next Month' },
                { value: 'custom', label: 'Custom Date...' },
                { value: 'none', label: 'Remove Due Date' }
            ],
            onSelect: (value) => {
                if (!this.targetElement) return;

                // Handle custom date input
                if (value === 'custom') {
                    const customDate = prompt('Enter due date (YYYY-MM-DD):', formatDate(today));

                    if (!customDate) return;

                    // Validate date format
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
                        this.notification.error('Invalid date format. Please use YYYY-MM-DD');
                        return;
                    }

                    value = customDate;
                }

                // Create the due date command
                let dueText = '/due ';

                if (value === 'none') {
                    dueText += 'none';
                } else {
                    dueText += value;
                }

                // Check if there's already a due date command
                const dueRegex = /\/due\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'due',
                    dueText,
                    dueRegex,
                    () => this.insertTextAtCursor(dueText)
                );

                // Show notification
                if (value === 'none') {
                    this.notification.info('Due date will be removed');
                } else {
                    this.notification.info(`Due date set to ${value}`);
                }
            }
        });
    }

    /**
     * Add weight shortcut
     */
    addWeightShortcut() {
        this.commandShortcut.addCustomShortcut({
            type: 'weight',
            label: '/weight',
            items: [
                { value: '', label: 'Set Weight' },
                { value: '1', label: '1 (Trivial)' },
                { value: '2', label: '2 (Small)' },
                { value: '3', label: '3 (Medium)' },
                { value: '5', label: '5 (Large)' },
                { value: '8', label: '8 (Very Large)' },
                { value: 'custom', label: 'Custom Weight...' },
                { value: 'none', label: 'Remove Weight' }
            ],
            onSelect: (value) => {
                if (!this.targetElement) return;

                // Handle custom weight input
                if (value === 'custom') {
                    const customWeight = prompt('Enter weight (number):', '');

                    if (!customWeight) return;

                    // Validate weight
                    const weight = parseInt(customWeight, 10);
                    if (isNaN(weight) || weight < 0) {
                        this.notification.error('Invalid weight. Please enter a positive number');
                        return;
                    }

                    value = customWeight;
                }

                // Create the weight command
                let weightText = '/weight ';

                if (value === 'none') {
                    weightText += 'none';
                } else {
                    weightText += value;
                }

                // Check if there's already a weight command
                const weightRegex = /\/weight\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'weight',
                    weightText,
                    weightRegex,
                    () => this.insertTextAtCursor(weightText)
                );

                // Show notification
                if (value === 'none') {
                    this.notification.info('Weight will be removed');
                } else {
                    this.notification.info(`Weight set to ${value}`);
                }
            }
        });
    }

    /**
     * Open assignee whitelist manager dialog
     */
    openAssigneeManager() {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'assignee-manager-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '500px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Manage Assignees';
        modalTitle.style.margin = '0';

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.onclick = () => modalOverlay.remove();

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);

        // Create assignee list section
        const assigneeSection = document.createElement('div');

        // Create description
        const description = document.createElement('p');
        description.textContent = 'Add usernames to quickly assign issues. These will appear in your /assign dropdown.';
        description.style.marginBottom = '15px';

        // Create current assignee list
        const assigneeList = document.createElement('div');
        assigneeList.style.marginBottom = '15px';
        assigneeList.style.maxHeight = '200px';
        assigneeList.style.overflowY = 'auto';

        // Helper function to create empty message when list is empty
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.padding = '10px 0';
            return emptyMessage;
        };

        // Create assignee items
        this.assigneeWhitelist.forEach((assignee, index) => {
            const assigneeItem = document.createElement('div');
            assigneeItem.style.display = 'flex';
            assigneeItem.style.justifyContent = 'space-between';
            assigneeItem.style.alignItems = 'center';
            assigneeItem.style.padding = '8px';
            assigneeItem.style.borderBottom = '1px solid #eee';

            const assigneeInfo = document.createElement('div');
            assigneeInfo.style.display = 'flex';
            assigneeInfo.style.alignItems = 'center';

            const assigneeName = document.createElement('div');
            assigneeName.textContent = assignee.name || assignee.username;
            assigneeName.style.fontWeight = 'bold';
            assigneeName.style.marginRight = '5px';

            const assigneeUsername = document.createElement('div');
            assigneeUsername.textContent = `@${assignee.username}`;
            assigneeUsername.style.color = '#666';
            assigneeUsername.style.fontSize = '13px';

            assigneeInfo.appendChild(assigneeName);
            assigneeInfo.appendChild(assigneeUsername);

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.style.padding = '3px 8px';
            removeButton.style.backgroundColor = '#dc3545';
            removeButton.style.color = 'white';
            removeButton.style.border = 'none';
            removeButton.style.borderRadius = '3px';
            removeButton.style.cursor = 'pointer';
            removeButton.onclick = () => {
                this.assigneeWhitelist.splice(index, 1);
                saveAssigneeWhitelist(this.assigneeWhitelist);
                assigneeItem.remove();

                // Show empty message if no assignees left
                if (this.assigneeWhitelist.length === 0) {
                    assigneeList.appendChild(createEmptyMessage());
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);
        });

        // Show empty message if no assignees
        if (this.assigneeWhitelist.length === 0) {
            assigneeList.appendChild(createEmptyMessage());
        }

        // Create add assignee form
        const addForm = document.createElement('div');
        addForm.style.marginTop = '20px';
        addForm.style.marginBottom = '20px';
        addForm.style.padding = '15px';
        addForm.style.backgroundColor = '#f8f9fa';
        addForm.style.borderRadius = '4px';

        const formTitle = document.createElement('div');
        formTitle.textContent = 'Add New Assignee';
        formTitle.style.fontWeight = 'bold';
        formTitle.style.marginBottom = '10px';

        // Create form fields
        const nameContainer = document.createElement('div');
        nameContainer.style.marginBottom = '10px';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Display Name:';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '5px';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'John Doe';
        nameInput.style.width = '100%';
        nameInput.style.padding = '8px';
        nameInput.style.borderRadius = '4px';
        nameInput.style.border = '1px solid #ccc';

        nameContainer.appendChild(nameLabel);
        nameContainer.appendChild(nameInput);

        const usernameContainer = document.createElement('div');
        usernameContainer.style.marginBottom = '15px';

        const usernameLabel = document.createElement('label');
        usernameLabel.textContent = 'GitLab Username:';
        usernameLabel.style.display = 'block';
        usernameLabel.style.marginBottom = '5px';

        const usernameInput = document.createElement('input');
        usernameInput.type = 'text';
        usernameInput.placeholder = 'username (without @)';
        usernameInput.style.width = '100%';
        usernameInput.style.padding = '8px';
        usernameInput.style.borderRadius = '4px';
        usernameInput.style.border = '1px solid #ccc';

        usernameContainer.appendChild(usernameLabel);
        usernameContainer.appendChild(usernameInput);

        // Add button
        const addButton = document.createElement('button');
        addButton.textContent = 'Add Assignee';
        addButton.style.padding = '8px 16px';
        addButton.style.backgroundColor = '#28a745';
        addButton.style.color = 'white';
        addButton.style.border = 'none';
        addButton.style.borderRadius = '4px';
        addButton.style.cursor = 'pointer';
        addButton.onclick = () => {
            const name = nameInput.value.trim();
            const username = usernameInput.value.trim();

            if (!username) {
                alert('Username is required');
                return;
            }

            // Add to whitelist
            const newAssignee = {
                name: name || username, // Use name if provided, otherwise use username
                username: username
            };

            // Check if already exists
            const existingIndex = this.assigneeWhitelist.findIndex(a => a.username === username);
            if (existingIndex >= 0) {
                // Update existing
                this.assigneeWhitelist[existingIndex] = newAssignee;
            } else {
                // Add new
                this.assigneeWhitelist.push(newAssignee);
            }

            // Save whitelist
            saveAssigneeWhitelist(this.assigneeWhitelist);

            // Remove empty message if it exists
            const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // Create new assignee item and add to list
            const assigneeItem = document.createElement('div');
            assigneeItem.style.display = 'flex';
            assigneeItem.style.justifyContent = 'space-between';
            assigneeItem.style.alignItems = 'center';
            assigneeItem.style.padding = '8px';
            assigneeItem.style.borderBottom = '1px solid #eee';

            const assigneeInfo = document.createElement('div');
            assigneeInfo.style.display = 'flex';
            assigneeInfo.style.alignItems = 'center';

            const assigneeName = document.createElement('div');
            assigneeName.textContent = newAssignee.name;
            assigneeName.style.fontWeight = 'bold';
            assigneeName.style.marginRight = '5px';

            const assigneeUsername = document.createElement('div');
            assigneeUsername.textContent = `@${newAssignee.username}`;
            assigneeUsername.style.color = '#666';
            assigneeUsername.style.fontSize = '13px';

            assigneeInfo.appendChild(assigneeName);
            assigneeInfo.appendChild(assigneeUsername);

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.style.padding = '3px 8px';
            removeButton.style.backgroundColor = '#dc3545';
            removeButton.style.color = 'white';
            removeButton.style.border = 'none';
            removeButton.style.borderRadius = '3px';
            removeButton.style.cursor = 'pointer';
            removeButton.onclick = () => {
                const index = this.assigneeWhitelist.findIndex(a => a.username === newAssignee.username);
                if (index >= 0) {
                    this.assigneeWhitelist.splice(index, 1);
                    saveAssigneeWhitelist(this.assigneeWhitelist);
                    assigneeItem.remove();

                    // Show empty message if no assignees left
                    if (this.assigneeWhitelist.length === 0) {
                        assigneeList.appendChild(createEmptyMessage());
                    }
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);

            // Clear inputs
            nameInput.value = '';
            usernameInput.value = '';

            // Show notification
            this.notification.success(`Added assignee: ${newAssignee.name}`);
        };

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(addButton);

        // Add save and close button
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Close';
        saveButton.style.padding = '8px 16px';
        saveButton.style.backgroundColor = '#6c757d';
        saveButton.style.color = 'white';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '4px';
        saveButton.style.cursor = 'pointer';
        saveButton.style.marginTop = '10px';
        saveButton.onclick = () => {
            // Close modal and refresh the UI to show new assignees
            modalOverlay.remove();

            // Update the assign shortcut with new whitelist
            this.addAssignShortcut();
        };

        // Add all components to the modal
        assigneeSection.appendChild(description);
        assigneeSection.appendChild(assigneeList);
        assigneeSection.appendChild(addForm);
        assigneeSection.appendChild(saveButton);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(assigneeSection);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();

                // Update the assign shortcut with new whitelist
                this.addAssignShortcut();
            }
        });
    }

    /**
     * Insert text at cursor position in textarea
     * @param {string} text - Text to insert
     */
    insertTextAtCursor(text) {
        if (!this.targetElement) return;

        const startPos = this.targetElement.selectionStart;
        const endPos = this.targetElement.selectionEnd;
        const currentText = this.targetElement.value;

        // Add newline if needed
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }

        // Insert text at cursor position
        this.targetElement.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);

        // Set cursor position after inserted text
        const newCursorPos = startPos + insertText.length;
        this.targetElement.setSelectionRange(newCursorPos, newCursorPos);

        // Focus the textarea
        this.targetElement.focus();
    }

    /**
     * Apply replacement logic for command types
     * @param {string} type - Type of shortcut (e.g., 'label', 'milestone')
     * @param {string} command - The command to insert (e.g., '/label ~bug')
     * @param {RegExp} regex - Regular expression to match existing commands
     * @param {Function} insertFn - Function to handle the insertion if no existing command
     */
    replaceOrInsertCommand(type, command, regex, insertFn) {
        if (!this.targetElement) return;

        // Get current text
        const currentText = this.targetElement.value;

        // Check if there's already a command of this type
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            const newText = currentText.replace(regex, command);
            this.targetElement.value = newText;

            // Set focus back to textarea
            this.targetElement.focus();
        } else {
            // Execute the provided insertion function
            insertFn();
        }

        // Call the callback if provided
        if (typeof this.onCommandInsert === 'function') {
            this.onCommandInsert(type, command);
        }
    }
}

// File: lib/ui/managers/LabelManager.js
// LabelManager.js - Handles fetching and filtering labels
/**
 * Manager for GitLab labels
 */
window.LabelManager = class LabelManager {
    /**
     * Constructor for LabelManager
     * @param {Object} options - Configuration options
     * @param {Function} options.onLabelsLoaded - Callback when labels are loaded
     * @param {GitLabAPI} options.gitlabApi - GitLab API instance
     */
    constructor(options = {}) {
        // Try to get gitlabApi from options or from window global
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.onLabelsLoaded = options.onLabelsLoaded || null;

        // Initialize with empty whitelist
        this.labelWhitelist = [];

        // Try to load saved whitelist, with error handling
        try {
            this.labelWhitelist = getLabelWhitelist();
            // Ensure it's an array
            if (!Array.isArray(this.labelWhitelist)) {
                console.warn("Loaded whitelist is not an array, using default");
                this.labelWhitelist = this.getDefaultWhitelist();
            }
        } catch (e) {
            console.warn("Error loading label whitelist, using default", e);
            this.labelWhitelist = this.getDefaultWhitelist();
        }

        // Initialize storage for fetched labels
        this.availableLabels = [];
        this.filteredLabels = [];
        this.isLoading = false;
    }

    /**
     * Get default whitelist values
     * @returns {Array} Default whitelist array
     */
    getDefaultWhitelist() {
        return [
            'bug', 'feature', 'documentation', 'enhancement', 'security',
            'priority', 'high', 'medium', 'low', 'critical',
            'frontend', 'backend', 'ui', 'ux', 'api',
            'wontfix', 'duplicate', 'invalid', 'question',
            'ready', 'in progress', 'review', 'blocked'
        ];
    }

    /**
     * Save whitelist to storage
     * @param {Array} whitelist - Array of whitelist terms
     */
    saveWhitelist(whitelist) {
        // Ensure whitelist is an array
        if (!Array.isArray(whitelist)) {
            whitelist = [];
        }
        this.labelWhitelist = whitelist;

        try {
            saveLabelWhitelist(whitelist);
        } catch (e) {
            console.error("Error saving label whitelist", e);
        }

        // Re-filter labels with new whitelist
        this.filterLabels();
    }

    /**
     * Reset whitelist to default values
     */
    resetToDefaultWhitelist() {
        try {
            this.labelWhitelist = this.getDefaultWhitelist();
            saveLabelWhitelist(this.labelWhitelist);
        } catch (e) {
            console.error("Error resetting label whitelist", e);
        }

        // Re-filter labels with default whitelist
        this.filterLabels();

        return this.labelWhitelist;
    }

    /**
     * Check if a label matches the whitelist
     * @param {string} labelName - Label name to check
     * @param {Array} whitelist - Whitelist to check against (optional)
     * @returns {boolean} True if label matches whitelist
     */
    isLabelInWhitelist(labelName, whitelist = null) {
        // Use provided whitelist or instance whitelist
        const whitelistToUse = whitelist || this.labelWhitelist;

        // Ensure we have a valid whitelist and label name
        if (!Array.isArray(whitelistToUse) || typeof labelName !== 'string') {
            return false;
        }

        const lowerName = labelName.toLowerCase();
        return whitelistToUse.some(term => {
            // Ensure term is a string
            if (typeof term !== 'string') return false;
            return lowerName.includes(term.toLowerCase());
        });
    }


    /**
     * Filter labels based on current whitelist
     */
    filterLabels() {
        if (!this.availableLabels || this.availableLabels.length === 0) {
            this.filteredLabels = [];
            return;
        }

        // Filter labels using whitelist
        this.filteredLabels = this.availableLabels.filter(label => {
            // Ensure the label has a name property
            if (!label || typeof label.name !== 'string') return false;
            return this.isLabelInWhitelist(label.name);
        });

        // Sort labels alphabetically
        this.filteredLabels.sort((a, b) => a.name.localeCompare(b.name));

        // Notify callback if provided
        if (typeof this.onLabelsLoaded === 'function') {
            this.onLabelsLoaded(this.filteredLabels);
        }
    }

    /**
     * Fetch all labels from GitLab API
     * @returns {Promise<Array>} Promise resolving to array of labels
     */
    async fetchAllLabels() {
        try {
            this.isLoading = true;

            // Check if GitLab API instance is available
            // If not, try to get it from the window object as a last resort
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                console.warn('GitLab API instance not available, using fallback labels');
                this.isLoading = false;
                return this.addFallbackLabels();
            }

            // Get path info (project or group)
            const pathInfo = getPathFromUrl();

            if (!pathInfo || !pathInfo.apiUrl) {
                console.warn('Path info not found or invalid, returning fallback labels');
                this.isLoading = false;
                return this.addFallbackLabels();
            }

            // Fetch labels from API using the correct endpoint
            try {
                const labels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                    params: { per_page: 100 }
                });

                // Validate received labels
                if (!Array.isArray(labels)) {
                    console.warn('API did not return an array of labels, using fallback');
                    this.isLoading = false;
                    return this.addFallbackLabels();
                }

                this.availableLabels = labels;
                this.filterLabels();

                this.isLoading = false;
                return this.filteredLabels;
            } catch (apiError) {
                console.error(`Error fetching ${pathInfo.type} labels from API:`, apiError);
                this.isLoading = false;
                return this.addFallbackLabels();
            }
        } catch (error) {
            console.error('Error in fetchAllLabels:', error);
            this.isLoading = false;
            return this.addFallbackLabels();
        }
    }

    /**
     * Add fallback labels when API fails
     * @returns {Array} Array of fallback labels
     */
    addFallbackLabels() {
        // Create basic fallback labels
        const fallbackLabels = [
            { name: 'bug', color: '#ff0000' },
            { name: 'feature', color: '#1f75cb' },
            { name: 'enhancement', color: '#7057ff' },
            { name: 'documentation', color: '#0075ca' },
            { name: 'priority', color: '#d73a4a' },
            { name: 'blocked', color: '#b60205' }
        ];

        // Set as available labels
        this.availableLabels = fallbackLabels;

        // Filter and sort (even with fallbacks, respect whitelist)
        this.filterLabels();

        // Notify callback if provided
        if (typeof this.onLabelsLoaded === 'function') {
            this.onLabelsLoaded(this.filteredLabels);
        }

        return this.filteredLabels;
    }

    /**
     * Get labels for dropdown
     * @param {boolean} includeEmpty - Whether to include empty option
     * @returns {Array} Array of label options for dropdown
     */
    getLabelOptions(includeEmpty = true) {
        // Check if we have filteredLabels
        if (!this.filteredLabels || this.filteredLabels.length === 0) {
            // Return basic options if no filtered labels
            const basicOptions = [];
            if (includeEmpty) {
                basicOptions.push({ value: '', label: 'Add Label' });
            }
            return basicOptions.concat([
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' },
                { value: 'enhancement', label: 'Enhancement' },
                { value: 'custom', label: 'Custom...' }
            ]);
        }

        // Map to format needed for dropdown
        const labelOptions = this.filteredLabels.map(label => ({
            value: label.name,
            label: label.name,
            color: label.color
        }));

        // Add empty option at the beginning if requested
        if (includeEmpty) {
            labelOptions.unshift({ value: '', label: 'Add Label' });
        }

        // Add custom option at the end
        labelOptions.push({ value: 'custom', label: 'Custom...' });

        return labelOptions;
    }

    /**
     * Create a styled label element for dropdowns
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createStyledLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.label || label.name || '';

        // Use provided color or generate one based on name
        const labelText = label.label || label.name || 'label';
        const bgColor = label.color || generateColorFromString(labelText);

        // Calculate text color (black or white) based on background color brightness
        const textColor = getContrastColor(bgColor);

        // Apply GitLab label styles
        labelElement.style.backgroundColor = bgColor;
        labelElement.style.color = textColor;
        labelElement.style.padding = '4px 8px';
        labelElement.style.borderRadius = '100px'; // Rounded pill shape
        labelElement.style.fontSize = '12px';
        labelElement.style.fontWeight = '500';
        labelElement.style.display = 'inline-block';
        labelElement.style.margin = '2px';
        labelElement.style.maxWidth = '100%';
        labelElement.style.overflow = 'hidden';
        labelElement.style.textOverflow = 'ellipsis';
        labelElement.style.whiteSpace = 'nowrap';

        return labelElement;
    }

    /**
     * Add label command to textarea
     * @param {HTMLElement} textarea - Textarea element to insert command into
     * @param {string} labelName - Label name to add
     */
    insertLabelCommand(textarea, labelName) {
        if (!textarea || typeof labelName !== 'string') return;

        // Create the label command
        const labelText = `/label ~"${labelName}"`;

        // Check if there's already a label command
        const labelRegex = /\/label\s+~[^\n]+/g;

        // Get current text
        const currentText = textarea.value;

        // Check if there's already a label command
        const hasCommand = labelRegex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            textarea.value = currentText.replace(labelRegex, labelText);
        } else {
            // Insert new command at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Check if we need to add a new line before the command
            let insertText = labelText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text at cursor position
            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Set cursor position after inserted text
            const newCursorPos = startPos + insertText.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }

        // Set focus back to textarea
        textarea.focus();
    }

    /**
     * Initialize label dropdown with fetch and render
     * @param {Function} createDropdown - Function to create dropdown with options
     * @param {Object} dropdownOptions - Additional options for dropdown
     * @returns {Object} Created dropdown instance
     */
    async initLabelDropdown(createDropdown, dropdownOptions = {}) {
        // Start with empty dropdown
        const dropdown = createDropdown({
            items: [{ value: '', label: 'Loading labels...' }],
            disabled: true,
            ...dropdownOptions
        });

        // Fetch and populate labels
        try {
            await this.fetchAllLabels();

            // Update dropdown with actual labels
            dropdown.updateItems(this.getLabelOptions());
            dropdown.enable();
        } catch (error) {
            console.error('Error initializing label dropdown:', error);

            // Update with error state
            dropdown.updateItems([
                { value: '', label: 'Error loading labels' },
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' },
                { value: 'custom', label: 'Custom...' }
            ]);
            dropdown.enable();
        }

        return dropdown;
    }
}

// File: lib/ui/managers/AssigneeManager.js
// AssigneeManager.js - Handles assignee-related functionality
/**
 * Manager for assignee-related functionality
 */
window.AssigneeManager = class AssigneeManager {
    /**
     * Constructor for AssigneeManager
     * @param {Object} options - Configuration options
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Function} options.onAssigneesChange - Callback when assignees change
     */
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onAssigneesChange = options.onAssigneesChange || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Load assignee whitelist from storage
        this.assigneeWhitelist = getAssigneeWhitelist();

        // Initialize state
        this.currentUsers = [];
        this.isLoading = false;
    }

    /**
     * Get assignee whitelist
     * @returns {Array} Array of assignee objects
     */
    getAssigneeWhitelist() {
        return [...this.assigneeWhitelist];
    }

    /**
     * Save assignee whitelist
     * @param {Array} whitelist - Array of assignee objects
     */
    saveWhitelist(whitelist) {
        this.assigneeWhitelist = whitelist;
        saveAssigneeWhitelist(whitelist);

        // Notify listeners
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }
    }

    /**
     * Add an assignee to the whitelist
     * @param {Object} assignee - Assignee object with name and username
     * @returns {boolean} Whether assignee was added
     */
    addAssignee(assignee) {
        if (!assignee || !assignee.username) {
            return false;
        }

        // Check if already exists
        const existingIndex = this.assigneeWhitelist.findIndex(a =>
            a.username.toLowerCase() === assignee.username.toLowerCase());

        if (existingIndex >= 0) {
            // Update existing
            this.assigneeWhitelist[existingIndex] = {
                ...this.assigneeWhitelist[existingIndex],
                ...assignee
            };
        } else {
            // Add new
            this.assigneeWhitelist.push(assignee);
        }

        // Save changes
        saveAssigneeWhitelist(this.assigneeWhitelist);

        // Notify listeners
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }

        return true;
    }

    /**
     * Remove an assignee from the whitelist
     * @param {string} username - Username to remove
     * @returns {boolean} Whether assignee was removed
     */
    removeAssignee(username) {
        if (!username) {
            return false;
        }

        const initialLength = this.assigneeWhitelist.length;

        // Remove assignee with matching username
        this.assigneeWhitelist = this.assigneeWhitelist.filter(a =>
            a.username.toLowerCase() !== username.toLowerCase());

        // Check if anything was removed
        if (this.assigneeWhitelist.length === initialLength) {
            return false;
        }

        // Save changes
        saveAssigneeWhitelist(this.assigneeWhitelist);

        // Notify listeners
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }

        return true;
    }

    /**
     * Fetch current user from GitLab API
     * @returns {Promise<Object>} Current user object
     */
    async fetchCurrentUser() {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        try {
            const user = await this.gitlabApi.getCurrentUser();

            // Add to whitelist if not already present
            this.addAssignee({
                name: user.name,
                username: user.username
            });

            return user;
        } catch (error) {
            console.error('Error fetching current user:', error);
            throw error;
        }
    }

    /**
     * Fetch project members from GitLab API
     * @param {string} projectId - Project ID or path
     * @returns {Promise<Array>} Array of project members
     */
    async fetchProjectMembers(projectId) {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        if (!projectId) {
            throw new Error('Project ID is required');
        }

        try {
            // Mark as loading
            this.isLoading = true;

            // Get project members
            const members = await this.gitlabApi.callGitLabApi(
                `projects/${encodeURIComponent(projectId)}/members`,
                {params: {per_page: 100}}
            );

            // Process members
            this.currentUsers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            // No longer loading
            this.isLoading = false;

            // Return the members
            return this.currentUsers;
        } catch (error) {
            console.error(`Error fetching members for project ${projectId}:`, error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Fetch group members from GitLab API
     * @param {string} groupId - Group ID or path
     * @returns {Promise<Array>} Array of group members
     */
    async fetchGroupMembers(groupId) {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        if (!groupId) {
            throw new Error('Group ID is required');
        }

        try {
            // Mark as loading
            this.isLoading = true;

            // Get group members
            const members = await this.gitlabApi.callGitLabApi(
                `groups/${encodeURIComponent(groupId)}/members`,
                {params: {per_page: 100}}
            );

            // Process members
            this.currentUsers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            // No longer loading
            this.isLoading = false;

            // Return the members
            return this.currentUsers;
        } catch (error) {
            console.error(`Error fetching members for group ${groupId}:`, error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Insert assign command into textarea
     * @param {HTMLElement} textarea - Textarea to insert command into
     * @param {string} username - Username to assign to
     */
    insertAssignCommand(textarea, username) {
        if (!textarea) return;

        // Format command based on username
        let assignText = '/assign ';

        if (!username || username === 'none') {
            assignText += '@none';
        } else if (username === 'me') {
            assignText += '@me';
        } else {
            // Make sure username has @ prefix
            assignText += username.startsWith('@') ? username : `@${username}`;
        }

        // Check if there's already an assign command
        const assignRegex = /\/assign\s+@[^\n]+/g;
        const currentText = textarea.value;

        if (assignRegex.test(currentText)) {
            // Replace existing command
            textarea.value = currentText.replace(assignRegex, assignText);
        } else {
            // Insert at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Add newline if needed
            let insertText = assignText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text
            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Update cursor position
            const newPos = startPos + insertText.length;
            textarea.setSelectionRange(newPos, newPos);
        }

        // Focus textarea
        textarea.focus();

        // Show notification
        if (username === 'none') {
            this.notification.info('Issue will be unassigned');
        } else if (username === 'me') {
            this.notification.info('Issue will be assigned to you');
        } else {
            this.notification.info(`Issue will be assigned to ${username.replace('@', '')}`);
        }
    }

    /**
     * Create an assignee option element for the selector
     * @param {Object} assignee - Assignee object
     * @param {Function} onClick - Click handler
     * @returns {HTMLElement} Option element
     */
    createAssigneeOption(assignee, onClick) {
        const option = document.createElement('div');
        option.className = 'assignee-option';
        option.style.padding = '8px 12px';
        option.style.borderRadius = '4px';
        option.style.cursor = 'pointer';
        option.style.display = 'flex';
        option.style.alignItems = 'center';
        option.style.transition = 'background-color 0.2s ease';

        // Add hover effect
        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#f5f5f5';
        });

        option.addEventListener('mouseleave', () => {
            option.style.backgroundColor = '';
        });

        // Add avatar if available
        if (assignee.avatar_url) {
            const avatar = document.createElement('img');
            avatar.src = assignee.avatar_url;
            avatar.alt = assignee.name || assignee.username;
            avatar.style.width = '24px';
            avatar.style.height = '24px';
            avatar.style.borderRadius = '50%';
            avatar.style.marginRight = '8px';
            option.appendChild(avatar);
        } else {
            // Placeholder avatar with initials
            const avatarPlaceholder = document.createElement('div');
            avatarPlaceholder.style.width = '24px';
            avatarPlaceholder.style.height = '24px';
            avatarPlaceholder.style.borderRadius = '50%';
            avatarPlaceholder.style.backgroundColor = '#e0e0e0';
            avatarPlaceholder.style.display = 'flex';
            avatarPlaceholder.style.alignItems = 'center';
            avatarPlaceholder.style.justifyContent = 'center';
            avatarPlaceholder.style.marginRight = '8px';
            avatarPlaceholder.style.fontSize = '12px';
            avatarPlaceholder.style.fontWeight = 'bold';
            avatarPlaceholder.style.color = '#666';

            // Get initials
            const name = assignee.name || assignee.username || '';
            const initials = name.split(' ')
                .map(part => part.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase();

            avatarPlaceholder.textContent = initials;
            option.appendChild(avatarPlaceholder);
        }

        // Add assignee info
        const info = document.createElement('div');

        const name = document.createElement('div');
        name.textContent = assignee.name || assignee.username;
        name.style.fontWeight = 'bold';

        info.appendChild(name);

        // Add username if different from name
        if (assignee.username && assignee.username !== 'none' && assignee.username !== 'me' &&
            assignee.name && assignee.name !== assignee.username) {
            const username = document.createElement('div');
            username.textContent = `@${assignee.username}`;
            username.style.fontSize = '12px';
            username.style.color = '#666';
            info.appendChild(username);
        }

        option.appendChild(info);

        // Add click handler
        if (typeof onClick === 'function') {
            option.addEventListener('click', onClick);
        }

        return option;
    }

    /**
     * Open assignee selector dialog
     * @param {HTMLElement} targetElement - Textarea to insert command into after selection
     */
    openAssigneeSelector(targetElement) {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'assignee-selector-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Select Assignee';
        modalTitle.style.margin = '0';
        modalTitle.style.cursor = 'pointer'; // Show it's clickable
        // Add refresh icon next to title
        modalTitle.innerHTML = 'Select Assignee <span style="font-size: 14px; margin-left: 5px; color: #666;">🔄</span>';
        // Add hover effect
        modalTitle.addEventListener('mouseenter', () => {
            modalTitle.style.color = '#1f75cb';
        });
        modalTitle.addEventListener('mouseleave', () => {
            modalTitle.style.color = '';
        });
        // Add click event to refresh assignees
        modalTitle.addEventListener('click', () => {
            this.reloadAssigneeSelector(modalContent, targetElement);
        });

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.onclick = () => modalOverlay.remove();

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.id = 'assignee-selector-content';

        // Add search box
        const searchContainer = document.createElement('div');
        searchContainer.style.marginBottom = '15px';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search assignees...';
        searchInput.style.width = '100%';
        searchInput.style.padding = '8px';
        searchInput.style.borderRadius = '4px';
        searchInput.style.border = '1px solid #ccc';

        searchContainer.appendChild(searchInput);
        contentArea.appendChild(searchContainer);

        // Create special options section
        const specialOptions = document.createElement('div');
        specialOptions.style.marginBottom = '20px';

        // Create special assignee options
        const specialValues = [
            {value: 'none', label: 'Unassign', description: 'Remove assignee from this issue'},
            {value: '@me', label: 'Myself', description: 'Assign this issue to you'}
        ];

        specialValues.forEach(special => {
            const option = this.createAssigneeOption(
                special,
                () => {
                    this.insertAssignCommand(targetElement, special.value);
                    modalOverlay.remove();
                }
            );

            specialOptions.appendChild(option);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.borderBottom = '1px solid #eee';
        separator.style.margin = '20px 0';

        // Create loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'assignee-loading-indicator';
        loadingIndicator.textContent = 'Loading assignees...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.color = '#666';

        // Create assignees section
        const assigneesSection = document.createElement('div');
        assigneesSection.id = 'assignees-section';

        const assigneesTitle = document.createElement('h4');
        assigneesTitle.textContent = 'Whitelisted Assignees';
        assigneesTitle.style.marginBottom = '10px';
        // Make this header clickable too
        assigneesTitle.style.cursor = 'pointer';
        assigneesTitle.innerHTML = 'Whitelisted Assignees <span style="font-size: 12px; margin-left: 5px; color: #666;">🔄</span>';
        assigneesTitle.addEventListener('mouseenter', () => {
            assigneesTitle.style.color = '#1f75cb';
        });
        assigneesTitle.addEventListener('mouseleave', () => {
            assigneesTitle.style.color = '';
        });
        // Add click event to refresh assignees from whitelist
        assigneesTitle.addEventListener('click', () => {
            // Show loading state
            const assigneeList = document.getElementById('assignee-list-container');
            if (assigneeList) {
                assigneeList.innerHTML = '';
                assigneeList.appendChild(loadingIndicator.cloneNode(true));

                // Short timeout to show loading state before refreshing
                setTimeout(() => {
                    this.reloadWhitelistedAssignees(assigneeList, targetElement);
                }, 300);
            }
        });

        assigneesSection.appendChild(assigneesTitle);

        // Create assignee list container
        const assigneeList = document.createElement('div');
        assigneeList.id = 'assignee-list-container';
        assigneeList.style.height = '300px'; // Fixed height
        assigneeList.style.overflowY = 'auto';
        assigneeList.appendChild(loadingIndicator);
        assigneesSection.appendChild(assigneeList);

        // Add to content area
        contentArea.appendChild(specialOptions);
        contentArea.appendChild(separator);
        contentArea.appendChild(assigneesSection);

        // Add elements to container
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        // Load assignees
        this.loadAssigneesIntoSelector(assigneeList, targetElement);

        // Setup search functionality
        searchInput.addEventListener('input', () => {
            const searchText = searchInput.value.toLowerCase();

            // Filter assignees based on search
            const assigneeOptions = assigneeList.querySelectorAll('.assignee-option');
            assigneeOptions.forEach(option => {
                const nameElement = option.querySelector('div > div:first-child');
                const usernameElement = option.querySelector('div > div:last-child');

                if (!nameElement) return;

                const name = nameElement.textContent.toLowerCase();
                const username = usernameElement ? usernameElement.textContent.toLowerCase() : '';

                if (name.includes(searchText) || username.includes(searchText)) {
                    option.style.display = '';
                } else {
                    option.style.display = 'none';
                }
            });
        });
    }

    /**
     * Reload the entire assignee selector
     * @param {HTMLElement} modalContent - The modal content element
     * @param {HTMLElement} targetElement - The target textarea element
     */
    reloadAssigneeSelector(modalContent, targetElement) {
        // Show loading message
        const contentArea = modalContent.querySelector('#assignee-selector-content');
        if (!contentArea) return;

        // Add or update loading indicator
        let loadingIndicator = contentArea.querySelector('#full-reload-indicator');
        if (!loadingIndicator) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'full-reload-indicator';
            loadingIndicator.style.position = 'absolute';
            loadingIndicator.style.top = '0';
            loadingIndicator.style.left = '0';
            loadingIndicator.style.width = '100%';
            loadingIndicator.style.height = '100%';
            loadingIndicator.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            loadingIndicator.style.display = 'flex';
            loadingIndicator.style.justifyContent = 'center';
            loadingIndicator.style.alignItems = 'center';
            loadingIndicator.style.zIndex = '10';

            const loadingText = document.createElement('div');
            loadingText.textContent = 'Reloading assignees...';
            loadingText.style.backgroundColor = '#1f75cb';
            loadingText.style.color = 'white';
            loadingText.style.padding = '10px 20px';
            loadingText.style.borderRadius = '4px';
            loadingText.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

            loadingIndicator.appendChild(loadingText);
            modalContent.style.position = 'relative';
            modalContent.appendChild(loadingIndicator);
        } else {
            loadingIndicator.style.display = 'flex';
        }

        // Refresh whitelisted assignees (with short timeout to show loading)
        setTimeout(() => {
            // Reload the assignee list
            const assigneeList = contentArea.querySelector('#assignee-list-container');
            if (assigneeList) {
                assigneeList.innerHTML = '';

                const tempLoadingIndicator = document.createElement('div');
                tempLoadingIndicator.textContent = 'Loading assignees...';
                tempLoadingIndicator.style.textAlign = 'center';
                tempLoadingIndicator.style.padding = '20px';
                tempLoadingIndicator.style.color = '#666';

                assigneeList.appendChild(tempLoadingIndicator);

                // Reload the assignees
                this.loadAssigneesIntoSelector(assigneeList, targetElement);
            }

            // Hide the full loading overlay
            setTimeout(() => {
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            }, 300);
        }, 500);

        // Show a notification for better feedback
        this.notification.info('Refreshing assignee list...');
    }
    /**
     * Reload whitelisted assignees into the container
     * @param {HTMLElement} container - Container to add assignees to
     * @param {HTMLElement} targetElement - Target textarea element
     */
    reloadWhitelistedAssignees(container, targetElement) {
        // Clear container
        container.innerHTML = '';

        // Get fresh whitelist (to ensure we have the latest data)
        this.assigneeWhitelist = getAssigneeWhitelist();

        if (this.assigneeWhitelist.length === 0) {
            // Show empty message
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some from Available Users or add manually below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '15px';
            container.appendChild(emptyMessage);
        } else {
            // Create a grid layout for assignees
            const assigneeGrid = document.createElement('div');
            assigneeGrid.style.display = 'grid';
            assigneeGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
            assigneeGrid.style.gap = '10px';

            // Sort assignees alphabetically by name
            const sortedAssignees = [...this.assigneeWhitelist].sort((a, b) => {
                const nameA = (a.name || a.username || '').toLowerCase();
                const nameB = (b.name || b.username || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });

            // Add each assignee to the grid
            sortedAssignees.forEach(assignee => {
                const option = this.createAssigneeOption(
                    assignee,
                    () => {
                        this.insertAssignCommand(targetElement, assignee.username);
                        // Find and close the modal
                        const modal = document.getElementById('assignee-selector-overlay');
                        if (modal) modal.remove();
                    }
                );

                assigneeGrid.appendChild(option);
            });

            container.appendChild(assigneeGrid);
        }

        // Add button to fetch group members
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.marginTop = '15px';

        const fetchButton = document.createElement('button');
        fetchButton.textContent = 'Fetch Project Members';
        fetchButton.style.padding = '8px 16px';
        fetchButton.style.backgroundColor = '#1f75cb';
        fetchButton.style.color = 'white';
        fetchButton.style.border = 'none';
        fetchButton.style.borderRadius = '4px';
        fetchButton.style.cursor = 'pointer';

        fetchButton.addEventListener('click', () => {
            this.fetchProjectMembers().then(members => {
                if (members && members.length > 0) {
                    // Show project members in a separate section
                    this.showProjectMembers(container, members, targetElement);
                } else {
                    this.notification.info('No project members found');
                }
            }).catch(error => {
                console.error('Error fetching project members:', error);
                this.notification.error('Failed to fetch project members');
            });
        });

        buttonContainer.appendChild(fetchButton);
        container.appendChild(buttonContainer);
    }

    /**
     * Show project members in the container
     * @param {HTMLElement} container - Container to add members to
     * @param {Array} members - Array of project members
     * @param {HTMLElement} targetElement - Target textarea element
     */
    showProjectMembers(container, members, targetElement) {
        // Create project members section
        const membersSection = document.createElement('div');
        membersSection.style.marginTop = '20px';

        const membersTitle = document.createElement('h4');
        membersTitle.textContent = 'Project Members';
        membersTitle.style.borderTop = '1px solid #eee';
        membersTitle.style.paddingTop = '15px';
        membersTitle.style.marginBottom = '10px';

        membersSection.appendChild(membersTitle);

        // Create grid for members
        const membersGrid = document.createElement('div');
        membersGrid.style.display = 'grid';
        membersGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
        membersGrid.style.gap = '10px';

        // Sort members alphabetically
        const sortedMembers = [...members].sort((a, b) => {
            return (a.name || a.username || '').localeCompare(b.name || b.username || '');
        });

        // Add each member to the grid
        sortedMembers.forEach(member => {
            // Check if already in whitelist to avoid duplicates
            const inWhitelist = this.assigneeWhitelist.some(a =>
                a.username.toLowerCase() === member.username.toLowerCase()
            );

            if (!inWhitelist) {
                const option = this.createAssigneeOption(
                    member,
                    () => {
                        this.insertAssignCommand(targetElement, member.username);
                        // Find and close the modal
                        const modal = document.getElementById('assignee-selector-overlay');
                        if (modal) modal.remove();
                    }
                );

                // Add button to add to whitelist
                const addButton = document.createElement('button');
                addButton.textContent = '+ Save';
                addButton.style.padding = '4px 8px';
                addButton.style.backgroundColor = '#28a745';
                addButton.style.color = 'white';
                addButton.style.border = 'none';
                addButton.style.borderRadius = '3px';
                addButton.style.marginLeft = '10px';
                addButton.style.cursor = 'pointer';

                addButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent selecting this assignee

                    // Add to whitelist
                    this.addAssignee({
                        name: member.name || member.username,
                        username: member.username
                    });

                    // Show notification
                    this.notification.success(`Added ${member.name || member.username} to saved assignees`);

                    // Update button to show added
                    addButton.textContent = '✓ Saved';
                    addButton.style.backgroundColor = '#6c757d';
                    addButton.disabled = true;
                    addButton.style.cursor = 'default';
                });

                // Find where to add the button
                const infoElement = option.querySelector('div:last-child');
                if (infoElement) {
                    infoElement.appendChild(addButton);
                }

                membersGrid.appendChild(option);
            }
        });

        // Check if we added any new members
        if (membersGrid.children.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'All project members are already in your saved assignees.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '15px';
            membersSection.appendChild(emptyMessage);
        } else {
            membersSection.appendChild(membersGrid);
        }

        container.appendChild(membersSection);
    }

    /**
     * Load assignees into the selector
     * @param {HTMLElement} container - Container to add assignees to
     * @param {HTMLElement} targetElement - Target textarea element
     */
    loadAssigneesIntoSelector(container, targetElement) {
        // Clear container
        container.innerHTML = '';

        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading assignees...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.color = '#666';
        container.appendChild(loadingIndicator);

        // Reload assignees from whitelist (short timeout to show loading state)
        setTimeout(() => {
            this.reloadWhitelistedAssignees(container, targetElement);
        }, 300);
    }

    /**
     * Open assignee management dialog
     * Allows adding/removing assignees without assigning to a specific issue
     */
    openAssigneeManager() {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Manage Assignees';
        modalTitle.style.margin = '0';

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.onclick = () => modalOverlay.remove();

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);

        // Create content area
        const contentArea = document.createElement('div');

        // Create description
        const description = document.createElement('p');
        description.textContent = 'Manage assignees that appear in the assignee dropdown. These users will be available for quick assignment to issues.';
        description.style.marginBottom = '20px';

        // Create assignee list section
        const listSection = document.createElement('div');
        listSection.style.marginBottom = '20px';

        const listTitle = document.createElement('h4');
        listTitle.textContent = 'Current Assignees';
        listTitle.style.marginBottom = '10px';
        listTitle.style.fontSize = '16px';

        listSection.appendChild(listTitle);

        // Create assignee list
        const assigneeList = document.createElement('div');
        assigneeList.style.height = '300px'; // Fixed height
        assigneeList.style.overflowY = 'auto';
        assigneeList.style.border = '1px solid #eee';
        assigneeList.style.borderRadius = '4px';

        // Populate assignee list
        if (this.assigneeWhitelist.length > 0) {
            this.assigneeWhitelist.forEach((assignee, index) => {
                const assigneeItem = document.createElement('div');
                assigneeItem.style.display = 'flex';
                assigneeItem.style.justifyContent = 'space-between';
                assigneeItem.style.alignItems = 'center';
                assigneeItem.style.padding = '10px';
                assigneeItem.style.borderBottom = index < this.assigneeWhitelist.length - 1 ? '1px solid #eee' : 'none';

                const assigneeInfo = document.createElement('div');
                assigneeInfo.style.display = 'flex';
                assigneeInfo.style.alignItems = 'center';

                // Add avatar placeholder
                const avatarPlaceholder = document.createElement('div');
                avatarPlaceholder.style.width = '32px';
                avatarPlaceholder.style.height = '32px';
                avatarPlaceholder.style.borderRadius = '50%';
                avatarPlaceholder.style.backgroundColor = '#e0e0e0';
                avatarPlaceholder.style.display = 'flex';
                avatarPlaceholder.style.alignItems = 'center';
                avatarPlaceholder.style.justifyContent = 'center';
                avatarPlaceholder.style.marginRight = '10px';
                avatarPlaceholder.style.fontSize = '14px';
                avatarPlaceholder.style.fontWeight = 'bold';
                avatarPlaceholder.style.color = '#666';

                // Get initials
                const name = assignee.name || assignee.username || '';
                const initials = name.split(' ')
                    .map(part => part.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                avatarPlaceholder.textContent = initials;
                assigneeInfo.appendChild(avatarPlaceholder);

                // Add name and username
                const nameContainer = document.createElement('div');

                const displayName = document.createElement('div');
                displayName.textContent = assignee.name || assignee.username;
                displayName.style.fontWeight = 'bold';

                const username = document.createElement('div');
                username.textContent = `@${assignee.username}`;
                username.style.fontSize = '12px';
                username.style.color = '#666';

                nameContainer.appendChild(displayName);
                nameContainer.appendChild(username);
                assigneeInfo.appendChild(nameContainer);

                // Create remove button
                const removeButton = document.createElement('button');
                removeButton.textContent = 'Remove';
                removeButton.style.padding = '4px 8px';
                removeButton.style.backgroundColor = '#dc3545';
                removeButton.style.color = 'white';
                removeButton.style.border = 'none';
                removeButton.style.borderRadius = '4px';
                removeButton.style.cursor = 'pointer';

                removeButton.onclick = () => {
                    this.removeAssignee(assignee.username);
                    assigneeItem.remove();

                    // Show success message
                    this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);

                    // Show empty message if list is now empty
                    if (this.assigneeWhitelist.length === 0) {
                        const emptyMessage = document.createElement('div');
                        emptyMessage.textContent = 'No assignees added yet. Add some below.';
                        emptyMessage.style.padding = '10px';
                        emptyMessage.style.color = '#666';
                        emptyMessage.style.fontStyle = 'italic';
                        assigneeList.appendChild(emptyMessage);
                    }
                };

                assigneeItem.appendChild(assigneeInfo);
                assigneeItem.appendChild(removeButton);

                assigneeList.appendChild(assigneeItem);
            });
        } else {
            // Show empty message
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.padding = '10px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            assigneeList.appendChild(emptyMessage);
        }

        listSection.appendChild(assigneeList);

        // Create add assignee form
        const addForm = document.createElement('div');
        addForm.style.marginTop = '20px';
        addForm.style.padding = '15px';
        addForm.style.backgroundColor = '#f8f9fa';
        addForm.style.borderRadius = '4px';

        const formTitle = document.createElement('h4');
        formTitle.textContent = 'Add New Assignee';
        formTitle.style.marginBottom = '15px';
        formTitle.style.fontSize = '16px';

        const nameContainer = document.createElement('div');
        nameContainer.style.marginBottom = '10px';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Display Name:';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '5px';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'John Doe';
        nameInput.style.width = '100%';
        nameInput.style.padding = '8px';
        nameInput.style.borderRadius = '4px';
        nameInput.style.border = '1px solid #ccc';

        nameContainer.appendChild(nameLabel);
        nameContainer.appendChild(nameInput);

        const usernameContainer = document.createElement('div');
        usernameContainer.style.marginBottom = '15px';

        const usernameLabel = document.createElement('label');
        usernameLabel.textContent = 'GitLab Username:';
        usernameLabel.style.display = 'block';
        usernameLabel.style.marginBottom = '5px';

        const usernameInput = document.createElement('input');
        usernameInput.type = 'text';
        usernameInput.placeholder = 'username (without @)';
        usernameInput.style.width = '100%';
        usernameInput.style.padding = '8px';
        usernameInput.style.borderRadius = '4px';
        usernameInput.style.border = '1px solid #ccc';

        usernameContainer.appendChild(usernameLabel);
        usernameContainer.appendChild(usernameInput);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';

        const addButton = document.createElement('button');
        addButton.textContent = 'Add Assignee';
        addButton.style.padding = '8px 16px';
        addButton.style.backgroundColor = '#28a745';
        addButton.style.color = 'white';
        addButton.style.border = 'none';
        addButton.style.borderRadius = '4px';
        addButton.style.cursor = 'pointer';

        addButton.onclick = () => {
            const name = nameInput.value.trim();
            const username = usernameInput.value.trim();

            if (!username) {
                this.notification.error('Username is required');
                return;
            }

            // Add to whitelist
            const newAssignee = {
                name: name || username,
                username: username
            };

            this.addAssignee(newAssignee);

            // Show success message
            this.notification.success(`Added assignee: ${newAssignee.name}`);

            // Close and reopen to refresh the list
            modalOverlay.remove();
            this.openAssigneeManager();
        };

        // Add fetch current user button
        const fetchUserButton = document.createElement('button');
        fetchUserButton.textContent = 'Add Current User';
        fetchUserButton.style.padding = '8px 16px';
        fetchUserButton.style.backgroundColor = '#17a2b8';
        fetchUserButton.style.color = 'white';
        fetchUserButton.style.border = 'none';
        fetchUserButton.style.borderRadius = '4px';
        fetchUserButton.style.cursor = 'pointer';
        fetchUserButton.style.marginRight = '10px';

        fetchUserButton.onclick = async () => {
            // Disable button while loading
            fetchUserButton.disabled = true;
            fetchUserButton.textContent = 'Loading...';

            try {
                // Fetch current user
                const user = await this.fetchCurrentUser();

                // Show success message
                this.notification.success(`Added current user: ${user.name}`);

                // Close and reopen to refresh the list
                modalOverlay.remove();
                this.openAssigneeManager();
            } catch (error) {
                this.notification.error('Failed to fetch current user');

                // Re-enable button
                fetchUserButton.disabled = false;
                fetchUserButton.textContent = 'Add Current User';
            }
        };

        buttonContainer.appendChild(fetchUserButton);
        buttonContainer.appendChild(addButton);

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(buttonContainer);

        // Add footer with close button
        const footer = document.createElement('div');
        footer.style.marginTop = '20px';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';

        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = 'Close';
        closeModalButton.style.padding = '8px 16px';
        closeModalButton.style.backgroundColor = '#6c757d';
        closeModalButton.style.color = 'white';
        closeModalButton.style.border = 'none';
        closeModalButton.style.borderRadius = '4px';
        closeModalButton.style.cursor = 'pointer';

        closeModalButton.onclick = () => {
            modalOverlay.remove();
        };

        footer.appendChild(closeModalButton);

        // Assemble the modal
        contentArea.appendChild(description);
        contentArea.appendChild(listSection);
        contentArea.appendChild(addForm);
        contentArea.appendChild(footer);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }
}

// File: lib/ui/managers/MilestoneManager.js
// MilestoneManager.js - Handles milestone-related functionality
/**
 * Manager for milestone functionality
 */
window.MilestoneManager = class MilestoneManager {
    /**
     * Constructor for MilestoneManager
     * @param {Object} options - Configuration options
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Function} options.onMilestonesLoaded - Callback when milestones are loaded
     */
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onMilestonesLoaded = options.onMilestonesLoaded || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Initialize state
        this.milestones = [];
        this.currentMilestone = null;
        this.isLoading = false;
    }

    /**
     * Fetch milestones from GitLab API
     * @param {string} state - Filter by milestone state (active, closed, all)
     * @returns {Promise<Array>} Array of milestone objects
     */
    async fetchMilestones(state = 'active') {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        try {
            // Mark as loading
            this.isLoading = true;

            // Get path info for current project/group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                console.warn('Could not determine project/group path');
                this.isLoading = false;
                return [];
            }

            // Construct API endpoint based on project or group
            const endpoint = `${pathInfo.type}s/${pathInfo.encodedPath}/milestones`;

            // Fetch milestones
            const milestones = await this.gitlabApi.callGitLabApi(endpoint, {
                params: {
                    state: state,
                    per_page: 100,
                    order_by: 'due_date'
                }
            });

            // Process and store milestones
            this.milestones = milestones.map(milestone => ({
                id: milestone.id,
                iid: milestone.iid,
                title: milestone.title,
                description: milestone.description,
                state: milestone.state,
                due_date: milestone.due_date,
                start_date: milestone.start_date,
                web_url: milestone.web_url
            }));

            // No longer loading
            this.isLoading = false;

            // Call callback if provided
            if (typeof this.onMilestonesLoaded === 'function') {
                this.onMilestonesLoaded(this.milestones);
            }

            return this.milestones;
        } catch (error) {
            console.error('Error fetching milestones:', error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Get milestone by ID or title
     * @param {string|number} idOrTitle - Milestone ID or title
     * @returns {Object|null} Milestone object or null if not found
     */
    getMilestone(idOrTitle) {
        if (!idOrTitle) return null;

        if (typeof idOrTitle === 'number' || /^\d+$/.test(idOrTitle)) {
            // Search by ID
            return this.milestones.find(m => m.id === parseInt(idOrTitle) || m.iid === parseInt(idOrTitle));
        } else {
            // Search by title
            return this.milestones.find(m => m.title === idOrTitle);
        }
    }

    /**
     * Get the current milestone for a project/group
     * This is usually the milestone with the closest due date that hasn't passed
     * @returns {Object|null} Current milestone or null if none found
     */
    getCurrentMilestone() {
        if (this.milestones.length === 0) {
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // First try to find an active milestone with due date in the future
        const activeMilestones = this.milestones.filter(m =>
            m.state === 'active' && m.due_date && new Date(m.due_date) >= today);

        if (activeMilestones.length > 0) {
            // Sort by due date (ascending) and return the first one
            return activeMilestones.sort((a, b) =>
                new Date(a.due_date) - new Date(b.due_date))[0];
        }

        // If no suitable active milestones, return the most recent active one
        const recentActive = this.milestones.filter(m => m.state === 'active');

        if (recentActive.length > 0) {
            // Return the first one (should be sorted by due_date already from API)
            return recentActive[0];
        }

        // If no active milestones at all, return null
        return null;
    }

    /**
     * Get next milestone after the current one
     * @returns {Object|null} Next milestone or null if none found
     */
    getNextMilestone() {
        const current = this.getCurrentMilestone();

        if (!current || !current.due_date) {
            // If no current milestone or it has no due date, just return the first active one
            const active = this.milestones.filter(m => m.state === 'active');
            return active.length > 0 ? active[0] : null;
        }

        const currentDue = new Date(current.due_date);

        // Find milestones with due dates after the current one
        const upcoming = this.milestones.filter(m =>
            m.state === 'active' &&
            m.due_date &&
            new Date(m.due_date) > currentDue);

        if (upcoming.length > 0) {
            // Sort by due date (ascending) and return the first one
            return upcoming.sort((a, b) =>
                new Date(a.due_date) - new Date(b.due_date))[0];
        }

        return null;
    }

    /**
     * Get upcoming milestones (excluding current and next)
     * @param {number} limit - Maximum number of milestones to return
     * @returns {Array} Array of upcoming milestone objects
     */
    getUpcomingMilestones(limit = 5) {
        const current = this.getCurrentMilestone();
        const next = this.getNextMilestone();

        // Filter out current and next milestones
        const filtered = this.milestones.filter(m => {
            if (!m.due_date || m.state !== 'active') return false;

            // Skip current and next milestones
            if (current && m.id === current.id) return false;
            if (next && m.id === next.id) return false;

            // Only include milestones with future due dates
            const dueDate = new Date(m.due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            return dueDate >= today;
        });

        // Sort by due date (ascending)
        const sorted = filtered.sort((a, b) =>
            new Date(a.due_date) - new Date(b.due_date));

        // Return up to the specified limit
        return sorted.slice(0, limit);
    }

    /**
     * Get milestone dropdown options
     * Includes special values and actual milestones
     * @returns {Array} Array of option objects with value and label
     */
    getMilestoneOptions() {
        const options = [
            { value: '', label: 'Set Milestone' },
            { value: '%current', label: 'Current Sprint' },
            { value: '%next', label: 'Next Sprint' },
            { value: '%upcoming', label: 'Upcoming' },
            { value: 'none', label: 'Remove Milestone' }
        ];

        // Add actual milestones if available
        if (this.milestones.length > 0) {
            // Add separator
            options.push({ value: 'separator', label: '─────────────' });

            // Add active milestones
            const activeMilestones = this.milestones
                .filter(m => m.state === 'active')
                .map(m => ({
                    value: m.title,
                    label: m.title,
                    dueDate: m.due_date
                }));

            options.push(...activeMilestones);
        }

        return options;
    }

    /**
     * Insert milestone command into textarea
     * @param {HTMLElement} textarea - Textarea to insert command into
     * @param {string} value - Milestone value (special value or title)
     */
    insertMilestoneCommand(textarea, value) {
        if (!textarea) return;

        // Format milestone text based on value
        let milestoneText = '/milestone ';

        if (value === 'none') {
            milestoneText += '%""';
        } else if (value.startsWith('%')) {
            milestoneText += value;
        } else {
            milestoneText += `%"${value}"`;
        }

        // Check if there's already a milestone command
        const milestoneRegex = /\/milestone\s+%[^\n]+/g;
        const currentText = textarea.value;

        if (milestoneRegex.test(currentText)) {
            // Replace existing command
            textarea.value = currentText.replace(milestoneRegex, milestoneText);
        } else {
            // Insert at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Add newline if needed
            let insertText = milestoneText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text
            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Update cursor position
            const newPos = startPos + insertText.length;
            textarea.setSelectionRange(newPos, newPos);
        }

        // Focus textarea
        textarea.focus();

        // Show notification
        if (value === 'none') {
            this.notification.info('Milestone will be removed');
        } else {
            const displayValue = value.startsWith('%')
                ? value.substring(1)
                : value;
            this.notification.info(`Milestone set to ${displayValue}`);
        }
    }

    /**
     * Create a milestone option element for the selector
     * @param {Object} milestone - Milestone object
     * @param {Function} onClick - Click handler
     * @returns {HTMLElement} Option element
     */
    createMilestoneOption(milestone, onClick) {
        const option = document.createElement('div');
        option.className = 'milestone-option';
        option.style.padding = '10px';
        option.style.borderRadius = '4px';
        option.style.border = '1px solid #dee2e6';
        option.style.cursor = 'pointer';
        option.style.transition = 'background-color 0.2s ease';

        // Add hover effect
        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#f5f5f5';
        });

        option.addEventListener('mouseleave', () => {
            option.style.backgroundColor = '';
        });

        // Create title element
        const title = document.createElement('div');
        title.className = 'milestone-title';
        title.textContent = milestone.label;
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.style.marginBottom = '5px';

        option.appendChild(title);

        // Add due date if available
        if (milestone.dueDate) {
            const dueDate = document.createElement('div');
            dueDate.className = 'milestone-due-date';

            // Format the date
            const date = new Date(milestone.dueDate);
            const formattedDate = date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            dueDate.textContent = `Due: ${formattedDate}`;
            dueDate.style.fontSize = '12px';
            dueDate.style.color = '#6c757d';
            dueDate.style.marginBottom = '5px';

            option.appendChild(dueDate);
        }

        // Add description if available
        if (milestone.description) {
            const description = document.createElement('div');
            description.className = 'milestone-description';

            // Truncate long descriptions
            let descText = milestone.description;
            if (descText.length > 100) {
                descText = descText.substring(0, 97) + '...';
            }

            description.textContent = descText;
            description.style.fontSize = '12px';
            description.style.color = '#6c757d';

            option.appendChild(description);
        }

        // Add state indicator if available
        if (milestone.state) {
            const stateContainer = document.createElement('div');
            stateContainer.style.display = 'flex';
            stateContainer.style.justifyContent = 'flex-end';
            stateContainer.style.marginTop = '5px';

            const state = document.createElement('span');
            state.className = 'milestone-state';
            state.textContent = milestone.state;
            state.style.fontSize = '11px';
            state.style.padding = '2px 6px';
            state.style.borderRadius = '10px';
            state.style.textTransform = 'capitalize';

            // Set color based on state
            if (milestone.state === 'active') {
                state.style.backgroundColor = '#28a745';
                state.style.color = 'white';
            } else if (milestone.state === 'closed') {
                state.style.backgroundColor = '#6c757d';
                state.style.color = 'white';
            }

            stateContainer.appendChild(state);
            option.appendChild(stateContainer);
        }

        // Add click handler
        if (typeof onClick === 'function') {
            option.addEventListener('click', onClick);
        }

        return option;
    }

    /**
     * Open milestone selector dialog
     * @param {HTMLElement} targetElement - Textarea to insert command into after selection
     */
    openMilestoneSelector(targetElement) {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Select Milestone';
        modalTitle.style.margin = '0';

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.onclick = () => modalOverlay.remove();

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);

        // Create content area
        const contentArea = document.createElement('div');

        // Add search box
        const searchContainer = document.createElement('div');
        searchContainer.style.marginBottom = '15px';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search milestones...';
        searchInput.style.width = '100%';
        searchInput.style.padding = '8px';
        searchInput.style.borderRadius = '4px';
        searchInput.style.border = '1px solid #ccc';

        searchContainer.appendChild(searchInput);
        contentArea.appendChild(searchContainer);

        // Create special options section
        const specialOptions = document.createElement('div');
        specialOptions.style.marginBottom = '20px';

        // Create special milestone options
        const specialValues = [
            { value: '%current', label: 'Current Sprint', description: 'The active milestone with the closest due date' },
            { value: '%next', label: 'Next Sprint', description: 'The milestone following the current one' },
            { value: '%upcoming', label: 'Upcoming', description: 'Future milestones beyond the next one' },
            { value: 'none', label: 'Remove Milestone', description: 'Clear the milestone from this issue' }
        ];

        specialValues.forEach(special => {
            const option = this.createMilestoneOption(
                special,
                () => {
                    this.insertMilestoneCommand(targetElement, special.value);
                    modalOverlay.remove();
                }
            );

            specialOptions.appendChild(option);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.borderBottom = '1px solid #eee';
        separator.style.margin = '20px 0';

        // Create loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading milestones...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.color = '#666';

        // Create milestones section
        const milestonesSection = document.createElement('div');

        const milestonesTitle = document.createElement('h4');
        milestonesTitle.textContent = 'Project Milestones';
        milestonesTitle.style.marginBottom = '10px';

        milestonesSection.appendChild(milestonesTitle);
        milestonesSection.appendChild(loadingIndicator);

        // Add refresh button
        const refreshContainer = document.createElement('div');
        refreshContainer.style.display = 'flex';
        refreshContainer.style.justifyContent = 'flex-end';
        refreshContainer.style.marginTop = '20px';

        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh Milestones';
        refreshButton.style.padding = '6px 12px';
        refreshButton.style.backgroundColor = '#6c757d';
        refreshButton.style.color = 'white';
        refreshButton.style.border = 'none';
        refreshButton.style.borderRadius = '4px';
        refreshButton.style.cursor = 'pointer';

        refreshContainer.appendChild(refreshButton);

        // Assemble the modal
        contentArea.appendChild(specialOptions);
        contentArea.appendChild(separator);
        contentArea.appendChild(milestonesSection);
        contentArea.appendChild(refreshContainer);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        // Load milestones
        this.fetchMilestones().then(milestones => {
            // Remove loading indicator
            loadingIndicator.remove();

            if (milestones.length === 0) {
                // Show empty message
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No milestones found for this project.';
                emptyMessage.style.textAlign = 'center';
                emptyMessage.style.padding = '20px';
                emptyMessage.style.color = '#666';

                milestonesSection.appendChild(emptyMessage);
                return;
            }

            // Create milestones container with grid layout
            const milestonesGrid = document.createElement('div');
            milestonesGrid.style.display = 'grid';
            milestonesGrid.style.gap = '10px';
            milestonesGrid.style.gridTemplateColumns = '1fr';

            // Add milestone options
            milestones.forEach(milestone => {
                const option = this.createMilestoneOption(
                    {
                        value: milestone.title,
                        label: milestone.title,
                        description: milestone.description,
                        dueDate: milestone.due_date,
                        state: milestone.state
                    },
                    () => {
                        this.insertMilestoneCommand(targetElement, milestone.title);
                        modalOverlay.remove();
                    }
                );

                milestonesGrid.appendChild(option);
            });

            milestonesSection.appendChild(milestonesGrid);

            // Setup search functionality
            searchInput.addEventListener('input', () => {
                const searchText = searchInput.value.toLowerCase();

                // Filter milestones based on search text
                Array.from(milestonesGrid.children).forEach(option => {
                    const titleElement = option.querySelector('.milestone-title');
                    const descriptionElement = option.querySelector('.milestone-description');

                    if (!titleElement) return;

                    const title = titleElement.textContent.toLowerCase();
                    const description = descriptionElement ?
                        descriptionElement.textContent.toLowerCase() : '';

                    if (title.includes(searchText) || description.includes(searchText)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                });
            });

            // Setup refresh button
            refreshButton.addEventListener('click', () => {
                // Show loading indicator
                milestonesGrid.innerHTML = '';
                milestonesGrid.appendChild(loadingIndicator);
                loadingIndicator.style.display = 'block';

                // Refresh milestones
                this.fetchMilestones().then(refreshedMilestones => {
                    // Remove loading indicator
                    loadingIndicator.style.display = 'none';

                    // Recreate milestone options
                    milestonesGrid.innerHTML = '';

                    refreshedMilestones.forEach(milestone => {
                        const option = this.createMilestoneOption(
                            {
                                value: milestone.title,
                                label: milestone.title,
                                description: milestone.description,
                                dueDate: milestone.due_date,
                                state: milestone.state
                            },
                            () => {
                                this.insertMilestoneCommand(targetElement, milestone.title);
                                modalOverlay.remove();
                            }
                        );

                        milestonesGrid.appendChild(option);
                    });

                    // Show notification
                    this.notification.success('Milestones refreshed');
                }).catch(error => {
                    console.error('Error refreshing milestones:', error);

                    // Show error
                    loadingIndicator.style.display = 'none';
                    const errorMessage = document.createElement('div');
                    errorMessage.textContent = 'Error refreshing milestones.';
                    errorMessage.style.color = '#dc3545';
                    errorMessage.style.textAlign = 'center';
                    errorMessage.style.padding = '10px';

                    milestonesGrid.innerHTML = '';
                    milestonesGrid.appendChild(errorMessage);

                    // Show notification
                    this.notification.error('Failed to refresh milestones');
                });
            });
        }).catch(error => {
            console.error('Error loading milestones:', error);

            // Show error
            loadingIndicator.textContent = 'Error loading milestones.';
            loadingIndicator.style.color = '#dc3545';
        });
    }
}

// File: lib/ui/managers/SettingsManager.js
// SettingsManager.js - Manages application settings and UI
/**
 * Manager for application settings
 */
window.SettingsManager = class SettingsManager {
    /**
     * Constructor for SettingsManager
     * @param {Object} options - Configuration options
     * @param {Object} options.labelManager - Label manager instance
     * @param {Object} options.assigneeManager - Assignee manager instance
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Function} options.onSettingsChanged - Callback when settings change
     */
    constructor(options = {}) {
        this.labelManager = options.labelManager;
        this.assigneeManager = options.assigneeManager;
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.onSettingsChanged = options.onSettingsChanged || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Store fetched assignees
        this.availableAssignees = [];
        this.isLoadingAssignees = false;
    }

    /**
     * Create and open settings modal with enhanced UI
     */
    openSettingsModal() {
        // Create modal overlay (background)
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'git-helper-settings-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content container - make it wider
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '700px'; // Wider for better readability
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Settings';
        modalTitle.style.margin = '0';

        const closeButton = document.createElement('button');
        closeButton.innerHTML = '&times;';
        closeButton.style.backgroundColor = 'transparent';
        closeButton.style.border = 'none';
        closeButton.style.fontSize = '24px';
        closeButton.style.cursor = 'pointer';
        closeButton.style.padding = '0 5px';
        closeButton.onclick = () => modalOverlay.remove();

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeButton);

        // Create content container
        const contentContainer = document.createElement('div');

        // Create collapsible sections
        this.createCollapsibleSection(
            contentContainer,
            'Assignees',
            'Manage assignees for quick access in comments',
            (container) => this.createAssigneeSettings(container),
            true // Start expanded
        );

        this.createCollapsibleSection(
            contentContainer,
            'Labels',
            'Manage which labels appear in the dropdown menus',
            (container) => this.createLabelWhitelistSettings(container),
            false // Start collapsed
        );

        this.createCollapsibleSection(
            contentContainer,
            'Appearance',
            'Customize the appearance of GitLab Sprint Helper',
            (container) => this.createAppearanceSettings(container),
            false // Start collapsed
        );

        // Add button container at bottom
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.borderTop = '1px solid #eee';
        buttonContainer.style.paddingTop = '15px';

        // Reset to defaults button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset to Defaults';
        resetButton.style.padding = '8px 16px';
        resetButton.style.backgroundColor = '#6c757d';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        resetButton.onclick = () => {
            if (confirm('Are you sure you want to reset all settings to default values?')) {
                this.resetAllSettings();
                modalOverlay.remove();
                this.notification.success('Settings reset to defaults');
            }
        };

        // Close button
        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = 'Close';
        closeModalButton.style.padding = '8px 16px';
        closeModalButton.style.backgroundColor = '#28a745';
        closeModalButton.style.color = 'white';
        closeModalButton.style.border = 'none';
        closeModalButton.style.borderRadius = '4px';
        closeModalButton.style.cursor = 'pointer';
        closeModalButton.onclick = () => {
            modalOverlay.remove();
        };

        buttonContainer.appendChild(resetButton);
        buttonContainer.appendChild(closeModalButton);

        // Assemble the modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentContainer);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close modal when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    /**
     * Create a collapsible section
     * @param {HTMLElement} container - Parent container
     * @param {string} title - Section title
     * @param {string} description - Section description
     * @param {Function} contentBuilder - Function that builds the section content
     * @param {boolean} startExpanded - Whether section should start expanded
     */
    createCollapsibleSection(container, title, description, contentBuilder, startExpanded = false) {
        // Always start collapsed regardless of passed parameter
        startExpanded = false;

        // Create section container
        const section = document.createElement('div');
        section.className = 'settings-section';
        section.style.marginBottom = '15px';
        section.style.border = '1px solid #ddd';
        section.style.borderRadius = '6px';
        section.style.overflow = 'hidden';

        // Create header/toggle
        const header = document.createElement('div');
        header.className = 'settings-section-header';
        header.style.padding = '12px 15px';
        header.style.backgroundColor = '#f8f9fa';
        header.style.borderBottom = startExpanded ? '1px solid #ddd' : 'none';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.cursor = 'pointer';
        header.style.transition = 'background-color 0.2s ease';

        // Add hover effect
        header.addEventListener('mouseenter', () => {
            header.style.backgroundColor = '#e9ecef';
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundColor = '#f8f9fa';
        });

        // Title container
        const titleContainer = document.createElement('div');

        const titleEl = document.createElement('h4');
        titleEl.textContent = title;
        titleEl.style.margin = '0';
        titleEl.style.fontSize = '16px';

        const descEl = document.createElement('div');
        descEl.textContent = description;
        descEl.style.fontSize = '13px';
        descEl.style.color = '#6c757d';
        descEl.style.marginTop = '4px';

        titleContainer.appendChild(titleEl);
        titleContainer.appendChild(descEl);

        // Toggle indicator
        const toggle = document.createElement('span');
        toggle.textContent = startExpanded ? '▼' : '▶';
        toggle.style.fontSize = '14px';
        toggle.style.transition = 'transform 0.3s ease';

        header.appendChild(titleContainer);
        header.appendChild(toggle);

        // Create content container
        const content = document.createElement('div');
        content.className = 'settings-section-content';
        content.style.padding = '15px';
        content.style.display = startExpanded ? 'block' : 'none';
        content.style.backgroundColor = 'white';

        // Build content using the provided function (lazily load content only when opened)
        let contentBuilt = false;

        // Add toggle behavior
        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            toggle.textContent = isExpanded ? '▶' : '▼';
            header.style.borderBottom = isExpanded ? 'none' : '1px solid #ddd';

            // Build content if this is the first time opening
            if (!contentBuilt && !isExpanded) {
                contentBuilder(content);
                contentBuilt = true;
            }
        });

        // Assemble section
        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);

        return section;
    }

    /**
     * Create enhanced assignee settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createAssigneeSettings(container) {
        const assigneeSection = document.createElement('div');

        // Create top actions row
        const actionsRow = document.createElement('div');
        actionsRow.style.display = 'flex';
        actionsRow.style.justifyContent = 'space-between';
        actionsRow.style.marginBottom = '15px';
        actionsRow.style.gap = '10px';

        // Create search input
        const searchContainer = document.createElement('div');
        searchContainer.style.flex = '1';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search assignees...';
        searchInput.style.width = '100%';
        searchInput.style.padding = '8px 10px';
        searchInput.style.borderRadius = '4px';
        searchInput.style.border = '1px solid #ccc';

        searchContainer.appendChild(searchInput);

        // Create fetch button
        const fetchButton = document.createElement('button');
        fetchButton.textContent = 'Fetch GitLab Users';
        fetchButton.style.padding = '8px 12px';
        fetchButton.style.backgroundColor = '#1f75cb';
        fetchButton.style.color = 'white';
        fetchButton.style.border = 'none';
        fetchButton.style.borderRadius = '4px';
        fetchButton.style.cursor = 'pointer';
        fetchButton.onclick = () => this.fetchGitLabUsers(availableListContainer);

        actionsRow.appendChild(searchContainer);
        actionsRow.appendChild(fetchButton);

        assigneeSection.appendChild(actionsRow);

        // Create tabs for Whitelisted vs. Available
        const tabsContainer = document.createElement('div');
        tabsContainer.style.display = 'flex';
        tabsContainer.style.borderBottom = '1px solid #dee2e6';
        tabsContainer.style.marginBottom = '15px';

        const tabs = [
            {id: 'whitelisted', label: 'My Assignees', active: true},
            {id: 'available', label: 'Available Users', active: false}
        ];

        const tabElements = {};
        const tabContents = {};

        // Create tab buttons
        tabs.forEach(tab => {
            const tabElement = document.createElement('div');
            tabElement.textContent = tab.label;
            tabElement.style.padding = '8px 15px';
            tabElement.style.cursor = 'pointer';
            tabElement.style.transition = 'all 0.2s ease';

            if (tab.active) {
                tabElement.style.borderBottom = '2px solid #1f75cb';
                tabElement.style.fontWeight = 'bold';
            }

            // Add hover effect
            tabElement.addEventListener('mouseenter', () => {
                if (!tab.active) {
                    tabElement.style.backgroundColor = '#f5f5f5';
                }
            });

            tabElement.addEventListener('mouseleave', () => {
                if (!tab.active) {
                    tabElement.style.backgroundColor = '';
                }
            });

            // Handle tab clicks
            // Handle tab clicks
            tabElement.addEventListener('click', () => {
                // Deactivate all tabs
                tabs.forEach(t => {
                    t.active = false;
                    tabElements[t.id].style.borderBottom = 'none';
                    tabElements[t.id].style.fontWeight = 'normal';
                    tabElements[t.id].style.backgroundColor = '';
                    tabContents[t.id].style.display = 'none';
                });

                // Activate clicked tab
                tab.active = true;
                tabElement.style.borderBottom = '2px solid #1f75cb';
                tabElement.style.fontWeight = 'bold';
                tabContents[tab.id].style.display = 'block';

                // Refresh the content when tab is clicked
                if (tab.id === 'whitelisted') {
                    // Refresh the whitelist tab
                    this.refreshAssigneeList(assigneeListContainer);
                } else if (tab.id === 'available') {
                    // Always re-fetch available users when tab is clicked
                    this.fetchGitLabUsers(availableListContainer);
                }
            });

            tabElements[tab.id] = tabElement;
            tabsContainer.appendChild(tabElement);
        });

        assigneeSection.appendChild(tabsContainer);

        // Create content containers for each tab
        const whitelistedContent = document.createElement('div');
        whitelistedContent.style.display = 'block';

        const availableContent = document.createElement('div');
        availableContent.style.display = 'none';

        // Populate whitelisted assignees
        const assigneeListContainer = document.createElement('div');
        assigneeListContainer.style.height = '300px'; // Fixed height instead of min/max
        assigneeListContainer.style.overflowY = 'auto';
        assigneeListContainer.style.border = '1px solid #eee';
        assigneeListContainer.style.borderRadius = '4px';

        // Create empty message function
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };

        // Get whitelist from the assignee manager if available
        let assignees = [];
        if (this.assigneeManager) {
            assignees = this.assigneeManager.getAssigneeWhitelist();
        } else {
            assignees = getAssigneeWhitelist();
        }

        // Populate whitelist
        if (assignees.length > 0) {
            assignees.forEach((assignee, index) => {
                assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
            });
        } else {
            assigneeListContainer.appendChild(createEmptyMessage());
        }

        whitelistedContent.appendChild(assigneeListContainer);

        // Add manual assignee form to whitelisted tab
        whitelistedContent.appendChild(this.createAddAssigneeForm(assigneeListContainer, createEmptyMessage));

        // Create available users container
        const availableListContainer = document.createElement('div');
        availableListContainer.className = 'available-assignees-list';
        availableListContainer.style.height = '300px'; // Fixed height instead of min/max
        availableListContainer.style.overflowY = 'auto';
        availableListContainer.style.border = '1px solid #eee';
        availableListContainer.style.borderRadius = '4px';

        // Add loading or empty message initially
        const availableEmptyMessage = document.createElement('div');
        availableEmptyMessage.textContent = 'Click "Fetch GitLab Users" to load available assignees.';
        availableEmptyMessage.style.padding = '15px';
        availableEmptyMessage.style.color = '#666';
        availableEmptyMessage.style.fontStyle = 'italic';
        availableEmptyMessage.style.textAlign = 'center';

        availableListContainer.appendChild(availableEmptyMessage);
        availableContent.appendChild(availableListContainer);

        // Store references to content containers
        tabContents['whitelisted'] = whitelistedContent;
        tabContents['available'] = availableContent;

        // Add content containers to section
        assigneeSection.appendChild(whitelistedContent);
        assigneeSection.appendChild(availableContent);

        // Add search functionality
        searchInput.addEventListener('input', () => {
            const searchText = searchInput.value.toLowerCase();
            const activeTab = tabs.find(t => t.active).id;

            // Determine which list to search based on active tab
            const list = activeTab === 'whitelisted' ? assigneeListContainer : availableListContainer;
            const items = list.querySelectorAll('.assignee-item');

            // Filter items
            items.forEach(item => {
                const nameEl = item.querySelector('.assignee-name');
                const usernameEl = item.querySelector('.assignee-username');

                if (!nameEl || !usernameEl) return;

                const name = nameEl.textContent.toLowerCase();
                const username = usernameEl.textContent.toLowerCase();

                if (name.includes(searchText) || username.includes(searchText)) {
                    item.style.display = '';
                } else {
                    item.style.display = 'none';
                }
            });
        });

        container.appendChild(assigneeSection);
    }

    /**
     * Create form to add assignees manually
     * @param {HTMLElement} listContainer - Container for assignee list
     * @param {Function} createEmptyMessage - Function to create empty message
     * @returns {HTMLElement} Form container
     */
    createAddAssigneeForm(listContainer, createEmptyMessage) {
        const addForm = document.createElement('div');
        addForm.style.marginTop = '15px';
        addForm.style.padding = '15px';
        addForm.style.backgroundColor = '#f8f9fa';
        addForm.style.borderRadius = '4px';

        const formTitle = document.createElement('h5');
        formTitle.textContent = 'Add New Assignee';
        formTitle.style.marginTop = '0';
        formTitle.style.marginBottom = '10px';

        // Create name field
        const nameContainer = document.createElement('div');
        nameContainer.style.marginBottom = '10px';

        const nameLabel = document.createElement('label');
        nameLabel.textContent = 'Display Name:';
        nameLabel.style.display = 'block';
        nameLabel.style.marginBottom = '5px';

        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.placeholder = 'John Doe';
        nameInput.style.width = '100%';
        nameInput.style.padding = '6px 10px';
        nameInput.style.borderRadius = '4px';
        nameInput.style.border = '1px solid #ccc';

        nameContainer.appendChild(nameLabel);
        nameContainer.appendChild(nameInput);

        // Create username field
        const usernameContainer = document.createElement('div');
        usernameContainer.style.marginBottom = '15px';

        const usernameLabel = document.createElement('label');
        usernameLabel.textContent = 'GitLab Username:';
        usernameLabel.style.display = 'block';
        usernameLabel.style.marginBottom = '5px';

        const usernameInput = document.createElement('input');
        usernameInput.type = 'text';
        usernameInput.placeholder = 'username (without @)';
        usernameInput.style.width = '100%';
        usernameInput.style.padding = '6px 10px';
        usernameInput.style.borderRadius = '4px';
        usernameInput.style.border = '1px solid #ccc';

        usernameContainer.appendChild(usernameLabel);
        usernameContainer.appendChild(usernameInput);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';

        const addButton = document.createElement('button');
        addButton.textContent = 'Add Assignee';
        addButton.style.padding = '6px 12px';
        addButton.style.backgroundColor = '#28a745';
        addButton.style.color = 'white';
        addButton.style.border = 'none';
        addButton.style.borderRadius = '4px';
        addButton.style.cursor = 'pointer';

        addButton.onclick = () => {
            const name = nameInput.value.trim();
            const username = usernameInput.value.trim();

            if (!username) {
                this.notification.error('Username is required');
                return;
            }

            // Add to whitelist
            const newAssignee = {
                name: name || username,
                username: username
            };

            // Check if we should use the assigneeManager
            if (this.assigneeManager) {
                this.assigneeManager.addAssignee(newAssignee);
            } else {
                // Direct add to whitelist
                const assignees = getAssigneeWhitelist();
                const existingIndex = assignees.findIndex(a => a.username === username);

                if (existingIndex >= 0) {
                    // Update existing
                    assignees[existingIndex] = newAssignee;
                } else {
                    // Add new
                    assignees.push(newAssignee);
                }

                // Save whitelist
                saveAssigneeWhitelist(assignees);
            }

            // Refresh the list
            const emptyMessage = listContainer.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // Add the new assignee to the list
            const assignees = getAssigneeWhitelist();
            listContainer.appendChild(this.createAssigneeListItem(
                newAssignee,
                assignees.length - 1,
                listContainer,
                createEmptyMessage
            ));

            // Clear inputs
            nameInput.value = '';
            usernameInput.value = '';

            // Show success message
            this.notification.success(`Added assignee: ${newAssignee.name}`);

            // Notify of change
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttonContainer.appendChild(addButton);

        // Assemble the form
        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(buttonContainer);

        return addForm;
    }

    /**
     * Fetch GitLab users from API
     * @param {HTMLElement} container - Container to display users in
     */
    /**
     * Fetch GitLab users from API
     * @param {HTMLElement} container - Container to display users in
     */
    async fetchGitLabUsers(container) {
        if (!this.gitlabApi) {
            this.notification.error('GitLab API not available');
            return;
        }

        // Show loading state
        this.isLoadingAssignees = true;
        container.innerHTML = '';

        const loadingMessage = document.createElement('div');
        loadingMessage.textContent = 'Loading users from GitLab...';
        loadingMessage.style.padding = '15px';
        loadingMessage.style.textAlign = 'center';
        container.appendChild(loadingMessage);

        try {
            // Get path info for current project/group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }

            // Fetch users based on path info
            let users = [];
            if (pathInfo.type === 'project') {
                users = await this.gitlabApi.callGitLabApi(
                    `projects/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            } else if (pathInfo.type === 'group') {
                users = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            }

            // Process and store users
            this.availableAssignees = users.map(user => ({
                id: user.id,
                name: user.name,
                username: user.username,
                avatar_url: user.avatar_url
            }));

            // Display users
            this.renderAvailableUsers(container);

        } catch (error) {
            console.error('Error fetching GitLab users:', error);

            container.innerHTML = '';
            const errorMessage = document.createElement('div');
            errorMessage.textContent = `Error loading users: ${error.message}`;
            errorMessage.style.padding = '15px';
            errorMessage.style.color = '#dc3545';
            errorMessage.style.textAlign = 'center';
            container.appendChild(errorMessage);

            this.notification.error('Failed to load GitLab users');
        } finally {
            this.isLoadingAssignees = false;
        }
    }

    /**
     * Render available users in container
     * @param {HTMLElement} container - Container to render users in
     */
    renderAvailableUsers(container) {
        // Clear container
        container.innerHTML = '';

        // Get current whitelist for comparison
        const whitelist = getAssigneeWhitelist();
        const whitelistUsernames = whitelist.map(a => a.username.toLowerCase());

        if (this.availableAssignees.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No users found. Try fetching again.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            container.appendChild(emptyMessage);
            return;
        }

        // Sort users alphabetically
        this.availableAssignees.sort((a, b) => a.name.localeCompare(b.name));

        // Create user items
        this.availableAssignees.forEach(user => {
            const isWhitelisted = whitelistUsernames.includes(user.username.toLowerCase());

            const userItem = document.createElement('div');
            userItem.className = 'assignee-item';
            userItem.style.display = 'flex';
            userItem.style.justifyContent = 'space-between';
            userItem.style.alignItems = 'center';
            userItem.style.padding = '10px 15px';
            userItem.style.borderBottom = '1px solid #eee';
            userItem.style.backgroundColor = isWhitelisted ? 'rgba(40, 167, 69, 0.05)' : '';

            // User info section
            const userInfo = document.createElement('div');
            userInfo.style.display = 'flex';
            userInfo.style.alignItems = 'center';

            // Avatar
            if (user.avatar_url) {
                const avatar = document.createElement('img');
                avatar.src = user.avatar_url;
                avatar.style.width = '30px';
                avatar.style.height = '30px';
                avatar.style.borderRadius = '50%';
                avatar.style.marginRight = '10px';
                userInfo.appendChild(avatar);
            } else {
                // Placeholder avatar
                const avatarPlaceholder = document.createElement('div');
                avatarPlaceholder.style.width = '30px';
                avatarPlaceholder.style.height = '30px';
                avatarPlaceholder.style.borderRadius = '50%';
                avatarPlaceholder.style.backgroundColor = '#e0e0e0';
                avatarPlaceholder.style.display = 'flex';
                avatarPlaceholder.style.alignItems = 'center';
                avatarPlaceholder.style.justifyContent = 'center';
                avatarPlaceholder.style.marginRight = '10px';
                avatarPlaceholder.style.fontWeight = 'bold';
                avatarPlaceholder.style.color = '#666';

                // Get initials
                const name = user.name || user.username;
                const initials = name.split(' ')
                    .map(part => part.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                avatarPlaceholder.textContent = initials;
                userInfo.appendChild(avatarPlaceholder);
            }

            // User details
            const userDetails = document.createElement('div');

            const userName = document.createElement('div');
            userName.className = 'assignee-name';
            userName.textContent = user.name;
            userName.style.fontWeight = 'bold';

            const userUsername = document.createElement('div');
            userUsername.className = 'assignee-username';
            userUsername.textContent = `@${user.username}`;
            userUsername.style.fontSize = '12px';
            userUsername.style.color = '#666';

            userDetails.appendChild(userName);
            userDetails.appendChild(userUsername);
            userInfo.appendChild(userDetails);

            // Action button
            const actionButton = document.createElement('button');

            if (isWhitelisted) {
                actionButton.textContent = 'Added ✓';
                actionButton.style.backgroundColor = '#e9ecef';
                actionButton.style.color = '#28a745';
                actionButton.style.cursor = 'default';
            } else {
                actionButton.textContent = 'Add';
                actionButton.style.backgroundColor = '#28a745';
                actionButton.style.color = 'white';
                actionButton.style.cursor = 'pointer';

                // Add event listener
                actionButton.addEventListener('click', () => {
                    // Add to whitelist
                    const assignee = {
                        name: user.name,
                        username: user.username
                    };

                    if (this.assigneeManager) {
                        this.assigneeManager.addAssignee(assignee);
                    } else {
                        const whitelist = getAssigneeWhitelist();
                        whitelist.push(assignee);
                        saveAssigneeWhitelist(whitelist);
                    }

                    // Update UI
                    actionButton.textContent = 'Added ✓';
                    actionButton.style.backgroundColor = '#e9ecef';
                    actionButton.style.color = '#28a745';
                    actionButton.style.cursor = 'default';
                    userItem.style.backgroundColor = 'rgba(40, 167, 69, 0.05)';

                    // Show notification
                    this.notification.success(`Added ${user.name} to assignees`);

                    // Notify of change
                    if (typeof this.onSettingsChanged === 'function') {
                        this.onSettingsChanged('assignees');
                    }

                    // Refresh the whitelisted assignees tab
                    this.refreshWhitelistedTab();
                });
            }

            actionButton.style.padding = '5px 10px';
            actionButton.style.border = 'none';
            actionButton.style.borderRadius = '4px';
            actionButton.style.fontSize = '12px';

            userItem.appendChild(userInfo);
            userItem.appendChild(actionButton);
            container.appendChild(userItem);
        });
    }

    /**
     * Refresh the whitelisted assignees tab
     * This is a new function to update the UI when assignees change
     */
    refreshWhitelistedTab() {
        // Find the whitelisted assignees container
        const whitelistedContent = document.querySelector('div[style*="display: block"]'); // Currently visible content
        if (!whitelistedContent) return;

        // Find the assignee list container
        const assigneeListContainer = whitelistedContent.querySelector('div[style*="overflowY: auto"]');
        if (!assigneeListContainer) return;

        // Create empty message function
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };

        // Clear current list
        assigneeListContainer.innerHTML = '';

        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Refreshing assignees...';
        loadingIndicator.style.padding = '15px';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.color = '#666';

        assigneeListContainer.appendChild(loadingIndicator);

        // Get current whitelist - with a slight delay to show loading
        setTimeout(() => {
            // Get freshly loaded whitelist
            let assignees = [];
            if (this.assigneeManager) {
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
            }

            // Clear loading indicator
            assigneeListContainer.innerHTML = '';

            // Populate whitelist
            if (assignees.length > 0) {
                assignees.forEach((assignee, index) => {
                    assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
                });
            } else {
                assigneeListContainer.appendChild(createEmptyMessage());
            }
        }, 300); // Short delay to show loading
    }

    /**
     * Create an assignee list item
     * @param {Object} assignee - Assignee object
     * @param {number} index - Index in the list
     * @param {HTMLElement} listContainer - List container
     * @param {Function} createEmptyMessage - Function to create empty message
     * @returns {HTMLElement} Assignee list item
     */
    createAssigneeListItem(assignee, index, listContainer, createEmptyMessage) {
        const item = document.createElement('div');
        item.className = 'assignee-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px 15px';
        item.style.borderBottom = '1px solid #eee';

        // Create assignee info
        const info = document.createElement('div');
        info.style.display = 'flex';
        info.style.alignItems = 'center';

        // Create avatar placeholder
        const avatar = document.createElement('div');
        avatar.style.width = '30px';
        avatar.style.height = '30px';
        avatar.style.borderRadius = '50%';
        avatar.style.backgroundColor = '#e0e0e0';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.marginRight = '10px';
        avatar.style.fontWeight = 'bold';
        avatar.style.color = '#666';

        // Get initials
        const name = assignee.name || assignee.username;
        const initials = name.split(' ')
            .map(part => part.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase();

        avatar.textContent = initials;
        info.appendChild(avatar);

        // Create name container
        const nameContainer = document.createElement('div');

        const displayName = document.createElement('div');
        displayName.className = 'assignee-name';
        displayName.textContent = assignee.name || assignee.username;
        displayName.style.fontWeight = 'bold';

        const username = document.createElement('div');
        username.className = 'assignee-username';
        username.textContent = `@${assignee.username}`;
        username.style.fontSize = '12px';
        username.style.color = '#666';

        nameContainer.appendChild(displayName);
        nameContainer.appendChild(username);
        info.appendChild(nameContainer);

        // Create buttons container
        const buttons = document.createElement('div');

        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.style.padding = '5px 10px';
        removeButton.style.backgroundColor = '#dc3545';
        removeButton.style.color = 'white';
        removeButton.style.border = 'none';
        removeButton.style.borderRadius = '4px';
        removeButton.style.cursor = 'pointer';
        removeButton.style.fontSize = '12px';

        removeButton.onclick = () => {
            // Get current assignees
            let assignees = [];

            if (this.assigneeManager) {
                this.assigneeManager.removeAssignee(assignee.username);
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
                // Remove assignee
                const filteredAssignees = assignees.filter(a =>
                    a.username.toLowerCase() !== assignee.username.toLowerCase()
                );
                // Save whitelist
                saveAssigneeWhitelist(filteredAssignees);
                assignees = filteredAssignees;
            }

            // Remove from list
            item.remove();

            // Show empty message if no assignees left
            if (assignees.length === 0) {
                listContainer.appendChild(createEmptyMessage());
            }

            // Show success message
            this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);

            // Notify of change
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttons.appendChild(removeButton);

        // Assemble item
        item.appendChild(info);
        item.appendChild(buttons);

        return item;
    }


    /**
     * Create label whitelist settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createLabelWhitelistSettings(container) {
        const whitelistSection = document.createElement('div');
        whitelistSection.style.marginBottom = '20px';

        const whitelistTitle = document.createElement('h4');
        whitelistTitle.textContent = 'Label Whitelist';
        whitelistTitle.style.marginBottom = '10px';

        const whitelistDescription = document.createElement('p');
        whitelistDescription.textContent = 'Select which labels should appear in the dropdown. The system will show any label that contains these terms.';
        whitelistDescription.style.marginBottom = '15px';
        whitelistDescription.style.fontSize = '14px';
        whitelistDescription.style.color = '#666';

        whitelistSection.appendChild(whitelistTitle);
        whitelistSection.appendChild(whitelistDescription);

        // Add loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'whitelist-loading-message';
        loadingMessage.textContent = 'Loading all labels from GitLab...';  // Updated text
        loadingMessage.style.fontStyle = 'italic';
        loadingMessage.style.color = '#666';
        whitelistSection.appendChild(loadingMessage);

        // Create whitelist container with fixed height
        const whitelistContainer = document.createElement('div');
        whitelistContainer.id = 'whitelist-container';
        whitelistContainer.style.display = 'flex';
        whitelistContainer.style.flexWrap = 'wrap';
        whitelistContainer.style.gap = '10px';
        whitelistContainer.style.marginTop = '15px';
        whitelistContainer.style.height = '300px'; // Fixed height
        whitelistContainer.style.overflowY = 'auto';
        whitelistContainer.style.border = '1px solid #eee';
        whitelistContainer.style.borderRadius = '4px';
        whitelistContainer.style.padding = '10px';
        whitelistSection.appendChild(whitelistContainer);

        // Load current whitelist
        const currentWhitelist = getLabelWhitelist();

        // Fix: Ensure currentWhitelist is an array
        const safeWhitelist = Array.isArray(currentWhitelist) ? currentWhitelist : [];

        // Direct API call to get ALL project labels, bypassing any filtering
        const fetchAndDisplayAllLabels = async () => {
            try {
                if (!this.gitlabApi) {
                    throw new Error('GitLab API not available');
                }

                // Get path info for current project/group
                const pathInfo = getPathFromUrl();

                if (!pathInfo || !pathInfo.apiUrl) {
                    throw new Error('Could not determine project/group path');
                }

                // Make a direct API call to get ALL labels
                const allLabels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                    params: { per_page: 100 }
                });

                // Display all labels with appropriate ones checked
                displayLabels(allLabels);
            } catch (error) {
                console.error('Error fetching ALL labels:', error);
                loadingMessage.textContent = 'Error loading labels. ' + error.message;
                loadingMessage.style.color = '#dc3545';
            }
        };

        // Function to display labels in the container
        const displayLabels = (labels) => {
            // Remove loading message
            loadingMessage.remove();

            if (!labels || labels.length === 0) {
                const noLabelsMessage = document.createElement('div');
                noLabelsMessage.textContent = 'No labels found in this project.';
                noLabelsMessage.style.width = '100%';
                noLabelsMessage.style.textAlign = 'center';
                noLabelsMessage.style.marginBottom = '15px';
                noLabelsMessage.style.color = '#666';
                whitelistContainer.appendChild(noLabelsMessage);
                return;
            }

            // Sort labels alphabetically
            labels.sort((a, b) => a.name.localeCompare(b.name));

            // Create a checkbox for each unique label
            const seenLabels = new Set();

            labels.forEach(label => {
                // Skip duplicate labels
                if (seenLabels.has(label.name.toLowerCase())) return;
                seenLabels.add(label.name.toLowerCase());

                // Create checkbox container
                const checkboxContainer = document.createElement('div');
                checkboxContainer.style.display = 'flex';
                checkboxContainer.style.alignItems = 'center';
                checkboxContainer.style.marginBottom = '10px';
                checkboxContainer.style.width = 'calc(33.33% - 10px)'; // 3 columns with gap

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `label-${label.name}`;
                checkbox.dataset.label = label.name.toLowerCase();
                checkbox.style.marginRight = '8px';

                // Check if this label or term is in the whitelist
                const isWhitelisted = safeWhitelist.some(term =>
                    label.name.toLowerCase().includes(term.toLowerCase())
                );
                checkbox.checked = isWhitelisted;

                // Create GitLab-styled label
                const labelElement = this.createGitLabStyleLabel(label);

                // Make the label clickable to toggle the checkbox
                labelElement.style.cursor = 'pointer';
                labelElement.onclick = () => {
                    checkbox.checked = !checkbox.checked;
                    this.autoSaveWhitelist(whitelistContainer); // Auto-save when toggled
                };

                // Auto-save when checkbox changes
                checkbox.addEventListener('change', () => {
                    this.autoSaveWhitelist(whitelistContainer);
                });

                // Add label and checkbox to container
                checkboxContainer.appendChild(checkbox);
                checkboxContainer.appendChild(labelElement);
                whitelistContainer.appendChild(checkboxContainer);
            });

            console.log(`Displayed ${labels.length} labels from GitLab API`);
        };

        // Start fetching labels from API directly
        fetchAndDisplayAllLabels();

        container.appendChild(whitelistSection);
    }

    /**
     * Refresh the assignee list in the settings tab
     * @param {HTMLElement} container - The container element for the assignee list
     */
    refreshAssigneeList(container) {
        if (!container) return;

        // Show loading state
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Refreshing assignees...';
        loadingIndicator.style.padding = '15px';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.color = '#666';

        // Clear the container and show loading
        container.innerHTML = '';
        container.appendChild(loadingIndicator);

        // Create empty message function
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };

        // Short delay to show loading state
        setTimeout(() => {
            // Get fresh whitelist data
            let assignees = [];
            if (this.assigneeManager) {
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
            }

            // Clear the container
            container.innerHTML = '';

            // Populate with assignees or show empty message
            if (assignees.length > 0) {
                assignees.forEach((assignee, index) => {
                    container.appendChild(this.createAssigneeListItem(assignee, index, container, createEmptyMessage));
                });
            } else {
                container.appendChild(createEmptyMessage());
            }
        }, 300);
    }
    /**
     * Create appearance settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createAppearanceSettings(container) {
        const appearanceSection = document.createElement('div');

        const title = document.createElement('h4');
        title.textContent = 'Appearance Settings';
        title.style.marginBottom = '10px';

        const description = document.createElement('p');
        description.textContent = 'Customize the appearance of the GitLab Sprint Helper.';
        description.style.marginBottom = '15px';
        description.style.fontSize = '14px';
        description.style.color = '#666';

        appearanceSection.appendChild(title);
        appearanceSection.appendChild(description);

        // Add settings coming soon message
        const comingSoon = document.createElement('div');
        comingSoon.style.padding = '20px';
        comingSoon.style.textAlign = 'center';
        comingSoon.style.backgroundColor = '#f8f9fa';
        comingSoon.style.borderRadius = '4px';
        comingSoon.style.color = '#666';
        comingSoon.textContent = 'Appearance settings coming soon!';

        appearanceSection.appendChild(comingSoon);

        container.appendChild(appearanceSection);
    }

    /**
     * Create a GitLab-styled label element
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createGitLabStyleLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.name;

        // Use provided color or generate one
        const bgColor = label.color || generateColorFromString(label.name);

        // Calculate text color (black or white) based on background color brightness
        const textColor = getContrastColor(bgColor);

        // Apply GitLab label styles
        labelElement.style.backgroundColor = bgColor;
        labelElement.style.color = textColor;
        labelElement.style.padding = '4px 8px';
        labelElement.style.borderRadius = '100px'; // Rounded pill shape
        labelElement.style.fontSize = '12px';
        labelElement.style.fontWeight = '500';
        labelElement.style.display = 'inline-block';
        labelElement.style.margin = '2px';
        labelElement.style.maxWidth = '100%';
        labelElement.style.overflow = 'hidden';
        labelElement.style.textOverflow = 'ellipsis';
        labelElement.style.whiteSpace = 'nowrap';

        return labelElement;
    }

    /**
     * Create whitelist editor with checkboxes for all available labels
     * @param {HTMLElement} container - Container to add whitelist editor to
     */
    /**
     * Create whitelist editor with checkboxes for all available labels
     * @param {HTMLElement} container - Container to add whitelist editor to
     */
    createWhitelistEditor(container) {
        // Add loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'whitelist-loading-message';
        loadingMessage.textContent = 'Loading available labels...';
        loadingMessage.style.fontStyle = 'italic';
        loadingMessage.style.color = '#666';
        container.appendChild(loadingMessage);

        // Create whitelist container with flex layout
        const whitelistContainer = document.createElement('div');
        whitelistContainer.id = 'whitelist-container';
        whitelistContainer.style.display = 'flex';
        whitelistContainer.style.flexWrap = 'wrap';
        whitelistContainer.style.gap = '10px';
        whitelistContainer.style.marginTop = '15px';
        container.appendChild(whitelistContainer);

        // Load current whitelist
        currentWhitelist = getLabelWhitelist();

        // Fix: Ensure currentWhitelist is an array
        if (!Array.isArray(currentWhitelist)) {
            console.warn("Whitelist is not an array, using default");
            currentWhitelist = [];
        }

        // Get all available labels from API
        if (this.labelManager) {
            this.labelManager.fetchAllLabels().then(allLabels => {
                // Remove loading message
                loadingMessage.remove();

                if (!allLabels || allLabels.length === 0) {
                    const noLabelsMessage = document.createElement('div');
                    noLabelsMessage.textContent = 'No labels found. Showing whitelist terms instead.';
                    noLabelsMessage.style.width = '100%';
                    noLabelsMessage.style.marginBottom = '15px';
                    whitelistContainer.appendChild(noLabelsMessage);

                    // Show the current whitelist terms as checkboxes
                    this.showWhitelistTermsOnly(whitelistContainer, currentWhitelist);
                    return;
                }

                // Continue with original code for showing labels...
                // Sort labels alphabetically
                allLabels.sort((a, b) => a.name.localeCompare(b.name));

                // Create a checkbox for each unique label
                const seenLabels = new Set();

                allLabels.forEach(label => {
                    // Skip duplicate labels
                    if (seenLabels.has(label.name.toLowerCase())) return;
                    seenLabels.add(label.name.toLowerCase());

                    // Create checkbox container
                    const checkboxContainer = document.createElement('div');
                    checkboxContainer.style.display = 'flex';
                    checkboxContainer.style.alignItems = 'center';
                    checkboxContainer.style.marginBottom = '10px';
                    checkboxContainer.style.width = 'calc(33.33% - 10px)'; // 3 columns with gap

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `label-${label.name}`;
                    checkbox.dataset.label = label.name.toLowerCase();
                    checkbox.style.marginRight = '8px';

                    // Check if this label is in the whitelist
                    if (this.labelManager.isLabelInWhitelist(label.name, currentWhitelist)) {
                        checkbox.checked = true;
                    }

                    // Create GitLab-styled label
                    const labelElement = this.createGitLabStyleLabel(label);

                    // Make the label clickable to toggle the checkbox
                    labelElement.style.cursor = 'pointer';
                    labelElement.onclick = () => {
                        checkbox.checked = !checkbox.checked;
                    };

                    // Add label and checkbox to container
                    checkboxContainer.appendChild(checkbox);
                    checkboxContainer.appendChild(labelElement);
                    whitelistContainer.appendChild(checkboxContainer);
                });

                // Add custom input for adding custom terms
                const customInputContainer = document.createElement('div');
                customInputContainer.style.width = '100%';
                customInputContainer.style.marginTop = '20px';
                customInputContainer.style.padding = '15px';
                customInputContainer.style.borderTop = '1px solid #ddd';

                const customInputLabel = document.createElement('div');
                customInputLabel.textContent = 'Add custom terms (comma separated):';
                customInputLabel.style.marginBottom = '8px';
                customInputLabel.style.fontWeight = 'bold';

                const customInput = document.createElement('input');
                customInput.type = 'text';
                customInput.id = 'custom-whitelist-terms';
                customInput.style.width = '100%';
                customInput.style.padding = '8px';
                customInput.style.borderRadius = '4px';
                customInput.style.border = '1px solid #ccc';

                // Fixed - Add custom terms from whitelist that aren't in labels
                const labelTerms = Array.from(seenLabels);

                // Filter custom terms safely with appropriate checks
                let customTerms = [];
                if (Array.isArray(currentWhitelist)) {
                    customTerms = currentWhitelist.filter(term => {
                        // Make sure term is a string
                        if (typeof term !== 'string') return false;

                        // Check if any label includes this term
                        return !labelTerms.some(label =>
                            label.includes(term.toLowerCase())
                        );
                    });
                }

                customInput.value = customTerms.join(', ');

                customInputContainer.appendChild(customInputLabel);
                customInputContainer.appendChild(customInput);
                whitelistContainer.appendChild(customInputContainer);
            }).catch(error => {
                console.error('Error fetching labels for whitelist editor:', error);
                loadingMessage.textContent = 'Error loading labels. Using whitelist terms instead.';
                loadingMessage.style.color = '#dc3545';

                // Show the current whitelist terms
                this.showWhitelistTermsOnly(whitelistContainer, currentWhitelist);
            });
        } else {
            loadingMessage.textContent = 'Label manager not available. Using whitelist terms instead.';
            loadingMessage.style.color = '#dc3545';

            // Show the current whitelist terms
            this.showWhitelistTermsOnly(whitelistContainer, currentWhitelist);
        }
    }

    /*** Display only the whitelist terms when label manager isn't available
     * @param {HTMLElement} container - Container element
     * @param {Array} whitelist - Whitelist terms
     */
    showWhitelistTermsOnly(container, whitelist) {
        // Ensure whitelist is an array
        if (!Array.isArray(whitelist)) {
            console.warn("Whitelist is not an array in showWhitelistTermsOnly");
            whitelist = [];
        }

        // Create checkboxes for each whitelist term
        whitelist.forEach(term => {
            // Skip invalid terms
            if (typeof term !== 'string') return;

            // Create checkbox container
            const checkboxContainer = document.createElement('div');
            checkboxContainer.style.display = 'flex';
            checkboxContainer.style.alignItems = 'center';
            checkboxContainer.style.marginBottom = '10px';
            checkboxContainer.style.width = 'calc(33.33% - 10px)'; // 3 columns with gap

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `label-${term}`;
            checkbox.dataset.label = term.toLowerCase();
            checkbox.style.marginRight = '8px';
            checkbox.checked = true;

            // Create label element
            const labelElement = document.createElement('span');
            labelElement.textContent = term;
            labelElement.style.padding = '4px 8px';
            labelElement.style.borderRadius = '100px';
            labelElement.style.fontSize = '12px';
            labelElement.style.fontWeight = '500';
            labelElement.style.display = 'inline-block';
            labelElement.style.margin = '2px';
            labelElement.style.backgroundColor = generateColorFromString(term);
            labelElement.style.color = getContrastColor(labelElement.style.backgroundColor);

            // Make the label clickable to toggle the checkbox
            labelElement.style.cursor = 'pointer';
            labelElement.onclick = () => {
                checkbox.checked = !checkbox.checked;
            };

            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(labelElement);
            container.appendChild(checkboxContainer);
        });

        // Add custom input for adding custom terms
        const customInputContainer = document.createElement('div');
        customInputContainer.style.width = '100%';
        customInputContainer.style.marginTop = '20px';
        customInputContainer.style.padding = '15px';
        customInputContainer.style.borderTop = '1px solid #ddd';

        const customInputLabel = document.createElement('div');
        customInputLabel.textContent = 'Add custom terms (comma separated):';
        customInputLabel.style.marginBottom = '8px';
        customInputLabel.style.fontWeight = 'bold';

        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.id = 'custom-whitelist-terms';
        customInput.style.width = '100%';
        customInput.style.padding = '8px';
        customInput.style.borderRadius = '4px';
        customInput.style.border = '1px solid #ccc';

        customInputContainer.appendChild(customInputLabel);
        customInputContainer.appendChild(customInput);
        container.appendChild(customInputContainer);
    }

    /**
     * Save whitelist settings from checkboxes and custom input
     */
    saveWhitelistSettings() {
        const newWhitelist = [];
        const addedTerms = new Set(); // Track already added terms to prevent duplicates

        // Get all checked labels
        const checkboxes = document.querySelectorAll('#whitelist-container input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const term = checkbox.dataset.label.toLowerCase();
                if (!addedTerms.has(term)) {
                    newWhitelist.push(term);
                    addedTerms.add(term);
                }
            }
        });

        // Get custom terms
        const customInput = document.getElementById('custom-whitelist-terms');
        if (customInput && customInput.value) {
            const customTerms = customInput.value.split(',').map(term => term.trim().toLowerCase());
            customTerms.forEach(term => {
                if (term && !addedTerms.has(term)) {
                    newWhitelist.push(term);
                    addedTerms.add(term);
                }
            });
        }

        // Save to storage
        saveLabelWhitelist(newWhitelist);

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.saveWhitelist(newWhitelist);
        }

        // Show success notification
        if (this.notification) {
            this.notification.success(`Saved ${newWhitelist.length} whitelist terms`);
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    /**
     * Reset label whitelist to defaults
     */
    resetLabelWhitelist() {
        resetLabelWhitelist();

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.resetToDefaultWhitelist();
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    /**
     * Reset all settings to defaults
     */
    resetAllSettings() {
        // Reset label whitelist
        this.resetLabelWhitelist();

        // No default assignees, so just clear them
        saveAssigneeWhitelist([]);

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('all');
        }
    }

    /**
     * Auto-save whitelist settings from checkboxes
     * @param {HTMLElement} container - The container with checkboxes
     */
    /**
     * Auto-save whitelist settings from checkboxes
     * @param {HTMLElement} container - The container with checkboxes
     */
    autoSaveWhitelist(container) {
        const newWhitelist = [];
        const addedTerms = new Set(); // Track already added terms to prevent duplicates

        // Get all checked labels
        const checkboxes = container.querySelectorAll('input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const term = checkbox.dataset.label.toLowerCase();
                if (!addedTerms.has(term)) {
                    newWhitelist.push(term);
                    addedTerms.add(term);
                }
            }
        });

        // Save to storage
        saveLabelWhitelist(newWhitelist);

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.saveWhitelist(newWhitelist);
        }

        // Show success notification
        if (this.notification) {
            this.notification.success(`Label whitelist updated`);
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }

        console.log(`Saved ${newWhitelist.length} labels to whitelist`);
    }

}

// File: lib/ui/views/SummaryView.js
// SummaryView.js - Manages the Summary tab UI
/**
 * View for the Summary tab
 */
window.SummaryView = class SummaryView {
    /**
     * Constructor for SummaryView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    /**
     * Render or update the Summary tab with data
     * @param {Object} assigneeTimeMap - Map of assignee names to time estimates
     * @param {number} totalEstimate - Total time estimate in seconds
     * @param {number} cardsProcessed - Number of cards processed
     * @param {number} cardsWithTime - Number of cards with time estimates
     * @param {string} currentMilestone - Current milestone name
     * @param {Object} boardData - Data for each board
     * @param {Object} boardAssigneeData - Assignee data for each board
     */
    render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');

        if (!summaryContent) return;

        // Clear existing content
        summaryContent.innerHTML = '';

        // Update board stats in the UI Manager
        this.uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: this.getClosedBoardCount()
        });

        // Handle case with no data
        if (cardsWithTime === 0) {
            this.renderNoDataMessage(summaryContent);

            // Remove loading screen
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('summary-tab');
            }
            return;
        }

        // Convert seconds to hours for display
        const totalHours = formatHours(totalEstimate);

        // Calculate hours in done boards
        let doneHours = 0;
        for (const boardName in boardData) {
            const lowerBoardName = boardName.toLowerCase();
            if (lowerBoardName.includes('done') ||
                lowerBoardName.includes('closed') ||
                lowerBoardName.includes('complete') ||
                lowerBoardName.includes('finished')) {

                doneHours += boardData[boardName].timeEstimate || 0;
            }
        }
        const doneHoursFormatted = formatHours(doneHours);

        // Update the header to include total hours and done hours
        this.uiManager.updateHeader(
            `Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`
        );

        // Show milestone info if available
        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }

        // Create and populate the data table with hour distribution
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);

        // Remove loading screen
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('summary-tab');
        }
    }

    /**
     * Count cards in "closed" or "done" boards
     * @returns {number} Count of cards in closed boards
     */
    getClosedBoardCount() {
        let closedCount = 0;
        const boardLists = document.querySelectorAll('.board-list');

        boardLists.forEach(boardList => {
            let boardTitle = '';

            try {
                // First attempt to get the title from the Vue component
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child =>
                        child.$props && child.$props.list && child.$props.list.title);

                    if (boardComponent && boardComponent.$props.list.title) {
                        boardTitle = boardComponent.$props.list.title.toLowerCase();
                    }
                }

                // Fallback to DOM if Vue component approach failed
                if (!boardTitle) {
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
                // Fallback to DOM
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim().toLowerCase();
                }
            }

            // Count cards in "closed" or "done" boards
            if (boardTitle.includes('done') || boardTitle.includes('closed') ||
                boardTitle.includes('complete') || boardTitle.includes('finished')) {
                const cards = boardList.querySelectorAll('.board-card');
                closedCount += cards.length;
            }
        });

        return closedCount;
    }

    /**
     * Render message when no data is available
     * @param {HTMLElement} container - Container element
     */
    renderNoDataMessage(container) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No time estimate data found. Make sure the board is fully loaded and try again.';
        noDataMsg.style.color = '#666';
        container.appendChild(noDataMsg);

        const tipMsg = document.createElement('p');
        tipMsg.style.fontSize = '12px';
        tipMsg.style.fontStyle = 'italic';
        tipMsg.innerHTML = 'Tip: Try scrolling through all cards to ensure they are loaded before clicking Recalculate.';
        container.appendChild(tipMsg);

        // Update header to show 0h when no data found
        this.uiManager.updateHeader('Summary 0.0h');
    }

    /**
     * Render milestone information
     * @param {HTMLElement} container - Container element
     * @param {string} milestoneName - Name of the milestone
     */
    renderMilestoneInfo(container, milestoneName) {
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.marginBottom = '10px';
        milestoneInfo.style.fontSize = '13px';
        milestoneInfo.style.color = '#555';
        milestoneInfo.textContent = `Current Milestone: ${milestoneName}`;
        container.appendChild(milestoneInfo);
    }

    /**
     * Render data table with assignee time estimates and hour distribution
     * @param {HTMLElement} container - Container element
     * @param {Object} assigneeTimeMap - Map of assignee names to time estimates
     * @param {string} totalHours - Total hours formatted as string
     * @param {Object} boardData - Data for each board
     * @param {Object} boardAssigneeData - Assignee data for each board
     */
    renderDataTableWithDistribution(container, assigneeTimeMap, totalHours, boardData, boardAssigneeData) {
        // Create table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Get board names in order
        const boardNames = Object.keys(boardData || {});

        // Debug logging to help identify data issues
        console.log('Board Names:', boardNames);
        console.log('Board Data:', boardData);
        console.log('Board Assignee Data:', boardAssigneeData);

        // Add total row at top
        const totalRow = document.createElement('tr');
        totalRow.style.borderBottom = '2px solid #ddd';
        totalRow.style.fontWeight = 'bold';

        const totalLabelCell = document.createElement('td');
        totalLabelCell.textContent = 'Total';
        totalLabelCell.style.padding = '5px 0';

        const totalValueCell = document.createElement('td');
        totalValueCell.textContent = `${totalHours}h`;
        totalValueCell.style.textAlign = 'right';
        totalValueCell.style.padding = '5px 0';

        // Add distribution cell for total
        const totalDistributionCell = document.createElement('td');
        totalDistributionCell.style.textAlign = 'right';
        totalDistributionCell.style.padding = '5px 0 5px 15px';
        totalDistributionCell.style.color = '#666';
        totalDistributionCell.style.fontSize = '12px';

        // Create distribution for total across all boards
        if (boardNames.length > 0 && boardData) {
            const distributionValues = boardNames.map(boardName => {
                const boardDataObj = boardData[boardName] || { timeEstimate: 0 };
                const hoursFloat = parseFloat(formatHours(boardDataObj.timeEstimate || 0));
                return Math.round(hoursFloat); // Round to integer
            });

            // Always include all boards in the distribution
            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;

                // Style based on value
                if (hours === 0) {
                    spanHTML += `color:#aaa;`; // Grey for zero values
                }

                // Make the last board green if greater than 0
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`; // Green for last board with hours
                }

                spanHTML += `">${hours}</span>`;
                return spanHTML;
            }).join('/');

            totalDistributionCell.innerHTML = distributionText;
        }

        totalRow.appendChild(totalLabelCell);
        totalRow.appendChild(totalValueCell);
        totalRow.appendChild(totalDistributionCell);
        table.appendChild(totalRow);

        // Sort assignees by time (descending)
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
            return assigneeTimeMap[b] - assigneeTimeMap[a];
        });

        // Add a row for each assignee
        sortedAssignees.forEach(name => {
            const hours = formatHours(assigneeTimeMap[name]);

            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.style.padding = '5px 0';

            const timeCell = document.createElement('td');
            timeCell.textContent = `${hours}h`;
            timeCell.style.textAlign = 'right';
            timeCell.style.padding = '5px 0';

            // Add distribution cell for this assignee
            const distributionCell = document.createElement('td');
            distributionCell.style.textAlign = 'right';
            distributionCell.style.padding = '5px 0 5px 15px';
            distributionCell.style.color = '#666';
            distributionCell.style.fontSize = '12px';

            // Create distribution for this assignee across all boards
            if (boardNames.length > 0 && boardAssigneeData) {
                const distributionValues = boardNames.map(boardName => {
                    // Get this assignee's data for this board, defaulting to zero
                    const boardAssignees = boardAssigneeData[boardName] || {};
                    const assigneeInBoard = boardAssignees[name] || { timeEstimate: 0 };
                    const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
                    return Math.round(hoursFloat); // Round to integer
                });

                // Always include all boards in the distribution
                const distributionText = distributionValues.map((hours, index) => {
                    let spanHTML = `<span style="`;

                    // Style based on value
                    if (hours === 0) {
                        spanHTML += `color:#aaa;`; // Grey for zero values
                    }

                    // Make the last board green if greater than 0
                    if (index === distributionValues.length - 1 && hours > 0) {
                        spanHTML += `color:#28a745;`; // Green for last board with hours
                    }

                    spanHTML += `">${hours}</span>`;
                    return spanHTML;
                }).join('/');

                distributionCell.innerHTML = distributionText;
            }

            row.appendChild(nameCell);
            row.appendChild(timeCell);
            row.appendChild(distributionCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }
}

// File: lib/ui/views/BoardsView.js
// BoardsView.js - Manages the Boards tab UI
/**
 * View for the Boards tab
 */
window.BoardsView = class BoardsView {
    /**
     * Constructor for BoardsView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
    }
    /**
     * Render or update the Boards tab with data
     * @param {Object} boardData - Map of board names to board data
     * @param {Object} boardAssigneeData - Map of board names to assignee data
     */
    render(boardData, boardAssigneeData) {
        const boardsContent = document.getElementById('boards-time-summary-content');
        if (!boardsContent) return;

        // Clear existing content
        boardsContent.innerHTML = '';

        // Create accordion-style list of boards
        const boardsList = document.createElement('div');
        boardsList.className = 'boards-list-summary';

        // Sort boards by time estimate (descending)
        const sortedBoards = Object.keys(boardData).sort((a, b) => {
            return boardData[b].timeEstimate - boardData[a].timeEstimate;
        });

        // Create a section for each board
        sortedBoards.forEach(boardName => {
            const boardSection = this.createBoardSection(
                boardName,
                boardData[boardName],
                boardAssigneeData[boardName]
            );
            boardsList.appendChild(boardSection);
        });

        boardsContent.appendChild(boardsList);

        // Remove loading screen
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('boards-tab');
        }
    }

    /**
     * Create a board section with collapsible details
     * @param {string} boardName - Name of the board
     * @param {Object} boardData - Data for this board
     * @param {Object} assigneeData - Assignee data for this board
     * @returns {HTMLElement} Board section element
     */
    createBoardSection(boardName, boardData, assigneeData) {
        const boardHours = formatHours(boardData.timeEstimate);

        // Create board section container
        const boardSection = document.createElement('div');
        boardSection.className = 'board-section';
        boardSection.style.marginBottom = '15px';

        // Board header with expand/collapse functionality
        const boardHeader = document.createElement('div');
        boardHeader.className = 'board-header';
        boardHeader.style.display = 'flex';
        boardHeader.style.justifyContent = 'space-between';
        boardHeader.style.padding = '5px';
        boardHeader.style.backgroundColor = '#f5f5f5';
        boardHeader.style.borderRadius = '3px';
        boardHeader.style.cursor = 'pointer';
        boardHeader.style.fontWeight = 'bold';

        // Board details area (initially hidden)
        const boardDetails = document.createElement('div');
        boardDetails.className = 'board-details';
        boardDetails.style.display = 'none';
        boardDetails.style.marginTop = '5px';
        boardDetails.style.marginLeft = '10px';

        // Toggle details when header is clicked
        boardHeader.addEventListener('click', () => {
            if (boardDetails.style.display === 'none') {
                boardDetails.style.display = 'block';
                boardToggle.textContent = '▼';
            } else {
                boardDetails.style.display = 'none';
                boardToggle.textContent = '▶';
            }
        });

        // Board info text
        const boardInfo = document.createElement('div');
        boardInfo.textContent = `${boardName} (${boardData.tickets} tickets, ${boardHours}h)`;

        // Toggle indicator
        const boardToggle = document.createElement('span');
        boardToggle.textContent = '▶';
        boardToggle.style.marginLeft = '5px';

        boardHeader.appendChild(boardInfo);
        boardHeader.appendChild(boardToggle);

        // Add assignee table if we have data
        if (assigneeData) {
            boardDetails.appendChild(
                this.createAssigneeTable(assigneeData)
            );
        }

        boardSection.appendChild(boardHeader);
        boardSection.appendChild(boardDetails);

        return boardSection;
    }

    /**
     * Create a table showing assignee data for a board
     * @param {Object} assigneeData - Assignee data for a board
     * @returns {HTMLElement} Table element
     */
    createAssigneeTable(assigneeData) {
        const assigneeTable = document.createElement('table');
        assigneeTable.style.width = '100%';
        assigneeTable.style.borderCollapse = 'collapse';
        assigneeTable.style.marginTop = '5px';

        // Table headers
        const headerRow = document.createElement('tr');
        headerRow.style.borderBottom = '1px solid #ddd';

        const nameHeader = document.createElement('th');
        nameHeader.textContent = 'Assignee';
        nameHeader.style.textAlign = 'left';
        nameHeader.style.padding = '3px 0';

        const ticketsHeader = document.createElement('th');
        ticketsHeader.textContent = 'Tickets';
        ticketsHeader.style.textAlign = 'right';
        ticketsHeader.style.padding = '3px 5px';

        const timeHeader = document.createElement('th');
        timeHeader.textContent = 'Hours';
        timeHeader.style.textAlign = 'right';
        timeHeader.style.padding = '3px 0';

        headerRow.appendChild(nameHeader);
        headerRow.appendChild(ticketsHeader);
        headerRow.appendChild(timeHeader);
        assigneeTable.appendChild(headerRow);

        // Sort assignees by time for this board
        const boardAssignees = Object.keys(assigneeData).sort((a, b) => {
            return assigneeData[b].timeEstimate - assigneeData[a].timeEstimate;
        });

        // Add a row for each assignee
        boardAssignees.forEach(assigneeName => {
            const assigneeInfo = assigneeData[assigneeName];
            const assigneeHours = formatHours(assigneeInfo.timeEstimate);

            const assigneeRow = document.createElement('tr');
            assigneeRow.style.borderBottom = '1px solid #eee';
            const nameCell = document.createElement('td');
            nameCell.textContent = assigneeName;
            nameCell.style.padding = '3px 0';

            const ticketsCell = document.createElement('td');
            ticketsCell.textContent = assigneeInfo.tickets;
            ticketsCell.style.textAlign = 'right';
            ticketsCell.style.padding = '3px 5px';

            const timeCell = document.createElement('td');
            timeCell.textContent = `${assigneeHours}h`;
            timeCell.style.textAlign = 'right';
            timeCell.style.padding = '3px 0';

            assigneeRow.appendChild(nameCell);
            assigneeRow.appendChild(ticketsCell);
            assigneeRow.appendChild(timeCell);
            assigneeTable.appendChild(assigneeRow);
        });

        return assigneeTable;
    }
}

// File: lib/ui/views/HistoryView.js
// HistoryView.js - Manages the History tab UI
/**
 * View for the History tab
 */
window.HistoryView = class HistoryView {
    /**
     * Constructor for HistoryView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    /**
     * Render the history tab
     */
    render() {
        const historyContent = document.getElementById('history-time-summary-content');
        if (!historyContent) return;

        // Clear existing content
        historyContent.innerHTML = '';

        // Get current URL key
        const urlKey = getHistoryKey();

        // Get history data specific to this URL
        const history = GM_getValue(urlKey, []);

        // Show current URL being displayed
        const urlInfo = document.createElement('div');
        urlInfo.style.fontSize = '12px';
        urlInfo.style.color = '#666';
        urlInfo.style.marginBottom = '10px';
        urlInfo.style.wordBreak = 'break-all';

        // Truncate the URL if it's too long
        let displayUrl = window.location.href;
        if (displayUrl.length > 60) {
            displayUrl = displayUrl.substring(0, 57) + '...';
        }
        historyContent.appendChild(urlInfo);

        // If no history, show message
        if (history.length === 0) {
            this.renderNoHistoryMessage(historyContent);

            // Remove loading screen
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('history-tab');
            }
            return;
        }

        // Add clear history button
        this.addClearHistoryButton(historyContent, urlKey);

        // Create and populate history table
        this.renderHistoryTable(historyContent, history);

        // Remove loading screen
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('history-tab');
        }
    }

    /**
     * Render message when no history data is available
     * @param {HTMLElement} container - Container element
     */
    renderNoHistoryMessage(container) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No history data available for this URL yet.';
        noDataMsg.style.color = '#666';
        container.appendChild(noDataMsg);
    }

    /**
     * Add button to clear history data
     * @param {HTMLElement} container - Container element
     * @param {string} urlKey - Key for storing history data
     */
    addClearHistoryButton(container, urlKey) {
        const clearHistoryBtn = document.createElement('button');
        clearHistoryBtn.textContent = 'Clear History';
        clearHistoryBtn.style.padding = '3px 6px';
        clearHistoryBtn.style.fontSize = '12px';
        clearHistoryBtn.style.backgroundColor = '#dc3545';
        clearHistoryBtn.style.color = 'white';
        clearHistoryBtn.style.border = 'none';
        clearHistoryBtn.style.borderRadius = '3px';
        clearHistoryBtn.style.cursor = 'pointer';
        clearHistoryBtn.style.marginBottom = '10px';
        clearHistoryBtn.onclick = () => {
            if (confirm('Are you sure you want to clear history data for this URL?')) {
                GM_setValue(urlKey, []);
                this.render(); // Re-render the tab
            }
        };
        container.appendChild(clearHistoryBtn);
    }

    /**
     * Render table showing history data
     * @param {HTMLElement} container - Container element
     * @param {Array} history - Array of history entries
     */
    renderHistoryTable(container, history) {
        // Create history table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Table header
        const headerRow = document.createElement('tr');
        headerRow.style.borderBottom = '2px solid #ddd';
        headerRow.style.fontWeight = 'bold';

        const dateHeader = document.createElement('th');
        dateHeader.textContent = 'Date';
        dateHeader.style.textAlign = 'left';
        dateHeader.style.padding = '5px 0';

        const hoursHeader = document.createElement('th');
        hoursHeader.textContent = 'Hours';
        hoursHeader.style.textAlign = 'right';
        hoursHeader.style.padding = '5px 0';

        const milestoneHeader = document.createElement('th');
        milestoneHeader.textContent = 'Milestone';
        milestoneHeader.style.textAlign = 'left';
        milestoneHeader.style.padding = '5px 0';

        headerRow.appendChild(dateHeader);
        headerRow.appendChild(hoursHeader);
        headerRow.appendChild(milestoneHeader);
        table.appendChild(headerRow);

        // Add data rows in reverse order (newest first)
        history.slice().reverse().forEach(entry => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            const dateCell = document.createElement('td');
            const entryDate = new Date(entry.timestamp);
            dateCell.textContent = entryDate.toLocaleDateString() + ' ' + entryDate.toLocaleTimeString().substring(0, 5);
            dateCell.style.padding = '5px 0';

            const hoursCell = document.createElement('td');
            hoursCell.textContent = `${entry.totalHours}h`;
            hoursCell.style.textAlign = 'right';
            hoursCell.style.padding = '5px 0';

            const milestoneCell = document.createElement('td');
            milestoneCell.textContent = entry.milestone;
            milestoneCell.style.padding = '5px 0';

            row.appendChild(dateCell);
            row.appendChild(hoursCell);
            row.appendChild(milestoneCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }
}

// File: lib/ui/views/BulkCommentsView.js
// BulkCommentsView.js - Fixed version
/**
 * View for the Bulk Comments tab (previously API tab)
 */
window.BulkCommentsView = class BulkCommentsView {
    /**
     * Constructor for BulkCommentsView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssues = []; // Store selected issues
        this.commandShortcuts = null; // Will be initialized when Bulk Comments tab is rendered
        this.isLoading = false;
        this.initializedShortcuts = new Set(); // Track which shortcuts have been initialized
        this.commentInput = null; // Store reference to textarea element

        // Get the GitLab API instance from the window object or uiManager
        this.gitlabApi = window.gitlabApi || (uiManager && uiManager.gitlabApi);

        // Create a notification instance
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Important: Initialize labelManager manually if it's not in uiManager
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else if (typeof LabelManager === 'function') {
            // Make sure LabelManager is imported and available
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    if (this.commandShortcuts) {
                        this.addLabelShortcut();
                    }
                }
            });
        } else {
            // Create a simple placeholder that won't cause errors
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([])
            };
        }

        // Initialize the selection display
        this.selectionDisplay = new SelectionDisplay({
            selectedIssues: this.selectedIssues,
            onRemoveIssue: (index) => this.onRemoveIssue(index)
        });
    }

    /**
     * Initialize label and assignee managers with error handling
     * @param {Object} uiManager - Reference to the main UI manager
     */
    initializeManagers(uiManager) {
        // Try to get label manager from uiManager
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else {
            // Try to initialize from global if available
            try {
                if (typeof LabelManager === 'function') {
                    this.labelManager = new LabelManager({
                        gitlabApi: this.gitlabApi,
                        onLabelsLoaded: (labels) => {
                            // Re-add label shortcut when labels are loaded
                            if (this.commandShortcuts) {
                                this.addLabelShortcut();
                            }
                        }
                    });
                } else {
                    console.warn('LabelManager class not available, using placeholder');
                    // Create a simple placeholder
                    this.labelManager = {
                        filteredLabels: [],
                        fetchAllLabels: () => Promise.resolve([]),
                        isLabelInWhitelist: () => false
                    };
                }
            } catch (e) {
                console.error('Error initializing LabelManager:', e);
                // Create a simple placeholder
                this.labelManager = {
                    filteredLabels: [],
                    fetchAllLabels: () => Promise.resolve([]),
                    isLabelInWhitelist: () => false
                };
            }
        }

        // Same process for assignee manager
        if (uiManager && uiManager.assigneeManager) {
            this.assigneeManager = uiManager.assigneeManager;
        } else {
            // Try to find global
            this.assigneeManager = window.assigneeManager;
        }
    }
    /**
     * Update assign shortcut with the provided items
     * @param {Array} items - Items to show in the assign dropdown
     */
    /**
     * Update assign shortcut with the provided items
     * @param {Array} items - Items to show in the assign dropdown
     */
    updateAssignShortcut(items) {
        if (!this.commandShortcuts) {
            console.error("Cannot update assign shortcut: commandShortcuts not available");
            return;
        }

        // Skip if we have no items or just the default ones
        if (!items || items.length <= 3) {
            console.warn("Not updating assign shortcut: no meaningful items to add");
            return;
        }

        try {
            // Store current selected value if there is one
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['assign'].dropdown.value;
            }

            // First remove existing shortcut if it exists
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign']) {
                this.commandShortcuts.removeShortcut('assign');
            }

            // Then add the new shortcut
            this.commandShortcuts.addCustomShortcut({
                type: 'assign',
                label: '/assign',
                items: items,
                onSelect: (value) => {
                    if (!value || value === 'separator' || value === 'separator2') return;

                    if (value === 'manage') {
                        // Try different ways to open the assignee manager
                        if (this.assigneeManager && typeof this.assigneeManager.openAssigneeManager === 'function') {
                            this.assigneeManager.openAssigneeManager();
                        } else if (window.assigneeManager && typeof window.assigneeManager.openAssigneeManager === 'function') {
                            window.assigneeManager.openAssigneeManager();
                        } else if (typeof openAssigneeManager === 'function') {
                            openAssigneeManager();
                        } else {
                            console.error('No assignee manager found');
                            this.notification.error('Assignee manager not available');
                            return;
                        }

                        // After the manager is closed, refresh the shortcut
                        setTimeout(() => {
                            this.addAssignShortcut();
                        }, 500);
                        return;
                    }

                    if (value === 'custom') {
                        const customUser = prompt('Enter GitLab username (without @):');
                        if (!customUser) return;
                        value = customUser;
                    }

                    const textarea = this.commentInput || document.getElementById('issue-comment-input');
                    if (!textarea) {
                        console.error("No textarea found for inserting assign command");
                        return;
                    }

                    let assignText = '/assign ';

                    if (value === 'none') {
                        assignText += '@none';
                    } else if (value === '@me') {
                        assignText += '@me';
                    } else {
                        // Handle usernames - prefix with @ if not already there
                        assignText += value.startsWith('@') ? value : `@${value}`;
                    }

                    this.insertTextAtCursor(textarea, assignText);

                    if (value === 'none') {
                        this.notification.info('Issue will be unassigned');
                    } else if (value === '@me') {
                        this.notification.info('Issue will be assigned to you');
                    } else {
                        this.notification.info(`Issue will be assigned to ${value.replace('@', '')}`);
                    }
                }
            });

            // Restore selected value if it existed and is in the new items
            if (currentValue && this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                this.commandShortcuts.shortcuts['assign'].dropdown.value = currentValue;
            }

            console.log(`Successfully updated assign shortcut with ${items.length} items`);
        } catch (e) {
            console.error('Error updating assign shortcut:', e);
        }
    }
    /**
     * Initialize all shortcut types
     */
    initializeAllShortcuts() {
        if (!this.commandShortcuts) return;

        try {
            // Define a consistent order for the shortcuts
            const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];

            // Track already added shortcuts
            const addedShortcuts = new Set(Object.keys(this.commandShortcuts.shortcuts || {}));

            // Create estimate shortcut (always first) if not already added
            if (!addedShortcuts.has('estimate')) {
                this.commandShortcuts.initializeEstimateShortcut();
                addedShortcuts.add('estimate');
            }

            // Add label shortcut with placeholder labels if not already added
            if (!addedShortcuts.has('label')) {
                this.addLabelShortcut([
                    { value: '', label: 'Loading labels...' }
                ]);
                addedShortcuts.add('label');
            }

            // Add milestone shortcut if not already added
            if (!addedShortcuts.has('milestone')) {
                this.addMilestoneShortcut();
                addedShortcuts.add('milestone');
            }

            // Add assign shortcut if not already added
            if (!addedShortcuts.has('assign')) {
                this.addAssignShortcut();
                addedShortcuts.add('assign');
            }
        } catch (e) {
            console.error('Error initializing shortcuts:', e);
            this.notification.error('Error initializing shortcuts');
        }
    }

    /**
     * Add milestone shortcut
     */
    addMilestoneShortcut() {
        if (!this.commandShortcuts) return;

        try {
            this.commandShortcuts.addCustomShortcut({
                type: 'milestone',
                label: '/milestone',
                items: [
                    { value: '', label: 'Set Milestone' },
                    { value: '%current', label: 'Current Sprint' },
                    { value: '%next', label: 'Next Sprint' },
                    { value: '%upcoming', label: 'Upcoming' },
                    { value: 'none', label: 'Remove Milestone' },
                    { value: 'custom', label: 'Custom...' }
                ],
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customMilestone = prompt('Enter milestone name:');
                        if (!customMilestone) return;
                        value = customMilestone;
                    }

                    // Use the stored textarea reference instead of finding it by ID
                    if (!this.commentInput) {
                        console.warn('Comment input not available');
                        return;
                    }

                    // Format milestone text based on value
                    let milestoneText = '/milestone ';
                    if (value === 'none') {
                        milestoneText += '%""';
                    } else if (value.startsWith('%')) {
                        milestoneText += value;
                    } else {
                        milestoneText += `%"${value}"`;
                    }

                    this.insertTextAtCursor(this.commentInput, milestoneText);
                    this.notification.info(`Milestone set to ${value === 'none' ? 'none' : value}`);
                }
            });
        } catch (e) {
            console.error('Error adding milestone shortcut:', e);
        }
    }

    /**
     * Add assign shortcut
     */
    /**
     * Add assign shortcut
     */
    addAssignShortcut() {
        if (!this.commandShortcuts) return;

        console.log("Starting addAssignShortcut");

        // Log global objects to check availability
        console.log("Global assigneeManager available:", !!window.assigneeManager);
        console.log("Global settingsStorage available:", !!window.getAssigneeWhitelist);
        console.log("This.assigneeManager available:", !!this.assigneeManager);

        // Start with basic assign items
        let assignItems = [
            { value: '', label: 'Assign to...' },
            { value: '@me', label: 'Myself' },
            { value: 'none', label: 'Unassign' }
        ];

        // DIRECT ACCESS APPROACH: Attempt to directly access the storage via GM_getValue
        let directWhitelist = null;
        try {
            if (typeof GM_getValue === 'function') {
                directWhitelist = GM_getValue('gitLabHelperAssigneeWhitelist', []);
                console.log("Direct GM_getValue result:", directWhitelist);
            }
        } catch (e) {
            console.error("Error accessing GM_getValue:", e);
        }

        // If we got assignees directly, use them
        if (Array.isArray(directWhitelist) && directWhitelist.length > 0) {
            console.log("Using directly accessed whitelist:", directWhitelist);

            // Add a separator
            assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

            // Add whitelisted assignees
            const whitelistItems = directWhitelist.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
            }));

            assignItems = assignItems.concat(whitelistItems);
        }
        // If direct access failed, try other methods
        else {
            console.log("Direct access failed, trying fallbacks");

            // Try to find assignees from various sources
            let assignees = [];

            // Try the assigneeManager
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = this.assigneeManager.getAssigneeWhitelist();
                    console.log("Got assignees from this.assigneeManager:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from this.assigneeManager:", e);
                }
            }

            // Try global assigneeManager if local one failed
            if ((!assignees || !assignees.length) && window.assigneeManager &&
                typeof window.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.assigneeManager.getAssigneeWhitelist();
                    console.log("Got assignees from window.assigneeManager:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from window.assigneeManager:", e);
                }
            }

            // Try imported getAssigneeWhitelist if available
            if ((!assignees || !assignees.length) && typeof getAssigneeWhitelist === 'function') {
                try {
                    assignees = getAssigneeWhitelist();
                    console.log("Got assignees from imported getAssigneeWhitelist:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from imported getAssigneeWhitelist:", e);
                }
            }

            // Try global getAssigneeWhitelist if available
            if ((!assignees || !assignees.length) && typeof window.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.getAssigneeWhitelist();
                    console.log("Got assignees from window.getAssigneeWhitelist:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from window.getAssigneeWhitelist:", e);
                }
            }

            // Try localStorage directly
            if (!assignees || !assignees.length) {
                try {
                    const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
                    if (storedValue) {
                        assignees = JSON.parse(storedValue);
                        console.log("Got assignees from localStorage directly:", assignees);
                    }
                } catch (e) {
                    console.error("Error getting assignees from localStorage:", e);
                }
            }

            // If we found any assignees by any method, add them to the dropdown
            if (Array.isArray(assignees) && assignees.length > 0) {
                // Add a separator
                assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

                // Add whitelisted assignees
                const whitelistItems = assignees.map(assignee => ({
                    value: assignee.username,
                    label: assignee.name || assignee.username
                }));

                assignItems = assignItems.concat(whitelistItems);
            } else {
                console.warn("Could not find any assignees through any method");
            }
        }

        // Add custom option and manage option at the end
        assignItems.push({ value: 'custom', label: 'Custom...' });

        // Add this log to see what will be passed to the dropdown
        console.log("Final assignItems to be used:", assignItems);

        // Update the assign shortcut with our items
        this.updateAssignShortcut(assignItems);

        // Async attempt to fetch more group members
        setTimeout(() => {
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        console.log("Got group members:", members.length);

                        // Create a new array that includes existing items plus members
                        const updatedItems = [...assignItems];

                        // Add a separator if we have members
                        updatedItems.push({ value: 'separator2', label: '────── Group Members ──────' });

                        // Add group members, making sure to avoid duplicates with existing assignees
                        const existingUsernames = assignItems
                            .filter(item => item.value && !['separator', 'separator2', 'custom', 'manage', '@me', 'none', ''].includes(item.value))
                            .map(item => item.value.toLowerCase());

                        const newMembers = members
                            .filter(member => !existingUsernames.includes(member.username.toLowerCase()))
                            .map(member => ({
                                value: member.username,
                                label: member.name || member.username
                            }));

                        if (newMembers.length > 0) {
                            updatedItems.push(...newMembers);

                            // Update the shortcut with all the items
                            this.updateAssignShortcut(updatedItems);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error fetching group members:', error);
                });
        }, 100);
    }



    /**
     * Fetch members from the current group/project
     * @returns {Promise<Array>} Promise resolving to array of members
     */
    async fetchGroupMembers() {
        try {
            // First, ensure we have an API instance
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                throw new Error('GitLab API not available');
            }

            // Get path info to determine project or group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }

            // Fetch members based on path type
            let members;
            if (pathInfo.type === 'project') {
                members = await this.gitlabApi.callGitLabApi(
                    `projects/${pathInfo.encodedPath}/members`,
                    { params: { per_page: 100 } }
                );
            } else if (pathInfo.type === 'group') {
                members = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    { params: { per_page: 100 } }
                );
            } else {
                throw new Error('Unsupported path type: ' + pathInfo.type);
            }

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members');
                return [];
            }

            // Process members
            return members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));
        } catch (error) {
            console.error('Error fetching group members:', error);
            return [];
        }
    }

    /**
     * Set multiple selected issues
     * @param {Array} issues - Array of selected issue objects
     */
    setSelectedIssues(issues) {
        // Make a defensive copy to prevent reference issues
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];

        // Update the SelectionDisplay with the new issues
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }

        // Update status message if it exists
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected. Enter your comment and click "Add Comment".`;
                statusEl.style.color = 'green';
            } else if (!this.isLoading) {
                statusEl.textContent = 'No issues selected. Click "Select Issues".';
                statusEl.style.color = '#666';
            }
        }

        // Log for debugging
        console.log(`BulkCommentsView: Set ${this.selectedIssues.length} selected issues`);
    }

    /**
     * Handler when an issue is removed from the selection
     * @param {number} index - Index of the removed issue
     */
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            // Store the removed issue for debugging
            const removedIssue = this.selectedIssues[index];

            // Remove the issue
            this.selectedIssues.splice(index, 1);

            // Update UI manager's issue selector if available
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.issueSelector) {
                // Try global uiManager as fallback
                window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }
        }

        // Update status message if it exists
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = 'green';
            } else {
                statusEl.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
                statusEl.style.color = '#666';
            }
        }

        // Log for debugging
        console.log(`Removed issue at index ${index}, remaining: ${this.selectedIssues.length}`);
    }

    /**
     * Create action buttons (select, submit, clear)
     * @param {HTMLElement} container - Container element
     */
    createActionButtons(container) {
        // Buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';

        // Add select issues button with toggle functionality
        const selectBtn = document.createElement('button');
        selectBtn.id = 'select-issues-button';
        selectBtn.textContent = 'Select'; // Simplified text
        selectBtn.style.padding = '8px 12px';
        selectBtn.style.backgroundColor = '#6c757d';  // Default gray
        selectBtn.style.color = 'white';
        selectBtn.style.border = 'none';
        selectBtn.style.borderRadius = '4px';
        selectBtn.style.cursor = 'pointer';
        selectBtn.style.fontSize = '14px';
        selectBtn.style.transition = 'background-color 0.2s ease';
        selectBtn.style.display = 'flex';
        selectBtn.style.alignItems = 'center';
        selectBtn.style.justifyContent = 'center';
        selectBtn.style.minWidth = '80px'; // Ensure consistent widths

        // Add hover effect
        selectBtn.addEventListener('mouseenter', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#218838' : '#5a6268';
        });
        selectBtn.addEventListener('mouseleave', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#28a745' : '#6c757d';
        });

        selectBtn.onclick = () => {
            if (this.uiManager && this.uiManager.issueSelector) {
                // Toggle selection mode
                if (this.uiManager.issueSelector.isSelectingIssue) {
                    // Currently active, so exit selection mode
                    this.uiManager.issueSelector.exitSelectionMode();

                    // Update button styling
                    selectBtn.dataset.active = 'false';
                    selectBtn.style.backgroundColor = '#6c757d'; // Gray when inactive
                    selectBtn.textContent = 'Select';
                } else {
                    // Not active, so start selection mode
                    // Pass the current selection to maintain it
                    this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    this.uiManager.issueSelector.startSelection();

                    // Update button styling
                    selectBtn.dataset.active = 'true';
                    selectBtn.style.backgroundColor = '#28a745'; // Green when active
                    selectBtn.textContent = 'Done'; // Changed to "Done" when active
                }
            } else {
                console.error('Issue selector not initialized');
                const statusEl = document.getElementById('comment-status');
                if (statusEl) {
                    statusEl.textContent = 'Error: Issue selector not initialized.';
                    statusEl.style.color = '#dc3545';
                }
            }
        };
        buttonContainer.appendChild(selectBtn);

        // Add Save button (renamed from "Add Comment")
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Send';  // Changed to clearer "Save" label
        submitBtn.style.padding = '8px 12px';
        submitBtn.style.backgroundColor = '#1f75cb';
        submitBtn.style.color = 'white';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '4px';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.fontSize = '14px';
        submitBtn.style.transition = 'background-color 0.2s ease';
        submitBtn.style.display = 'flex';
        submitBtn.style.alignItems = 'center';
        submitBtn.style.justifyContent = 'center';
        submitBtn.style.flex = '1';
        submitBtn.style.minWidth = '80px'; // Ensure consistent widths

        // Add hover effect
        submitBtn.addEventListener('mouseenter', () => {
            submitBtn.style.backgroundColor = '#1a63ac';
        });
        submitBtn.addEventListener('mouseleave', () => {
            submitBtn.style.backgroundColor = '#1f75cb';
        });

        submitBtn.onclick = () => this.submitComments();
        buttonContainer.appendChild(submitBtn);

        container.appendChild(buttonContainer);
    }

    /**
     * Clear selected issues
     */
    clearSelectedIssues() {
        // Clear local selection
        this.selectedIssues = [];

        // Update the selection display
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues([]);
        }

        // Update status message
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }

        // Show notification
        if (this.notification) {
            this.notification.info('Selection cleared');
        }

        // Log for debugging
        console.log('Cleared selected issues');
    }

    /**
     * For backwards compatibility - set a single selected issue
     * @param {Object} issue - Selected issue object
     */
    setSelectedIssue(issue) {
        this.setSelectedIssues(issue ? [issue] : []);
    }

    /**
     * Render the Bulk Comments tab
     */
    render() {
        const bulkCommentsContent = document.getElementById('bulk-comments-content');
        if (!bulkCommentsContent) return;

        // Clear previous content
        bulkCommentsContent.innerHTML = '';

        // Add comment section
        this.addCommentSection(bulkCommentsContent);

        // Initialize shortcuts in the correct order
        if (this.commandShortcuts) {
            // Add all shortcut structure first before fetching data
            // This ensures consistent order from the beginning
            this.initializeAllShortcuts();

            // Show loading state
            this.isLoading = true;

            // Now fetch data for the shortcuts asynchronously
            if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                // Fetch labels in the background without affecting order
                this.labelManager.fetchAllLabels()
                    .then(labels => {
                        // Update label shortcut with actual data
                        this.addLabelShortcut();
                        this.isLoading = false;
                        this.hideLoadingState();

                        // Remove loading screen
                        if (this.uiManager && this.uiManager.removeLoadingScreen) {
                            this.uiManager.removeLoadingScreen('bulkcomments-tab');
                        }
                    })
                    .catch(error => {
                        console.error('Error loading labels:', error);
                        this.addLabelShortcut(this.getFallbackLabels());
                        this.isLoading = false;
                        this.hideLoadingState();

                        // Remove loading screen
                        if (this.uiManager && this.uiManager.removeLoadingScreen) {
                            this.uiManager.removeLoadingScreen('bulkcomments-tab');
                        }
                    });
            } else {
                // No label manager, just use fallbacks
                console.warn('Label manager not available, using fallback labels');
                this.addLabelShortcut(this.getFallbackLabels());
                this.isLoading = false;
                this.hideLoadingState();

                // Remove loading screen
                if (this.uiManager && this.uiManager.removeLoadingScreen) {
                    this.uiManager.removeLoadingScreen('bulkcomments-tab');
                }
            }
        } else {
            console.error('Command shortcuts not initialized');
            this.isLoading = false;
            this.hideLoadingState();

            // Remove loading screen
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
        }
    }

    /**
     * Add comment utility section to Bulk Comments tab
     * @param {HTMLElement} container - Container element
     */
    addCommentSection(container) {
        // Create comment tool section
        const commentSection = document.createElement('div');
        commentSection.classList.add('api-section');
        commentSection.style.marginBottom = '15px';
        commentSection.style.padding = '10px';
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '8px';
        commentSection.style.border = '1px solid #e0e0e0';

        // Add selected issues container
        this.selectionDisplay.createSelectionContainer(commentSection);

        // Add comment input with shortcuts - initially with loading state
        this.createCommentInput(commentSection);

        // Add action buttons
        this.createActionButtons(commentSection);

        // Add status and progress elements
        this.createStatusElements(commentSection);

        // Show loading state
        this.isLoading = true;
        this.showLoadingState();

        // Initialize the shortcuts with placeholder labels
        try {
            // Make sure commentInput and commandShortcuts are initialized
            if (this.commentInput && this.commandShortcuts) {
                this.initializeAllShortcuts();

                // Show initial label shortcut with "Loading..." state
                this.addLabelShortcut([
                    { value: '', label: 'Loading labels...' }
                ]);

                // Now try to fetch labels asynchronously
                if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                    // Try to fetch labels in the background
                    this.labelManager.fetchAllLabels()
                        .then(labels => {
                            // Update the label shortcut with fetched labels
                            this.addLabelShortcut();
                            this.isLoading = false;
                            this.hideLoadingState();
                        })
                        .catch(error => {
                            console.error('Error loading labels:', error);
                            // If fetching fails, update with fallback labels
                            this.addLabelShortcut(this.getFallbackLabels());
                            this.isLoading = false;
                            this.hideLoadingState();
                        });
                } else {
                    // No label manager, just use fallbacks
                    console.warn('Label manager not available, using fallback labels');
                    this.addLabelShortcut(this.getFallbackLabels());
                    this.isLoading = false;
                    this.hideLoadingState();
                }
            } else {
                console.error('Textarea or command shortcuts not initialized');
                this.isLoading = false;
                this.hideLoadingState();
            }
        } catch (error) {
            console.error('Error initializing shortcuts:', error);
            this.isLoading = false;
            this.hideLoadingState();
        }

        container.appendChild(commentSection);
    }


    /**
     * Get fallback labels when fetching fails
     * @returns {Array} Array of fallback label items
     */
    getFallbackLabels() {
        return [
            { value: '', label: 'Add Label' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
            { value: 'enhancement', label: 'Enhancement' },
            { value: 'documentation', label: 'Documentation' },
            { value: 'custom', label: 'Custom...' }
        ];
    }

    /**
     * This function should be added to the BulkCommentsView.js file
     */
    createCommentInput(container) {
        // Create a wrapper for shortcuts with fixed dimensions
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.id = 'shortcuts-wrapper';
        shortcutsWrapper.style.width = '100%';
        shortcutsWrapper.style.marginBottom = '15px';
        shortcutsWrapper.style.minHeight = '120px'; // Set a fixed minimum height that accommodates all shortcuts
        shortcutsWrapper.style.position = 'relative'; // Important for stable layout

        // Add a placeholder layout while loading to prevent jumping
        const placeholderShortcuts = document.createElement('div');
        placeholderShortcuts.style.opacity = '0.4';
        placeholderShortcuts.style.pointerEvents = 'none';

        // Create placeholder items that mimic the shortcut layout
        ['Estimate', 'Label', 'Milestone', 'Assign'].forEach(type => {
            const placeholder = document.createElement('div');
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.marginBottom = '8px';
            placeholder.style.height = '36px'; // Fixed height
            placeholder.style.border = '1px solid #ddd';
            placeholder.style.borderRadius = '4px';
            placeholder.style.padding = '6px 10px';

            const label = document.createElement('div');
            label.textContent = `/${type.toLowerCase()}`;
            label.style.fontWeight = 'bold';
            label.style.minWidth = '100px';

            const dropdown = document.createElement('div');
            dropdown.style.flex = '1';
            dropdown.style.height = '24px';
            dropdown.style.backgroundColor = '#eee';
            dropdown.style.marginLeft = '10px';
            dropdown.style.borderRadius = '4px';

            placeholder.appendChild(label);
            placeholder.appendChild(dropdown);
            placeholderShortcuts.appendChild(placeholder);
        });

        shortcutsWrapper.appendChild(placeholderShortcuts);
        container.appendChild(shortcutsWrapper);

        // Comment textarea with improved styling
        const commentInput = document.createElement('textarea');
        commentInput.id = 'issue-comment-input';
        commentInput.placeholder = 'Enter your comment here...';
        commentInput.style.width = '100%';
        commentInput.style.padding = '8px';
        commentInput.style.marginBottom = '12px';
        commentInput.style.borderRadius = '4px';
        commentInput.style.border = '1px solid #ccc';
        commentInput.style.minHeight = '60px';
        commentInput.style.fontSize = '14px';
        commentInput.style.transition = 'border-color 0.2s ease';
        commentInput.style.resize = 'vertical';
        commentInput.style.boxSizing = 'border-box';

        // Add focus effect
        commentInput.addEventListener('focus', () => {
            commentInput.style.borderColor = '#1f75cb';
            commentInput.style.outline = 'none';
            commentInput.style.boxShadow = '0 0 0 2px rgba(31, 117, 203, 0.2)';
        });

        commentInput.addEventListener('blur', () => {
            commentInput.style.borderColor = '#ccc';
            commentInput.style.boxShadow = 'none';
        });

        // Add the textarea after the shortcuts wrapper
        container.appendChild(commentInput);

        // Store reference to the textarea
        this.commentInput = commentInput;

        // Initialize CommandShortcut with the newly created textarea
        try {
            if (typeof CommandShortcut === 'function') {
                this.commandShortcuts = new CommandShortcut({
                    targetElement: commentInput,
                    onShortcutInsert: (type, value) => {
                        console.log(`Shortcut inserted: ${type} with value ${value}`);
                    }
                });

                // Initialize shortcuts container, replacing the placeholder
                this.commandShortcuts.initialize(shortcutsWrapper);

                // Remove placeholder after initialization
                if (placeholderShortcuts.parentNode === shortcutsWrapper) {
                    shortcutsWrapper.removeChild(placeholderShortcuts);
                }
            } else {
                console.error('CommandShortcut class not available');
            }
        } catch (e) {
            console.error('Error initializing CommandShortcut:', e);
        }
    }


    /**
     * Insert text at cursor position in textarea
     * @param {HTMLElement} textarea - The textarea element
     * @param {string} text - Text to insert
     */
    insertTextAtCursor(textarea, text) {
        if (!textarea) return;

        // Get current text
        const currentText = textarea.value;

        // Get cursor position
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;

        // Check if we need to add a new line before the text
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }

        // Insert text at cursor position
        textarea.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);

        // Set cursor position after inserted text
        const newCursorPos = startPos + insertText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);

        // Focus textarea
        textarea.focus();
    }

    /**
     * Create status message and progress bar elements
     * @param {HTMLElement} container - Container element
     */
    createStatusElements(container) {
        // Status message with improved styling
        const statusMsg = document.createElement('div');
        statusMsg.id = 'comment-status';
        statusMsg.style.fontSize = '13px';
        statusMsg.style.marginTop = '10px';
        statusMsg.style.padding = '8px 12px';
        statusMsg.style.borderRadius = '4px';
        statusMsg.style.backgroundColor = '#f8f9fa';
        statusMsg.style.border = '1px solid #e9ecef';
        statusMsg.style.textAlign = 'center';
        statusMsg.style.color = '#666';
        statusMsg.textContent = 'Loading shortcuts...';
        container.appendChild(statusMsg);

        // Progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.id = 'comment-progress-container';
        progressContainer.style.display = 'none';
        progressContainer.style.marginTop = '15px';
        progressContainer.style.padding = '10px';
        progressContainer.style.backgroundColor = '#f8f9fa';
        progressContainer.style.borderRadius = '4px';
        progressContainer.style.border = '1px solid #e9ecef';

        const progressLabel = document.createElement('div');
        progressLabel.id = 'comment-progress-label';
        progressLabel.textContent = 'Submitting comments...';
        progressLabel.style.fontSize = '13px';
        progressLabel.style.marginBottom = '8px';
        progressLabel.style.textAlign = 'center';
        progressLabel.style.fontWeight = 'bold';
        progressContainer.appendChild(progressLabel);

        const progressBarOuter = document.createElement('div');
        progressBarOuter.style.height = '12px';
        progressBarOuter.style.backgroundColor = '#e9ecef';
        progressBarOuter.style.borderRadius = '6px';
        progressBarOuter.style.overflow = 'hidden';
        progressBarOuter.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.1)';

        const progressBarInner = document.createElement('div');
        progressBarInner.id = 'comment-progress-bar';
        progressBarInner.style.height = '100%';
        progressBarInner.style.width = '0%';
        progressBarInner.style.backgroundColor = '#1f75cb';
        progressBarInner.style.transition = 'width 0.3s ease';

        progressBarOuter.appendChild(progressBarInner);
        progressContainer.appendChild(progressBarOuter);
        container.appendChild(progressContainer);
    }

    /**
     * Show loading state for shortcuts
     */
    showLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Loading shortcuts...';
            statusEl.style.color = '#1f75cb';
            statusEl.style.backgroundColor = '#f8f9fa';
            statusEl.style.border = '1px solid #e9ecef';
        }

        // Instead of showing a spinner or changing opacity,
        // pre-populate with placeholders that maintain the layout
        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.label) {
            this.addLabelShortcut([
                { value: '', label: 'Loading labels...' }
            ]);
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.milestone) {
            this.addMilestoneShortcut();
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.assign) {
            this.addAssignShortcut();
        }

        // Disable without changing appearance dramatically
        if (this.commentInput) {
            this.commentInput.disabled = true;
            this.commentInput.style.backgroundColor = '#f9f9f9';
        }
    }

    /**
     * Hide loading state for shortcuts
     */
    hideLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = '#28a745';
                statusEl.style.backgroundColor = '#f8f9fa';
                statusEl.style.border = '1px solid #e9ecef';
            } else {
                statusEl.textContent = 'Select issues to add comments.';
                statusEl.style.color = '#666';
                statusEl.style.backgroundColor = '#f8f9fa';
                statusEl.style.border = '1px solid #e9ecef';
            }
        }

        // Enable comment input
        const commentInput = document.getElementById('issue-comment-input');
        if (commentInput) {
            commentInput.disabled = false;
            commentInput.style.opacity = '1';
            commentInput.style.cursor = 'text';
        }

        // Enable buttons
        const buttons = document.querySelectorAll('.api-section button');
        buttons.forEach(button => {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        });
    }

    /**
     * Submit comments to all selected issues
     */
    async submitComments() {
        if (!this.commentInput) {
            this.notification.error('Comment input not found');
            return;
        }

        const statusEl = document.getElementById('comment-status');
        const progressContainer = document.getElementById('comment-progress-container');
        const progressBar = document.getElementById('comment-progress-bar');
        const progressLabel = document.getElementById('comment-progress-label');

        if (this.selectedIssues.length === 0) {
            this.notification.error('No issues selected');
            if (statusEl) {
                statusEl.textContent = 'Error: No issues selected.';
                statusEl.style.color = '#dc3545';
            }
            return;
        }

        const comment = this.commentInput.value.trim();
        if (!comment) {
            this.notification.error('Comment cannot be empty');
            if (statusEl) {
                statusEl.textContent = 'Error: Comment cannot be empty.';
                statusEl.style.color = '#dc3545';
            }
            return;
        }

        // Create a full-UI loading overlay
        let fullUILoadingScreen;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            // Get the main container for the entire UI
            const mainContainer = document.getElementById('assignee-time-summary');
            if (mainContainer) {
                // Make sure the main container has positioning context
                const containerPosition = window.getComputedStyle(mainContainer).position;
                if (containerPosition === 'static') {
                    mainContainer.style.position = 'relative';
                    // Store the original position to restore later
                    mainContainer.dataset.originalPosition = containerPosition;
                }

                // Add a full-UI loading screen with backdrop
                fullUILoadingScreen = this.uiManager.addLoadingScreen(
                    mainContainer,
                    'comment-submit',
                    `Sending comments to ${this.selectedIssues.length} issues...`
                );

                // Add backdrop styles
                if (fullUILoadingScreen) {
                    fullUILoadingScreen.style.position = 'absolute'; // Ensure absolute positioning
                    fullUILoadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.7)'; // Darker backdrop
                    fullUILoadingScreen.style.zIndex = '2000'; // Higher z-index to be above everything

                    // Make the spinner and text white for better visibility
                    const spinner = fullUILoadingScreen.querySelector('.loading-spinner');
                    if (spinner) {
                        spinner.style.borderColor = 'rgba(255, 255, 255, 0.2)';
                        spinner.style.borderTopColor = '#ffffff';
                    }

                    const messageEl = fullUILoadingScreen.querySelector('.loading-message');
                    if (messageEl) {
                        messageEl.style.color = '#ffffff';
                    }
                }
            }
        }

        // Update status and show progress bar
        if (statusEl) {
            statusEl.textContent = `Submitting comments to ${this.selectedIssues.length} issues...`;
            statusEl.style.color = '#1f75cb';
        }

        if (progressContainer) {
            progressContainer.style.display = 'block';
        }

        if (progressBar) {
            progressBar.style.width = '0%';
        }

        // Disable submit button during operation
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent && b.textContent.includes('Send'));

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        let successCount = 0;
        let failCount = 0;

        // Check if gitlabApi is available
        const gitlabApi = this.gitlabApi || window.gitlabApi || (this.uiManager && this.uiManager.gitlabApi);

        if (!gitlabApi) {
            // Handle API not available error
            this.notification.error('GitLab API not available');
            if (statusEl) {
                statusEl.textContent = 'Error: GitLab API not available.';
                statusEl.style.color = '#dc3545';
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }

            if (progressContainer) {
                progressContainer.style.display = 'none';
            }

            // Remove loading screen if it exists
            if (this.uiManager && this.uiManager.removeLoadingScreen && fullUILoadingScreen) {
                this.uiManager.removeLoadingScreen('comment-submit');
            }

            return;
        }

        // Process issues one by one
        for (let i = 0; i < this.selectedIssues.length; i++) {
            const issue = this.selectedIssues[i];
            if (!issue) {
                failCount++;
                continue;
            }

            // Update progress
            const progress = Math.round((i / this.selectedIssues.length) * 100);
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            if (progressLabel) {
                progressLabel.textContent = `Processing ${i+1} of ${this.selectedIssues.length} issues...`;
            }

            // Update loading screen message
            if (this.uiManager && this.uiManager.updateLoadingMessage) {
                this.uiManager.updateLoadingMessage(
                    'comment-submit',
                    `Sending comment to issue #${issue.iid || i+1} (${i+1}/${this.selectedIssues.length})...`
                );
            }

            try {
                // Submit comment to this issue
                await gitlabApi.addComment(issue, comment);
                successCount++;
            } catch (error) {
                console.error(`Failed to add comment to issue #${issue.iid}:`, error);
                failCount++;
            }
        }

        // Final progress update
        if (progressBar) {
            progressBar.style.width = '100%';
        }

        // Enable submit button again
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }

        // Remove loading screen
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('comment-submit');
        }

        // Update status based on results
        if (successCount === this.selectedIssues.length) {
            if (statusEl) {
                statusEl.textContent = `Successfully added comment to all ${successCount} issues!`;
                statusEl.style.color = '#28a745';
            }

            this.notification.success(`Added comment to ${successCount} issues`);

            // Clear the input after success
            if (this.commentInput) {
                this.commentInput.value = '';
            }

            // Hide progress bar after a delay
            setTimeout(() => {
                if (progressContainer) {
                    progressContainer.style.display = 'none';
                }
            }, 2000);

            // End selection overlay and clear selected issues after a delay
            setTimeout(() => {
                // Exit selection mode if active
                if (this.uiManager && this.uiManager.issueSelector && this.uiManager.issueSelector.isSelectingIssue) {
                    this.uiManager.issueSelector.exitSelectionMode();
                }

                // Clear selected issues
                this.clearSelectedIssues();

                if (statusEl) {
                    statusEl.textContent = '';
                }
            }, 3000);

            // Refresh the board by clicking the search button
            setTimeout(() => {
                this.refreshBoard();
            }, 1000);
        } else {
            if (statusEl) {
                statusEl.textContent = `Added comment to ${successCount} issues, failed for ${failCount} issues.`;
                statusEl.style.color = successCount > 0 ? '#ff9900' : '#dc3545';
            }

            // Show appropriate notification
            if (successCount > 0) {
                this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);

                // Refresh the board even on partial success
                setTimeout(() => {
                    this.refreshBoard();
                }, 1000);
            } else {
                this.notification.error(`Failed to add comments to all ${failCount} issues`);
            }

            // Keep progress bar visible for failed operations
            if (progressBar) {
                progressBar.style.backgroundColor = successCount > 0 ? '#ff9900' : '#dc3545';
            }
        }
    }

    /**
     * Add label shortcut using provided labels or from label manager
     * @param {Array} customLabels - Optional custom labels to use instead of from labelManager
     */
    addLabelShortcut(customLabels) {
        if (!this.commandShortcuts) return;

        try {
            // Store current selected value if there is one
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['label'].dropdown.value;
            }

            // Use provided labels, or try to get them from labelManager, or use fallbacks
            let labelItems;

            if (customLabels) {
                // Use provided custom labels
                labelItems = customLabels;
            } else if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
                // Get labels from label manager if available
                labelItems = [{ value: '', label: 'Add Label' }];

                // Add actual labels from label manager
                const labels = this.labelManager.filteredLabels.map(label => ({
                    value: label.name,
                    label: label.name
                }));

                labelItems = labelItems.concat(labels);

                // Add custom option
                labelItems.push({ value: 'custom', label: 'Custom...' });
            } else {
                // Try to get whitelist directly from settings storage
                try {
                    const whitelist = getLabelWhitelist();
                    if (whitelist && whitelist.length > 0) {
                        labelItems = [{ value: '', label: 'Add Label' }];

                        // Convert whitelist terms to dropdown items
                        const whitelistItems = whitelist.map(term => ({
                            value: term,
                            label: term
                        }));

                        labelItems = labelItems.concat(whitelistItems);
                        labelItems.push({ value: 'custom', label: 'Custom...' });
                    } else {
                        // Fallback if no whitelist available
                        labelItems = this.getFallbackLabels();
                    }
                } catch (e) {
                    console.error('Error getting label whitelist:', e);
                    // Fallback if error
                    labelItems = this.getFallbackLabels();
                }
            }

            // First remove existing shortcut if it exists
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label']) {
                this.commandShortcuts.removeShortcut('label');
            }

            // Then add the new shortcut
            this.commandShortcuts.addCustomShortcut({
                type: 'label',
                label: '/label',
                items: labelItems,
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customLabel = prompt('Enter custom label name:');
                        if (!customLabel) return;
                        value = customLabel;
                    }

                    const textarea = document.getElementById('issue-comment-input');
                    if (!textarea) return;

                    // Create the label command
                    const labelText = `/label ~"${value}"`;

                    this.insertTextAtCursor(textarea, labelText);
                    this.notification.info(`Label added: ${value}`);
                }
            });

            // Restore selected value if it existed
            if (currentValue && this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                this.commandShortcuts.shortcuts['label'].dropdown.value = currentValue;
            }
        } catch (e) {
            console.error('Error adding label shortcut:', e);
        }
    }

    /**
     * Refresh the GitLab board
     */
    refreshBoard() {
        window.location.reload()
    }
}

// File: lib/ui/UIManager.js
// UIManager.js - Main UI coordination class with fixed initialization
/**
 * Main UI Manager that coordinates all UI components
 */
window.UIManager = class UIManager {
    constructor() {
        // Initialize GitLab API reference
        this.gitlabApi = window.gitlabApi;

        // Initialize container elements
        this.container = null;
        this.contentWrapper = null;
        this.headerDiv = null;
        this.header = null;
        this.recalculateBtn = null;
        this.collapseBtn = null;
        this.boardStats = null;

        // Initialize managers first (they're dependencies for views)
        this.initializeManagers();

        // Initialize tab manager and views
        this.tabManager = new TabManager(this);
        this.summaryView = new SummaryView(this);
        this.boardsView = new BoardsView(this);
        this.historyView = new HistoryView(this);
        this.bulkCommentsView = new BulkCommentsView(this);
        this.issueSelector = new IssueSelector({
            uiManager: this,
            onSelectionChange: (selectedIssues) => {
                if (this.bulkCommentsView) {
                    this.bulkCommentsView.setSelectedIssues(selectedIssues);
                }
            }
        });
    }

    /**
     * Initialize the UI and create the container
     */
    initialize() {
        // Create main container if it doesn't exist
        if (document.getElementById('assignee-time-summary')) {
            this.container = document.getElementById('assignee-time-summary');

            // Also get reference to the content wrapper if it exists
            this.contentWrapper = document.getElementById('assignee-time-summary-wrapper');

            // Ensure container has position relative for loading screens
            this.container.style.position = 'relative';

            return;
        }

        // Create container with wider width
        this.container = document.createElement('div');
        this.container.id = 'assignee-time-summary';
        this.container.style.position = 'fixed'; // This is fixed for the entire UI
        this.container.style.bottom = '15px'; // Position at bottom-right as it was before
        this.container.style.right = '15px';
        this.container.style.backgroundColor = 'white';
        this.container.style.border = '1px solid #ddd';
        this.container.style.borderRadius = '4px';
        this.container.style.padding = '10px';
        this.container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        this.container.style.zIndex = '1000';
        this.container.style.maxHeight = '80vh';
        this.container.style.overflow = 'hidden';
        this.container.style.fontSize = '14px';
        this.container.style.width = '400px'; // Increased width from 350px to 400px
        this.container.style.transition = 'height 0.3s ease-in-out';

        // Create content wrapper (for collapsing)
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'assignee-time-summary-wrapper';
        this.contentWrapper.style.display = 'block';
        this.contentWrapper.style.maxHeight = '70vh';
        this.contentWrapper.style.minHeight = '350px'; // Add minimum height of 350px
        this.contentWrapper.style.overflowY = 'auto';
        this.contentWrapper.style.position = 'relative'; // Ensure content wrapper has position relative

        // Create header
        this.createHeader();

        // Create board stats display
        this.createBoardStats();

        // Initialize tabs
        this.tabManager.initialize(this.contentWrapper);

        // Add content wrapper to container
        this.container.appendChild(this.contentWrapper);

        // Add container to body
        document.body.appendChild(this.container);

        // Modified click event handler to exclude select issues function
        // and to exclude the selection overlays and badges
        this.container.addEventListener('click', (e) => {
            // If issue selection is active and the click is inside our container
            // (but not on the selection overlays themselves or buttons from the bulk comments tab)
            if (this.issueSelector && this.issueSelector.isSelectingIssue &&
                !e.target.classList.contains('card-selection-overlay') &&
                !e.target.classList.contains('selection-badge') &&
                // Don't abort when clicking these elements
                !e.target.closest('#bulk-comments-content button') &&
                !e.target.closest('#issue-comment-input') &&
                !e.target.closest('#shortcuts-wrapper') &&
                !e.target.closest('#selected-issues-list') &&
                !e.target.closest('#selection-cancel-button')) {
                this.issueSelector.exitSelectionMode();
            }
        });

        // Check if it should be collapsed initially (from localStorage)
        try {
            const isCollapsed = loadFromStorage('gitlabTimeSummaryCollapsed', 'false') === 'true';
            if (isCollapsed) {
                this.contentWrapper.style.display = 'none';
                if (this.collapseBtn) {
                    this.collapseBtn.textContent = '▲';
                }
                this.container.style.height = 'auto';
            }
        } catch (e) {
            console.warn('Error loading collapsed state:', e);
        }
    }

    /**
     * Initialize managers with error handling
     */
    initializeManagers() {
        // Initialize Label Manager
        try {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    console.log(`Loaded ${labels.length} labels`);
                    // Refresh UI elements that depend on labels
                    if (this.bulkCommentsView && this.bulkCommentsView.addLabelShortcut) {
                        this.bulkCommentsView.addLabelShortcut();
                    }
                }
            });
        } catch (e) {
            console.error('Error initializing LabelManager:', e);
            // Create a placeholder if initialization fails
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([]),
                isLabelInWhitelist: () => false
            };
        }

        // Initialize Assignee Manager
        try {
            this.assigneeManager = new AssigneeManager({
                gitlabApi: this.gitlabApi,
                onAssigneesChange: (assignees) => {
                    console.log(`Assignee whitelist updated with ${assignees.length} entries`);
                    // Refresh UI elements that depend on assignees
                    if (this.bulkCommentsView && this.bulkCommentsView.addAssignShortcut) {
                        this.bulkCommentsView.addAssignShortcut();
                    }
                }
            });
        } catch (e) {
            console.error('Error initializing AssigneeManager:', e);
            // Create a placeholder if initialization fails
            this.assigneeManager = {
                getAssigneeWhitelist: () => []
            };
        }

        // Initialize Milestone Manager
        try {
            this.milestoneManager = new MilestoneManager({
                gitlabApi: this.gitlabApi,
                onMilestonesLoaded: (milestones) => {
                    console.log(`Loaded ${milestones.length} milestones`);
                }
            });
        } catch (e) {
            console.error('Error initializing MilestoneManager:', e);
            // Create a placeholder if initialization fails
            this.milestoneManager = {
                milestones: [],
                fetchMilestones: () => Promise.resolve([])
            };
        }
    }

    /**
     * Create header with title and buttons
     */
    createHeader() {
        this.headerDiv = document.createElement('div');
        this.headerDiv.style.display = 'flex';
        this.headerDiv.style.justifyContent = 'space-between';
        this.headerDiv.style.alignItems = 'center';
        this.headerDiv.style.marginBottom = '5px';
        this.headerDiv.style.cursor = 'pointer';

        // Add click event to header for collapsing
        this.headerDiv.addEventListener('click', (e) => {
            // Don't collapse if clicking on buttons
            if (e.target === this.recalculateBtn ||
                e.target === this.collapseBtn ||
                e.target === this.settingsBtn) {
                return;
            }
            this.toggleCollapse();
        });

        this.header = document.createElement('h3');
        this.header.id = 'assignee-time-summary-header';
        this.header.textContent = 'Summary';
        this.header.style.margin = '0';
        this.header.style.fontSize = '16px';

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '5px';

        // Create recalculate button
        this.recalculateBtn = document.createElement('button');
        this.recalculateBtn.textContent = '🔄';
        this.recalculateBtn.title = 'Recalculate';
        this.recalculateBtn.style.padding = '3px 6px';
        this.recalculateBtn.style.fontSize = '12px';
        this.recalculateBtn.style.backgroundColor = '#1f75cb';
        this.recalculateBtn.style.color = 'white';
        this.recalculateBtn.style.border = 'none';
        this.recalculateBtn.style.borderRadius = '3px';
        this.recalculateBtn.style.cursor = 'pointer';
        this.recalculateBtn.onclick = (e) => {
            e.stopPropagation();
            // Call external updateSummary function with force update
            if (typeof window.updateSummary === 'function') {
                window.updateSummary(true);
            }

            // Visual feedback
            this.recalculateBtn.textContent = '✓';
            setTimeout(() => {
                this.recalculateBtn.textContent = '🔄';
            }, 1000);
        };

        // Create settings button
        this.settingsBtn = document.createElement('button');
        this.settingsBtn.textContent = '⚙️';
        this.settingsBtn.title = 'Settings';
        this.settingsBtn.style.padding = '3px 6px';
        this.settingsBtn.style.fontSize = '12px';
        this.settingsBtn.style.backgroundColor = '#6c757d';
        this.settingsBtn.style.color = 'white';
        this.settingsBtn.style.border = 'none';
        this.settingsBtn.style.borderRadius = '3px';
        this.settingsBtn.style.cursor = 'pointer';
        this.settingsBtn.onclick = (e) => {
            e.stopPropagation();
            this.openSettings();
        };

        // Create collapse button
        this.collapseBtn = document.createElement('button');
        this.collapseBtn.textContent = '▼';
        this.collapseBtn.title = 'Collapse/Expand';
        this.collapseBtn.style.padding = '3px 6px';
        this.collapseBtn.style.fontSize = '12px';
        this.collapseBtn.style.backgroundColor = '#777';
        this.collapseBtn.style.color = 'white';
        this.collapseBtn.style.border = 'none';
        this.collapseBtn.style.borderRadius = '3px';
        this.collapseBtn.style.cursor = 'pointer';
        this.collapseBtn.onclick = (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        };

        buttonContainer.appendChild(this.recalculateBtn);
        buttonContainer.appendChild(this.settingsBtn);
        buttonContainer.appendChild(this.collapseBtn);

        this.headerDiv.appendChild(this.header);
        this.headerDiv.appendChild(buttonContainer);
        this.container.appendChild(this.headerDiv);
    }

    /**
     * Create board stats display
     */
    createBoardStats() {
        // Check if the boardStats element already exists
        const existingStats = document.getElementById('board-stats-summary');
        if (existingStats) {
            // If it exists, just store the reference and return
            this.boardStats = existingStats;
            return;
        }

        // Otherwise create a new one
        this.boardStats = document.createElement('div');
        this.boardStats.id = 'board-stats-summary';
        this.boardStats.style.fontSize = '13px';
        this.boardStats.style.color = '#555';
        this.boardStats.style.marginBottom = '10px';
        this.boardStats.style.display = 'flex';
        this.boardStats.style.justifyContent = 'space-between';
        this.boardStats.textContent = 'Loading board statistics...';
        this.container.appendChild(this.boardStats);
    }

    /**
     * Update board statistics display
     * @param {Object} stats - Board statistics data
     * @param {number} stats.totalCards - Total number of cards
     * @param {number} stats.withTimeCards - Cards with time estimates
     * @param {number} stats.closedCards - Cards in closed/done board
     */
    updateBoardStats(stats) {
        if (!this.boardStats) return;

        // Use default values if not provided
        const totalCards = stats?.totalCards || 0;
        const withTimeCards = stats?.withTimeCards || 0;
        const closedCards = stats?.closedCards || 0;

        this.boardStats.innerHTML = ''; // Clear previous content

        // Create left side stats (total cards)
        const totalStats = document.createElement('div');
        totalStats.style.display = 'flex';
        totalStats.style.gap = '8px';

        const totalText = document.createElement('span');
        totalText.textContent = `Total: ${totalCards} cards`;
        totalStats.appendChild(totalText);

        const withTimeText = document.createElement('span');
        withTimeText.textContent = `(${withTimeCards} with time)`;
        withTimeText.style.color = '#777';
        totalStats.appendChild(withTimeText);

        // Create right side stats (closed cards)
        const closedStats = document.createElement('div');
        closedStats.textContent = `Closed: ${closedCards} cards`;
        closedStats.style.color = '#28a745';

        // Add to board stats container
        this.boardStats.appendChild(totalStats);
        this.boardStats.appendChild(closedStats);
    }

    /**
     * Toggle collapse state of the panel
     */
    toggleCollapse() {
        if (!this.contentWrapper || !this.collapseBtn) return;

        try {
            if (this.contentWrapper.style.display === 'none') {
                // Expand
                this.contentWrapper.style.display = 'block';
                this.collapseBtn.textContent = '▼';
                this.container.style.height = '';
                saveToStorage('gitlabTimeSummaryCollapsed', 'false');
            } else {
                // Collapse
                this.contentWrapper.style.display = 'none';
                this.collapseBtn.textContent = '▲';
                this.container.style.height = 'auto';
                saveToStorage('gitlabTimeSummaryCollapsed', 'true');
            }
        } catch (e) {
            console.error('Error toggling collapse state:', e);
        }
    }

    /**
     * Open settings modal
     */
    openSettings() {
        try {
            // Check if we have a SettingsManager
            if (typeof window.SettingsManager === 'function') {
                const settingsManager = new window.SettingsManager({
                    labelManager: this.labelManager,
                    assigneeManager: this.assigneeManager,
                    gitlabApi: this.gitlabApi,
                    onSettingsChanged: (type) => {
                        console.log(`Settings changed: ${type}`);
                        // Refresh relevant UI components
                        if (type === 'all' || type === 'labels') {
                            if (this.bulkCommentsView) {
                                this.bulkCommentsView.addLabelShortcut();
                            }
                        }
                        if (type === 'all' || type === 'assignees') {
                            if (this.bulkCommentsView) {
                                this.bulkCommentsView.addAssignShortcut();
                            }
                        }
                    }
                });

                settingsManager.openSettingsModal();
            } else {
                console.error('SettingsManager not available');
            }
        } catch (e) {
            console.error('Error opening settings:', e);
        }
    }

    /**
     * Update the header text (with total hours)
     * @param {string} text - Header text to display
     */
    updateHeader(text) {
        if (this.header) {
            // Use innerHTML instead of textContent to allow HTML styling
            this.header.innerHTML = text;
        }
    }

    /**
     * Show loading state in the UI
     * @param {string} message - Message to display
     */
    showLoading(message = 'Loading...') {
        // Check if loading element already exists
        let loadingEl = document.getElementById('assignee-time-summary-loading');

        if (!loadingEl) {
            // Create loading element
            loadingEl = document.createElement('div');
            loadingEl.id = 'assignee-time-summary-loading';
            loadingEl.style.position = 'absolute';
            loadingEl.style.top = '0';
            loadingEl.style.left = '0';
            loadingEl.style.width = '100%';
            loadingEl.style.height = '100%';
            loadingEl.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            loadingEl.style.display = 'flex';
            loadingEl.style.justifyContent = 'center';
            loadingEl.style.alignItems = 'center';
            loadingEl.style.zIndex = '1001';
            loadingEl.style.flexDirection = 'column';

            const spinnerSize = '40px';
            const spinnerHTML = `
            <div style="width: ${spinnerSize}; height: ${spinnerSize}; border: 3px solid #f3f3f3; 
                        border-top: 3px solid #1f75cb; border-radius: 50%; 
                        animation: spin 1s linear infinite;"></div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

            loadingEl.innerHTML = spinnerHTML;

            const loadingText = document.createElement('div');
            loadingText.textContent = message;
            loadingText.style.marginTop = '10px';
            loadingText.style.fontWeight = 'bold';
            loadingText.style.color = '#1f75cb';
            loadingEl.appendChild(loadingText);

            this.container.style.position = 'relative';
            this.container.appendChild(loadingEl);
        } else {
            // Update existing loading element's message
            const loadingText = loadingEl.querySelector('div:not([style*="animation"])');
            if (loadingText) {
                loadingText.textContent = message;
            }
            loadingEl.style.display = 'flex';
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const loadingEl = document.getElementById('assignee-time-summary-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showErrorMessage(message) {
        // First check if there's already an error message
        let errorEl = document.getElementById('assignee-time-summary-error');

        if (!errorEl) {
            // Create error element
            errorEl = document.createElement('div');
            errorEl.id = 'assignee-time-summary-error';
            errorEl.style.margin = '10px 0';
            errorEl.style.padding = '10px';
            errorEl.style.backgroundColor = '#f8d7da';
            errorEl.style.color = '#721c24';
            errorEl.style.borderRadius = '4px';
            errorEl.style.border = '1px solid #f5c6cb';
            errorEl.style.fontSize = '14px';
            errorEl.style.display = 'flex';
            errorEl.style.justifyContent = 'space-between';
            errorEl.style.alignItems = 'center';

            const errorText = document.createElement('div');
            errorText.textContent = message;
            errorEl.appendChild(errorText);

            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.background = 'none';
            closeBtn.style.border = 'none';
            closeBtn.style.fontSize = '20px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.color = '#721c24';
            closeBtn.style.fontWeight = 'bold';
            closeBtn.onclick = () => {
                errorEl.remove();
            };

            errorEl.appendChild(closeBtn);

            // Add to beginning of content
            if (this.contentWrapper) {
                this.contentWrapper.insertBefore(errorEl, this.contentWrapper.firstChild);
            }
        } else {
            // Update existing error message
            const errorText = errorEl.querySelector('div');
            if (errorText) {
                errorText.textContent = message;
            }
            errorEl.style.display = 'flex';
        }

        // Auto-hide error after 10 seconds
        setTimeout(() => {
            if (errorEl && errorEl.parentNode) {
                errorEl.remove();
            }
        }, 10000);
    }

    /**
     * Add a loading screen to a specific container
     * @param {HTMLElement|string} container - Container element or ID
     * @param {string} name - Unique name for this loading screen
     * @param {string} message - Optional message to display
     * @returns {HTMLElement} The created loading screen element
     */
    addLoadingScreen(container, name, message = 'Loading...') {
        // Get container element if string ID was provided
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }

        // Return if container not found
        if (!container) {
            console.warn(`Container not found for loading screen: ${name}`);
            return null;
        }

        // Check if this loading screen already exists
        const existingLoader = document.getElementById(`loading-screen-${name}`);
        if (existingLoader) {
            // Just update the message if it exists
            const messageEl = existingLoader.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
            return existingLoader;
        }

        // Create loading screen overlay
        const loadingScreen = document.createElement('div');
        loadingScreen.id = `loading-screen-${name}`;
        loadingScreen.className = 'gitlab-helper-loading-screen';

        // Position absolutely over the container
        loadingScreen.style.position = 'absolute';
        loadingScreen.style.top = '0';
        loadingScreen.style.left = '0';
        loadingScreen.style.width = '100%';
        loadingScreen.style.height = '100%';
        loadingScreen.style.backgroundColor = 'rgba(255, 255, 255, 0.9)';

        // Use flex for perfect centering
        loadingScreen.style.display = 'flex';
        loadingScreen.style.flexDirection = 'column';
        loadingScreen.style.justifyContent = 'center';
        loadingScreen.style.alignItems = 'center';

        loadingScreen.style.zIndex = '100';
        loadingScreen.style.transition = 'opacity 0.3s ease';

        // Create spinner animation
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.width = '40px';
        spinner.style.height = '40px';
        spinner.style.borderRadius = '50%';
        spinner.style.border = '3px solid rgba(31, 117, 203, 0.2)';
        spinner.style.borderTopColor = '#1f75cb';
        spinner.style.animation = 'gitlab-helper-spin 1s linear infinite';

        // Create loading message
        const messageEl = document.createElement('div');
        messageEl.className = 'loading-message';
        messageEl.textContent = message;
        messageEl.style.marginTop = '15px';
        messageEl.style.fontWeight = 'bold';
        messageEl.style.color = '#555';
        messageEl.style.fontSize = '14px';
        messageEl.style.textAlign = 'center'; // Ensure text is centered
        messageEl.style.padding = '0 10px'; // Add some padding for longer messages

        // Add animation keyframes if they don't exist yet
        if (!document.getElementById('gitlab-helper-loading-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'gitlab-helper-loading-styles';
            styleEl.textContent = `
            @keyframes gitlab-helper-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            @keyframes gitlab-helper-pulse {
                0% { opacity: 0.6; }
                50% { opacity: 1; }
                100% { opacity: 0.6; }
            }
        `;
            document.head.appendChild(styleEl);
        }

        // Assemble the loading screen
        loadingScreen.appendChild(spinner);
        loadingScreen.appendChild(messageEl);

        // Make sure container has position set for absolute positioning to work
        const containerPosition = window.getComputedStyle(container).position;
        if (containerPosition === 'static' || !containerPosition) {
            // Log a message to help debug positioning issues
            console.log(`Setting position: relative on container for loading screen: ${name}`);

            // Set container to relative positioning
            container.style.position = 'relative';

            // Store original position to restore later
            container.dataset.originalPosition = containerPosition;
        }

        // Append to container
        container.appendChild(loadingScreen);

        // Add a subtle animation to the message
        messageEl.style.animation = 'gitlab-helper-pulse 2s ease infinite';

        return loadingScreen;
    }

    /**
     * Remove a loading screen by name
     * @param {string} name - Name of the loading screen to remove
     * @param {boolean} fadeOut - Whether to fade out the loading screen
     */
    removeLoadingScreen(name, fadeOut = true) {
        const loadingScreen = document.getElementById(`loading-screen-${name}`);
        if (!loadingScreen) return;

        // Get parent container to restore position if needed
        const container = loadingScreen.parentNode;

        if (fadeOut) {
            // Fade out animation
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }

                // Restore original position if we changed it
                if (container && container.dataset.originalPosition) {
                    container.style.position = container.dataset.originalPosition;
                    delete container.dataset.originalPosition;
                }
            }, 300); // Match the transition duration
        } else {
            // Remove immediately
            loadingScreen.parentNode.removeChild(loadingScreen);

            // Restore original position if we changed it
            if (container && container.dataset.originalPosition) {
                container.style.position = container.dataset.originalPosition;
                delete container.dataset.originalPosition;
            }
        }
    }

    /**
     * Update the message of an existing loading screen
     * @param {string} name - Name of the loading screen
     * @param {string} message - New message to display
     */
    updateLoadingMessage(name, message) {
        const loadingScreen = document.getElementById(`loading-screen-${name}`);
        if (!loadingScreen) return;

        const messageEl = loadingScreen.querySelector('.loading-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }
}


// File: lib/ui/index.js
// UI integration file for GitLab Assignee Time Summary
// This file loads all the UI components and provides the interface for the main script
// Create instance of the UI Manager
window.uiManager = window.uiManager || new UIManager();

/**
 * Create summary container wrapper function (used in main.js)
 * @returns {HTMLElement} The summary container element
 */
window.createSummaryContainer = function createSummaryContainer() {
    uiManager.initialize();
    return uiManager.container;
}
/**
 * Create the UI Manager and connect settings
 */
function createUIManager() {
    window.uiManager = window.uiManager || new UIManager();

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
window.updateSummaryTab = function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
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
window.updateBoardsTab = function updateBoardsTab(boardData, boardAssigneeData) {
    uiManager.boardsView.render(boardData, boardAssigneeData);
}

/**
 * Update Bulk Comments Tab wrapper function (previously API tab)
 */
window.updateBulkCommentsTab = function updateBulkCommentsTab() {
    uiManager.bulkCommentsView.render();
}

/**
 * Override renderHistory function to use our class (called from history.js)
 */
window.renderHistory = function renderHistory() {
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

// File: lib/index.js
// Main index file for GitLab Sprint Helper
// This file serves as the main entry point for the module

// Import API
// Import core modules
// Import storage modules
// Import UI modules
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
        window.uiManager = window.uiManager || new UIManager();

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
function waitForBoards() {
    // Check if we've already completed initialization
    if (window.boardsInitialized) {
        console.log('Boards already initialized, skipping');
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


// File: main.js (main script content)


(function () {
    'use strict';

    // Setup global class references to ensure they're available
    function setupGlobalReferences() {
        // These will be handled by the build process that combines all files
        // No need to duplicate declarations here
    }

    /**
     * This file is the main entry point for the GitLab Sprint Helper userscript.
     * Most of the code has been moved to modular files in the lib/ directory.
     * This file just ensures the initialization is done only once.
     */

    // No need to directly call functions here since lib/index.js
    // already handles initialization when bundled
})();

})(window);

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


window.formatHours = function formatHours(seconds) {
    return (seconds / 3600);
}

window.generateColorFromString = function generateColorFromString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32bit integer
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 75%)`;
}


window.getContrastColor = function getContrastColor(bgColor) {
    if (bgColor.startsWith('hsl')) {
        const matches = bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
        if (matches && matches[1]) {
            const lightness = parseInt(matches[1], 10);
            return lightness > 60 ? 'black' : 'white';
        }
    }
    let r = 0, g = 0, b = 0;
    try {
        const elem = document.createElement('div');
        elem.style.backgroundColor = bgColor;
        document.body.appendChild(elem);
        const style = window.getComputedStyle(elem);
        const rgb = style.backgroundColor;
        document.body.removeChild(elem);
        const rgbMatch = rgb.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
        if (rgbMatch) {
            r = parseInt(rgbMatch[1], 10);
            g = parseInt(rgbMatch[2], 10);
            b = parseInt(rgbMatch[3], 10);
        }
    } catch (e) {
        if (bgColor.startsWith('hsl')) {
            return bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/) ?
                (parseInt(bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/)[1], 10) > 60 ? 'black' : 'white') :
                'black';
        }
        return 'black'; // Default to black on error
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? 'black' : 'white';
}



window.isActiveInputElement = function isActiveInputElement(element) {
    // Check if element is an input field, textarea, or has contenteditable
    if (element.tagName === 'INPUT') {
        const type = element.getAttribute('type');
        // These input types expect typing
        const typingInputs = ['text', 'password', 'email', 'search', 'tel', 'url', null, ''];
        return typingInputs.includes(type);
    }

    if (element.tagName === 'TEXTAREA') {
        return true;
    }

    // Check for contenteditable
    if (element.hasAttribute('contenteditable') &&
        element.getAttribute('contenteditable') !== 'false') {
        return true;
    }

    return false;
}

// File: lib/api/APIUtils.js


window.getPathFromUrl = function getPathFromUrl() {
    try {
                
        const pathname = window.location.pathname;
        if (pathname.includes('/groups/') && pathname.includes('/-/boards')) {
            const groupPattern = /\/groups\/([^\/]+(?:\/[^\/]+)*)\/?-?\/?boards/;
            const match = pathname.match(groupPattern);

            if (!match || !match[1]) {
                console.warn('Could not extract group path from URL:', pathname);
                return null;
            }

            const path = match[1];
            const cleanPath = path.replace(/\/-$/, '');
            const encodedPath = encodeURIComponent(cleanPath);
            const apiUrl = `groups/${encodedPath}/labels`;
            
            return {
                path: cleanPath,
                encodedPath,
                type: 'group',
                apiUrl
            };
        }
        else if (pathname.includes('/-/boards')) {
            const projectPattern = /^\/([^\/]+(?:\/[^\/]+)*)\/-\/boards/;
            const match = pathname.match(projectPattern);

            if (!match || !match[1]) {
                console.warn('Could not extract project path from URL pattern:', pathname);
                return null;
            }

            const path = match[1];
            const encodedPath = encodeURIComponent(path);
            const apiUrl = `projects/${encodedPath}/labels`;
            
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


window.getCurrentUrlKey = function getCurrentUrlKey() {
    const url = window.location.href;
    return url.split('#')[0];
}


window.getHistoryKey = function getHistoryKey() {
    return `timeEstimateHistory_${getCurrentUrlKey()}`;
}

// File: lib/api/GitLabAPI.js

window.GitLabAPI = class GitLabAPI {
    constructor() {
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        this.baseUrl = '/api/v4';
    }

    
    callGitLabApi(endpoint, options = {}) {
        const {
            method = 'GET',
            data = null,
            params = null
        } = options;
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
        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin' // Include cookies
        };
        if (method !== 'GET' && this.csrfToken) {
            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
        }
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            fetchOptions.body = JSON.stringify(data);
        }


        return fetch(url, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }
                return response.json();
            });
    }
    
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

    
    getCurrentUser() {
        return this.callGitLabApi('user');
    }
    // Add to GitLabAPI class
    callGitLabApiWithCache(endpoint, options = {}, cacheDuration = 60000) { // 1 hour cache by default
        const cacheKey = `gitlab_api_cache_${endpoint}_${JSON.stringify(options)}`;
        const cachedData = localStorage.getItem(cacheKey);

        if (cachedData) {
            try {
                const { data, timestamp } = JSON.parse(cachedData);
                const now = Date.now();

                // Check if cache is still valid
                if (now - timestamp < cacheDuration) {
                    return Promise.resolve(data);
                }
            } catch (e) {
                console.warn('Error parsing cached data:', e);
            }
        }

        // No valid cache, make the actual API call
        return this.callGitLabApi(endpoint, options).then(data => {
            // Cache the result
            localStorage.setItem(cacheKey, JSON.stringify({
                data,
                timestamp: Date.now()
            }));

            return data;
        });
    }

}



window.GitLabAPI = GitLabAPI;

window.gitlabApi = window.gitlabApi || new GitLabAPI();

// File: lib/core/DataProcessor.js
// lib/core/DataProcessor.js - processBoards function
window.processBoards = function processBoards() {
    const assigneeTimeMap = {};
    const boardData = {};
    const boardAssigneeData = {};
    let totalEstimate = 0;
    let cardsProcessed = 0;
    let cardsWithTime = 0;
    let currentMilestone = null;
    let closedBoardCards = 0;
    // Initialize userDistributionMap here at the top level
    const userDistributionMap = {};

    const boardLists = document.querySelectorAll('.board-list');

    boardLists.forEach((boardList, listIndex) => {
        let boardTitle = "U" + listIndex.toString();

        try {
            if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                const boardComponent = boardList.__vue__.$children.find(child =>
                    child.$props && child.$props.list && child.$props.list.title);

                if (boardComponent && boardComponent.$props.list.title) {
                    boardTitle = boardComponent.$props.list.title;
                }
            }
            if (boardTitle === 'Unknown') {
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim();
                }
            }
        } catch (e) {
            console.error('Error getting board title:', e);
            const boardHeader = boardList.querySelector('.board-title-text');
            if (boardHeader) {
                boardTitle = boardHeader.textContent.trim();
            }
        }
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
            const lowerTitle = boardTitle.toLowerCase();
            const isClosedBoard = lowerTitle.includes('done') ||
                lowerTitle.includes('closed') ||
                lowerTitle.includes('complete') ||
                lowerTitle.includes('finished');
        } else {
            return; // Skip processing this board
        }
        const boardItems = boardList.querySelectorAll('.board-card');
        const lowerTitle = boardTitle.toLowerCase();
        const isClosedBoard = lowerTitle.includes('done') ||
            lowerTitle.includes('closed') ||
            lowerTitle.includes('complete') ||
            lowerTitle.includes('finished');
        if (isClosedBoard) {
            closedBoardCards += boardItems.length;
        }

        boardItems.forEach(item => {
            try {
                cardsProcessed++;
                boardData[boardTitle].tickets++;
                if (item.__vue__ && item.__vue__.$children) {
                    const issue = item.__vue__.$children.find(child =>
                        child.$props && child.$props.item && child.$props.item.timeEstimate !== undefined);

                    if (issue && issue.$props) {
                        const props = issue.$props;
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
                                    const assigneeShare = timeEstimate / assignees.length;
                                    const name = assignee.name;

                                    // Initialize user distribution map if needed
                                    if (!userDistributionMap[name]) {
                                        userDistributionMap[name] = {};
                                        // Initialize with zero for all boards
                                        Object.keys(boardData).forEach(board => {
                                            userDistributionMap[name][board] = 0;
                                        });
                                    }

                                    // Update the distribution for this board
                                    userDistributionMap[name][boardTitle] =
                                        (userDistributionMap[name][boardTitle] || 0) + assigneeShare;

                                    if (!assigneeTimeMap[name]) {
                                        assigneeTimeMap[name] = 0;
                                    }
                                    assigneeTimeMap[name] += assigneeShare;
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
                                // Handle unassigned items
                                if (!userDistributionMap['Unassigned']) {
                                    userDistributionMap['Unassigned'] = {};
                                    // Initialize with zero for all boards
                                    Object.keys(boardData).forEach(board => {
                                        userDistributionMap['Unassigned'][board] = 0;
                                    });
                                }

                                // Update the distribution for this board
                                userDistributionMap['Unassigned'][boardTitle] =
                                    (userDistributionMap['Unassigned'][boardTitle] || 0) + timeEstimate;

                                if (!assigneeTimeMap['Unassigned']) {
                                    assigneeTimeMap['Unassigned'] = 0;
                                }
                                assigneeTimeMap['Unassigned'] += timeEstimate;
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

        uiManager.issueSelector.applyOverflowFixes()
    });

    // Format the distribution data to store with the history
    const formattedUserDistributions = {};
    Object.keys(userDistributionMap).forEach(name => {
        // Get ordered board names to ensure consistent order
        const orderedBoards = Object.keys(userDistributionMap[name]).sort((a, b) => {
            // Put done/closed boards at the end
            const aIsClosed = a.toLowerCase().includes('done') ||
                a.toLowerCase().includes('closed') ||
                a.toLowerCase().includes('complete') ||
                a.toLowerCase().includes('finished');
            const bIsClosed = b.toLowerCase().includes('done') ||
                b.toLowerCase().includes('closed') ||
                b.toLowerCase().includes('complete') ||
                b.toLowerCase().includes('finished');

            if (aIsClosed && !bIsClosed) return 1;
            if (!aIsClosed && bIsClosed) return -1;
            return a.localeCompare(b);
        });

        // Create an array of formatted hour values
        formattedUserDistributions[name] = {
            distribution: orderedBoards.map(board => {
                const timeInSeconds = userDistributionMap[name][board] || 0;
                return Math.round(formatHours(timeInSeconds));
            })
        };
    });

    try {
        if (window.historyManager) {
            window.historyManager.saveHistoryEntry({
                assigneeTimeMap,
                boardData,
                boardAssigneeData,
                totalEstimate,
                cardsProcessed,
                cardsWithTime,
                currentMilestone,
                closedBoardCards,
                userDistributions: formattedUserDistributions // Add this to history
            });
        }
    } catch (e) {
        console.error('Error saving history data:', e);
    }

    return {
        assigneeTimeMap,
        boardData,
        boardAssigneeData,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone,
        closedBoardCards,
        userDistributions: formattedUserDistributions // Also return it
    };
}

// File: lib/core/HistoryManager.js

window.HistoryManager = class HistoryManager {
    constructor() {
        this.historyData = {};
    }

    
    getBoardKey() {
        try {
            const url = window.location.href;
            // Split at /boards/ and take everything after
            const splitAtBoards = url.split('/boards/');
            if (splitAtBoards.length < 2) {
                return 'unknown-board';
            }

            // Return everything after /boards/ as the key
            return splitAtBoards[1];
        } catch (error) {
            console.error('Error generating board key:', error);
            return 'unknown-board';
        }
    }

    
    saveHistoryEntry(data) {
        try {
            const boardKey = this.getBoardKey();
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            // Load existing history
            const history = this.loadHistory();

            // Initialize board history if needed
            if (!history[boardKey]) {
                history[boardKey] = {};
            }

            // Make sure we preserve the userDistributions data
            const userPerformance = data.userPerformance || {};
            const userDistributions = data.userDistributions || {};

            // If we have both user performance and distributions, merge them
            if (Object.keys(userPerformance).length > 0 && Object.keys(userDistributions).length > 0) {
                Object.keys(userPerformance).forEach(name => {
                    if (userDistributions[name]) {
                        userPerformance[name].distribution = userDistributions[name].distribution;
                    }
                });
            }

            // Update or create today's entry
            history[boardKey][today] = {
                ...data,
                userDistributions: userDistributions, // Ensure this is saved
                timestamp: new Date().toISOString()
            };

            // Save back to localStorage
            localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));

            return true;
        } catch (error) {
            console.error('Error saving history entry:', error);
            return false;
        }
    }

    
    loadHistory() {
        try {
            const historyData = localStorage.getItem('gitLabHelperHistory');
            if (!historyData) {
                return {};
            }
            return JSON.parse(historyData);
        } catch (error) {
            console.error('Error loading history data:', error);
            return {};
        }
    }

    
    getCurrentBoardHistory() {
        const boardKey = this.getBoardKey();
        const history = this.loadHistory();
        return history[boardKey] || {};
    }

    
    clearAllHistory() {
        try {
            localStorage.removeItem('gitLabHelperHistory');
            return true;
        } catch (error) {
            console.error('Error clearing history:', error);
            return false;
        }
    }

    
    clearCurrentBoardHistory() {
        try {
            const boardKey = this.getBoardKey();
            const history = this.loadHistory();

            if (history[boardKey]) {
                delete history[boardKey];
                localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));
            }

            return true;
        } catch (error) {
            console.error('Error clearing board history:', error);
            return false;
        }
    }
}

// File: lib/storage/LocalStorage.js


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


window.loadFromStorage = function loadFromStorage(key, defaultValue = null) {
    try {
        const value = localStorage.getItem(key);
        if (value === null) {
            return defaultValue;
        }
        if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
            try {
                return JSON.parse(value);
            } catch (e) {
                console.warn(`Failed to parse value for ${key} as JSON, returning as string instead`);
                return value;
            }
        }
        return value;
    } catch (error) {
        console.error(`Error loading from localStorage (${key}):`, error);
        return defaultValue;
    }
}


// File: lib/storage/SettingsStorage.js
const STORAGE_KEYS = {
    LABEL_WHITELIST: 'gitLabHelperLabelWhitelist',
    ASSIGNEE_WHITELIST: 'gitLabHelperAssigneeWhitelist',
    LAST_ACTIVE_TAB: 'gitLabHelperLastActiveTab',
    UI_COLLAPSED: 'gitlabTimeSummaryCollapsed'
};

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
    uiCollapsed: false,
    toggleShortcut: 'c' // Default shortcut is 'c'
};


window.getLabelWhitelist = function getLabelWhitelist() {
    try {
        const whitelist = loadFromStorage(STORAGE_KEYS.LABEL_WHITELIST, null);
        if (whitelist === null) {
            return [...DEFAULT_SETTINGS.labelWhitelist];
        }
        if (!Array.isArray(whitelist)) {
            console.warn('Label whitelist is not an array, using default');
            return [...DEFAULT_SETTINGS.labelWhitelist];
        }
        const cleanedWhitelist = whitelist.filter(item => typeof item === 'string');
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


window.saveLabelWhitelist = function saveLabelWhitelist(whitelist) {
    try {
        if (!Array.isArray(whitelist)) {
            console.warn('Attempting to save invalid whitelist (not an array), using empty array instead');
            whitelist = [];
        }
        const cleanedWhitelist = whitelist.filter(item => typeof item === 'string');
        return saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, cleanedWhitelist);
    } catch (error) {
        console.error('Error saving label whitelist:', error);
        return false;
    }
}


window.resetLabelWhitelist = function resetLabelWhitelist() {
    try {
        const defaultWhitelist = [...DEFAULT_SETTINGS.labelWhitelist];
        saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, defaultWhitelist);
        return defaultWhitelist;
    } catch (error) {
        console.error('Error resetting label whitelist:', error);
        return [...DEFAULT_SETTINGS.labelWhitelist];
    }
}


window.getAssigneeWhitelist = function getAssigneeWhitelist() {
    try {
        const whitelist = loadFromStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, null);
        if (whitelist === null) {
            return [];
        }
        if (!Array.isArray(whitelist)) {
            console.warn('Assignee whitelist is not an array, using empty array');
            return [];
        }
        return whitelist.filter(item =>
            item && typeof item === 'object' && typeof item.username === 'string'
        );
    } catch (error) {
        console.error('Error getting assignee whitelist:', error);
        return [];
    }
}


window.saveAssigneeWhitelist = function saveAssigneeWhitelist(whitelist) {
    try {
        if (!Array.isArray(whitelist)) {
            console.warn('Attempting to save invalid assignee whitelist (not an array), using empty array instead');
            whitelist = [];
        }
        const cleanedWhitelist = whitelist.filter(item =>
            item && typeof item === 'object' && typeof item.username === 'string'
        );
        return saveToStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, cleanedWhitelist);
    } catch (error) {
        console.error('Error saving assignee whitelist:', error);
        return false;
    }
}



window.getLastActiveTab = function getLastActiveTab() {
    try {
        const tabId = loadFromStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, null);
        if (tabId === null) {
            return DEFAULT_SETTINGS.lastActiveTab;
        }
        if (typeof tabId !== 'string') {
            const stringTabId = String(tabId);
            if (stringTabId && ['summary', 'boards', 'bulkcomments', 'sprintmanagement'].includes(stringTabId)) {
                return stringTabId;
            }
            console.warn('Invalid tab ID format, using default');
            return DEFAULT_SETTINGS.lastActiveTab;
        }
        // If history tab was saved, return summary instead
        if (tabId === 'history') {
            return 'summary';
        }
        if (!['summary', 'boards', 'bulkcomments', 'sprintmanagement'].includes(tabId)) {
            console.warn(`Unknown tab ID: ${tabId}, using default`);
            return DEFAULT_SETTINGS.lastActiveTab;
        }

        return tabId;
    } catch (error) {
        console.error('Error getting last active tab:', error);
        return DEFAULT_SETTINGS.lastActiveTab;
    }
}


window.saveLastActiveTab = function saveLastActiveTab(tabId) {
    try {
        const tabIdStr = String(tabId);
        if (!['summary', 'boards', 'bulkcomments', 'sprintmanagement'].includes(tabIdStr)) {
            console.warn(`Attempting to save invalid tab ID: ${tabIdStr}, using default`);
            return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, DEFAULT_SETTINGS.lastActiveTab);
        }
        return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, tabIdStr);
    } catch (error) {
        console.error('Error saving last active tab:', error);
        return false;
    }
}


window.getToggleShortcut = function getToggleShortcut() {
    try {
        const shortcut = loadFromStorage(STORAGE_KEYS.TOGGLE_SHORTCUT, null);
        if (shortcut === null) {
            return DEFAULT_SETTINGS.toggleShortcut;
        }
        // Make sure it's a single character
        if (typeof shortcut === 'string' && shortcut.length === 1) {
            return shortcut;
        }
        console.warn('Invalid toggle shortcut format, using default');
        return DEFAULT_SETTINGS.toggleShortcut;
    } catch (error) {
        console.error('Error getting toggle shortcut:', error);
        return DEFAULT_SETTINGS.toggleShortcut;
    }
}


window.saveToggleShortcut = function saveToggleShortcut(shortcut) {
    try {
        if (typeof shortcut !== 'string' || shortcut.length !== 1) {
            console.warn('Attempting to save invalid shortcut, using default');
            shortcut = DEFAULT_SETTINGS.toggleShortcut;
        }
        return saveToStorage(STORAGE_KEYS.TOGGLE_SHORTCUT, shortcut);
    } catch (error) {
        console.error('Error saving toggle shortcut:', error);
        return false;
    }
}

// File: lib/ui/components/Notification.js


window.Notification = class Notification {
    
    constructor(options = {}) {
        this.position = 'top-right';
        this.duration = options.duration || 3000;
        this.animationDuration = options.animationDuration || '0.3s';
        this.container = null;
        this.createContainer();
    }

    
    createContainer() {
        if (document.getElementById('gitlab-helper-notifications')) {
            this.container = document.getElementById('gitlab-helper-notifications');
            return;
        }
        this.container = document.createElement('div');
        this.container.id = 'gitlab-helper-notifications';
        this.container.style.position = 'fixed';
        this.container.style.zIndex = '100';
        switch (this.position) {
            case 'top-right':
                this.container.style.top = '120px';
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
        document.body.appendChild(this.container);
    }

    
    show(options) {
        const message = options.message || '';
        const type = options.type || 'info';
        const duration = options.duration || this.duration;
        const onClose = options.onClose || null;
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
        const messageContainer = document.createElement('div');
        messageContainer.style.flex = '1';
        messageContainer.textContent = message;
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
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.opacity = '1';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.opacity = '0.7';
        });
        closeButton.addEventListener('click', () => {
            this.close(notification, onClose);
        });
        notification.appendChild(messageContainer);
        notification.appendChild(closeButton);
        this.container.appendChild(notification);
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);
        if (duration > 0) {
            setTimeout(() => {
                this.close(notification, onClose);
            }, duration);
        }

        return notification;
    }

    
    close(notification, callback = null) {
        if (notification.dataset.closing === 'true') {
            return;
        }
        notification.dataset.closing = 'true';
        notification.style.opacity = '0';
        notification.style.transform = this.getInitialTransform();
        setTimeout(() => {
            if (notification.parentNode === this.container) {
                this.container.removeChild(notification);
            }
            if (callback && typeof callback === 'function') {
                callback();
            }
        }, parseFloat(this.animationDuration) * 1000);
    }

    
    getInitialTransform() {
        if (this.position.startsWith('top')) {
            return 'translateY(-20px)';
        } else {
            return 'translateY(20px)';
        }
    }

    
    success(message, options = {}) {
        return this.show({
            message,
            type: 'success',
            ...options
        });
    }

    
    error(message, options = {}) {
        return this.show({
            message,
            type: 'error',
            ...options
        });
    }

    
    warning(message, options = {}) {
        return this.show({
            message,
            type: 'warning',
            ...options
        });
    }

    
    info(message, options = {}) {
        return this.show({
            message,
            type: 'info',
            ...options
        });
    }
}

// File: lib/ui/components/CommandShortcut.js


window.CommandShortcut = class CommandShortcut {
    
    constructor(options) {
        this.targetElement = options.targetElement;
        this.onShortcutInsert = options.onShortcutInsert || null;
        this.shortcutsContainer = null;
        this.shortcuts = {};
    }

    
    initialize(parentElement) {
        if (this.shortcutsContainer && this.shortcutsContainer.parentNode) {
            this.shortcutsContainer.parentNode.removeChild(this.shortcutsContainer);
        }
        this.shortcutsContainer = document.createElement('div');
        this.shortcutsContainer.className = 'command-shortcuts-container';
        this.shortcutsContainer.style.marginBottom = '10px';
        this.shortcutsContainer.style.display = 'flex';
        this.shortcutsContainer.style.flexDirection = 'column'; // Changed to column to ensure consistent order
        this.shortcutsContainer.style.gap = '8px';
        this.shortcutsContainer.style.alignItems = 'stretch';
        parentElement.appendChild(this.shortcutsContainer);
        this.initializeEstimateShortcut();
    }

    
    initializeEstimateShortcut() {
        if (this.shortcuts['estimate']) {
            this.removeShortcut('estimate');
        }
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

    
    removeShortcut(type) {
        if (this.shortcuts[type] && this.shortcuts[type].element) {
            const element = this.shortcuts[type].element;
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            delete this.shortcuts[type];
        }
    }

    
    handleCustomEstimate() {
        const customValue = prompt('Enter custom estimate hours (whole numbers only):', '');
        if (customValue === null || customValue === '') {
            return;
        }

        const parsedValue = parseInt(customValue, 10);
        if (isNaN(parsedValue) || parsedValue <= 0 || parsedValue !== parseFloat(customValue)) {
            alert('Please enter a valid positive whole number.');
            return;
        }
        this.insertEstimateText(parsedValue.toString());
    }

    
    insertEstimateText(hours) {
        if (!this.targetElement) return;

        const estimateText = `/estimate ${hours}h`;
        const currentText = this.targetElement.value;
        const estimateRegex = /\/estimate\s+\d+h/g;
        const hasEstimate = estimateRegex.test(currentText);

        if (hasEstimate) {
            this.targetElement.value = currentText.replace(estimateRegex, estimateText);
        } else {
            const startPos = this.targetElement.selectionStart;
            const endPos = this.targetElement.selectionEnd;
            let insertText = estimateText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }
            this.targetElement.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);
            const newCursorPos = startPos + insertText.length;
            this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
        }
        this.targetElement.focus();
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert('estimate', hours);
        }
    }

    // Modify the CommandShortcut class in lib/ui/components/CommandShortcut.js to support toggle mode

    
    addCustomShortcut(options) {
        if (!this.shortcutsContainer) {
            console.error("Shortcuts container not initialized");
            return null;
        }
        if (this.shortcuts && this.shortcuts[options.type]) {
            this.removeShortcut(options.type);
        }
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

        // Label and Toggle container (new)
        const labelContainer = document.createElement('div');
        labelContainer.style.display = 'flex';
        labelContainer.style.alignItems = 'center';
        labelContainer.style.minWidth = '100px';
        labelContainer.style.flexShrink = '0'; // Prevent shrinking

        const shortcutLabel = document.createElement('div');
        shortcutLabel.textContent = options.label;
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.fontWeight = 'bold';
        shortcutLabel.style.color = '#555';
        shortcutLabel.style.whiteSpace = 'nowrap';

        labelContainer.appendChild(shortcutLabel);

        // Create toggle button if toggleMode is enabled
        let toggleButton = null;
        let isAddMode = true; // Default to add mode
        let originalItems = [...options.items]; // Store original items

        if (options.toggleMode) {
            toggleButton = document.createElement('button');
            toggleButton.type = 'button';
            toggleButton.innerHTML = '+'; // Default to add mode
            toggleButton.title = 'Toggle between Add and Remove mode';
            toggleButton.style.marginLeft = '6px';
            toggleButton.style.width = '20px';
            toggleButton.style.height = '20px';
            toggleButton.style.display = 'flex';
            toggleButton.style.alignItems = 'center';
            toggleButton.style.justifyContent = 'center';
            toggleButton.style.border = '1px solid #ccc';
            toggleButton.style.borderRadius = '50%';
            toggleButton.style.backgroundColor = '#28a745'; // Green for add
            toggleButton.style.color = 'white';
            toggleButton.style.fontSize = '14px';
            toggleButton.style.fontWeight = 'bold';
            toggleButton.style.cursor = 'pointer';
            toggleButton.style.padding = '0';
            toggleButton.style.lineHeight = '1';

            toggleButton.addEventListener('click', () => {
                isAddMode = !isAddMode;

                // Update toggle button appearance
                if (isAddMode) {
                    toggleButton.innerHTML = '+';
                    toggleButton.style.backgroundColor = '#28a745'; // Green for add
                    toggleButton.title = 'Switch to Remove mode';
                } else {
                    toggleButton.innerHTML = '−'; // Using minus sign
                    toggleButton.style.backgroundColor = '#dc3545'; // Red for remove
                    toggleButton.title = 'Switch to Add mode';
                }

                // Update dropdown first option
                if (dropdown.options.length > 0) {
                    if (options.type === 'label') {
                        dropdown.options[0].text = isAddMode ? 'Add Label' : 'Remove Label';
                    } else if (options.type === 'assign') {
                        dropdown.options[0].text = isAddMode ? 'Assign to...' : 'Unassign from...';
                    }
                }

                // Store the mode in the dropdown element for access in the handler
                dropdown.dataset.mode = isAddMode ? 'add' : 'remove';
            });

            labelContainer.appendChild(toggleButton);
        }

        const dropdownContainer = document.createElement('div');
        dropdownContainer.style.flex = '1';
        dropdownContainer.style.position = 'relative';
        dropdownContainer.style.height = '24px'; // Fixed height
        dropdownContainer.style.marginLeft = '10px';

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

        // Set initial mode
        dropdown.dataset.mode = 'add';

        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = options.items[0]?.label || 'Select...';
        placeholderOption.selected = true;
        dropdown.appendChild(placeholderOption);

        if (options.items && options.items.length > 0) {
            options.items.forEach((item, index) => {
                if (index === 0) return; // Skip the first one, already added as placeholder

                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label;
                dropdown.appendChild(option);
            });
        }

        dropdown.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            if (selectedValue && options.onSelect) {
                // Pass the current mode to the onSelect handler
                const currentMode = dropdown.dataset.mode || 'add';
                options.onSelect(selectedValue, currentMode);
                e.target.value = ''; // Reset after selection
            }
        });

        dropdownContainer.appendChild(dropdown);
        shortcutContainer.appendChild(labelContainer);
        shortcutContainer.appendChild(dropdownContainer);

        const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
        const thisTypeIndex = shortcutOrder.indexOf(options.type);

        if (thisTypeIndex === -1) {
            this.shortcutsContainer.appendChild(shortcutContainer);
        } else {
            let inserted = false;
            const existingShortcuts = this.shortcutsContainer.querySelectorAll('.shortcut-item');

            for (let i = 0; i < existingShortcuts.length; i++) {
                const existingType = existingShortcuts[i].dataset.shortcutType;
                const existingIndex = shortcutOrder.indexOf(existingType);

                if (existingIndex > thisTypeIndex) {
                    this.shortcutsContainer.insertBefore(shortcutContainer, existingShortcuts[i]);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                this.shortcutsContainer.appendChild(shortcutContainer);
            }
        }

        this.shortcuts[options.type] = {
            element: shortcutContainer,
            dropdown: dropdown,
            toggleButton: toggleButton,
            options: options
        };

        return shortcutContainer;
    }
}

// File: lib/ui/components/SelectionDisplay.js
window.SelectionDisplay = class SelectionDisplay {
    
    constructor(options = {}) {
        this.selectedIssues = options.selectedIssues || [];
        this.onRemoveIssue = options.onRemoveIssue || null;
        this.container = null;
        this.issuesList = null;
    }

    
    createSelectionContainer(container) {
        this.container = container;
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
        const selectedIssuesList = document.createElement('div');
        selectedIssuesList.id = 'selected-issues-list';
        selectedIssuesList.style.fontSize = '14px';
        this.issuesList = selectedIssuesList;
        this.displayNoIssuesMessage();

        selectedIssuesContainer.appendChild(selectedIssuesList);
        container.appendChild(selectedIssuesContainer);
        this.updateDisplay();
    }

    
    displayNoIssuesMessage() {
        if (!this.issuesList) return;
        const existingMessage = this.issuesList.querySelector('#no-issues-selected');
        if (existingMessage) return;

        const noIssuesSelected = document.createElement('div');
        noIssuesSelected.id = 'no-issues-selected';
        noIssuesSelected.textContent = 'No issues selected';
        noIssuesSelected.style.color = '#666';
        noIssuesSelected.style.fontStyle = 'italic';
        this.issuesList.appendChild(noIssuesSelected);
    }

    
    updateDisplay() {
        if (!this.issuesList) {
            console.error('Issues list not initialized');
            return;
        }
        this.issuesList.innerHTML = '';
        if (!this.selectedIssues || this.selectedIssues.length === 0) {
            this.displayNoIssuesMessage();
            const container = this.issuesList.parentElement;
            if (container) {
                container.style.borderColor = '#ccc';
                container.style.backgroundColor = '#f9f9f9';
            }

            return;
        }
        const container = this.issuesList.parentElement;
        if (container) {
            container.style.borderColor = '#1f75cb';
            container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
        }
        this.selectedIssues.forEach((issue, index) => {
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
            const issueId = issue.iid || 'Unknown';
            const issueTitle = issue.title || 'Untitled Issue';
            issueInfo.innerHTML = `<strong>#${issueId}</strong> - ${issueTitle}`;
            issueInfo.style.overflow = 'hidden';
            issueInfo.style.textOverflow = 'ellipsis';
            issueInfo.style.whiteSpace = 'nowrap';
            issueInfo.style.marginRight = '5px';
            issueItem.appendChild(issueInfo);

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

            // Use more reliable approach to capture the current index
            removeBtn.setAttribute('data-index', index);

            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.color = '#c82333';
            });

            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.color = '#dc3545';
            });

            // Use a properly scoped click handler
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const clickedIndex = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                if (!isNaN(clickedIndex)) {
                    this.removeIssue(clickedIndex);
                }
            });

            issueItem.appendChild(removeBtn);
            this.issuesList.appendChild(issueItem);
        });
    }

    
    removeIssue(index) {
        if (this.selectedIssues.length > index) {
            const removedIssue = this.selectedIssues[index];
            this.selectedIssues.splice(index, 1);

            // Update selection in issue selector
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.issueSelector) {
                window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }

            // Update the display
            this.updateDisplay();

            // Update status if needed
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
        }
    }
    
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            const removedIssue = this.selectedIssues[index];
            this.selectedIssues.splice(index, 1);
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.issueSelector) {
                window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }
        }
        // Remove status message update since we removed the status element
    }


    
    setSelectedIssues(issues) {
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        this.updateDisplay();
    }
}

// File: lib/ui/components/IssueSelector.js
window.IssueSelector = class IssueSelector {
    
    constructor(options = {}) {
        this.uiManager = options.uiManager;
        this.onSelectionChange = options.onSelectionChange || null;
        this.onSelectionComplete = options.onSelectionComplete || null;

        this.isSelectingIssue = false;
        this.selectionOverlays = [];
        this.selectedOverlays = []; // Track which overlays are selected
        this.selectedIssues = options.initialSelection || []; // Store multiple selected issues
        this.pageOverlay = null; // Track the page overlay separately
        this.selectionCounter = null; // Track the selection counter element
        this.helpText = null; // Track the help text element

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isSelectingIssue) {
                this.exitSelectionMode();
            }
        });
    }

    startSelection() {
        if (this.isSelectingIssue) {
            return;
        }

        this.isSelectingIssue = true;
        const currentSelection = [...this.selectedIssues];

        // First, modify the CSS overflow properties to create stable containers
        this.applyOverflowFixes();

        // Create card overlays
        this.createCardOverlays(currentSelection);

        // Create fixed UI elements
        this.createFixedControls();

        // Update the select button state
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'true';
            selectButton.style.backgroundColor = '#28a745'; // Green when active
            selectButton.textContent = '✓ Done';
        }

        // Add event listeners
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);

        // Setup MutationObserver to watch for GitLab updates and reapply fixes
        this.setupMutationObserver();
    }
    applyOverflowFixes() {
        // Store original styles so we can restore them later
        this.originalStyles = [];

        // Fix the UL elements - make them not handle overflow-x
        const ulElements = document.querySelectorAll('ul.board-list');
        ulElements.forEach(ul => {
            this.originalStyles = [{
                element: ul,
                property: 'overflow-x',
                value: ul.style.overflowX
            }];
            ul.style.setProperty('overflow-x', 'unset', 'important');
            ul.style.setProperty('overflow-y', 'unset', 'important');
        });

        // Fix the card areas - make them handle scrolling
        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        cardAreas.forEach(area => {
            this.originalStyles.push({
                element: area,
                property: 'overflow',
                value: area.style.overflow
            });
            this.originalStyles.push({
                element: area,
                property: 'position',
                value: area.style.position
            });

            area.style.overflow = 'auto';
            area.style.position = 'relative'; // Ensure position context for the overlays
        });

        return cardAreas; // Return the card areas for overlay placement
    }
    
    createCardOverlays(currentSelection = []) {
        // First clear any existing overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });

        // Reset tracking arrays
        this.selectionOverlays = [];
        this.selectedIssues = currentSelection || [];
        this.selectedOverlays = [];

        // Find all card areas with our modified overflow
        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        console.log(`Found ${cardAreas.length} card areas`);

        cardAreas.forEach(cardArea => {
            try {
                // Get all cards in this area
                const cards = cardArea.querySelectorAll('.board-card');
                console.log(`Found ${cards.length} cards in card area`);

                // Process each card
                cards.forEach((card, index) => {
                    try {
                        const issueItem = this.getIssueItemFromCard(card);
                        if (!issueItem) return;

                        // Create overlay for this card
                        const overlay = document.createElement('div');
                        overlay.className = 'card-selection-overlay';
                        overlay.style.position = 'absolute';
                        overlay.style.zIndex = '99';
                        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                        overlay.style.border = '2px solid rgba(31, 117, 203, 0.6)';
                        overlay.style.borderRadius = '4px';
                        overlay.style.cursor = 'pointer';
                        overlay.style.transition = 'background-color 0.2s ease';
                        overlay.style.boxSizing = 'border-box';
                        overlay.dataset.cardId = card.id || `card-${Date.now()}-${index}`;
                        overlay.dataset.selected = 'false';
                        overlay.originalCard = card;
                        overlay.dataset.issueId = `${issueItem.iid}-${issueItem.referencePath}`;

                        // Position the overlay directly over the card
                        this.positionOverlay(overlay, card, cardArea);

                        // Check if this issue is already in the current selection
                        if (currentSelection.some(issue =>
                            issue.iid === issueItem.iid &&
                            issue.referencePath === issueItem.referencePath)) {

                            overlay.dataset.selected = 'true';
                            overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                            overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                            overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';

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
                            this.selectedOverlays.push(overlay);
                        }

                        // Add event listeners
                        overlay.addEventListener('mouseenter', function () {
                            if (this.dataset.selected !== 'true') {
                                this.style.backgroundColor = 'rgba(31, 117, 203, 0.3)';
                                this.style.boxShadow = '0 0 8px rgba(31, 117, 203, 0.5)';
                            }
                        });

                        overlay.addEventListener('mouseleave', function () {
                            if (this.dataset.selected !== 'true') {
                                this.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                                this.style.boxShadow = 'none';
                            }
                        });

                        overlay.addEventListener('click', (e) => {
                            e.stopPropagation();
                            this.toggleCardSelection(card, overlay);
                        });

                        // Append overlay directly to the cardArea
                        cardArea.appendChild(overlay);
                        this.selectionOverlays.push(overlay);
                    } catch (error) {
                        console.error('Error creating overlay for card:', error);
                    }
                });
            } catch (error) {
                console.error('Error processing card area:', error);
            }
        });
    }

    
    updateSelectionCounter() {
        if (this.selectionCounter) {
            const count = this.selectedIssues.length;
            this.selectionCounter.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;
            if (count > 0) {
                this.selectionCounter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
            } else {
                this.selectionCounter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
            }
        }
        if (typeof this.onSelectionChange === 'function') {
            this.onSelectionChange(this.selectedIssues);
        }
        this.syncSelectionWithBulkCommentsView();
    }

    
    getIssueItemFromCard(boardCard) {
        try {
            if (boardCard.__vue__) {
                if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
                    const issueComponent = boardCard.__vue__.$children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }
                if (boardCard.__vue__.$options &&
                    boardCard.__vue__.$options.children &&
                    boardCard.__vue__.$options.children.length > 0) {
                    const issueComponent = boardCard.__vue__.$options.children.find(child =>
                        child.$props && child.$props.item);

                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }
                if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
                    return boardCard.__vue__.$props.item;
                }
            }
            const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
            const titleElement = boardCard.querySelector('.board-card-title');

            if (issueId && titleElement) {
                return {
                    iid: issueId,
                    title: titleElement.textContent.trim(),
                    referencePath: window.location.pathname.split('/boards')[0],
                };
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }

        return null;
    }

    
    renumberBadges() {
        this.selectedOverlays.forEach((overlay, index) => {
            const badge = overlay.querySelector('.selection-badge');
            if (badge) {
                badge.textContent = index + 1;
            }
        });
    }

    
    exitSelectionMode() {
        if (!this.isSelectingIssue) return;

        this.isSelectingIssue = false;

        // Clear any pending timeouts
        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }

        if (this.overflowFixTimeout) {
            clearTimeout(this.overflowFixTimeout);
            this.overflowFixTimeout = null;
        }

        // Disconnect the mutation observer
        if (this.boardObserver) {
            this.boardObserver.disconnect();
            this.boardObserver = null;
        }

        // Clean up the overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });


        // Remove the selection counter and help text
        if (this.selectionCounter && this.selectionCounter.parentNode) {
            this.selectionCounter.parentNode.removeChild(this.selectionCounter);
            this.selectionCounter = null;
        }

        if (this.helpText && this.helpText.parentNode) {
            this.helpText.parentNode.removeChild(this.helpText);
            this.helpText = null;
        }

        this.selectionOverlays = [];
        this.selectedOverlays = [];

        // Update the select button state
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'false';
            selectButton.style.backgroundColor = '#6c757d'; // Gray when inactive
            selectButton.textContent = '📎 Select Issues';
        }

        this.syncSelectionWithBulkCommentsView();

        if (typeof this.onSelectionComplete === 'function') {
            this.onSelectionComplete(this.selectedIssues);
        }

        // Remove global event listeners
        window.removeEventListener('scroll', this.handleScroll);
        window.removeEventListener('resize', this.handleResize);
    }


    toggleCardSelection(card, overlay) {
        if (!this.isSelectingIssue) return;
        const issueItem = this.getIssueItemFromCard(card);

        if (issueItem) {
            const isSelected = overlay.dataset.selected === 'true';

            if (isSelected) {
                overlay.dataset.selected = 'false';
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                overlay.style.boxShadow = 'none';
                this.selectedIssues = this.selectedIssues.filter(issue =>
                    !(issue.iid === issueItem.iid &&
                        issue.referencePath === issueItem.referencePath)
                );
                this.selectedOverlays = this.selectedOverlays.filter(o => o !== overlay);
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                this.renumberBadges();
            } else {
                overlay.dataset.selected = 'true';
                overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
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
                overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                overlay.appendChild(badge);
                this.selectedIssues.push(issueItem);
                this.selectedOverlays.push(overlay);
            }
            this.updateSelectionCounter();
            this.syncSelectionWithBulkCommentsView();
        } else {
            console.error('Failed to get issue item from card');
            overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
            overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';

            setTimeout(() => {
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
            }, 500);
            const statusMsg = document.getElementById('comment-status');
            if (statusMsg) {
                statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
                statusMsg.style.color = '#dc3545';
            }
        }
    }

    
    syncSelectionWithBulkCommentsView() {
        try {
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

    
    repositionOverlays() {
        if (!this.isSelectingIssue) return;

        // Update the position of the help text
        if (this.helpText) {
            this.helpText.style.top = '10px';
            this.helpText.style.left = '50%';
        }

        // Update the position of the selection counter
        if (this.selectionCounter) {
            this.selectionCounter.style.top = '50px';
            this.selectionCounter.style.left = '50%';
        }

        // Update positions of card overlays
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.className === 'card-selection-overlay' && overlay.originalCard) {
                const card = overlay.originalCard;
                const container = overlay.parentNode;

                if (card && container) {
                    this.positionOverlay(overlay, card, container);
                }
            }
        });
    }

    
    setSelectedIssues(issues) {
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        if (this.isSelectingIssue && this.selectionOverlays.length > 0) {
            this.updateOverlaysFromSelection();
        }
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
        this.syncSelectionWithBulkCommentsView();
    }

    positionOverlay(overlay, card, cardArea) {
        try {
            // Get card position relative to the card area
            const cardRect = card.getBoundingClientRect();
            const areaRect = cardArea.getBoundingClientRect();

            const top = cardRect.top - areaRect.top + cardArea.scrollTop;
            const left = cardRect.left - areaRect.left + cardArea.scrollLeft;

            overlay.style.top = `${top}px`;
            overlay.style.left = `${left}px`;
            overlay.style.width = `${cardRect.width}px`;
            overlay.style.height = `${cardRect.height}px`;
        } catch (e) {
            console.error('Error positioning overlay:', e);
        }
    }

    updateOverlaysFromSelection() {
        if (!this.isSelectingIssue) return;

        try {
            const cardOverlays = this.selectionOverlays.filter(o => o.className === 'card-selection-overlay');

            cardOverlays.forEach(overlay => {
                if (overlay.dataset && overlay.originalCard) {
                    overlay.dataset.selected = 'false';
                    overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                    overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
                    overlay.style.boxShadow = 'none';
                    overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
                }
            });
            this.selectedOverlays = [];
            this.selectedIssues.forEach((issue, index) => {
                if (!issue) return;
                const matchingOverlay = cardOverlays.find(overlay => {
                    if (!overlay.dataset || !overlay.dataset.issueId) return false;
                    return overlay.dataset.issueId === `${issue.iid}-${issue.referencePath}`;
                });

                if (matchingOverlay) {
                    matchingOverlay.dataset.selected = 'true';
                    matchingOverlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
                    matchingOverlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
                    matchingOverlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
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
                    this.selectedOverlays.push(matchingOverlay);
                }
            });
            this.updateSelectionCounter();
        } catch (error) {
            console.error('Error updating overlays from selection:', error);
        }
    }

    createFixedControls() {
        // Create help text at the top
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on issues to select/deselect them • Press ESC or click button when finished';
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
        this.helpText = helpText;
        document.body.appendChild(helpText);
        this.selectionOverlays.push(helpText);

        // Create selection counter below the help text
        const selectionCounter = document.createElement('div');
        selectionCounter.id = 'selection-counter';
        selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
        selectionCounter.style.position = 'fixed';
        selectionCounter.style.top = '50px'; // Position below help text
        selectionCounter.style.left = '50%';
        selectionCounter.style.transform = 'translateX(-50%)';
        selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ?
            'rgba(40, 167, 69, 0.9)' : 'rgba(0, 0, 0, 0.8)';
        selectionCounter.style.color = 'white';
        selectionCounter.style.padding = '8px 16px';
        selectionCounter.style.borderRadius = '20px';
        selectionCounter.style.fontSize = '14px';
        selectionCounter.style.zIndex = '999';
        selectionCounter.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
        this.selectionCounter = selectionCounter;
        document.body.appendChild(selectionCounter);
        this.selectionOverlays.push(selectionCounter);
    }

    
    handleScroll = () => {
        this.repositionOverlays();
    }

    
    handleResize = () => {
        this.repositionOverlays();
    }
    setupMutationObserver() {
        // Clear any existing observer
        if (this.boardObserver) {
            this.boardObserver.disconnect();
        }

        // Create a MutationObserver to watch for GitLab's reactive DOM updates
        this.boardObserver = new MutationObserver((mutations) => {
            if (!this.isSelectingIssue) return;

            let needsUpdate = false;
            let overflowReset = false;

            // Check for changes that would affect our card selection
            mutations.forEach(mutation => {
                // Check for structural changes (cards added/removed)
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const hasCardChanges = Array.from(mutation.addedNodes).some(node =>
                        node.classList && node.classList.contains('board-card'));

                    if (hasCardChanges) {
                        needsUpdate = true;
                    }
                }

                // Check if our CSS changes were reverted
                if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
                    const target = mutation.target;

                    // Check if it's a card area or a ul with our overflow fixes
                    if (target.matches('[data-testid="board-list-cards-area"]') ||
                        target.matches('.board-list ul')) {
                        const style = window.getComputedStyle(target);

                        // If we find a container that should have our overrides but doesn't
                        if (target.matches('[data-testid="board-list-cards-area"]') &&
                            style.overflow !== 'auto') {
                            overflowReset = true;
                        }
                        if (target.matches('.board-list ul') &&
                            style.overflowX !== 'unset') {
                            overflowReset = true;
                        }
                    }
                }
            });

            // If our overflow settings were reset, reapply them
            if (overflowReset) {
                console.log('Overflow settings changed, reapplying fixes');
                clearTimeout(this.overflowFixTimeout);
                this.overflowFixTimeout = setTimeout(() => {
                    this.applyOverflowFixes();
                }, 50);
            }

            // If cards changed, update the overlays
            if (needsUpdate) {
                console.log('Cards changed, updating overlays');
                clearTimeout(this.updateTimeout);
                this.updateTimeout = setTimeout(() => {
                    this.createCardOverlays(this.selectedIssues);
                }, 100);
            }
        });

        // Observe the entire board area
        const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
        boardContainers.forEach(container => {
            this.boardObserver.observe(container, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['style', 'class']
            });
        });
    }
}

// File: lib/ui/managers/TabManager.js
window.TabManager = class TabManager {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.tabContainer = null;
        this.tabs = {};
        this.contentAreas = {};
        try {
            let lastTab = getLastActiveTab() || 'summary';
            // If last tab was history, default to summary
            if (lastTab === 'history') {
                lastTab = 'summary';
            }
            this.currentTab = lastTab;
        } catch (e) {
            console.warn('Error loading last active tab:', e);
            this.currentTab = 'summary';
        }
    }

    
    initialize(parentElement) {
        this.tabContainer = document.createElement('div');
        this.tabContainer.style.display = 'flex';
        this.tabContainer.style.marginBottom = '10px';
        this.tabContainer.style.borderBottom = '1px solid #ddd';
        this.createTab('summary', 'Summary', this.currentTab === 'summary');
        this.createTab('boards', 'Boards', this.currentTab === 'boards');
        this.createTab('bulkcomments', 'Issues', this.currentTab === 'bulkcomments');
        this.createTab('sprintmanagement', 'Sprint', this.currentTab === 'sprintmanagement');
        this.createTab('stats', 'Stats', this.currentTab === 'stats'); // Add Stats tab
        parentElement.appendChild(this.tabContainer);
        this.createContentAreas(parentElement);
    }
    
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

    createContentAreas(parentElement) {
        const summaryContent = document.createElement('div');
        summaryContent.id = 'assignee-time-summary-content';
        summaryContent.style.display = this.currentTab === 'summary' ? 'block' : 'none';
        summaryContent.style.position = 'relative'; // Explicitly set position relative
        summaryContent.style.height = '530px';
        summaryContent.style.overflowY = 'auto';
        summaryContent.style.maxHeight = '60vh';
        parentElement.appendChild(summaryContent);
        this.contentAreas['summary'] = summaryContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(summaryContent, 'summary-tab', 'Loading summary data...');
        }

        const boardsContent = document.createElement('div');
        boardsContent.id = 'boards-time-summary-content';
        boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
        boardsContent.style.position = 'relative'; // Explicitly set position relative
        boardsContent.style.height = '530px';
        boardsContent.style.overflowY = 'auto';
        boardsContent.style.maxHeight = '60vh';
        parentElement.appendChild(boardsContent);
        this.contentAreas['boards'] = boardsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(boardsContent, 'boards-tab', 'Loading board data...');
        }

        const bulkCommentsContent = document.createElement('div');
        bulkCommentsContent.id = 'bulk-comments-content';
        bulkCommentsContent.style.display = this.currentTab === 'bulkcomments' ? 'block' : 'none';
        bulkCommentsContent.style.position = 'relative'; // Explicitly set position relative
        bulkCommentsContent.style.height = '530px';
        bulkCommentsContent.style.overflowY = 'auto';
        bulkCommentsContent.style.maxHeight = '60vh';
        parentElement.appendChild(bulkCommentsContent);
        this.contentAreas['bulkcomments'] = bulkCommentsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
        }

        // Add the Sprint Management content area
        const sprintManagementContent = document.createElement('div');
        sprintManagementContent.id = 'sprint-management-content';
        sprintManagementContent.style.display = this.currentTab === 'sprintmanagement' ? 'block' : 'none';
        sprintManagementContent.style.position = 'relative';
        sprintManagementContent.style.height = '530px';
        sprintManagementContent.style.overflowY = 'auto';
        sprintManagementContent.style.maxHeight = '60vh';
        parentElement.appendChild(sprintManagementContent);
        this.contentAreas['sprintmanagement'] = sprintManagementContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(sprintManagementContent, 'sprintmanagement-tab', 'Loading sprint management tools...');
        }

        // Add the Stats content area
        const statsContent = document.createElement('div');
        statsContent.id = 'stats-content';
        statsContent.style.display = this.currentTab === 'stats' ? 'block' : 'none';
        statsContent.style.position = 'relative';
        statsContent.style.height = '530px';
        statsContent.style.overflowY = 'auto';
        statsContent.style.maxHeight = '60vh';
        parentElement.appendChild(statsContent);
        this.contentAreas['stats'] = statsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(statsContent, 'stats-tab', 'Loading statistics...');
        }
    }

    
    // lib/ui/managers/TabManager.js - switchToTab function

    switchToTab(tabId) {
        Object.keys(this.tabs).forEach(id => {
            this.tabs[id].style.borderBottom = 'none';
            this.tabs[id].style.fontWeight = 'normal';
            this.contentAreas[id].style.display = 'none';
        });
        this.tabs[tabId].style.borderBottom = '2px solid #1f75cb';
        this.tabs[tabId].style.fontWeight = 'bold';
        this.contentAreas[tabId].style.display = 'block';
        this.currentTab = tabId;
        try {
            saveLastActiveTab(tabId);
        } catch(e) {
            console.warn('Error saving tab selection:', e);
        }
        if (tabId === 'bulkcomments' && this.uiManager.bulkCommentsView) {
            this.uiManager.bulkCommentsView.render();
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
        }
        if (tabId === 'sprintmanagement' && this.uiManager.sprintManagementView) {
            this.uiManager.sprintManagementView.render();
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('sprintmanagement-tab');
            }
        }
        if (tabId === 'stats' && this.uiManager.statsView) {
            this.uiManager.statsView.render();
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('stats-tab');
            }
        }

        uiManager.issueSelector.applyOverflowFixes()
    }
}

// File: lib/ui/managers/CommandManager.js
window.CommandManager = class CommandManager {
    
    constructor(options = {}) {
        this.targetElement = options.targetElement;
        this.gitlabApi = options.gitlabApi;
        this.labelManager = options.labelManager;
        this.onCommandInsert = options.onCommandInsert || null;
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        this.assigneeWhitelist = getAssigneeWhitelist();
        this.shortcutContainer = null;
        this.commandShortcut = null;
    }

    
    initialize(container) {
        this.shortcutContainer = container;
        this.commandShortcut = new CommandShortcut({
            targetElement: this.targetElement,
            onShortcutInsert: (type, value) => {
                if (typeof this.onCommandInsert === 'function') {
                    this.onCommandInsert(type, value);
                }
            }
        });
        this.commandShortcut.initialize(container);
        this.addCustomShortcuts();
    }

    
    addCustomShortcuts() {
        if (!this.commandShortcut) return;
        this.addMilestoneShortcut();
        this.addAssignShortcut();
        this.addDueDateShortcut();
        this.addWeightShortcut();
    }

    
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
                if (!this.targetElement) return;
                let milestoneText = '/milestone ';
                if (value === 'none') {
                    milestoneText += '%""';
                } else if (value.startsWith('%')) {
                    milestoneText += value;
                } else {
                    milestoneText += `%"${value}"`;
                }
                const milestoneRegex = /\/milestone\s+%[^\n]+/g;

                this.replaceOrInsertCommand(
                    'milestone',
                    milestoneText,
                    milestoneRegex,
                    () => this.insertTextAtCursor(milestoneText)
                );
                this.notification.info(`Milestone command added: ${value}`);
            }
        });
    }

    
    
    addAssignShortcut() {
        if (!this.commandShortcuts) return;

        try {
            let assignItems = [
                { value: '', label: 'Assign to...' },
                { value: '@me', label: 'Myself' },
                { value: 'none', label: 'Unassign' }
            ];
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    const whitelistedAssignees = this.assigneeManager.getAssigneeWhitelist();
                    
                    if (Array.isArray(whitelistedAssignees) && whitelistedAssignees.length > 0) {
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
                        const whitelistItems = whitelistedAssignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                } catch (e) {
                    console.error('Error getting assignee whitelist from manager:', e);
                    try {
                        const assignees = getAssigneeWhitelist();
                        
                        if (Array.isArray(assignees) && assignees.length > 0) {
                            assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
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
                try {
                    let assignees = [];
                    if (typeof getAssigneeWhitelist === 'function') {
                        assignees = getAssigneeWhitelist();
                    } else if (window.getAssigneeWhitelist) {
                        assignees = window.getAssigneeWhitelist();
                    } else {
                        console.warn('getAssigneeWhitelist function not available, no assignees will be loaded');
                    }

                    
                    if (Array.isArray(assignees) && assignees.length > 0) {
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
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
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        assignItems.push({ value: 'separator2', label: '────── Group Members ──────' });
                        const memberItems = members.map(member => ({
                            value: member.username,
                            label: member.name || member.username
                        }));

                        assignItems = assignItems.concat(memberItems);
                        this.updateAssignShortcut(assignItems);
                    }
                })
                .catch(error => {
                    console.error('Error fetching group members:', error);
                });
            assignItems.push({ value: 'custom', label: 'Custom...' });
            assignItems.push({ value: 'manage', label: '✏️ Manage Assignees...' });
            this.updateAssignShortcut(assignItems);
        } catch (e) {
            console.error('Error adding assign shortcut:', e);
        }
    }

    
    addDueDateShortcut() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
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
                if (value === 'custom') {
                    const customDate = prompt('Enter due date (YYYY-MM-DD):', formatDate(today));

                    if (!customDate) return;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
                        this.notification.error('Invalid date format. Please use YYYY-MM-DD');
                        return;
                    }

                    value = customDate;
                }
                let dueText = '/due ';

                if (value === 'none') {
                    dueText += 'none';
                } else {
                    dueText += value;
                }
                const dueRegex = /\/due\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'due',
                    dueText,
                    dueRegex,
                    () => this.insertTextAtCursor(dueText)
                );
                if (value === 'none') {
                    this.notification.info('Due date will be removed');
                } else {
                    this.notification.info(`Due date set to ${value}`);
                }
            }
        });
    }

    
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
                if (value === 'custom') {
                    const customWeight = prompt('Enter weight (number):', '');

                    if (!customWeight) return;
                    const weight = parseInt(customWeight, 10);
                    if (isNaN(weight) || weight < 0) {
                        this.notification.error('Invalid weight. Please enter a positive number');
                        return;
                    }

                    value = customWeight;
                }
                let weightText = '/weight ';

                if (value === 'none') {
                    weightText += 'none';
                } else {
                    weightText += value;
                }
                const weightRegex = /\/weight\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'weight',
                    weightText,
                    weightRegex,
                    () => this.insertTextAtCursor(weightText)
                );
                if (value === 'none') {
                    this.notification.info('Weight will be removed');
                } else {
                    this.notification.info(`Weight set to ${value}`);
                }
            }
        });
    }

    
    openAssigneeManager() {
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'assignee-manager-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '110';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '500px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
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
        const assigneeSection = document.createElement('div');
        const description = document.createElement('p');
        description.textContent = 'Add usernames to quickly assign issues. These will appear in your /assign dropdown.';
        description.style.marginBottom = '15px';
        const assigneeList = document.createElement('div');
        assigneeList.style.marginBottom = '15px';
        assigneeList.style.maxHeight = '200px';
        assigneeList.style.overflowY = 'auto';
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.padding = '10px 0';
            return emptyMessage;
        };
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
                if (this.assigneeWhitelist.length === 0) {
                    assigneeList.appendChild(createEmptyMessage());
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);
        });
        if (this.assigneeWhitelist.length === 0) {
            assigneeList.appendChild(createEmptyMessage());
        }
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
            const newAssignee = {
                name: name || username, // Use name if provided, otherwise use username
                username: username
            };
            const existingIndex = this.assigneeWhitelist.findIndex(a => a.username === username);
            if (existingIndex >= 0) {
                this.assigneeWhitelist[existingIndex] = newAssignee;
            } else {
                this.assigneeWhitelist.push(newAssignee);
            }
            saveAssigneeWhitelist(this.assigneeWhitelist);
            const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }
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
                    if (this.assigneeWhitelist.length === 0) {
                        assigneeList.appendChild(createEmptyMessage());
                    }
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);
            nameInput.value = '';
            usernameInput.value = '';
            this.notification.success(`Added assignee: ${newAssignee.name}`);
        };

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(addButton);
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
            modalOverlay.remove();
            this.addAssignShortcut();
        };
        assigneeSection.appendChild(description);
        assigneeSection.appendChild(assigneeList);
        assigneeSection.appendChild(addForm);
        assigneeSection.appendChild(saveButton);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(assigneeSection);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
                this.addAssignShortcut();
            }
        });
    }

    
    insertTextAtCursor(text) {
        if (!this.targetElement) return;

        const startPos = this.targetElement.selectionStart;
        const endPos = this.targetElement.selectionEnd;
        const currentText = this.targetElement.value;
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }
        this.targetElement.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);
        const newCursorPos = startPos + insertText.length;
        this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
        this.targetElement.focus();
    }

    
    replaceOrInsertCommand(type, command, regex, insertFn) {
        if (!this.targetElement) return;
        const currentText = this.targetElement.value;
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            const newText = currentText.replace(regex, command);
            this.targetElement.value = newText;
            this.targetElement.focus();
        } else {
            insertFn();
        }
        if (typeof this.onCommandInsert === 'function') {
            this.onCommandInsert(type, command);
        }
    }
}

// File: lib/ui/managers/LabelManager.js
window.LabelManager = class LabelManager {
    
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.onLabelsLoaded = options.onLabelsLoaded || null;
        this.labelWhitelist = [];
        try {
            this.labelWhitelist = getLabelWhitelist();
            if (!Array.isArray(this.labelWhitelist)) {
                console.warn("Loaded whitelist is not an array, using default");
                this.labelWhitelist = this.getDefaultWhitelist();
            }
        } catch (e) {
            console.warn("Error loading label whitelist, using default", e);
            this.labelWhitelist = this.getDefaultWhitelist();
        }
        this.availableLabels = [];
        this.filteredLabels = [];
        this.isLoading = false;
    }

    
    getDefaultWhitelist() {
        return [
            'bug', 'feature', 'documentation', 'enhancement', 'security',
            'priority', 'high', 'medium', 'low', 'critical',
            'frontend', 'backend', 'ui', 'ux', 'api',
            'wontfix', 'duplicate', 'invalid', 'question',
            'ready', 'in progress', 'review', 'blocked'
        ];
    }

    
    saveWhitelist(whitelist) {
        if (!Array.isArray(whitelist)) {
            whitelist = [];
        }
        this.labelWhitelist = whitelist;

        try {
            saveLabelWhitelist(whitelist);
        } catch (e) {
            console.error("Error saving label whitelist", e);
        }
        this.filterLabels();
    }

    
    resetToDefaultWhitelist() {
        try {
            this.labelWhitelist = this.getDefaultWhitelist();
            saveLabelWhitelist(this.labelWhitelist);
        } catch (e) {
            console.error("Error resetting label whitelist", e);
        }
        this.filterLabels();

        return this.labelWhitelist;
    }

    
    isLabelInWhitelist(labelName, whitelist = null) {
        const whitelistToUse = whitelist || this.labelWhitelist;
        if (!Array.isArray(whitelistToUse) || typeof labelName !== 'string') {
            return false;
        }

        const lowerName = labelName.toLowerCase();
        return whitelistToUse.some(term => {
            if (typeof term !== 'string') return false;
            return lowerName.includes(term.toLowerCase());
        });
    }


    
    filterLabels() {
        if (!this.availableLabels || this.availableLabels.length === 0) {
            this.filteredLabels = [];
            return;
        }
        this.filteredLabels = this.availableLabels.filter(label => {
            if (!label || typeof label.name !== 'string') return false;
            return this.isLabelInWhitelist(label.name);
        });
        this.filteredLabels.sort((a, b) => a.name.localeCompare(b.name));
        if (typeof this.onLabelsLoaded === 'function') {
            this.onLabelsLoaded(this.filteredLabels);
        }
    }

    
    async fetchAllLabels() {
        try {
            this.isLoading = true;
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                console.warn('GitLab API instance not available, using fallback labels');
                this.isLoading = false;
                return this.addFallbackLabels();
            }
            const pathInfo = getPathFromUrl();

            if (!pathInfo || !pathInfo.apiUrl) {
                console.warn('Path info not found or invalid, returning fallback labels');
                this.isLoading = false;
                return this.addFallbackLabels();
            }
            try {
                // Use the cached version for labels
                const labels = await this.gitlabApi.callGitLabApiWithCache(pathInfo.apiUrl, {
                    params: { per_page: 100 }
                });

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

    
    addFallbackLabels() {
        const fallbackLabels = [
            { name: 'bug', color: '#ff0000' },
            { name: 'feature', color: '#1f75cb' },
            { name: 'enhancement', color: '#7057ff' },
            { name: 'documentation', color: '#0075ca' },
            { name: 'priority', color: '#d73a4a' },
            { name: 'blocked', color: '#b60205' }
        ];
        this.availableLabels = fallbackLabels;
        this.filterLabels();
        if (typeof this.onLabelsLoaded === 'function') {
            this.onLabelsLoaded(this.filteredLabels);
        }

        return this.filteredLabels;
    }

    
    getLabelOptions(includeEmpty = true) {
        if (!this.filteredLabels || this.filteredLabels.length === 0) {
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
        const labelOptions = this.filteredLabels.map(label => ({
            value: label.name,
            label: label.name,
            color: label.color
        }));
        if (includeEmpty) {
            labelOptions.unshift({ value: '', label: 'Add Label' });
        }
        labelOptions.push({ value: 'custom', label: 'Custom...' });

        return labelOptions;
    }

    
    createStyledLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.label || label.name || '';
        const labelText = label.label || label.name || 'label';
        const bgColor = label.color || generateColorFromString(labelText);
        const textColor = getContrastColor(bgColor);
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

    
    insertLabelCommand(textarea, labelName) {
        if (!textarea || typeof labelName !== 'string') return;
        const labelText = `/label ~"${labelName}"`;
        const labelRegex = /\/label\s+~[^\n]+/g;
        const currentText = textarea.value;
        const hasCommand = labelRegex.test(currentText);

        if (hasCommand) {
            textarea.value = currentText.replace(labelRegex, labelText);
        } else {
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;
            let insertText = labelText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }
            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);
            const newCursorPos = startPos + insertText.length;
            textarea.setSelectionRange(newCursorPos, newCursorPos);
        }
        textarea.focus();
    }

    
    async initLabelDropdown(createDropdown, dropdownOptions = {}) {
        const dropdown = createDropdown({
            items: [{ value: '', label: 'Loading labels...' }],
            disabled: true,
            ...dropdownOptions
        });
        try {
            await this.fetchAllLabels();
            dropdown.updateItems(this.getLabelOptions());
            dropdown.enable();
        } catch (error) {
            console.error('Error initializing label dropdown:', error);
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
window.AssigneeManager = class AssigneeManager {
    
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onAssigneesChange = options.onAssigneesChange || null;
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        this.assigneeWhitelist = getAssigneeWhitelist();
        this.currentUsers = [];
    }

    
    getAssigneeWhitelist() {
        return [...this.assigneeWhitelist];
    }

    
    saveWhitelist(whitelist) {
        this.assigneeWhitelist = whitelist;
        saveAssigneeWhitelist(whitelist);
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }
    }

    
    addAssignee(assignee) {
        if (!assignee || !assignee.username) {
            return false;
        }
        const existingIndex = this.assigneeWhitelist.findIndex(a =>
            a.username.toLowerCase() === assignee.username.toLowerCase());

        if (existingIndex >= 0) {
            this.assigneeWhitelist[existingIndex] = {
                ...this.assigneeWhitelist[existingIndex],
                ...assignee
            };
        } else {
            this.assigneeWhitelist.push(assignee);
        }
        saveAssigneeWhitelist(this.assigneeWhitelist);
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }

        return true;
    }

    
    removeAssignee(username) {
        if (!username) {
            return false;
        }

        const initialLength = this.assigneeWhitelist.length;
        this.assigneeWhitelist = this.assigneeWhitelist.filter(a =>
            a.username.toLowerCase() !== username.toLowerCase());
        if (this.assigneeWhitelist.length === initialLength) {
            return false;
        }
        saveAssigneeWhitelist(this.assigneeWhitelist);
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }

        return true;
    }

    
    async fetchCurrentUser() {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        try {
            const user = await this.gitlabApi.getCurrentUser();
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
    
    openAssigneeManager() {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '110';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
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
        const contentArea = document.createElement('div');
        const description = document.createElement('p');
        description.textContent = 'Manage assignees that appear in the assignee dropdown. These users will be available for quick assignment to issues.';
        description.style.marginBottom = '20px';
        const listSection = document.createElement('div');
        listSection.style.marginBottom = '20px';

        const listTitle = document.createElement('h4');
        listTitle.textContent = 'Current Assignees';
        listTitle.style.marginBottom = '10px';
        listTitle.style.fontSize = '16px';

        listSection.appendChild(listTitle);
        const assigneeList = document.createElement('div');
        assigneeList.style.height = '300px'; // Fixed height
        assigneeList.style.overflowY = 'auto';
        assigneeList.style.border = '1px solid #eee';
        assigneeList.style.borderRadius = '4px';
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
                const name = assignee.name || assignee.username || '';
                avatarPlaceholder.textContent = name.split(' ')
                    .map(part => part.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();
                assigneeInfo.appendChild(avatarPlaceholder);
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
                    this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);
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
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.padding = '10px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            assigneeList.appendChild(emptyMessage);
        }

        listSection.appendChild(assigneeList);
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
            const newAssignee = {
                name: name || username,
                username: username
            };

            this.addAssignee(newAssignee);
            this.notification.success(`Added assignee: ${newAssignee.name}`);
            modalOverlay.remove();
            this.openAssigneeManager();
        };
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
            fetchUserButton.disabled = true;
            fetchUserButton.textContent = 'Loading...';

            try {
                const user = await this.fetchCurrentUser();
                this.notification.success(`Added current user: ${user.name}`);
                modalOverlay.remove();
                this.openAssigneeManager();
            } catch (error) {
                this.notification.error('Failed to fetch current user');
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
        contentArea.appendChild(description);
        contentArea.appendChild(listSection);
        contentArea.appendChild(addForm);
        contentArea.appendChild(footer);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }
}

// File: lib/ui/managers/MilestoneManager.js
window.MilestoneManager = class MilestoneManager {
    
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onMilestonesLoaded = options.onMilestonesLoaded || null;
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        this.milestones = [];
        this.currentMilestone = null;
        this.isLoading = false;
    }
}

// File: lib/ui/managers/SettingsManager.js
window.SettingsManager = class SettingsManager {
    
    constructor(options = {}) {
        this.labelManager = options.labelManager;
        this.assigneeManager = options.assigneeManager;
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.uiManager = options.uiManager || window.uiManager;
        this.onSettingsChanged = options.onSettingsChanged || null;
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        this.availableAssignees = [];
        this.isLoadingAssignees = false;
    }

    
    openSettingsModal() {
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'git-helper-settings-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1000';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.cursor = 'pointer';
        this.currentModal = modalOverlay;
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '700px'; // Wider for better readability
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

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
        const contentContainer = document.createElement('div');

        // Add General Settings section first (new)
        this.createCollapsibleSection(
            contentContainer,
            'General',
            'Configure application-wide settings',
            (container) => this.createGeneralSettings(container),
            true // Start expanded
        );

        this.createCollapsibleSection(
            contentContainer,
            'Assignees',
            'Manage assignees for quick access in comments',
            (container) => this.createAssigneeSettings(container),
            false // Start collapsed
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

        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.borderTop = '1px solid #eee';
        buttonContainer.style.paddingTop = '15px';
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
        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = 'Close';
        closeModalButton.onclick = () => {
            if (this.currentModal) {
                this.currentModal.remove();
                this.currentModal = null;
            }
        };

        buttonContainer.appendChild(resetButton);
        buttonContainer.appendChild(closeModalButton);
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentContainer);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Add this event listener to close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    
    createCollapsibleSection(container, title, description, contentBuilder, startExpanded = false) {
        startExpanded = false;
        const section = document.createElement('div');
        section.className = 'gitlab-helper-settings-section'; // Renamed CSS class
        section.style.marginBottom = '15px';
        section.style.border = '1px solid #ddd';
        section.style.borderRadius = '6px';
        section.style.overflow = 'hidden';
        const header = document.createElement('div');
        header.className = 'gitlab-helper-settings-header'; // Renamed CSS class
        header.style.padding = '12px 15px';
        header.style.backgroundColor = '#f8f9fa';
        header.style.borderBottom = startExpanded ? '1px solid #ddd' : 'none';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.cursor = 'pointer';
        header.style.transition = 'background-color 0.2s ease';
        header.addEventListener('mouseenter', () => {
            header.style.backgroundColor = '#e9ecef';
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundColor = '#f8f9fa';
        });
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
        const toggle = document.createElement('span');
        toggle.textContent = startExpanded ? '▼' : '▶';
        toggle.style.fontSize = '14px';
        toggle.style.transition = 'transform 0.3s ease';

        header.appendChild(titleContainer);
        header.appendChild(toggle);
        const content = document.createElement('div');
        content.className = 'gitlab-helper-settings-content'; // Renamed CSS class
        content.style.padding = '5px';
        content.style.display = startExpanded ? 'block' : 'none';
        content.style.backgroundColor = 'white';
        let contentBuilt = false;
        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            toggle.textContent = isExpanded ? '▶' : '▼';
            header.style.borderBottom = isExpanded ? 'none' : '1px solid #ddd';
            if (!contentBuilt && !isExpanded) {
                contentBuilder(content);
                contentBuilt = true;
            }
        });
        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);

        return section;
    }

    
    createAssigneeSettings(container) {
        const assigneeSection = document.createElement('div');
        const actionsRow = document.createElement('div');
        actionsRow.style.display = 'flex';
        actionsRow.style.justifyContent = 'space-between';
        actionsRow.style.marginBottom = '15px';
        actionsRow.style.gap = '10px';
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
            tabElement.addEventListener('click', () => {
                tabs.forEach(t => {
                    t.active = false;
                    tabElements[t.id].style.borderBottom = 'none';
                    tabElements[t.id].style.fontWeight = 'normal';
                    tabElements[t.id].style.backgroundColor = '';
                    tabContents[t.id].style.display = 'none';
                });
                tab.active = true;
                tabElement.style.borderBottom = '2px solid #1f75cb';
                tabElement.style.fontWeight = 'bold';
                tabContents[tab.id].style.display = 'block';
                if (tab.id === 'whitelisted') {
                    this.refreshAssigneeList(assigneeListContainer);
                } else if (tab.id === 'available') {
                    this.fetchGitLabUsers(availableListContainer);
                }
            });

            tabElements[tab.id] = tabElement;
            tabsContainer.appendChild(tabElement);
        });

        assigneeSection.appendChild(tabsContainer);
        const whitelistedContent = document.createElement('div');
        whitelistedContent.style.display = 'block';

        const availableContent = document.createElement('div');
        availableContent.style.display = 'none';
        const assigneeListContainer = document.createElement('div');
        assigneeListContainer.style.height = '300px'; // Fixed height instead of min/max
        assigneeListContainer.style.overflowY = 'auto';
        assigneeListContainer.style.border = '1px solid #eee';
        assigneeListContainer.style.borderRadius = '4px';
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };
        let assignees = [];
        if (this.assigneeManager) {
            assignees = this.assigneeManager.getAssigneeWhitelist();
        } else {
            assignees = getAssigneeWhitelist();
        }
        if (assignees.length > 0) {
            assignees.forEach((assignee, index) => {
                assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
            });
        } else {
            assigneeListContainer.appendChild(createEmptyMessage());
        }

        whitelistedContent.appendChild(assigneeListContainer);
        // whitelistedContent.appendChild(this.createAddAssigneeForm(assigneeListContainer, createEmptyMessage));
        const availableListContainer = document.createElement('div');
        availableListContainer.className = 'available-assignees-list';
        availableListContainer.style.height = '300px'; // Fixed height instead of min/max
        availableListContainer.style.overflowY = 'auto';
        availableListContainer.style.border = '1px solid #eee';
        availableListContainer.style.borderRadius = '4px';
        const availableEmptyMessage = document.createElement('div');
        availableEmptyMessage.textContent = 'Click "Fetch GitLab Users" to load available assignees.';
        availableEmptyMessage.style.padding = '15px';
        availableEmptyMessage.style.color = '#666';
        availableEmptyMessage.style.fontStyle = 'italic';
        availableEmptyMessage.style.textAlign = 'center';

        availableListContainer.appendChild(availableEmptyMessage);
        availableContent.appendChild(availableListContainer);
        tabContents['whitelisted'] = whitelistedContent;
        tabContents['available'] = availableContent;
        assigneeSection.appendChild(whitelistedContent);
        assigneeSection.appendChild(availableContent);
        searchInput.addEventListener('input', () => {
            const searchText = searchInput.value.toLowerCase();
            const activeTab = tabs.find(t => t.active).id;
            const list = activeTab === 'whitelisted' ? assigneeListContainer : availableListContainer;
            const items = list.querySelectorAll('.assignee-item');
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
            const newAssignee = {
                name: name || username,
                username: username
            };
            if (this.assigneeManager) {
                this.assigneeManager.addAssignee(newAssignee);
            } else {
                const assignees = getAssigneeWhitelist();
                const existingIndex = assignees.findIndex(a => a.username === username);

                if (existingIndex >= 0) {
                    assignees[existingIndex] = newAssignee;
                } else {
                    assignees.push(newAssignee);
                }
                saveAssigneeWhitelist(assignees);
            }
            const emptyMessage = listContainer.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }
            const assignees = getAssigneeWhitelist();
            listContainer.appendChild(this.createAssigneeListItem(
                newAssignee,
                assignees.length - 1,
                listContainer,
                createEmptyMessage
            ));
            nameInput.value = '';
            usernameInput.value = '';
            this.notification.success(`Added assignee: ${newAssignee.name}`);
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttonContainer.appendChild(addButton);
        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(buttonContainer);

        return addForm;
    }

    async fetchGitLabUsers(container) {
        try {
            if (!this.gitlabApi) {
                this.notification.error('GitLab API not available');
                return;
            }
            this.isLoadingAssignees = true;
            container.innerHTML = '';

            const loadingMessage = document.createElement('div');
            loadingMessage.textContent = 'Loading users from GitLab...';
            loadingMessage.style.padding = '15px';
            loadingMessage.style.textAlign = 'center';
            container.appendChild(loadingMessage);

            try {
                const pathInfo = getPathFromUrl();

                if (!pathInfo) {
                    throw new Error('Could not determine project/group path');
                }
                let users = [];
                if (pathInfo.type === 'project') {
                    users = await this.gitlabApi.callGitLabApi(
                        `projects/${pathInfo.encodedPath}/members/all`,
                        {params: {per_page: 100, all_available: true}}
                    );
                } else if (pathInfo.type === 'group') {
                    users = await this.gitlabApi.callGitLabApi(
                        `groups/${pathInfo.encodedPath}/members/all`,
                        {params: {per_page: 100, all_available: true}}
                    );
                }
                this.availableAssignees = users.map(user => ({
                    id: user.id,
                    name: user.name,
                    username: user.username,
                    avatar_url: user.avatar_url
                }));
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
        } catch (error) {}
    }

    
    renderAvailableUsers(container) {
        container.innerHTML = '';
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
        this.availableAssignees.sort((a, b) => a.name.localeCompare(b.name));
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
            const userInfo = document.createElement('div');
            userInfo.style.display = 'flex';
            userInfo.style.alignItems = 'center';
            if (user.avatar_url) {
                const avatar = document.createElement('img');
                avatar.src = user.avatar_url;
                avatar.style.width = '30px';
                avatar.style.height = '30px';
                avatar.style.borderRadius = '50%';
                avatar.style.marginRight = '10px';
                userInfo.appendChild(avatar);
            } else {
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
                const name = user.name || user.username;
                const initials = name.split(' ')
                    .map(part => part.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                avatarPlaceholder.textContent = initials;
                userInfo.appendChild(avatarPlaceholder);
            }
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
                actionButton.addEventListener('click', () => {
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
                    actionButton.textContent = 'Added ✓';
                    actionButton.style.backgroundColor = '#e9ecef';
                    actionButton.style.color = '#28a745';
                    actionButton.style.cursor = 'default';
                    userItem.style.backgroundColor = 'rgba(40, 167, 69, 0.05)';
                    this.notification.success(`Added ${user.name} to assignees`);
                    if (typeof this.onSettingsChanged === 'function') {
                        this.onSettingsChanged('assignees');
                    }
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

    
    refreshWhitelistedTab() {
        const whitelistedContent = document.querySelector('div[style*="display: block"]'); // Currently visible content
        if (!whitelistedContent) return;
        const assigneeListContainer = whitelistedContent.querySelector('div[style*="overflowY: auto"]');
        if (!assigneeListContainer) return;
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };
        assigneeListContainer.innerHTML = '';
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Refreshing assignees...';
        loadingIndicator.style.padding = '15px';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.color = '#666';

        assigneeListContainer.appendChild(loadingIndicator);
        setTimeout(() => {
            let assignees = [];
            if (this.assigneeManager) {
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
            }
            assigneeListContainer.innerHTML = '';
            if (assignees.length > 0) {
                assignees.forEach((assignee, index) => {
                    assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
                });
            } else {
                assigneeListContainer.appendChild(createEmptyMessage());
            }
        }, 300); // Short delay to show loading
    }

    
    createAssigneeListItem(assignee, index, listContainer, createEmptyMessage) {
        const item = document.createElement('div');
        item.className = 'assignee-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px 15px';
        item.style.borderBottom = '1px solid #eee';
        const info = document.createElement('div');
        info.style.display = 'flex';
        info.style.alignItems = 'center';
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
        const name = assignee.name || assignee.username;
        const initials = name.split(' ')
            .map(part => part.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase();

        avatar.textContent = initials;
        info.appendChild(avatar);
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
            let assignees = [];

            if (this.assigneeManager) {
                this.assigneeManager.removeAssignee(assignee.username);
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
                const filteredAssignees = assignees.filter(a =>
                    a.username.toLowerCase() !== assignee.username.toLowerCase()
                );
                saveAssigneeWhitelist(filteredAssignees);
                assignees = filteredAssignees;
            }
            item.remove();
            if (assignees.length === 0) {
                listContainer.appendChild(createEmptyMessage());
            }
            this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttons.appendChild(removeButton);
        item.appendChild(info);
        item.appendChild(buttons);

        return item;
    }


    
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
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'whitelist-loading-message';
        loadingMessage.textContent = 'Loading all labels from GitLab...';  // Updated text
        loadingMessage.style.fontStyle = 'italic';
        loadingMessage.style.color = '#666';
        whitelistSection.appendChild(loadingMessage);
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
        const currentWhitelist = getLabelWhitelist();
        const safeWhitelist = Array.isArray(currentWhitelist) ? currentWhitelist : [];
        const fetchAndDisplayAllLabels = async () => {
            try {
                if (!this.gitlabApi) {
                    throw new Error('GitLab API not available');
                }
                const pathInfo = getPathFromUrl();

                if (!pathInfo || !pathInfo.apiUrl) {
                    throw new Error('Could not determine project/group path');
                }
                const allLabels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                    params: {per_page: 100}
                });
                displayLabels(allLabels);
            } catch (error) {
                console.error('Error fetching ALL labels:', error);
                loadingMessage.textContent = 'Error loading labels. ' + error.message;
                loadingMessage.style.color = '#dc3545';
            }
        };
        const displayLabels = (labels) => {
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
            labels.sort((a, b) => a.name.localeCompare(b.name));
            const seenLabels = new Set();

            labels.forEach(label => {
                if (seenLabels.has(label.name.toLowerCase())) return;
                seenLabels.add(label.name.toLowerCase());
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
                const isWhitelisted = safeWhitelist.some(term =>
                    label.name.toLowerCase().includes(term.toLowerCase())
                );
                checkbox.checked = isWhitelisted;
                const labelElement = this.createGitLabStyleLabel(label);
                labelElement.style.cursor = 'pointer';
                labelElement.onclick = () => {
                    checkbox.checked = !checkbox.checked;
                    this.autoSaveWhitelist(whitelistContainer); // Auto-save when toggled
                };
                checkbox.addEventListener('change', () => {
                    this.autoSaveWhitelist(whitelistContainer);
                });
                checkboxContainer.appendChild(checkbox);
                checkboxContainer.appendChild(labelElement);
                whitelistContainer.appendChild(checkboxContainer);
            });

        };
        fetchAndDisplayAllLabels();

        container.appendChild(whitelistSection);
    }

    
    refreshAssigneeList(container) {
        if (!container) return;
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Refreshing assignees...';
        loadingIndicator.style.padding = '15px';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.color = '#666';
        container.innerHTML = '';
        container.appendChild(loadingIndicator);
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };
        setTimeout(() => {
            let assignees = [];
            if (this.assigneeManager) {
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
            }
            container.innerHTML = '';
            if (assignees.length > 0) {
                assignees.forEach((assignee, index) => {
                    container.appendChild(this.createAssigneeListItem(assignee, index, container, createEmptyMessage));
                });
            } else {
                container.appendChild(createEmptyMessage());
            }
        }, 300);
    }

    
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

    
    createGitLabStyleLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.name;
        const bgColor = label.color || generateColorFromString(label.name);
        const textColor = getContrastColor(bgColor);
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

    
    
    resetLabelWhitelist() {
        resetLabelWhitelist();
        if (this.labelManager) {
            this.labelManager.resetToDefaultWhitelist();
        }
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    
    resetAllSettings() {
        // Reset label whitelist
        this.resetLabelWhitelist();

        // Reset assignee whitelist
        saveAssigneeWhitelist([]);

        // Reset toggle shortcut
        const defaultShortcut = DEFAULT_SETTINGS.toggleShortcut;
        saveToggleShortcut(defaultShortcut);

        // Update the active keyboard handler
        if (window.uiManager && typeof window.uiManager.updateKeyboardShortcut === 'function') {
            window.uiManager.updateKeyboardShortcut(defaultShortcut);
        } else if (this.uiManager && typeof this.uiManager.updateKeyboardShortcut === 'function') {
            this.uiManager.updateKeyboardShortcut(defaultShortcut);
        }

        // Notify any listeners
        if (this.onSettingsChanged) {
            this.onSettingsChanged('all');
        }
    }

    
    autoSaveWhitelist(container) {
        const newWhitelist = [];
        const addedTerms = new Set(); // Track already added terms to prevent duplicates
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
        saveLabelWhitelist(newWhitelist);
        if (this.labelManager) {
            this.labelManager.saveWhitelist(newWhitelist);
        }
        if (this.notification) {
            this.notification.success(`Label whitelist updated`);
        }
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }

    }

    
    // lib/ui/managers/SettingsManager.js - createGeneralSettings function

    createGeneralSettings(container) {
        const generalSection = document.createElement('div');

        const title = document.createElement('h4');
        title.textContent = 'General Settings';
        title.style.marginBottom = '10px';

        const description = document.createElement('p');
        description.textContent = 'Configure general behavior of the GitLab Sprint Helper.';
        description.style.marginBottom = '15px';
        description.style.fontSize = '14px';
        description.style.color = '#666';

        generalSection.appendChild(title);
        generalSection.appendChild(description);

        // Keyboard Shortcut Setting
        const shortcutSection = document.createElement('div');
        shortcutSection.style.marginBottom = '20px';
        shortcutSection.style.padding = '15px';
        shortcutSection.style.backgroundColor = '#f8f9fa';
        shortcutSection.style.borderRadius = '4px';

        const shortcutTitle = document.createElement('h5');
        shortcutTitle.textContent = 'Toggle Visibility Shortcut';
        shortcutTitle.style.marginTop = '0';
        shortcutTitle.style.marginBottom = '10px';
        shortcutTitle.style.fontSize = '16px';

        const shortcutDescription = document.createElement('p');
        shortcutDescription.textContent = 'Set a keyboard shortcut to toggle the visibility of GitLab Sprint Helper. The shortcut will only work when not typing in an input field.';
        shortcutDescription.style.marginBottom = '15px';
        shortcutDescription.style.fontSize = '14px';
        shortcutDescription.style.color = '#666';

        const shortcutInputContainer = document.createElement('div');
        shortcutInputContainer.style.display = 'flex';
        shortcutInputContainer.style.alignItems = 'center';
        shortcutInputContainer.style.gap = '10px';

        const shortcutLabel = document.createElement('label');
        shortcutLabel.textContent = 'Shortcut Key:';
        shortcutLabel.style.fontWeight = 'bold';
        shortcutLabel.style.minWidth = '100px';

        const shortcutInput = document.createElement('input');
        shortcutInput.type = 'text';
        shortcutInput.maxLength = 1;
        shortcutInput.style.padding = '8px';
        shortcutInput.style.width = '60px';
        shortcutInput.style.textAlign = 'center';
        shortcutInput.style.fontSize = '16px';
        shortcutInput.style.border = '1px solid #ccc';
        shortcutInput.style.borderRadius = '4px';

        // Get current shortcut
        const currentShortcut = getToggleShortcut();
        shortcutInput.value = currentShortcut;

        // Preview area to show current shortcut
        const shortcutPreview = document.createElement('div');
        shortcutPreview.style.marginLeft = '10px';
        shortcutPreview.style.color = '#666';
        shortcutPreview.textContent = `Current: Press '${currentShortcut}' to toggle`;

        // Handle input changes
        shortcutInput.addEventListener('input', () => {
            if (shortcutInput.value.length === 0) return;

            const newShortcut = shortcutInput.value.charAt(0).toLowerCase();
            if (newShortcut) {
                // Save the new shortcut to storage
                saveToggleShortcut(newShortcut);

                // Update the UI
                shortcutPreview.textContent = `Current: Press '${newShortcut}' to toggle`;
                this.notification.success(`Shortcut changed to '${newShortcut}'`);

                // Update the active keyboard handler
                if (window.uiManager && typeof window.uiManager.updateKeyboardShortcut === 'function') {
                    window.uiManager.updateKeyboardShortcut(newShortcut);
                } else if (this.uiManager && typeof this.uiManager.updateKeyboardShortcut === 'function') {
                    this.uiManager.updateKeyboardShortcut(newShortcut);
                }

                // Notify any listeners
                if (this.onSettingsChanged) {
                    this.onSettingsChanged('general');
                }
            }
        });

        // Force lowercase for consistency
        shortcutInput.addEventListener('keyup', () => {
            shortcutInput.value = shortcutInput.value.toLowerCase();
        });

        shortcutInputContainer.appendChild(shortcutLabel);
        shortcutInputContainer.appendChild(shortcutInput);
        shortcutInputContainer.appendChild(shortcutPreview);

        shortcutSection.appendChild(shortcutTitle);
        shortcutSection.appendChild(shortcutDescription);
        shortcutSection.appendChild(shortcutInputContainer);

        generalSection.appendChild(shortcutSection);

        // Data Reset Section
        const resetSection = document.createElement('div');
        resetSection.style.marginTop = '20px';
        resetSection.style.padding = '15px';
        resetSection.style.backgroundColor = '#fff0f0'; // Light red background
        resetSection.style.borderRadius = '4px';
        resetSection.style.border = '1px solid #ffcccc';

        const resetTitle = document.createElement('h5');
        resetTitle.textContent = 'Data Management';
        resetTitle.style.marginTop = '0';
        resetTitle.style.marginBottom = '10px';
        resetTitle.style.fontSize = '16px';
        resetTitle.style.color = '#dc3545'; // Red text

        const resetDescription = document.createElement('p');
        resetDescription.textContent = 'Reset various data stored by GitLab Sprint Helper. Warning: These actions cannot be undone!';
        resetDescription.style.marginBottom = '15px';
        resetDescription.style.fontSize = '14px';
        resetDescription.style.color = '#666';

        const resetButtonsContainer = document.createElement('div');
        resetButtonsContainer.style.display = 'flex';
        resetButtonsContainer.style.gap = '10px';
        resetButtonsContainer.style.flexWrap = 'wrap';

// Data Reset Section in SettingsManager.js (createGeneralSettings function)

// Reset All Data Button
        const resetAllButton = document.createElement('button');
        resetAllButton.textContent = 'Reset All Data';
        resetAllButton.style.backgroundColor = '#dc3545';
        resetAllButton.style.color = 'white';
        resetAllButton.style.border = 'none';
        resetAllButton.style.borderRadius = '4px';
        resetAllButton.style.padding = '8px 16px';
        resetAllButton.style.cursor = 'pointer';
        resetAllButton.style.fontWeight = 'bold';
        resetAllButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset ALL data? This will remove all settings, history, and sprint data. This action cannot be undone!')) {
                this.resetAllSettings();
                // Additionally clear history
                if (window.historyManager && typeof window.historyManager.clearAllHistory === 'function') {
                    window.historyManager.clearAllHistory();
                }
                // Clear sprint state
                localStorage.removeItem('gitLabHelperSprintState');
                // Clear sprint history
                localStorage.removeItem('gitLabHelperSprintHistory');

                this.notification.success('All data has been reset');

                // Find and close the modal if it exists
                if (this.currentModal) {
                    this.currentModal.remove();
                    this.currentModal = null;
                }
            }
        });

// Reset History Button
        const resetHistoryButton = document.createElement('button');
        resetHistoryButton.textContent = 'Reset History';
        resetHistoryButton.style.backgroundColor = '#dc3545';
        resetHistoryButton.style.color = 'white';
        resetHistoryButton.style.border = 'none';
        resetHistoryButton.style.borderRadius = '4px';
        resetHistoryButton.style.padding = '8px 16px';
        resetHistoryButton.style.cursor = 'pointer';
        resetHistoryButton.style.fontWeight = 'bold';
        resetHistoryButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset all history data? This action cannot be undone!')) {
                if (window.historyManager && typeof window.historyManager.clearAllHistory === 'function') {
                    window.historyManager.clearAllHistory();
                    this.notification.success('History data has been reset');
                } else {
                    this.notification.error('History manager not available');
                }
            }
        });

// Reset Current Sprint Button
        const resetSprintButton = document.createElement('button');
        resetSprintButton.textContent = 'Reset Current Sprint';
        resetSprintButton.style.backgroundColor = '#dc3545';
        resetSprintButton.style.color = 'white';
        resetSprintButton.style.border = 'none';
        resetSprintButton.style.borderRadius = '4px';
        resetSprintButton.style.padding = '8px 16px';
        resetSprintButton.style.cursor = 'pointer';
        resetSprintButton.style.fontWeight = 'bold';
        resetSprintButton.addEventListener('click', () => {
            if (confirm('Are you sure you want to reset the current sprint data? This action cannot be undone!')) {
                localStorage.removeItem('gitLabHelperSprintState');
                this.notification.success('Current sprint data has been reset');

                // Refresh the sprint tab if it's active
                if (window.uiManager &&
                    window.uiManager.tabManager &&
                    window.uiManager.tabManager.currentTab === 'sprintmanagement' &&
                    window.uiManager.sprintManagementView) {
                    window.uiManager.sprintManagementView.render();
                }
            }
        });

        resetButtonsContainer.appendChild(resetAllButton);
        resetButtonsContainer.appendChild(resetHistoryButton);
        resetButtonsContainer.appendChild(resetSprintButton);

        resetSection.appendChild(resetTitle);
        resetSection.appendChild(resetDescription);
        resetSection.appendChild(resetButtonsContainer);

        generalSection.appendChild(resetSection);

        container.appendChild(generalSection);
    }

}

// File: lib/ui/views/SummaryView.js
window.SummaryView = class SummaryView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.membersList = []; // Store members
        this.potentialAssignees = []; // Store potential assignees that aren't on the current board

        // Try to get members from various sources
        if (this.gitlabApi) {
            this.fetchMembers();
        }
    }

    
    addCopySummaryButton(container, assigneeTimeMap, totalTickets) {
        // Initialize notification if not already available
        if (!this.notification) {
            try {
                // Import Notification if available
                if (typeof Notification === 'function') {
                    this.notification = new Notification({
                        position: 'bottom-right',
                        duration: 3000
                    });
                }
            } catch (e) {
                console.error('Error initializing notification:', e);
            }
        }

        // Create a button container with some margin
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '15px';
        buttonContainer.style.textAlign = 'center';

        // Create the copy button with improved styling
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy Summary Data';
        copyButton.style.padding = '8px 16px';
        copyButton.style.backgroundColor = '#1f75cb';
        copyButton.style.color = 'white';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '4px';
        copyButton.style.cursor = 'pointer';
        copyButton.style.fontWeight = 'bold';
        copyButton.style.transition = 'background-color 0.2s ease';

        // Hover effects
        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.backgroundColor = '#1a63ac';
        });

        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.backgroundColor = '#1f75cb';
        });

        // Click handler to format and copy data
        copyButton.onclick = () => {
            try {
                // Format data with tab separation
                let formattedData = '';

                // Sort assignees by time spent (descending)
                const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
                    return assigneeTimeMap[b] - assigneeTimeMap[a];
                });

                // Add each assignee with their hours - exactly one tab character between name and hours
                sortedAssignees.forEach(name => {
                    const hours = (assigneeTimeMap[name] / 3600); // Convert seconds to hours with 1 decimal
                    formattedData += `${name}\t${hours}\n`;
                });

                // Add total tickets count at the end
                formattedData += `Issues\t${totalTickets}`;

                // Copy to clipboard
                navigator.clipboard.writeText(formattedData)
                    .then(() => {
                        // Show notification - find the first available notification method
                        if (this.notification) {
                            this.notification.success('Summary data copied to clipboard');
                        } else if (this.uiManager && this.uiManager.notification) {
                            this.uiManager.notification.success('Summary data copied to clipboard');
                        } else {
                            console.log('Summary data copied to clipboard');
                        }
                    })
                    .catch(err => {
                        console.error('Failed to copy data:', err);
                        if (this.notification) {
                            this.notification.error('Failed to copy data to clipboard');
                        } else if (this.uiManager && this.uiManager.notification) {
                            this.uiManager.notification.error('Failed to copy data to clipboard');
                        } else {
                            console.error('Failed to copy data to clipboard');
                        }
                    });

                // Add visual feedback to the button
                const originalText = copyButton.textContent;
                copyButton.textContent = '✓ Copied!';
                copyButton.style.backgroundColor = '#28a745';

                setTimeout(() => {
                    copyButton.textContent = originalText;
                    copyButton.style.backgroundColor = '#1f75cb';
                }, 1500);

            } catch (error) {
                console.error('Error formatting or copying data:', error);
                if (this.notification) {
                    this.notification.error('Error preparing data for clipboard');
                } else if (this.uiManager && this.uiManager.notification) {
                    this.uiManager.notification.error('Error preparing data for clipboard');
                } else {
                    console.error('Error preparing data for clipboard');
                }
            }
        };

        buttonContainer.appendChild(copyButton);
        container.appendChild(buttonContainer);
    }

    
    async render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');
        if (!summaryContent) return;

        // Show a loading indicator while we fetch members
        if (!this.membersList || this.membersList.length === 0) {
            summaryContent.innerHTML = '<div style="text-align: center; padding: 20px;">Loading team members...</div>';

            try {
                // Wait for members to be fetched
                await this.fetchMembers();
            } catch (error) {
                console.error('Error fetching members:', error);
            }
        }

        // Clear the content to rebuild it
        summaryContent.innerHTML = '';

        // Update board stats
        if (this.uiManager) {
            this.uiManager.updateBoardStats({
                totalCards: cardsProcessed,
                withTimeCards: cardsWithTime,
                closedCards: this.getClosedBoardCount()
            });
        }

        if (cardsWithTime === 0) {
            this.renderNoDataMessage(summaryContent);
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('summary-tab');
            }
            return;
        }

        const totalHours = formatHours(totalEstimate);
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

        if (this.uiManager) {
            this.uiManager.updateHeader(
                `Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`
            );
        }

        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }

        // Render the data table with both current and potential assignees
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);

        // Add the copy button
        this.addCopySummaryButton(summaryContent, assigneeTimeMap, cardsWithTime);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('summary-tab');
        }
    }

    
    findPotentialAssignees(currentAssigneeMap) {
        this.potentialAssignees = [];

        try {
            // Create a set of current assignee names (lowercase for case-insensitive comparison)
            const currentAssigneeSet = new Set();
            if (currentAssigneeMap) {
                Object.keys(currentAssigneeMap).forEach(name => {
                    currentAssigneeSet.add(name.toLowerCase());
                });
            }

            // 1. Collect all potential assignees from various sources
            let allPotentialAssignees = [];

            // First from whitelist settings
            const whitelistedAssignees = this.getWhitelistedAssignees();
            if (whitelistedAssignees && whitelistedAssignees.length) {
                allPotentialAssignees = [...allPotentialAssignees, ...whitelistedAssignees];
            }

            // Then from team members fetched from API
            if (this.membersList && this.membersList.length) {
                allPotentialAssignees = [...allPotentialAssignees, ...this.membersList];
            }

            // Finally from sprint history
            const historyAssignees = this.getHistoryAssignees();
            if (historyAssignees && historyAssignees.length) {
                allPotentialAssignees = [...allPotentialAssignees, ...historyAssignees];
            }

            // 2. Create a map to handle duplicates, preferring entries with stats
            const potentialAssigneeMap = new Map();

            allPotentialAssignees.forEach(assignee => {
                // Skip invalid entries
                if (!assignee || (!assignee.name && !assignee.username)) return;

                const name = assignee.name || assignee.username;
                // Skip if this person is already in current assignees
                if (currentAssigneeSet.has(name.toLowerCase())) return;

                // Use name as the key (lowercase for case-insensitive comparison)
                const key = name.toLowerCase();

                // If we already have this person, prefer the one with stats
                if (potentialAssigneeMap.has(key)) {
                    const existing = potentialAssigneeMap.get(key);
                    // Only replace if new one has stats and existing doesn't
                    if (assignee.stats && !existing.stats) {
                        potentialAssigneeMap.set(key, assignee);
                    }
                } else {
                    // First time seeing this person, add them
                    potentialAssigneeMap.set(key, assignee);
                }
            });

            // 3. Convert the map back to an array
            this.potentialAssignees = Array.from(potentialAssigneeMap.values());

            // 4. Log the results for debugging
            console.log(`Found ${this.potentialAssignees.length} potential assignees not currently on board`);
        } catch (error) {
            console.error('Error finding potential assignees:', error);
            this.potentialAssignees = [];
        }
    }

    
    getWhitelistedAssignees() {
        let whitelist = [];

        try {
            // Try to get whitelist from the assignee manager
            if (this.uiManager && this.uiManager.assigneeManager &&
                typeof this.uiManager.assigneeManager.getAssigneeWhitelist === 'function') {
                whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
            }
            // Fall back to global function if available
            else if (typeof getAssigneeWhitelist === 'function') {
                whitelist = getAssigneeWhitelist();
            }
            // Try directly from localStorage as last resort
            else {
                try {
                    const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
                    if (storedValue) {
                        whitelist = JSON.parse(storedValue);
                    }
                } catch (e) {
                    console.warn('Error reading assignee whitelist from localStorage:', e);
                }
            }
        } catch (error) {
            console.error('Error getting whitelist:', error);
        }

        return Array.isArray(whitelist) ? whitelist : [];
    }

    
    getHistoryAssignees() {
        let historyAssignees = [];

        try {
            // First try sprint history (more detailed)
            const sprintHistoryStr = localStorage.getItem('gitLabHelperSprintHistory');
            let foundSprintHistory = false;

            if (sprintHistoryStr) {
                const sprintHistory = JSON.parse(sprintHistoryStr);

                if (Array.isArray(sprintHistory) && sprintHistory.length > 0) {
                    // Get the most recent sprint entry
                    const latestSprint = sprintHistory[0];

                    if (latestSprint && latestSprint.userPerformance) {
                        // Convert to array of assignees with stats
                        historyAssignees = Object.entries(latestSprint.userPerformance).map(([name, data]) => {
                            const historyData = {
                                name: name,
                                username: this.getUsernameFromName(name),
                                stats: {
                                    totalTickets: data.totalTickets || 0,
                                    closedTickets: data.closedTickets || 0,
                                    totalHours: data.totalHours || 0,
                                    closedHours: data.closedHours || 0,
                                    fromHistory: true
                                }
                            };

                            // Add distribution data if available
                            if (latestSprint.userDistributions &&
                                latestSprint.userDistributions[name] &&
                                latestSprint.userDistributions[name].distribution) {
                                historyData.stats.distribution = latestSprint.userDistributions[name].distribution;
                            }

                            return historyData;
                        });

                        foundSprintHistory = true;
                        console.log(`Found ${historyAssignees.length} assignees in sprint history`);
                    }
                }
            }

            // If no sprint history, try general history
            if (!foundSprintHistory) {
                const generalHistoryStr = localStorage.getItem('gitLabHelperHistory');

                if (generalHistoryStr) {
                    const generalHistory = JSON.parse(generalHistoryStr);

                    // Find most recent history entry for current board
                    const boardKey = this.getBoardKey();
                    if (generalHistory[boardKey]) {
                        const dates = Object.keys(generalHistory[boardKey]).sort().reverse();

                        if (dates.length > 0) {
                            const latestEntry = generalHistory[boardKey][dates[0]];

                            if (latestEntry && latestEntry.assigneeTimeMap) {
                                // Convert general history to assignee format
                                const additionalAssignees = Object.entries(latestEntry.assigneeTimeMap)
                                    .map(([name, timeEstimate]) => {
                                        return {
                                            name: name,
                                            username: this.getUsernameFromName(name),
                                            stats: {
                                                totalHours: formatHours(timeEstimate),
                                                closedHours: 0, // We don't know this from general history
                                                fromHistory: true
                                            }
                                        };
                                    });

                                console.log(`Found ${additionalAssignees.length} assignees in general history`);
                                historyAssignees = [...historyAssignees, ...additionalAssignees];
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error getting history assignees:', error);
        }

        return historyAssignees;
    }

    
    getBoardKey() {
        try {
            const url = window.location.href;
            // Split at /boards/ and take everything after
            const splitAtBoards = url.split('/boards/');
            if (splitAtBoards.length < 2) {
                return 'unknown-board';
            }

            // Return everything after /boards/ as the key
            return splitAtBoards[1];
        } catch (error) {
            console.error('Error generating board key:', error);
            return 'unknown-board';
        }
    }

    
    getUsernameFromName(name) {
        if (!name) return '';

        // First check if we can find this name in our membersList
        if (this.membersList && this.membersList.length) {
            const match = this.membersList.find(m => m.name === name);
            if (match && match.username) {
                return match.username;
            }
        }

        // If not found, attempt to create a username by:
        // 1. Check if it already looks like a username (no spaces)
        if (!name.includes(' ')) {
            return name.toLowerCase();
        }

        // 2. If it has spaces, convert to dot format (e.g., "John Doe" -> "john.doe")
        return name.toLowerCase()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9._-]/g, '');
    }

    
    getClosedBoardCount() {
        let closedCount = 0;
        const boardLists = document.querySelectorAll('.board-list');

        boardLists.forEach(boardList => {
            let boardTitle = '';

            try {
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child =>
                        child.$props && child.$props.list && child.$props.list.title);

                    if (boardComponent && boardComponent.$props.list.title) {
                        boardTitle = boardComponent.$props.list.title.toLowerCase();
                    }
                }
                if (!boardTitle) {
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim().toLowerCase();
                }
            }
            if (boardTitle.includes('done') || boardTitle.includes('closed') ||
                boardTitle.includes('complete') || boardTitle.includes('finished')) {
                const cards = boardList.querySelectorAll('.board-card');
                closedCount += cards.length;
            }
        });

        return closedCount;
    }

    
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
        this.uiManager.updateHeader('Summary 0.0h');
    }

    
    renderMilestoneInfo(container, milestoneName) {
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.marginBottom = '10px';
        milestoneInfo.style.fontSize = '13px';
        milestoneInfo.style.color = '#555';
        milestoneInfo.textContent = `Current Milestone: ${milestoneName}`;
        container.appendChild(milestoneInfo);
    }

    
    renderDataTableWithDistribution(container, assigneeTimeMap, totalHours, boardData, boardAssigneeData) {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        const boardNames = Object.keys(boardData || {});

        // Create the total row first
        const totalRow = document.createElement('tr');
        totalRow.style.borderBottom = '2px solid #ddd';
        totalRow.style.fontWeight = 'bold';

        const totalLabelCell = document.createElement('td');
        // Make Total clickable
        const totalLink = document.createElement('a');
        totalLink.textContent = 'Total';
        totalLink.href = window.location.pathname + '?milestone_title=Started'; // Show all with current milestone
        totalLink.style.color = '#1f75cb';
        totalLink.style.textDecoration = 'none';
        totalLink.style.cursor = 'pointer';
        totalLink.addEventListener('mouseenter', () => {
            totalLink.style.textDecoration = 'underline';
        });
        totalLink.addEventListener('mouseleave', () => {
            totalLink.style.textDecoration = 'none';
        });
        totalLabelCell.appendChild(totalLink);
        totalLabelCell.style.padding = '8px 0';
        totalLabelCell.style.paddingLeft = '32px'; // Add padding to align with avatar rows

        const totalValueCell = document.createElement('td');
        totalValueCell.textContent = `${totalHours}h`;
        totalValueCell.style.textAlign = 'right';
        totalValueCell.style.padding = '8px 0';

        const totalDistributionCell = document.createElement('td');
        totalDistributionCell.style.textAlign = 'right';
        totalDistributionCell.style.padding = '8px 0 8px 15px';
        totalDistributionCell.style.color = '#666';
        totalDistributionCell.style.fontSize = '12px';

        if (boardNames.length > 0 && boardData) {
            const distributionValues = boardNames.map(boardName => {
                const boardDataObj = boardData[boardName] || { timeEstimate: 0 };
                const hoursFloat = parseFloat(formatHours(boardDataObj.timeEstimate || 0));
                return Math.round(hoursFloat); // Round to integer
            });

            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;
                if (hours === 0) {
                    spanHTML += `color:#aaa;`; // Grey for zero values
                }
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`; // Green for last board with hours
                }

                spanHTML += `">${hours}h</span>`;
                return spanHTML;
            }).join('/');

            totalDistributionCell.innerHTML = distributionText;
        }

        totalRow.appendChild(totalLabelCell);
        totalRow.appendChild(totalValueCell);
        totalRow.appendChild(totalDistributionCell);
        table.appendChild(totalRow);

        // STEP 1: Add current assignees (sorted by time estimate)
        // These are the users currently on the board
        const currentAssigneeSet = new Set();
        const sortedAssignees = Object.keys(assigneeTimeMap || {}).sort((a, b) => {
            return (assigneeTimeMap[b] || 0) - (assigneeTimeMap[a] || 0);
        });

        sortedAssignees.forEach(name => {
            if (!name) return;

            const hours = formatHours(assigneeTimeMap[name] || 0);
            this.addAssigneeRow(table, name, hours, boardNames, boardAssigneeData);

            // Remember this assignee is already shown
            currentAssigneeSet.add(name.toLowerCase());
        });

        // STEP 2: Find other members who have access to this board but aren't currently assigned
        if (this.membersList && this.membersList.length > 0) {
            const otherMembers = this.membersList.filter(member => {
                if (!member) return false;

                const name = member.name || member.username;
                if (!name) return false;

                return !currentAssigneeSet.has(name.toLowerCase());
            });

            if (otherMembers.length > 0) {
                const separatorRow = document.createElement('tr');
                const separatorCell = document.createElement('td');
                separatorCell.colSpan = 3;
                separatorCell.style.padding = '10px 0 5px 32px'; // Align with avatars
                separatorCell.style.fontSize = '12px';
                separatorCell.style.color = '#666';
                separatorCell.style.fontStyle = 'italic';
                separatorCell.textContent = 'Other Team Members:';
                separatorRow.appendChild(separatorCell);
                table.appendChild(separatorRow);

                // STEP 3: Add other members with board access
                otherMembers.forEach(member => {
                    const name = member.name || member.username;
                    if (!name) return;

                    // Display with historical data if available
                    if (member.stats) {
                        this.addAssigneeRow(table, name, '0h', boardNames, {}, true, member.stats);
                    } else {
                        this.addAssigneeRow(table, name, '0h', boardNames, {}, true);
                    }
                });
            }
        }

        container.appendChild(table);
    }

    
    addAssigneeRow(table, name, hours, boardNames, boardAssigneeData, isPotential = false, historyStats = null) {
        if (!name) name = "Unknown User";

        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        // If it's a potential assignee with no current work, style it differently
        if (isPotential) {
            row.style.opacity = '0.75';
            row.style.fontStyle = 'italic';
        }

        const nameCell = document.createElement('td');
        nameCell.style.display = 'flex';
        nameCell.style.alignItems = 'center';
        nameCell.style.padding = '8px 0';

        // Find member details
        const member = this.findMemberByName(name);

        // Add avatar
        const avatar = document.createElement('div');
        avatar.style.width = '24px';
        avatar.style.height = '24px';
        avatar.style.borderRadius = '50%';
        avatar.style.marginRight = '8px';
        avatar.style.overflow = 'hidden';
        avatar.style.flexShrink = '0';

        if (member && member.avatar_url) {
            // Use actual avatar image
            const img = document.createElement('img');
            img.src = member.avatar_url;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            avatar.appendChild(img);
        } else {
            // Create placeholder with initials
            avatar.style.backgroundColor = '#e0e0e0';
            avatar.style.display = 'flex';
            avatar.style.alignItems = 'center';
            avatar.style.justifyContent = 'center';
            avatar.style.fontSize = '10px';
            avatar.style.fontWeight = 'bold';
            avatar.style.color = '#666';

            // Get initials from name
            const initials = name.split(' ')
                .map(part => part.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase();

            avatar.textContent = initials || '?';
        }

        nameCell.appendChild(avatar);

        // Create user name container
        const nameContainer = document.createElement('div');
        nameContainer.style.overflow = 'hidden';
        nameContainer.style.textOverflow = 'ellipsis';

        // Make assignee name clickable - link to user's issues
        const nameLink = document.createElement('a');

        // Create appropriate link based on username if available
        if (member && member.username) {
            // Link to user's issues in current milestone
            nameLink.href = window.location.pathname +
                `?milestone_title=Started&assignee_username=${member.username}`;
        } else {
            // Fall back to milestone view if no username
            nameLink.href = window.location.pathname + '?milestone_title=Started';
        }

        nameLink.textContent = name;
        nameLink.style.color = '#1f75cb';
        nameLink.style.textDecoration = 'none';
        nameLink.style.cursor = 'pointer';
        nameLink.style.display = 'block';
        nameLink.style.overflow = 'hidden';
        nameLink.style.textOverflow = 'ellipsis';
        nameLink.style.whiteSpace = 'nowrap';

        nameLink.addEventListener('mouseenter', () => {
            nameLink.style.textDecoration = 'underline';
        });
        nameLink.addEventListener('mouseleave', () => {
            nameLink.style.textDecoration = 'none';
        });

        nameContainer.appendChild(nameLink);
        nameCell.appendChild(nameContainer);

        const timeCell = document.createElement('td');
        timeCell.textContent = `${hours}`;
        timeCell.style.textAlign = 'right';
        timeCell.style.padding = '8px 0';

        const distributionCell = document.createElement('td');
        distributionCell.style.textAlign = 'right';
        distributionCell.style.padding = '8px 0 8px 15px';
        distributionCell.style.color = '#666';
        distributionCell.style.fontSize = '12px';

        if (!isPotential && boardNames.length > 0 && boardAssigneeData) {
            // For current assignees, show their board distribution
            const distributionValues = boardNames.map(boardName => {
                const boardAssignees = boardAssigneeData[boardName] || {};
                const assigneeInBoard = boardAssignees[name] || { timeEstimate: 0 };
                const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
                return Math.round(hoursFloat); // Round to integer
            });

            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;
                if (hours === 0) {
                    spanHTML += `color:#aaa;`; // Grey for zero values
                }
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`; // Green for last board with hours
                }

                spanHTML += `">${hours}h</span>`;
                return spanHTML;
            }).join('/');

            distributionCell.innerHTML = distributionText;
        } else if (historyStats && historyStats.fromHistory) {
            // For potential assignees with history stats

            if (historyStats.distribution && Array.isArray(historyStats.distribution)) {
                // Use the full distribution data if available
                const distributionText = historyStats.distribution.map((hours, index) => {
                    let spanHTML = `<span style="`;
                    if (hours === 0) {
                        spanHTML += `color:#aaa;`; // Grey for zero values
                    }
                    if (index === historyStats.distribution.length - 1 && hours > 0) {
                        spanHTML += `color:#28a745;`; // Green for last board with hours
                    }

                    spanHTML += `">${hours}h</span>`;
                    return spanHTML;
                }).join('/');

                // Add ? at the end to indicate it's historical
                distributionCell.innerHTML = distributionText + '?';
            } else {
                // Fallback to simpler style if we don't have distribution data
                const closedHours = historyStats.closedHours || 0;
                const totalHours = historyStats.totalHours || 0;

                // If we have boardNames, try to match the format
                if (boardNames && boardNames.length > 0) {
                    // Create empty placeholders for all but the last board
                    const placeholders = Array(boardNames.length - 1).fill('<span style="color:#aaa;">0h</span>');

                    // Add the historical data at the end
                    distributionCell.innerHTML = placeholders.join('/') +
                        `/<span style="color:#28a745;">${totalHours}h?</span>`;
                } else {
                    // Simple format
                    distributionCell.innerHTML = `<span style="color:#28a745;">${totalHours}h?</span>`;
                }
            }
        } else {
            // For potential assignees with no current work and no history
            const emptyText = boardNames.map(() => {
                return `<span style="color:#aaa;">0h</span>`;
            }).join('/');

            distributionCell.innerHTML = emptyText;
        }

        row.appendChild(nameCell);
        row.appendChild(timeCell);
        row.appendChild(distributionCell);
        table.appendChild(row);
    }

    
    loadMembersList() {
        try {
            // First check if there's an assigneeManager available
            if (this.uiManager && this.uiManager.assigneeManager) {
                // Try to get current user
                if (typeof this.uiManager.assigneeManager.fetchCurrentUser === 'function') {
                    const currentUser = this.uiManager.assigneeManager.fetchCurrentUser();
                    if (currentUser) {
                        this.membersList = [currentUser];
                    }
                }

                // Also add whitelist members if available
                if (typeof this.uiManager.assigneeManager.getAssigneeWhitelist === 'function') {
                    const whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
                    if (Array.isArray(whitelist) && whitelist.length > 0) {
                        // If we already have members, add to them
                        if (this.membersList && this.membersList.length > 0) {
                            this.membersList = [...this.membersList, ...whitelist];
                        } else {
                            this.membersList = [...whitelist];
                        }
                    }
                }
            }

            // If no members found yet, try using global whitelist
            if (!this.membersList || this.membersList.length === 0) {
                const whitelist = this.getWhitelistedAssignees();
                if (whitelist && whitelist.length > 0) {
                    this.membersList = [...whitelist];
                }
            }

            // Ensure we have a valid array even if empty
            if (!this.membersList) {
                this.membersList = [];
            }

            console.log(`Loaded ${this.membersList.length} members from local sources`);
        } catch (error) {
            console.error('Error loading members list:', error);
            this.membersList = [];
        }
    }

    
    getAssigneeUsername(displayName) {
        // Handle edge cases
        if (!displayName) return '';
        if (displayName === 'Unassigned') return 'none';

        // First, handle the case where displayName may include stats in parentheses
        // Extract just the name part (before any parentheses)
        const cleanName = displayName.split(' (')[0].trim();

        // If we have members from the API, check them first (most accurate)
        if (this.membersList && this.membersList.length > 0) {
            // First try exact match by name
            const exactMatch = this.membersList.find(m =>
                m.name === cleanName || m.username === cleanName);

            if (exactMatch && exactMatch.username) {
                return exactMatch.username;
            }

            // If no exact match, try case-insensitive match
            const caseInsensitiveMatch = this.membersList.find(m =>
                (m.name && m.name.toLowerCase() === cleanName.toLowerCase()) ||
                (m.username && m.username.toLowerCase() === cleanName.toLowerCase()));

            if (caseInsensitiveMatch && caseInsensitiveMatch.username) {
                return caseInsensitiveMatch.username;
            }
        }

        // If members list is empty or the name wasn't found, try to load members immediately
        if (!this.membersList || this.membersList.length === 0) {
            this.loadMembersList();

            // Check again with the newly loaded list
            if (this.membersList && this.membersList.length > 0) {
                const member = this.membersList.find(m =>
                    m.name === cleanName ||
                    m.username === cleanName ||
                    (m.name && m.name.toLowerCase() === cleanName.toLowerCase()) ||
                    (m.username && m.username.toLowerCase() === cleanName.toLowerCase()));

                if (member && member.username) {
                    return member.username;
                }
            }
        }

        // Check if the name itself is a valid username (sometimes this happens)
        if (cleanName && cleanName.indexOf(' ') === -1 && /^[a-z0-9._-]+$/i.test(cleanName)) {
            return cleanName.toLowerCase();
        }

        // If we still don't have a username, sanitize the display name as a fallback
        // Remove spaces and special characters to create a username-like string
        return cleanName.toLowerCase()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9._-]/g, '');
    }
    async fetchMembers() {
        try {
            // Initialize with whitelist members as these are likely relevant
            const whitelistedAssignees = this.getWhitelistedAssignees();
            let allMembers = [];

            if (whitelistedAssignees && whitelistedAssignees.length > 0) {
                allMembers = [...whitelistedAssignees];
                console.log(`Loaded ${allMembers.length} members from whitelist as initial set`);
            }

            // Try to get gitlab API
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
                if (!this.gitlabApi) {
                    console.warn('GitLab API not available for fetching members, using whitelist only');
                    this.membersList = allMembers;
                    return allMembers;
                }
            }

            // Get fetch path for GitLab API
            const pathInfo = getPathFromUrl?.() || {};
            if (!pathInfo || !pathInfo.type || !pathInfo.encodedPath) {
                console.warn('Could not determine project/group path, using whitelist only');
                this.membersList = allMembers;
                return allMembers;
            }

            // Determine the correct endpoint for this project/group
            let endpoint;
            if (pathInfo.type === 'project') {
                endpoint = `projects/${pathInfo.encodedPath}/members/all`;
            } else if (pathInfo.type === 'group') {
                endpoint = `groups/${pathInfo.encodedPath}/members/all`;
            } else {
                console.warn('Unsupported path type, using whitelist only:', pathInfo.type);
                this.membersList = allMembers;
                return allMembers;
            }

            // Use cached API call to avoid redundant requests
            console.log(`Fetching members from endpoint: ${endpoint}`);
            const members = await this.gitlabApi.callGitLabApiWithCache(
                endpoint,
                {params: {per_page: 100, all_available: true}}
            );

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members, using whitelist only');
                this.membersList = allMembers;
                return allMembers;
            }

            // Add project/group members
            allMembers.push(...members);

            // Convert API responses to our member format and remove duplicates
            const memberMap = new Map();

            allMembers.forEach(member => {
                if (!member || !member.username) return;

                const key = member.username.toLowerCase();

                // If we already have this member, keep the one with more information
                if (memberMap.has(key)) {
                    // Prefer entries with stats, or with complete data
                    const existing = memberMap.get(key);
                    if (!existing.id || (member.id && existing.name === undefined && member.name)) {
                        memberMap.set(key, {
                            id: member.id,
                            name: member.name || existing.name,
                            username: member.username,
                            avatar_url: member.avatar_url || existing.avatar_url,
                            // Keep stats if they exist
                            stats: existing.stats
                        });
                    }
                } else {
                    // New member, add them
                    memberMap.set(key, {
                        id: member.id,
                        name: member.name,
                        username: member.username,
                        avatar_url: member.avatar_url
                    });
                }
            });

            // Include history assignees for their stats
            const historyAssignees = this.getHistoryAssignees();
            debugger
            historyAssignees.forEach(assignee => {
                if (!assignee || !assignee.username) return;

                const key = assignee.username.toLowerCase();

                if (memberMap.has(key)) {
                    // Update existing member with stats
                    const existing = memberMap.get(key);
                    memberMap.set(key, {
                        ...existing,
                        stats: assignee.stats
                    });
                } else {
                    // Only add history assignees that were in the whitelist
                    // (these are likely relevant to the current board)
                    const isWhitelisted = whitelistedAssignees.some(wa =>
                        wa.username && wa.username.toLowerCase() === key);

                    if (isWhitelisted) {
                        memberMap.set(key, assignee);
                    }
                }
            });

            // Convert map back to array
            this.membersList = Array.from(memberMap.values());

            console.log(`Successfully fetched ${this.membersList.length} members with access to this board`);
            return this.membersList;
        } catch (error) {
            console.error('Error fetching members:', error);
            // If we have a fallback list from whitelist, return it
            if (allMembers && allMembers.length > 0) {
                console.log(`Using ${allMembers.length} members from whitelist after API error`);
                this.membersList = allMembers;
                return allMembers;
            }
            this.membersList = [];
            return [];
        }
    }

    
    isHistoricalAssigneeRelevant(assignee, filterUsername) {
        if (!assignee || !filterUsername) return false;

        // Normalize for case-insensitive comparison
        const normalizedFilter = filterUsername.toLowerCase();

        // Check username
        if (assignee.username && assignee.username.toLowerCase() === normalizedFilter) {
            return true;
        }

        // Check name (the assignee might have their username in their display name)
        if (assignee.name) {
            const name = assignee.name.toLowerCase();
            if (name === normalizedFilter) return true;

            // Also check if the username is part of their display name
            if (name.includes(normalizedFilter)) return true;
        }

        return false;
    }

    
    findMemberByName(name) {
        if (!name || !this.membersList) return null;

        const lowerName = name.toLowerCase();
        return this.membersList.find(member => {
            if (!member) return false;

            // Check by name
            if (member.name && member.name.toLowerCase() === lowerName) {
                return true;
            }

            // Check by username
            if (member.username && member.username.toLowerCase() === lowerName) {
                return true;
            }

            return false;
        }) || null;
    }
}

// File: lib/ui/views/BoardsView.js
window.BoardsView = class BoardsView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
    }
    
    render(boardData, boardAssigneeData) {
        const boardsContent = document.getElementById('boards-time-summary-content');
        if (!boardsContent) return;
        boardsContent.innerHTML = '';
        const boardsList = document.createElement('div');
        boardsList.className = 'boards-list-summary';

        // Filter out empty boards (those with no tickets or no time estimate)
        const nonEmptyBoards = Object.keys(boardData).filter(boardName => {
            return boardData[boardName].tickets > 0 && boardData[boardName].timeEstimate > 0;
        });

        // Sort the remaining boards by time estimate
        const sortedBoards = nonEmptyBoards.sort((a, b) => {
            return boardData[b].timeEstimate - boardData[a].timeEstimate;
        });

        if (sortedBoards.length === 0) {
            // Display a message when there are no non-empty boards
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No boards with time estimates found.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            boardsList.appendChild(emptyMessage);
        } else {
            // Create sections for each non-empty board
            sortedBoards.forEach(boardName => {
                const boardSection = this.createBoardSection(
                    boardName,
                    boardData[boardName],
                    boardAssigneeData[boardName]
                );
                boardsList.appendChild(boardSection);
            });
        }

        boardsContent.appendChild(boardsList);
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('boards-tab');
        }
    }

    
    createBoardSection(boardName, boardData, assigneeData) {
        const boardHours = formatHours(boardData.timeEstimate);
        const boardSection = document.createElement('div');
        boardSection.className = 'board-section';
        boardSection.style.marginBottom = '15px';
        const boardHeader = document.createElement('div');
        boardHeader.className = 'board-header';
        boardHeader.style.display = 'flex';
        boardHeader.style.justifyContent = 'space-between';
        boardHeader.style.padding = '5px';
        boardHeader.style.backgroundColor = '#f5f5f5';
        boardHeader.style.borderRadius = '3px';
        boardHeader.style.cursor = 'pointer';
        boardHeader.style.fontWeight = 'bold';
        const boardDetails = document.createElement('div');
        boardDetails.className = 'board-details';
        boardDetails.style.display = 'none';
        boardDetails.style.marginTop = '5px';
        boardDetails.style.marginLeft = '10px';
        boardHeader.addEventListener('click', () => {
            if (boardDetails.style.display === 'none') {
                boardDetails.style.display = 'block';
                boardToggle.textContent = '▼';
            } else {
                boardDetails.style.display = 'none';
                boardToggle.textContent = '▶';
            }
        });
        const boardInfo = document.createElement('div');
        boardInfo.textContent = `${boardName} (${boardData.tickets} tickets, ${boardHours}h)`;
        const boardToggle = document.createElement('span');
        boardToggle.textContent = '▶';
        boardToggle.style.marginLeft = '5px';

        boardHeader.appendChild(boardInfo);
        boardHeader.appendChild(boardToggle);

        // Only add assignee table if there's assignee data
        if (assigneeData && Object.keys(assigneeData).length > 0) {
            boardDetails.appendChild(
                this.createAssigneeTable(assigneeData)
            );
        } else {
            // Add a message if there's no assignee data
            const noAssigneesMsg = document.createElement('div');
            noAssigneesMsg.textContent = 'No assignee data available for this board.';
            noAssigneesMsg.style.padding = '8px 0';
            noAssigneesMsg.style.color = '#666';
            noAssigneesMsg.style.fontStyle = 'italic';
            boardDetails.appendChild(noAssigneesMsg);
        }

        boardSection.appendChild(boardHeader);
        boardSection.appendChild(boardDetails);

        return boardSection;
    }

    
    createAssigneeTable(assigneeData) {
        const assigneeTable = document.createElement('table');
        assigneeTable.style.width = '100%';
        assigneeTable.style.borderCollapse = 'collapse';
        assigneeTable.style.marginTop = '5px';
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
        const boardAssignees = Object.keys(assigneeData).sort((a, b) => {
            return assigneeData[b].timeEstimate - assigneeData[a].timeEstimate;
        });
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

// File: lib/ui/views/SprintManagementView.js



window.SprintManagementView = class SprintManagementView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.notification = null;
        try {
            // Import Notification if available
            if (typeof Notification === 'function') {
                this.notification = new Notification({
                    position: 'bottom-right',
                    duration: 3000
                });
            }
        } catch (e) {
            console.error('Error initializing notification:', e);
        }

        // Initialize sprint state
        this.sprintState = {
            endSprint: false,
            preparedForNext: false,  // Renamed from survivorsSet
            currentMilestone: null,
            userPerformance: {}  // Add user performance tracking
        };

        // Initialize sprint history
        this.sprintHistory = [];

        // Load state from localStorage
        this.loadSprintState();
        this.loadSprintHistory();
    }

    
    render() {
        const sprintManagementContent = document.getElementById('sprint-management-content');
        if (!sprintManagementContent) return;

        sprintManagementContent.innerHTML = '';

        // Check URL for required milestone_title parameter
        const urlParams = new URLSearchParams(window.location.search);

        // Check that there is exactly one parameter (milestone_title=Started)
        let isValidUrl = false;

        if (urlParams.has('milestone_title') && urlParams.get('milestone_title') === 'Started') {
            // Count the number of parameters to ensure there are no others
            let paramCount = 0;
            urlParams.forEach(() => {
                paramCount++;
            });

            // Only valid if milestone_title=Started is the only parameter
            isValidUrl = (paramCount === 1);
        }

        // If URL doesn't exactly match milestone_title=Started with no other params, show locked message
        if (!isValidUrl) {
            this.renderLockedState(sprintManagementContent);
            return;
        }

        // Continue with normal rendering if URL check passes
        // Get current milestone
        this.getCurrentMilestone();

        // Create milestone display
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.padding = '10px';
        milestoneInfo.style.margin = '0 10px';
        milestoneInfo.style.backgroundColor = '#f8f9fa';
        milestoneInfo.style.borderRadius = '6px';
        milestoneInfo.style.fontWeight = 'bold';

        if (this.sprintState.currentMilestone) {
            milestoneInfo.textContent = `Current Milestone: ${this.sprintState.currentMilestone}`;
        } else {
            milestoneInfo.textContent = 'No milestone detected';
            milestoneInfo.style.color = '#dc3545';
        }

        sprintManagementContent.appendChild(milestoneInfo);

        // Create step container
        const stepsContainer = document.createElement('div');
        stepsContainer.style.display = 'flex';
        stepsContainer.style.flexDirection = 'column';
        stepsContainer.style.gap = '5px';
        stepsContainer.style.marginTop = '';
        stepsContainer.style.padding = '15px';
        stepsContainer.style.backgroundColor = '#f8f9fa';
        stepsContainer.style.borderRadius = '6px';
        stepsContainer.style.border = '1px solid #dee2e6';
        stepsContainer.style.margin = '10px 10px 0';
        // lib/ui/views/SprintManagementView.js - renderStepsContainer function (replace it)

// Step 1: End Sprint Button
        this.createStepButton(
            stepsContainer,
            '1. End Sprint',
            '#1f75cb',
            () => this.endSprint(),
            !this.sprintState.endSprint  // Only enabled if step not completed
        );

// Step 2: Prepare for Next Sprint Button (renamed from Set Sprint Survivors)
        this.createStepButton(
            stepsContainer,
            '2. Ready for next Sprint',
            '#6f42c1',
            () => this.prepareForNextSprint(),
            this.sprintState.endSprint && !this.sprintState.preparedForNext  // Only enabled if step 1 is done but step 2 is not
        );

// Step 3: Copy Sprint Data Button (changed from 4 to 3)
        this.createStepButton(
            stepsContainer,
            '3. Copy Sprint Data Summary',
            '#28a745',
            () => this.copySprintData(),
            this.sprintState.preparedForNext  // Only enabled if steps 1 and 2 are done
        );

// Step 4: Copy Closed Issues Button (changed from 3 to 4)
        this.createStepButton(
            stepsContainer,
            '4. Copy Closed Issue Names',
            '#fd7e14',
            () => this.copyClosedTickets(),
            this.sprintState.preparedForNext  // Only enabled if steps 1 and 2 are done
        );

// Utility buttons - only keep Edit Data, remove reset
        const utilityContainer = document.createElement('div');
        utilityContainer.style.display = 'flex';
        utilityContainer.style.justifyContent = 'flex-end'; // Changed to flex-end since we only have one button
        utilityContainer.style.marginTop = '10px';

// Edit Data Button (only enabled if step 1 is done)
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit Data'; // Removed the "6." prefix
        editButton.className = 'edit-sprint-data-button';
        editButton.style.padding = '10px 16px';

// Check if step 1 is done before enabling the edit button
        const editEnabled = this.sprintState.endSprint;
        editButton.style.backgroundColor = editEnabled ? '#17a2b8' : '#6c757d';
        editButton.style.color = 'white';
        editButton.style.border = 'none';
        editButton.style.borderRadius = '4px';
        editButton.style.cursor = editEnabled ? 'pointer' : 'not-allowed';
        editButton.style.fontWeight = 'bold';
        editButton.style.opacity = editEnabled ? '1' : '0.7';
        editButton.disabled = !editEnabled;

        if (editEnabled) {
            editButton.addEventListener('click', () => this.editSprintData());
        }

        utilityContainer.appendChild(editButton);
        stepsContainer.appendChild(utilityContainer);

        // Add the steps container to the main content
        sprintManagementContent.appendChild(stepsContainer);

        // Show current sprint data if available
        if (this.sprintState.totalTickets !== undefined) {
            this.showSprintDataSummary(sprintManagementContent);
        }

        // Add sprint history section
        this.renderSprintHistory(sprintManagementContent);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('sprintmanagement-tab');
        }
    }

    
    renderLockedState(container) {
        const lockedContainer = document.createElement('div');
        lockedContainer.style.display = 'flex';
        lockedContainer.style.flexDirection = 'column';
        lockedContainer.style.alignItems = 'center';
        lockedContainer.style.justifyContent = 'center';
        lockedContainer.style.padding = '40px';
        lockedContainer.style.backgroundColor = '#f8f9fa';
        lockedContainer.style.borderRadius = '6px';
        lockedContainer.style.margin = '10px';
        lockedContainer.style.textAlign = 'center';

        // Lock icon
        const lockIcon = document.createElement('div');
        lockIcon.innerHTML = '🔒';
        lockIcon.style.fontSize = '48px';
        lockIcon.style.marginBottom = '20px';

        // Message
        const message = document.createElement('h3');
        message.textContent = 'Sprint Management is Locked';
        message.style.marginBottom = '15px';
        message.style.color = '#495057';

        // Instruction with updated text about exact parameter requirements
        const instruction = document.createElement('p');
        instruction.innerHTML = 'Sprint Management is only available when URL contains <strong>exactly</strong> <code>?milestone_title=Started</code> with no other parameters';
        instruction.style.color = '#6c757d';
        instruction.style.marginBottom = '20px';

        // Link to access with correct parameters - will replace all current parameters
        const link = document.createElement('a');

        // Create a clean URL with just the necessary parameter
        const currentUrl = new URL(window.location.href);

        // Remove all current parameters
        currentUrl.search = '';

        // Add only the milestone_title parameter
        currentUrl.searchParams.set('milestone_title', 'Started');

        link.href = currentUrl.toString();
        link.textContent = 'Access Sprint Management';
        link.style.display = 'inline-block';
        link.style.padding = '10px 16px';
        link.style.backgroundColor = '#1f75cb';
        link.style.color = 'white';
        link.style.textDecoration = 'none';
        link.style.borderRadius = '4px';
        link.style.fontWeight = 'bold';
        link.style.marginTop = '10px';

        lockedContainer.appendChild(lockIcon);
        lockedContainer.appendChild(message);
        lockedContainer.appendChild(instruction);
        lockedContainer.appendChild(link);

        container.appendChild(lockedContainer);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('sprintmanagement-tab');
        }
    }

    
    copyClosedTickets() {
        try {
            // Get all closed tickets
            const closedTickets = this.getClosedTickets();

            if (closedTickets.length === 0) {
                this.notification.warning('No closed tickets found on the board');
                return;
            }

            // Format tickets as plain text with newlines
            const formattedText = closedTickets.map(ticket => ticket.title).join('\n');

            // Copy to clipboard
            navigator.clipboard.writeText(formattedText)
                .then(() => {
                    this.notification.success(`Copied ${closedTickets.length} issue ${closedTickets.length !== 1 ? 'names' : 'name'} to clipboard`);
                })
                .catch(err => {
                    console.error('Error copying to clipboard:', err);
                    this.notification.error('Failed to copy to clipboard');
                });

        } catch (error) {
            console.error('Error copying closed tickets:', error);
            this.notification.error('Error processing issues');
        }
    }

    
    updateStatus(message, type = 'info') {
        // Only use notifications - no DOM elements
        if (this.notification) {
            this.notification[type](message);
        } else {
            // Fallback if notification system is not available
            console.log(`${type.toUpperCase()}: ${message}`);
        }
    }

    
    getClosedTickets() {
        const closedTickets = [];
        const boardLists = document.querySelectorAll('.board-list');

        boardLists.forEach(boardList => {
            let boardTitle = '';

            try {
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child =>
                        child.$props && child.$props.list && child.$props.list.title);

                    if (boardComponent && boardComponent.$props.list.title) {
                        boardTitle = boardComponent.$props.list.title.toLowerCase();
                    }
                }

                if (!boardTitle) {
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim().toLowerCase();
                }
            }

            // Check if this is a closed/done board
            const isClosedBoard = boardTitle.includes('done') ||
                boardTitle.includes('closed') ||
                boardTitle.includes('complete') ||
                boardTitle.includes('finished');

            if (isClosedBoard) {
                // Process all cards in this closed board
                const boardCards = boardList.querySelectorAll('.board-card');

                boardCards.forEach(card => {
                    try {
                        if (card.__vue__ && card.__vue__.$children) {
                            const issue = card.__vue__.$children.find(child =>
                                child.$props && child.$props.item);

                            if (issue && issue.$props && issue.$props.item) {
                                const item = issue.$props.item;

                                // Extract title and id from the issue
                                const title = item.title;
                                const id = item.iid;

                                if (title) {
                                    closedTickets.push({
                                        id: id || 'unknown',
                                        title: title
                                    });
                                }
                            }
                        } else {
                            // Fallback if Vue component not available
                            const titleEl = card.querySelector('.board-card-title');
                            if (titleEl) {
                                const title = titleEl.textContent.trim();
                                let id = 'unknown';

                                // Try to extract ID if available
                                const idMatch = card.querySelector('[data-issue-id]');
                                if (idMatch && idMatch.dataset.issueId) {
                                    id = idMatch.dataset.issueId;
                                }

                                if (title) {
                                    closedTickets.push({
                                        id: id,
                                        title: title
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error processing card:', err);
                    }
                });
            }
        });

        return closedTickets;
    }

    
    copySprintData() {
        try {
            // Get data from sprint state
            const {totalTickets, closedTickets, totalHours, closedHours, extraHoursClosed = 0} = this.sprintState;

            // Calculate the total closed hours including extras
            const totalClosedHours = closedHours + extraHoursClosed;

            // Calculate prediction
            let prediction = 'schlecht';
            const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
            const hoursRatio = totalHours > 0 ? totalClosedHours / totalHours : 0;

            if (ticketRatio > 0.7 || hoursRatio > 0.7) {
                prediction = 'gut';
            } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
                prediction = 'mittel';
            }

            const formattedData = `${totalTickets}\n${closedTickets}\n${totalHours}\n${totalClosedHours}\n\n${prediction}`;

            // Copy to clipboard
            navigator.clipboard.writeText(formattedData)
                .then(() => {
                    this.notification.success('Sprint data copied to clipboard');
                })
                .catch(err => {
                    console.error('Error copying sprint data to clipboard:', err);
                    this.notification.error('Failed to copy sprint data');
                });
        } catch (error) {
            console.error('Error copying sprint data:', error);
            this.notification.error('Error processing sprint data');
        }
    }

    
    calculateSprintData() {
        let totalTickets = 0;
        let totalHours = 0;
        let closedHours = 0;

        const boardLists = document.querySelectorAll('.board-list');

        boardLists.forEach(boardList => {
            let boardTitle = '';

            try {
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child =>
                        child.$props && child.$props.list && child.$props.list.title);

                    if (boardComponent && boardComponent.$props.list.title) {
                        boardTitle = boardComponent.$props.list.title.toLowerCase();
                    }
                }

                if (!boardTitle) {
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim().toLowerCase();
                }
            }

            // Check if this is a closed/done board
            const isClosedBoard = boardTitle.includes('done') ||
                boardTitle.includes('closed') ||
                boardTitle.includes('complete') ||
                boardTitle.includes('finished');

            // Process all cards in this board
            const boardCards = boardList.querySelectorAll('.board-card');

            boardCards.forEach(card => {
                try {
                    if (card.__vue__ && card.__vue__.$children) {
                        const issue = card.__vue__.$children.find(child =>
                            child.$props && child.$props.item);

                        if (issue && issue.$props && issue.$props.item) {
                            const item = issue.$props.item;

                            // Count total tickets
                            totalTickets++;

                            // Sum up time estimates if available
                            if (item.timeEstimate) {
                                const hours = item.timeEstimate / 3600; // Convert seconds to hours
                                totalHours += hours;

                                // Add to closed hours if in closed board
                                if (isClosedBoard) {
                                    closedHours += hours;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error processing card:', err);
                }
            });
        });

        // Round the hours to 1 decimal place
        totalHours = Math.round(totalHours * 10) / 10;
        closedHours = Math.round(closedHours * 10) / 10;

        // Calculate prediction
        let prediction = 'schlecht';
        const closedTickets = this.getClosedTickets().length;

        // Calculate ratios
        const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
        const hoursRatio = totalHours > 0 ? closedHours / totalHours : 0;

        // Determine prediction based on ratios
        if (ticketRatio > 0.7 || hoursRatio > 0.7) {
            prediction = 'gut';
        } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
            prediction = 'mittel';
        }

        return {
            totalTickets,
            totalHours,
            closedHours,
            prediction
        };
    }

    // Method to create step buttons
    createStepButton(container, title, color, onClick, enabled = true) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'flex';
        buttonWrapper.style.flexDirection = 'column';
        buttonWrapper.style.gap = '5px';

        const button = document.createElement('button');
        button.textContent = title;
        button.style.padding = '12px 16px';
        button.style.backgroundColor = enabled ? color : '#6c757d';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = enabled ? 'pointer' : 'not-allowed';
        button.style.fontWeight = 'bold';
        button.style.opacity = enabled ? '1' : '0.7';
        button.style.transition = 'all 0.2s ease';
        button.disabled = !enabled;

        if (enabled) {
            const hoverColor = this.darkenColor(color, 10);

            button.addEventListener('mouseenter', function () {
                this.style.backgroundColor = hoverColor;
            });

            button.addEventListener('mouseleave', function () {
                this.style.backgroundColor = color;
            });

            // Use a regular function instead of an arrow function
            button.addEventListener('click', function () {
                onClick();
            });
        }

        buttonWrapper.appendChild(button);
        container.appendChild(buttonWrapper);

        return button;
    }

// Method to darken a color for button hover effects
    darkenColor(hex, percent) {
        // Remove # if present
        hex = hex.replace(/^#/, '');

        // Parse r, g, b values
        let r = parseInt(hex.substr(0, 2), 16);
        let g = parseInt(hex.substr(2, 2), 16);
        let b = parseInt(hex.substr(4, 2), 16);

        // Darken
        r = Math.floor(r * (100 - percent) / 100);
        g = Math.floor(g * (100 - percent) / 100);
        b = Math.floor(b * (100 - percent) / 100);

        // Ensure values are in range
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));

        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

// Method to get current milestone from board data
    getCurrentMilestone() {
        try {
            // Try to get milestone from board data
            const boardLists = document.querySelectorAll('.board-list');

            boardLists.forEach(boardList => {
                const boardItems = boardList.querySelectorAll('.board-card');

                boardItems.forEach(item => {
                    try {
                        if (item.__vue__ && item.__vue__.$children) {
                            const issue = item.__vue__.$children.find(child =>
                                child.$props && child.$props.item && child.$props.item.milestone);

                            if (issue && issue.$props.item && issue.$props.item.milestone && issue.$props.item.milestone.title) {
                                this.sprintState.currentMilestone = issue.$props.item.milestone.title;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing issue for milestone:', e);
                    }
                });
            });

            // If we found a milestone, save it
            if (this.sprintState.currentMilestone) {
                this.saveSprintState();
            }
        } catch (e) {
            console.error('Error getting current milestone:', e);
        }
    }

// Method to execute step 1: End Sprint
    endSprint() {
        try {
            const sprintData = this.calculateSprintData();
            const closedTickets = this.getClosedTickets();
            const userPerformance = this.calculateUserPerformance();

            // Generate a unique ID for this sprint
            const sprintId = Date.now().toString();

            // Save the current sprint state
            this.sprintState.id = sprintId;  // Add ID to the sprint state
            this.sprintState.endSprint = true;
            this.sprintState.totalTickets = sprintData.totalTickets;
            this.sprintState.closedTickets = closedTickets.length;
            this.sprintState.totalHours = sprintData.totalHours;
            this.sprintState.closedHours = sprintData.closedHours;
            this.sprintState.userPerformance = userPerformance;
            this.sprintState.timestamp = new Date().toISOString();

            // Save to localStorage
            this.saveSprintState();

            // Notify user
            this.notification.success('Sprint ended. Data captured successfully.');

            // Automatically start issue selection process
            if (this.uiManager && this.uiManager.issueSelector && typeof this.uiManager.issueSelector.startSelection === 'function') {
                // Switch to bulkcomments tab first if possible
                if (this.uiManager.tabManager && typeof this.uiManager.tabManager.switchToTab === 'function') {
                    this.uiManager.tabManager.switchToTab('bulkcomments');
                }

                // Start issue selection after a brief delay to allow tab switching
                setTimeout(() => {
                    this.uiManager.issueSelector.startSelection();
                }, 300);

                this.notification.info('Issue selection started. Please select issues to process.');
            }

            // Refresh the view
            this.render();
        } catch (error) {
            console.error('Error ending sprint:', error);
            this.notification.error('Failed to end sprint: ' + error.message);
        }
    }

// Method to execute step 2: Set Sprint Survivors
    prepareForNextSprint() {
        try {
            // Get current data
            const currentData = this.calculateSprintData();

            // Calculate the difference between saved total hours and current total hours
            // This represents work that carried over (survivors)
            const extraHoursClosed = Math.max(0, this.sprintState.totalHours - currentData.totalHours);

            // Archive the completed sprint before preparing for next
            this.archiveCompletedSprint();

            // Update sprint state
            this.sprintState.preparedForNext = true;
            this.sprintState.extraHoursClosed = extraHoursClosed;

            // Save to localStorage
            this.saveSprintState();

            // Notify and refresh
            this.notification.success(`Sprint preparation complete. ${extraHoursClosed}h of carried over work identified.`);
            this.render();
        } catch (error) {
            console.error('Error preparing for next sprint:', error);
            this.notification.error('Failed to prepare for next sprint: ' + error.message);
        }
    }

    editSprintData() {
        try {
            const formHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Total Tickets:</label>
                    <input type="number" id="edit-total-tickets" value="${this.sprintState.totalTickets || 0}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Closed Tickets:</label>
                    <input type="number" id="edit-closed-tickets" value="${this.sprintState.closedTickets || 0}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Total Hours:</label>
                    <input type="number" id="edit-total-hours" value="${this.sprintState.totalHours || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Closed Hours:</label>
                    <input type="number" id="edit-closed-hours" value="${this.sprintState.closedHours || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Extra Closed Hours:</label>
                    <input type="number" id="edit-extra-hours" value="${this.sprintState.extraHoursClosed || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
            </div>
        `;

            this.showModal('Edit Sprint Data', formHTML, () => {
                // Save the edited values
                this.sprintState.totalTickets = parseFloat(document.getElementById('edit-total-tickets').value) || 0;
                this.sprintState.closedTickets = parseFloat(document.getElementById('edit-closed-tickets').value) || 0;
                this.sprintState.totalHours = parseFloat(document.getElementById('edit-total-hours').value) || 0;
                this.sprintState.closedHours = parseFloat(document.getElementById('edit-closed-hours').value) || 0;
                this.sprintState.extraHoursClosed = parseFloat(document.getElementById('edit-extra-hours').value) || 0;

                // If data was entered but stages weren't set, set them now
                if (this.sprintState.totalTickets > 0 && !this.sprintState.endSprint) {
                    this.sprintState.endSprint = true;
                }

                if (this.sprintState.extraHoursClosed > 0 && !this.sprintState.survivorsSet) {
                    this.sprintState.survivorsSet = true;
                }
                if (this.sprintState.id && this.sprintHistory && this.sprintHistory.length > 0) {
                    const historyIndex = this.sprintHistory.findIndex(sprint => sprint.id === this.sprintState.id);

                    if (historyIndex >= 0) {
                        // Update the history record with the new values
                        this.sprintHistory[historyIndex].totalTickets = this.sprintState.totalTickets;
                        this.sprintHistory[historyIndex].closedTickets = this.sprintState.closedTickets;
                        this.sprintHistory[historyIndex].totalHours = this.sprintState.totalHours;
                        this.sprintHistory[historyIndex].closedHours = this.sprintState.closedHours;
                        this.sprintHistory[historyIndex].extraHoursClosed = this.sprintState.extraHoursClosed;

                        // Save the updated history
                        this.saveSprintHistory();
                        this.notification.info("Sprint data updated in history as well.");
                    }
                }
                this.saveSprintState();
                this.notification.success('Sprint data updated successfully.');
                this.render();
            });
        } catch (error) {
            console.error('Error editing sprint data:', error);
            this.notification.error('Failed to edit sprint data: ' + error.message);
        }
    }

// Method to show a modal dialog
    showModal(title, content, onSave) {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1000';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.cursor = 'pointer';

        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '500px';
        modalContent.style.maxWidth = '90%';

        const modalHeader = document.createElement('div');
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';

        const modalTitle = document.createElement('h3');
        modalTitle.style.margin = '0';
        modalTitle.textContent = title;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.padding = '0';
        closeBtn.style.lineHeight = '1';

        closeBtn.onclick = () => {
            document.body.removeChild(modalOverlay);
        };

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeBtn);

        const modalBody = document.createElement('div');
        modalBody.style.marginBottom = '20px';

        if (typeof content === 'string') {
            modalBody.innerHTML = content;
        } else {
            modalBody.appendChild(content);
        }

        const modalFooter = document.createElement('div');
        modalFooter.style.borderTop = '1px solid #eee';
        modalFooter.style.paddingTop = '15px';
        modalFooter.style.display = 'flex';
        modalFooter.style.justifyContent = 'flex-end';
        modalFooter.style.gap = '10px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.style.backgroundColor = '#6c757d';
        cancelBtn.style.color = 'white';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.cursor = 'pointer';

        cancelBtn.onclick = () => {
            document.body.removeChild(modalOverlay);
        };

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.padding = '8px 16px';
        saveBtn.style.backgroundColor = '#28a745';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.cursor = 'pointer';

        saveBtn.onclick = () => {
            if (typeof onSave === 'function') {
                onSave();
            }
            document.body.removeChild(modalOverlay);
        };

        modalFooter.appendChild(cancelBtn);
        modalFooter.appendChild(saveBtn);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modalContent.appendChild(modalFooter);

        modalOverlay.appendChild(modalContent);
        modalOverlay.addEventListener('click', (e) => {
            // Only close if the click was directly on the overlay (not its children)
            if (e.target === modalOverlay) {
                document.body.removeChild(modalOverlay);
            }
        });
        document.body.appendChild(modalOverlay);
    }

// Method to display current sprint data
    showSprintDataSummary(container) {
        const dataContainer = document.createElement('div');
        dataContainer.style.margin = '10px';
        dataContainer.style.padding = '15px';
        dataContainer.style.backgroundColor = '#f8f9fa';
        dataContainer.style.borderRadius = '6px';
        dataContainer.style.border = '1px solid #dee2e6';

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Current Sprint Data';
        titleEl.style.margin = '0 0 15px 0';
        titleEl.style.fontSize = '16px';

        dataContainer.appendChild(titleEl);

        const createDataRow = (label, value) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '8px';
            row.style.padding = '5px 0';
            row.style.borderBottom = '1px solid #eee';

            const labelEl = document.createElement('div');
            labelEl.textContent = label;
            labelEl.style.fontWeight = 'bold';

            const valueEl = document.createElement('div');
            valueEl.textContent = value;

            row.appendChild(labelEl);
            row.appendChild(valueEl);

            return row;
        };

        const {
            totalTickets = 0,
            closedTickets = 0,
            totalHours = 0,
            closedHours = 0,
            extraHoursClosed = 0,
            timestamp
        } = this.sprintState;

        dataContainer.appendChild(createDataRow('Total Tickets:', totalTickets));
        dataContainer.appendChild(createDataRow('Closed Tickets:', closedTickets));
        dataContainer.appendChild(createDataRow('Total Hours:', totalHours + 'h'));
        dataContainer.appendChild(createDataRow('Closed Hours:', closedHours + 'h'));

        if (extraHoursClosed > 0) {
            dataContainer.appendChild(createDataRow('Extra Hours Closed:', extraHoursClosed + 'h'));
            dataContainer.appendChild(createDataRow('Total Hours Closed:', (closedHours + extraHoursClosed) + 'h'));
        }

        if (timestamp) {
            const date = new Date(timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            dataContainer.appendChild(createDataRow('Captured On:', formattedDate));
        }

        container.appendChild(dataContainer);
    }

// Method to save sprint state to localStorage
    saveSprintState() {
        try {
            localStorage.setItem('gitLabHelperSprintState', JSON.stringify(this.sprintState));
        } catch (error) {
            console.error('Failed to save sprint state to localStorage:', error);
            this.notification.error('Failed to save sprint state');
        }
    }

// Method to load sprint state from localStorage
    loadSprintState() {
        try {
            const saved = localStorage.getItem('gitLabHelperSprintState');
            if (saved) {
                this.sprintState = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load sprint state from localStorage:', error);
            this.notification.error('Failed to load sprint state');
        }
    }

    calculateUserPerformance() {
        const userPerformance = {};

        try {
            const boardLists = document.querySelectorAll('.board-list');

            boardLists.forEach(boardList => {
                let boardTitle = '';

                try {
                    if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                        const boardComponent = boardList.__vue__.$children.find(child =>
                            child.$props && child.$props.list && child.$props.list.title);

                        if (boardComponent && boardComponent.$props.list.title) {
                            boardTitle = boardComponent.$props.list.title.toLowerCase();
                        }
                    }

                    if (!boardTitle) {
                        const boardHeader = boardList.querySelector('.board-title-text');
                        if (boardHeader) {
                            boardTitle = boardHeader.textContent.trim().toLowerCase();
                        }
                    }
                } catch (e) {
                    console.error('Error getting board title:', e);
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }

                // Check if this is a closed/done board
                const isClosedBoard = boardTitle.includes('done') ||
                    boardTitle.includes('closed') ||
                    boardTitle.includes('complete') ||
                    boardTitle.includes('finished');

                // Process all cards in this board
                const boardCards = boardList.querySelectorAll('.board-card');

                boardCards.forEach(card => {
                    try {
                        if (card.__vue__ && card.__vue__.$children) {
                            const issue = card.__vue__.$children.find(child =>
                                child.$props && child.$props.item);

                            if (issue && issue.$props && issue.$props.item) {
                                const item = issue.$props.item;

                                // Get assignees
                                let assignees = [];
                                if (item.assignees && item.assignees.nodes && item.assignees.nodes.length) {
                                    assignees = item.assignees.nodes;
                                } else if (item.assignees && item.assignees.length > 0) {
                                    assignees = item.assignees;
                                }

                                // Skip if no assignees
                                if (assignees.length === 0) {
                                    return;
                                }

                                // Calculate time per assignee
                                const timeEstimate = item.timeEstimate || 0;
                                const timePerAssignee = timeEstimate / assignees.length;

                                // Record for each assignee
                                assignees.forEach(assignee => {
                                    const name = assignee.name || assignee.username || 'Unknown';

                                    if (!userPerformance[name]) {
                                        userPerformance[name] = {
                                            totalTickets: 0,
                                            closedTickets: 0,
                                            totalHours: 0,
                                            closedHours: 0
                                        };
                                    }

                                    // Count ticket
                                    userPerformance[name].totalTickets++;

                                    // Add time estimate (in hours)
                                    userPerformance[name].totalHours += timePerAssignee / 3600;

                                    // If in closed board, count as closed
                                    if (isClosedBoard) {
                                        userPerformance[name].closedTickets++;
                                        userPerformance[name].closedHours += timePerAssignee / 3600;
                                    }
                                });
                            }
                        }
                    } catch (err) {
                        console.error('Error processing card for user performance:', err);
                    }
                });
            });

            // Round all hour values to one decimal place
            Object.keys(userPerformance).forEach(user => {
                userPerformance[user].totalHours = Math.round(userPerformance[user].totalHours * 10) / 10;
                userPerformance[user].closedHours = Math.round(userPerformance[user].closedHours * 10) / 10;
            });
        } catch (error) {
            console.error('Error calculating user performance:', error);
        }

        return userPerformance;
    }

    archiveCompletedSprint() {
        try {
            // Only archive if we have data to archive
            if (!this.sprintState.endSprint || !this.sprintState.timestamp) {
                return;
            }

            // Create archive entry
            const archiveEntry = {
                id: this.sprintState.id || Date.now().toString(), // Use existing ID or create new one
                milestone: this.sprintState.currentMilestone,
                totalTickets: this.sprintState.totalTickets,
                closedTickets: this.sprintState.closedTickets,
                totalHours: this.sprintState.totalHours,
                closedHours: this.sprintState.closedHours,
                extraHoursClosed: this.sprintState.extraHoursClosed || 0,
                userPerformance: this.sprintState.userPerformance || {},
                userDistributions: this.sprintState.userDistributions || {}, // Add this
                timestamp: this.sprintState.timestamp,
                completedAt: new Date().toISOString()
            };

            // Add to history
            this.sprintHistory.unshift(archiveEntry); // Add to beginning of array

            // Keep a reasonable history size (last 10 sprints)
            if (this.sprintHistory.length > 10) {
                this.sprintHistory = this.sprintHistory.slice(0, 10);
            }

            // Save history
            this.saveSprintHistory();
        } catch (error) {
            console.error('Error archiving sprint:', error);
        }
    }

    saveSprintHistory() {
        try {
            localStorage.setItem('gitLabHelperSprintHistory', JSON.stringify(this.sprintHistory));
        } catch (error) {
            console.error('Failed to save sprint history to localStorage:', error);
            this.notification.error('Failed to save sprint history');
        }
    }

    loadSprintHistory() {
        try {
            const saved = localStorage.getItem('gitLabHelperSprintHistory');
            if (saved) {
                this.sprintHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load sprint history from localStorage:', error);
            this.notification.error('Failed to load sprint history');
            this.sprintHistory = [];
        }
    }

    renderSprintHistory(container) {
        // Skip if no history
        if (!this.sprintHistory || this.sprintHistory.length === 0) {
            return;
        }

        const historySection = document.createElement('div');
        historySection.style.margin = '10px';
        historySection.style.padding = '15px';
        historySection.style.backgroundColor = '#f8f9fa';
        historySection.style.borderRadius = '6px';
        historySection.style.border = '1px solid #dee2e6';

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Sprint History';
        titleEl.style.margin = '0 0 15px 0';
        titleEl.style.fontSize = '16px';

        historySection.appendChild(titleEl);

        // Create table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        ['Sprint', 'Tickets', 'Hours', 'Completed'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.padding = '8px';
            th.style.textAlign = 'left';
            th.style.borderBottom = '2px solid #dee2e6';
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');

        this.sprintHistory.forEach(sprint => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #dee2e6';
            row.style.transition = 'background-color 0.2s';
            row.style.cursor = 'pointer';  // Make the entire row look clickable

            row.addEventListener('mouseenter', () => {
                row.style.backgroundColor = '#f1f1f1';
            });

            row.addEventListener('mouseleave', () => {
                row.style.backgroundColor = '';
            });

            row.addEventListener('click', () => {
                this.showSprintDetails(sprint);
            });

            // Sprint name/milestone - now clickable
            const tdMilestone = document.createElement('td');
            tdMilestone.style.padding = '8px';
            tdMilestone.textContent = sprint.milestone || 'Unnamed Sprint';
            tdMilestone.style.color = '#1f75cb';  // Make it look like a link
            tdMilestone.style.fontWeight = 'bold';
            row.appendChild(tdMilestone);

            // Tickets
            const tdTickets = document.createElement('td');
            tdTickets.style.padding = '8px';
            tdTickets.textContent = `${sprint.closedTickets}/${sprint.totalTickets}`;
            row.appendChild(tdTickets);

            // Hours
            const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
            const tdHours = document.createElement('td');
            tdHours.style.padding = '8px';
            tdHours.textContent = `${totalClosedHours}/${sprint.totalHours}h`;
            row.appendChild(tdHours);

            // Completion date
            const tdDate = document.createElement('td');
            tdDate.style.padding = '8px';
            const date = new Date(sprint.completedAt || sprint.timestamp);
            tdDate.textContent = date.toLocaleDateString();
            row.appendChild(tdDate);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        historySection.appendChild(table);
        container.appendChild(historySection);
    }

    showSprintDetails(sprint) {
        const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
        const ticketCompletion = sprint.totalTickets > 0
            ? (sprint.closedTickets / sprint.totalTickets * 100)
            : 0;
        const hourCompletion = sprint.totalHours > 0
            ? (totalClosedHours / sprint.totalHours * 100)
            : 0;

        // Format dates
        const startDate = new Date(sprint.timestamp);
        const endDate = new Date(sprint.completedAt || sprint.timestamp);

        // Create content for the modal
        let content = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: #1f75cb;">${sprint.milestone || 'Unnamed Sprint'}</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                    <h4 style="margin-top: 0; font-size: 14px;">Tickets</h4>
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                        ${sprint.closedTickets}/${sprint.totalTickets}
                    </div>
                    <div style="font-size: 14px; color: #6c757d;">
                        ${ticketCompletion.toFixed(2)}% completed
                    </div>
                </div>
                
                <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                    <h4 style="margin-top: 0; font-size: 14px;">Hours</h4>
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                        ${totalClosedHours}/${sprint.totalHours}h
                    </div>
                    <div style="font-size: 14px; color: #6c757d;">
                        ${hourCompletion.toFixed(2)}% completed
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="margin-bottom: 10px; font-size: 16px;">Sprint Details</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Started:</td>
                        <td style="padding: 8px;">${startDate.toLocaleString()}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Completed:</td>
                        <td style="padding: 8px;">${endDate.toLocaleString()}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Carried Over Hours:</td>
                        <td style="padding: 8px;">${(sprint.extraHoursClosed || 0)}h</td>
                    </tr>
                </table>
            </div>
    `;

        // Add user performance if available
        if (sprint.userPerformance && Object.keys(sprint.userPerformance).length > 0) {
            content += `
            <div>
                <h4 style="margin-bottom: 10px; font-size: 16px;">User Performance</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 8px; text-align: left;">User</th>
                            <th style="padding: 8px; text-align: center;">Tickets</th>
                            <th style="padding: 8px; text-align: center;">Completion</th>
                            <th style="padding: 8px; text-align: right;">Hours</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

            // Sort users by hours completed
            const sortedUsers = Object.entries(sprint.userPerformance)
                .sort(([, a], [, b]) => b.closedHours - a.closedHours);

            sortedUsers.forEach(([name, data]) => {
                const userTicketCompletion = data.totalTickets > 0
                    ? (data.closedTickets / data.totalTickets * 100).toFixed(0)
                    : 0;

                content += `
                <tr style="border-bottom: 1px solid #dee2e6;">
                    <td style="padding: 8px;">${name}</td>
                    <td style="padding: 8px; text-align: center;">${data.closedTickets}/${data.totalTickets}</td>
                    <td style="padding: 8px; text-align: center;">${userTicketCompletion}%</td>
                    <td style="padding: 8px; text-align: right;">${data.closedHours}/${data.totalHours}h</td>
                </tr>
            `;
            });

            content += `
                    </tbody>
                </table>
            </div>
        `;
        }

        content += '</div>';

        // Show the modal with sprint details
        this.showModal(`Sprint Details: ${sprint.milestone || 'Unnamed Sprint'}`, content);
    }
}

// File: lib/ui/views/BulkCommentsView.js
window.BulkCommentsView = class BulkCommentsView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssues = []; // Store selected issues
        this.commandShortcuts = null; // Will be initialized when Bulk Comments tab is rendered
        this.isLoading = false;
        this.initializedShortcuts = new Set(); // Track which shortcuts have been initialized
        this.commentInput = null; // Store reference to textarea element
        this.gitlabApi = window.gitlabApi || (uiManager && uiManager.gitlabApi);
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        this.fetchedMembers = [];
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else if (typeof LabelManager === 'function') {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    if (this.commandShortcuts) {
                        this.addLabelShortcut();
                    }
                }
            });
        } else {
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([])
            };
        }
        this.selectionDisplay = new SelectionDisplay({
            selectedIssues: this.selectedIssues,
            onRemoveIssue: (index) => this.onRemoveIssue(index)
        });
    }

    
    updateAssignShortcut(items) {
        if (!this.commandShortcuts) {
            console.error("Cannot update assign shortcut: commandShortcuts not available");
            return;
        }
        if (!items || items.length <= 3) {
            console.warn("Not updating assign shortcut: no meaningful items to add");
            return;
        }

        try {
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['assign'].dropdown.value;
            }
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign']) {
                this.commandShortcuts.removeShortcut('assign');
            }
            this.commandShortcuts.addCustomShortcut({
                type: 'assign',
                label: '/assign',
                items: items,
                toggleMode: true, // Enable toggle mode
                onSelect: (value, mode) => {
                    if (!value || value === 'separator' || value === 'separator2') return;

                    if (value === 'manage') {
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

                    // Use mode parameter to determine command
                    let assignText;
                    if (mode === 'remove') {
                        assignText = `/unassign `;
                        if (value === 'none') {
                            // This doesn't make sense in remove mode, so just use @none
                            assignText += '@none';
                        } else if (value === '@me') {
                            assignText += '@me';
                        } else {
                            assignText += value.startsWith('@') ? value : `@${value}`;
                        }
                    } else {
                        assignText = `/assign `;
                        if (value === 'none') {
                            assignText += '@none';
                        } else if (value === '@me') {
                            assignText += '@me';
                        } else {
                            assignText += value.startsWith('@') ? value : `@${value}`;
                        }
                    }

                    this.insertTextAtCursor(textarea, assignText);

                    // Notification based on mode and value
                    if (mode === 'remove') {
                        if (value === 'none') {
                            this.notification.info('Issue will be unassigned from everyone');
                        } else if (value === '@me') {
                            this.notification.info('Issue will be unassigned from you');
                        } else {
                            this.notification.info(`Issue will be unassigned from ${value.replace('@', '')}`);
                        }
                    } else {
                        if (value === 'none') {
                            this.notification.info('Issue will be unassigned');
                        } else if (value === '@me') {
                            this.notification.info('Issue will be assigned to you');
                        } else {
                            this.notification.info(`Issue will be assigned to ${value.replace('@', '')}`);
                        }
                    }
                }
            });
            if (currentValue && this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                this.commandShortcuts.shortcuts['assign'].dropdown.value = currentValue;
            }
        } catch (e) {
            console.error('Error updating assign shortcut:', e);
        }
    }

    
    initializeAllShortcuts() {
        if (!this.commandShortcuts) return;

        try {
            const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
            const addedShortcuts = new Set(Object.keys(this.commandShortcuts.shortcuts || {}));
            if (!addedShortcuts.has('estimate')) {
                this.commandShortcuts.initializeEstimateShortcut();
                addedShortcuts.add('estimate');
            }
            if (!addedShortcuts.has('label')) {
                this.addLabelShortcut([
                    {value: '', label: 'Loading labels...'}
                ]);
                addedShortcuts.add('label');
            }
            if (!addedShortcuts.has('milestone')) {
                this.addMilestoneShortcut();
                addedShortcuts.add('milestone');
            }
            if (!addedShortcuts.has('assign')) {
                this.addAssignShortcut();
                addedShortcuts.add('assign');
            }
        } catch (e) {
            console.error('Error initializing shortcuts:', e);
            this.notification.error('Error initializing shortcuts');
        }
    }

    
    addMilestoneShortcut() {
        if (!this.commandShortcuts) return;

        try {
            this.commandShortcuts.addCustomShortcut({
                type: 'milestone',
                label: '/milestone',
                items: [
                    {value: '', label: 'Set Milestone'},
                    {value: '%current', label: 'Current Sprint'},
                    {value: '%next', label: 'Next Sprint'},
                    {value: '%upcoming', label: 'Upcoming'},
                    {value: 'none', label: 'Remove Milestone'},
                    {value: 'custom', label: 'Custom...'}
                ],
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customMilestone = prompt('Enter milestone name:');
                        if (!customMilestone) return;
                        value = customMilestone;
                    }
                    if (!this.commentInput) {
                        console.warn('Comment input not available');
                        return;
                    }
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

    
    addAssignShortcut() {
        if (!this.commandShortcuts) return;
        let assignItems = [

            {value: '', label: 'Assign to...'}
        ];
        let directWhitelist = null;
        try {
            if (typeof GM_getValue === 'function') {
                directWhitelist = GM_getValue('gitLabHelperAssigneeWhitelist', []);
            }
        } catch (e) {
            console.error("Error accessing GM_getValue:", e);
        }

        if (Array.isArray(directWhitelist) && directWhitelist.length > 0) {
            const whitelistItems = directWhitelist.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
            }));

            assignItems = assignItems.concat(whitelistItems);
        } else {
            let assignees = [];
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = this.assigneeManager.getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from this.assigneeManager:", e);
                }
            }
            if ((!assignees || !assignees.length) && window.assigneeManager &&
                typeof window.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.assigneeManager.getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from window.assigneeManager:", e);
                }
            }
            if ((!assignees || !assignees.length) && typeof getAssigneeWhitelist === 'function') {
                try {
                    assignees = getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from imported getAssigneeWhitelist:", e);
                }
            }
            if ((!assignees || !assignees.length) && typeof window.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from window.getAssigneeWhitelist:", e);
                }
            }
            if (!assignees || !assignees.length) {
                try {
                    const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
                    if (storedValue) {
                        assignees = JSON.parse(storedValue);
                    }
                } catch (e) {
                    console.error("Error getting assignees from localStorage:", e);
                }
            }
            if (Array.isArray(assignees) && assignees.length > 0) {
                const whitelistItems = assignees.map(assignee => ({
                    value: assignee.username,
                    label: assignee.name || assignee.username
                }));

                assignItems = assignItems.concat(whitelistItems);
            } else {
                console.warn("Could not find any assignees through any method");
            }
        }


        this.updateAssignShortcut(assignItems);
        setTimeout(() => {
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        const updatedItems = [...assignItems];
                        updatedItems.push({value: 'separator2', label: '────── Group Members ──────'});
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
                            this.updateAssignShortcut(updatedItems);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error fetching group members:', error);
                });
        }, 100);
        assignItems.push({value: 'separator', label: '────── Other ──────'});
        assignItems.push({value: '@me', label: 'Myself'});
        assignItems.push({value: 'none', label: 'Unassign'});
    }


    

    async fetchGroupMembers() {
        try {
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                throw new Error('GitLab API not available');
            }
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }
            let members;
            if (pathInfo.type === 'project') {
                members = await this.gitlabApi.callGitLabApiWithCache(
                    `projects/${pathInfo.encodedPath}/members/all`,
                    {params: {per_page: 100, all_available: true}}
                );
            } else if (pathInfo.type === 'group') {
                members = await this.gitlabApi.callGitLabApiWithCache(
                    `groups/${pathInfo.encodedPath}/members/all`,
                    {params: {per_page: 100, all_available: true}}
                );
            } else {
                throw new Error('Unsupported path type: ' + pathInfo.type);
            }

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members');
                return [];
            }

            // Store the fetched members in a class property so other components can access it
            this.fetchedMembers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            return this.fetchedMembers;
        } catch (error) {
            console.error('Error fetching group members:', error);
            return [];
        }
    }

    
    setSelectedIssues(issues) {
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }
        // Remove the status element update
    }

    
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            const removedIssue = this.selectedIssues[index];
            this.selectedIssues.splice(index, 1);

            // Update the issue selector if available
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.issueSelector) {
                window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }

            // Update status message
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

            // Make sure we update our local selection display if available
            if (this.selectionDisplay) {
                this.selectionDisplay.setSelectedIssues([...this.selectedIssues]);
            }
        }
    }

    
    createActionButtons(container) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';
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
        selectBtn.addEventListener('mouseenter', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#218838' : '#5a6268';
        });
        selectBtn.addEventListener('mouseleave', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#28a745' : '#6c757d';
        });

        selectBtn.onclick = () => {
            if (this.uiManager && this.uiManager.issueSelector) {
                if (this.uiManager.issueSelector.isSelectingIssue) {
                    this.uiManager.issueSelector.exitSelectionMode();
                    selectBtn.dataset.active = 'false';
                    selectBtn.style.backgroundColor = '#6c757d'; // Gray when inactive
                    selectBtn.textContent = 'Select';
                } else {
                    this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    this.uiManager.issueSelector.startSelection();
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

    
    clearSelectedIssues() {
        // First, make sure we're working with the right object
        console.log('Current selectedIssues:', this.selectedIssues);

        // Clear the array with proper Vue reactivity
        this.selectedIssues.splice(0, this.selectedIssues.length);

        // Alternative approach - assign a new empty array
        this.selectedIssues = [];

        // Check if selectionDisplay exists and has the method
        if (this.selectionDisplay && typeof this.selectionDisplay.setSelectedIssues === 'function') {
            console.log('Calling selectionDisplay.setSelectedIssues with empty array');
            this.selectionDisplay.setSelectedIssues([]);
        } else {
            console.warn('selectionDisplay not available or missing setSelectedIssues method');
            // Try to find it if not available
            if (this.uiManager && this.uiManager.bulkCommentsView &&
                this.uiManager.bulkCommentsView.selectionDisplay) {
                console.log('Found selectionDisplay through uiManager');
                this.uiManager.bulkCommentsView.selectionDisplay.setSelectedIssues([]);
            }
        }

        // Set status message
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }

        // Show notification
        if (this.notification) {
            this.notification.info('Selection cleared');
        }

        // Also try to clear selection in issueSelector if available
        if (this.uiManager && this.uiManager.issueSelector) {
            console.log('Clearing selection in issueSelector');
            this.uiManager.issueSelector.setSelectedIssues([]);
        }

        // Force a component update
        if (typeof this.$forceUpdate === 'function') {
            this.$forceUpdate();
        }

        console.log('Selection cleared, current selectedIssues:', this.selectedIssues);
    }

    
    render() {
        const bulkCommentsContent = document.getElementById('bulk-comments-content');
        if (!bulkCommentsContent) return;
        bulkCommentsContent.innerHTML = '';
        this.addCommentSection(bulkCommentsContent);
        if (this.commandShortcuts) {
            this.initializeAllShortcuts();
            this.isLoading = true;
            if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                this.labelManager.fetchAllLabels()
                    .then(labels => {
                        this.addLabelShortcut();
                        this.isLoading = false;
                        this.hideLoadingState();
                        if (this.uiManager && this.uiManager.removeLoadingScreen) {
                            this.uiManager.removeLoadingScreen('bulkcomments-tab');
                        }
                    })
                    .catch(error => {
                        console.error('Error loading labels:', error);
                        this.addLabelShortcut(this.getFallbackLabels());
                        this.isLoading = false;
                        this.hideLoadingState();
                        if (this.uiManager && this.uiManager.removeLoadingScreen) {
                            this.uiManager.removeLoadingScreen('bulkcomments-tab');
                        }
                    });
            } else {
                console.warn('Label manager not available, using fallback labels');
                this.addLabelShortcut(this.getFallbackLabels());
                this.isLoading = false;
                this.hideLoadingState();
                if (this.uiManager && this.uiManager.removeLoadingScreen) {
                    this.uiManager.removeLoadingScreen('bulkcomments-tab');
                }
            }
        } else {
            console.error('Command shortcuts not initialized');
            this.isLoading = false;
            this.hideLoadingState();
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
        }
    }

    
    addCommentSection(container) {
        const commentSection = document.createElement('div');
        commentSection.classList.add('api-section');
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '8px';
        commentSection.style.border = '1px solid #e0e0e0';
        this.selectionDisplay.createSelectionContainer(commentSection);
        this.createCommentInput(commentSection);
        this.createActionButtons(commentSection);
        this.createStatusElements(document.getElementById("assignee-time-summary"));
        this.isLoading = true;
        this.showLoadingState();
        try {
            if (this.commentInput && this.commandShortcuts) {
                this.initializeAllShortcuts();
                this.addLabelShortcut([
                    {value: '', label: 'Loading labels...'}
                ]);
                if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                    this.labelManager.fetchAllLabels()
                        .then(labels => {
                            this.addLabelShortcut();
                            this.isLoading = false;
                            this.hideLoadingState();
                        })
                        .catch(error => {
                            console.error('Error loading labels:', error);
                            this.addLabelShortcut(this.getFallbackLabels());
                            this.isLoading = false;
                            this.hideLoadingState();
                        });
                } else {
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


    
    getFallbackLabels() {
        return [
            {value: '', label: 'Add Label'},
            {value: 'bug', label: 'Bug'},
            {value: 'feature', label: 'Feature'},
            {value: 'enhancement', label: 'Enhancement'},
            {value: 'documentation', label: 'Documentation'},
            {value: 'custom', label: 'Custom...'}
        ];
    }

    
    createCommentInput(container) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.id = 'shortcuts-wrapper';
        shortcutsWrapper.style.width = '100%';
        shortcutsWrapper.style.marginBottom = '15px';
        shortcutsWrapper.style.minHeight = '120px'; // Set a fixed minimum height that accommodates all shortcuts
        shortcutsWrapper.style.position = 'relative'; // Important for stable layout
        const placeholderShortcuts = document.createElement('div');
        placeholderShortcuts.style.opacity = '0.4';
        placeholderShortcuts.style.pointerEvents = 'none';
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
        commentInput.addEventListener('focus', () => {
            commentInput.style.borderColor = '#1f75cb';
            commentInput.style.outline = 'none';
            commentInput.style.boxShadow = '0 0 0 2px rgba(31, 117, 203, 0.2)';
        });

        commentInput.addEventListener('blur', () => {
            commentInput.style.borderColor = '#ccc';
            commentInput.style.boxShadow = 'none';
        });
        container.appendChild(commentInput);
        this.commentInput = commentInput;
        try {
            if (typeof CommandShortcut === 'function') {
                this.commandShortcuts = new CommandShortcut({
                    targetElement: commentInput,
                    onShortcutInsert: (type, value) => {
                    }
                });
                this.commandShortcuts.initialize(shortcutsWrapper);
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


    
    insertTextAtCursor(textarea, text) {
        if (!textarea) return;
        const currentText = textarea.value;
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }
        textarea.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);
        const newCursorPos = startPos + insertText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    }

    
    createStatusElements(container) {
        // Remove the status message element completely

        const progressContainer = document.createElement('div');
        progressContainer.id = 'comment-progress-container';
        progressContainer.style.display = 'none';
        progressContainer.style.marginTop = '15px';
        progressContainer.style.color = 'white';

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
        progressBarOuter.style.backgroundColor = 'black';
        progressBarOuter.style.overflow = 'hidden';
        progressBarOuter.style.boxShadow = 'inset 0 1px 3px rgba(255,255,255,0.1)';

        const progressBarInner = document.createElement('div');
        progressBarInner.id = 'comment-progress-bar';
        progressBarInner.style.height = '100%';
        progressBarInner.style.width = '0%';
        progressBarInner.style.backgroundColor = '#00ff2ac7';
        progressBarInner.style.transition = 'width 0.3s ease';

        progressBarOuter.appendChild(progressBarInner);
        progressContainer.appendChild(progressBarOuter);
        container.appendChild(progressContainer);
    }

    
    showLoadingState() {
        // Remove the reference to statusEl since we're no longer using it

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.label) {
            this.addLabelShortcut([
                {value: '', label: 'Loading labels...'}
            ]);
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.milestone) {
            this.addMilestoneShortcut();
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.assign) {
            this.addAssignShortcut();
        }
        if (this.commentInput) {
            this.commentInput.disabled = true;
            this.commentInput.style.backgroundColor = '#f9f9f9';
        }
    }

    
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
        const commentInput = document.getElementById('issue-comment-input');
        if (commentInput) {
            commentInput.disabled = false;
            commentInput.style.opacity = '1';
            commentInput.style.cursor = 'text';
        }
        const buttons = document.querySelectorAll('.api-section button');
        buttons.forEach(button => {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        });
    }

    async submitComments() {
        if (!this.commentInput) {
            this.notification.error('Comment input not found');
            return;
        }

        // Remove references to the status element
        const progressContainer = document.getElementById('comment-progress-container');
        const progressBar = document.getElementById('comment-progress-bar');
        const progressLabel = document.getElementById('comment-progress-label');

        if (this.selectedIssues.length === 0) {
            this.notification.error('No issues selected');
            return;
        }

        const comment = this.commentInput.value.trim();
        if (!comment) {
            this.notification.error('Comment cannot be empty');
            return;
        }
        let fullUILoadingScreen;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            const mainContainer = document.getElementById('assignee-time-summary');
            if (mainContainer) {
                const containerPosition = window.getComputedStyle(mainContainer).position;
                if (containerPosition === 'static') {
                    mainContainer.style.position = 'relative';
                    mainContainer.dataset.originalPosition = containerPosition;
                }
                fullUILoadingScreen = this.uiManager.addLoadingScreen(
                    mainContainer,
                    'comment-submit',
                    `Sending comments to ${this.selectedIssues.length} issues...`
                );
            }
        }

        if (progressContainer) {
            progressContainer.style.display = 'block';
            progressContainer.style.position = 'absolute';
            progressContainer.style.left = 0;
            progressContainer.style.right = 0;
            progressContainer.style.bottom = 0;
            progressContainer.style.zIndex = 102;
        }

        if (progressBar) {
            progressBar.style.width = '0%';
        }
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent && b.textContent.includes('Send'));

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        let successCount = 0;
        let failCount = 0;
        const gitlabApi = this.gitlabApi || window.gitlabApi || (this.uiManager && this.uiManager.gitlabApi);

        if (!gitlabApi) {
            this.notification.error('GitLab API not available');

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }

            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
            if (this.uiManager && this.uiManager.removeLoadingScreen && fullUILoadingScreen) {
                this.uiManager.removeLoadingScreen('comment-submit');
            }

            return;
        }
        for (let i = 0; i < this.selectedIssues.length; i++) {
            const issue = this.selectedIssues[i];
            if (!issue) {
                failCount++;
                continue;
            }
            const progress = Math.round((i / this.selectedIssues.length) * 100);
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            if (progressLabel) {
                progressLabel.textContent = `Processing ${i + 1} of ${this.selectedIssues.length} issues...`;
            }
            if (this.uiManager && this.uiManager.updateLoadingMessage) {
                this.uiManager.updateLoadingMessage(
                    'comment-submit',
                    `Sending comment to issue #${issue.iid || i + 1} (${i + 1}/${this.selectedIssues.length})...`
                );
            }

            try {
                await gitlabApi.addComment(issue, comment);
                successCount++;
            } catch (error) {
                console.error(`Failed to add comment to issue #${issue.iid}:`, error);
                failCount++;
            }
        }
        if (progressBar) {
            progressBar.style.width = '100%';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
        if (successCount === this.selectedIssues.length) {
            this.notification.success(`Added comment to ${successCount} issues`);
            if (this.commentInput) {
                this.commentInput.value = '';
            }
            let that = this

            this.refreshBoard().then(function () {
                progressContainer.style.display = 'none';
                that.clearSelectedIssues();
                that.uiManager.issueSelector.exitSelectionMode();
                that.uiManager.removeLoadingScreen('comment-submit');
            })
        } else {
            if (successCount > 0) {
                this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);

                this.refreshBoard().then(function () {
                    progressContainer.style.display = 'none';
                    that.clearSelectedIssues();
                    that.uiManager.issueSelector.exitSelectionMode();
                    that.uiManager.removeLoadingScreen('comment-submit');
                });

            } else {
                this.notification.error(`Failed to add comments to all ${failCount} issues`);
            }
            if (progressBar) {
                progressBar.style.backgroundColor = successCount > 0 ? '#ff9900' : '#dc3545';
            }
        }
    }

    
    addLabelShortcut(customLabels) {
        if (!this.commandShortcuts) return;

        try {
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['label'].dropdown.value;
            }
            let labelItems;

            if (customLabels) {
                labelItems = customLabels;
            } else if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
                labelItems = [{value: '', label: 'Add Label'}];
                const labels = this.labelManager.filteredLabels.map(label => ({
                    value: label.name,
                    label: label.name
                }));

                labelItems = labelItems.concat(labels);
                labelItems.push({value: 'custom', label: 'Custom...'});
            } else {
                try {
                    const whitelist = getLabelWhitelist();
                    if (whitelist && whitelist.length > 0) {
                        labelItems = [{value: '', label: 'Add Label'}];
                        const whitelistItems = whitelist.map(term => ({
                            value: term,
                            label: term
                        }));

                        labelItems = labelItems.concat(whitelistItems);
                        labelItems.push({value: 'custom', label: 'Custom...'});
                    } else {
                        labelItems = this.getFallbackLabels();
                    }
                } catch (e) {
                    console.error('Error getting label whitelist:', e);
                    labelItems = this.getFallbackLabels();
                }
            }
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label']) {
                this.commandShortcuts.removeShortcut('label');
            }
            this.commandShortcuts.addCustomShortcut({
                type: 'label',
                label: '/label',
                items: labelItems,
                toggleMode: true, // Enable toggle mode
                onSelect: (value, mode) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customLabel = prompt('Enter custom label name:');
                        if (!customLabel) return;
                        value = customLabel;
                    }

                    const textarea = document.getElementById('issue-comment-input');
                    if (!textarea) return;

                    let labelText;

                    // Use mode parameter to determine whether to add or remove
                    if (mode === 'remove') {
                        labelText = `/unlabel ~"${value}"`;
                    } else {
                        labelText = `/label ~"${value}"`;
                    }

                    this.insertTextAtCursor(textarea, labelText);

                    if (mode === 'remove') {
                        this.notification.info(`Label removal command added: ${value}`);
                    } else {
                        this.notification.info(`Label added: ${value}`);
                    }
                }
            });
            if (currentValue && this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                this.commandShortcuts.shortcuts['label'].dropdown.value = currentValue;
            }
        } catch (e) {
            console.error('Error adding label shortcut:', e);
        }
    }

    
    async refreshBoard() {
        try {
            // Find all board lists
            const boardLists = document.querySelectorAll('.board-list-component');
            console.log(`Found ${boardLists.length} board lists to refresh`);

            // Create an array to hold all the refetch promises
            const refetchPromises = [];

            // Add each refetch operation to the array (don't await them individually)
            for (const list of boardLists) {
                if (list.__vue__ && list.__vue__.$apollo && list.__vue__.$apollo.queries.currentList) {
                    const refetchPromise = list.__vue__.$apollo.queries.currentList.refetch();
                    refetchPromises.push(refetchPromise);
                }
            }

            // Wait for ALL refetch operations to complete
            await Promise.all(refetchPromises);

            // Now that ALL boards are refreshed, apply overflow fixes and update summary
            console.log("All boards refreshed, applying overflow fixes and updating summary");

            if (window.uiManager && window.uiManager.issueSelector) {
                window.uiManager.issueSelector.applyOverflowFixes();
            }

            if (typeof window.updateSummary === 'function') {
                window.updateSummary(true);
            }

            console.log("Board refresh and updates complete");
            return true;

        } catch (error) {
            console.error("Error refreshing boards:", error);
            return false;
        }
    }
}

// File: lib/ui/views/StatsView.js

window.StatsView = class StatsView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.notification = null;
        try {
            // Import Notification if available
            if (typeof Notification === 'function') {
                this.notification = new Notification({
                    position: 'bottom-right',
                    duration: 3000
                });
            }
        } catch (e) {
            console.error('Error initializing notification:', e);
        }
    }

    
    render() {
        const statsContent = document.getElementById('stats-content');
        if (!statsContent) return;

        statsContent.innerHTML = '';

        // Create a coming soon message
        const comingSoonContainer = document.createElement('div');
        comingSoonContainer.style.display = 'flex';
        comingSoonContainer.style.flexDirection = 'column';
        comingSoonContainer.style.alignItems = 'center';
        comingSoonContainer.style.justifyContent = 'center';
        comingSoonContainer.style.height = '100%';
        comingSoonContainer.style.padding = '40px 20px';
        comingSoonContainer.style.textAlign = 'center';

        const soonIcon = document.createElement('div');
        soonIcon.innerHTML = '🔍';
        soonIcon.style.fontSize = '48px';
        soonIcon.style.marginBottom = '20px';

        const soonTitle = document.createElement('h3');
        soonTitle.textContent = 'Statistics Coming Soon';
        soonTitle.style.marginBottom = '15px';
        soonTitle.style.color = '#1f75cb';

        const soonDesc = document.createElement('p');
        soonDesc.textContent = 'Detailed team and individual performance statistics will be available here soon.';
        soonDesc.style.color = '#666';
        soonDesc.style.maxWidth = '500px';

        comingSoonContainer.appendChild(soonIcon);
        comingSoonContainer.appendChild(soonTitle);
        comingSoonContainer.appendChild(soonDesc);

        statsContent.appendChild(comingSoonContainer);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('stats-tab');
        }
    }
}

// File: lib/ui/UIManager.js
// lib/ui/UIManager.js - import section at the top

window.UIManager = class UIManager {
    constructor() {
        this.gitlabApi = window.gitlabApi;
        this.container = null;
        this.contentWrapper = null;
        this.headerDiv = null;
        this.header = null;
        this.recalculateBtn = null;
        this.collapseBtn = null;
        this.boardStats = null;
        this.initializeManagers();
        this.tabManager = new TabManager(this);
        this.summaryView = new SummaryView(this);
        this.boardsView = new BoardsView(this);
        this.bulkCommentsView = new BulkCommentsView(this);
        this.sprintManagementView = new SprintManagementView(this);
        this.statsView = new StatsView(this); // Add with proper newline before it!
        this.issueSelector = new IssueSelector({
            uiManager: this,
            onSelectionChange: (selectedIssues) => {
                if (this.bulkCommentsView) {
                    this.bulkCommentsView.setSelectedIssues(selectedIssues);
                }
            }
        });
    }

    
    initialize(attachmentElement = document.body) {
        if (document.getElementById('assignee-time-summary')) {
            this.container = document.getElementById('assignee-time-summary');
            this.contentWrapper = document.getElementById('assignee-time-summary-wrapper');
            this.container.style.position = 'relative';
            return;
        }
        this.container = document.createElement('div');
        this.container.id = 'assignee-time-summary';
        this.container.style.position = 'fixed'; // Using fixed position
        this.container.style.bottom = '15px'; // Position at bottom-right
        this.container.style.right = '15px';
        this.container.style.backgroundColor = 'white';
        this.container.style.border = '1px solid #ddd';
        this.container.style.borderRadius = '4px';
        this.container.style.padding = '10px';
        this.container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        this.container.style.zIndex = '100';
        this.container.style.maxHeight = '80vh';
        this.container.style.overflow = 'hidden';
        this.container.style.fontSize = '14px';
        this.container.style.width = '400px'; // Increased width from 350px to 400px
        this.container.style.transition = 'height 0.3s ease-in-out';
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'assignee-time-summary-wrapper';
        this.contentWrapper.style.display = 'block';
        this.contentWrapper.style.maxHeight = '70vh';
        this.contentWrapper.style.minHeight = '350px'; // Add minimum height of 350px
        this.contentWrapper.style.overflowY = 'auto';
        this.contentWrapper.style.position = 'relative'; // Ensure content wrapper has position relative
        this.createHeader();
        this.createBoardStats();
        this.tabManager.initialize(this.contentWrapper);
        this.ensureTabContentHeight();
        this.container.appendChild(this.contentWrapper);
        attachmentElement.appendChild(this.container);
        this.attachmentElement = attachmentElement;
        this.container.addEventListener('click', (e) => {
            if (this.issueSelector && this.issueSelector.isSelectingIssue &&
                !e.target.classList.contains('card-selection-overlay') &&
                !e.target.classList.contains('selection-badge') &&
                !e.target.closest('#bulk-comments-content button') &&
                !e.target.closest('#issue-comment-input') &&
                !e.target.closest('#shortcuts-wrapper') &&
                !e.target.closest('#selected-issues-list') &&
                !e.target.closest('#selection-cancel-button')) {
                this.issueSelector.exitSelectionMode();
            }
        });
        // Initialize keyboard shortcuts
        this.initializeKeyboardShortcuts();
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

    
    initializeManagers() {
        try {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    if (this.bulkCommentsView && this.bulkCommentsView.addLabelShortcut) {
                        this.bulkCommentsView.addLabelShortcut();
                    }
                }
            });
        } catch (e) {
            console.error('Error initializing LabelManager:', e);
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([]),
                isLabelInWhitelist: () => false
            };
        }
        try {
            this.assigneeManager = new AssigneeManager({
                gitlabApi: this.gitlabApi,
                onAssigneesChange: (assignees) => {
                    if (this.bulkCommentsView && this.bulkCommentsView.addAssignShortcut) {
                        this.bulkCommentsView.addAssignShortcut();
                    }
                }
            });
        } catch (e) {
            console.error('Error initializing AssigneeManager:', e);
            this.assigneeManager = {
                getAssigneeWhitelist: () => []
            };
        }
        try {
            this.milestoneManager = new MilestoneManager({
                gitlabApi: this.gitlabApi,
                onMilestonesLoaded: (milestones) => {
                }
            });
        } catch (e) {
            console.error('Error initializing MilestoneManager:', e);
            this.milestoneManager = {
                milestones: [],
                fetchMilestones: () => Promise.resolve([])
            };
        }
    }

    
    createHeader() {
        this.headerDiv = document.createElement('div');
        this.headerDiv.style.display = 'flex';
        this.headerDiv.style.justifyContent = 'space-between';
        this.headerDiv.style.alignItems = 'center';
        this.headerDiv.style.marginBottom = '5px';
        this.headerDiv.style.cursor = 'pointer';
        this.headerDiv.addEventListener('click', (e) => {
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
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '5px';
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
            if (typeof window.updateSummary === 'function') {
                window.updateSummary(true);
            }
            this.recalculateBtn.textContent = '✓';
            setTimeout(() => {
                this.recalculateBtn.textContent = '🔄';
            }, 1000);
        };
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

    
    createBoardStats() {
        const existingStats = document.getElementById('board-stats-summary');
        if (existingStats) {
            this.boardStats = existingStats;
            return;
        }
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

    
    updateBoardStats(stats) {
        if (!this.boardStats) return;
        const totalCards = stats?.totalCards || 0;
        const withTimeCards = stats?.withTimeCards || 0;
        const closedCards = stats?.closedCards || 0;

        this.boardStats.innerHTML = ''; // Clear previous content
        const totalStats = document.createElement('div');
        totalStats.style.display = 'flex';
        totalStats.style.gap = '8px';

        const totalText = document.createElement('span');
        totalText.textContent = `Total: ${totalCards} cards`;
        totalStats.appendChild(totalText);

        const closedStats = document.createElement('div');
        closedStats.textContent = `Closed: ${closedCards} cards`;
        closedStats.style.color = '#28a745';
        this.boardStats.appendChild(totalStats);
        this.boardStats.appendChild(closedStats);
    }

    
    toggleCollapse() {
        if (!this.contentWrapper || !this.collapseBtn) return;

        try {
            if (this.contentWrapper.style.display === 'none') {
                this.contentWrapper.style.display = 'block';
                this.collapseBtn.textContent = '▼';
                this.container.style.height = '';
                saveToStorage('gitlabTimeSummaryCollapsed', 'false');
            } else {
                this.contentWrapper.style.display = 'none';
                this.collapseBtn.textContent = '▲';
                this.container.style.height = 'auto';
                saveToStorage('gitlabTimeSummaryCollapsed', 'true');
            }
        } catch (e) {
            console.error('Error toggling collapse state:', e);
        }
    }

    
    openSettings() {
        try {
            if (typeof window.SettingsManager === 'function') {
                const settingsManager = new window.SettingsManager({
                    labelManager: this.labelManager,
                    assigneeManager: this.assigneeManager,
                    gitlabApi: this.gitlabApi,
                    uiManager: this,  // Pass reference to this UIManager instance
                    onSettingsChanged: (type) => {
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

    
    updateHeader(text) {
        if (this.header) {
            this.header.innerHTML = text;
        }
    }

    
    
    addLoadingScreen(container, name, message = 'Loading...') {
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }
        if (!container) {
            console.warn(`Container not found for loading screen: ${name}`);
            return null;
        }
        const existingLoader = document.getElementById(`loading-screen-${name}`);
        if (existingLoader) {
            const messageEl = existingLoader.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
            return existingLoader;
        }
        const loadingScreen = document.createElement('div');
        loadingScreen.id = `loading-screen-${name}`;
        loadingScreen.className = 'gitlab-helper-loading-screen';
        loadingScreen.style.position = 'absolute';
        loadingScreen.style.top = '0';
        loadingScreen.style.left = '0';
        loadingScreen.style.width = '100%';
        loadingScreen.style.height = '100%';
        loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';  // Semi-transparent backdrop
        loadingScreen.style.display = 'flex';
        loadingScreen.style.flexDirection = 'column';
        loadingScreen.style.justifyContent = 'center';
        loadingScreen.style.alignItems = 'center';

        loadingScreen.style.zIndex = '101';  // Higher z-index to be above other elements
        loadingScreen.style.transition = 'opacity 0.3s ease';
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.width = '40px';
        spinner.style.height = '40px';
        spinner.style.borderRadius = '50%';
        spinner.style.border = '3px solid rgba(255, 255, 255, 0.2)';  // White border for dark backdrop
        spinner.style.borderTopColor = '#ffffff';  // White spinner for dark backdrop
        spinner.style.animation = 'gitlab-helper-spin 1s linear infinite';
        const messageEl = document.createElement('div');
        messageEl.className = 'loading-message';
        messageEl.textContent = message;
        messageEl.style.marginTop = '15px';
        messageEl.style.fontWeight = 'bold';
        messageEl.style.color = '#ffffff';  // White text for dark backdrop
        messageEl.style.fontSize = '14px';
        messageEl.style.textAlign = 'center'; // Ensure text is centered
        messageEl.style.padding = '0 20px'; // Add some padding for longer messages
        messageEl.style.maxWidth = '90%'; // Prevent text from overflowing on smaller screens
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
        loadingScreen.appendChild(spinner);
        loadingScreen.appendChild(messageEl);
        const containerPosition = window.getComputedStyle(container).position;
        if (containerPosition === 'static' || !containerPosition) {
            container.style.position = 'relative';
            container.dataset.originalPosition = containerPosition;
        }
        container.appendChild(loadingScreen);
        messageEl.style.animation = 'gitlab-helper-pulse 2s ease infinite';

        return loadingScreen;
    }

    
    removeLoadingScreen(name, fadeOut = true) {
        const loadingScreen = document.getElementById(`loading-screen-${name}`);
        if (!loadingScreen) return;
        const container = loadingScreen.parentNode;

        if (fadeOut) {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }
                if (container && container.dataset.originalPosition) {
                    container.style.position = container.dataset.originalPosition;
                    delete container.dataset.originalPosition;
                }
            }, 300); // Match the transition duration
        } else {
            loadingScreen.parentNode.removeChild(loadingScreen);
            if (container && container.dataset.originalPosition) {
                container.style.position = container.dataset.originalPosition;
                delete container.dataset.originalPosition;
            }
        }
    }

    
    updateLoadingMessage(name, message) {
        const loadingScreen = document.getElementById(`loading-screen-${name}`);
        if (!loadingScreen) return;

        const messageEl = loadingScreen.querySelector('.loading-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    
    ensureTabContentHeight() {
        const tabContents = [
            document.getElementById('assignee-time-summary-content'),
            document.getElementById('boards-time-summary-content'),
            document.getElementById('bulk-comments-content')
        ];
        const wrapper = document.getElementById('assignee-time-summary-wrapper');
        const headerDiv = this.headerDiv || document.querySelector('#assignee-time-summary > div:first-child');

        if (!wrapper || !headerDiv) {
            console.warn('Could not find wrapper or header elements for height calculation');
            tabContents.forEach(content => {
                if (content) {
                    content.style.minHeight = '300px';
                    content.style.position = 'relative';
                }
            });
            return;
        }
        const headerHeight = headerDiv.offsetHeight;
        const tabNavHeight = 36; // Approximate height of tab navigation
        const statsHeight = this.boardStats ? this.boardStats.offsetHeight : 0;
        const subtractHeight = headerHeight + tabNavHeight + statsHeight + 20; // +20px for padding/margins
        tabContents.forEach(content => {
            if (content) {
                content.style.minHeight = `calc(100% - ${subtractHeight}px)`;
                content.style.height = `calc(100% - ${subtractHeight}px)`;
                content.style.position = 'relative';
            }
        });
    }

    
    initializeKeyboardShortcuts() {
        try {
            // Get the toggle shortcut from settings
            this.toggleShortcut = getToggleShortcut();

            // Define the keyboard handler
            this.keyboardHandler = this.createKeyboardHandler();

            // Add global keyboard listener
            document.addEventListener('keydown', this.keyboardHandler);

        } catch (error) {
            console.error('Error initializing keyboard shortcuts:', error);
        }
    }

    
    createKeyboardHandler() {
        return (e) => {
            // Skip if user is typing in an input, textarea, or contenteditable element
            if (isActiveInputElement(e.target)) {
                return;
            }

            // Toggle visibility with the configured shortcut
            if (e.key.toLowerCase() === this.toggleShortcut.toLowerCase()) {
                this.toggleCollapse();
                e.preventDefault(); // Prevent default browser action
            }
        };
    }

    
    updateKeyboardShortcut(newShortcut) {
        if (!newShortcut || typeof newShortcut !== 'string' || newShortcut.length !== 1) {
            console.warn('Invalid shortcut provided:', newShortcut);
            return;
        }

        try {
            // Remove the old event listener
            if (this.keyboardHandler) {
                document.removeEventListener('keydown', this.keyboardHandler);
            }

            // Update the shortcut
            this.toggleShortcut = newShortcut;

            // Create and attach a new event handler
            this.keyboardHandler = this.createKeyboardHandler();
            document.addEventListener('keydown', this.keyboardHandler);

            console.log(`Updated keyboard shortcut to: '${this.toggleShortcut}'`);
        } catch (error) {
            console.error('Error updating keyboard shortcut:', error);
        }
    }
}


// File: lib/ui/index.js
window.uiManager = window.uiManager || new UIManager();


window.createSummaryContainer = function createSummaryContainer() {
    uiManager.initialize();
    return uiManager.container;
}

function createUIManager() {
    window.uiManager = window.uiManager || new UIManager();
    if (uiManager.settingsBtn) {
        uiManager.settingsBtn.onclick = (e) => {
            e.stopPropagation();
            if (uiManager.bulkCommentsView && uiManager.bulkCommentsView.settingsManager) {
                uiManager.bulkCommentsView.settingsManager.openSettingsModal();
            } else if (window.settingsManager) {
                window.settingsManager.openSettingsModal();
            } else {
                const settingsManager = new SettingsManager({
                    labelManager: uiManager.labelManager,
                    assigneeManager: uiManager.assigneeManager,
                    gitlabApi: window.gitlabApi || uiManager.gitlabApi,
                    onSettingsChanged: (type) => {
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
                if (uiManager.bulkCommentsView) {
                    uiManager.bulkCommentsView.settingsManager = settingsManager;
                }
                window.settingsManager = settingsManager;
                settingsManager.openSettingsModal();
            }
        };
    }

    return uiManager;
}


window.updateSummaryTab = function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
    if (typeof processBoards === 'function') {
        const { closedBoardCards } = processBoards();
        uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: closedBoardCards || 0
        });
    }
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


window.updateBoardsTab = function updateBoardsTab(boardData, boardAssigneeData) {
    uiManager.boardsView.render(boardData, boardAssigneeData);
}


window.updateBulkCommentsTab = function updateBulkCommentsTab() {
    uiManager.bulkCommentsView.render();
}


window.renderHistory = function renderHistory() {
    uiManager.historyView.render();
}

window.addEventListener('scroll', () => {
    if (uiManager && uiManager.issueSelector) {
        if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
            uiManager.issueSelector.repositionOverlays();
        }
    }
});

window.addEventListener('resize', () => {
    if (uiManager && uiManager.issueSelector) {
        if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
            uiManager.issueSelector.repositionOverlays();
        }
    }
});

window.uiManager = uiManager;
window.updateSummaryTab = updateSummaryTab;
window.updateBoardsTab = updateBoardsTab;
window.updateBulkCommentsTab = updateBulkCommentsTab;
window.renderHistory = renderHistory;
window.createSummaryContainer = createSummaryContainer;


window.SettingsManager = SettingsManager;

setTimeout(() => {
    const settingsBtn = document.querySelector('#assignee-time-summary button[title="Settings"]');

    if (settingsBtn) {
        
        settingsBtn.onclick = (e) => {
            e.stopPropagation();
            try {
                const settingsManager = new SettingsManager({
                    labelManager: window.uiManager?.labelManager,
                    assigneeManager: window.uiManager?.assigneeManager,
                    gitlabApi: window.gitlabApi,
                    onSettingsChanged: (type) => {
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

            } else {
        console.warn('Settings button not found');
    }
}, 2000); // Wait 2 seconds to ensure all elements are loaded

// File: lib/index.js
// lib/index.js - import section at the top

function createUIManager(attachmentElement = document.body) {
    if (!window.gitlabApi) {
        try {
            window.gitlabApi = new GitLabAPI();
        } catch (e) {
            console.error('Error creating GitLabAPI instance:', e);
        }
    }
    try {
        window.uiManager = window.uiManager || new UIManager();
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


// lib/index.js - checkAndInit function

function checkAndInit() {
    if (isInitialized) {
        return;
    }

    if (window.location.href.includes('/boards')) {
        waitForBoardsElement()
            .then(boardsElement => {
                const uiManager = createUIManager(boardsElement);

                // Initialize history manager
                if (!window.historyManager) {
                    try {
                        window.historyManager = new HistoryManager();
                    } catch (e) {
                        console.error('Error initializing HistoryManager:', e);
                    }
                }

                isInitialized = true;
                waitForBoards();
            })
            .catch(error => {
                console.error('Error initializing UI:', error);
                const uiManager = createUIManager(document.body);

                // Initialize history manager even if there was an error
                if (!window.historyManager) {
                    try {
                        window.historyManager = new HistoryManager();
                    } catch (e) {
                        console.error('Error initializing HistoryManager:', e);
                    }
                }

                isInitialized = true;
                waitForBoards();
            });
    }
}


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
        const totalHours = (totalEstimate / 3600);
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



// File: main.js (main script content)


(function () {
    'use strict';

    function setupGlobalReferences() {
    }

    

})();

})(window);

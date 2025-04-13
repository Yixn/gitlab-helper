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
    return (seconds / 3600).toFixed(1);
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
}

window.GitLabAPI = GitLabAPI;

// File: lib/core/DataProcessor.js


window.processBoards = function processBoards() {
    const assigneeTimeMap = {};
    const boardData = {};
    const boardAssigneeData = {};
    let totalEstimate = 0;
    let cardsProcessed = 0;
    let cardsWithTime = 0;
    let currentMilestone = null;
    let closedBoardCards = 0;
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
    uiCollapsed: false
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
            if (stringTabId && ['summary', 'boards', 'bulkcomments'].includes(stringTabId)) {
                return stringTabId;
            }
            console.warn('Invalid tab ID format, using default');
            return DEFAULT_SETTINGS.lastActiveTab;
        }
        // If history tab was saved, return summary instead
        if (tabId === 'history') {
            return 'summary';
        }
        if (!['summary', 'boards', 'bulkcomments'].includes(tabId)) {
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
        if (!['summary', 'boards', 'bulkcomments'].includes(tabIdStr)) {
            console.warn(`Attempting to save invalid tab ID: ${tabIdStr}, using default`);
            return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, DEFAULT_SETTINGS.lastActiveTab);
        }
        return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, tabIdStr);
    } catch (error) {
        console.error('Error saving last active tab:', error);
        return false;
    }
}

// File: lib/ui/components/Notification.js


window.Notification = class Notification {
    
    constructor(options = {}) {
        this.position = 'bottom-left';
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
        const shortcutLabel = document.createElement('div');
        shortcutLabel.textContent = options.label;
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.fontWeight = 'bold';
        shortcutLabel.style.color = '#555';
        shortcutLabel.style.minWidth = '100px';
        shortcutLabel.style.flexShrink = '0'; // Prevent shrinking
        shortcutLabel.style.whiteSpace = 'nowrap';
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
                options.onSelect(selectedValue);
                e.target.value = ''; // Reset after selection
            }
        });
        dropdownContainer.appendChild(dropdown);
        shortcutContainer.appendChild(shortcutLabel);
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
            removeBtn.addEventListener('mouseenter', () => {
                removeBtn.style.color = '#c82333';
            });

            removeBtn.addEventListener('mouseleave', () => {
                removeBtn.style.color = '#dc3545';
            });
            removeBtn.onclick = (e) => {
                e.stopPropagation();
                this.removeIssue(index);
            };

            issueItem.appendChild(removeBtn);
            this.issuesList.appendChild(issueItem);
        });
            }

    
    removeIssue(index) {
        if (index >= 0 && index < this.selectedIssues.length) {
            this.selectedIssues.splice(index, 1);
            this.updateDisplay();
            if (typeof this.onRemoveIssue === 'function') {
                this.onRemoveIssue(index);
            } else {
                try {
                    if (window.uiManager && window.uiManager.issueSelector) {
                        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    }
                } catch (e) {
                    console.error('Error syncing with IssueSelector:', e);
                }
            }
                    }
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
        const statusMsg = document.getElementById('comment-status');
        if (statusMsg) {
            statusMsg.textContent = 'Click on cards to select/deselect issues. Press ESC or click DONE when finished.';
            statusMsg.style.color = '#1f75cb';
        }
        let boardsContainer = document.querySelector('.boards-list');
        if (!boardsContainer) {
            const possibleSelectors = [
                '[data-testid="boards-list"]',
                '.boards-app',
                '.js-boards-selector',
                '.board',
                '.boards-app-content',
                '.board-wrapper',
                '.boards-selector'
            ];

            for (const selector of possibleSelectors) {
                const element = document.querySelector(selector);
                if (element) {
                    boardsContainer = element;
                    break;
                }
            }
        }
        if (!boardsContainer) {
            console.warn('Could not find boards container, falling back to document.body');
            boardsContainer = document.body;
        }
        boardsContainer.style.position = 'relative';
        const fullWidth = Math.max(
            boardsContainer.scrollWidth,
            boardsContainer.offsetWidth,
            boardsContainer.clientWidth
        );
        const pageOverlay = document.createElement('div');
        pageOverlay.id = 'selection-page-overlay';
        pageOverlay.style.position = 'absolute';
        pageOverlay.style.top = '0';
        pageOverlay.style.left = '0';
        pageOverlay.style.width = `${fullWidth}px`; // Set to calculated full width
        pageOverlay.style.height = '100%';
        pageOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        pageOverlay.style.zIndex = '98';
        pageOverlay.style.pointerEvents = 'none';
        boardsContainer.appendChild(pageOverlay);
        this.createCardOverlays(currentSelection, boardsContainer);
        this.createFixedControls();
        const selectButton = document.getElementById('select-issues-button');
        if (selectButton) {
            selectButton.dataset.active = 'true';
            selectButton.style.backgroundColor = '#28a745'; // Green when active
            selectButton.textContent = '✓ Selecting...';
        }

            }
    

    createCardOverlays(currentSelection = [], attachmentElement = document.body) {
                const boardCards = document.querySelectorAll('.board-card');
        this.selectedIssues = currentSelection || [];
        this.selectedOverlays = [];

        boardCards.forEach((card, index) => {
            try {
                const rect = card.getBoundingClientRect();
                const attachmentRect = attachmentElement.getBoundingClientRect();
                const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
                const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
                const offsetLeft = rect.left - attachmentRect.left + scrollLeft - 10;
                const offsetTop = rect.top - attachmentRect.top + scrollTop;
                const overlay = document.createElement('div');
                overlay.className = 'card-selection-overlay';
                overlay.style.position = 'absolute';  // Use absolute positioning
                overlay.style.left = `${offsetLeft}px`;
                overlay.style.top = `${offsetTop}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
                overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                overlay.style.border = '2px solid rgba(31, 117, 203, 0.6)';
                overlay.style.borderRadius = '4px';
                overlay.style.zIndex = '99';
                overlay.style.cursor = 'pointer';
                overlay.style.transition = 'background-color 0.2s ease';
                overlay.dataset.cardId = card.id || `card-${Date.now()}-${index}`;
                overlay.dataset.selected = 'false';
                overlay.originalCard = card;
                const issueItem = this.getIssueItemFromCard(card);

                if (issueItem) {
                    overlay.dataset.issueId = `${issueItem.iid}-${issueItem.referencePath}`;
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
                }
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
                overlay.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.toggleCardSelection(card, overlay);
                });

                attachmentElement.appendChild(overlay);
                this.selectionOverlays.push(overlay);
            } catch (error) {
                console.error('Error creating overlay for card:', error);
            }
        });


            }

    
    updateSelectionCounter() {
        const counter = document.getElementById('selection-counter');
        if (counter) {
            const count = this.selectedIssues.length;
            counter.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;
            if (count > 0) {
                counter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
            } else {
                counter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
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
                this.isSelectingIssue = false;
        const pageOverlay = document.getElementById('selection-page-overlay');
        if (pageOverlay) {
            pageOverlay.remove();
        }
        this.selectionOverlays.forEach(overlay => {
            if (overlay && overlay.parentNode) {
                overlay.parentNode.removeChild(overlay);
            }
        });
        this.selectionOverlays = [];
        this.selectedOverlays = [];
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
        const boardsContainer = document.querySelector('[data-testid="boards-list"]') || document.body;
        const attachmentRect = boardsContainer.getBoundingClientRect();
        const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
        const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
        this.selectionOverlays.forEach(overlay => {
            if (overlay.className === 'card-selection-overlay' && overlay.originalCard) {
                const card = overlay.originalCard;
                const rect = card.getBoundingClientRect();
                const offsetLeft = rect.left - attachmentRect.left + scrollLeft - 10;
                const offsetTop = rect.top - attachmentRect.top + scrollTop;

                overlay.style.left = `${offsetLeft}px`;
                overlay.style.top = `${offsetTop}px`;
                overlay.style.width = `${rect.width}px`;
                overlay.style.height = `${rect.height}px`;
            }
        });
        const doneButton = document.getElementById('selection-cancel-button');
        if (doneButton) {
            doneButton.style.bottom = '20px';
            doneButton.style.right = '20px';
        }

        const counter = document.getElementById('selection-counter');
        if (counter) {
            counter.style.bottom = '20px';
            counter.style.left = '20px';
        }

        const helpText = document.getElementById('selection-help-text');
        if (helpText) {
            helpText.style.top = '10px';
            helpText.style.left = '50%';
        }
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
        const cancelButton = document.createElement('div');
        cancelButton.id = 'selection-cancel-button';
        cancelButton.textContent = 'DONE';
        cancelButton.style.position = 'fixed';  // Use fixed positioning
        cancelButton.style.bottom = '20px';
        cancelButton.style.right = '430px;';
        cancelButton.style.backgroundColor = '#28a745';
        cancelButton.style.color = 'white';
        cancelButton.style.padding = '10px 20px';
        cancelButton.style.borderRadius = '4px';
        cancelButton.style.cursor = 'pointer';
        cancelButton.style.fontWeight = 'bold';
        cancelButton.style.zIndex = '999';  // Higher z-index
        cancelButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
        cancelButton.style.transition = 'all 0.2s ease';
        cancelButton.addEventListener('mouseenter', () => {
            cancelButton.style.backgroundColor = '#218838';
            cancelButton.style.transform = 'translateY(-2px)';
            cancelButton.style.boxShadow = '0 6px 15px rgba(0, 0, 0, 0.5)';
        });

        cancelButton.addEventListener('mouseleave', () => {
            cancelButton.style.backgroundColor = '#28a745';
            cancelButton.style.transform = 'translateY(0)';
            cancelButton.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
        });
        cancelButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.exitSelectionMode();
        });

        document.body.appendChild(cancelButton);
        this.selectionOverlays.push(cancelButton);
        const selectionCounter = document.createElement('div');
        selectionCounter.id = 'selection-counter';
        selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
        selectionCounter.style.position = 'fixed';  // Use fixed positioning
        selectionCounter.style.bottom = '20px';
        selectionCounter.style.left = '275px';
        selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ?
            'rgba(40, 167, 69, 0.9)' : 'rgba(0, 0, 0, 0.8)';
        selectionCounter.style.color = 'white';
        selectionCounter.style.padding = '8px 16px';
        selectionCounter.style.borderRadius = '20px';
        selectionCounter.style.fontSize = '14px';
        selectionCounter.style.zIndex = '999';  // Higher z-index
        selectionCounter.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';

        document.body.appendChild(selectionCounter);
        this.selectionOverlays.push(selectionCounter);
        const helpText = document.createElement('div');
        helpText.id = 'selection-help-text';
        helpText.textContent = 'Click on issues to select/deselect them • Press ESC or click DONE when finished';
        helpText.style.position = 'fixed';  // Use fixed positioning
        helpText.style.top = '10px';
        helpText.style.left = '50%';
        helpText.style.transform = 'translateX(-50%)';
        helpText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
        helpText.style.color = 'white';
        helpText.style.padding = '8px 16px';
        helpText.style.borderRadius = '20px';
        helpText.style.fontSize = '14px';
        helpText.style.zIndex = '999';  // Higher z-index
        helpText.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';

        document.body.appendChild(helpText);
        this.selectionOverlays.push(helpText);
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
        this.createTab('bulkcomments', 'Bulk Comments', this.currentTab === 'bulkcomments');
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
        summaryContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(summaryContent);
        this.contentAreas['summary'] = summaryContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(summaryContent, 'summary-tab', 'Loading summary data...');
        }

        const boardsContent = document.createElement('div');
        boardsContent.id = 'boards-time-summary-content';
        boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
        boardsContent.style.position = 'relative'; // Explicitly set position relative
        boardsContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(boardsContent);
        this.contentAreas['boards'] = boardsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(boardsContent, 'boards-tab', 'Loading board data...');
        }

        const bulkCommentsContent = document.createElement('div');
        bulkCommentsContent.id = 'bulk-comments-content';
        bulkCommentsContent.style.display = this.currentTab === 'bulkcomments' ? 'block' : 'none';
        bulkCommentsContent.style.position = 'relative'; // Explicitly set position relative
        bulkCommentsContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(bulkCommentsContent);
        this.contentAreas['bulkcomments'] = bulkCommentsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
        }
    }

    
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
                const labels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
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
    
    async fetchGroupMembers(groupId) {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        if (!groupId) {
            throw new Error('Group ID is required');
        }

        try {
            const members = await this.gitlabApi.callGitLabApi(
                `groups/${encodeURIComponent(groupId)}/members`,
                {params: {per_page: 100}}
            );
            this.currentUsers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));
            return this.currentUsers;
        } catch (error) {
            console.error(`Error fetching members for group ${groupId}:`, error);
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
        modalOverlay.style.zIndex = '110';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
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
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentContainer);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    
    createCollapsibleSection(container, title, description, contentBuilder, startExpanded = false) {
        startExpanded = false;
        const section = document.createElement('div');
        section.className = 'settings-section';
        section.style.marginBottom = '15px';
        section.style.border = '1px solid #ddd';
        section.style.borderRadius = '6px';
        section.style.overflow = 'hidden';
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
        content.className = 'settings-section-content';
        content.style.padding = '15px';
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
        whitelistedContent.appendChild(this.createAddAssigneeForm(assigneeListContainer, createEmptyMessage));
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
                    `projects/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            } else if (pathInfo.type === 'group') {
                users = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
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
                    params: { per_page: 100 }
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
        this.resetLabelWhitelist();
        saveAssigneeWhitelist([]);
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

}

// File: lib/ui/views/SummaryView.js
window.SummaryView = class SummaryView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    
    render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');

        if (!summaryContent) return;
        summaryContent.innerHTML = '';
        this.uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: this.getClosedBoardCount()
        });
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
        this.uiManager.updateHeader(
            `Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`
        );
        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('summary-tab');
        }
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
        const totalDistributionCell = document.createElement('td');
        totalDistributionCell.style.textAlign = 'right';
        totalDistributionCell.style.padding = '5px 0 5px 15px';
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
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
            return assigneeTimeMap[b] - assigneeTimeMap[a];
        });
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
            const distributionCell = document.createElement('td');
            distributionCell.style.textAlign = 'right';
            distributionCell.style.padding = '5px 0 5px 15px';
            distributionCell.style.color = '#666';
            distributionCell.style.fontSize = '12px';
            if (boardNames.length > 0 && boardAssigneeData) {
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
                onSelect: (value) => {
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

                    let assignText = '/assign ';

                    if (value === 'none') {
                        assignText += '@none';
                    } else if (value === '@me') {
                        assignText += '@me';
                    } else {
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
                    { value: '', label: 'Loading labels...' }
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
            { value: '', label: 'Assign to...' },
            { value: '@me', label: 'Myself' },
            { value: 'none', label: 'Unassign' }
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
            assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
            const whitelistItems = directWhitelist.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
            }));

            assignItems = assignItems.concat(whitelistItems);
        }
        else {
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
                assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
                const whitelistItems = assignees.map(assignee => ({
                    value: assignee.username,
                    label: assignee.name || assignee.username
                }));

                assignItems = assignItems.concat(whitelistItems);
            } else {
                console.warn("Could not find any assignees through any method");
            }
        }
        assignItems.push({ value: 'custom', label: 'Custom...' });
        this.updateAssignShortcut(assignItems);
        setTimeout(() => {
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        const updatedItems = [...assignItems];
                        updatedItems.push({ value: 'separator2', label: '────── Group Members ──────' });
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

    
    setSelectedIssues(issues) {
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }
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
        this.selectedIssues = [];
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues([]);
        }
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }
        if (this.notification) {
            this.notification.info('Selection cleared');
        }
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
        commentSection.style.marginBottom = '15px';
        commentSection.style.padding = '10px';
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '8px';
        commentSection.style.border = '1px solid #e0e0e0';
        this.selectionDisplay.createSelectionContainer(commentSection);
        this.createCommentInput(commentSection);
        this.createActionButtons(commentSection);
        this.createStatusElements(commentSection);
        this.isLoading = true;
        this.showLoadingState();
        try {
            if (this.commentInput && this.commandShortcuts) {
                this.initializeAllShortcuts();
                this.addLabelShortcut([
                    { value: '', label: 'Loading labels...' }
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
            { value: '', label: 'Add Label' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
            { value: 'enhancement', label: 'Enhancement' },
            { value: 'documentation', label: 'Documentation' },
            { value: 'custom', label: 'Custom...' }
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

    
    showLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Loading shortcuts...';
            statusEl.style.color = '#1f75cb';
            statusEl.style.backgroundColor = '#f8f9fa';
            statusEl.style.border = '1px solid #e9ecef';
        }
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
                progressLabel.textContent = `Processing ${i+1} of ${this.selectedIssues.length} issues...`;
            }
            if (this.uiManager && this.uiManager.updateLoadingMessage) {
                this.uiManager.updateLoadingMessage(
                    'comment-submit',
                    `Sending comment to issue #${issue.iid || i+1} (${i+1}/${this.selectedIssues.length})...`
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
            if (statusEl) {
                statusEl.textContent = `Successfully added comment to all ${successCount} issues!`;
                statusEl.style.color = '#28a745';
            }

            this.notification.success(`Added comment to ${successCount} issues`);
            if (this.commentInput) {
                this.commentInput.value = '';
            }
            setTimeout(() => {
                if (progressContainer) {
                    progressContainer.style.display = 'none';
                }
            }, 2000);
            if (this.uiManager && this.uiManager.issueSelector && this.uiManager.issueSelector.isSelectingIssue) {
                this.uiManager.issueSelector.exitSelectionMode();
            }
            setTimeout(() => {
                this.clearSelectedIssues();

                if (statusEl) {
                    statusEl.textContent = '';
                }
            }, 3000);
            setTimeout(() => {
                this.refreshBoard();
            }, 1000);
        } else {
            if (statusEl) {
                statusEl.textContent = `Added comment to ${successCount} issues, failed for ${failCount} issues.`;
                statusEl.style.color = successCount > 0 ? '#ff9900' : '#dc3545';
            }
            if (successCount > 0) {
                this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);
                setTimeout(() => {
                    this.refreshBoard();
                }, 1000);
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
                labelItems = [{ value: '', label: 'Add Label' }];
                const labels = this.labelManager.filteredLabels.map(label => ({
                    value: label.name,
                    label: label.name
                }));

                labelItems = labelItems.concat(labels);
                labelItems.push({ value: 'custom', label: 'Custom...' });
            } else {
                try {
                    const whitelist = getLabelWhitelist();
                    if (whitelist && whitelist.length > 0) {
                        labelItems = [{ value: '', label: 'Add Label' }];
                        const whitelistItems = whitelist.map(term => ({
                            value: term,
                            label: term
                        }));

                        labelItems = labelItems.concat(whitelistItems);
                        labelItems.push({ value: 'custom', label: 'Custom...' });
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
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customLabel = prompt('Enter custom label name:');
                        if (!customLabel) return;
                        value = customLabel;
                    }

                    const textarea = document.getElementById('issue-comment-input');
                    if (!textarea) return;
                    const labelText = `/label ~"${value}"`;

                    this.insertTextAtCursor(textarea, labelText);
                    this.notification.info(`Label added: ${value}`);
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

    
    refreshBoard() {
        window.location.reload()
    }
}

// File: lib/ui/UIManager.js
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
        const totalCards = stats?.totalCards || a0;
        const withTimeCards = stats?.withTimeCards || 0;
        const closedCards = stats?.closedCards || 0;

        this.boardStats.innerHTML = ''; // Clear previous content
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
                validBoardData,       // Ensure we pass valid object
                validBoardAssigneeData // Ensure we pass valid object
            );
        }
        if (window.uiManager.boardsView) {
            window.uiManager.boardsView.render(validBoardData, validBoardAssigneeData);
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



// File: lib/ui/views/HistoryView.js
window.HistoryView = class HistoryView {
    
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    
    render() {
        const historyContent = document.getElementById('history-time-summary-content');
        if (!historyContent) return;
        historyContent.innerHTML = '';
        const urlKey = getHistoryKey();
        const history = GM_getValue(urlKey, []);
        const urlInfo = document.createElement('div');
        urlInfo.style.fontSize = '12px';
        urlInfo.style.color = '#666';
        urlInfo.style.marginBottom = '10px';
        urlInfo.style.wordBreak = 'break-all';

        historyContent.appendChild(urlInfo);
        if (history.length === 0) {
            this.renderNoHistoryMessage(historyContent);
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('history-tab');
            }
            return;
        }
        this.addClearHistoryButton(historyContent, urlKey);
        this.renderHistoryTable(historyContent, history);
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('history-tab');
        }
    }

    
    renderNoHistoryMessage(container) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No history data available for this URL yet.';
        noDataMsg.style.color = '#666';
        container.appendChild(noDataMsg);
    }

    
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

    
    renderHistoryTable(container, history) {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
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

// File: main.js (main script content)


(function () {
    'use strict';

    function setupGlobalReferences() {
    }

    

})();

})(window);

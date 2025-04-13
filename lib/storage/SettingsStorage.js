import {loadFromStorage, saveToStorage} from './LocalStorage';

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

/**
 * Get label whitelist with error handling
 * @returns {Array} Label whitelist array
 */
export function getLabelWhitelist() {
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

/**
 * Save label whitelist with error handling
 * @param {Array} whitelist - Label whitelist array
 * @returns {boolean} Success status
 */
export function saveLabelWhitelist(whitelist) {
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

/**
 * Reset label whitelist to default values with error handling
 * @returns {Array} The default whitelist
 */
export function resetLabelWhitelist() {
    try {
        const defaultWhitelist = [...DEFAULT_SETTINGS.labelWhitelist];
        saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, defaultWhitelist);
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
export function getAssigneeWhitelist() {
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

/**
 * Save assignee whitelist with error handling
 * @param {Array} whitelist - Assignee whitelist array
 * @returns {boolean} Success status
 */
export function saveAssigneeWhitelist(whitelist) {
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

/**
 * Get last active tab from storage with error handling
 * @returns {string} Tab ID
 */

export function getLastActiveTab() {
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

/**
 * Save last active tab to storage with error handling
 * @param {string} tabId - Tab ID
 * @returns {boolean} Success status
 */
export function saveLastActiveTab(tabId) {
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
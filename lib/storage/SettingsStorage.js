import { saveToStorage, loadFromStorage } from './LocalStorage';

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
export function saveLabelWhitelist(whitelist) {
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
export function resetLabelWhitelist() {
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
export function getAssigneeWhitelist() {
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
export function saveAssigneeWhitelist(whitelist) {
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
export function getLastActiveTab() {
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
export function saveLastActiveTab(tabId) {
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
export function getUICollapsedState() {
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
export function saveUICollapsedState(collapsed) {
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
// Settings storage module for GitLab Sprint Helper
import { saveToStorage, loadFromStorage } from './LocalStorage';

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
 * Get label whitelist
 * @returns {Array} Label whitelist array
 */
export function getLabelWhitelist() {
    const whitelist = loadFromStorage(STORAGE_KEYS.LABEL_WHITELIST, DEFAULT_SETTINGS.labelWhitelist);
    // Ensure we always return an array
    return Array.isArray(whitelist) ? whitelist : DEFAULT_SETTINGS.labelWhitelist;
}

/**
 * Save label whitelist
 * @param {Array} whitelist - Label whitelist array
 * @returns {boolean} Success status
 */
export function saveLabelWhitelist(whitelist) {
    return saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, whitelist);
}

/**
 * Reset label whitelist to default values
 * @returns {boolean} Success status
 */
export function resetLabelWhitelist() {
    return saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, DEFAULT_SETTINGS.labelWhitelist);
}

/**
 * Get assignee whitelist
 * @returns {Array} Assignee whitelist array
 */
export function getAssigneeWhitelist() {
    return loadFromStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, DEFAULT_SETTINGS.assigneeWhitelist);
}

/**
 * Save assignee whitelist
 * @param {Array} whitelist - Assignee whitelist array
 * @returns {boolean} Success status
 */
export function saveAssigneeWhitelist(whitelist) {
    return saveToStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, whitelist);
}

/**
 * Get last active tab from storage
 * @returns {string} Tab ID
 */
export function getLastActiveTab() {
    try {
        let tabId = loadFromStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, DEFAULT_SETTINGS.lastActiveTab);
        // Ensure we handle both string and JSON stored values
        return typeof tabId === 'string' ? tabId : DEFAULT_SETTINGS.lastActiveTab;
    } catch (e) {
        console.warn('Error retrieving last active tab:', e);
        return 'summary'; // Fallback to summary tab
    }
}

/**
 * Save last active tab to storage
 * @param {string} tabId - Tab ID
 * @returns {boolean} Success status
 */
export function saveLastActiveTab(tabId) {
    // Always store tab ID as a plain string, not JSON
    return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, String(tabId));
}

/**
 * Get UI collapsed state
 * @returns {boolean} Collapsed state
 */
export function getUICollapsedState() {
    return loadFromStorage(STORAGE_KEYS.UI_COLLAPSED, DEFAULT_SETTINGS.uiCollapsed);
}

/**
 * Save UI collapsed state
 * @param {boolean} collapsed - Collapsed state
 * @returns {boolean} Success status
 */
export function saveUICollapsedState(collapsed) {
    return saveToStorage(STORAGE_KEYS.UI_COLLAPSED, collapsed);
}
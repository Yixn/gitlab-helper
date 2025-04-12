// LocalStorage wrapper for GitLab Sprint Helper

/**
 * Save value to localStorage with error handling
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be JSON stringified if it's an object)
 * @returns {boolean} Success status
 */
export function saveToStorage(key, value) {
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
export function loadFromStorage(key, defaultValue = null) {
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
export function removeFromStorage(key) {
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
export function clearStorage(prefix = null) {
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
export function hasStorageKey(key) {
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
export function setGMValue(key, value) {
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
export function getGMValue(key, defaultValue = null) {
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
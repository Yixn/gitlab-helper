
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

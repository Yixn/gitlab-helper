// Utility functions for GitLab Assignee Time Summary

/**
 * Format seconds to hours with 1 decimal place
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted hours string
 */
export function formatHours(seconds) {
    return (seconds / 3600).toFixed(1);
}

/**
 * Format seconds to human-readable duration (e.g. 1h 30m)
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted duration string
 */
export function formatDuration(seconds) {
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
export function getNestedProperty(obj, path) {
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
export function truncateText(text, maxLength) {
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
export function safeJSONParse(str, defaultValue = {}) {
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
export function waitForElement(selector, timeout = 10000) {
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
export function generateColorFromString(str) {
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
export function getContrastColor(bgColor) {
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
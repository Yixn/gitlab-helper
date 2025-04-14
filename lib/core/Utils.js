
/**
 * Format seconds to hours with 1 decimal place
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted hours string
 */
export function formatHours(seconds) {
    return (seconds / 3600);
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
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 75%)`;
}

/**
 * Determine if text should be black or white based on background color
 * @param {string} bgColor - Background color (hex, rgb, or named color)
 * @returns {string} 'black' or 'white'
 */
export function getContrastColor(bgColor) {
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


/**
 * * Check if an element is an active input element where typing is expected
 * * @param {HTMLElement} element - The element to check
 * * @returns {boolean} True if element is an input where typing is expected
 * */
export function isActiveInputElement(element) {
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
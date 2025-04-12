
/**
 * Format seconds to hours with 1 decimal place
 * @param {number} seconds - Time in seconds
 * @returns {string} Formatted hours string
 */
export function formatHours(seconds) {
    return (seconds / 3600).toFixed(1);
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
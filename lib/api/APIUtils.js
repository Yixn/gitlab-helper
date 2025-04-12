
/**
 * Extract project or group path from URL
 * @returns {Object|null} Path info object with type, path, encodedPath, and apiUrl
 */
export function getPathFromUrl() {
    try {
                
        const pathname = window.location.pathname;

        // Check if this is a group board
        if (pathname.includes('/groups/') && pathname.includes('/-/boards')) {
            // Extract group path for group boards
            // Format: /groups/[group-path]/-/boards
            const groupPattern = /\/groups\/([^\/]+(?:\/[^\/]+)*)\/?-?\/?boards/;
            const match = pathname.match(groupPattern);

            if (!match || !match[1]) {
                console.warn('Could not extract group path from URL:', pathname);
                return null;
            }

            const path = match[1];
            
            // Make sure we don't have "/-" at the end of the path
            const cleanPath = path.replace(/\/-$/, '');

            // Correctly encode the path
            const encodedPath = encodeURIComponent(cleanPath);
            
            // Construct group API URL
            const apiUrl = `groups/${encodedPath}/labels`;
            
            return {
                path: cleanPath,
                encodedPath,
                type: 'group',
                apiUrl
            };
        }
        // Check if this is a project board
        else if (pathname.includes('/-/boards')) {
            // Extract project path for project boards
            // Format: /[project-path]/-/boards
            const projectPattern = /^\/([^\/]+(?:\/[^\/]+)*)\/-\/boards/;
            const match = pathname.match(projectPattern);

            if (!match || !match[1]) {
                console.warn('Could not extract project path from URL pattern:', pathname);
                return null;
            }

            const path = match[1];
            
            // Correctly encode the path
            const encodedPath = encodeURIComponent(path);
            
            // Construct project API URL
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

/**
 * Get current URL key for storing history
 * @returns {string} Sanitized URL string
 */
export function getCurrentUrlKey() {
    const url = window.location.href;
    // Remove any fragment identifiers
    return url.split('#')[0];
}

/**
 * Get URL specific history key
 * @returns {string} Key for storing history data
 */
export function getHistoryKey() {
    return `timeEstimateHistory_${getCurrentUrlKey()}`;
}
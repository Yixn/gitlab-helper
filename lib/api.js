// GitLab API Class for Sprint Helper

class GitLabAPI {
    constructor() {
        this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
        this.baseUrl = '/api/v4';
    }

    /**
     * Make an API call to GitLab
     * @param {string} endpoint - API endpoint (without /api/v4 prefix)
     * @param {Object} options - Request options
     * @param {string} options.method - HTTP method (GET, POST, PATCH, etc.)
     * @param {Object} options.data - Data to send (for POST, PATCH, etc.)
     * @param {Object} options.params - URL query parameters
     * @returns {Promise} - Promise resolving to JSON response
     */
    callGitLabApi(endpoint, options = {}) {
        const {
            method = 'GET',
            data = null,
            params = null
        } = options;

        // Build URL with query parameters if provided
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

        // Set up fetch options
        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin' // Include cookies
        };

        // Add CSRF token for non-GET requests
        if (method !== 'GET' && this.csrfToken) {
            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
        }

        // Add request body for methods that support it
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            fetchOptions.body = JSON.stringify(data);
        }

        // Execute the fetch request
        return fetch(url, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }
                return response.json();
            });
    }

    /**
     * Get issue details
     * @param {Object} issueItem - Issue item from Vue component
     * @returns {Promise} - Promise resolving to issue data
     */
    getIssue(issueItem) {
        const projectPath = issueItem.referencePath.split('#')[0];
        const issueIid = issueItem.iid;

        const encodedPath = encodeURIComponent(projectPath);
        return this.callGitLabApi(`projects/${encodedPath}/issues/${issueIid}`);
    }

    /**
     * Add a comment to an issue
     * @param {Object} issueItem - Issue item from Vue component
     * @param {string} commentBody - Comment text
     * @returns {Promise} - Promise resolving to created note data
     */
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

    /**
     * Get current user information
     * @returns {Promise} - Promise resolving to user data
     */
    getCurrentUser() {
        return this.callGitLabApi('user');
    }

    /**
     * Get project information
     * @param {string} projectId - Project ID or encoded path
     * @returns {Promise} - Promise resolving to project data
     */
    getProject(projectId) {
        return this.callGitLabApi(`projects/${projectId}`);
    }

    /**
     * Get project issues
     * @param {string} projectId - Project ID or encoded path
     * @param {Object} params - Query parameters (state, labels, etc.)
     * @returns {Promise} - Promise resolving to issues array
     */
    getProjectIssues(projectId, params = {}) {
        return this.callGitLabApi(`projects/${projectId}/issues`, { params });
    }

    /**
     * Get milestone details
     * @param {string} projectId - Project ID or encoded path
     * @param {number} milestoneId - Milestone ID
     * @returns {Promise} - Promise resolving to milestone data
     */
    getMilestone(projectId, milestoneId) {
        return this.callGitLabApi(`projects/${projectId}/milestones/${milestoneId}`);
    }

    /**
     * Update an issue
     * @param {Object} issueItem - Issue item from Vue component
     * @param {Object} updateData - Data to update (title, description, etc.)
     * @returns {Promise} - Promise resolving to updated issue data
     */
    updateIssue(issueItem, updateData) {
        const projectPath = issueItem.referencePath.split('#')[0];
        const issueIid = issueItem.iid;

        const encodedPath = encodeURIComponent(projectPath);
        return this.callGitLabApi(
            `projects/${encodedPath}/issues/${issueIid}`,
            {
                method: 'PUT',
                data: updateData
            }
        );
    }

    /**
     * Extract issue item from board card Vue component
     * @param {HTMLElement} boardCard - DOM element representing a board card
     * @returns {Object|null} - Issue item from Vue component or null if not found
     */
    getIssueItemFromCard(boardCard) {
        try {
            if (boardCard.__vue__ && boardCard.__vue__.$children) {
                // Find the issue in the $children array
                const issueComponent = boardCard.__vue__.$children.find(child =>
                    child.$props && child.$props.item);

                if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                    return issueComponent.$props.item;
                }
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }
        return null;
    }
}

// Create a global instance
const gitlabApi = new GitLabAPI();
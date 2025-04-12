
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
        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
            },
            credentials: 'same-origin' // Include cookies
        };
        if (method !== 'GET' && this.csrfToken) {
            fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
        }
        if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
            fetchOptions.body = JSON.stringify(data);
        }
        return fetch(url, fetchOptions)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
                }
                return response.json();
            });
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
}

export default GitLabAPI;
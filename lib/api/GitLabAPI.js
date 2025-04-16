class GitLabAPI {
  constructor() {
    this.csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');
    this.baseUrl = '/api/v4';
  }
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
        'Content-Type': 'application/json'
      },
      credentials: 'same-origin'
    };
    if (method !== 'GET' && this.csrfToken) {
      fetchOptions.headers['X-CSRF-Token'] = this.csrfToken;
    }
    if (data && ['POST', 'PUT', 'PATCH'].includes(method)) {
      fetchOptions.body = JSON.stringify(data);
    }
    return fetch(url, fetchOptions).then(response => {
      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }
      return response.json();
    });
  }
  addComment(issueItem, commentBody) {
    const projectPath = issueItem.referencePath.split('#')[0];
    const issueIid = issueItem.iid;
    const encodedPath = encodeURIComponent(projectPath);
    return this.callGitLabApi(`projects/${encodedPath}/issues/${issueIid}/notes`, {
      method: 'POST',
      data: {
        body: commentBody
      }
    });
  }
  getCurrentUser() {
    return this.callGitLabApi('user');
  }
  callGitLabApiWithCache(endpoint, options = {}, cacheDuration = 60000) {
    const cacheKey = `gitlab_api_cache_${endpoint}_${JSON.stringify(options)}`;
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData) {
      try {
        const {
          data,
          timestamp
        } = JSON.parse(cachedData);
        const now = Date.now();
        if (now - timestamp < cacheDuration) {
          return Promise.resolve(data);
        }
      } catch (e) {
        console.warn('Error parsing cached data:', e);
      }
    }
    return this.callGitLabApi(endpoint, options).then(data => {
      localStorage.setItem(cacheKey, JSON.stringify({
        data,
        timestamp: Date.now()
      }));
      return data;
    });
  }
}
window.gitlabApi = window.gitlabApi || new GitLabAPI();
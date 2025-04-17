export function getPathFromUrl() {
  try {
    const pathname = window.location.pathname;
    if (pathname.includes('/groups/') && pathname.includes('/-/boards')) {
      const groupPattern = /\/groups\/([^\/]+(?:\/[^\/]+)*)\/?-?\/?boards/;
      const match = pathname.match(groupPattern);
      if (!match || !match[1]) {
        console.warn('Could not extract group path from URL:', pathname);
        return null;
      }
      const path = match[1];
      const cleanPath = path.replace(/\/-$/, '');
      const encodedPath = encodeURIComponent(cleanPath);
      const apiUrl = `groups/${encodedPath}/labels`;
      return {
        path: cleanPath,
        encodedPath,
        type: 'group',
        apiUrl
      };
    } else if (pathname.includes('/-/boards')) {
      const projectPattern = /^\/([^\/]+(?:\/[^\/]+)*)\/-\/boards/;
      const match = pathname.match(projectPattern);
      if (!match || !match[1]) {
        console.warn('Could not extract project path from URL pattern:', pathname);
        return null;
      }
      const path = match[1];
      const encodedPath = encodeURIComponent(path);
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
export function getCurrentUrlKey() {
  const url = window.location.href;
  return url.split('#')[0];
}
export function getHistoryKey() {
  return `timeEstimateHistory_${getCurrentUrlKey()}`;
}
export async function fetchAllBoards() {
  try {
    if (!this.gitlabApi) {
      this.gitlabApi = window.gitlabApi;
    }
    if (!this.gitlabApi) {
      throw new Error('GitLab API not available');
    }
    const pathInfo = getPathFromUrl();
    if (!pathInfo) {
      throw new Error('Could not determine project/group path');
    }
    let endpoint;
    if (pathInfo.type === 'project') {
      endpoint = `projects/${pathInfo.encodedPath}/boards`;
    } else if (pathInfo.type === 'group') {
      endpoint = `groups/${pathInfo.encodedPath}/boards`;
    } else {
      throw new Error('Unsupported path type: ' + pathInfo.type);
    }
    let allBoards = [];
    let page = 1;
    let hasMorePages = true;
    while (hasMorePages) {
      const boards = await this.gitlabApi.callGitLabApi(endpoint, {
        params: {
          per_page: 100,
          page: page
        }
      });
      if (boards && boards.length > 0) {
        allBoards = [...allBoards, ...boards];
        page++;
      } else {
        hasMorePages = false;
      }
    }
    var boardNames = allBoards[0].lists.map(list => list.label.name);
    boardNames.push("Closed");
    boardNames.unshift("Open");
    return boardNames;
  } catch (error) {
    console.error('Error fetching boards:', error);
    return [];
  }


}
export function hasOnlyAllowedParams() {
  try {
    const urlParams = new URLSearchParams(window.location.search);
    const allowedParams = ['milestone_title', 'assignee_username'];
    let paramCount = 0;
    let disallowedParamFound = false;

    urlParams.forEach((value, key) => {
      paramCount++;
      if (!allowedParams.includes(key)) {
        disallowedParamFound = true;
      }
    });
    return !disallowedParamFound && paramCount > 0;
  } catch (error) {
    console.error('Error checking URL parameters:', error);
    return false;
  }
}
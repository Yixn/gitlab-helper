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
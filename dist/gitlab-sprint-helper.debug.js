// ==UserScript==
// @name         GitLab Sprint Helper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Display a summary of assignees' time estimates on GitLab boards with API integration and comment shortcuts
// @author       Daniel Samer | Linkster
// @match        https://gitlab.com/*/boards/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// @downloadURL  https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// ==/UserScript==

// GitLab Sprint Helper - Combined Script
(function(window) {

// File: lib/core/Utils.js
window.formatHours = function formatHours(seconds) {
  return seconds / 3600;
}
window.generateColorFromString = function generateColorFromString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 70%, 75%)`;
}
window.getContrastColor = function getContrastColor(bgColor) {
  if (bgColor.startsWith('hsl')) {
    const matches = bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%\s*\)/);
    if (matches && matches[1]) {
      const lightness = parseInt(matches[1], 10);
      return lightness > 60 ? 'black' : 'white';
    }
  }
  let r = 0,
    g = 0,
    b = 0;
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
      return bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/) ? parseInt(bgColor.match(/hsl\(\s*\d+\s*,\s*\d+%\s*,\s*(\d+)%/)[1], 10) > 60 ? 'black' : 'white' : 'black';
    }
    return 'black';
  }
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? 'black' : 'white';
}
window.isActiveInputElement = function isActiveInputElement(element) {
  if (element.tagName === 'INPUT') {
    const type = element.getAttribute('type');
    const typingInputs = ['text', 'password', 'email', 'search', 'tel', 'url', null, ''];
    return typingInputs.includes(type);
  }
  if (element.tagName === 'TEXTAREA') {
    return true;
  }
  if (element.hasAttribute('contenteditable') && element.getAttribute('contenteditable') !== 'false') {
    return true;
  }
  return false;
}

// File: lib/api/APIUtils.js
window.getPathFromUrl = function getPathFromUrl() {
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
window.getCurrentUrlKey = function getCurrentUrlKey() {
  const url = window.location.href;
  return url.split('#')[0];
}
window.getHistoryKey = function getHistoryKey() {
  return `timeEstimateHistory_${getCurrentUrlKey()}`;
}
window.fetchAllBoards = async function() {
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

// File: lib/api/GitLabAPI.js
window.GitLabAPI = class GitLabAPI {
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

// File: lib/core/DataProcessor.js
window.processBoards = function processBoards() {
  const assigneeTimeMap = {};
  const boardData = {};
  const boardAssigneeData = {};
  let totalEstimate = 0;
  let cardsProcessed = 0;
  let cardsWithTime = 0;
  let currentMilestone = null;
  let closedBoardCards = 0;
  const userDistributionMap = {};
  const userDataMap = {};
  const boardLists = document.querySelectorAll('.board-list');
  boardLists.forEach((boardList, listIndex) => {
    let boardTitle = "U" + listIndex.toString();
    try {
      if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
        const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
        if (boardComponent && boardComponent.$props.list.title) {
          boardTitle = boardComponent.$props.list.title;
        }
      }
      if (boardTitle === 'Unknown') {
        const boardHeader = boardList.querySelector('.board-title-text');
        if (boardHeader) {
          boardTitle = boardHeader.textContent.trim();
        }
      }
    } catch (e) {
      console.error('Error getting board title:', e);
      const boardHeader = boardList.querySelector('.board-title-text');
      if (boardHeader) {
        boardTitle = boardHeader.textContent.trim();
      }
    }
    if (boardTitle !== 'Unknown') {
      if (!boardData[boardTitle]) {
        boardData[boardTitle] = {
          tickets: 0,
          timeEstimate: 0
        };
      }
      if (!boardAssigneeData[boardTitle]) {
        boardAssigneeData[boardTitle] = {};
      }
      const lowerTitle = boardTitle.toLowerCase();
      const isClosedBoard = lowerTitle.includes('done') || lowerTitle.includes('closed') || lowerTitle.includes('complete') || lowerTitle.includes('finished');
    } else {
      return;
    }
    const boardItems = boardList.querySelectorAll('.board-card');
    const lowerTitle = boardTitle.toLowerCase();
    const isClosedBoard = lowerTitle.includes('done') || lowerTitle.includes('closed') || lowerTitle.includes('complete') || lowerTitle.includes('finished');
    if (isClosedBoard) {
      closedBoardCards += boardItems.length;
    }
    boardItems.forEach(item => {
      try {
        cardsProcessed++;
        boardData[boardTitle].tickets++;
        if (item.__vue__ && item.__vue__.$children) {
          const issue = item.__vue__.$children.find(child => child.$props && child.$props.item && child.$props.item.timeEstimate !== undefined);
          if (issue && issue.$props) {
            const props = issue.$props;
            if (!currentMilestone && props.item && props.item.milestone) {
              currentMilestone = props.item.milestone.title;
            }
            if (props.item && props.item.timeEstimate) {
              cardsWithTime++;
              const timeEstimate = props.item.timeEstimate;
              totalEstimate += timeEstimate;
              boardData[boardTitle].timeEstimate += timeEstimate;
              let assignees = [];
              if (props.item.assignees && props.item.assignees.nodes && props.item.assignees.nodes.length) {
                assignees = props.item.assignees.nodes;
              } else if (props.item.assignees && props.item.assignees.length > 0) {
                assignees = props.item.assignees;
              }
              if (assignees.length > 0) {
                assignees.forEach(assignee => {
                  const assigneeShare = timeEstimate / assignees.length;
                  const name = assignee.name;
                  const username = assignee.username || '';
                  if (!userDataMap[name]) {
                    userDataMap[name] = {
                      name: name,
                      username: username,
                      avatar_url: assignee.avatarUrl || '',
                      timeEstimate: 0
                    };
                  }
                  userDataMap[name].timeEstimate += assigneeShare;
                  if (!userDistributionMap[name]) {
                    userDistributionMap[name] = {};
                    Object.keys(boardData).forEach(board => {
                      userDistributionMap[name][board] = 0;
                    });
                  }
                  userDistributionMap[name][boardTitle] = (userDistributionMap[name][boardTitle] || 0) + assigneeShare;
                  if (!assigneeTimeMap[name]) {
                    assigneeTimeMap[name] = 0;
                  }
                  assigneeTimeMap[name] += assigneeShare;
                  if (!boardAssigneeData[boardTitle][name]) {
                    boardAssigneeData[boardTitle][name] = {
                      tickets: 0,
                      timeEstimate: 0
                    };
                  }
                  boardAssigneeData[boardTitle][name].tickets++;
                  boardAssigneeData[boardTitle][name].timeEstimate += assigneeShare;
                });
              } else {
                if (!userDistributionMap['Unassigned']) {
                  userDistributionMap['Unassigned'] = {};
                  Object.keys(boardData).forEach(board => {
                    userDistributionMap['Unassigned'][board] = 0;
                  });
                }
                userDistributionMap['Unassigned'][boardTitle] = (userDistributionMap['Unassigned'][boardTitle] || 0) + timeEstimate;
                if (!assigneeTimeMap['Unassigned']) {
                  assigneeTimeMap['Unassigned'] = 0;
                }
                assigneeTimeMap['Unassigned'] += timeEstimate;
                if (!boardAssigneeData[boardTitle]['Unassigned']) {
                  boardAssigneeData[boardTitle]['Unassigned'] = {
                    tickets: 0,
                    timeEstimate: 0
                  };
                }
                boardAssigneeData[boardTitle]['Unassigned'].tickets++;
                boardAssigneeData[boardTitle]['Unassigned'].timeEstimate += timeEstimate;
              }
            }
          }
        }
      } catch (e) {
        console.error('Error processing card:', e);
      }
    });
    uiManager.issueSelector.applyOverflowFixes();
  });
  const formattedUserDistributions = {};
  Object.keys(userDistributionMap).forEach(name => {
    const orderedBoards = Object.keys(userDistributionMap[name]).sort((a, b) => {
      const aIsClosed = a.toLowerCase().includes('done') || a.toLowerCase().includes('closed') || a.toLowerCase().includes('complete') || a.toLowerCase().includes('finished');
      const bIsClosed = b.toLowerCase().includes('done') || b.toLowerCase().includes('closed') || b.toLowerCase().includes('complete') || b.toLowerCase().includes('finished');
      if (aIsClosed && !bIsClosed) return 1;
      if (!aIsClosed && bIsClosed) return -1;
      return a.localeCompare(b);
    });
    formattedUserDistributions[name] = {
      distribution: orderedBoards.map(board => {
        const timeInSeconds = userDistributionMap[name][board] || 0;
        return Math.round(formatHours(timeInSeconds));
      }),
      username: userDataMap[name]?.username || '',
      avatar_url: userDataMap[name]?.avatar_url || ''
    };
  });
  try {
    if (window.historyManager) {
      window.historyManager.saveHistoryEntry({
        assigneeTimeMap,
        boardData,
        boardAssigneeData,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone,
        closedBoardCards,
        userDistributions: formattedUserDistributions,
        userData: userDataMap
      });
    }
  } catch (e) {
    console.error('Error saving history data:', e);
  }
  return {
    assigneeTimeMap,
    boardData,
    boardAssigneeData,
    totalEstimate,
    cardsProcessed,
    cardsWithTime,
    currentMilestone,
    closedBoardCards,
    userDistributions: formattedUserDistributions,
    userData: userDataMap
  };
}

// File: lib/core/HistoryManager.js
window.HistoryManager = class HistoryManager {
  constructor() {
    this.historyData = {};
  }
  getBoardKey() {
    try {
      const url = window.location.href;
      const splitAtBoards = url.split('/boards/');
      if (splitAtBoards.length < 2) {
        return 'unknown-board';
      }
      return splitAtBoards[1];
    } catch (error) {
      console.error('Error generating board key:', error);
      return 'unknown-board';
    }
  }
  saveHistoryEntry(data) {
    try {
      const boardKey = this.getBoardKey();
      const today = new Date().toISOString().split('T')[0];
      const history = this.loadHistory();
      if (!history[boardKey]) {
        history[boardKey] = {};
      }
      const userPerformance = data.userPerformance || {};
      const userDistributions = data.userDistributions || {};
      const userData = data.userData || {};
      const boardAssigneeData = data.boardAssigneeData || {};
      if (Object.keys(userPerformance).length > 0 && Object.keys(userDistributions).length > 0) {
        Object.entries(userPerformance).forEach(([name, performanceData]) => {
          if (userDistributions[name]) {
            userPerformance[name].distribution = userDistributions[name].distribution;
            if (userDistributions[name].username) {
              userPerformance[name].username = userDistributions[name].username;
            }
            if (userDistributions[name].avatar_url) {
              userPerformance[name].avatar_url = userDistributions[name].avatar_url;
            }
          }
          if (userData[name]) {
            if (!userPerformance[name].username && userData[name].username) {
              userPerformance[name].username = userData[name].username;
            }
            if (!userPerformance[name].avatar_url && userData[name].avatar_url) {
              userPerformance[name].avatar_url = userData[name].avatar_url;
            }
          }
        });
      }
      history[boardKey][today] = {
        ...data,
        userDistributions: userDistributions,
        userData: userData,
        timestamp: new Date().toISOString(),
        boardAssigneeData: boardAssigneeData
      };
      localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));
      return true;
    } catch (error) {
      console.error('Error saving history entry:', error);
      return false;
    }
  }
  loadHistory() {
    try {
      const historyData = localStorage.getItem('gitLabHelperHistory');
      if (!historyData) {
        return {};
      }
      return JSON.parse(historyData);
    } catch (error) {
      console.error('Error loading history data:', error);
      return {};
    }
  }
  getCurrentBoardHistory() {
    const boardKey = this.getBoardKey();
    const history = this.loadHistory();
    return history[boardKey] || {};
  }
  clearAllHistory() {
    try {
      localStorage.removeItem('gitLabHelperHistory');
      return true;
    } catch (error) {
      console.error('Error clearing history:', error);
      return false;
    }
  }
  clearCurrentBoardHistory() {
    try {
      const boardKey = this.getBoardKey();
      const history = this.loadHistory();
      if (history[boardKey]) {
        delete history[boardKey];
        localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));
      }
      return true;
    } catch (error) {
      console.error('Error clearing board history:', error);
      return false;
    }
  }
}

// File: lib/storage/LocalStorage.js
window.saveToStorage = function saveToStorage(key, value) {
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
window.loadFromStorage = function loadFromStorage(key, defaultValue = null) {
  try {
    const value = localStorage.getItem(key);
    if (value === null) {
      return defaultValue;
    }
    if (value.trim().startsWith('{') || value.trim().startsWith('[')) {
      try {
        return JSON.parse(value);
      } catch (e) {
        console.warn(`Failed to parse value for ${key} as JSON, returning as string instead`);
        return value;
      }
    }
    return value;
  } catch (error) {
    console.error(`Error loading from localStorage (${key}):`, error);
    return defaultValue;
  }
}

// File: lib/storage/SettingsStorage.js
const STORAGE_KEYS = {
  LABEL_WHITELIST: 'gitLabHelperLabelWhitelist',
  ASSIGNEE_WHITELIST: 'gitLabHelperAssigneeWhitelist',
  LAST_ACTIVE_TAB: 'gitLabHelperLastActiveTab',
  UI_COLLAPSED: 'gitlabTimeSummaryCollapsed'
};
const DEFAULT_SETTINGS = {
  labelWhitelist: ['bug', 'feature', 'documentation', 'enhancement', 'security', 'priority', 'high', 'medium', 'low', 'critical', 'frontend', 'backend', 'ui', 'ux', 'api', 'wontfix', 'duplicate', 'invalid', 'question', 'ready', 'in progress', 'review', 'blocked'],
  assigneeWhitelist: [],
  lastActiveTab: 'summary',
  uiCollapsed: false,
  toggleShortcut: 'c'
};
window.getLabelWhitelist = function getLabelWhitelist() {
  try {
    const whitelist = loadFromStorage(STORAGE_KEYS.LABEL_WHITELIST, null);
    if (whitelist === null) {
      return [...DEFAULT_SETTINGS.labelWhitelist];
    }
    if (!Array.isArray(whitelist)) {
      console.warn('Label whitelist is not an array, using default');
      return [...DEFAULT_SETTINGS.labelWhitelist];
    }
    const cleanedWhitelist = whitelist.filter(item => typeof item === 'string');
    if (cleanedWhitelist.length === 0 && whitelist.length > 0) {
      console.warn('Label whitelist contained no valid strings, using default');
      return [...DEFAULT_SETTINGS.labelWhitelist];
    }
    return cleanedWhitelist;
  } catch (error) {
    console.error('Error getting label whitelist:', error);
    return [...DEFAULT_SETTINGS.labelWhitelist];
  }
}
window.saveLabelWhitelist = function saveLabelWhitelist(whitelist) {
  try {
    if (!Array.isArray(whitelist)) {
      console.warn('Attempting to save invalid whitelist (not an array), using empty array instead');
      whitelist = [];
    }
    const cleanedWhitelist = whitelist.filter(item => typeof item === 'string');
    return saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, cleanedWhitelist);
  } catch (error) {
    console.error('Error saving label whitelist:', error);
    return false;
  }
}
window.resetLabelWhitelist = function resetLabelWhitelist() {
  try {
    const defaultWhitelist = [...DEFAULT_SETTINGS.labelWhitelist];
    saveToStorage(STORAGE_KEYS.LABEL_WHITELIST, defaultWhitelist);
    return defaultWhitelist;
  } catch (error) {
    console.error('Error resetting label whitelist:', error);
    return [...DEFAULT_SETTINGS.labelWhitelist];
  }
}
window.getAssigneeWhitelist = function getAssigneeWhitelist() {
  try {
    const whitelist = loadFromStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, null);
    if (whitelist === null) {
      return [];
    }
    if (!Array.isArray(whitelist)) {
      console.warn('Assignee whitelist is not an array, using empty array');
      return [];
    }
    return whitelist.filter(item => item && typeof item === 'object' && typeof item.username === 'string');
  } catch (error) {
    console.error('Error getting assignee whitelist:', error);
    return [];
  }
}
window.saveAssigneeWhitelist = function saveAssigneeWhitelist(whitelist) {
  try {
    if (!Array.isArray(whitelist)) {
      console.warn('Attempting to save invalid assignee whitelist (not an array), using empty array instead');
      whitelist = [];
    }
    const cleanedWhitelist = whitelist.filter(item => item && typeof item === 'object' && typeof item.username === 'string');
    return saveToStorage(STORAGE_KEYS.ASSIGNEE_WHITELIST, cleanedWhitelist);
  } catch (error) {
    console.error('Error saving assignee whitelist:', error);
    return false;
  }
}
window.getLastActiveTab = function getLastActiveTab() {
  try {
    const tabId = loadFromStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, null);
    if (tabId === null) {
      return DEFAULT_SETTINGS.lastActiveTab;
    }
    if (typeof tabId !== 'string') {
      const stringTabId = String(tabId);
      if (stringTabId && ['summary', 'boards', 'bulkcomments', 'sprintmanagement'].includes(stringTabId)) {
        return stringTabId;
      }
      console.warn('Invalid tab ID format, using default');
      return DEFAULT_SETTINGS.lastActiveTab;
    }
    if (tabId === 'history') {
      return 'summary';
    }
    if (!['summary', 'boards', 'bulkcomments', 'sprintmanagement'].includes(tabId)) {
      console.warn(`Unknown tab ID: ${tabId}, using default`);
      return DEFAULT_SETTINGS.lastActiveTab;
    }
    return tabId;
  } catch (error) {
    console.error('Error getting last active tab:', error);
    return DEFAULT_SETTINGS.lastActiveTab;
  }
}
window.saveLastActiveTab = function saveLastActiveTab(tabId) {
  try {
    const tabIdStr = String(tabId);
    if (!['summary', 'boards', 'bulkcomments', 'sprintmanagement'].includes(tabIdStr)) {
      console.warn(`Attempting to save invalid tab ID: ${tabIdStr}, using default`);
      return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, DEFAULT_SETTINGS.lastActiveTab);
    }
    return saveToStorage(STORAGE_KEYS.LAST_ACTIVE_TAB, tabIdStr);
  } catch (error) {
    console.error('Error saving last active tab:', error);
    return false;
  }
}
window.getToggleShortcut = function getToggleShortcut() {
  try {
    const shortcut = loadFromStorage(STORAGE_KEYS.TOGGLE_SHORTCUT, null);
    if (shortcut === null) {
      return DEFAULT_SETTINGS.toggleShortcut;
    }
    if (typeof shortcut === 'string' && shortcut.length === 1) {
      return shortcut;
    }
    console.warn('Invalid toggle shortcut format, using default');
    return DEFAULT_SETTINGS.toggleShortcut;
  } catch (error) {
    console.error('Error getting toggle shortcut:', error);
    return DEFAULT_SETTINGS.toggleShortcut;
  }
}
window.saveToggleShortcut = function saveToggleShortcut(shortcut) {
  try {
    if (typeof shortcut !== 'string' || shortcut.length !== 1) {
      console.warn('Attempting to save invalid shortcut, using default');
      shortcut = DEFAULT_SETTINGS.toggleShortcut;
    }
    return saveToStorage(STORAGE_KEYS.TOGGLE_SHORTCUT, shortcut);
  } catch (error) {
    console.error('Error saving toggle shortcut:', error);
    return false;
  }
}

// File: lib/ui/components/Notification.js
window.Notification = class Notification {
  constructor(options = {}) {
    this.position = 'top-right';
    this.duration = options.duration || 3000;
    this.animationDuration = options.animationDuration || '0.3s';
    this.container = null;
    this.createContainer();
  }
  createContainer() {
    if (document.getElementById('gitlab-helper-notifications')) {
      this.container = document.getElementById('gitlab-helper-notifications');
      return;
    }
    this.container = document.createElement('div');
    this.container.id = 'gitlab-helper-notifications';
    this.container.style.position = 'fixed';
    this.container.style.zIndex = '100';
    switch (this.position) {
      case 'top-right':
        this.container.style.top = '120px';
        this.container.style.right = '20px';
        break;
      case 'top-left':
        this.container.style.top = '20px';
        this.container.style.left = '20px';
        break;
      case 'top-center':
        this.container.style.top = '20px';
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-left':
        this.container.style.bottom = '20px';
        this.container.style.left = '20px';
        break;
      case 'bottom-center':
        this.container.style.bottom = '20px';
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-right':
      default:
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        break;
    }
    document.body.appendChild(this.container);
  }
  show(options) {
    const message = options.message || '';
    const type = options.type || 'info';
    const duration = options.duration || this.duration;
    const onClose = options.onClose || null;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.padding = '12px 16px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.justifyContent = 'space-between';
    notification.style.minWidth = '200px';
    notification.style.maxWidth = '350px';
    notification.style.opacity = '0';
    notification.style.transform = this.getInitialTransform();
    notification.style.transition = `opacity ${this.animationDuration} ease, transform ${this.animationDuration} ease`;
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#28a745';
        notification.style.color = 'white';
        break;
      case 'error':
        notification.style.backgroundColor = '#dc3545';
        notification.style.color = 'white';
        break;
      case 'warning':
        notification.style.backgroundColor = '#ffc107';
        notification.style.color = 'black';
        break;
      case 'info':
      default:
        notification.style.backgroundColor = '#17a2b8';
        notification.style.color = 'white';
        break;
    }
    const messageContainer = document.createElement('div');
    messageContainer.style.flex = '1';
    messageContainer.textContent = message;
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = notification.style.color;
    closeButton.style.fontSize = '18px';
    closeButton.style.marginLeft = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.style.opacity = '0.7';
    closeButton.style.transition = 'opacity 0.2s ease';
    closeButton.style.outline = 'none';
    closeButton.addEventListener('mouseenter', () => {
      closeButton.style.opacity = '1';
    });
    closeButton.addEventListener('mouseleave', () => {
      closeButton.style.opacity = '0.7';
    });
    closeButton.addEventListener('click', () => {
      this.close(notification, onClose);
    });
    notification.appendChild(messageContainer);
    notification.appendChild(closeButton);
    this.container.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 10);
    if (duration > 0) {
      setTimeout(() => {
        this.close(notification, onClose);
      }, duration);
    }
    return notification;
  }
  close(notification, callback = null) {
    if (notification.dataset.closing === 'true') {
      return;
    }
    notification.dataset.closing = 'true';
    notification.style.opacity = '0';
    notification.style.transform = this.getInitialTransform();
    setTimeout(() => {
      if (notification.parentNode === this.container) {
        this.container.removeChild(notification);
      }
      if (callback && typeof callback === 'function') {
        callback();
      }
    }, parseFloat(this.animationDuration) * 1000);
  }
  getInitialTransform() {
    if (this.position.startsWith('top')) {
      return 'translateY(-20px)';
    } else {
      return 'translateY(20px)';
    }
  }
  success(message, options = {}) {
    return this.show({
      message,
      type: 'success',
      ...options
    });
  }
  error(message, options = {}) {
    return this.show({
      message,
      type: 'error',
      ...options
    });
  }
  warning(message, options = {}) {
    return this.show({
      message,
      type: 'warning',
      ...options
    });
  }
  info(message, options = {}) {
    return this.show({
      message,
      type: 'info',
      ...options
    });
  }
}

// File: lib/ui/components/CommandShortcut.js
window.CommandShortcut = class CommandShortcut {
  constructor(options) {
    this.targetElement = options.targetElement;
    this.onShortcutInsert = options.onShortcutInsert || null;
    this.shortcutsContainer = null;
    this.shortcuts = {};
  }
  initialize(parentElement) {
    if (this.shortcutsContainer && this.shortcutsContainer.parentNode) {
      this.shortcutsContainer.parentNode.removeChild(this.shortcutsContainer);
    }
    this.shortcutsContainer = document.createElement('div');
    this.shortcutsContainer.className = 'command-shortcuts-container';
    this.shortcutsContainer.style.marginBottom = '10px';
    this.shortcutsContainer.style.display = 'flex';
    this.shortcutsContainer.style.flexDirection = 'column';
    this.shortcutsContainer.style.gap = '8px';
    this.shortcutsContainer.style.alignItems = 'stretch';
    parentElement.appendChild(this.shortcutsContainer);
    this.initializeEstimateShortcut();
  }
  initializeEstimateShortcut() {
    if (this.shortcuts['estimate']) {
      this.removeShortcut('estimate');
    }
    this.addCustomShortcut({
      type: 'estimate',
      label: '/estimate',
      items: [{
        value: '',
        label: 'Estimate Hours'
      }, {
        value: '1',
        label: '1h'
      }, {
        value: '2',
        label: '2h'
      }, {
        value: '4',
        label: '4h'
      }, {
        value: '8',
        label: '8h'
      }, {
        value: '16',
        label: '16h'
      }, {
        value: '32',
        label: '32h'
      }, {
        value: 'custom',
        label: 'Custom...'
      }],
      onSelect: value => {
        if (value === 'custom') {
          this.handleCustomEstimate();
        } else if (value) {
          this.insertEstimateText(value);
        }
      }
    });
  }
  removeShortcut(type) {
    if (this.shortcuts[type] && this.shortcuts[type].element) {
      const element = this.shortcuts[type].element;
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      delete this.shortcuts[type];
    }
  }
  handleCustomEstimate() {
    const customValue = prompt('Enter custom estimate hours (whole numbers only):', '');
    if (customValue === null || customValue === '') {
      return;
    }
    const parsedValue = parseInt(customValue, 10);
    if (isNaN(parsedValue) || parsedValue <= 0 || parsedValue !== parseFloat(customValue)) {
      alert('Please enter a valid positive whole number.');
      return;
    }
    this.insertEstimateText(parsedValue.toString());
  }
  insertEstimateText(hours) {
    if (!this.targetElement) return;
    const estimateText = `/estimate ${hours}h`;
    const currentText = this.targetElement.value;
    const estimateRegex = /\/estimate\s+\d+h/g;
    const hasEstimate = estimateRegex.test(currentText);
    if (hasEstimate) {
      this.targetElement.value = currentText.replace(estimateRegex, estimateText);
    } else {
      const startPos = this.targetElement.selectionStart;
      const endPos = this.targetElement.selectionEnd;
      let insertText = estimateText;
      if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
        insertText = '\n' + insertText;
      }
      this.targetElement.value = currentText.substring(0, startPos) + insertText + currentText.substring(endPos);
      const newCursorPos = startPos + insertText.length;
      this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
    }
    this.targetElement.focus();
    if (typeof this.onShortcutInsert === 'function') {
      this.onShortcutInsert('estimate', hours);
    }
  }
  addCustomShortcut(options) {
    if (!this.shortcutsContainer) {
      console.error("Shortcuts container not initialized");
      return null;
    }
    if (this.shortcuts && this.shortcuts[options.type]) {
      this.removeShortcut(options.type);
    }
    const shortcutContainer = document.createElement('div');
    shortcutContainer.className = `shortcut-item ${options.type}-shortcut`;
    shortcutContainer.style.display = 'flex';
    shortcutContainer.style.alignItems = 'center';
    shortcutContainer.style.width = '100%';
    shortcutContainer.style.marginBottom = '8px';
    shortcutContainer.style.justifyContent = 'space-between';
    shortcutContainer.style.border = '1px solid #ddd';
    shortcutContainer.style.borderRadius = '4px';
    shortcutContainer.style.padding = '6px 10px';
    shortcutContainer.style.backgroundColor = '#f8f9fa';
    shortcutContainer.style.height = '36px';
    shortcutContainer.style.boxSizing = 'border-box';
    shortcutContainer.dataset.shortcutType = options.type;
    const labelContainer = document.createElement('div');
    labelContainer.style.display = 'flex';
    labelContainer.style.alignItems = 'center';
    labelContainer.style.minWidth = '100px';
    labelContainer.style.flexShrink = '0';
    const shortcutLabel = document.createElement('div');
    shortcutLabel.textContent = options.label;
    shortcutLabel.style.fontSize = '13px';
    shortcutLabel.style.fontWeight = 'bold';
    shortcutLabel.style.color = '#555';
    shortcutLabel.style.whiteSpace = 'nowrap';
    labelContainer.appendChild(shortcutLabel);
    let toggleButton = null;
    let isAddMode = true;
    let originalItems = [...options.items];
    if (options.toggleMode) {
      toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.innerHTML = '+';
      toggleButton.title = 'Toggle between Add and Remove mode';
      toggleButton.style.marginLeft = '6px';
      toggleButton.style.width = '20px';
      toggleButton.style.height = '20px';
      toggleButton.style.display = 'flex';
      toggleButton.style.alignItems = 'center';
      toggleButton.style.justifyContent = 'center';
      toggleButton.style.border = '1px solid #ccc';
      toggleButton.style.borderRadius = '50%';
      toggleButton.style.backgroundColor = '#28a745';
      toggleButton.style.color = 'white';
      toggleButton.style.fontSize = '14px';
      toggleButton.style.fontWeight = 'bold';
      toggleButton.style.cursor = 'pointer';
      toggleButton.style.padding = '0';
      toggleButton.style.lineHeight = '1';
      toggleButton.addEventListener('click', () => {
        isAddMode = !isAddMode;
        if (isAddMode) {
          toggleButton.innerHTML = '+';
          toggleButton.style.backgroundColor = '#28a745';
          toggleButton.title = 'Switch to Remove mode';
        } else {
          toggleButton.innerHTML = '−';
          toggleButton.style.backgroundColor = '#dc3545';
          toggleButton.title = 'Switch to Add mode';
        }
        if (dropdown.options.length > 0) {
          if (options.type === 'label') {
            dropdown.options[0].text = isAddMode ? 'Add Label' : 'Remove Label';
          } else if (options.type === 'assign') {
            dropdown.options[0].text = isAddMode ? 'Assign to...' : 'Unassign from...';
          }
        }
        dropdown.dataset.mode = isAddMode ? 'add' : 'remove';
      });
      labelContainer.appendChild(toggleButton);
    }
    const dropdownContainer = document.createElement('div');
    dropdownContainer.style.flex = '1';
    dropdownContainer.style.position = 'relative';
    dropdownContainer.style.height = '24px';
    dropdownContainer.style.marginLeft = '10px';
    const dropdown = document.createElement('select');
    dropdown.className = `${options.type}-dropdown`;
    dropdown.style.width = '100%';
    dropdown.style.height = '100%';
    dropdown.style.appearance = 'auto';
    dropdown.style.padding = '0 25px 0 8px';
    dropdown.style.fontSize = '13px';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.backgroundColor = '#fff';
    dropdown.style.boxSizing = 'border-box';
    dropdown.dataset.mode = 'add';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = options.items[0]?.label || 'Select...';
    placeholderOption.selected = true;
    dropdown.appendChild(placeholderOption);
    if (options.items && options.items.length > 0) {
      options.items.forEach((item, index) => {
        if (index === 0) return;
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        dropdown.appendChild(option);
      });
    }
    dropdown.addEventListener('change', e => {
      const selectedValue = e.target.value;
      if (selectedValue && options.onSelect) {
        const currentMode = dropdown.dataset.mode || 'add';
        options.onSelect(selectedValue, currentMode);
        e.target.value = '';
      }
    });
    dropdownContainer.appendChild(dropdown);
    shortcutContainer.appendChild(labelContainer);
    shortcutContainer.appendChild(dropdownContainer);
    const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
    const thisTypeIndex = shortcutOrder.indexOf(options.type);
    if (thisTypeIndex === -1) {
      this.shortcutsContainer.appendChild(shortcutContainer);
    } else {
      let inserted = false;
      const existingShortcuts = this.shortcutsContainer.querySelectorAll('.shortcut-item');
      for (let i = 0; i < existingShortcuts.length; i++) {
        const existingType = existingShortcuts[i].dataset.shortcutType;
        const existingIndex = shortcutOrder.indexOf(existingType);
        if (existingIndex > thisTypeIndex) {
          this.shortcutsContainer.insertBefore(shortcutContainer, existingShortcuts[i]);
          inserted = true;
          break;
        }
      }
      if (!inserted) {
        this.shortcutsContainer.appendChild(shortcutContainer);
      }
    }
    this.shortcuts[options.type] = {
      element: shortcutContainer,
      dropdown: dropdown,
      toggleButton: toggleButton,
      options: options
    };
    return shortcutContainer;
  }
}

// File: lib/ui/components/SelectionDisplay.js
window.SelectionDisplay = class SelectionDisplay {
  constructor(options = {}) {
    this.selectedIssues = options.selectedIssues || [];
    this.onRemoveIssue = options.onRemoveIssue || null;
    this.container = null;
    this.issuesList = null;
  }
  createSelectionContainer(container) {
    this.container = container;
    const selectedIssuesContainer = document.createElement('div');
    selectedIssuesContainer.style.marginBottom = '12px';
    selectedIssuesContainer.style.padding = '8px';
    selectedIssuesContainer.style.borderRadius = '4px';
    selectedIssuesContainer.style.border = '1px dashed #ccc';
    selectedIssuesContainer.style.backgroundColor = '#f9f9f9';
    selectedIssuesContainer.style.maxHeight = '150px';
    selectedIssuesContainer.style.overflowY = 'auto';
    const issueLabel = document.createElement('div');
    issueLabel.style.fontSize = '12px';
    issueLabel.style.color = '#666';
    issueLabel.style.marginBottom = '5px';
    issueLabel.textContent = 'Selected Issues:';
    selectedIssuesContainer.appendChild(issueLabel);
    const selectedIssuesList = document.createElement('div');
    selectedIssuesList.id = 'selected-issues-list';
    selectedIssuesList.style.fontSize = '14px';
    this.issuesList = selectedIssuesList;
    this.displayNoIssuesMessage();
    selectedIssuesContainer.appendChild(selectedIssuesList);
    container.appendChild(selectedIssuesContainer);
    this.updateDisplay();
  }
  displayNoIssuesMessage() {
    if (!this.issuesList) return;
    const existingMessage = this.issuesList.querySelector('#no-issues-selected');
    if (existingMessage) return;
    const noIssuesSelected = document.createElement('div');
    noIssuesSelected.id = 'no-issues-selected';
    noIssuesSelected.textContent = 'No issues selected';
    noIssuesSelected.style.color = '#666';
    noIssuesSelected.style.fontStyle = 'italic';
    this.issuesList.appendChild(noIssuesSelected);
  }
  updateDisplay() {
    if (!this.issuesList) {
      console.error('Issues list not initialized');
      return;
    }
    this.issuesList.innerHTML = '';
    if (!this.selectedIssues || this.selectedIssues.length === 0) {
      this.displayNoIssuesMessage();
      const container = this.issuesList.parentElement;
      if (container) {
        container.style.borderColor = '#ccc';
        container.style.backgroundColor = '#f9f9f9';
      }
      return;
    }
    const container = this.issuesList.parentElement;
    if (container) {
      container.style.borderColor = '#1f75cb';
      container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
    }
    this.selectedIssues.forEach((issue, index) => {
      if (!issue) return;
      const issueItem = document.createElement('div');
      issueItem.className = 'selected-issue-item';
      issueItem.style.padding = '5px';
      issueItem.style.marginBottom = '3px';
      issueItem.style.borderRadius = '3px';
      issueItem.style.backgroundColor = 'rgba(31, 117, 203, 0.1)';
      issueItem.style.display = 'flex';
      issueItem.style.justifyContent = 'space-between';
      issueItem.style.alignItems = 'center';
      const issueInfo = document.createElement('div');
      const issueId = issue.iid || 'Unknown';
      const issueTitle = issue.title || 'Untitled Issue';
      issueInfo.innerHTML = `<strong>#${issueId}</strong> - ${issueTitle}`;
      issueInfo.style.overflow = 'hidden';
      issueInfo.style.textOverflow = 'ellipsis';
      issueInfo.style.whiteSpace = 'nowrap';
      issueInfo.style.marginRight = '5px';
      issueItem.appendChild(issueInfo);
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.style.backgroundColor = 'transparent';
      removeBtn.style.border = 'none';
      removeBtn.style.color = '#dc3545';
      removeBtn.style.fontSize = '16px';
      removeBtn.style.fontWeight = 'bold';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.padding = '0 5px';
      removeBtn.title = 'Remove this issue';
      removeBtn.setAttribute('data-index', index);
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.color = '#c82333';
      });
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.color = '#dc3545';
      });
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        const clickedIndex = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        if (!isNaN(clickedIndex)) {
          this.removeIssue(clickedIndex);
        }
      });
      issueItem.appendChild(removeBtn);
      this.issuesList.appendChild(issueItem);
    });
  }
  removeIssue(index) {
    if (this.selectedIssues.length > index) {
      const removedIssue = this.selectedIssues[index];
      this.selectedIssues.splice(index, 1);
      if (this.uiManager && this.uiManager.issueSelector) {
        this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      } else if (window.uiManager && window.uiManager.issueSelector) {
        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      }
      this.updateDisplay();
      const statusEl = document.getElementById('comment-status');
      if (statusEl) {
        const count = this.selectedIssues.length;
        if (count > 0) {
          statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
          statusEl.style.color = 'green';
        } else {
          statusEl.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
          statusEl.style.color = '#666';
        }
      }
    }
  }
  onRemoveIssue(index) {
    if (this.selectedIssues.length > index) {
      const removedIssue = this.selectedIssues[index];
      this.selectedIssues.splice(index, 1);
      if (this.uiManager && this.uiManager.issueSelector) {
        this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      } else if (window.uiManager && window.uiManager.issueSelector) {
        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      }
    }
  }
  setSelectedIssues(issues) {
    this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
    this.updateDisplay();
  }
}

// File: lib/ui/components/IssueSelector.js
window.IssueSelector = class IssueSelector {
  constructor(options = {}) {
    this.uiManager = options.uiManager;
    this.onSelectionChange = options.onSelectionChange || null;
    this.onSelectionComplete = options.onSelectionComplete || null;
    this.isSelectingIssue = false;
    this.selectionOverlays = [];
    this.selectedOverlays = [];
    this.selectedIssues = options.initialSelection || [];
    this.pageOverlay = null;
    this.selectionCounter = null;
    this.helpText = null;
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && this.isSelectingIssue) {
        this.exitSelectionMode();
      }
    });
  }
  startSelection() {
    if (this.isSelectingIssue) {
      return;
    }
    this.isSelectingIssue = true;
    const currentSelection = [...this.selectedIssues];
    this.applyOverflowFixes();
    this.createCardOverlays(currentSelection);
    this.createFixedControls();
    const selectButton = document.getElementById('select-issues-button');
    if (selectButton) {
      selectButton.dataset.active = 'true';
      selectButton.style.backgroundColor = '#28a745';
      selectButton.textContent = '✓ Done';
    }
    window.addEventListener('scroll', this.handleScroll);
    window.addEventListener('resize', this.handleResize);
    this.setupMutationObserver();
  }
  applyOverflowFixes() {
    this.originalStyles = [];
    const ulElements = document.querySelectorAll('ul.board-list');
    ulElements.forEach(ul => {
      this.originalStyles = [{
        element: ul,
        property: 'overflow-x',
        value: ul.style.overflowX
      }];
      ul.style.setProperty('overflow-x', 'unset', 'important');
      ul.style.setProperty('overflow-y', 'unset', 'important');
    });
    const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
    cardAreas.forEach(area => {
      this.originalStyles.push({
        element: area,
        property: 'overflow',
        value: area.style.overflow
      });
      this.originalStyles.push({
        element: area,
        property: 'position',
        value: area.style.position
      });
      area.style.overflow = 'auto';
      area.style.position = 'relative';
    });
    return cardAreas;
  }
  createCardOverlays(currentSelection = []) {
    this.selectionOverlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    this.selectionOverlays = [];
    this.selectedIssues = currentSelection || [];
    this.selectedOverlays = [];
    const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
    cardAreas.forEach(cardArea => {
      try {
        const cards = cardArea.querySelectorAll('.board-card');
        cards.forEach((card, index) => {
          try {
            const issueItem = this.getIssueItemFromCard(card);
            if (!issueItem) return;
            const overlay = document.createElement('div');
            overlay.className = 'card-selection-overlay';
            overlay.style.position = 'absolute';
            overlay.style.zIndex = '99';
            overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
            overlay.style.border = '2px solid rgba(31, 117, 203, 0.6)';
            overlay.style.borderRadius = '4px';
            overlay.style.cursor = 'pointer';
            overlay.style.transition = 'background-color 0.2s ease';
            overlay.style.boxSizing = 'border-box';
            overlay.dataset.cardId = card.id || `card-${Date.now()}-${index}`;
            overlay.dataset.selected = 'false';
            overlay.originalCard = card;
            overlay.dataset.issueId = `${issueItem.iid}-${issueItem.referencePath}`;
            this.positionOverlay(overlay, card, cardArea);
            if (currentSelection.some(issue => issue.iid === issueItem.iid && issue.referencePath === issueItem.referencePath)) {
              overlay.dataset.selected = 'true';
              overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
              overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
              overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
              const badgeNumber = this.selectedOverlays.length + 1;
              const badge = document.createElement('div');
              badge.className = 'selection-badge';
              badge.textContent = badgeNumber;
              badge.style.position = 'absolute';
              badge.style.top = '-10px';
              badge.style.right = '-10px';
              badge.style.width = '20px';
              badge.style.height = '20px';
              badge.style.borderRadius = '50%';
              badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
              badge.style.color = 'white';
              badge.style.display = 'flex';
              badge.style.alignItems = 'center';
              badge.style.justifyContent = 'center';
              badge.style.fontWeight = 'bold';
              badge.style.fontSize = '12px';
              badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
              overlay.appendChild(badge);
              this.selectedOverlays.push(overlay);
            }
            overlay.addEventListener('mouseenter', function () {
              if (this.dataset.selected !== 'true') {
                this.style.backgroundColor = 'rgba(31, 117, 203, 0.3)';
                this.style.boxShadow = '0 0 8px rgba(31, 117, 203, 0.5)';
              }
            });
            overlay.addEventListener('mouseleave', function () {
              if (this.dataset.selected !== 'true') {
                this.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
                this.style.boxShadow = 'none';
              }
            });
            overlay.addEventListener('click', e => {
              e.stopPropagation();
              this.toggleCardSelection(card, overlay);
            });
            cardArea.appendChild(overlay);
            this.selectionOverlays.push(overlay);
          } catch (error) {
            console.error('Error creating overlay for card:', error);
          }
        });
      } catch (error) {
        console.error('Error processing card area:', error);
      }
    });
  }
  updateSelectionCounter() {
    if (this.selectionCounter) {
      const count = this.selectedIssues.length;
      this.selectionCounter.textContent = `${count} issue${count !== 1 ? 's' : ''} selected`;
      if (count > 0) {
        this.selectionCounter.style.backgroundColor = 'rgba(40, 167, 69, 0.8)';
      } else {
        this.selectionCounter.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
      }
    }
    if (typeof this.onSelectionChange === 'function') {
      this.onSelectionChange(this.selectedIssues);
    }
    this.syncSelectionWithBulkCommentsView();
  }
  getIssueItemFromCard(boardCard) {
    try {
      if (boardCard.__vue__) {
        if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
          const issueComponent = boardCard.__vue__.$children.find(child => child.$props && child.$props.item);
          if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
            return issueComponent.$props.item;
          }
        }
        if (boardCard.__vue__.$options && boardCard.__vue__.$options.children && boardCard.__vue__.$options.children.length > 0) {
          const issueComponent = boardCard.__vue__.$options.children.find(child => child.$props && child.$props.item);
          if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
            return issueComponent.$props.item;
          }
        }
        if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
          return boardCard.__vue__.$props.item;
        }
      }
      const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
      const titleElement = boardCard.querySelector('.board-card-title');
      if (issueId && titleElement) {
        return {
          iid: issueId,
          title: titleElement.textContent.trim(),
          referencePath: window.location.pathname.split('/boards')[0]
        };
      }
    } catch (e) {
      console.error('Error getting issue item from card:', e);
    }
    return null;
  }
  renumberBadges() {
    this.selectedOverlays.forEach((overlay, index) => {
      const badge = overlay.querySelector('.selection-badge');
      if (badge) {
        badge.textContent = index + 1;
      }
    });
  }
  exitSelectionMode() {
    if (!this.isSelectingIssue) return;
    this.isSelectingIssue = false;
    if (this.updateTimeout) {
      clearTimeout(this.updateTimeout);
      this.updateTimeout = null;
    }
    if (this.overflowFixTimeout) {
      clearTimeout(this.overflowFixTimeout);
      this.overflowFixTimeout = null;
    }
    if (this.boardObserver) {
      this.boardObserver.disconnect();
      this.boardObserver = null;
    }
    this.selectionOverlays.forEach(overlay => {
      if (overlay && overlay.parentNode) {
        overlay.parentNode.removeChild(overlay);
      }
    });
    if (this.selectionCounter && this.selectionCounter.parentNode) {
      this.selectionCounter.parentNode.removeChild(this.selectionCounter);
      this.selectionCounter = null;
    }
    if (this.helpText && this.helpText.parentNode) {
      this.helpText.parentNode.removeChild(this.helpText);
      this.helpText = null;
    }
    this.selectionOverlays = [];
    this.selectedOverlays = [];
    const selectButton = document.getElementById('select-issues-button');
    if (selectButton) {
      selectButton.dataset.active = 'false';
      selectButton.style.backgroundColor = '#6c757d';
      selectButton.textContent = '📎 Select Issues';
    }
    this.syncSelectionWithBulkCommentsView();
    if (typeof this.onSelectionComplete === 'function') {
      this.onSelectionComplete(this.selectedIssues);
    }
    window.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('resize', this.handleResize);
  }
  toggleCardSelection(card, overlay) {
    if (!this.isSelectingIssue) return;
    const issueItem = this.getIssueItemFromCard(card);
    if (issueItem) {
      const isSelected = overlay.dataset.selected === 'true';
      if (isSelected) {
        overlay.dataset.selected = 'false';
        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
        overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
        overlay.style.boxShadow = 'none';
        this.selectedIssues = this.selectedIssues.filter(issue => !(issue.iid === issueItem.iid && issue.referencePath === issueItem.referencePath));
        this.selectedOverlays = this.selectedOverlays.filter(o => o !== overlay);
        overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
        this.renumberBadges();
      } else {
        overlay.dataset.selected = 'true';
        overlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
        overlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
        overlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
        const badgeNumber = this.selectedIssues.length + 1;
        const badge = document.createElement('div');
        badge.className = 'selection-badge';
        badge.textContent = badgeNumber;
        badge.style.position = 'absolute';
        badge.style.top = '-10px';
        badge.style.right = '-10px';
        badge.style.width = '20px';
        badge.style.height = '20px';
        badge.style.borderRadius = '50%';
        badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
        badge.style.color = 'white';
        badge.style.display = 'flex';
        badge.style.alignItems = 'center';
        badge.style.justifyContent = 'center';
        badge.style.fontWeight = 'bold';
        badge.style.fontSize = '12px';
        badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
        overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
        overlay.appendChild(badge);
        this.selectedIssues.push(issueItem);
        this.selectedOverlays.push(overlay);
      }
      this.updateSelectionCounter();
      this.syncSelectionWithBulkCommentsView();
    } else {
      console.error('Failed to get issue item from card');
      overlay.style.backgroundColor = 'rgba(220, 53, 69, 0.4)';
      overlay.style.borderColor = 'rgba(220, 53, 69, 0.8)';
      setTimeout(() => {
        overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
        overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
      }, 500);
      const statusMsg = document.getElementById('comment-status');
      if (statusMsg) {
        statusMsg.textContent = 'Could not extract issue data from this card. Try another one.';
        statusMsg.style.color = '#dc3545';
      }
    }
  }
  syncSelectionWithBulkCommentsView() {
    try {
      if (this.uiManager && this.uiManager.bulkCommentsView) {
        this.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
      } else if (window.uiManager && window.uiManager.bulkCommentsView) {
        window.uiManager.bulkCommentsView.setSelectedIssues([...this.selectedIssues]);
      } else {
        const bulkCommentsView = document.querySelector('.bulk-comments-view');
        if (bulkCommentsView && bulkCommentsView.__vue__ && bulkCommentsView.__vue__.setSelectedIssues) {
          bulkCommentsView.__vue__.setSelectedIssues([...this.selectedIssues]);
        } else {
          console.warn('BulkCommentsView not found for synchronization');
        }
      }
    } catch (error) {
      console.error('Error syncing selection with bulk comments view:', error);
    }
  }
  repositionOverlays() {
    if (!this.isSelectingIssue) return;
    if (this.helpText) {
      this.helpText.style.top = '10px';
      this.helpText.style.left = '50%';
    }
    if (this.selectionCounter) {
      this.selectionCounter.style.top = '50px';
      this.selectionCounter.style.left = '50%';
    }
    this.selectionOverlays.forEach(overlay => {
      if (overlay && overlay.className === 'card-selection-overlay' && overlay.originalCard) {
        const card = overlay.originalCard;
        const container = overlay.parentNode;
        if (card && container) {
          this.positionOverlay(overlay, card, container);
        }
      }
    });
  }
  setSelectedIssues(issues) {
    this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
    if (this.isSelectingIssue && this.selectionOverlays.length > 0) {
      this.updateOverlaysFromSelection();
    }
    const statusEl = document.getElementById('comment-status');
    if (statusEl && !this.isSelectingIssue) {
      const count = this.selectedIssues.length;
      if (count > 0) {
        statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
        statusEl.style.color = 'green';
      } else {
        statusEl.textContent = 'No issues selected. Click "Select" to choose issues.';
        statusEl.style.color = '#666';
      }
    }
    this.syncSelectionWithBulkCommentsView();
  }
  positionOverlay(overlay, card, cardArea) {
    try {
      const cardRect = card.getBoundingClientRect();
      const areaRect = cardArea.getBoundingClientRect();
      const top = cardRect.top - areaRect.top + cardArea.scrollTop;
      const left = cardRect.left - areaRect.left + cardArea.scrollLeft;
      overlay.style.top = `${top}px`;
      overlay.style.left = `${left}px`;
      overlay.style.width = `${cardRect.width}px`;
      overlay.style.height = `${cardRect.height}px`;
    } catch (e) {
      console.error('Error positioning overlay:', e);
    }
  }
  updateOverlaysFromSelection() {
    if (!this.isSelectingIssue) return;
    try {
      const cardOverlays = this.selectionOverlays.filter(o => o.className === 'card-selection-overlay');
      cardOverlays.forEach(overlay => {
        if (overlay.dataset && overlay.originalCard) {
          overlay.dataset.selected = 'false';
          overlay.style.backgroundColor = 'rgba(31, 117, 203, 0.2)';
          overlay.style.borderColor = 'rgba(31, 117, 203, 0.6)';
          overlay.style.boxShadow = 'none';
          overlay.querySelectorAll('.selection-badge').forEach(b => b.remove());
        }
      });
      this.selectedOverlays = [];
      this.selectedIssues.forEach((issue, index) => {
        if (!issue) return;
        const matchingOverlay = cardOverlays.find(overlay => {
          if (!overlay.dataset || !overlay.dataset.issueId) return false;
          return overlay.dataset.issueId === `${issue.iid}-${issue.referencePath}`;
        });
        if (matchingOverlay) {
          matchingOverlay.dataset.selected = 'true';
          matchingOverlay.style.backgroundColor = 'rgba(0, 177, 106, 0.3)';
          matchingOverlay.style.borderColor = 'rgba(0, 177, 106, 0.8)';
          matchingOverlay.style.boxShadow = '0 0 12px rgba(0, 177, 106, 0.3)';
          const badgeNumber = index + 1;
          const badge = document.createElement('div');
          badge.className = 'selection-badge';
          badge.textContent = badgeNumber;
          badge.style.position = 'absolute';
          badge.style.top = '-10px';
          badge.style.right = '-10px';
          badge.style.width = '20px';
          badge.style.height = '20px';
          badge.style.borderRadius = '50%';
          badge.style.backgroundColor = 'rgba(0, 177, 106, 1)';
          badge.style.color = 'white';
          badge.style.display = 'flex';
          badge.style.alignItems = 'center';
          badge.style.justifyContent = 'center';
          badge.style.fontWeight = 'bold';
          badge.style.fontSize = '12px';
          badge.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
          matchingOverlay.appendChild(badge);
          this.selectedOverlays.push(matchingOverlay);
        }
      });
      this.updateSelectionCounter();
    } catch (error) {
      console.error('Error updating overlays from selection:', error);
    }
  }
  createFixedControls() {
    const helpText = document.createElement('div');
    helpText.id = 'selection-help-text';
    helpText.textContent = 'Click on issues to select/deselect them • Press ESC or click button when finished';
    helpText.style.position = 'fixed';
    helpText.style.top = '10px';
    helpText.style.left = '50%';
    helpText.style.transform = 'translateX(-50%)';
    helpText.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    helpText.style.color = 'white';
    helpText.style.padding = '8px 16px';
    helpText.style.borderRadius = '20px';
    helpText.style.fontSize = '14px';
    helpText.style.zIndex = '999';
    helpText.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.3)';
    this.helpText = helpText;
    document.body.appendChild(helpText);
    this.selectionOverlays.push(helpText);
    const selectionCounter = document.createElement('div');
    selectionCounter.id = 'selection-counter';
    selectionCounter.textContent = `${this.selectedIssues.length} issues selected`;
    selectionCounter.style.position = 'fixed';
    selectionCounter.style.top = '50px';
    selectionCounter.style.left = '50%';
    selectionCounter.style.transform = 'translateX(-50%)';
    selectionCounter.style.backgroundColor = this.selectedIssues.length > 0 ? 'rgba(40, 167, 69, 0.9)' : 'rgba(0, 0, 0, 0.8)';
    selectionCounter.style.color = 'white';
    selectionCounter.style.padding = '8px 16px';
    selectionCounter.style.borderRadius = '20px';
    selectionCounter.style.fontSize = '14px';
    selectionCounter.style.zIndex = '999';
    selectionCounter.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
    this.selectionCounter = selectionCounter;
    document.body.appendChild(selectionCounter);
    this.selectionOverlays.push(selectionCounter);
  }
  handleScroll = () => {
    this.repositionOverlays();
  };
  handleResize = () => {
    this.repositionOverlays();
  };
  setupMutationObserver() {
    if (this.boardObserver) {
      this.boardObserver.disconnect();
    }
    this.boardObserver = new MutationObserver(mutations => {
      if (!this.isSelectingIssue) return;
      let needsUpdate = false;
      let overflowReset = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          const hasCardChanges = Array.from(mutation.addedNodes).some(node => node.classList && node.classList.contains('board-card'));
          if (hasCardChanges) {
            needsUpdate = true;
          }
        }
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target;
          if (target.matches('[data-testid="board-list-cards-area"]') || target.matches('.board-list ul')) {
            const style = window.getComputedStyle(target);
            if (target.matches('[data-testid="board-list-cards-area"]') && style.overflow !== 'auto') {
              overflowReset = true;
            }
            if (target.matches('.board-list ul') && style.overflowX !== 'unset') {
              overflowReset = true;
            }
          }
        }
      });
      if (overflowReset) {
        clearTimeout(this.overflowFixTimeout);
        this.overflowFixTimeout = setTimeout(() => {
          this.applyOverflowFixes();
        }, 50);
      }
      if (needsUpdate) {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
          this.createCardOverlays(this.selectedIssues);
        }, 100);
      }
    });
    const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
    boardContainers.forEach(container => {
      this.boardObserver.observe(container, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class']
      });
    });
  }
}

// File: lib/ui/components/LinkedItemsManager.js
window.LinkedItemsManager = class LinkedItemsManager {
    constructor(options = {}) {
        this.initialized = false;
        this.dropdowns = [];
        this.cardLinks = new Map();
        this.uiManager = options.uiManager || window.uiManager;
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.cache = {
            issues: new Map(),
            mergeRequests: new Map(),
            relatedIssues: new Map()
        };
        this.loadCacheFromLocalStorage();
        this.handleScroll = this.handleScroll.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.refreshDropdowns = this.refreshDropdowns.bind(this);
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);
        this.setupMutationObserver();
        this.checkEnabled();
    }

    checkEnabled() {
        try {
            const enabled = localStorage.getItem('gitLabHelperLinkedItemsEnabled');
            if (enabled === null) {
                return true;
            }
            return enabled === 'true';
        } catch (e) {
            console.error('Error checking linked items enabled state:', e);
            return true;
        }
    }

    loadCacheFromLocalStorage() {
        try {
            const savedCache = localStorage.getItem('gitlabHelperLinkedItemsCache');
            if (savedCache) {
                const cacheData = JSON.parse(savedCache);
                if (cacheData.timestamp && Date.now() - cacheData.timestamp < 8 * 60 * 60 * 1000) {
                    if (cacheData.issues) {
                        Object.entries(cacheData.issues).forEach(([key, items]) => {
                            this.cache.issues.set(key, items);
                        });
                    }
                    if (cacheData.mergeRequests) {
                        Object.entries(cacheData.mergeRequests).forEach(([key, items]) => {
                            this.cache.mergeRequests.set(key, items);
                        });
                    }
                    if (cacheData.relatedIssues) {
                        Object.entries(cacheData.relatedIssues).forEach(([key, items]) => {
                            this.cache.relatedIssues.set(key, items);
                        });
                    }
                } else {
                    localStorage.removeItem('gitlabHelperLinkedItemsCache');
                }
            }
        } catch (error) {
            console.warn('Error loading cache from localStorage:', error);
            localStorage.removeItem('gitlabHelperLinkedItemsCache');
        }
    }

    saveCacheToLocalStorage() {
        try {
            const cacheObject = {
                issues: {},
                mergeRequests: {},
                relatedIssues: {}
            };
            this.cache.issues.forEach((value, key) => {
                cacheObject.issues[key] = value;
            });
            this.cache.mergeRequests.forEach((value, key) => {
                cacheObject.mergeRequests[key] = value;
            });
            this.cache.relatedIssues.forEach((value, key) => {
                cacheObject.relatedIssues[key] = value;
            });
            const cacheData = {
                timestamp: Date.now(),
                issues: cacheObject.issues,
                mergeRequests: cacheObject.mergeRequests,
                relatedIssues: cacheObject.relatedIssues
            };
            localStorage.setItem('gitlabHelperLinkedItemsCache', JSON.stringify(cacheData));
        } catch (error) {
            console.warn('Error saving cache to localStorage:', error);
        }
    }

    initialize() {
        if (!this.checkEnabled()) {
            return;
        }
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.applyOverflowFixes();
        this.createCardDropdowns();
        this.refreshInterval = setInterval(this.refreshDropdowns, 2000);
        this.setupCardsMutationObserver();
        this.cacheSaveInterval = setInterval(() => {
            this.saveCacheToLocalStorage();
        }, 60000);
    }

    getEnhancedMRStatus(item) {
        if (!item || !item.state) {
            return 'Unknown';
        }

        // If the MR is already merged or closed, just return that state
        if (item.state.toLowerCase() === 'merged') {
            return 'Merged';
        }

        if (item.state.toLowerCase() === 'closed') {
            return 'Closed';
        }

        // For open MRs, determine the specific status
        if (item.state.toLowerCase() === 'opened' || item.state.toLowerCase() === 'open') {
            // Check for draft/WIP status first
            if (item.title) {
                if (item.title.toLowerCase().startsWith('draft:') ||
                    item.title.toLowerCase().startsWith('wip:') ||
                    item.title.toLowerCase().includes('[wip]') ||
                    item.title.toLowerCase().includes('[draft]')) {
                    return 'Draft';
                }
            }

            // Check for merge conflicts
            if (item.has_conflicts === true) {
                return 'Conflicts';
            }

            // Check for blocking discussions not resolved
            if (item.blocking_discussions_resolved === false) {
                return 'Changes Needed';
            }

            // Check for discussions/comments
            if (item.has_discussions === true ||
                (item.user_notes_count !== undefined && item.user_notes_count > 0)) {
                return 'Reviewing';
            }

            // Check for approvals and changes requested
            if (item.approvals_required !== undefined &&
                item.approved_by !== undefined) {
                if (item.approvals_required > 0 &&
                    (!item.approved_by || item.approved_by.length < item.approvals_required)) {
                    return 'Reviewing';
                }
            }

            // Check for pipeline status
            if (item.pipeline_status &&
                item.pipeline_status.status &&
                item.pipeline_status.status === 'failed') {
                return 'Pipeline Failed';
            }
        }

        // Default to standard state if we can't determine a more specific status
        return item.state.charAt(0).toUpperCase() + item.state.slice(1).toLowerCase();
    }

    applyOverflowFixes() {
        this.originalStyles = [];
        const ulElements = document.querySelectorAll('ul.board-list');
        ulElements.forEach(ul => {
            this.originalStyles.push({
                element: ul,
                property: 'overflow-x',
                value: ul.style.overflowX
            });
            ul.style.setProperty('overflow-x', 'unset', 'important');
            ul.style.setProperty('overflow-y', 'unset', 'important');
        });
        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        cardAreas.forEach(area => {
            this.originalStyles.push({
                element: area,
                property: 'overflow',
                value: area.style.overflow
            });
            this.originalStyles.push({
                element: area,
                property: 'position',
                value: area.style.position
            });
            area.style.overflow = 'auto';
            area.style.position = 'relative';
        });
        return cardAreas;
    }

    createCardDropdowns() {
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.parentNode) {
                dropdown.parentNode.removeChild(dropdown);
            }
        });
        this.dropdowns = [];
        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        cardAreas.forEach(cardArea => {
            try {
                const cards = cardArea.querySelectorAll('.board-card');
                cards.forEach((card, index) => {
                    try {
                        const dropdown = this.createPlaceholderDropdown(card, cardArea);
                        if (dropdown) {
                            this.dropdowns.push(dropdown);
                            this.fetchAndUpdateDropdown(dropdown, card);
                        }
                    } catch (error) {
                        console.error('Error creating dropdown for card:', error);
                    }
                });
            } catch (error) {
                console.error('Error processing card area:', error);
            }
        });
    }

    async fetchAndUpdateDropdown(dropdown, card) {
        try {
            if (!dropdown || !card) return;
            const issueItem = await this.getIssueItemFromCard(card);
            if (!issueItem) return;
            const projectPath = this.extractRepositoryPath(issueItem.referencePath || window.location.pathname);
            const issueIid = issueItem.iid ? issueItem.iid.toString().split('#').pop() : null;
            const cacheKey = issueIid ? `${projectPath}/${issueIid}` : null;
            if (cacheKey && this.cache.issues.has(cacheKey)) {
                const cachedItems = this.cache.issues.get(cacheKey);
                const cardId = dropdown.dataset.cardId;
                this.cardLinks.set(cardId, cachedItems);
                dropdown.isLoading = false;
                this.updateDropdownWithLinkedItems(dropdown, cachedItems);
                return;
            }
            const initialLinkedItems = [];
            const baseUrl = window.location.origin;
            this.addLinkedItemsFromProps(issueItem, initialLinkedItems, baseUrl, projectPath);
            if (initialLinkedItems.length > 0) {
                const cardId = dropdown.dataset.cardId;
                this.cardLinks.set(cardId, initialLinkedItems);
                dropdown.isLoading = false;
                this.updateDropdownWithLinkedItems(dropdown, initialLinkedItems);
            }
            const linkedItems = await this.getLinkedItemsFromIssue(issueItem);
            const cardId = dropdown.dataset.cardId;
            this.cardLinks.set(cardId, linkedItems);
            dropdown.isLoading = false;
            this.updateDropdownWithLinkedItems(dropdown, linkedItems);
        } catch (error) {
            console.error('Error fetching and updating dropdown:', error);
            this.updateDropdownWithError(dropdown);
        }
    }

    updateDropdownEmpty(dropdown) {
        const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
        const dropdownContent = dropdown.querySelector('.linked-items-content');
        if (!dropdownToggle || !dropdownContent) return;
        dropdownToggle.style.backgroundColor = '#6c757d';
        dropdownToggle.title = 'No linked items found';
        dropdownContent.innerHTML = '';
        const emptyMessage = document.createElement('div');
        emptyMessage.textContent = 'No linked items found';
        emptyMessage.style.padding = '10px 12px';
        emptyMessage.style.color = '#666';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.fontSize = '13px';
        emptyMessage.style.textAlign = 'center';
        dropdownContent.appendChild(emptyMessage);
        const card = dropdown.originalCard;
        const issueItem = this.getIssueItemFromCard(card);
        if (issueItem && issueItem.iid) {
            const projectPath = this.extractRepositoryPath(window.location.pathname);
            const baseUrl = window.location.origin;
            const viewIssueItem = {
                type: 'issue_detail',
                title: 'View Issue Details',
                url: `${baseUrl}/${projectPath}/-/issues/${issueItem.iid}`
            };
            dropdownContent.appendChild(document.createElement('hr'));
            dropdownContent.appendChild(this.createLinkItem(viewIssueItem));
        }
    }

    updateDropdownWithError(dropdown) {
        const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
        const dropdownContent = dropdown.querySelector('.linked-items-content');
        if (!dropdownToggle || !dropdownContent) return;
        dropdownToggle.style.backgroundColor = '#dc3545';
        dropdownToggle.title = 'Error loading linked items';
        dropdownContent.innerHTML = '';
        const errorMessage = document.createElement('div');
        errorMessage.textContent = 'Error loading linked items';
        errorMessage.style.padding = '10px 12px';
        errorMessage.style.color = '#dc3545';
        errorMessage.style.fontStyle = 'italic';
        errorMessage.style.fontSize = '13px';
        errorMessage.style.textAlign = 'center';
        dropdownContent.appendChild(errorMessage);
    }

    updateDropdownWithLinkedItems(dropdown, linkedItems) {
        if (!linkedItems || linkedItems.length === 0) {
            this.updateDropdownEmpty(dropdown);
            return;
        }
        const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
        const dropdownContent = dropdown.querySelector('.linked-items-content');
        if (!dropdownToggle || !dropdownContent) return;
        dropdownToggle.title = `${linkedItems.length} linked item${linkedItems.length !== 1 ? 's' : ''}`;
        const mrCount = linkedItems.filter(item => item.type === 'merge_request').length;
        const branchCount = linkedItems.filter(item => item.type === 'branch').length;
        const issueCount = linkedItems.filter(item => item.type === 'issue').length;
        if (mrCount > 0 || branchCount > 0) {
            dropdownToggle.title = `${mrCount ? mrCount + ' MR' + (mrCount > 1 ? 's' : '') : ''}${mrCount && branchCount ? ', ' : ''}${branchCount ? branchCount + ' branch' + (branchCount > 1 ? 'es' : '') : ''}${issueCount ? (mrCount || branchCount ? ', ' : '') + issueCount + ' issue' + (issueCount > 1 ? 's' : '') : ''}`;
        }
        dropdownContent.innerHTML = '';
        const groupedItems = {
            merge_request: [],
            branch: [],
            issue: [],
            other: []
        };
        linkedItems.forEach(item => {
            if (groupedItems[item.type]) {
                groupedItems[item.type].push(item);
            } else {
                groupedItems.other.push(item);
            }
        });
        const createSectionHeader = title => {
            const header = document.createElement('div');
            header.style.backgroundColor = '#f8f9fa';
            header.style.padding = '5px 12px';
            header.style.fontSize = '11px';
            header.style.fontWeight = 'bold';
            header.style.color = '#6c757d';
            header.style.textTransform = 'uppercase';
            header.style.borderBottom = '1px solid #eee';
            header.textContent = title;
            return header;
        };
        if (groupedItems.merge_request.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Merge Requests'));
            groupedItems.merge_request.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }
        if (groupedItems.branch.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Branches'));
            groupedItems.branch.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }
        if (groupedItems.issue.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Related Issues'));
            groupedItems.issue.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }
        if (groupedItems.other.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Actions'));
            groupedItems.other.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }
    }

    createPlaceholderDropdown(card, cardArea) {
        const cardId = card.id || `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const dropdown = document.createElement('div');
        dropdown.className = 'linked-items-dropdown';
        dropdown.style.position = 'absolute';
        dropdown.style.zIndex = '99';
        dropdown.style.cursor = 'pointer';
        dropdown.style.transition = 'all 0.2s ease';
        dropdown.dataset.cardId = cardId;
        dropdown.originalCard = card;
        dropdown.isLoading = true;
        this.positionDropdown(dropdown, card, cardArea);
        const dropdownToggle = document.createElement('div');
        dropdownToggle.className = 'linked-items-toggle';
        dropdownToggle.style.backgroundColor = '#1f75cb';
        dropdownToggle.style.color = 'white';
        dropdownToggle.style.borderRadius = '50%';
        dropdownToggle.style.width = '22px';
        dropdownToggle.style.height = '22px';
        dropdownToggle.style.display = 'flex';
        dropdownToggle.style.alignItems = 'center';
        dropdownToggle.style.justifyContent = 'center';
        dropdownToggle.style.fontSize = '12px';
        dropdownToggle.style.fontWeight = 'bold';
        dropdownToggle.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
        dropdownToggle.style.border = '2px solid white';
        dropdownToggle.title = 'Loading linked items...';
        const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgIcon.setAttribute('role', 'img');
        svgIcon.setAttribute('aria-hidden', 'true');
        svgIcon.classList.add('gl-icon');
        svgIcon.style.width = '12px';
        svgIcon.style.height = '12px';
        svgIcon.style.fill = 'white';
        const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        useElement.setAttribute('href', '/assets/icons-aa2c8ddf99d22b77153ca2bb092a23889c12c597fc8b8de94b0f730eb53513f6.svg#issue-type-issue');
        svgIcon.appendChild(useElement);
        dropdownToggle.appendChild(svgIcon);
        dropdownToggle.addEventListener('mouseenter', function () {
            this.style.backgroundColor = '#0056b3';
            this.style.transform = 'scale(1.1)';
        });
        dropdownToggle.addEventListener('mouseleave', function () {
            this.style.backgroundColor = '#1f75cb';
            this.style.transform = 'scale(1)';
        });
        const dropdownContent = document.createElement('div');
        dropdownContent.className = 'linked-items-content';
        dropdownContent.style.display = 'none';
        dropdownContent.style.position = 'absolute';
        dropdownContent.style.backgroundColor = 'white';
        dropdownContent.style.width = `${$(card).width() + 1}px`;
        dropdownContent.style.boxShadow = '    box-shadow: rgba(0, 0, 0, 0.6) 0px 0px 6px;';
        dropdownContent.style.zIndex = '100';
        dropdownContent.style.borderRadius = '4px';
        dropdownContent.style.border = '1px solid #ddd';
        dropdownContent.style.left = '9px';
        dropdownContent.style.top = `${$(card).height()}px`;
        const loadingItem = document.createElement('div');
        loadingItem.textContent = 'Loading linked items...';
        loadingItem.style.padding = '10px 12px';
        loadingItem.style.color = '#666';
        loadingItem.style.fontStyle = 'italic';
        loadingItem.style.fontSize = '13px';
        loadingItem.style.textAlign = 'center';
        dropdownContent.appendChild(loadingItem);
        dropdownToggle.addEventListener('click', e => {
            e.stopPropagation();
            document.querySelectorAll('.linked-items-content').forEach(content => {
                if (content !== dropdownContent) {
                    content.style.display = 'none';
                    const parentDropdown = content.closest('.linked-items-dropdown');
                    if (parentDropdown) {
                        parentDropdown.style.zIndex = '99';
                    }
                }
            });
            const isCurrentlyOpen = dropdownContent.style.display === 'block';
            if (!isCurrentlyOpen) {
                dropdown.style.zIndex = '100';
                dropdownContent.style.display = 'block';
            } else {
                dropdown.style.zIndex = '99';
                dropdownContent.style.display = 'none';
            }
        });
        document.addEventListener('click', () => {
            if (dropdownContent.style.display === 'block') {
                dropdownContent.style.display = 'none';
                dropdown.style.zIndex = '99';
            }
        });
        dropdown.appendChild(dropdownToggle);
        dropdown.appendChild(dropdownContent);
        cardArea.appendChild(dropdown);
        return dropdown;
    }

    getIssueItemFromCard(boardCard) {
        try {
            if (boardCard.__vue__) {
                if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
                    const issueComponent = boardCard.__vue__.$children.find(child => child.$props && child.$props.item);
                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }
                if (boardCard.__vue__.$options && boardCard.__vue__.$options.children && boardCard.__vue__.$options.children.length > 0) {
                    const issueComponent = boardCard.__vue__.$options.children.find(child => child.$props && child.$props.item);
                    if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                        return issueComponent.$props.item;
                    }
                }
                if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
                    return boardCard.__vue__.$props.item;
                }
            }
            const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
            const titleElement = boardCard.querySelector('.board-card-title');
            if (issueId && titleElement) {
                return {
                    iid: issueId,
                    title: titleElement.textContent.trim(),
                    referencePath: window.location.pathname.split('/boards')[0]
                };
            }
        } catch (e) {
            console.error('Error getting issue item from card:', e);
        }
        return null;
    }

    async getLinkedItemsFromIssue(issueItem) {
        const linkedItems = [];
        try {
            let projectPath = this.extractRepositoryPath(issueItem.referencePath || window.location.pathname);
            const baseUrl = window.location.origin;
            if (issueItem.iid) {
                let issueIid = issueItem.iid;
                if (typeof issueIid === 'string' && issueIid.includes('#')) {
                    issueIid = issueIid.split('#').pop();
                }
                if (projectPath.includes('#')) {
                    projectPath = projectPath.split('#')[0];
                }
                const cacheKey = `${projectPath}/${issueIid}`;
                if (this.cache.issues.has(cacheKey)) {
                    return this.cache.issues.get(cacheKey);
                }
                this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
                const gitlabApi = window.gitlabApi || this.uiManager?.gitlabApi;
                if (gitlabApi && typeof gitlabApi.callGitLabApiWithCache === 'function') {
                    try {
                        const encodedPath = encodeURIComponent(projectPath);
                        try {
                            const relatedMRs = await gitlabApi.callGitLabApiWithCache(`projects/${encodedPath}/issues/${issueIid}/related_merge_requests`, {
                                params: {
                                    // Request additional details for enhanced status
                                    with_discussions_to_resolve: true,
                                    with_merge_status_recheck: true
                                }
                            }, 60000);

                            if (Array.isArray(relatedMRs) && relatedMRs.length > 0) {
                                for (let i = linkedItems.length - 1; i >= 0; i--) {
                                    if (linkedItems[i].type === 'merge_request') {
                                        linkedItems.splice(i, 1);
                                    }
                                }

                                // Process each MR to fetch more details if needed
                                for (const mr of relatedMRs) {
                                    // Get more detailed MR info if not already included
                                    let mrDetails = mr;

                                    if (!mr.blocking_discussions_resolved || !mr.has_conflicts) {
                                        try {
                                            const detailedMR = await gitlabApi.callGitLabApiWithCache(
                                                `projects/${encodedPath}/merge_requests/${mr.iid}`,
                                                {}, 60000
                                            );
                                            if (detailedMR) {
                                                mrDetails = {...mr, ...detailedMR};
                                            }
                                        } catch (detailsError) {
                                            console.warn(`Couldn't fetch detailed info for MR #${mr.iid}:`, detailsError);
                                        }
                                    }

                                    linkedItems.push({
                                        type: 'merge_request',
                                        title: mrDetails.title || `Merge Request !${mrDetails.iid}`,
                                        state: mrDetails.state,
                                        url: mrDetails.web_url || `${baseUrl}/${projectPath}/-/merge_requests/${mrDetails.iid}`,
                                        has_conflicts: mrDetails.has_conflicts,
                                        blocking_discussions_resolved: mrDetails.blocking_discussions_resolved,
                                        has_discussions: mrDetails.discussion_locked !== undefined
                                            ? !mrDetails.discussion_locked
                                            : !!mrDetails.user_notes_count,
                                        approvals_required: mrDetails.approvals_required,
                                        approved_by: mrDetails.approved_by,
                                        pipeline_status: mrDetails.pipeline_status
                                    });
                                }

                                this.cache.mergeRequests.set(cacheKey, [...relatedMRs]);
                            }
                        } catch (mrError) {
                            console.warn('Error fetching related merge requests:', mrError);
                        }

                        try {
                            const relatedIssues = await gitlabApi.callGitLabApiWithCache(`projects/${encodedPath}/issues/${issueIid}/links`, {}, 60000);
                            if (Array.isArray(relatedIssues)) {
                                for (let i = linkedItems.length - 1; i >= 0; i--) {
                                    if (linkedItems[i].type === 'issue') {
                                        linkedItems.splice(i, 1);
                                    }
                                }
                                relatedIssues.forEach(related => {
                                    linkedItems.push({
                                        type: 'issue',
                                        title: related.title || `Issue #${related.iid}`,
                                        state: related.state,
                                        url: related.web_url || `${baseUrl}/${projectPath}/-/issues/${related.iid}`
                                    });
                                });
                                this.cache.relatedIssues.set(cacheKey, [...relatedIssues]);
                            }
                        } catch (linkError) {
                            console.warn('Error fetching related issues:', linkError);
                        }
                    } catch (apiError) {
                        console.warn('Error fetching issue details via API:', apiError);
                        if (linkedItems.length === 0) {
                            this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
                        }
                    }
                } else {
                    if (linkedItems.length === 0) {
                        this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
                    }
                }
            } else {
                this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
            }

            if (issueItem.iid) {
                let issueIid = issueItem.iid;
                if (typeof issueIid === 'string' && issueIid.includes('#')) {
                    issueIid = issueIid.split('#').pop();
                }
                const hasIssueLink = linkedItems.some(item => item.type === 'issue_detail');
                if (!hasIssueLink) {
                    linkedItems.push({
                        type: 'issue_detail',
                        title: 'View Issue Details',
                        url: `${baseUrl}/${projectPath}/-/issues/${issueIid}`
                    });
                }
            }

            if (issueItem.iid) {
                const cacheKey = `${projectPath}/${issueItem.iid.toString().split('#').pop()}`;
                this.cache.issues.set(cacheKey, [...linkedItems]);
                if (Math.random() < 0.1) {
                    this.saveCacheToLocalStorage();
                }
            }
        } catch (e) {
            console.error('Error extracting linked items:', e);
        }
        return linkedItems;
    }

    createLinkItem(item) {
        const link = document.createElement('a');
        link.href = item.url;
        link.target = '_blank';
        link.style.padding = '8px 12px';
        link.style.display = 'flex';
        link.style.alignItems = 'center';
        link.style.textDecoration = 'none';
        link.style.color = '#333';
        link.style.borderBottom = '1px solid #eee';

        const icon = document.createElement('span');

        switch (item.type) {
            case 'merge_request':
                icon.textContent = '🔀';
                icon.title = 'Merge Request';

                // Enhanced status display for merge requests
                const mrStatusText = this.getEnhancedMRStatus(item);

                if (mrStatusText === 'Merged') {
                    icon.style.color = '#6f42c1';
                } else if (mrStatusText === 'Reviewing') {
                    icon.style.color = '#28a745';
                } else if (mrStatusText === 'Changes Needed') {
                    icon.style.color = '#f9bc00';
                } else if (mrStatusText === 'Open') {
                    icon.style.color = '#1f75cb';
                } else if (mrStatusText === 'Closed') {
                    icon.style.color = '#dc3545';
                } else if (mrStatusText === 'Draft') {
                    icon.style.color = '#6c757d';
                } else if (mrStatusText === 'Conflicts') {
                    icon.style.color = '#dc3545';
                }
                break;

            case 'branch':
                icon.textContent = '🌿';
                icon.title = 'Branch';
                icon.style.color = '#f9bc00';
                break;

            case 'issue':
                icon.textContent = '📝';
                icon.title = 'Issue';
                if (item.state) {
                    if (item.state.toLowerCase() === 'closed') {
                        icon.style.color = '#dc3545';
                    } else if (item.state.toLowerCase() === 'opened' || item.state.toLowerCase() === 'open') {
                        icon.style.color = '#1f75cb';
                    }
                }
                break;

            case 'issue_detail':
                icon.textContent = '👁️';
                icon.title = 'View Issue';
                icon.style.color = '#17a2b8';
                break;

            default:
                icon.textContent = '🔗';
                icon.style.color = '#6c757d';
        }

        icon.style.marginRight = '8px';
        icon.style.fontSize = '16px';

        const text = document.createElement('span');
        text.textContent = this.truncateText(item.title, 30);
        text.style.flex = '1';
        text.style.overflow = 'hidden';
        text.style.textOverflow = 'ellipsis';
        text.style.whiteSpace = 'nowrap';

        if (item.state) {
            const status = document.createElement('span');
            status.style.borderRadius = '10px';
            status.style.padding = '2px 6px';
            status.style.fontSize = '10px';
            status.style.marginRight = '4px';

            // Use enhanced status for merge requests
            if (item.type === 'merge_request') {
                const statusText = this.getEnhancedMRStatus(item);
                status.textContent = statusText;

                if (statusText === 'Merged') {
                    status.style.backgroundColor = '#6f42c1';
                    status.style.color = 'white';
                } else if (statusText === 'Reviewing') {
                    status.style.backgroundColor = '#28a745';
                    status.style.color = 'white';
                } else if (statusText === 'Changes Needed') {
                    status.style.backgroundColor = '#f9bc00';
                    status.style.color = 'black';
                } else if (statusText === 'Draft') {
                    status.style.backgroundColor = '#6c757d';
                    status.style.color = 'white';
                } else if (statusText === 'Conflicts') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else if (statusText === 'opened') {
                    status.style.backgroundColor = '#1f75cb';
                    status.style.color = 'white';
                } else if (statusText === 'Closed') {
                    status.style.backgroundColor = '#000000';
                    status.style.color = 'white';
                } else if (statusText === 'Pipeline Failed') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                }
            } else if (item.type === 'issue') {
                const statusText = this.getEnhancedIssueStatus(item);
                status.textContent = statusText;

                if (statusText === 'Open') {
                    status.style.backgroundColor = '#1f75cb';
                    status.style.color = 'white';
                } else if (statusText === 'In Progress') {
                    status.style.backgroundColor = '#28a745';
                    status.style.color = 'white';
                } else if (statusText === 'Draft') {
                    status.style.backgroundColor = '#6c757d';
                    status.style.color = 'white';
                } else if (statusText === 'Active') {
                    status.style.backgroundColor = '#17a2b8';
                    status.style.color = 'white';
                } else if (statusText === 'Overdue') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else if (statusText === 'Due Soon') {
                    status.style.backgroundColor = '#f9bc00';
                    status.style.color = 'black';
                } else if (statusText === 'Resolved') {
                    status.style.backgroundColor = '#6f42c1';
                    status.style.color = 'white';
                } else if (statusText === 'Closed') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else {
                    // Default for any other status
                    status.style.backgroundColor = '#6c757d';
                    status.style.color = 'white';
                }
            } else {
                status.textContent = item.state;

                if (item.state.toLowerCase() === 'open' || item.state.toLowerCase() === 'opened') {
                    status.style.backgroundColor = '#1f75cb';
                    status.style.color = 'white';
                } else if (item.state.toLowerCase() === 'closed') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else if (item.state.toLowerCase() === 'merged') {
                    status.style.backgroundColor = '#6f42c1';
                    status.style.color = 'white';
                }
            }

            link.appendChild(status);
        }

        link.prepend(icon);
        link.appendChild(text);

        link.addEventListener('mouseenter', function () {
            this.style.backgroundColor = '#f8f9fa';
        });
        link.addEventListener('mouseleave', function () {
            this.style.backgroundColor = 'white';
        });

        return link;
    }

    getEnhancedIssueStatus(item) {
        if (!item || !item.state) {
            return 'Unknown';
        }

        // Check basic states first
        const state = item.state.toLowerCase();
        if (state === 'closed') {
            // Could check for different closure reasons
            if (item.closed_at && item.updated_at &&
                new Date(item.closed_at).getTime() === new Date(item.updated_at).getTime()) {
                return 'Resolved';
            }
            return 'Closed';
        }

        if (state === 'open' || state === 'opened') {
            // Check for various open states

            // Check for draft or WIP
            if (item.title) {
                if (item.title.toLowerCase().startsWith('draft:') ||
                    item.title.toLowerCase().startsWith('wip:') ||
                    item.title.toLowerCase().includes('[wip]') ||
                    item.title.toLowerCase().includes('[draft]')) {
                    return 'Draft';
                }
            }

            // Check if it's being worked on
            if (item.assignees && item.assignees.length > 0) {
                return 'In Progress';
            }

            // Check for due date
            if (item.due_date) {
                const dueDate = new Date(item.due_date);
                const today = new Date();

                if (dueDate < today) {
                    return 'Overdue';
                }

                // Due within 2 days
                const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
                if (dueDate.getTime() - today.getTime() < twoDaysInMs) {
                    return 'Due Soon';
                }
            }

            // Check for activity level (comments)
            if (item.user_notes_count !== undefined && item.user_notes_count > 3) {
                return 'Active';
            }

            // Default open state with better wording
            return 'Open';
        }

        // If it's another state, just capitalize it
        return item.state.charAt(0).toUpperCase() + item.state.slice(1).toLowerCase();
    }

    positionDropdown(dropdown, card, cardArea) {
        try {
            const cardRect = card.getBoundingClientRect();
            const areaRect = cardArea.getBoundingClientRect();
            const top = cardRect.top - areaRect.top + cardArea.scrollTop;
            const left = cardRect.left - areaRect.left + cardArea.scrollLeft + 5 - 13;
            dropdown.style.top = `${top}px`;
            dropdown.style.left = `${left}px`;
        } catch (e) {
            console.error('Error positioning dropdown:', e);
        }
    }

    refreshDropdowns() {
        if (!this.initialized) {
            return;
        }
        this.repositionDropdowns();
        this.checkForNewCards();
    }

    repositionDropdowns() {
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.className === 'linked-items-dropdown' && dropdown.originalCard) {
                const card = dropdown.originalCard;
                const container = dropdown.parentNode;
                if (card && container) {
                    this.positionDropdown(dropdown, card, container);
                }
            }
        });
    }

    checkForNewCards() {
        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        let newCardsFound = false;
        cardAreas.forEach(cardArea => {
            const cards = cardArea.querySelectorAll('.board-card');
            cards.forEach(card => {
                const cardId = card.id || '';
                const hasDropdown = this.dropdowns.some(dropdown => dropdown.dataset.cardId === cardId || dropdown.originalCard === card);
                if (!hasDropdown) {
                    try {
                        const dropdown = this.createPlaceholderDropdown(card, cardArea);
                        if (dropdown) {
                            this.dropdowns.push(dropdown);
                            newCardsFound = true;
                            this.fetchAndUpdateDropdown(dropdown, card);
                        }
                    } catch (error) {
                        console.error('Error creating dropdown for new card:', error);
                    }
                }
            });
        });
        return newCardsFound;
    }

    truncateText(text, maxLength) {
        if (!text) return '';
        return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
    }

    handleScroll() {
        this.repositionDropdowns();
    }

    handleResize() {
        this.repositionDropdowns();
    }

    setupMutationObserver() {
        if (this.boardObserver) {
            this.boardObserver.disconnect();
        }
        this.boardObserver = new MutationObserver(mutations => {
            let needsUpdate = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    const hasCardChanges = Array.from(mutation.addedNodes).some(node => node.classList && node.classList.contains('board-card'));
                    if (hasCardChanges) {
                        needsUpdate = true;
                    }
                }
            });
            if (needsUpdate && this.initialized) {
                clearTimeout(this.updateTimeout);
                this.updateTimeout = setTimeout(() => {
                    this.refreshDropdowns();
                }, 100);
            }
        });
        const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
        boardContainers.forEach(container => {
            this.boardObserver.observe(container, {
                childList: true,
                subtree: true
            });
        });
    }

    cleanup() {
        this.saveCacheToLocalStorage();
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.parentNode) {
                dropdown.parentNode.removeChild(dropdown);
            }
        });
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        if (this.cacheSaveInterval) {
            clearInterval(this.cacheSaveInterval);
            this.cacheSaveInterval = null;
        }
        if (this.boardObserver) {
            this.boardObserver.disconnect();
            this.boardObserver = null;
        }
        if (this.cardsObserver) {
            this.cardsObserver.disconnect();
            this.cardsObserver = null;
        }
        this.dropdowns = [];
        this.cardLinks.clear();
        this.cache.issues.clear();
        this.cache.mergeRequests.clear();
        this.cache.relatedIssues.clear();
        this.initialized = false;
    }

    setupCardsMutationObserver() {
        if (this.cardsObserver) {
            this.cardsObserver.disconnect();
        }
        this.cardsObserver = new MutationObserver(mutations => {
            let needsCheck = false;
            mutations.forEach(mutation => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    needsCheck = true;
                }
            });
            if (needsCheck) {
                this.checkForNewCards();
            }
        });
        document.body.querySelectorAll('.boards-app, .boards-list').forEach(container => {
            this.cardsObserver.observe(container, {
                childList: true,
                subtree: true
            });
        });
        if (!document.querySelector('.boards-app, .boards-list')) {
            this.cardsObserver.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    }

    extractRepositoryPath(path) {
        if (!path) {
            return window.location.pathname.split('/boards')[0].replace(/^\//, '');
        }
        if (!path.includes('/') && !path.includes('#')) {
            return path;
        }
        let cleanPath = path;
        if (cleanPath.includes('#')) {
            cleanPath = cleanPath.split('#')[0];
        }
        const boardsMatch = cleanPath.match(/\/boards\/([^\/]+\/[^\/]+)/);
        if (boardsMatch && boardsMatch[1]) {
            return boardsMatch[1];
        }
        const projectMatch = cleanPath.match(/^\/([^\/]+\/[^\/]+)/);
        if (projectMatch && projectMatch[1]) {
            return projectMatch[1];
        }
        const simpleMatch = cleanPath.match(/^\/([^\/]+\/[^\/]+)\/?$/);
        if (simpleMatch && simpleMatch[1]) {
            return simpleMatch[1];
        }
        const fallback = cleanPath.replace(/^\//, '').split('/boards')[0];
        if (fallback.includes('/')) {
            return fallback;
        }
        return window.location.pathname.split('/boards')[0].replace(/^\//, '');
    }

    addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath) {
        if (issueItem.mergeRequests && issueItem.mergeRequests.nodes) {
            issueItem.mergeRequests.nodes.forEach(mr => {
                const mrUrl = mr.webUrl || `${baseUrl}/${projectPath}/-/merge_requests/${mr.iid}`;
                linkedItems.push({
                    type: 'merge_request',
                    title: mr.title || `Merge Request !${mr.iid}`,
                    state: mr.state,
                    url: mrUrl,
                    mrData: mr
                });
            });
        }
        if (issueItem.relatedIssues && issueItem.relatedIssues.nodes) {
            issueItem.relatedIssues.nodes.forEach(related => {
                const relatedPath = related.referencePath || projectPath;
                const issueUrl = related.webUrl || `${baseUrl}/${relatedPath}/-/issues/${related.iid}`;
                linkedItems.push({
                    type: 'issue',
                    title: related.title || `Issue #${related.iid}`,
                    state: related.state,
                    url: issueUrl
                });
            });
        }
    }

    async preloadMergeRequests(projectPath) {
        if (!projectPath) return;
        try {
            const gitlabApi = window.gitlabApi || this.uiManager?.gitlabApi;
            if (!gitlabApi || typeof gitlabApi.callGitLabApiWithCache !== 'function') return;
            const encodedPath = encodeURIComponent(projectPath);
        } catch (error) {
            console.warn('Error preloading merge requests:', error);
        }
    }
}

// File: lib/ui/components/LabelDisplayManager.js
window.LabelDisplayManager = class LabelDisplayManager {
    constructor(options = {}) {
        this.initialized = false;
        this.uiManager = options.uiManager || window.uiManager;
        this.priorityLabels = ['priority', 'Priority', 'high', 'High', 'medium', 'Medium', 'low', 'Low', 'critical', 'Critical'];
        this.indicatorElements = [];
        this.processedCards = new WeakMap(); // Track processed cards
        this.isUpdating = false; // Prevent concurrent updates

        // Define all methods before binding
        this.handleScroll = function() {
            if (!this.initialized || !this.checkEnabled()) return;
            // Update positions immediately
            this.updatePositions();
        };

        this.handleResize = function() {
            if (!this.initialized || !this.checkEnabled()) return;
            // Update positions immediately
            this.updatePositions();
        };

        this.refreshCards = function() {
            if (this.isUpdating) return;
            this.isUpdating = true;

            try {
                // Process all cards
                const cards = document.querySelectorAll('.board-card');
                cards.forEach(card => {
                    // Skip cards we've already processed
                    if (!this.processedCards.has(card)) {
                        this.processCard(card);
                        this.processedCards.set(card, true);
                    }
                });

                // Update positions immediately
                this.updatePositions();
            } finally {
                this.isUpdating = false;
            }
        };

        this.updatePositions = function() {
            if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
                return;
            }

            this.isUpdating = true;

            try {
                this.indicatorElements.forEach(({element, card}) => {
                    if (element && card && element.parentNode) {
                        const container = card.closest('[data-testid="board-list-cards-area"]');
                        if (container) {
                            const cardRect = card.getBoundingClientRect();
                            const containerRect = container.getBoundingClientRect();

                            const top = cardRect.top - containerRect.top + container.scrollTop;
                            const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

                            element.style.top = `${top}px`;
                            element.style.left = `${left}px`;
                            element.style.width = `${cardRect.width - 4}px`;
                        }
                    }
                });
            } finally {
                this.isUpdating = false;
            }
        };

        // Now bind all methods to this instance
        this.handleScroll = this.handleScroll.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.refreshCards = this.refreshCards.bind(this);
        this.updatePositions = this.updatePositions.bind(this);

        // Setup listeners
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);
        this.setupMutationObserver();

        // Check if enabled
        this.checkEnabled();
    }

// Update the setupMutationObserver method to provide instant updates
    setupMutationObserver() {
        if (this.boardObserver) {
            this.boardObserver.disconnect();
        }

        this.boardObserver = new MutationObserver(mutations => {
            if (!this.initialized || !this.checkEnabled()) {
                return;
            }

            let needsUpdate = false;

            mutations.forEach(mutation => {
                // Only process mutations that add/remove elements
                if (mutation.type === 'childList') {
                    const addedCards = Array.from(mutation.addedNodes).filter(node =>
                        node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList?.contains('board-card') || node.querySelector?.('.board-card'))
                    );

                    if (addedCards.length > 0) {
                        needsUpdate = true;
                    }
                }
            });

            if (needsUpdate) {
                // Process immediately without debouncing
                this.refreshCards();
            }
        });

        // Only observe the board containers
        const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
        boardContainers.forEach(container => {
            this.boardObserver.observe(container, {
                childList: true,
                subtree: true,
                attributes: false,
                characterData: false
            });
        });
    }

// Also update initialize to set up continuous checks
    initialize() {
        if (!this.checkEnabled()) {
            return;
        }

        if (this.initialized) {
            return;
        }

        this.initialized = true;
        this.applyOverflowFixes();
        this.processCards();

        // Use a more frequent interval for smoother updates
        this.refreshInterval = setInterval(() => {
            if (!this.isUpdating) {
                this.checkForNewCards();
                this.updatePositions(); // Update positions regularly
            }
        }, 500); // More frequent updates
    }
    checkEnabled() {
        try {
            const enabled = localStorage.getItem('gitLabHelperHideLabelsEnabled');
            return localStorage.getItem('gitLabHelperHideLabelsEnabled') === null ? true : enabled === 'true';
        } catch (e) {
            console.error('Error checking hide labels enabled state:', e);
            return true;
        }
    }

    applyOverflowFixes() {
        this.originalStyles = [];
        const ulElements = document.querySelectorAll('ul.board-list');
        ulElements.forEach(ul => {
            this.originalStyles.push({
                element: ul,
                property: 'overflow-x',
                value: ul.style.overflowX
            });
            ul.style.setProperty('overflow-x', 'unset', 'important');
            ul.style.setProperty('overflow-y', 'unset', 'important');
        });

        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        cardAreas.forEach(area => {
            this.originalStyles.push({
                element: area,
                property: 'overflow',
                value: area.style.overflow
            });
            this.originalStyles.push({
                element: area,
                property: 'position',
                value: area.style.position
            });
            area.style.overflow = 'auto';
            area.style.position = 'relative';
        });

        return cardAreas;
    }

    processCards() {
        if (this.isUpdating) return;
        this.isUpdating = true;

        try {
            // Process all cards
            const cards = document.querySelectorAll('.board-card');
            cards.forEach(card => {
                // Skip cards we've already processed
                if (!this.processedCards.has(card)) {
                    this.processCard(card);
                    this.processedCards.set(card, true);
                }
            });
        } finally {
            this.isUpdating = false;
        }
    }

    processCard(card) {
        // Find the labels container
        const labelsContainer = card.querySelector('.board-card-labels');
        if (!labelsContainer) return;

        // Hide the labels container
        labelsContainer.style.display = 'none';

        // Find priority labels
        const labels = Array.from(labelsContainer.querySelectorAll('.gl-label'));
        const priorityLabel = labels.find(label => {
            const labelText = label.textContent.trim();
            return this.priorityLabels.some(priority =>
                labelText.includes(priority)
            );
        });

        if (priorityLabel) {
            // Get the background color of the priority label
            const style = window.getComputedStyle(priorityLabel);
            const backgroundColor = style.backgroundColor;

            // Store a unique ID for this card if it doesn't have one
            if (!card.id) {
                card.id = `card-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
            }

            // Find the board-list-cards-area container
            const container = card.closest('[data-testid="board-list-cards-area"]');
            if (!container) return;

            // Create indicator line
            const indicator = document.createElement('div');
            indicator.className = 'priority-indicator';
            indicator.dataset.cardId = card.id;

            // Position relative to the container (similar to dropdown)
            const cardRect = card.getBoundingClientRect();
            const containerRect = container.getBoundingClientRect();

            const top = cardRect.top - containerRect.top + container.scrollTop;
            const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

            indicator.style.position = 'absolute';
            indicator.style.top = `${top}px`;
            indicator.style.left = `${left}px`;
            indicator.style.width = `${cardRect.width - 4}px`;
            indicator.style.height = '4px';
            indicator.style.backgroundColor = backgroundColor;
            indicator.style.zIndex = '98'; // Below dropdown z-index
            indicator.style.borderRadius = '2px';

            // Add indicator to the board-list-cards-area
            container.appendChild(indicator);
            this.indicatorElements.push({
                element: indicator,
                card: card
            });
        }
    }

    checkForNewCards() {
        if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
            return;
        }

        const cards = document.querySelectorAll('.board-card');
        let newCardsFound = false;

        cards.forEach(card => {
            if (!this.processedCards.has(card)) {
                newCardsFound = true;
            }
        });

        if (newCardsFound) {
            this.processCards();
        }
    }

    updatePositions() {
        if (!this.initialized || !this.checkEnabled() || this.isUpdating) {
            return;
        }

        this.isUpdating = true;

        try {
            this.indicatorElements.forEach(({element, card}) => {
                if (element && card && element.parentNode) {
                    const container = card.closest('[data-testid="board-list-cards-area"]');
                    if (container) {
                        const cardRect = card.getBoundingClientRect();
                        const containerRect = container.getBoundingClientRect();

                        const top = cardRect.top - containerRect.top + container.scrollTop;
                        const left = cardRect.left - containerRect.left + container.scrollLeft + 2;

                        element.style.top = `${top}px`;
                        element.style.left = `${left}px`;
                        element.style.width = `${cardRect.width - 4}px`;
                    }
                }
            });
        } finally {
            this.isUpdating = false;
        }
    }

    handleScroll() {
        if (!this.initialized || !this.checkEnabled()) return;

        // Only update positions when scrolling stops
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = setTimeout(() => {
            this.updatePositions();
        }, 100);
    }

    handleResize() {
        if (!this.initialized || !this.checkEnabled()) return;

        // Only update positions when resizing stops
        clearTimeout(this.resizeTimeout);
        this.resizeTimeout = setTimeout(() => {
            this.updatePositions();
        }, 100);
    }



    cleanup() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        if (this.boardObserver) {
            this.boardObserver.disconnect();
            this.boardObserver = null;
        }

        if (this.updateTimeout) {
            clearTimeout(this.updateTimeout);
            this.updateTimeout = null;
        }

        if (this.scrollTimeout) {
            clearTimeout(this.scrollTimeout);
            this.scrollTimeout = null;
        }

        if (this.resizeTimeout) {
            clearTimeout(this.resizeTimeout);
            this.resizeTimeout = null;
        }

        // Show all label containers again
        document.querySelectorAll('.board-card-labels').forEach(container => {
            container.style.display = '';
        });

        // Remove all indicator elements
        this.indicatorElements.forEach(({element}) => {
            if (element && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });

        this.indicatorElements = [];
        this.processedCards = new WeakMap();
        this.initialized = false;
        this.isUpdating = false;
    }
}

// File: lib/ui/managers/TabManager.js
window.TabManager = class TabManager {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.tabContainer = null;
    this.tabs = {};
    this.contentAreas = {};
    try {
      let lastTab = getLastActiveTab() || 'summary';
      if (lastTab === 'history') {
        lastTab = 'summary';
      }
      this.currentTab = lastTab;
    } catch (e) {
      console.warn('Error loading last active tab:', e);
      this.currentTab = 'summary';
    }
  }
  initialize(parentElement) {
    this.tabContainer = document.createElement('div');
    this.tabContainer.style.display = 'flex';
    this.tabContainer.style.marginBottom = '10px';
    this.tabContainer.style.borderBottom = '1px solid #ddd';
    this.createTab('summary', 'Summary', this.currentTab === 'summary');
    this.createTab('boards', 'Boards', this.currentTab === 'boards');
    this.createTab('bulkcomments', 'Issues', this.currentTab === 'bulkcomments');
    this.createTab('sprintmanagement', 'Sprint', this.currentTab === 'sprintmanagement');
    this.createTab('stats', 'Stats', this.currentTab === 'stats');
    parentElement.appendChild(this.tabContainer);
    this.createContentAreas(parentElement);
  }
  createTab(id, label, isActive = false) {
    const tab = document.createElement('div');
    tab.textContent = label;
    tab.dataset.tab = id;
    tab.style.padding = '5px 10px';
    tab.style.cursor = 'pointer';
    if (isActive) {
      tab.style.borderBottom = '2px solid #1f75cb';
      tab.style.fontWeight = 'bold';
      this.currentTab = id;
    }
    tab.addEventListener('click', () => {
      this.switchToTab(id);
    });
    this.tabs[id] = tab;
    this.tabContainer.appendChild(tab);
  }
  createContentAreas(parentElement) {
    const summaryContent = document.createElement('div');
    summaryContent.id = 'assignee-time-summary-content';
    summaryContent.style.display = this.currentTab === 'summary' ? 'block' : 'none';
    summaryContent.style.position = 'relative';
    summaryContent.style.height = '530px';
    summaryContent.style.overflowY = 'auto';
    summaryContent.style.maxHeight = '60vh';
    parentElement.appendChild(summaryContent);
    this.contentAreas['summary'] = summaryContent;
    if (this.uiManager && this.uiManager.addLoadingScreen) {
      this.uiManager.addLoadingScreen(summaryContent, 'summary-tab', 'Loading summary data...');
    }
    const boardsContent = document.createElement('div');
    boardsContent.id = 'boards-time-summary-content';
    boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
    boardsContent.style.position = 'relative';
    boardsContent.style.height = '530px';
    boardsContent.style.overflowY = 'auto';
    boardsContent.style.maxHeight = '60vh';
    parentElement.appendChild(boardsContent);
    this.contentAreas['boards'] = boardsContent;
    if (this.uiManager && this.uiManager.addLoadingScreen) {
      this.uiManager.addLoadingScreen(boardsContent, 'boards-tab', 'Loading board data...');
    }
    const bulkCommentsContent = document.createElement('div');
    bulkCommentsContent.id = 'bulk-comments-content';
    bulkCommentsContent.style.display = this.currentTab === 'bulkcomments' ? 'block' : 'none';
    bulkCommentsContent.style.position = 'relative';
    bulkCommentsContent.style.height = '530px';
    bulkCommentsContent.style.overflowY = 'auto';
    bulkCommentsContent.style.maxHeight = '60vh';
    parentElement.appendChild(bulkCommentsContent);
    this.contentAreas['bulkcomments'] = bulkCommentsContent;
    if (this.uiManager && this.uiManager.addLoadingScreen) {
      this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
    }
    const sprintManagementContent = document.createElement('div');
    sprintManagementContent.id = 'sprint-management-content';
    sprintManagementContent.style.display = this.currentTab === 'sprintmanagement' ? 'block' : 'none';
    sprintManagementContent.style.position = 'relative';
    sprintManagementContent.style.height = '530px';
    sprintManagementContent.style.overflowY = 'auto';
    sprintManagementContent.style.maxHeight = '60vh';
    parentElement.appendChild(sprintManagementContent);
    this.contentAreas['sprintmanagement'] = sprintManagementContent;
    if (this.uiManager && this.uiManager.addLoadingScreen) {
      this.uiManager.addLoadingScreen(sprintManagementContent, 'sprintmanagement-tab', 'Loading sprint management tools...');
    }
    const statsContent = document.createElement('div');
    statsContent.id = 'stats-content';
    statsContent.style.display = this.currentTab === 'stats' ? 'block' : 'none';
    statsContent.style.position = 'relative';
    statsContent.style.height = '530px';
    statsContent.style.overflowY = 'auto';
    statsContent.style.maxHeight = '60vh';
    parentElement.appendChild(statsContent);
    this.contentAreas['stats'] = statsContent;
    if (this.uiManager && this.uiManager.addLoadingScreen) {
      this.uiManager.addLoadingScreen(statsContent, 'stats-tab', 'Loading statistics...');
    }
  }
  switchToTab(tabId) {
    Object.keys(this.tabs).forEach(id => {
      this.tabs[id].style.borderBottom = 'none';
      this.tabs[id].style.fontWeight = 'normal';
      this.contentAreas[id].style.display = 'none';
    });
    this.tabs[tabId].style.borderBottom = '2px solid #1f75cb';
    this.tabs[tabId].style.fontWeight = 'bold';
    this.contentAreas[tabId].style.display = 'block';
    this.currentTab = tabId;
    try {
      saveLastActiveTab(tabId);
    } catch (e) {
      console.warn('Error saving tab selection:', e);
    }
    if (tabId === 'bulkcomments' && this.uiManager.bulkCommentsView) {
      this.uiManager.bulkCommentsView.render();
      if (this.uiManager && this.uiManager.removeLoadingScreen) {
        this.uiManager.removeLoadingScreen('bulkcomments-tab');
      }
    }
    if (tabId === 'sprintmanagement' && this.uiManager.sprintManagementView) {
      this.uiManager.sprintManagementView.render();
      if (this.uiManager && this.uiManager.removeLoadingScreen) {
        this.uiManager.removeLoadingScreen('sprintmanagement-tab');
      }
    }
    if (tabId === 'stats' && this.uiManager.statsView) {
      this.uiManager.statsView.render();
      if (this.uiManager && this.uiManager.removeLoadingScreen) {
        this.uiManager.removeLoadingScreen('stats-tab');
      }
    }
    uiManager.issueSelector.applyOverflowFixes();
  }
}

// File: lib/ui/managers/CommandManager.js
window.CommandManager = class CommandManager {
  constructor(options = {}) {
    this.targetElement = options.targetElement;
    this.gitlabApi = options.gitlabApi;
    this.labelManager = options.labelManager;
    this.onCommandInsert = options.onCommandInsert || null;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.assigneeWhitelist = getAssigneeWhitelist();
    this.shortcutContainer = null;
    this.commandShortcut = null;
  }
  initialize(container) {
    this.shortcutContainer = container;
    this.commandShortcut = new CommandShortcut({
      targetElement: this.targetElement,
      onShortcutInsert: (type, value) => {
        if (typeof this.onCommandInsert === 'function') {
          this.onCommandInsert(type, value);
        }
      }
    });
    this.commandShortcut.initialize(container);
    this.addCustomShortcuts();
  }
  addCustomShortcuts() {
    if (!this.commandShortcut) return;
    this.addMilestoneShortcut();
    this.addAssignShortcut();
    this.addDueDateShortcut();
    this.addWeightShortcut();
  }
  addMilestoneShortcut() {
    this.commandShortcut.addCustomShortcut({
      type: 'milestone',
      label: '/milestone',
      items: [{
        value: '',
        label: 'Set Milestone'
      }, {
        value: '%current',
        label: 'Current Sprint'
      }, {
        value: '%next',
        label: 'Next Sprint'
      }, {
        value: '%upcoming',
        label: 'Upcoming'
      }, {
        value: '%backlog',
        label: 'Backlog'
      }, {
        value: 'none',
        label: 'Remove Milestone'
      }],
      onSelect: value => {
        if (!this.targetElement) return;
        let milestoneText = '/milestone ';
        if (value === 'none') {
          milestoneText += '%""';
        } else if (value.startsWith('%')) {
          milestoneText += value;
        } else {
          milestoneText += `%"${value}"`;
        }
        const milestoneRegex = /\/milestone\s+%[^\n]+/g;
        this.replaceOrInsertCommand('milestone', milestoneText, milestoneRegex, () => this.insertTextAtCursor(milestoneText));
        this.notification.info(`Milestone command added: ${value}`);
      }
    });
  }
  addAssignShortcut() {
    if (!this.commandShortcuts) return;
    try {
      let assignItems = [{
        value: '',
        label: 'Assign to...'
      }, {
        value: '@me',
        label: 'Myself'
      }, {
        value: 'none',
        label: 'Unassign'
      }];
      if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
        try {
          const whitelistedAssignees = this.assigneeManager.getAssigneeWhitelist();
          if (Array.isArray(whitelistedAssignees) && whitelistedAssignees.length > 0) {
            assignItems.push({
              value: 'separator',
              label: '────── Favorites ──────'
            });
            const whitelistItems = whitelistedAssignees.map(assignee => ({
              value: assignee.username,
              label: assignee.name || assignee.username
            }));
            assignItems = assignItems.concat(whitelistItems);
          }
        } catch (e) {
          console.error('Error getting assignee whitelist from manager:', e);
          try {
            const assignees = getAssigneeWhitelist();
            if (Array.isArray(assignees) && assignees.length > 0) {
              assignItems.push({
                value: 'separator',
                label: '────── Favorites ──────'
              });
              const whitelistItems = assignees.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
              }));
              assignItems = assignItems.concat(whitelistItems);
            }
          } catch (storageError) {
            console.error('Error accessing assignee whitelist from storage:', storageError);
          }
        }
      } else {
        try {
          let assignees = [];
          if (typeof getAssigneeWhitelist === 'function') {
            assignees = getAssigneeWhitelist();
          } else if (window.getAssigneeWhitelist) {
            assignees = window.getAssigneeWhitelist();
          } else {
            console.warn('getAssigneeWhitelist function not available, no assignees will be loaded');
          }
          if (Array.isArray(assignees) && assignees.length > 0) {
            assignItems.push({
              value: 'separator',
              label: '────── Favorites ──────'
            });
            const whitelistItems = assignees.map(assignee => ({
              value: assignee.username,
              label: assignee.name || assignee.username
            }));
            assignItems = assignItems.concat(whitelistItems);
          }
        } catch (directError) {
          console.error('Error directly accessing assignee whitelist:', directError);
        }
      }
      this.fetchGroupMembers().then(members => {
        if (members && members.length > 0) {
          assignItems.push({
            value: 'separator2',
            label: '────── Group Members ──────'
          });
          const memberItems = members.map(member => ({
            value: member.username,
            label: member.name || member.username
          }));
          assignItems = assignItems.concat(memberItems);
          this.updateAssignShortcut(assignItems);
        }
      }).catch(error => {
        console.error('Error fetching group members:', error);
      });
      assignItems.push({
        value: 'custom',
        label: 'Custom...'
      });
      assignItems.push({
        value: 'manage',
        label: '✏️ Manage Assignees...'
      });
      this.updateAssignShortcut(assignItems);
    } catch (e) {
      console.error('Error adding assign shortcut:', e);
    }
  }
  addDueDateShortcut() {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    const nextMonth = new Date(today);
    nextMonth.setMonth(nextMonth.getMonth() + 1);
    const formatDate = date => {
      return date.toISOString().substring(0, 10);
    };
    this.commandShortcut.addCustomShortcut({
      type: 'due',
      label: '/due',
      items: [{
        value: '',
        label: 'Set Due Date'
      }, {
        value: formatDate(today),
        label: 'Today'
      }, {
        value: formatDate(tomorrow),
        label: 'Tomorrow'
      }, {
        value: formatDate(nextWeek),
        label: 'Next Week'
      }, {
        value: formatDate(nextMonth),
        label: 'Next Month'
      }, {
        value: 'custom',
        label: 'Custom Date...'
      }, {
        value: 'none',
        label: 'Remove Due Date'
      }],
      onSelect: value => {
        if (!this.targetElement) return;
        if (value === 'custom') {
          const customDate = prompt('Enter due date (YYYY-MM-DD):', formatDate(today));
          if (!customDate) return;
          if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
            this.notification.error('Invalid date format. Please use YYYY-MM-DD');
            return;
          }
          value = customDate;
        }
        let dueText = '/due ';
        if (value === 'none') {
          dueText += 'none';
        } else {
          dueText += value;
        }
        const dueRegex = /\/due\s+[^\n]+/g;
        this.replaceOrInsertCommand('due', dueText, dueRegex, () => this.insertTextAtCursor(dueText));
        if (value === 'none') {
          this.notification.info('Due date will be removed');
        } else {
          this.notification.info(`Due date set to ${value}`);
        }
      }
    });
  }
  addWeightShortcut() {
    this.commandShortcut.addCustomShortcut({
      type: 'weight',
      label: '/weight',
      items: [{
        value: '',
        label: 'Set Weight'
      }, {
        value: '1',
        label: '1 (Trivial)'
      }, {
        value: '2',
        label: '2 (Small)'
      }, {
        value: '3',
        label: '3 (Medium)'
      }, {
        value: '5',
        label: '5 (Large)'
      }, {
        value: '8',
        label: '8 (Very Large)'
      }, {
        value: 'custom',
        label: 'Custom Weight...'
      }, {
        value: 'none',
        label: 'Remove Weight'
      }],
      onSelect: value => {
        if (!this.targetElement) return;
        if (value === 'custom') {
          const customWeight = prompt('Enter weight (number):', '');
          if (!customWeight) return;
          const weight = parseInt(customWeight, 10);
          if (isNaN(weight) || weight < 0) {
            this.notification.error('Invalid weight. Please enter a positive number');
            return;
          }
          value = customWeight;
        }
        let weightText = '/weight ';
        if (value === 'none') {
          weightText += 'none';
        } else {
          weightText += value;
        }
        const weightRegex = /\/weight\s+[^\n]+/g;
        this.replaceOrInsertCommand('weight', weightText, weightRegex, () => this.insertTextAtCursor(weightText));
        if (value === 'none') {
          this.notification.info('Weight will be removed');
        } else {
          this.notification.info(`Weight set to ${value}`);
        }
      }
    });
  }
  openAssigneeManager() {
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'assignee-manager-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.zIndex = '110';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.borderRadius = '6px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '500px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    const modalHeader = document.createElement('div');
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.style.marginBottom = '15px';
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = 'Manage Assignees';
    modalTitle.style.margin = '0';
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.onclick = () => modalOverlay.remove();
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);
    const assigneeSection = document.createElement('div');
    const description = document.createElement('p');
    description.textContent = 'Add usernames to quickly assign issues. These will appear in your /assign dropdown.';
    description.style.marginBottom = '15px';
    const assigneeList = document.createElement('div');
    assigneeList.style.marginBottom = '15px';
    assigneeList.style.maxHeight = '200px';
    assigneeList.style.overflowY = 'auto';
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add some below.';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.padding = '10px 0';
      return emptyMessage;
    };
    this.assigneeWhitelist.forEach((assignee, index) => {
      const assigneeItem = document.createElement('div');
      assigneeItem.style.display = 'flex';
      assigneeItem.style.justifyContent = 'space-between';
      assigneeItem.style.alignItems = 'center';
      assigneeItem.style.padding = '8px';
      assigneeItem.style.borderBottom = '1px solid #eee';
      const assigneeInfo = document.createElement('div');
      assigneeInfo.style.display = 'flex';
      assigneeInfo.style.alignItems = 'center';
      const assigneeName = document.createElement('div');
      assigneeName.textContent = assignee.name || assignee.username;
      assigneeName.style.fontWeight = 'bold';
      assigneeName.style.marginRight = '5px';
      const assigneeUsername = document.createElement('div');
      assigneeUsername.textContent = `@${assignee.username}`;
      assigneeUsername.style.color = '#666';
      assigneeUsername.style.fontSize = '13px';
      assigneeInfo.appendChild(assigneeName);
      assigneeInfo.appendChild(assigneeUsername);
      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.style.padding = '3px 8px';
      removeButton.style.backgroundColor = '#dc3545';
      removeButton.style.color = 'white';
      removeButton.style.border = 'none';
      removeButton.style.borderRadius = '3px';
      removeButton.style.cursor = 'pointer';
      removeButton.onclick = () => {
        this.assigneeWhitelist.splice(index, 1);
        saveAssigneeWhitelist(this.assigneeWhitelist);
        assigneeItem.remove();
        if (this.assigneeWhitelist.length === 0) {
          assigneeList.appendChild(createEmptyMessage());
        }
      };
      assigneeItem.appendChild(assigneeInfo);
      assigneeItem.appendChild(removeButton);
      assigneeList.appendChild(assigneeItem);
    });
    if (this.assigneeWhitelist.length === 0) {
      assigneeList.appendChild(createEmptyMessage());
    }
    const addForm = document.createElement('div');
    addForm.style.marginTop = '20px';
    addForm.style.marginBottom = '20px';
    addForm.style.padding = '15px';
    addForm.style.backgroundColor = '#f8f9fa';
    addForm.style.borderRadius = '4px';
    const formTitle = document.createElement('div');
    formTitle.textContent = 'Add New Assignee';
    formTitle.style.fontWeight = 'bold';
    formTitle.style.marginBottom = '10px';
    const nameContainer = document.createElement('div');
    nameContainer.style.marginBottom = '10px';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Display Name:';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '5px';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'John Doe';
    nameInput.style.width = '100%';
    nameInput.style.padding = '8px';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid #ccc';
    nameContainer.appendChild(nameLabel);
    nameContainer.appendChild(nameInput);
    const usernameContainer = document.createElement('div');
    usernameContainer.style.marginBottom = '15px';
    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'GitLab Username:';
    usernameLabel.style.display = 'block';
    usernameLabel.style.marginBottom = '5px';
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.placeholder = 'username (without @)';
    usernameInput.style.width = '100%';
    usernameInput.style.padding = '8px';
    usernameInput.style.borderRadius = '4px';
    usernameInput.style.border = '1px solid #ccc';
    usernameContainer.appendChild(usernameLabel);
    usernameContainer.appendChild(usernameInput);
    const addButton = document.createElement('button');
    addButton.textContent = 'Add Assignee';
    addButton.style.padding = '8px 16px';
    addButton.style.backgroundColor = '#28a745';
    addButton.style.color = 'white';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.cursor = 'pointer';
    addButton.onclick = () => {
      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      if (!username) {
        alert('Username is required');
        return;
      }
      const newAssignee = {
        name: name || username,
        username: username
      };
      const existingIndex = this.assigneeWhitelist.findIndex(a => a.username === username);
      if (existingIndex >= 0) {
        this.assigneeWhitelist[existingIndex] = newAssignee;
      } else {
        this.assigneeWhitelist.push(newAssignee);
      }
      saveAssigneeWhitelist(this.assigneeWhitelist);
      const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
      if (emptyMessage) {
        emptyMessage.remove();
      }
      const assigneeItem = document.createElement('div');
      assigneeItem.style.display = 'flex';
      assigneeItem.style.justifyContent = 'space-between';
      assigneeItem.style.alignItems = 'center';
      assigneeItem.style.padding = '8px';
      assigneeItem.style.borderBottom = '1px solid #eee';
      const assigneeInfo = document.createElement('div');
      assigneeInfo.style.display = 'flex';
      assigneeInfo.style.alignItems = 'center';
      const assigneeName = document.createElement('div');
      assigneeName.textContent = newAssignee.name;
      assigneeName.style.fontWeight = 'bold';
      assigneeName.style.marginRight = '5px';
      const assigneeUsername = document.createElement('div');
      assigneeUsername.textContent = `@${newAssignee.username}`;
      assigneeUsername.style.color = '#666';
      assigneeUsername.style.fontSize = '13px';
      assigneeInfo.appendChild(assigneeName);
      assigneeInfo.appendChild(assigneeUsername);
      const removeButton = document.createElement('button');
      removeButton.textContent = 'Remove';
      removeButton.style.padding = '3px 8px';
      removeButton.style.backgroundColor = '#dc3545';
      removeButton.style.color = 'white';
      removeButton.style.border = 'none';
      removeButton.style.borderRadius = '3px';
      removeButton.style.cursor = 'pointer';
      removeButton.onclick = () => {
        const index = this.assigneeWhitelist.findIndex(a => a.username === newAssignee.username);
        if (index >= 0) {
          this.assigneeWhitelist.splice(index, 1);
          saveAssigneeWhitelist(this.assigneeWhitelist);
          assigneeItem.remove();
          if (this.assigneeWhitelist.length === 0) {
            assigneeList.appendChild(createEmptyMessage());
          }
        }
      };
      assigneeItem.appendChild(assigneeInfo);
      assigneeItem.appendChild(removeButton);
      assigneeList.appendChild(assigneeItem);
      nameInput.value = '';
      usernameInput.value = '';
      this.notification.success(`Added assignee: ${newAssignee.name}`);
    };
    addForm.appendChild(formTitle);
    addForm.appendChild(nameContainer);
    addForm.appendChild(usernameContainer);
    addForm.appendChild(addButton);
    const saveButton = document.createElement('button');
    saveButton.textContent = 'Close';
    saveButton.style.padding = '8px 16px';
    saveButton.style.backgroundColor = '#6c757d';
    saveButton.style.color = 'white';
    saveButton.style.border = 'none';
    saveButton.style.borderRadius = '4px';
    saveButton.style.cursor = 'pointer';
    saveButton.style.marginTop = '10px';
    saveButton.onclick = () => {
      modalOverlay.remove();
      this.addAssignShortcut();
    };
    assigneeSection.appendChild(description);
    assigneeSection.appendChild(assigneeList);
    assigneeSection.appendChild(addForm);
    assigneeSection.appendChild(saveButton);
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(assigneeSection);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
        this.addAssignShortcut();
      }
    });
  }
  insertTextAtCursor(text) {
    if (!this.targetElement) return;
    const startPos = this.targetElement.selectionStart;
    const endPos = this.targetElement.selectionEnd;
    const currentText = this.targetElement.value;
    let insertText = text;
    if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
      insertText = '\n' + insertText;
    }
    this.targetElement.value = currentText.substring(0, startPos) + insertText + currentText.substring(endPos);
    const newCursorPos = startPos + insertText.length;
    this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
    this.targetElement.focus();
  }
  replaceOrInsertCommand(type, command, regex, insertFn) {
    if (!this.targetElement) return;
    const currentText = this.targetElement.value;
    const hasCommand = regex.test(currentText);
    if (hasCommand) {
      const newText = currentText.replace(regex, command);
      this.targetElement.value = newText;
      this.targetElement.focus();
    } else {
      insertFn();
    }
    if (typeof this.onCommandInsert === 'function') {
      this.onCommandInsert(type, command);
    }
  }
}

// File: lib/ui/managers/LabelManager.js
window.LabelManager = class LabelManager {
  constructor(options = {}) {
    this.gitlabApi = options.gitlabApi || window.gitlabApi;
    this.onLabelsLoaded = options.onLabelsLoaded || null;
    this.labelWhitelist = [];
    try {
      this.labelWhitelist = getLabelWhitelist();
      if (!Array.isArray(this.labelWhitelist)) {
        console.warn("Loaded whitelist is not an array, using default");
        this.labelWhitelist = this.getDefaultWhitelist();
      }
    } catch (e) {
      console.warn("Error loading label whitelist, using default", e);
      this.labelWhitelist = this.getDefaultWhitelist();
    }
    this.availableLabels = [];
    this.filteredLabels = [];
    this.isLoading = false;
  }
  getDefaultWhitelist() {
    return ['bug', 'feature', 'documentation', 'enhancement', 'security', 'priority', 'high', 'medium', 'low', 'critical', 'frontend', 'backend', 'ui', 'ux', 'api', 'wontfix', 'duplicate', 'invalid', 'question', 'ready', 'in progress', 'review', 'blocked'];
  }
  saveWhitelist(whitelist) {
    if (!Array.isArray(whitelist)) {
      whitelist = [];
    }
    this.labelWhitelist = whitelist;
    try {
      saveLabelWhitelist(whitelist);
    } catch (e) {
      console.error("Error saving label whitelist", e);
    }
    this.filterLabels();
  }
  resetToDefaultWhitelist() {
    try {
      this.labelWhitelist = this.getDefaultWhitelist();
      saveLabelWhitelist(this.labelWhitelist);
    } catch (e) {
      console.error("Error resetting label whitelist", e);
    }
    this.filterLabels();
    return this.labelWhitelist;
  }
  isLabelInWhitelist(labelName, whitelist = null) {
    const whitelistToUse = whitelist || this.labelWhitelist;
    if (!Array.isArray(whitelistToUse) || typeof labelName !== 'string') {
      return false;
    }
    const lowerName = labelName.toLowerCase();
    return whitelistToUse.some(term => {
      if (typeof term !== 'string') return false;
      return lowerName.includes(term.toLowerCase());
    });
  }
  filterLabels() {
    if (!this.availableLabels || this.availableLabels.length === 0) {
      this.filteredLabels = [];
      return;
    }
    this.filteredLabels = this.availableLabels.filter(label => {
      if (!label || typeof label.name !== 'string') return false;
      return this.isLabelInWhitelist(label.name);
    });
    this.filteredLabels.sort((a, b) => a.name.localeCompare(b.name));
    if (typeof this.onLabelsLoaded === 'function') {
      this.onLabelsLoaded(this.filteredLabels);
    }
  }
  async fetchAllLabels() {
    try {
      this.isLoading = true;
      if (!this.gitlabApi) {
        this.gitlabApi = window.gitlabApi;
      }
      if (!this.gitlabApi) {
        console.warn('GitLab API instance not available, using fallback labels');
        this.isLoading = false;
        return this.addFallbackLabels();
      }
      const pathInfo = getPathFromUrl();
      if (!pathInfo || !pathInfo.apiUrl) {
        console.warn('Path info not found or invalid, returning fallback labels');
        this.isLoading = false;
        return this.addFallbackLabels();
      }
      try {
        const labels = await this.gitlabApi.callGitLabApiWithCache(pathInfo.apiUrl, {
          params: {
            per_page: 100
          }
        });
        if (!Array.isArray(labels)) {
          console.warn('API did not return an array of labels, using fallback');
          this.isLoading = false;
          return this.addFallbackLabels();
        }
        this.availableLabels = labels;
        this.filterLabels();
        this.isLoading = false;
        return this.filteredLabels;
      } catch (apiError) {
        console.error(`Error fetching ${pathInfo.type} labels from API:`, apiError);
        this.isLoading = false;
        return this.addFallbackLabels();
      }
    } catch (error) {
      console.error('Error in fetchAllLabels:', error);
      this.isLoading = false;
      return this.addFallbackLabels();
    }
  }
  addFallbackLabels() {
    const fallbackLabels = [{
      name: 'bug',
      color: '#ff0000'
    }, {
      name: 'feature',
      color: '#1f75cb'
    }, {
      name: 'enhancement',
      color: '#7057ff'
    }, {
      name: 'documentation',
      color: '#0075ca'
    }, {
      name: 'priority',
      color: '#d73a4a'
    }, {
      name: 'blocked',
      color: '#b60205'
    }];
    this.availableLabels = fallbackLabels;
    this.filterLabels();
    if (typeof this.onLabelsLoaded === 'function') {
      this.onLabelsLoaded(this.filteredLabels);
    }
    return this.filteredLabels;
  }
  getLabelOptions(includeEmpty = true) {
    if (!this.filteredLabels || this.filteredLabels.length === 0) {
      const basicOptions = [];
      if (includeEmpty) {
        basicOptions.push({
          value: '',
          label: 'Add Label'
        });
      }
      return basicOptions.concat([{
        value: 'bug',
        label: 'Bug'
      }, {
        value: 'feature',
        label: 'Feature'
      }, {
        value: 'enhancement',
        label: 'Enhancement'
      }, {
        value: 'custom',
        label: 'Custom...'
      }]);
    }
    const labelOptions = this.filteredLabels.map(label => ({
      value: label.name,
      label: label.name,
      color: label.color
    }));
    if (includeEmpty) {
      labelOptions.unshift({
        value: '',
        label: 'Add Label'
      });
    }
    labelOptions.push({
      value: 'custom',
      label: 'Custom...'
    });
    return labelOptions;
  }
  createStyledLabel(label) {
    const labelElement = document.createElement('span');
    labelElement.textContent = label.label || label.name || '';
    const labelText = label.label || label.name || 'label';
    const bgColor = label.color || generateColorFromString(labelText);
    const textColor = getContrastColor(bgColor);
    labelElement.style.backgroundColor = bgColor;
    labelElement.style.color = textColor;
    labelElement.style.padding = '4px 8px';
    labelElement.style.borderRadius = '100px';
    labelElement.style.fontSize = '12px';
    labelElement.style.fontWeight = '500';
    labelElement.style.display = 'inline-block';
    labelElement.style.margin = '2px';
    labelElement.style.maxWidth = '100%';
    labelElement.style.overflow = 'hidden';
    labelElement.style.textOverflow = 'ellipsis';
    labelElement.style.whiteSpace = 'nowrap';
    return labelElement;
  }
  insertLabelCommand(textarea, labelName) {
    if (!textarea || typeof labelName !== 'string') return;
    const labelText = `/label ~"${labelName}"`;
    const labelRegex = /\/label\s+~[^\n]+/g;
    const currentText = textarea.value;
    const hasCommand = labelRegex.test(currentText);
    if (hasCommand) {
      textarea.value = currentText.replace(labelRegex, labelText);
    } else {
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      let insertText = labelText;
      if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
        insertText = '\n' + insertText;
      }
      textarea.value = currentText.substring(0, startPos) + insertText + currentText.substring(endPos);
      const newCursorPos = startPos + insertText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }
    textarea.focus();
  }
  async initLabelDropdown(createDropdown, dropdownOptions = {}) {
    const dropdown = createDropdown({
      items: [{
        value: '',
        label: 'Loading labels...'
      }],
      disabled: true,
      ...dropdownOptions
    });
    try {
      await this.fetchAllLabels();
      dropdown.updateItems(this.getLabelOptions());
      dropdown.enable();
    } catch (error) {
      console.error('Error initializing label dropdown:', error);
      dropdown.updateItems([{
        value: '',
        label: 'Error loading labels'
      }, {
        value: 'bug',
        label: 'Bug'
      }, {
        value: 'feature',
        label: 'Feature'
      }, {
        value: 'custom',
        label: 'Custom...'
      }]);
      dropdown.enable();
    }
    return dropdown;
  }
}

// File: lib/ui/managers/AssigneeManager.js
window.AssigneeManager = class AssigneeManager {
  constructor(options = {}) {
    this.gitlabApi = options.gitlabApi;
    this.onAssigneesChange = options.onAssigneesChange || null;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.assigneeWhitelist = getAssigneeWhitelist();
    this.currentUsers = [];
  }
  getAssigneeWhitelist() {
    return [...this.assigneeWhitelist];
  }
  saveWhitelist(whitelist) {
    this.assigneeWhitelist = whitelist;
    saveAssigneeWhitelist(whitelist);
    if (typeof this.onAssigneesChange === 'function') {
      this.onAssigneesChange(this.assigneeWhitelist);
    }
  }
  addAssignee(assignee) {
    if (!assignee || !assignee.username) {
      return false;
    }
    const existingIndex = this.assigneeWhitelist.findIndex(a => a.username.toLowerCase() === assignee.username.toLowerCase());
    if (existingIndex >= 0) {
      this.assigneeWhitelist[existingIndex] = {
        ...this.assigneeWhitelist[existingIndex],
        ...assignee
      };
    } else {
      this.assigneeWhitelist.push(assignee);
    }
    saveAssigneeWhitelist(this.assigneeWhitelist);
    if (typeof this.onAssigneesChange === 'function') {
      this.onAssigneesChange(this.assigneeWhitelist);
    }
    return true;
  }
  removeAssignee(username) {
    if (!username) {
      return false;
    }
    const initialLength = this.assigneeWhitelist.length;
    this.assigneeWhitelist = this.assigneeWhitelist.filter(a => a.username.toLowerCase() !== username.toLowerCase());
    if (this.assigneeWhitelist.length === initialLength) {
      return false;
    }
    saveAssigneeWhitelist(this.assigneeWhitelist);
    if (typeof this.onAssigneesChange === 'function') {
      this.onAssigneesChange(this.assigneeWhitelist);
    }
    return true;
  }
  async fetchCurrentUser() {
    if (!this.gitlabApi) {
      throw new Error('GitLab API instance not provided');
    }
    try {
      const user = await this.gitlabApi.getCurrentUser();
      this.addAssignee({
        name: user.name,
        username: user.username
      });
      return user;
    } catch (error) {
      console.error('Error fetching current user:', error);
      throw error;
    }
  }
  openAssigneeManager() {
    const modalOverlay = document.createElement('div');
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.zIndex = '110';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.borderRadius = '6px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '600px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    const modalHeader = document.createElement('div');
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.style.marginBottom = '15px';
    modalHeader.style.borderBottom = '1px solid #eee';
    modalHeader.style.paddingBottom = '10px';
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = 'Manage Assignees';
    modalTitle.style.margin = '0';
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.onclick = () => modalOverlay.remove();
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);
    const contentArea = document.createElement('div');
    const description = document.createElement('p');
    description.textContent = 'Manage assignees that appear in the assignee dropdown. These users will be available for quick assignment to issues.';
    description.style.marginBottom = '20px';
    const listSection = document.createElement('div');
    listSection.style.marginBottom = '20px';
    const listTitle = document.createElement('h4');
    listTitle.textContent = 'Current Assignees';
    listTitle.style.marginBottom = '10px';
    listTitle.style.fontSize = '16px';
    listSection.appendChild(listTitle);
    const assigneeList = document.createElement('div');
    assigneeList.style.height = '300px';
    assigneeList.style.overflowY = 'auto';
    assigneeList.style.border = '1px solid #eee';
    assigneeList.style.borderRadius = '4px';
    if (this.assigneeWhitelist.length > 0) {
      this.assigneeWhitelist.forEach((assignee, index) => {
        const assigneeItem = document.createElement('div');
        assigneeItem.style.display = 'flex';
        assigneeItem.style.justifyContent = 'space-between';
        assigneeItem.style.alignItems = 'center';
        assigneeItem.style.padding = '10px';
        assigneeItem.style.borderBottom = index < this.assigneeWhitelist.length - 1 ? '1px solid #eee' : 'none';
        const assigneeInfo = document.createElement('div');
        assigneeInfo.style.display = 'flex';
        assigneeInfo.style.alignItems = 'center';
        const avatarPlaceholder = document.createElement('div');
        avatarPlaceholder.style.width = '32px';
        avatarPlaceholder.style.height = '32px';
        avatarPlaceholder.style.borderRadius = '50%';
        avatarPlaceholder.style.backgroundColor = '#e0e0e0';
        avatarPlaceholder.style.display = 'flex';
        avatarPlaceholder.style.alignItems = 'center';
        avatarPlaceholder.style.justifyContent = 'center';
        avatarPlaceholder.style.marginRight = '10px';
        avatarPlaceholder.style.fontSize = '14px';
        avatarPlaceholder.style.fontWeight = 'bold';
        avatarPlaceholder.style.color = '#666';
        const name = assignee.name || assignee.username || '';
        avatarPlaceholder.textContent = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
        assigneeInfo.appendChild(avatarPlaceholder);
        const nameContainer = document.createElement('div');
        const displayName = document.createElement('div');
        displayName.textContent = assignee.name || assignee.username;
        displayName.style.fontWeight = 'bold';
        const username = document.createElement('div');
        username.textContent = `@${assignee.username}`;
        username.style.fontSize = '12px';
        username.style.color = '#666';
        nameContainer.appendChild(displayName);
        nameContainer.appendChild(username);
        assigneeInfo.appendChild(nameContainer);
        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.style.padding = '4px 8px';
        removeButton.style.backgroundColor = '#dc3545';
        removeButton.style.color = 'white';
        removeButton.style.border = 'none';
        removeButton.style.borderRadius = '4px';
        removeButton.style.cursor = 'pointer';
        removeButton.onclick = () => {
          this.removeAssignee(assignee.username);
          assigneeItem.remove();
          this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);
          if (this.assigneeWhitelist.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.padding = '10px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            assigneeList.appendChild(emptyMessage);
          }
        };
        assigneeItem.appendChild(assigneeInfo);
        assigneeItem.appendChild(removeButton);
        assigneeList.appendChild(assigneeItem);
      });
    } else {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add some below.';
      emptyMessage.style.padding = '10px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      assigneeList.appendChild(emptyMessage);
    }
    listSection.appendChild(assigneeList);
    const addForm = document.createElement('div');
    addForm.style.marginTop = '20px';
    addForm.style.padding = '15px';
    addForm.style.backgroundColor = '#f8f9fa';
    addForm.style.borderRadius = '4px';
    const formTitle = document.createElement('h4');
    formTitle.textContent = 'Add New Assignee';
    formTitle.style.marginBottom = '15px';
    formTitle.style.fontSize = '16px';
    const nameContainer = document.createElement('div');
    nameContainer.style.marginBottom = '10px';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Display Name:';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '5px';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'John Doe';
    nameInput.style.width = '100%';
    nameInput.style.padding = '8px';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid #ccc';
    nameContainer.appendChild(nameLabel);
    nameContainer.appendChild(nameInput);
    const usernameContainer = document.createElement('div');
    usernameContainer.style.marginBottom = '15px';
    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'GitLab Username:';
    usernameLabel.style.display = 'block';
    usernameLabel.style.marginBottom = '5px';
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.placeholder = 'username (without @)';
    usernameInput.style.width = '100%';
    usernameInput.style.padding = '8px';
    usernameInput.style.borderRadius = '4px';
    usernameInput.style.border = '1px solid #ccc';
    usernameContainer.appendChild(usernameLabel);
    usernameContainer.appendChild(usernameInput);
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    const addButton = document.createElement('button');
    addButton.textContent = 'Add Assignee';
    addButton.style.padding = '8px 16px';
    addButton.style.backgroundColor = '#28a745';
    addButton.style.color = 'white';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.cursor = 'pointer';
    addButton.onclick = () => {
      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      if (!username) {
        this.notification.error('Username is required');
        return;
      }
      const newAssignee = {
        name: name || username,
        username: username
      };
      this.addAssignee(newAssignee);
      this.notification.success(`Added assignee: ${newAssignee.name}`);
      modalOverlay.remove();
      this.openAssigneeManager();
    };
    const fetchUserButton = document.createElement('button');
    fetchUserButton.textContent = 'Add Current User';
    fetchUserButton.style.padding = '8px 16px';
    fetchUserButton.style.backgroundColor = '#17a2b8';
    fetchUserButton.style.color = 'white';
    fetchUserButton.style.border = 'none';
    fetchUserButton.style.borderRadius = '4px';
    fetchUserButton.style.cursor = 'pointer';
    fetchUserButton.style.marginRight = '10px';
    fetchUserButton.onclick = async () => {
      fetchUserButton.disabled = true;
      fetchUserButton.textContent = 'Loading...';
      try {
        const user = await this.fetchCurrentUser();
        this.notification.success(`Added current user: ${user.name}`);
        modalOverlay.remove();
        this.openAssigneeManager();
      } catch (error) {
        this.notification.error('Failed to fetch current user');
        fetchUserButton.disabled = false;
        fetchUserButton.textContent = 'Add Current User';
      }
    };
    buttonContainer.appendChild(fetchUserButton);
    buttonContainer.appendChild(addButton);
    addForm.appendChild(formTitle);
    addForm.appendChild(nameContainer);
    addForm.appendChild(usernameContainer);
    addForm.appendChild(buttonContainer);
    const footer = document.createElement('div');
    footer.style.marginTop = '20px';
    footer.style.display = 'flex';
    footer.style.justifyContent = 'flex-end';
    const closeModalButton = document.createElement('button');
    closeModalButton.textContent = 'Close';
    closeModalButton.style.padding = '8px 16px';
    closeModalButton.style.backgroundColor = '#6c757d';
    closeModalButton.style.color = 'white';
    closeModalButton.style.border = 'none';
    closeModalButton.style.borderRadius = '4px';
    closeModalButton.style.cursor = 'pointer';
    closeModalButton.onclick = () => {
      modalOverlay.remove();
    };
    footer.appendChild(closeModalButton);
    contentArea.appendChild(description);
    contentArea.appendChild(listSection);
    contentArea.appendChild(addForm);
    contentArea.appendChild(footer);
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(contentArea);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });
  }
}

// File: lib/ui/managers/MilestoneManager.js
window.MilestoneManager = class MilestoneManager {
  constructor(options = {}) {
    this.gitlabApi = options.gitlabApi;
    this.onMilestonesLoaded = options.onMilestonesLoaded || null;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.milestones = [];
    this.currentMilestone = null;
    this.isLoading = false;
  }
}

// File: lib/ui/managers/SettingsManager.js
window.SettingsManager = class SettingsManager {
  constructor(options = {}) {
    this.labelManager = options.labelManager;
    this.assigneeManager = options.assigneeManager;
    this.gitlabApi = options.gitlabApi || window.gitlabApi;
    this.uiManager = options.uiManager || window.uiManager;
    this.onSettingsChanged = options.onSettingsChanged || null;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.availableAssignees = [];
    this.isLoadingAssignees = false;
  }
  openSettingsModal() {
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'git-helper-settings-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.cursor = 'pointer';
    this.currentModal = modalOverlay;
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.borderRadius = '6px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '700px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    const modalHeader = document.createElement('div');
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.style.marginBottom = '15px';
    modalHeader.style.borderBottom = '1px solid #eee';
    modalHeader.style.paddingBottom = '10px';
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = 'Settings';
    modalTitle.style.margin = '0';
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.onclick = () => modalOverlay.remove();
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);
    const contentContainer = document.createElement('div');
    this.createCollapsibleSection(contentContainer, 'General', 'Configure application-wide settings', container => this.createGeneralSettings(container), true);
    this.createCollapsibleSection(contentContainer, 'Assignees', 'Manage assignees for quick access in comments', container => this.createAssigneeSettings(container), false);
    this.createCollapsibleSection(contentContainer, 'Labels', 'Manage which labels appear in the dropdown menus', container => this.createLabelWhitelistSettings(container), false);
    this.createCollapsibleSection(contentContainer, 'Appearance', 'Customize the appearance of GitLab Sprint Helper', container => this.createAppearanceSettings(container), false);
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.style.borderTop = '1px solid #eee';
    buttonContainer.style.paddingTop = '15px';
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset to Defaults';
    resetButton.style.padding = '8px 16px';
    resetButton.style.backgroundColor = '#6c757d';
    resetButton.style.color = 'white';
    resetButton.style.border = 'none';
    resetButton.style.borderRadius = '4px';
    resetButton.style.cursor = 'pointer';
    resetButton.onclick = () => {
      if (confirm('Are you sure you want to reset all settings to default values?')) {
        this.resetAllSettings();
        modalOverlay.remove();
        this.notification.success('Settings reset to defaults');
      }
    };
    const closeModalButton = document.createElement('button');
    closeModalButton.textContent = 'Close';
    closeModalButton.onclick = () => {
      if (this.currentModal) {
        this.currentModal.remove();
        this.currentModal = null;
      }
    };
    buttonContainer.appendChild(resetButton);
    buttonContainer.appendChild(closeModalButton);
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(contentContainer);
    modalContent.appendChild(buttonContainer);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });
  }
  createCollapsibleSection(container, title, description, contentBuilder, startExpanded = false) {
    startExpanded = false;
    const section = document.createElement('div');
    section.className = 'gitlab-helper-settings-section';
    section.style.marginBottom = '15px';
    section.style.border = '1px solid #ddd';
    section.style.borderRadius = '6px';
    section.style.overflow = 'hidden';
    const header = document.createElement('div');
    header.className = 'gitlab-helper-settings-header';
    header.style.padding = '12px 15px';
    header.style.backgroundColor = '#f8f9fa';
    header.style.borderBottom = startExpanded ? '1px solid #ddd' : 'none';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.cursor = 'pointer';
    header.style.transition = 'background-color 0.2s ease';
    header.addEventListener('mouseenter', () => {
      header.style.backgroundColor = '#e9ecef';
    });
    header.addEventListener('mouseleave', () => {
      header.style.backgroundColor = '#f8f9fa';
    });
    const titleContainer = document.createElement('div');
    const titleEl = document.createElement('h4');
    titleEl.textContent = title;
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '16px';
    const descEl = document.createElement('div');
    descEl.textContent = description;
    descEl.style.fontSize = '13px';
    descEl.style.color = '#6c757d';
    descEl.style.marginTop = '4px';
    titleContainer.appendChild(titleEl);
    titleContainer.appendChild(descEl);
    const toggle = document.createElement('span');
    toggle.textContent = startExpanded ? '▼' : '▶';
    toggle.style.fontSize = '14px';
    toggle.style.transition = 'transform 0.3s ease';
    header.appendChild(titleContainer);
    header.appendChild(toggle);
    const content = document.createElement('div');
    content.className = 'gitlab-helper-settings-content';
    content.style.padding = '5px';
    content.style.display = startExpanded ? 'block' : 'none';
    content.style.backgroundColor = 'white';
    let contentBuilt = false;
    header.addEventListener('click', () => {
      const isExpanded = content.style.display === 'block';
      content.style.display = isExpanded ? 'none' : 'block';
      toggle.textContent = isExpanded ? '▶' : '▼';
      header.style.borderBottom = isExpanded ? 'none' : '1px solid #ddd';
      if (!contentBuilt && !isExpanded) {
        contentBuilder(content);
        contentBuilt = true;
      }
    });
    section.appendChild(header);
    section.appendChild(content);
    container.appendChild(section);
    return section;
  }
  createAssigneeSettings(container) {
    const assigneeSection = document.createElement('div');
    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.justifyContent = 'space-between';
    actionsRow.style.marginBottom = '15px';
    actionsRow.style.gap = '10px';
    const searchContainer = document.createElement('div');
    searchContainer.style.flex = '1';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search assignees...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px 10px';
    searchInput.style.borderRadius = '4px';
    searchInput.style.border = '1px solid #ccc';
    searchContainer.appendChild(searchInput);
    const fetchButton = document.createElement('button');
    fetchButton.textContent = 'Fetch GitLab Users';
    fetchButton.style.padding = '8px 12px';
    fetchButton.style.backgroundColor = '#1f75cb';
    fetchButton.style.color = 'white';
    fetchButton.style.border = 'none';
    fetchButton.style.borderRadius = '4px';
    fetchButton.style.cursor = 'pointer';
    fetchButton.onclick = () => this.fetchGitLabUsers(availableListContainer);
    actionsRow.appendChild(searchContainer);
    actionsRow.appendChild(fetchButton);
    assigneeSection.appendChild(actionsRow);
    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.borderBottom = '1px solid #dee2e6';
    tabsContainer.style.marginBottom = '15px';
    const tabs = [{
      id: 'whitelisted',
      label: 'My Assignees',
      active: true
    }, {
      id: 'available',
      label: 'Available Users',
      active: false
    }];
    const tabElements = {};
    const tabContents = {};
    tabs.forEach(tab => {
      const tabElement = document.createElement('div');
      tabElement.textContent = tab.label;
      tabElement.style.padding = '8px 15px';
      tabElement.style.cursor = 'pointer';
      tabElement.style.transition = 'all 0.2s ease';
      if (tab.active) {
        tabElement.style.borderBottom = '2px solid #1f75cb';
        tabElement.style.fontWeight = 'bold';
      }
      tabElement.addEventListener('mouseenter', () => {
        if (!tab.active) {
          tabElement.style.backgroundColor = '#f5f5f5';
        }
      });
      tabElement.addEventListener('mouseleave', () => {
        if (!tab.active) {
          tabElement.style.backgroundColor = '';
        }
      });
      tabElement.addEventListener('click', () => {
        tabs.forEach(t => {
          t.active = false;
          tabElements[t.id].style.borderBottom = 'none';
          tabElements[t.id].style.fontWeight = 'normal';
          tabElements[t.id].style.backgroundColor = '';
          tabContents[t.id].style.display = 'none';
        });
        tab.active = true;
        tabElement.style.borderBottom = '2px solid #1f75cb';
        tabElement.style.fontWeight = 'bold';
        tabContents[tab.id].style.display = 'block';
        if (tab.id === 'whitelisted') {
          this.refreshAssigneeList(assigneeListContainer);
        } else if (tab.id === 'available') {
          this.fetchGitLabUsers(availableListContainer);
        }
      });
      tabElements[tab.id] = tabElement;
      tabsContainer.appendChild(tabElement);
    });
    assigneeSection.appendChild(tabsContainer);
    const whitelistedContent = document.createElement('div');
    whitelistedContent.style.display = 'block';
    const availableContent = document.createElement('div');
    availableContent.style.display = 'none';
    const assigneeListContainer = document.createElement('div');
    assigneeListContainer.style.height = '300px';
    assigneeListContainer.style.overflowY = 'auto';
    assigneeListContainer.style.border = '1px solid #eee';
    assigneeListContainer.style.borderRadius = '4px';
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      return emptyMessage;
    };
    let assignees = [];
    if (this.assigneeManager) {
      assignees = this.assigneeManager.getAssigneeWhitelist();
    } else {
      assignees = getAssigneeWhitelist();
    }
    if (assignees.length > 0) {
      assignees.forEach((assignee, index) => {
        assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
      });
    } else {
      assigneeListContainer.appendChild(createEmptyMessage());
    }
    whitelistedContent.appendChild(assigneeListContainer);
    const availableListContainer = document.createElement('div');
    availableListContainer.className = 'available-assignees-list';
    availableListContainer.style.height = '300px';
    availableListContainer.style.overflowY = 'auto';
    availableListContainer.style.border = '1px solid #eee';
    availableListContainer.style.borderRadius = '4px';
    const availableEmptyMessage = document.createElement('div');
    availableEmptyMessage.textContent = 'Click "Fetch GitLab Users" to load available assignees.';
    availableEmptyMessage.style.padding = '15px';
    availableEmptyMessage.style.color = '#666';
    availableEmptyMessage.style.fontStyle = 'italic';
    availableEmptyMessage.style.textAlign = 'center';
    availableListContainer.appendChild(availableEmptyMessage);
    availableContent.appendChild(availableListContainer);
    tabContents['whitelisted'] = whitelistedContent;
    tabContents['available'] = availableContent;
    assigneeSection.appendChild(whitelistedContent);
    assigneeSection.appendChild(availableContent);
    searchInput.addEventListener('input', () => {
      const searchText = searchInput.value.toLowerCase();
      const activeTab = tabs.find(t => t.active).id;
      const list = activeTab === 'whitelisted' ? assigneeListContainer : availableListContainer;
      const items = list.querySelectorAll('.assignee-item');
      items.forEach(item => {
        const nameEl = item.querySelector('.assignee-name');
        const usernameEl = item.querySelector('.assignee-username');
        if (!nameEl || !usernameEl) return;
        const name = nameEl.textContent.toLowerCase();
        const username = usernameEl.textContent.toLowerCase();
        if (name.includes(searchText) || username.includes(searchText)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });
    container.appendChild(assigneeSection);
  }
  createAddAssigneeForm(listContainer, createEmptyMessage) {
    const addForm = document.createElement('div');
    addForm.style.marginTop = '15px';
    addForm.style.padding = '15px';
    addForm.style.backgroundColor = '#f8f9fa';
    addForm.style.borderRadius = '4px';
    const formTitle = document.createElement('h5');
    formTitle.textContent = 'Add New Assignee';
    formTitle.style.marginTop = '0';
    formTitle.style.marginBottom = '10px';
    const nameContainer = document.createElement('div');
    nameContainer.style.marginBottom = '10px';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Display Name:';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '5px';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'John Doe';
    nameInput.style.width = '100%';
    nameInput.style.padding = '6px 10px';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid #ccc';
    nameContainer.appendChild(nameLabel);
    nameContainer.appendChild(nameInput);
    const usernameContainer = document.createElement('div');
    usernameContainer.style.marginBottom = '15px';
    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'GitLab Username:';
    usernameLabel.style.display = 'block';
    usernameLabel.style.marginBottom = '5px';
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.placeholder = 'username (without @)';
    usernameInput.style.width = '100%';
    usernameInput.style.padding = '6px 10px';
    usernameInput.style.borderRadius = '4px';
    usernameInput.style.border = '1px solid #ccc';
    usernameContainer.appendChild(usernameLabel);
    usernameContainer.appendChild(usernameInput);
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    const addButton = document.createElement('button');
    addButton.textContent = 'Add Assignee';
    addButton.style.padding = '6px 12px';
    addButton.style.backgroundColor = '#28a745';
    addButton.style.color = 'white';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.cursor = 'pointer';
    addButton.onclick = () => {
      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      if (!username) {
        this.notification.error('Username is required');
        return;
      }
      const newAssignee = {
        name: name || username,
        username: username
      };
      if (this.assigneeManager) {
        this.assigneeManager.addAssignee(newAssignee);
      } else {
        const assignees = getAssigneeWhitelist();
        const existingIndex = assignees.findIndex(a => a.username === username);
        if (existingIndex >= 0) {
          assignees[existingIndex] = newAssignee;
        } else {
          assignees.push(newAssignee);
        }
        saveAssigneeWhitelist(assignees);
      }
      const emptyMessage = listContainer.querySelector('div[style*="italic"]');
      if (emptyMessage) {
        emptyMessage.remove();
      }
      const assignees = getAssigneeWhitelist();
      listContainer.appendChild(this.createAssigneeListItem(newAssignee, assignees.length - 1, listContainer, createEmptyMessage));
      nameInput.value = '';
      usernameInput.value = '';
      this.notification.success(`Added assignee: ${newAssignee.name}`);
      if (this.onSettingsChanged) {
        this.onSettingsChanged('assignees');
      }
    };
    buttonContainer.appendChild(addButton);
    addForm.appendChild(formTitle);
    addForm.appendChild(nameContainer);
    addForm.appendChild(usernameContainer);
    addForm.appendChild(buttonContainer);
    return addForm;
  }
  async fetchGitLabUsers(container) {
    try {
      if (!this.gitlabApi) {
        this.notification.error('GitLab API not available');
        return;
      }
      this.isLoadingAssignees = true;
      container.innerHTML = '';
      const loadingMessage = document.createElement('div');
      loadingMessage.textContent = 'Loading users from GitLab...';
      loadingMessage.style.padding = '15px';
      loadingMessage.style.textAlign = 'center';
      container.appendChild(loadingMessage);
      try {
        const pathInfo = getPathFromUrl();
        if (!pathInfo) {
          throw new Error('Could not determine project/group path');
        }
        let users = [];
        if (pathInfo.type === 'project') {
          users = await this.gitlabApi.callGitLabApi(`projects/${pathInfo.encodedPath}/members/all`, {
            params: {
              per_page: 100,
              all_available: true
            }
          });
        } else if (pathInfo.type === 'group') {
          users = await this.gitlabApi.callGitLabApi(`groups/${pathInfo.encodedPath}/members/all`, {
            params: {
              per_page: 100,
              all_available: true
            }
          });
        }
        this.availableAssignees = users.map(user => ({
          id: user.id,
          name: user.name,
          username: user.username,
          avatar_url: user.avatar_url
        }));
        this.renderAvailableUsers(container);
      } catch (error) {
        console.error('Error fetching GitLab users:', error);
        container.innerHTML = '';
        const errorMessage = document.createElement('div');
        errorMessage.textContent = `Error loading users: ${error.message}`;
        errorMessage.style.padding = '15px';
        errorMessage.style.color = '#dc3545';
        errorMessage.style.textAlign = 'center';
        container.appendChild(errorMessage);
        this.notification.error('Failed to load GitLab users');
      } finally {
        this.isLoadingAssignees = false;
      }
    } catch (error) {}
  }
  renderAvailableUsers(container) {
    container.innerHTML = '';
    const whitelist = getAssigneeWhitelist();
    const whitelistUsernames = whitelist.map(a => a.username.toLowerCase());
    if (this.availableAssignees.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No users found. Try fetching again.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      container.appendChild(emptyMessage);
      return;
    }
    this.availableAssignees.sort((a, b) => a.name.localeCompare(b.name));
    this.availableAssignees.forEach(user => {
      const isWhitelisted = whitelistUsernames.includes(user.username.toLowerCase());
      const userItem = document.createElement('div');
      userItem.className = 'assignee-item';
      userItem.style.display = 'flex';
      userItem.style.justifyContent = 'space-between';
      userItem.style.alignItems = 'center';
      userItem.style.padding = '10px 15px';
      userItem.style.borderBottom = '1px solid #eee';
      userItem.style.backgroundColor = isWhitelisted ? 'rgba(40, 167, 69, 0.05)' : '';
      const userInfo = document.createElement('div');
      userInfo.style.display = 'flex';
      userInfo.style.alignItems = 'center';
      if (user.avatar_url) {
        const avatar = document.createElement('img');
        avatar.src = user.avatar_url;
        avatar.style.width = '30px';
        avatar.style.height = '30px';
        avatar.style.borderRadius = '50%';
        avatar.style.marginRight = '10px';
        userInfo.appendChild(avatar);
      } else {
        const avatarPlaceholder = document.createElement('div');
        avatarPlaceholder.style.width = '30px';
        avatarPlaceholder.style.height = '30px';
        avatarPlaceholder.style.borderRadius = '50%';
        avatarPlaceholder.style.backgroundColor = '#e0e0e0';
        avatarPlaceholder.style.display = 'flex';
        avatarPlaceholder.style.alignItems = 'center';
        avatarPlaceholder.style.justifyContent = 'center';
        avatarPlaceholder.style.marginRight = '10px';
        avatarPlaceholder.style.fontWeight = 'bold';
        avatarPlaceholder.style.color = '#666';
        const name = user.name || user.username;
        const initials = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
        avatarPlaceholder.textContent = initials;
        userInfo.appendChild(avatarPlaceholder);
      }
      const userDetails = document.createElement('div');
      const userName = document.createElement('div');
      userName.className = 'assignee-name';
      userName.textContent = user.name;
      userName.style.fontWeight = 'bold';
      const userUsername = document.createElement('div');
      userUsername.className = 'assignee-username';
      userUsername.textContent = `@${user.username}`;
      userUsername.style.fontSize = '12px';
      userUsername.style.color = '#666';
      userDetails.appendChild(userName);
      userDetails.appendChild(userUsername);
      userInfo.appendChild(userDetails);
      const actionButton = document.createElement('button');
      if (isWhitelisted) {
        actionButton.textContent = 'Added ✓';
        actionButton.style.backgroundColor = '#e9ecef';
        actionButton.style.color = '#28a745';
        actionButton.style.cursor = 'default';
      } else {
        actionButton.textContent = 'Add';
        actionButton.style.backgroundColor = '#28a745';
        actionButton.style.color = 'white';
        actionButton.style.cursor = 'pointer';
        actionButton.addEventListener('click', () => {
          const assignee = {
            name: user.name,
            username: user.username
          };
          if (this.assigneeManager) {
            this.assigneeManager.addAssignee(assignee);
          } else {
            const whitelist = getAssigneeWhitelist();
            whitelist.push(assignee);
            saveAssigneeWhitelist(whitelist);
          }
          actionButton.textContent = 'Added ✓';
          actionButton.style.backgroundColor = '#e9ecef';
          actionButton.style.color = '#28a745';
          actionButton.style.cursor = 'default';
          userItem.style.backgroundColor = 'rgba(40, 167, 69, 0.05)';
          this.notification.success(`Added ${user.name} to assignees`);
          if (typeof this.onSettingsChanged === 'function') {
            this.onSettingsChanged('assignees');
          }
          this.refreshWhitelistedTab();
        });
      }
      actionButton.style.padding = '5px 10px';
      actionButton.style.border = 'none';
      actionButton.style.borderRadius = '4px';
      actionButton.style.fontSize = '12px';
      userItem.appendChild(userInfo);
      userItem.appendChild(actionButton);
      container.appendChild(userItem);
    });
  }
  refreshWhitelistedTab() {
    const whitelistedContent = document.querySelector('div[style*="display: block"]');
    if (!whitelistedContent) return;
    const assigneeListContainer = whitelistedContent.querySelector('div[style*="overflowY: auto"]');
    if (!assigneeListContainer) return;
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      return emptyMessage;
    };
    assigneeListContainer.innerHTML = '';
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = 'Refreshing assignees...';
    loadingIndicator.style.padding = '15px';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.color = '#666';
    assigneeListContainer.appendChild(loadingIndicator);
    setTimeout(() => {
      let assignees = [];
      if (this.assigneeManager) {
        assignees = this.assigneeManager.getAssigneeWhitelist();
      } else {
        assignees = getAssigneeWhitelist();
      }
      assigneeListContainer.innerHTML = '';
      if (assignees.length > 0) {
        assignees.forEach((assignee, index) => {
          assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
        });
      } else {
        assigneeListContainer.appendChild(createEmptyMessage());
      }
    }, 300);
  }
  createAssigneeListItem(assignee, index, listContainer, createEmptyMessage) {
    const item = document.createElement('div');
    item.className = 'assignee-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '10px 15px';
    item.style.borderBottom = '1px solid #eee';
    const info = document.createElement('div');
    info.style.display = 'flex';
    info.style.alignItems = 'center';
    const avatar = document.createElement('div');
    avatar.style.width = '30px';
    avatar.style.height = '30px';
    avatar.style.borderRadius = '50%';
    avatar.style.backgroundColor = '#e0e0e0';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.marginRight = '10px';
    avatar.style.fontWeight = 'bold';
    avatar.style.color = '#666';
    const name = assignee.name || assignee.username;
    const initials = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
    avatar.textContent = initials;
    info.appendChild(avatar);
    const nameContainer = document.createElement('div');
    const displayName = document.createElement('div');
    displayName.className = 'assignee-name';
    displayName.textContent = assignee.name || assignee.username;
    displayName.style.fontWeight = 'bold';
    const username = document.createElement('div');
    username.className = 'assignee-username';
    username.textContent = `@${assignee.username}`;
    username.style.fontSize = '12px';
    username.style.color = '#666';
    nameContainer.appendChild(displayName);
    nameContainer.appendChild(username);
    info.appendChild(nameContainer);
    const buttons = document.createElement('div');
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.style.padding = '5px 10px';
    removeButton.style.backgroundColor = '#dc3545';
    removeButton.style.color = 'white';
    removeButton.style.border = 'none';
    removeButton.style.borderRadius = '4px';
    removeButton.style.cursor = 'pointer';
    removeButton.style.fontSize = '12px';
    removeButton.onclick = () => {
      let assignees = [];
      if (this.assigneeManager) {
        this.assigneeManager.removeAssignee(assignee.username);
        assignees = this.assigneeManager.getAssigneeWhitelist();
      } else {
        assignees = getAssigneeWhitelist();
        const filteredAssignees = assignees.filter(a => a.username.toLowerCase() !== assignee.username.toLowerCase());
        saveAssigneeWhitelist(filteredAssignees);
        assignees = filteredAssignees;
      }
      item.remove();
      if (assignees.length === 0) {
        listContainer.appendChild(createEmptyMessage());
      }
      this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);
      if (this.onSettingsChanged) {
        this.onSettingsChanged('assignees');
      }
    };
    buttons.appendChild(removeButton);
    item.appendChild(info);
    item.appendChild(buttons);
    return item;
  }
  createLabelWhitelistSettings(container) {
    const whitelistSection = document.createElement('div');
    whitelistSection.style.marginBottom = '20px';
    const whitelistTitle = document.createElement('h4');
    whitelistTitle.textContent = 'Label Whitelist';
    whitelistTitle.style.marginBottom = '10px';
    const whitelistDescription = document.createElement('p');
    whitelistDescription.textContent = 'Select which labels should appear in the dropdown. The system will show any label that contains these terms.';
    whitelistDescription.style.marginBottom = '15px';
    whitelistDescription.style.fontSize = '14px';
    whitelistDescription.style.color = '#666';
    whitelistSection.appendChild(whitelistTitle);
    whitelistSection.appendChild(whitelistDescription);
    const loadingMessage = document.createElement('div');
    loadingMessage.id = 'whitelist-loading-message';
    loadingMessage.textContent = 'Loading all labels from GitLab...';
    loadingMessage.style.fontStyle = 'italic';
    loadingMessage.style.color = '#666';
    whitelistSection.appendChild(loadingMessage);
    const whitelistContainer = document.createElement('div');
    whitelistContainer.id = 'whitelist-container';
    whitelistContainer.style.display = 'flex';
    whitelistContainer.style.flexWrap = 'wrap';
    whitelistContainer.style.gap = '10px';
    whitelistContainer.style.marginTop = '15px';
    whitelistContainer.style.height = '300px';
    whitelistContainer.style.overflowY = 'auto';
    whitelistContainer.style.border = '1px solid #eee';
    whitelistContainer.style.borderRadius = '4px';
    whitelistContainer.style.padding = '10px';
    whitelistSection.appendChild(whitelistContainer);
    const currentWhitelist = getLabelWhitelist();
    const safeWhitelist = Array.isArray(currentWhitelist) ? currentWhitelist : [];
    const fetchAndDisplayAllLabels = async () => {
      try {
        if (!this.gitlabApi) {
          throw new Error('GitLab API not available');
        }
        const pathInfo = getPathFromUrl();
        if (!pathInfo || !pathInfo.apiUrl) {
          throw new Error('Could not determine project/group path');
        }
        const allLabels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
          params: {
            per_page: 100
          }
        });
        displayLabels(allLabels);
      } catch (error) {
        console.error('Error fetching ALL labels:', error);
        loadingMessage.textContent = 'Error loading labels. ' + error.message;
        loadingMessage.style.color = '#dc3545';
      }
    };
    const displayLabels = labels => {
      loadingMessage.remove();
      if (!labels || labels.length === 0) {
        const noLabelsMessage = document.createElement('div');
        noLabelsMessage.textContent = 'No labels found in this project.';
        noLabelsMessage.style.width = '100%';
        noLabelsMessage.style.textAlign = 'center';
        noLabelsMessage.style.marginBottom = '15px';
        noLabelsMessage.style.color = '#666';
        whitelistContainer.appendChild(noLabelsMessage);
        return;
      }
      labels.sort((a, b) => a.name.localeCompare(b.name));
      const seenLabels = new Set();
      labels.forEach(label => {
        if (seenLabels.has(label.name.toLowerCase())) return;
        seenLabels.add(label.name.toLowerCase());
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.display = 'flex';
        checkboxContainer.style.alignItems = 'center';
        checkboxContainer.style.marginBottom = '10px';
        checkboxContainer.style.width = 'calc(33.33% - 10px)';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `label-${label.name}`;
        checkbox.dataset.label = label.name.toLowerCase();
        checkbox.style.marginRight = '8px';
        const isWhitelisted = safeWhitelist.some(term => label.name.toLowerCase().includes(term.toLowerCase()));
        checkbox.checked = isWhitelisted;
        const labelElement = this.createGitLabStyleLabel(label);
        labelElement.style.cursor = 'pointer';
        labelElement.onclick = () => {
          checkbox.checked = !checkbox.checked;
          this.autoSaveWhitelist(whitelistContainer);
        };
        checkbox.addEventListener('change', () => {
          this.autoSaveWhitelist(whitelistContainer);
        });
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(labelElement);
        whitelistContainer.appendChild(checkboxContainer);
      });
    };
    fetchAndDisplayAllLabels();
    container.appendChild(whitelistSection);
  }
  refreshAssigneeList(container) {
    if (!container) return;
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = 'Refreshing assignees...';
    loadingIndicator.style.padding = '15px';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.color = '#666';
    container.innerHTML = '';
    container.appendChild(loadingIndicator);
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      return emptyMessage;
    };
    setTimeout(() => {
      let assignees = [];
      if (this.assigneeManager) {
        assignees = this.assigneeManager.getAssigneeWhitelist();
      } else {
        assignees = getAssigneeWhitelist();
      }
      container.innerHTML = '';
      if (assignees.length > 0) {
        assignees.forEach((assignee, index) => {
          container.appendChild(this.createAssigneeListItem(assignee, index, container, createEmptyMessage));
        });
      } else {
        container.appendChild(createEmptyMessage());
      }
    }, 300);
  }
  createGitLabStyleLabel(label) {
    const labelElement = document.createElement('span');
    labelElement.textContent = label.name;
    const bgColor = label.color || generateColorFromString(label.name);
    const textColor = getContrastColor(bgColor);
    labelElement.style.backgroundColor = bgColor;
    labelElement.style.color = textColor;
    labelElement.style.padding = '4px 8px';
    labelElement.style.borderRadius = '100px';
    labelElement.style.fontSize = '12px';
    labelElement.style.fontWeight = '500';
    labelElement.style.display = 'inline-block';
    labelElement.style.margin = '2px';
    labelElement.style.maxWidth = '100%';
    labelElement.style.overflow = 'hidden';
    labelElement.style.textOverflow = 'ellipsis';
    labelElement.style.whiteSpace = 'nowrap';
    return labelElement;
  }
  resetLabelWhitelist() {
    resetLabelWhitelist();
    if (this.labelManager) {
      this.labelManager.resetToDefaultWhitelist();
    }
    if (this.onSettingsChanged) {
      this.onSettingsChanged('labels');
    }
  }
  resetAllSettings() {
    this.resetLabelWhitelist();
    saveAssigneeWhitelist([]);
    const defaultShortcut = DEFAULT_SETTINGS.toggleShortcut;
    saveToggleShortcut(defaultShortcut);
    if (window.uiManager && typeof window.uiManager.updateKeyboardShortcut === 'function') {
      window.uiManager.updateKeyboardShortcut(defaultShortcut);
    } else if (this.uiManager && typeof this.uiManager.updateKeyboardShortcut === 'function') {
      this.uiManager.updateKeyboardShortcut(defaultShortcut);
    }
    if (this.onSettingsChanged) {
      this.onSettingsChanged('all');
    }
  }
  autoSaveWhitelist(container) {
    const newWhitelist = [];
    const addedTerms = new Set();
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        const term = checkbox.dataset.label.toLowerCase();
        if (!addedTerms.has(term)) {
          newWhitelist.push(term);
          addedTerms.add(term);
        }
      }
    });
    saveLabelWhitelist(newWhitelist);
    if (this.labelManager) {
      this.labelManager.saveWhitelist(newWhitelist);
    }
    if (this.notification) {
      this.notification.success(`Label whitelist updated`);
    }
    if (this.onSettingsChanged) {
      this.onSettingsChanged('labels');
    }
  }
  createGeneralSettings(container) {
    const generalSection = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = 'General Settings';
    title.style.marginBottom = '10px';
    const description = document.createElement('p');
    description.textContent = 'Configure general behavior of the GitLab Sprint Helper.';
    description.style.marginBottom = '15px';
    description.style.fontSize = '14px';
    description.style.color = '#666';
    generalSection.appendChild(title);
    generalSection.appendChild(description);
    const shortcutSection = document.createElement('div');
    shortcutSection.style.marginBottom = '20px';
    shortcutSection.style.padding = '15px';
    shortcutSection.style.backgroundColor = '#f8f9fa';
    shortcutSection.style.borderRadius = '4px';
    const shortcutTitle = document.createElement('h5');
    shortcutTitle.textContent = 'Toggle Visibility Shortcut';
    shortcutTitle.style.marginTop = '0';
    shortcutTitle.style.marginBottom = '10px';
    shortcutTitle.style.fontSize = '16px';
    const shortcutDescription = document.createElement('p');
    shortcutDescription.textContent = 'Set a keyboard shortcut to toggle the visibility of GitLab Sprint Helper. The shortcut will only work when not typing in an input field.';
    shortcutDescription.style.marginBottom = '15px';
    shortcutDescription.style.fontSize = '14px';
    shortcutDescription.style.color = '#666';
    const shortcutInputContainer = document.createElement('div');
    shortcutInputContainer.style.display = 'flex';
    shortcutInputContainer.style.alignItems = 'center';
    shortcutInputContainer.style.gap = '10px';
    const shortcutLabel = document.createElement('label');
    shortcutLabel.textContent = 'Shortcut Key:';
    shortcutLabel.style.fontWeight = 'bold';
    shortcutLabel.style.minWidth = '100px';
    const shortcutInput = document.createElement('input');
    shortcutInput.type = 'text';
    shortcutInput.maxLength = 1;
    shortcutInput.style.padding = '8px';
    shortcutInput.style.width = '60px';
    shortcutInput.style.textAlign = 'center';
    shortcutInput.style.fontSize = '16px';
    shortcutInput.style.border = '1px solid #ccc';
    shortcutInput.style.borderRadius = '4px';
    const currentShortcut = getToggleShortcut();
    shortcutInput.value = currentShortcut;
    const shortcutPreview = document.createElement('div');
    shortcutPreview.style.marginLeft = '10px';
    shortcutPreview.style.color = '#666';
    shortcutPreview.textContent = `Current: Press '${currentShortcut}' to toggle`;
    shortcutInput.addEventListener('input', () => {
      if (shortcutInput.value.length === 0) return;
      const newShortcut = shortcutInput.value.charAt(0).toLowerCase();
      if (newShortcut) {
        saveToggleShortcut(newShortcut);
        shortcutPreview.textContent = `Current: Press '${newShortcut}' to toggle`;
        this.notification.success(`Shortcut changed to '${newShortcut}'`);
        if (window.uiManager && typeof window.uiManager.updateKeyboardShortcut === 'function') {
          window.uiManager.updateKeyboardShortcut(newShortcut);
        } else if (this.uiManager && typeof this.uiManager.updateKeyboardShortcut === 'function') {
          this.uiManager.updateKeyboardShortcut(newShortcut);
        }
        if (this.onSettingsChanged) {
          this.onSettingsChanged('general');
        }
      }
    });
    shortcutInput.addEventListener('keyup', () => {
      shortcutInput.value = shortcutInput.value.toLowerCase();
    });
    shortcutInputContainer.appendChild(shortcutLabel);
    shortcutInputContainer.appendChild(shortcutInput);
    shortcutInputContainer.appendChild(shortcutPreview);
    shortcutSection.appendChild(shortcutTitle);
    shortcutSection.appendChild(shortcutDescription);
    shortcutSection.appendChild(shortcutInputContainer);
    generalSection.appendChild(shortcutSection);
    const resetSection = document.createElement('div');
    resetSection.style.marginTop = '20px';
    resetSection.style.padding = '15px';
    resetSection.style.backgroundColor = '#fff0f0';
    resetSection.style.borderRadius = '4px';
    resetSection.style.border = '1px solid #ffcccc';
    const resetTitle = document.createElement('h5');
    resetTitle.textContent = 'Data Management';
    resetTitle.style.marginTop = '0';
    resetTitle.style.marginBottom = '10px';
    resetTitle.style.fontSize = '16px';
    resetTitle.style.color = '#dc3545';
    const resetDescription = document.createElement('p');
    resetDescription.textContent = 'Reset various data stored by GitLab Sprint Helper. Warning: These actions cannot be undone!';
    resetDescription.style.marginBottom = '15px';
    resetDescription.style.fontSize = '14px';
    resetDescription.style.color = '#666';
    const resetButtonsContainer = document.createElement('div');
    resetButtonsContainer.style.display = 'flex';
    resetButtonsContainer.style.gap = '10px';
    resetButtonsContainer.style.flexWrap = 'wrap';
    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All Data';
    resetAllButton.style.backgroundColor = '#dc3545';
    resetAllButton.style.color = 'white';
    resetAllButton.style.border = 'none';
    resetAllButton.style.borderRadius = '4px';
    resetAllButton.style.padding = '8px 16px';
    resetAllButton.style.cursor = 'pointer';
    resetAllButton.style.fontWeight = 'bold';
    resetAllButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset ALL data? This will remove all settings, history, and sprint data. This action cannot be undone!')) {
        this.resetAllSettings();
        if (window.historyManager && typeof window.historyManager.clearAllHistory === 'function') {
          window.historyManager.clearAllHistory();
        }
        localStorage.removeItem('gitLabHelperSprintState');
        localStorage.removeItem('gitLabHelperSprintHistory');
        this.notification.success('All data has been reset');
        if (this.currentModal) {
          this.currentModal.remove();
          this.currentModal = null;
        }
      }
    });
    const resetHistoryButton = document.createElement('button');
    resetHistoryButton.textContent = 'Reset History';
    resetHistoryButton.style.backgroundColor = '#dc3545';
    resetHistoryButton.style.color = 'white';
    resetHistoryButton.style.border = 'none';
    resetHistoryButton.style.borderRadius = '4px';
    resetHistoryButton.style.padding = '8px 16px';
    resetHistoryButton.style.cursor = 'pointer';
    resetHistoryButton.style.fontWeight = 'bold';
    resetHistoryButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all history data? This action cannot be undone!')) {
        if (window.historyManager && typeof window.historyManager.clearAllHistory === 'function') {
          window.historyManager.clearAllHistory();
          this.notification.success('History data has been reset');
        } else {
          this.notification.error('History manager not available');
        }
      }
    });
    resetButtonsContainer.appendChild(resetAllButton);
    resetButtonsContainer.appendChild(resetHistoryButton);
    resetSection.appendChild(resetTitle);
    resetSection.appendChild(resetDescription);
    resetSection.appendChild(resetButtonsContainer);
    generalSection.appendChild(resetSection);
    container.appendChild(generalSection);
  }
  createAppearanceSettings(container) {
    const appearanceSection = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = 'Appearance Settings';
    title.style.marginBottom = '10px';
    const description = document.createElement('p');
    description.textContent = 'Customize the appearance of the GitLab Sprint Helper.';
    description.style.marginBottom = '15px';
    description.style.fontSize = '14px';
    description.style.color = '#666';
    appearanceSection.appendChild(title);
    appearanceSection.appendChild(description);

    // Linked Items section
    const linkedItemsSection = document.createElement('div');
    linkedItemsSection.style.marginBottom = '20px';
    linkedItemsSection.style.padding = '15px';
    linkedItemsSection.style.backgroundColor = '#f8f9fa';
    linkedItemsSection.style.borderRadius = '4px';
    const linkedItemsTitle = document.createElement('h5');
    linkedItemsTitle.textContent = 'Linked Items Feature';
    linkedItemsTitle.style.marginTop = '0';
    linkedItemsTitle.style.marginBottom = '10px';
    linkedItemsTitle.style.fontSize = '16px';
    const linkedItemsDescription = document.createElement('p');
    linkedItemsDescription.textContent = 'Show linked items button on cards to quickly access branches, merge requests, and other related items.';
    linkedItemsDescription.style.marginBottom = '15px';
    linkedItemsDescription.style.fontSize = '14px';
    linkedItemsDescription.style.color = '#666';
    const toggleContainer = document.createElement('div');
    toggleContainer.style.display = 'flex';
    toggleContainer.style.alignItems = 'center';
    toggleContainer.style.justifyContent = 'space-between';
    const toggleLabel = document.createElement('label');
    toggleLabel.textContent = 'Enable Linked Items';
    toggleLabel.style.fontWeight = 'bold';
    const toggleSwitch = document.createElement('div');
    toggleSwitch.style.position = 'relative';
    toggleSwitch.style.display = 'inline-block';
    toggleSwitch.style.width = '50px';
    toggleSwitch.style.height = '24px';
    const toggleCheckbox = document.createElement('input');
    toggleCheckbox.type = 'checkbox';
    toggleCheckbox.style.opacity = '0';
    toggleCheckbox.style.width = '0';
    toggleCheckbox.style.height = '0';
    try {
      const linkedItemsEnabled = localStorage.getItem('gitLabHelperLinkedItemsEnabled');
      toggleCheckbox.checked = linkedItemsEnabled === null || linkedItemsEnabled === 'true';
    } catch (e) {
      console.error('Error loading linked items state:', e);
      toggleCheckbox.checked = true;
    }
    const toggleSlider = document.createElement('span');
    toggleSlider.style.position = 'absolute';
    toggleSlider.style.cursor = 'pointer';
    toggleSlider.style.top = '0';
    toggleSlider.style.left = '0';
    toggleSlider.style.right = '0';
    toggleSlider.style.bottom = '0';
    toggleSlider.style.backgroundColor = toggleCheckbox.checked ? '#1f75cb' : '#ccc';
    toggleSlider.style.transition = '.4s';
    toggleSlider.style.borderRadius = '34px';
    const toggleKnob = document.createElement('span');
    toggleKnob.style.position = 'absolute';
    toggleKnob.style.content = '""';
    toggleKnob.style.height = '16px';
    toggleKnob.style.width = '16px';
    toggleKnob.style.left = toggleCheckbox.checked ? '30px' : '4px';
    toggleKnob.style.bottom = '4px';
    toggleKnob.style.backgroundColor = 'white';
    toggleKnob.style.transition = '.4s';
    toggleKnob.style.borderRadius = '50%';
    toggleSlider.appendChild(toggleKnob);
    toggleSwitch.appendChild(toggleCheckbox);
    toggleSwitch.appendChild(toggleSlider);
    toggleCheckbox.addEventListener('change', () => {
      toggleSlider.style.backgroundColor = toggleCheckbox.checked ? '#1f75cb' : '#ccc';
      toggleKnob.style.left = toggleCheckbox.checked ? '30px' : '4px';
      localStorage.setItem('gitLabHelperLinkedItemsEnabled', toggleCheckbox.checked);
      if (window.toggleLinkedItems) {
        window.toggleLinkedItems();
      }
      if (this.notification) {
        if (toggleCheckbox.checked) {
          this.notification.success('Linked Items feature enabled');
        } else {
          this.notification.info('Linked Items feature disabled');
        }
      }
    });

    // Add click handler for the slider itself to toggle the checkbox
    toggleSlider.addEventListener('click', (e) => {
      e.preventDefault();
      toggleCheckbox.checked = !toggleCheckbox.checked;

      // Trigger the change event to ensure our handler above runs
      const changeEvent = new Event('change');
      toggleCheckbox.dispatchEvent(changeEvent);
    });

    toggleContainer.appendChild(toggleLabel);
    toggleContainer.appendChild(toggleSwitch);
    linkedItemsSection.appendChild(linkedItemsTitle);
    linkedItemsSection.appendChild(linkedItemsDescription);
    linkedItemsSection.appendChild(toggleContainer);
    appearanceSection.appendChild(linkedItemsSection);

    // Hide Labels Section
    const hideLabelsSection = document.createElement('div');
    hideLabelsSection.style.marginBottom = '20px';
    hideLabelsSection.style.padding = '15px';
    hideLabelsSection.style.backgroundColor = '#f8f9fa';
    hideLabelsSection.style.borderRadius = '4px';
    const hideLabelsTitle = document.createElement('h5');
    hideLabelsTitle.textContent = 'Hide Labels Feature';
    hideLabelsTitle.style.marginTop = '0';
    hideLabelsTitle.style.marginBottom = '10px';
    hideLabelsTitle.style.fontSize = '16px';
    const hideLabelsDescription = document.createElement('p');
    hideLabelsDescription.textContent = 'Hide all labels on cards but show priority label colors as a small indicator line at the top of cards.';
    hideLabelsDescription.style.marginBottom = '15px';
    hideLabelsDescription.style.fontSize = '14px';
    hideLabelsDescription.style.color = '#666';
    const hideLabelsToggleContainer = document.createElement('div');
    hideLabelsToggleContainer.style.display = 'flex';
    hideLabelsToggleContainer.style.alignItems = 'center';
    hideLabelsToggleContainer.style.justifyContent = 'space-between';
    const hideLabelsToggleLabel = document.createElement('label');
    hideLabelsToggleLabel.textContent = 'Hide Labels';
    hideLabelsToggleLabel.style.fontWeight = 'bold';
    const hideLabelsToggleSwitch = document.createElement('div');
    hideLabelsToggleSwitch.style.position = 'relative';
    hideLabelsToggleSwitch.style.display = 'inline-block';
    hideLabelsToggleSwitch.style.width = '50px';
    hideLabelsToggleSwitch.style.height = '24px';
    const hideLabelsToggleCheckbox = document.createElement('input');
    hideLabelsToggleCheckbox.type = 'checkbox';
    hideLabelsToggleCheckbox.style.opacity = '0';
    hideLabelsToggleCheckbox.style.width = '0';
    hideLabelsToggleCheckbox.style.height = '0';
    try {
      const hideLabelsEnabled = localStorage.getItem('gitLabHelperHideLabelsEnabled');
      hideLabelsToggleCheckbox.checked = hideLabelsEnabled === 'true';
    } catch (e) {
      console.error('Error loading hide labels state:', e);
      hideLabelsToggleCheckbox.checked = false;
    }
    const hideLabelsToggleSlider = document.createElement('span');
    hideLabelsToggleSlider.style.position = 'absolute';
    hideLabelsToggleSlider.style.cursor = 'pointer';
    hideLabelsToggleSlider.style.top = '0';
    hideLabelsToggleSlider.style.left = '0';
    hideLabelsToggleSlider.style.right = '0';
    hideLabelsToggleSlider.style.bottom = '0';
    hideLabelsToggleSlider.style.backgroundColor = hideLabelsToggleCheckbox.checked ? '#1f75cb' : '#ccc';
    hideLabelsToggleSlider.style.transition = '.4s';
    hideLabelsToggleSlider.style.borderRadius = '34px';
    const hideLabelsToggleKnob = document.createElement('span');
    hideLabelsToggleKnob.style.position = 'absolute';
    hideLabelsToggleKnob.style.content = '""';
    hideLabelsToggleKnob.style.height = '16px';
    hideLabelsToggleKnob.style.width = '16px';
    hideLabelsToggleKnob.style.left = hideLabelsToggleCheckbox.checked ? '30px' : '4px';
    hideLabelsToggleKnob.style.bottom = '4px';
    hideLabelsToggleKnob.style.backgroundColor = 'white';
    hideLabelsToggleKnob.style.transition = '.4s';
    hideLabelsToggleKnob.style.borderRadius = '50%';
    hideLabelsToggleSlider.appendChild(hideLabelsToggleKnob);
    hideLabelsToggleSwitch.appendChild(hideLabelsToggleCheckbox);
    hideLabelsToggleSwitch.appendChild(hideLabelsToggleSlider);
    hideLabelsToggleCheckbox.addEventListener('change', () => {
      hideLabelsToggleSlider.style.backgroundColor = hideLabelsToggleCheckbox.checked ? '#1f75cb' : '#ccc';
      hideLabelsToggleKnob.style.left = hideLabelsToggleCheckbox.checked ? '30px' : '4px';
      localStorage.setItem('gitLabHelperHideLabelsEnabled', hideLabelsToggleCheckbox.checked);
      if (window.toggleHideLabels) {
        window.toggleHideLabels();
      }
      if (this.notification) {
        if (hideLabelsToggleCheckbox.checked) {
          this.notification.success('Hide Labels feature enabled');
        } else {
          this.notification.info('Hide Labels feature disabled');
        }
      }
    });

    // Add click handler for the slider to toggle the checkbox
    hideLabelsToggleSlider.addEventListener('click', (e) => {
      e.preventDefault();
      hideLabelsToggleCheckbox.checked = !hideLabelsToggleCheckbox.checked;

      // Trigger the change event
      const changeEvent = new Event('change');
      hideLabelsToggleCheckbox.dispatchEvent(changeEvent);
    });

    hideLabelsToggleContainer.appendChild(hideLabelsToggleLabel);
    hideLabelsToggleContainer.appendChild(hideLabelsToggleSwitch);
    hideLabelsSection.appendChild(hideLabelsTitle);
    hideLabelsSection.appendChild(hideLabelsDescription);
    hideLabelsSection.appendChild(hideLabelsToggleContainer);
    appearanceSection.appendChild(hideLabelsSection);

    container.appendChild(appearanceSection);
  }
}

// File: lib/ui/views/SummaryView.js
window.SummaryView = class SummaryView {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.membersList = [];
    this.potentialAssignees = [];
    this.gitlabApi = uiManager?.gitlabApi || window.gitlabApi;
    if (this.gitlabApi) {
      this.fetchMembers();
    }
    this.isRendering = false;
    this.pendingRender = false;
  }
  addCopySummaryButton(container, assigneeTimeMap, totalTickets) {
    if (!this.notification) {
      try {
        if (typeof Notification === 'function') {
          this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
          });
        }
      } catch (e) {
        console.error('Error initializing notification:', e);
      }
    }
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '15px';
    buttonContainer.style.textAlign = 'center';
    const copyButton = document.createElement('button');
    copyButton.textContent = 'Copy Summary Data';
    copyButton.style.padding = '8px 16px';
    copyButton.style.backgroundColor = '#1f75cb';
    copyButton.style.color = 'white';
    copyButton.style.border = 'none';
    copyButton.style.borderRadius = '4px';
    copyButton.className = 'copySummaryBtn';
    copyButton.style.cursor = 'pointer';
    copyButton.style.fontWeight = 'bold';
    copyButton.style.transition = 'background-color 0.2s ease';
    copyButton.addEventListener('mouseenter', () => {
      copyButton.style.backgroundColor = '#1a63ac';
    });
    copyButton.addEventListener('mouseleave', () => {
      copyButton.style.backgroundColor = '#1f75cb';
    });
    copyButton.onclick = () => {
      try {
        let formattedData = '';
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
          return assigneeTimeMap[b] - assigneeTimeMap[a];
        });
        sortedAssignees.forEach(name => {
          const hours = assigneeTimeMap[name] / 3600;
          formattedData += `${name}\t${hours}\n`;
        });
        formattedData += `Issues\t${totalTickets}`;
        navigator.clipboard.writeText(formattedData).then(() => {
          if (this.notification) {
            this.notification.success('Summary data copied to clipboard');
          } else if (this.uiManager && this.uiManager.notification) {
            this.uiManager.notification.success('Summary data copied to clipboard');
          } else {}
        }).catch(err => {
          console.error('Failed to copy data:', err);
          if (this.notification) {
            this.notification.error('Failed to copy data to clipboard');
          } else if (this.uiManager && this.uiManager.notification) {
            this.uiManager.notification.error('Failed to copy data to clipboard');
          } else {
            console.error('Failed to copy data to clipboard');
          }
        });
        const originalText = copyButton.textContent;
        copyButton.textContent = '✓ Copied!';
        copyButton.style.backgroundColor = '#28a745';
        setTimeout(() => {
          copyButton.textContent = originalText;
          copyButton.style.backgroundColor = '#1f75cb';
        }, 1500);
      } catch (error) {
        console.error('Error formatting or copying data:', error);
        if (this.notification) {
          this.notification.error('Error preparing data for clipboard');
        } else if (this.uiManager && this.uiManager.notification) {
          this.uiManager.notification.error('Error preparing data for clipboard');
        } else {
          console.error('Error preparing data for clipboard');
        }
      }
    };
    buttonContainer.appendChild(copyButton);
    container.appendChild(buttonContainer);
  }
  async render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
    if (this.isRendering) {
      this.pendingRender = true;
      return;
    }
    try {
      this.isRendering = true;
      const summaryContent = document.getElementById('assignee-time-summary-content');
      if (!summaryContent) return;
      if (!this.membersList || this.membersList.length === 0) {
        summaryContent.innerHTML = '<div style="text-align: center; padding: 20px;">Loading team members...</div>';
        try {
          await this.fetchMembers();
        } catch (error) {
          console.error('Error fetching members:', error);
        }
      }
      summaryContent.innerHTML = '';
      if (this.uiManager) {
        this.uiManager.updateBoardStats({
          totalCards: cardsProcessed,
          withTimeCards: cardsWithTime,
          closedCards: this.getClosedBoardCount()
        });
      }
      if (cardsWithTime === 0) {
        this.renderNoDataMessage(summaryContent);
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
          this.uiManager.removeLoadingScreen('summary-tab');
        }
        return;
      }
      const totalHours = formatHours(totalEstimate);
      let doneHours = 0;
      for (const boardName in boardData) {
        const lowerBoardName = boardName.toLowerCase();
        if (lowerBoardName.includes('done') || lowerBoardName.includes('closed') || lowerBoardName.includes('complete') || lowerBoardName.includes('finished')) {
          doneHours += boardData[boardName].timeEstimate || 0;
        }
      }
      const doneHoursFormatted = formatHours(doneHours);
      if (this.uiManager) {
        this.uiManager.updateHeader(`Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`);
      }
      if (currentMilestone) {
        this.renderMilestoneInfo(summaryContent, currentMilestone);
      }
      let that = this;
      await this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);
      that.addCopySummaryButton(summaryContent, assigneeTimeMap, cardsWithTime);
      if (that.uiManager && that.uiManager.removeLoadingScreen) {
        that.uiManager.removeLoadingScreen('summary-tab');
      }
    } finally {
      this.isRendering = false;
      if (this.pendingRender) {
        this.pendingRender = false;
      }
    }
  }
  getWhitelistedAssignees() {
    let whitelist = [];
    try {
      if (this.uiManager && this.uiManager.assigneeManager && typeof this.uiManager.assigneeManager.getAssigneeWhitelist === 'function') {
        whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
      } else if (typeof getAssigneeWhitelist === 'function') {
        whitelist = getAssigneeWhitelist();
      } else {
        try {
          const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
          if (storedValue) {
            whitelist = JSON.parse(storedValue);
          }
        } catch (e) {
          console.warn('Error reading assignee whitelist from localStorage:', e);
        }
      }
    } catch (error) {
      console.error('Error getting whitelist:', error);
    }
    return Array.isArray(whitelist) ? whitelist : [];
  }
  getHistoryAssignees() {
    let historyAssignees = [];
    try {
      const generalHistoryStr = localStorage.getItem('gitLabHelperHistory');
      if (generalHistoryStr) {
        const generalHistory = JSON.parse(generalHistoryStr);
        const boardKey = "2478181?milestone_title=Started";
        if (generalHistory[boardKey]) {
          const dates = Object.keys(generalHistory[boardKey]).sort().reverse();
          if (dates.length > 0) {
            const latestEntry = generalHistory[boardKey][dates[0]];
            if (latestEntry && latestEntry.assigneeTimeMap) {
              const userData = latestEntry.userData || {};
              const additionalAssignees = Object.entries(latestEntry.assigneeTimeMap).map(([name, timeEstimate]) => {
                const username = userData[name]?.username || this.getUsernameFromName(name);
                const avatar_url = userData[name]?.avatar_url || '';
                return {
                  name: name,
                  username: username,
                  avatar_url: avatar_url,
                  stats: {
                    totalHours: formatHours(timeEstimate),
                    closedHours: 0,
                    fromHistory: true
                  },
                  userDistribution: latestEntry.userDistributions[name].distribution,
                  boardAssigneeData: latestEntry.boardAssigneeData
                };
              });
              historyAssignees = [...historyAssignees, ...additionalAssignees];
            }
          }
        }
      }
    } catch (error) {
      console.error('Error getting history assignees:', error);
    }
    return historyAssignees;
  }
  getBoardKey() {
    try {
      const url = window.location.href;
      const splitAtBoards = url.split('/boards/');
      if (splitAtBoards.length < 2) {
        return 'unknown-board';
      }
      return splitAtBoards[1];
    } catch (error) {
      console.error('Error generating board key:', error);
      return 'unknown-board';
    }
  }
  getUsernameFromName(name) {
    if (!name) return '';
    if (this.membersList && this.membersList.length) {
      const match = this.membersList.find(m => m.name === name);
      if (match && match.username) {
        return match.username;
      }
    }
    if (!name.includes(' ')) {
      return name.toLowerCase();
    }
    return name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
  }
  getClosedBoardCount() {
    let closedCount = 0;
    const boardLists = document.querySelectorAll('.board-list');
    boardLists.forEach(boardList => {
      let boardTitle = '';
      try {
        if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
          const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
          if (boardComponent && boardComponent.$props.list.title) {
            boardTitle = boardComponent.$props.list.title.toLowerCase();
          }
        }
        if (!boardTitle) {
          const boardHeader = boardList.querySelector('.board-title-text');
          if (boardHeader) {
            boardTitle = boardHeader.textContent.trim().toLowerCase();
          }
        }
      } catch (e) {
        console.error('Error getting board title:', e);
        const boardHeader = boardList.querySelector('.board-title-text');
        if (boardHeader) {
          boardTitle = boardHeader.textContent.trim().toLowerCase();
        }
      }
      if (boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished')) {
        const cards = boardList.querySelectorAll('.board-card');
        closedCount += cards.length;
      }
    });
    return closedCount;
  }
  renderNoDataMessage(container) {
    const noDataMsg = document.createElement('p');
    noDataMsg.textContent = 'No time estimate data found. Make sure the board is fully loaded and try again.';
    noDataMsg.style.color = '#666';
    container.appendChild(noDataMsg);
    const tipMsg = document.createElement('p');
    tipMsg.style.fontSize = '12px';
    tipMsg.style.fontStyle = 'italic';
    tipMsg.innerHTML = 'Tip: Try scrolling through all cards to ensure they are loaded before clicking Recalculate.';
    container.appendChild(tipMsg);
    this.uiManager.updateHeader('Summary 0.0h');
  }
  renderMilestoneInfo(container, milestoneName) {
    const milestoneInfo = document.createElement('div');
    milestoneInfo.style.marginBottom = '10px';
    milestoneInfo.style.fontSize = '13px';
    milestoneInfo.style.color = '#555';
    milestoneInfo.textContent = `Current Milestone: ${milestoneName}`;
    container.appendChild(milestoneInfo);
  }
  async renderDataTableWithDistribution(container, assigneeTimeMap, totalHours, boardData, boardAssigneeData) {
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.tableLayout = 'fixed';
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = 'Loading board configuration...';
    loadingIndicator.style.padding = '15px';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.color = '#666';
    container.appendChild(loadingIndicator);
    const fetchedBoardNames = await fetchAllBoards();
    try {
      if (loadingIndicator.parentNode === container) {
        container.removeChild(loadingIndicator);
      }
    } catch (e) {}
    try {
      const existingTable = container.querySelector('table');
      if (existingTable) {
        container.removeChild(existingTable);
      }
    } catch (e) {}
    try {
      const copySummaryBtn = container.querySelector('.copySummaryBtn');
      if (copySummaryBtn) {
        $(copySummaryBtn).remove();
      }
    } catch (e) {}
    container.appendChild(table);
    const boardNames = fetchedBoardNames && fetchedBoardNames.length > 0 ? fetchedBoardNames : Object.keys(boardData || {});
    table.style.tableLayout = 'fixed';
    const totalRow = document.createElement('tr');
    totalRow.style.borderBottom = '2px solid #ddd';
    totalRow.style.fontWeight = 'bold';
    const totalLabelCell = document.createElement('td');
    const totalLink = document.createElement('a');
    totalLink.textContent = 'Total';
    totalLink.href = window.location.pathname + '?milestone_title=Started';
    totalLink.style.color = '#1f75cb';
    totalLink.style.textDecoration = 'none';
    totalLink.style.cursor = 'pointer';
    totalLink.addEventListener('mouseenter', () => {
      totalLink.style.textDecoration = 'underline';
    });
    totalLink.addEventListener('mouseleave', () => {
      totalLink.style.textDecoration = 'none';
    });
    totalLabelCell.appendChild(totalLink);
    totalLabelCell.style.padding = '8px 0';
    totalLabelCell.style.paddingLeft = '32px';
    const totalValueCell = document.createElement('td');
    totalValueCell.textContent = `${totalHours}h`;
    totalValueCell.style.textAlign = 'right';
    totalValueCell.style.padding = '8px 0';
    const totalDistributionCell = document.createElement('td');
    totalDistributionCell.style.textAlign = 'right';
    totalDistributionCell.style.padding = '8px 0 8px 15px';
    totalDistributionCell.style.color = '#666';
    totalDistributionCell.style.fontSize = '12px';
    if (boardNames.length > 0 && boardData) {
      const distributionValues = boardNames.map(boardName => {
        const boardDataObj = boardData[boardName] || {
          timeEstimate: 0
        };
        const hoursFloat = parseFloat(formatHours(boardDataObj.timeEstimate || 0));
        return Math.round(hoursFloat);
      });
      const distributionText = distributionValues.map((hours, index) => {
        let spanHTML = `<span style="`;
        if (hours === 0) {
          spanHTML += `color:#aaa;`;
        }
        if (index === distributionValues.length - 1 && hours > 0) {
          spanHTML += `color:#28a745;`;
        }
        spanHTML += `">${hours}h</span>`;
        return spanHTML;
      }).join('/');
      totalDistributionCell.innerHTML = distributionText;
    }
    totalRow.appendChild(totalLabelCell);
    totalRow.appendChild(totalValueCell);
    totalRow.appendChild(totalDistributionCell);
    table.appendChild(totalRow);
    const currentAssigneeSet = new Set();
    const sortedAssignees = Object.keys(assigneeTimeMap || {}).sort((a, b) => {
      return (assigneeTimeMap[b] || 0) - (assigneeTimeMap[a] || 0);
    });
    sortedAssignees.forEach(name => {
      if (!name) return;
      const hours = formatHours(assigneeTimeMap[name] || 0);
      this.addAssigneeRow(table, name, `${hours}h`, boardNames, boardAssigneeData);
      currentAssigneeSet.add(name.toLowerCase());
    });
    const historyAssignees = this.getHistoryAssignees();
    const historicalMembers = [];
    if (historyAssignees && historyAssignees.length > 0) {
      historyAssignees.forEach(assignee => {
        if (!assignee || !assignee.name) return;
        const assigneeName = assignee.name.toLowerCase();
        if (currentAssigneeSet.has(assigneeName)) return;
        historicalMembers.push(assignee);
      });
    }
    const otherTeamMembers = [];
    if (this.membersList && this.membersList.length > 0) {
      this.membersList.forEach(member => {
        if (!member) return;
        const name = member.name || member.username;
        if (!name) return;
        const lowerName = name.toLowerCase();
        if (currentAssigneeSet.has(lowerName)) return;
        if (historicalMembers.some(h => (h.name || '').toLowerCase() === lowerName || (h.username || '').toLowerCase() === lowerName)) {
          return;
        }
        otherTeamMembers.push(member);
      });
    }
    if (historicalMembers.length > 0) {
      const separatorRow = document.createElement('tr');
      const separatorCell = document.createElement('td');
      separatorCell.colSpan = 3;
      separatorCell.style.padding = '10px 0 5px 32px';
      separatorCell.style.fontSize = '12px';
      separatorCell.style.color = '#666';
      separatorCell.style.fontStyle = 'italic';
      separatorCell.style.borderTop = '1px solid #eee';
      separatorCell.textContent = 'Previously Active Members:';
      separatorRow.appendChild(separatorCell);
      table.appendChild(separatorRow);
      historicalMembers.sort((a, b) => {
        const aHours = a.stats?.totalHours || 0;
        const bHours = b.stats?.totalHours || 0;
        return bHours - aHours;
      });
      historicalMembers.forEach(member => {
        const name = member.name || member.username;
        if (!name) return;
        const hours = member.stats ? `${member.stats.totalHours}h` : '0h';
        this.addAssigneeRow(table, name, hours, boardNames, {}, true, member, member.boardAssigneeData);
      });
    }
    if (otherTeamMembers.length > 0) {
      const separatorRow = document.createElement('tr');
      const separatorCell = document.createElement('td');
      separatorCell.colSpan = 3;
      separatorCell.style.padding = '10px 0 5px 32px';
      separatorCell.style.fontSize = '12px';
      separatorCell.style.color = '#666';
      separatorCell.style.fontStyle = 'italic';
      separatorCell.style.borderTop = '1px solid #eee';
      const headerContainer = document.createElement('div');
      headerContainer.style.display = 'flex';
      headerContainer.style.alignItems = 'center';
      headerContainer.style.cursor = 'pointer';
      const headerText = document.createElement('span');
      headerText.textContent = 'Other Team Members:';
      headerContainer.appendChild(headerText);
      const toggleButton = document.createElement('span');
      toggleButton.textContent = '▶';
      toggleButton.style.marginLeft = '5px';
      toggleButton.style.fontSize = '10px';
      toggleButton.style.transition = 'transform 0.3s';
      headerContainer.appendChild(toggleButton);
      separatorCell.appendChild(headerContainer);
      separatorRow.appendChild(separatorCell);
      table.appendChild(separatorRow);
      const otherMembersContainer = document.createElement('tbody');
      otherMembersContainer.style.display = 'none';
      otherMembersContainer.id = 'other-team-members-container';
      headerContainer.addEventListener('click', () => {
        const isCollapsed = otherMembersContainer.style.display === 'none';
        otherMembersContainer.style.display = isCollapsed ? 'table-row-group' : 'none';
        toggleButton.textContent = isCollapsed ? '▼' : '▶';
      });
      otherTeamMembers.sort((a, b) => {
        const aName = (a.name || a.username || '').toLowerCase();
        const bName = (b.name || b.username || '').toLowerCase();
        return aName.localeCompare(bName);
      });
      otherTeamMembers.forEach(member => {
        const name = member.name || member.username;
        if (!name) return;
        const row = document.createElement('tr');
        this.addAssigneeRowToElement(row, name, '0h', boardNames, {}, true);
        otherMembersContainer.appendChild(row);
      });
      table.appendChild(otherMembersContainer);
    }
    const rows = table.querySelectorAll('tr');
    rows.forEach(row => {
      const cells = row.querySelectorAll('td');
      if (cells.length >= 3) {
        if (cells[1]) {
          cells[1].style.width = '30px';
          cells[1].style.minWidth = '30px';
          cells[1].style.maxWidth = '30px';
        }
        if (cells[2]) {
          cells[2].style.width = '120px';
          cells[2].style.minWidth = '120px';
          cells[2].style.maxWidth = '120px';
        }
        if (cells[0]) {
          cells[0].style.width = 'auto';
        }
      }
    });
    container.appendChild(table);
  }
  addAssigneeRow(table, name, hours, boardNames, boardAssigneeData, isPotential = false, historyStats = null, historyboardAssigneeData = null) {
    if (!name) name = "Unknown User";
    const row = document.createElement('tr');
    this.addAssigneeRowToElement(row, name, hours, boardNames, boardAssigneeData, isPotential, historyStats, historyboardAssigneeData);
    table.appendChild(row);
    return row;
  }
  async fetchMembers() {
    try {
      const whitelistedAssignees = this.getWhitelistedAssignees();
      let allMembers = [];
      if (whitelistedAssignees && whitelistedAssignees.length > 0) {
        allMembers = [...whitelistedAssignees];
      }
      if (!this.gitlabApi) {
        this.gitlabApi = window.gitlabApi;
        if (!this.gitlabApi) {
          console.warn('GitLab API not available for fetching members, using whitelist only');
          this.membersList = allMembers;
          return allMembers;
        }
      }
      const pathInfo = getPathFromUrl?.() || {};
      if (!pathInfo || !pathInfo.type || !pathInfo.encodedPath) {
        console.warn('Could not determine project/group path, using whitelist only');
        this.membersList = allMembers;
        return allMembers;
      }
      let endpoint;
      if (pathInfo.type === 'project') {
        endpoint = `projects/${pathInfo.encodedPath}/members/all`;
      } else if (pathInfo.type === 'group') {
        endpoint = `groups/${pathInfo.encodedPath}/members/all`;
      } else {
        console.warn('Unsupported path type, using whitelist only:', pathInfo.type);
        this.membersList = allMembers;
        return allMembers;
      }
      const members = await this.gitlabApi.callGitLabApiWithCache(endpoint, {
        params: {
          per_page: 100,
          all_available: true
        }
      });
      if (!Array.isArray(members)) {
        console.warn('API did not return an array of members, using whitelist only');
        this.membersList = allMembers;
        return allMembers;
      }
      allMembers.push(...members);
      const memberMap = new Map();
      allMembers.forEach(member => {
        if (!member || !member.username) return;
        const key = member.username.toLowerCase();
        if (memberMap.has(key)) {
          const existing = memberMap.get(key);
          if (!existing.id || member.id && existing.name === undefined && member.name) {
            memberMap.set(key, {
              id: member.id,
              name: member.name || existing.name,
              username: member.username,
              avatar_url: member.avatar_url || existing.avatar_url,
              stats: existing.stats
            });
          }
        } else {
          memberMap.set(key, {
            id: member.id,
            name: member.name,
            username: member.username,
            avatar_url: member.avatar_url
          });
        }
      });
      const historyAssignees = this.getHistoryAssignees();
      historyAssignees.forEach(assignee => {
        if (!assignee || !assignee.username) return;
        const key = assignee.username.toLowerCase();
        if (memberMap.has(key)) {
          const existing = memberMap.get(key);
          memberMap.set(key, {
            ...existing,
            stats: assignee.stats
          });
        } else {
          const isWhitelisted = whitelistedAssignees.some(wa => wa.username && wa.username.toLowerCase() === key);
          if (isWhitelisted) {
            memberMap.set(key, assignee);
          }
        }
      });
      this.membersList = Array.from(memberMap.values());
      return this.membersList;
    } catch (error) {
      console.error('Error fetching members:', error);
      if (allMembers && allMembers.length > 0) {
        this.membersList = allMembers;
        return allMembers;
      }
      this.membersList = [];
      return [];
    }
  }
  findMemberByName(name) {
    if (!name) return null;
    const lowerName = name.toLowerCase();
    if (this.membersList && this.membersList.length) {
      const memberMatch = this.membersList.find(member => {
        if (!member) return false;
        if (member.name && member.name.toLowerCase() === lowerName) {
          return true;
        }
        if (member.username && member.username.toLowerCase() === lowerName) {
          return true;
        }
        return false;
      });
      if (memberMatch) return memberMatch;
    }
    try {
      const sprintHistoryStr = localStorage.getItem('gitLabHelperSprintHistory');
      if (sprintHistoryStr) {
        const sprintHistory = JSON.parse(sprintHistoryStr);
        if (Array.isArray(sprintHistory) && sprintHistory.length > 0) {
          const latestSprint = sprintHistory[0];
          if (latestSprint.userPerformance && latestSprint.userPerformance[name]) {
            const userData = latestSprint.userPerformance[name];
            if (userData.username || userData.avatar_url) {
              return {
                name: name,
                username: userData.username || '',
                avatar_url: userData.avatar_url || '',
                fromHistory: true
              };
            }
          }
          if (latestSprint.userDistributions && latestSprint.userDistributions[name]) {
            const userData = latestSprint.userDistributions[name];
            if (userData.username || userData.avatar_url) {
              return {
                name: name,
                username: userData.username || '',
                avatar_url: userData.avatar_url || '',
                fromHistory: true
              };
            }
          }
          if (latestSprint.userData && latestSprint.userData[name]) {
            const userData = latestSprint.userData[name];
            return {
              name: name,
              username: userData.username || '',
              avatar_url: userData.avatar_url || '',
              fromHistory: true
            };
          }
        }
      }
      const generalHistoryStr = localStorage.getItem('gitLabHelperHistory');
      if (generalHistoryStr) {
        const generalHistory = JSON.parse(generalHistoryStr);
        const boardKey = this.getBoardKey();
        if (generalHistory[boardKey]) {
          const dates = Object.keys(generalHistory[boardKey]).sort().reverse();
          for (const date of dates) {
            const entry = generalHistory[boardKey][date];
            if (entry.userData && entry.userData[name]) {
              const userData = entry.userData[name];
              return {
                name: name,
                username: userData.username || '',
                avatar_url: userData.avatar_url || '',
                fromHistory: true
              };
            }
            if (entry.userDistributions && entry.userDistributions[name]) {
              const userData = entry.userDistributions[name];
              if (userData.username || userData.avatar_url) {
                return {
                  name: name,
                  username: userData.username || '',
                  avatar_url: userData.avatar_url || '',
                  fromHistory: true
                };
              }
            }
          }
        }
      }
    } catch (error) {
      console.warn('Error searching history for member:', error);
    }
    return null;
  }
  addAssigneeRowToElement(row, name, hours, boardNames, boardAssigneeData, isPotential = false, historyStats = null, historyboardAssigneeData = null) {
    if (!name) name = "Unknown User";
    row.style.borderBottom = '1px solid #eee';
    if (isPotential) {
      row.style.opacity = '0.75';
      row.style.fontStyle = 'italic';
    }
    const nameCell = document.createElement('td');
    nameCell.style.display = 'flex';
    nameCell.style.alignItems = 'center';
    nameCell.style.padding = '8px 0';
    nameCell.style.width = 'auto';
    const member = this.findMemberByName(name);
    const avatar = document.createElement('div');
    avatar.style.width = '24px';
    avatar.style.height = '24px';
    avatar.style.borderRadius = '50%';
    avatar.style.marginRight = '8px';
    avatar.style.overflow = 'hidden';
    avatar.style.flexShrink = '0';
    let avatar_url = '';
    if (member && member.avatar_url) {
      avatar_url = member.avatar_url;
    } else if (historyStats && historyStats.avatar_url) {
      avatar_url = historyStats.avatar_url;
    }
    if (avatar_url) {
      const img = document.createElement('img');
      img.src = avatar_url;
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.objectFit = 'cover';
      avatar.appendChild(img);
    } else {
      avatar.style.backgroundColor = '#e0e0e0';
      avatar.style.display = 'flex';
      avatar.style.alignItems = 'center';
      avatar.style.justifyContent = 'center';
      avatar.style.fontSize = '10px';
      avatar.style.fontWeight = 'bold';
      avatar.style.color = '#666';
      const initials = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
      avatar.textContent = initials || '?';
    }
    nameCell.appendChild(avatar);
    const nameContainer = document.createElement('div');
    nameContainer.style.overflow = 'hidden';
    nameContainer.style.textOverflow = 'ellipsis';
    const nameLink = document.createElement('a');
    let username = '';
    if (member && member.username) {
      username = member.username;
    } else if (historyStats && historyStats.username) {
      username = historyStats.username;
    } else {
      username = this.getUsernameFromName(name);
    }
    if (username) {
      nameLink.href = window.location.pathname + `?milestone_title=Started&assignee_username=${username}`;
    } else {
      nameLink.href = window.location.pathname + '?milestone_title=Started';
    }
    nameLink.textContent = name + (Object.keys(boardAssigneeData).length == 0 ? " ?" : "");
    nameLink.title = username ? `@${username}` : name;
    nameLink.style.color = '#1f75cb';
    nameLink.style.textDecoration = 'none';
    nameLink.style.cursor = 'pointer';
    nameLink.style.display = 'block';
    nameLink.style.overflow = 'hidden';
    nameLink.style.textOverflow = 'ellipsis';
    nameLink.style.whiteSpace = 'nowrap';
    nameLink.addEventListener('mouseenter', () => {
      nameLink.style.textDecoration = 'underline';
    });
    nameLink.addEventListener('mouseleave', () => {
      nameLink.style.textDecoration = 'none';
    });
    nameContainer.appendChild(nameLink);
    nameCell.appendChild(nameContainer);
    const timeCell = document.createElement('td');
    timeCell.textContent = `${hours}`;
    timeCell.style.textAlign = 'center';
    timeCell.style.padding = '8px 0';
    timeCell.style.width = '80px';
    timeCell.style.minWidth = '80px';
    timeCell.style.maxWidth = '80px';
    const distributionCell = document.createElement('td');
    distributionCell.style.textAlign = 'right';
    distributionCell.style.padding = '8px 0 8px 15px';
    distributionCell.style.color = '#666';
    distributionCell.style.fontSize = '12px';
    distributionCell.style.width = '180px';
    distributionCell.style.minWidth = '180px';
    distributionCell.style.maxWidth = '180px';
    if (!isPotential && boardNames.length > 0 && boardAssigneeData) {
      const distributionValues = boardNames.map(boardName => {
        const boardAssignees = boardAssigneeData[boardName] || {};
        const assigneeInBoard = boardAssignees[name] || {
          timeEstimate: 0
        };
        const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
        return Math.round(hoursFloat);
      });
      const distributionText = distributionValues.map((hours, index) => {
        let spanHTML = `<span style="`;
        if (hours === 0) {
          spanHTML += `color:#aaa;`;
        }
        if (index === distributionValues.length - 1 && hours > 0) {
          spanHTML += `color:#28a745;`;
        }
        spanHTML += `">${hours}h</span>`;
        return spanHTML;
      }).join('/');
      distributionCell.innerHTML = distributionText;
    } else if (historyboardAssigneeData) {
      const distributionValues = boardNames.map(boardName => {
        const boardAssignees = historyboardAssigneeData[boardName] || {};
        const assigneeInBoard = boardAssignees[name] || {
          timeEstimate: 0
        };
        const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
        return Math.round(hoursFloat);
      });
      const distributionText = distributionValues.map((hours, index) => {
        let spanHTML = `<span style="`;
        if (hours === 0) {
          spanHTML += `color:#aaa;`;
        }
        if (index === distributionValues.length - 1 && hours > 0) {
          spanHTML += `color:#28a745;`;
        }
        spanHTML += `">${hours}h</span>`;
        return spanHTML;
      }).join('/');
      distributionCell.innerHTML = distributionText;
    } else {
      const emptyText = boardNames.map(() => {
        return `<span style="color:#aaa;">0h</span>`;
      }).join('/');
      distributionCell.innerHTML = emptyText;
    }
    row.appendChild(nameCell);
    row.appendChild(timeCell);
    row.appendChild(distributionCell);
  }
}

// File: lib/ui/views/BoardsView.js
window.BoardsView = class BoardsView {
  constructor(uiManager) {
    this.uiManager = uiManager;
  }
  render(boardData, boardAssigneeData) {
    const boardsContent = document.getElementById('boards-time-summary-content');
    if (!boardsContent) return;
    boardsContent.innerHTML = '';
    const boardsList = document.createElement('div');
    boardsList.className = 'boards-list-summary';
    const nonEmptyBoards = Object.keys(boardData).filter(boardName => {
      return boardData[boardName].tickets > 0 && boardData[boardName].timeEstimate > 0;
    });
    const sortedBoards = nonEmptyBoards.sort((a, b) => {
      return boardData[b].timeEstimate - boardData[a].timeEstimate;
    });
    if (sortedBoards.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No boards with time estimates found.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      boardsList.appendChild(emptyMessage);
    } else {
      sortedBoards.forEach(boardName => {
        const boardSection = this.createBoardSection(boardName, boardData[boardName], boardAssigneeData[boardName]);
        boardsList.appendChild(boardSection);
      });
    }
    boardsContent.appendChild(boardsList);
    if (this.uiManager && this.uiManager.removeLoadingScreen) {
      this.uiManager.removeLoadingScreen('boards-tab');
    }
  }
  createBoardSection(boardName, boardData, assigneeData) {
    const boardHours = formatHours(boardData.timeEstimate);
    const boardSection = document.createElement('div');
    boardSection.className = 'board-section';
    boardSection.style.marginBottom = '15px';
    const boardHeader = document.createElement('div');
    boardHeader.className = 'board-header';
    boardHeader.style.display = 'flex';
    boardHeader.style.justifyContent = 'space-between';
    boardHeader.style.padding = '5px';
    boardHeader.style.backgroundColor = '#f5f5f5';
    boardHeader.style.borderRadius = '3px';
    boardHeader.style.cursor = 'pointer';
    boardHeader.style.fontWeight = 'bold';
    const boardDetails = document.createElement('div');
    boardDetails.className = 'board-details';
    boardDetails.style.display = 'none';
    boardDetails.style.marginTop = '5px';
    boardDetails.style.marginLeft = '10px';
    boardHeader.addEventListener('click', () => {
      if (boardDetails.style.display === 'none') {
        boardDetails.style.display = 'block';
        boardToggle.textContent = '▼';
      } else {
        boardDetails.style.display = 'none';
        boardToggle.textContent = '▶';
      }
    });
    const boardInfo = document.createElement('div');
    boardInfo.textContent = `${boardName} (${boardData.tickets} tickets, ${boardHours}h)`;
    const boardToggle = document.createElement('span');
    boardToggle.textContent = '▶';
    boardToggle.style.marginLeft = '5px';
    boardHeader.appendChild(boardInfo);
    boardHeader.appendChild(boardToggle);
    if (assigneeData && Object.keys(assigneeData).length > 0) {
      boardDetails.appendChild(this.createAssigneeTable(assigneeData));
    } else {
      const noAssigneesMsg = document.createElement('div');
      noAssigneesMsg.textContent = 'No assignee data available for this board.';
      noAssigneesMsg.style.padding = '8px 0';
      noAssigneesMsg.style.color = '#666';
      noAssigneesMsg.style.fontStyle = 'italic';
      boardDetails.appendChild(noAssigneesMsg);
    }
    boardSection.appendChild(boardHeader);
    boardSection.appendChild(boardDetails);
    return boardSection;
  }
  createAssigneeTable(assigneeData) {
    const assigneeTable = document.createElement('table');
    assigneeTable.style.width = '100%';
    assigneeTable.style.borderCollapse = 'collapse';
    assigneeTable.style.marginTop = '5px';
    const headerRow = document.createElement('tr');
    headerRow.style.borderBottom = '1px solid #ddd';
    const nameHeader = document.createElement('th');
    nameHeader.textContent = 'Assignee';
    nameHeader.style.textAlign = 'left';
    nameHeader.style.padding = '3px 0';
    const ticketsHeader = document.createElement('th');
    ticketsHeader.textContent = 'Tickets';
    ticketsHeader.style.textAlign = 'right';
    ticketsHeader.style.padding = '3px 5px';
    const timeHeader = document.createElement('th');
    timeHeader.textContent = 'Hours';
    timeHeader.style.textAlign = 'right';
    timeHeader.style.padding = '3px 0';
    headerRow.appendChild(nameHeader);
    headerRow.appendChild(ticketsHeader);
    headerRow.appendChild(timeHeader);
    assigneeTable.appendChild(headerRow);
    const boardAssignees = Object.keys(assigneeData).sort((a, b) => {
      return assigneeData[b].timeEstimate - assigneeData[a].timeEstimate;
    });
    boardAssignees.forEach(assigneeName => {
      const assigneeInfo = assigneeData[assigneeName];
      const assigneeHours = formatHours(assigneeInfo.timeEstimate);
      const assigneeRow = document.createElement('tr');
      assigneeRow.style.borderBottom = '1px solid #eee';
      const nameCell = document.createElement('td');
      nameCell.textContent = assigneeName;
      nameCell.style.padding = '3px 0';
      const ticketsCell = document.createElement('td');
      ticketsCell.textContent = assigneeInfo.tickets;
      ticketsCell.style.textAlign = 'right';
      ticketsCell.style.padding = '3px 5px';
      const timeCell = document.createElement('td');
      timeCell.textContent = `${assigneeHours}h`;
      timeCell.style.textAlign = 'right';
      timeCell.style.padding = '3px 0';
      assigneeRow.appendChild(nameCell);
      assigneeRow.appendChild(ticketsCell);
      assigneeRow.appendChild(timeCell);
      assigneeTable.appendChild(assigneeRow);
    });
    return assigneeTable;
  }
}

// File: lib/ui/views/SprintManagementView.js
window.SprintManagementView = class SprintManagementView {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.notification = null;
    try {
      if (typeof Notification === 'function') {
        this.notification = new Notification({
          position: 'bottom-right',
          duration: 3000
        });
      }
    } catch (e) {
      console.error('Error initializing notification:', e);
    }
    this.sprintState = {
      endSprint: false,
      preparedForNext: false,
      currentMilestone: null,
      userPerformance: {}
    };
    this.sprintHistory = [];
    this.loadSprintState();
    this.loadSprintHistory();
  }
  render() {
    const sprintManagementContent = document.getElementById('sprint-management-content');
    if (!sprintManagementContent) return;
    sprintManagementContent.innerHTML = '';
    const urlParams = new URLSearchParams(window.location.search);
    let isValidUrl = false;
    if (urlParams.has('milestone_title') && urlParams.get('milestone_title') === 'Started') {
      let paramCount = 0;
      urlParams.forEach(() => {
        paramCount++;
      });
      isValidUrl = paramCount === 1;
    }
    if (!isValidUrl) {
      this.renderLockedState(sprintManagementContent);
      return;
    }
    this.getCurrentMilestone();
    const milestoneInfo = document.createElement('div');
    milestoneInfo.style.padding = '10px';
    milestoneInfo.style.margin = '0 10px';
    milestoneInfo.style.backgroundColor = '#f8f9fa';
    milestoneInfo.style.borderRadius = '6px';
    milestoneInfo.style.fontWeight = 'bold';
    if (this.sprintState.currentMilestone) {
      milestoneInfo.textContent = `Current Milestone: ${this.sprintState.currentMilestone}`;
    } else {
      milestoneInfo.textContent = 'No milestone detected';
      milestoneInfo.style.color = '#dc3545';
    }
    sprintManagementContent.appendChild(milestoneInfo);
    const stepsContainer = document.createElement('div');
    stepsContainer.style.display = 'flex';
    stepsContainer.style.flexDirection = 'column';
    stepsContainer.style.gap = '5px';
    stepsContainer.style.marginTop = '';
    stepsContainer.style.padding = '15px';
    stepsContainer.style.backgroundColor = '#f8f9fa';
    stepsContainer.style.borderRadius = '6px';
    stepsContainer.style.border = '1px solid #dee2e6';
    stepsContainer.style.margin = '10px 10px 0';
    this.createStepButton(stepsContainer, '1. End Sprint', '#1f75cb', () => this.endSprint(), !this.sprintState.endSprint);
    this.createStepButton(stepsContainer, '2. Ready for next Sprint', '#6f42c1', () => this.prepareForNextSprint(), this.sprintState.endSprint && !this.sprintState.preparedForNext);
    this.createStepButton(stepsContainer, '3. Copy Sprint Data Summary', '#28a745', () => this.copySprintData(), this.sprintState.preparedForNext);
    this.createStepButton(stepsContainer, '4. Copy Closed Issue Names', '#fd7e14', () => this.copyClosedTickets(), this.sprintState.preparedForNext);
    const utilityContainer = document.createElement('div');
    utilityContainer.style.display = 'flex';
    utilityContainer.style.justifyContent = 'flex-end';
    utilityContainer.style.marginTop = '10px';
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit Data';
    editButton.className = 'edit-sprint-data-button';
    editButton.style.padding = '10px 16px';
    const editEnabled = this.sprintState.endSprint;
    editButton.style.backgroundColor = editEnabled ? '#17a2b8' : '#6c757d';
    editButton.style.color = 'white';
    editButton.style.border = 'none';
    editButton.style.borderRadius = '4px';
    editButton.style.cursor = editEnabled ? 'pointer' : 'not-allowed';
    editButton.style.fontWeight = 'bold';
    editButton.style.opacity = editEnabled ? '1' : '0.7';
    editButton.disabled = !editEnabled;
    if (editEnabled) {
      editButton.addEventListener('click', () => this.editSprintData());
    }
    utilityContainer.appendChild(editButton);
    stepsContainer.appendChild(utilityContainer);
    sprintManagementContent.appendChild(stepsContainer);
    if (this.sprintState.totalTickets !== undefined) {
      this.showSprintDataSummary(sprintManagementContent);
    }
    this.renderSprintHistory(sprintManagementContent);
    if (this.uiManager && this.uiManager.removeLoadingScreen) {
      this.uiManager.removeLoadingScreen('sprintmanagement-tab');
    }
  }
  renderLockedState(container) {
    const lockedContainer = document.createElement('div');
    lockedContainer.style.display = 'flex';
    lockedContainer.style.flexDirection = 'column';
    lockedContainer.style.alignItems = 'center';
    lockedContainer.style.justifyContent = 'center';
    lockedContainer.style.padding = '40px';
    lockedContainer.style.backgroundColor = '#f8f9fa';
    lockedContainer.style.borderRadius = '6px';
    lockedContainer.style.margin = '10px';
    lockedContainer.style.textAlign = 'center';
    const lockIcon = document.createElement('div');
    lockIcon.innerHTML = '🔒';
    lockIcon.style.fontSize = '48px';
    lockIcon.style.marginBottom = '20px';
    const message = document.createElement('h3');
    message.textContent = 'Sprint Management is Locked';
    message.style.marginBottom = '15px';
    message.style.color = '#495057';
    const instruction = document.createElement('p');
    instruction.innerHTML = 'Sprint Management is only available when URL contains <strong>exactly</strong> <code>?milestone_title=Started</code> with no other parameters';
    instruction.style.color = '#6c757d';
    instruction.style.marginBottom = '20px';
    const link = document.createElement('a');
    const currentUrl = new URL(window.location.href);
    currentUrl.search = '';
    currentUrl.searchParams.set('milestone_title', 'Started');
    link.href = currentUrl.toString();
    link.textContent = 'Access Sprint Management';
    link.style.display = 'inline-block';
    link.style.padding = '10px 16px';
    link.style.backgroundColor = '#1f75cb';
    link.style.color = 'white';
    link.style.textDecoration = 'none';
    link.style.borderRadius = '4px';
    link.style.fontWeight = 'bold';
    link.style.marginTop = '10px';
    lockedContainer.appendChild(lockIcon);
    lockedContainer.appendChild(message);
    lockedContainer.appendChild(instruction);
    lockedContainer.appendChild(link);
    container.appendChild(lockedContainer);
    if (this.uiManager && this.uiManager.removeLoadingScreen) {
      this.uiManager.removeLoadingScreen('sprintmanagement-tab');
    }
  }
  copyClosedTickets() {
    try {
      const closedTickets = this.getClosedTickets();
      if (closedTickets.length === 0) {
        this.notification.warning('No closed tickets found on the board');
        return;
      }
      const formattedText = `"${closedTickets.map(ticket => `- ${ticket.title}`).join('\n')}"`;
      navigator.clipboard.writeText(formattedText).then(() => {
        this.notification.success(`Copied ${closedTickets.length} issue ${closedTickets.length !== 1 ? 'names' : 'name'} to clipboard`);
      }).catch(err => {
        console.error('Error copying to clipboard:', err);
        this.notification.error('Failed to copy to clipboard');
      });
    } catch (error) {
      console.error('Error copying closed tickets:', error);
      this.notification.error('Error processing issues');
    }
  }
  updateStatus(message, type = 'info') {
    if (this.notification) {
      this.notification[type](message);
    } else {}
  }
  getClosedTickets() {
    const closedTickets = [];
    const boardLists = document.querySelectorAll('.board-list');
    boardLists.forEach(boardList => {
      let boardTitle = '';
      try {
        if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
          const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
          if (boardComponent && boardComponent.$props.list.title) {
            boardTitle = boardComponent.$props.list.title.toLowerCase();
          }
        }
        if (!boardTitle) {
          const boardHeader = boardList.querySelector('.board-title-text');
          if (boardHeader) {
            boardTitle = boardHeader.textContent.trim().toLowerCase();
          }
        }
      } catch (e) {
        console.error('Error getting board title:', e);
        const boardHeader = boardList.querySelector('.board-title-text');
        if (boardHeader) {
          boardTitle = boardHeader.textContent.trim().toLowerCase();
        }
      }
      const isClosedBoard = boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished');
      if (isClosedBoard) {
        const boardCards = boardList.querySelectorAll('.board-card');
        boardCards.forEach(card => {
          try {
            if (card.__vue__ && card.__vue__.$children) {
              const issue = card.__vue__.$children.find(child => child.$props && child.$props.item);
              if (issue && issue.$props && issue.$props.item) {
                const item = issue.$props.item;
                const title = item.title;
                const id = item.iid;
                if (title) {
                  closedTickets.push({
                    id: id || 'unknown',
                    title: title
                  });
                }
              }
            } else {
              const titleEl = card.querySelector('.board-card-title');
              if (titleEl) {
                const title = titleEl.textContent.trim();
                let id = 'unknown';
                const idMatch = card.querySelector('[data-issue-id]');
                if (idMatch && idMatch.dataset.issueId) {
                  id = idMatch.dataset.issueId;
                }
                if (title) {
                  closedTickets.push({
                    id: id,
                    title: title
                  });
                }
              }
            }
          } catch (err) {
            console.error('Error processing card:', err);
          }
        });
      }
    });
    return closedTickets;
  }
  copySprintData() {
    try {
      const {
        totalTickets,
        closedTickets,
        totalHours,
        closedHours,
        extraHoursClosed = 0
      } = this.sprintState;
      const totalClosedHours = closedHours + extraHoursClosed;
      let prediction = 'schlecht';
      const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
      const hoursRatio = totalHours > 0 ? totalClosedHours / totalHours : 0;
      if (ticketRatio > 0.7 || hoursRatio > 0.7) {
        prediction = 'gut';
      } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
        prediction = 'mittel';
      }
      const formattedData = `${totalTickets}\n${closedTickets}\n${totalHours}\n${totalClosedHours}\n\n${prediction}`;
      navigator.clipboard.writeText(formattedData).then(() => {
        this.notification.success('Sprint data copied to clipboard');
      }).catch(err => {
        console.error('Error copying sprint data to clipboard:', err);
        this.notification.error('Failed to copy sprint data');
      });
    } catch (error) {
      console.error('Error copying sprint data:', error);
      this.notification.error('Error processing sprint data');
    }
  }
  calculateSprintData() {
    let totalTickets = 0;
    let totalHours = 0;
    let closedHours = 0;
    const boardLists = document.querySelectorAll('.board-list');
    boardLists.forEach(boardList => {
      let boardTitle = '';
      try {
        if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
          const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
          if (boardComponent && boardComponent.$props.list.title) {
            boardTitle = boardComponent.$props.list.title.toLowerCase();
          }
        }
        if (!boardTitle) {
          const boardHeader = boardList.querySelector('.board-title-text');
          if (boardHeader) {
            boardTitle = boardHeader.textContent.trim().toLowerCase();
          }
        }
      } catch (e) {
        console.error('Error getting board title:', e);
        const boardHeader = boardList.querySelector('.board-title-text');
        if (boardHeader) {
          boardTitle = boardHeader.textContent.trim().toLowerCase();
        }
      }
      const isClosedBoard = boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished');
      const boardCards = boardList.querySelectorAll('.board-card');
      boardCards.forEach(card => {
        try {
          if (card.__vue__ && card.__vue__.$children) {
            const issue = card.__vue__.$children.find(child => child.$props && child.$props.item);
            if (issue && issue.$props && issue.$props.item) {
              const item = issue.$props.item;
              totalTickets++;
              if (item.timeEstimate) {
                const hours = item.timeEstimate / 3600;
                totalHours += hours;
                if (isClosedBoard) {
                  closedHours += hours;
                }
              }
            }
          }
        } catch (err) {
          console.error('Error processing card:', err);
        }
      });
    });
    totalHours = Math.round(totalHours * 10) / 10;
    closedHours = Math.round(closedHours * 10) / 10;
    let prediction = 'schlecht';
    const closedTickets = this.getClosedTickets().length;
    const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
    const hoursRatio = totalHours > 0 ? closedHours / totalHours : 0;
    if (ticketRatio > 0.7 || hoursRatio > 0.7) {
      prediction = 'gut';
    } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
      prediction = 'mittel';
    }
    return {
      totalTickets,
      totalHours,
      closedHours,
      prediction
    };
  }
  createStepButton(container, title, color, onClick, enabled = true) {
    const buttonWrapper = document.createElement('div');
    buttonWrapper.style.display = 'flex';
    buttonWrapper.style.flexDirection = 'column';
    buttonWrapper.style.gap = '5px';
    const button = document.createElement('button');
    button.textContent = title;
    button.style.padding = '12px 16px';
    button.style.backgroundColor = enabled ? color : '#6c757d';
    button.style.color = 'white';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = enabled ? 'pointer' : 'not-allowed';
    button.style.fontWeight = 'bold';
    button.style.opacity = enabled ? '1' : '0.7';
    button.style.transition = 'all 0.2s ease';
    button.disabled = !enabled;
    if (enabled) {
      const hoverColor = this.darkenColor(color, 10);
      button.addEventListener('mouseenter', function () {
        this.style.backgroundColor = hoverColor;
      });
      button.addEventListener('mouseleave', function () {
        this.style.backgroundColor = color;
      });
      button.addEventListener('click', function () {
        onClick();
      });
    }
    buttonWrapper.appendChild(button);
    container.appendChild(buttonWrapper);
    return button;
  }
  darkenColor(hex, percent) {
    hex = hex.replace(/^#/, '');
    let r = parseInt(hex.substr(0, 2), 16);
    let g = parseInt(hex.substr(2, 2), 16);
    let b = parseInt(hex.substr(4, 2), 16);
    r = Math.floor(r * (100 - percent) / 100);
    g = Math.floor(g * (100 - percent) / 100);
    b = Math.floor(b * (100 - percent) / 100);
    r = Math.min(255, Math.max(0, r));
    g = Math.min(255, Math.max(0, g));
    b = Math.min(255, Math.max(0, b));
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }
  getCurrentMilestone() {
    try {
      const boardLists = document.querySelectorAll('.board-list');
      boardLists.forEach(boardList => {
        const boardItems = boardList.querySelectorAll('.board-card');
        boardItems.forEach(item => {
          try {
            if (item.__vue__ && item.__vue__.$children) {
              const issue = item.__vue__.$children.find(child => child.$props && child.$props.item && child.$props.item.milestone);
              if (issue && issue.$props.item && issue.$props.item.milestone && issue.$props.item.milestone.title) {
                this.sprintState.currentMilestone = issue.$props.item.milestone.title;
              }
            }
          } catch (e) {
            console.error('Error parsing issue for milestone:', e);
          }
        });
      });
      if (this.sprintState.currentMilestone) {
        this.saveSprintState();
      }
    } catch (e) {
      console.error('Error getting current milestone:', e);
    }
  }
  endSprint() {
    try {
      const sprintData = this.calculateSprintData();
      const closedTickets = this.getClosedTickets();
      const userPerformance = this.calculateUserPerformance();
      const sprintId = Date.now().toString();
      this.sprintState.id = sprintId;
      this.sprintState.endSprint = true;
      this.sprintState.totalTickets = sprintData.totalTickets;
      this.sprintState.closedTickets = closedTickets.length;
      this.sprintState.totalHours = sprintData.totalHours;
      this.sprintState.closedHours = sprintData.closedHours;
      this.sprintState.userPerformance = userPerformance;
      this.sprintState.timestamp = new Date().toISOString();
      this.saveSprintState();
      this.notification.success('Sprint ended. Data captured successfully.');
      if (this.uiManager && this.uiManager.issueSelector && typeof this.uiManager.issueSelector.startSelection === 'function') {
        if (this.uiManager.tabManager && typeof this.uiManager.tabManager.switchToTab === 'function') {
          this.uiManager.tabManager.switchToTab('bulkcomments');
        }
        setTimeout(() => {
          this.uiManager.issueSelector.startSelection();
        }, 300);
        this.notification.info('Issue selection started. Please select issues to process.');
      }
      this.render();
    } catch (error) {
      console.error('Error ending sprint:', error);
      this.notification.error('Failed to end sprint: ' + error.message);
    }
  }
  deleteCurrentSprint() {
    try {
      if (this.sprintState.id && this.sprintHistory && this.sprintHistory.length > 0) {
        const historyIndex = this.sprintHistory.findIndex(sprint => sprint.id === this.sprintState.id);
        if (historyIndex >= 0) {
          this.sprintHistory.splice(historyIndex, 1);
          this.saveSprintHistory();
          this.notification.info("Sprint removed from history.");
        }
      }
      this.sprintState = {
        endSprint: false,
        preparedForNext: false,
        currentMilestone: this.sprintState.currentMilestone,
        userPerformance: {}
      };
      this.saveSprintState();
      this.notification.success('Sprint data has been deleted.');
      this.render();
    } catch (error) {
      console.error('Error deleting sprint data:', error);
      this.notification.error('Failed to delete sprint data: ' + error.message);
    }
  }
  prepareForNextSprint() {
    try {
      const currentData = this.calculateSprintData();
      const extraHoursClosed = Math.max(0, this.sprintState.totalHours - currentData.totalHours);
      this.archiveCompletedSprint();
      this.sprintState.preparedForNext = true;
      this.sprintState.extraHoursClosed = extraHoursClosed;
      this.saveSprintState();
      this.notification.success(`Sprint preparation complete. ${extraHoursClosed}h of carried over work identified.`);
      this.render();
    } catch (error) {
      console.error('Error preparing for next sprint:', error);
      this.notification.error('Failed to prepare for next sprint: ' + error.message);
    }
  }
  editSprintData() {
    try {
      const formHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Total Tickets:</label>
                    <input type="number" id="edit-total-tickets" value="${this.sprintState.totalTickets || 0}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Closed Tickets:</label>
                    <input type="number" id="edit-closed-tickets" value="${this.sprintState.closedTickets || 0}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Total Hours:</label>
                    <input type="number" id="edit-total-hours" value="${this.sprintState.totalHours || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Closed Hours:</label>
                    <input type="number" id="edit-closed-hours" value="${this.sprintState.closedHours || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Extra Closed Hours:</label>
                    <input type="number" id="edit-extra-hours" value="${this.sprintState.extraHoursClosed || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                    <button id="delete-sprint-btn" style="width: 100%; padding: 8px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Delete Current Sprint Data</button>
                </div>
            </div>
        `;
      this.showModal('Edit Sprint Data', formHTML, () => {
        this.sprintState.totalTickets = parseFloat(document.getElementById('edit-total-tickets').value) || 0;
        this.sprintState.closedTickets = parseFloat(document.getElementById('edit-closed-tickets').value) || 0;
        this.sprintState.totalHours = parseFloat(document.getElementById('edit-total-hours').value) || 0;
        this.sprintState.closedHours = parseFloat(document.getElementById('edit-closed-hours').value) || 0;
        this.sprintState.extraHoursClosed = parseFloat(document.getElementById('edit-extra-hours').value) || 0;
        if (this.sprintState.totalTickets > 0 && !this.sprintState.endSprint) {
          this.sprintState.endSprint = true;
        }
        if (this.sprintState.extraHoursClosed > 0 && !this.sprintState.survivorsSet) {
          this.sprintState.survivorsSet = true;
        }
        if (this.sprintState.id && this.sprintHistory && this.sprintHistory.length > 0) {
          const historyIndex = this.sprintHistory.findIndex(sprint => sprint.id === this.sprintState.id);
          if (historyIndex >= 0) {
            this.sprintHistory[historyIndex].totalTickets = this.sprintState.totalTickets;
            this.sprintHistory[historyIndex].closedTickets = this.sprintState.closedTickets;
            this.sprintHistory[historyIndex].totalHours = this.sprintState.totalHours;
            this.sprintHistory[historyIndex].closedHours = this.sprintState.closedHours;
            this.sprintHistory[historyIndex].extraHoursClosed = this.sprintState.extraHoursClosed;
            this.saveSprintHistory();
            this.notification.info("Sprint data updated in history as well.");
          }
        }
        this.saveSprintState();
        this.notification.success('Sprint data updated successfully.');
        this.render();
      });
      setTimeout(() => {
        const deleteButton = document.getElementById('delete-sprint-btn');
        if (deleteButton) {
          deleteButton.addEventListener('click', e => {
            e.preventDefault();
            e.stopPropagation();
            if (confirm('Are you sure you want to delete the current sprint data? This action cannot be undone.')) {
              this.deleteCurrentSprint();
              const modalOverlay = document.querySelector('div[style*="position: fixed"][style*="z-index: 1000"]');
              if (modalOverlay && modalOverlay.parentNode) {
                modalOverlay.parentNode.removeChild(modalOverlay);
              }
            }
          });
        }
      }, 100);
    } catch (error) {
      console.error('Error editing sprint data:', error);
      this.notification.error('Failed to edit sprint data: ' + error.message);
    }
  }
  showModal(title, content, onSave) {
    const modalOverlay = document.createElement('div');
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.cursor = 'pointer';
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.borderRadius = '6px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '500px';
    modalContent.style.maxWidth = '90%';
    const modalHeader = document.createElement('div');
    modalHeader.style.borderBottom = '1px solid #eee';
    modalHeader.style.paddingBottom = '10px';
    modalHeader.style.marginBottom = '15px';
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    const modalTitle = document.createElement('h3');
    modalTitle.style.margin = '0';
    modalTitle.textContent = title;
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '×';
    closeBtn.style.background = 'none';
    closeBtn.style.border = 'none';
    closeBtn.style.fontSize = '24px';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.padding = '0';
    closeBtn.style.lineHeight = '1';
    closeBtn.onclick = () => {
      document.body.removeChild(modalOverlay);
    };
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeBtn);
    const modalBody = document.createElement('div');
    modalBody.style.marginBottom = '20px';
    if (typeof content === 'string') {
      modalBody.innerHTML = content;
    } else {
      modalBody.appendChild(content);
    }
    const modalFooter = document.createElement('div');
    modalFooter.style.borderTop = '1px solid #eee';
    modalFooter.style.paddingTop = '15px';
    modalFooter.style.display = 'flex';
    modalFooter.style.justifyContent = 'flex-end';
    modalFooter.style.gap = '10px';
    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '8px 16px';
    cancelBtn.style.backgroundColor = '#6c757d';
    cancelBtn.style.color = 'white';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '4px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.onclick = () => {
      document.body.removeChild(modalOverlay);
    };
    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'Save';
    saveBtn.style.padding = '8px 16px';
    saveBtn.style.backgroundColor = '#28a745';
    saveBtn.style.color = 'white';
    saveBtn.style.border = 'none';
    saveBtn.style.borderRadius = '4px';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = () => {
      if (typeof onSave === 'function') {
        onSave();
      }
      document.body.removeChild(modalOverlay);
    };
    modalFooter.appendChild(cancelBtn);
    modalFooter.appendChild(saveBtn);
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(modalBody);
    modalContent.appendChild(modalFooter);
    modalOverlay.appendChild(modalContent);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) {
        document.body.removeChild(modalOverlay);
      }
    });
    document.body.appendChild(modalOverlay);
  }
  showSprintDataSummary(container) {
    const dataContainer = document.createElement('div');
    dataContainer.style.margin = '10px';
    dataContainer.style.padding = '15px';
    dataContainer.style.backgroundColor = '#f8f9fa';
    dataContainer.style.borderRadius = '6px';
    dataContainer.style.border = '1px solid #dee2e6';
    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Current Sprint Data';
    titleEl.style.margin = '0 0 15px 0';
    titleEl.style.fontSize = '16px';
    dataContainer.appendChild(titleEl);
    const createDataRow = (label, value) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.justifyContent = 'space-between';
      row.style.marginBottom = '8px';
      row.style.padding = '5px 0';
      row.style.borderBottom = '1px solid #eee';
      const labelEl = document.createElement('div');
      labelEl.textContent = label;
      labelEl.style.fontWeight = 'bold';
      const valueEl = document.createElement('div');
      valueEl.textContent = value;
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      return row;
    };
    const {
      totalTickets = 0,
      closedTickets = 0,
      totalHours = 0,
      closedHours = 0,
      extraHoursClosed = 0,
      timestamp
    } = this.sprintState;
    dataContainer.appendChild(createDataRow('Total Tickets:', totalTickets));
    dataContainer.appendChild(createDataRow('Closed Tickets:', closedTickets));
    dataContainer.appendChild(createDataRow('Total Hours:', totalHours + 'h'));
    dataContainer.appendChild(createDataRow('Closed Hours:', closedHours + 'h'));
    if (extraHoursClosed > 0) {
      dataContainer.appendChild(createDataRow('Extra Hours Closed:', extraHoursClosed + 'h'));
      dataContainer.appendChild(createDataRow('Total Hours Closed:', closedHours + extraHoursClosed + 'h'));
    }
    if (timestamp) {
      const date = new Date(timestamp);
      const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
      dataContainer.appendChild(createDataRow('Captured On:', formattedDate));
    }
    container.appendChild(dataContainer);
  }
  saveSprintState() {
    try {
      localStorage.setItem('gitLabHelperSprintState', JSON.stringify(this.sprintState));
    } catch (error) {
      console.error('Failed to save sprint state to localStorage:', error);
      this.notification.error('Failed to save sprint state');
    }
  }
  loadSprintState() {
    try {
      const saved = localStorage.getItem('gitLabHelperSprintState');
      if (saved) {
        this.sprintState = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load sprint state from localStorage:', error);
      this.notification.error('Failed to load sprint state');
    }
  }
  calculateUserPerformance() {
    const userPerformance = {};
    try {
      const boardLists = document.querySelectorAll('.board-list');
      boardLists.forEach(boardList => {
        let boardTitle = '';
        try {
          if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
            const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
            if (boardComponent && boardComponent.$props.list.title) {
              boardTitle = boardComponent.$props.list.title.toLowerCase();
            }
          }
          if (!boardTitle) {
            const boardHeader = boardList.querySelector('.board-title-text');
            if (boardHeader) {
              boardTitle = boardHeader.textContent.trim().toLowerCase();
            }
          }
        } catch (e) {
          console.error('Error getting board title:', e);
          const boardHeader = boardList.querySelector('.board-title-text');
          if (boardHeader) {
            boardTitle = boardHeader.textContent.trim().toLowerCase();
          }
        }
        const isClosedBoard = boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished');
        const boardCards = boardList.querySelectorAll('.board-card');
        boardCards.forEach(card => {
          try {
            if (card.__vue__ && card.__vue__.$children) {
              const issue = card.__vue__.$children.find(child => child.$props && child.$props.item);
              if (issue && issue.$props && issue.$props.item) {
                const item = issue.$props.item;
                let assignees = [];
                if (item.assignees && item.assignees.nodes && item.assignees.nodes.length) {
                  assignees = item.assignees.nodes;
                } else if (item.assignees && item.assignees.length > 0) {
                  assignees = item.assignees;
                }
                if (assignees.length === 0) {
                  return;
                }
                const timeEstimate = item.timeEstimate || 0;
                const timePerAssignee = timeEstimate / assignees.length;
                assignees.forEach(assignee => {
                  const name = assignee.name || assignee.username || 'Unknown';
                  if (!userPerformance[name]) {
                    userPerformance[name] = {
                      totalTickets: 0,
                      closedTickets: 0,
                      totalHours: 0,
                      closedHours: 0
                    };
                  }
                  userPerformance[name].totalTickets++;
                  userPerformance[name].totalHours += timePerAssignee / 3600;
                  if (isClosedBoard) {
                    userPerformance[name].closedTickets++;
                    userPerformance[name].closedHours += timePerAssignee / 3600;
                  }
                });
              }
            }
          } catch (err) {
            console.error('Error processing card for user performance:', err);
          }
        });
      });
      Object.keys(userPerformance).forEach(user => {
        userPerformance[user].totalHours = Math.round(userPerformance[user].totalHours * 10) / 10;
        userPerformance[user].closedHours = Math.round(userPerformance[user].closedHours * 10) / 10;
      });
    } catch (error) {
      console.error('Error calculating user performance:', error);
    }
    return userPerformance;
  }
  archiveCompletedSprint() {
    try {
      if (!this.sprintState.endSprint || !this.sprintState.timestamp) {
        return;
      }
      const archiveEntry = {
        id: this.sprintState.id || Date.now().toString(),
        milestone: this.sprintState.currentMilestone,
        totalTickets: this.sprintState.totalTickets,
        closedTickets: this.sprintState.closedTickets,
        totalHours: this.sprintState.totalHours,
        closedHours: this.sprintState.closedHours,
        extraHoursClosed: this.sprintState.extraHoursClosed || 0,
        userPerformance: this.sprintState.userPerformance || {},
        userDistributions: this.sprintState.userDistributions || {},
        timestamp: this.sprintState.timestamp,
        completedAt: new Date().toISOString()
      };
      this.sprintHistory.unshift(archiveEntry);
      if (this.sprintHistory.length > 10) {
        this.sprintHistory = this.sprintHistory.slice(0, 10);
      }
      this.saveSprintHistory();
    } catch (error) {
      console.error('Error archiving sprint:', error);
    }
  }
  saveSprintHistory() {
    try {
      localStorage.setItem('gitLabHelperSprintHistory', JSON.stringify(this.sprintHistory));
    } catch (error) {
      console.error('Failed to save sprint history to localStorage:', error);
      this.notification.error('Failed to save sprint history');
    }
  }
  loadSprintHistory() {
    try {
      const saved = localStorage.getItem('gitLabHelperSprintHistory');
      if (saved) {
        this.sprintHistory = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Failed to load sprint history from localStorage:', error);
      this.notification.error('Failed to load sprint history');
      this.sprintHistory = [];
    }
  }
  renderSprintHistory(container) {
    if (!this.sprintHistory || this.sprintHistory.length === 0) {
      return;
    }
    const historySection = document.createElement('div');
    historySection.style.margin = '10px';
    historySection.style.padding = '15px';
    historySection.style.backgroundColor = '#f8f9fa';
    historySection.style.borderRadius = '6px';
    historySection.style.border = '1px solid #dee2e6';
    const titleEl = document.createElement('h3');
    titleEl.textContent = 'Sprint History';
    titleEl.style.margin = '0 0 15px 0';
    titleEl.style.fontSize = '16px';
    historySection.appendChild(titleEl);
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['Sprint', 'Tickets', 'Hours', 'Completed'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      th.style.padding = '8px';
      th.style.textAlign = 'left';
      th.style.borderBottom = '2px solid #dee2e6';
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);
    const tbody = document.createElement('tbody');
    this.sprintHistory.forEach(sprint => {
      const row = document.createElement('tr');
      row.style.borderBottom = '1px solid #dee2e6';
      row.style.transition = 'background-color 0.2s';
      row.style.cursor = 'pointer';
      row.addEventListener('mouseenter', () => {
        row.style.backgroundColor = '#f1f1f1';
      });
      row.addEventListener('mouseleave', () => {
        row.style.backgroundColor = '';
      });
      row.addEventListener('click', () => {
        this.showSprintDetails(sprint);
      });
      const tdMilestone = document.createElement('td');
      tdMilestone.style.padding = '8px';
      tdMilestone.textContent = sprint.milestone || 'Unnamed Sprint';
      tdMilestone.style.color = '#1f75cb';
      tdMilestone.style.fontWeight = 'bold';
      row.appendChild(tdMilestone);
      const tdTickets = document.createElement('td');
      tdTickets.style.padding = '8px';
      tdTickets.textContent = `${sprint.closedTickets}/${sprint.totalTickets}`;
      row.appendChild(tdTickets);
      const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
      const tdHours = document.createElement('td');
      tdHours.style.padding = '8px';
      tdHours.textContent = `${totalClosedHours}/${sprint.totalHours}h`;
      row.appendChild(tdHours);
      const tdDate = document.createElement('td');
      tdDate.style.padding = '8px';
      const date = new Date(sprint.completedAt || sprint.timestamp);
      tdDate.textContent = date.toLocaleDateString();
      row.appendChild(tdDate);
      tbody.appendChild(row);
    });
    table.appendChild(tbody);
    historySection.appendChild(table);
    container.appendChild(historySection);
  }
  showSprintDetails(sprint) {
    const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
    const ticketCompletion = sprint.totalTickets > 0 ? sprint.closedTickets / sprint.totalTickets * 100 : 0;
    const hourCompletion = sprint.totalHours > 0 ? totalClosedHours / sprint.totalHours * 100 : 0;
    const startDate = new Date(sprint.timestamp);
    const endDate = new Date(sprint.completedAt || sprint.timestamp);
    let content = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: #1f75cb;">${sprint.milestone || 'Unnamed Sprint'}</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                    <h4 style="margin-top: 0; font-size: 14px;">Tickets</h4>
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                        ${sprint.closedTickets}/${sprint.totalTickets}
                    </div>
                    <div style="font-size: 14px; color: #6c757d;">
                        ${ticketCompletion.toFixed(2)}% completed
                    </div>
                </div>
                
                <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                    <h4 style="margin-top: 0; font-size: 14px;">Hours</h4>
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                        ${totalClosedHours}/${sprint.totalHours}h
                    </div>
                    <div style="font-size: 14px; color: #6c757d;">
                        ${hourCompletion.toFixed(2)}% completed
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="margin-bottom: 10px; font-size: 16px;">Sprint Details</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Started:</td>
                        <td style="padding: 8px;">${startDate.toLocaleString()}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Completed:</td>
                        <td style="padding: 8px;">${endDate.toLocaleString()}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Carried Over Hours:</td>
                        <td style="padding: 8px;">${sprint.extraHoursClosed || 0}h</td>
                    </tr>
                </table>
            </div>
    `;
    if (sprint.userPerformance && Object.keys(sprint.userPerformance).length > 0) {
      content += `
            <div>
                <h4 style="margin-bottom: 10px; font-size: 16px;">User Performance</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 8px; text-align: left;">User</th>
                            <th style="padding: 8px; text-align: center;">Tickets</th>
                            <th style="padding: 8px; text-align: center;">Completion</th>
                            <th style="padding: 8px; text-align: right;">Hours</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
      const sortedUsers = Object.entries(sprint.userPerformance).sort(([, a], [, b]) => b.closedHours - a.closedHours);
      sortedUsers.forEach(([name, data]) => {
        const userTicketCompletion = data.totalTickets > 0 ? (data.closedTickets / data.totalTickets * 100).toFixed(0) : 0;
        content += `
                <tr style="border-bottom: 1px solid #dee2e6;">
                    <td style="padding: 8px;">${name}</td>
                    <td style="padding: 8px; text-align: center;">${data.closedTickets}/${data.totalTickets}</td>
                    <td style="padding: 8px; text-align: center;">${userTicketCompletion}%</td>
                    <td style="padding: 8px; text-align: right;">${data.closedHours}/${data.totalHours}h</td>
                </tr>
            `;
      });
      content += `
                    </tbody>
                </table>
            </div>
        `;
    }
    content += '</div>';
    this.showModal(`Sprint Details: ${sprint.milestone || 'Unnamed Sprint'}`, content);
  }
}

// File: lib/ui/views/BulkCommentsView.js
window.BulkCommentsView = class BulkCommentsView {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.selectedIssues = [];
    this.commandShortcuts = null;
    this.isLoading = false;
    this.initializedShortcuts = new Set();
    this.commentInput = null;
    this.gitlabApi = window.gitlabApi || uiManager && uiManager.gitlabApi;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.fetchedMembers = [];
    if (uiManager && uiManager.labelManager) {
      this.labelManager = uiManager.labelManager;
    } else if (typeof LabelManager === 'function') {
      this.labelManager = new LabelManager({
        gitlabApi: this.gitlabApi,
        onLabelsLoaded: labels => {
          if (this.commandShortcuts) {
            this.addLabelShortcut();
          }
        }
      });
    } else {
      this.labelManager = {
        filteredLabels: [],
        fetchAllLabels: () => Promise.resolve([])
      };
    }
    this.selectionDisplay = new SelectionDisplay({
      selectedIssues: this.selectedIssues,
      onRemoveIssue: index => this.onRemoveIssue(index)
    });
  }
  updateAssignShortcut(items) {
    if (!this.commandShortcuts) {
      return;
    }
    if (!items || items.length <= 3) {
      return;
    }
    try {
      let currentValue = null;
      if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign'] && this.commandShortcuts.shortcuts['assign'].dropdown) {
        currentValue = this.commandShortcuts.shortcuts['assign'].dropdown.value;
      }
      if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign']) {
        this.commandShortcuts.removeShortcut('assign');
      }
      this.commandShortcuts.addCustomShortcut({
        type: 'assign',
        label: '/assign',
        items: items,
        toggleMode: true,
        onSelect: (value, mode) => {
          if (!value || value === 'separator' || value === 'separator2') return;
          if (value === 'manage') {
            if (this.assigneeManager && typeof this.assigneeManager.openAssigneeManager === 'function') {
              this.assigneeManager.openAssigneeManager();
            } else if (window.assigneeManager && typeof window.assigneeManager.openAssigneeManager === 'function') {
              window.assigneeManager.openAssigneeManager();
            } else if (typeof openAssigneeManager === 'function') {
              openAssigneeManager();
            } else {
              console.error('No assignee manager found');
              this.notification.error('Assignee manager not available');
              return;
            }
            setTimeout(() => {
              this.addAssignShortcut();
            }, 500);
            return;
          }
          if (value === 'custom') {
            const customUser = prompt('Enter GitLab username (without @):');
            if (!customUser) return;
            value = customUser;
          }
          const textarea = this.commentInput || document.getElementById('issue-comment-input');
          if (!textarea) {
            console.error("No textarea found for inserting assign command");
            return;
          }
          let assignText;
          if (mode === 'remove') {
            assignText = `/unassign `;
            if (value === 'none') {
              assignText += '@none';
            } else if (value === '@me') {
              assignText += '@me';
            } else {
              assignText += value.startsWith('@') ? value : `@${value}`;
            }
          } else {
            assignText = `/assign `;
            if (value === 'none') {
              assignText += '@none';
            } else if (value === '@me') {
              assignText += '@me';
            } else {
              assignText += value.startsWith('@') ? value : `@${value}`;
            }
          }
          this.insertTextAtCursor(textarea, assignText);
          if (mode === 'remove') {
            if (value === 'none') {
              this.notification.info('Issue will be unassigned from everyone');
            } else if (value === '@me') {
              this.notification.info('Issue will be unassigned from you');
            } else {
              this.notification.info(`Issue will be unassigned from ${value.replace('@', '')}`);
            }
          } else {
            if (value === 'none') {
              this.notification.info('Issue will be unassigned');
            } else if (value === '@me') {
              this.notification.info('Issue will be assigned to you');
            } else {
              this.notification.info(`Issue will be assigned to ${value.replace('@', '')}`);
            }
          }
        }
      });
      if (currentValue && this.commandShortcuts.shortcuts['assign'] && this.commandShortcuts.shortcuts['assign'].dropdown) {
        this.commandShortcuts.shortcuts['assign'].dropdown.value = currentValue;
      }
    } catch (e) {
      console.error('Error updating assign shortcut:', e);
    }
  }
  initializeAllShortcuts() {
    if (!this.commandShortcuts) return;
    try {
      const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
      const addedShortcuts = new Set(Object.keys(this.commandShortcuts.shortcuts || {}));
      if (!addedShortcuts.has('estimate')) {
        this.commandShortcuts.initializeEstimateShortcut();
        addedShortcuts.add('estimate');
      }
      if (!addedShortcuts.has('label')) {
        this.addLabelShortcut([{
          value: '',
          label: 'Loading labels...'
        }]);
        addedShortcuts.add('label');
      }
      if (!addedShortcuts.has('milestone')) {
        this.addMilestoneShortcut();
        addedShortcuts.add('milestone');
      }
      if (!addedShortcuts.has('assign')) {
        this.addAssignShortcut();
        addedShortcuts.add('assign');
      }
    } catch (e) {
      console.error('Error initializing shortcuts:', e);
      this.notification.error('Error initializing shortcuts');
    }
  }
  addMilestoneShortcut() {
    if (!this.commandShortcuts) return;
    try {
      this.commandShortcuts.addCustomShortcut({
        type: 'milestone',
        label: '/milestone',
        items: [{
          value: '',
          label: 'Set Milestone'
        }, {
          value: '%current',
          label: 'Current Sprint'
        }, {
          value: '%next',
          label: 'Next Sprint'
        }, {
          value: '%upcoming',
          label: 'Upcoming'
        }, {
          value: 'none',
          label: 'Remove Milestone'
        }, {
          value: 'custom',
          label: 'Custom...'
        }],
        onSelect: value => {
          if (!value) return;
          if (value === 'custom') {
            const customMilestone = prompt('Enter milestone name:');
            if (!customMilestone) return;
            value = customMilestone;
          }
          if (!this.commentInput) {
            console.warn('Comment input not available');
            return;
          }
          let milestoneText = '/milestone ';
          if (value === 'none') {
            milestoneText += '%""';
          } else if (value.startsWith('%')) {
            milestoneText += value;
          } else {
            milestoneText += `%"${value}"`;
          }
          this.insertTextAtCursor(this.commentInput, milestoneText);
          this.notification.info(`Milestone set to ${value === 'none' ? 'none' : value}`);
        }
      });
    } catch (e) {
      console.error('Error adding milestone shortcut:', e);
    }
  }
  addAssignShortcut() {
    if (!this.commandShortcuts) return;
    let assignItems = [{
      value: '',
      label: 'Assign to...'
    }];
    let directWhitelist = null;
    try {
      if (typeof GM_getValue === 'function') {
        directWhitelist = GM_getValue('gitLabHelperAssigneeWhitelist', []);
      }
    } catch (e) {
      console.error("Error accessing GM_getValue:", e);
    }
    if (Array.isArray(directWhitelist) && directWhitelist.length > 0) {
      const whitelistItems = directWhitelist.map(assignee => ({
        value: assignee.username,
        label: assignee.name || assignee.username
      }));
      assignItems = assignItems.concat(whitelistItems);
    } else {
      let assignees = [];
      if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
        try {
          assignees = this.assigneeManager.getAssigneeWhitelist();
        } catch (e) {
          console.error("Error getting assignees from this.assigneeManager:", e);
        }
      }
      if ((!assignees || !assignees.length) && window.assigneeManager && typeof window.assigneeManager.getAssigneeWhitelist === 'function') {
        try {
          assignees = window.assigneeManager.getAssigneeWhitelist();
        } catch (e) {
          console.error("Error getting assignees from window.assigneeManager:", e);
        }
      }
      if ((!assignees || !assignees.length) && typeof getAssigneeWhitelist === 'function') {
        try {
          assignees = getAssigneeWhitelist();
        } catch (e) {
          console.error("Error getting assignees from imported getAssigneeWhitelist:", e);
        }
      }
      if ((!assignees || !assignees.length) && typeof window.getAssigneeWhitelist === 'function') {
        try {
          assignees = window.getAssigneeWhitelist();
        } catch (e) {
          console.error("Error getting assignees from window.getAssigneeWhitelist:", e);
        }
      }
      if (!assignees || !assignees.length) {
        try {
          const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
          if (storedValue) {
            assignees = JSON.parse(storedValue);
          }
        } catch (e) {
          console.error("Error getting assignees from localStorage:", e);
        }
      }
      if (Array.isArray(assignees) && assignees.length > 0) {
        const whitelistItems = assignees.map(assignee => ({
          value: assignee.username,
          label: assignee.name || assignee.username
        }));
        assignItems = assignItems.concat(whitelistItems);
      } else {}
    }
    this.updateAssignShortcut(assignItems);
    setTimeout(() => {
      this.fetchGroupMembers().then(members => {
        if (members && members.length > 0) {
          const updatedItems = [...assignItems];
          updatedItems.push({
            value: 'separator2',
            label: '────── Group Members ──────'
          });
          const existingUsernames = assignItems.filter(item => item.value && !['separator', 'separator2', 'custom', 'manage', '@me', 'none', ''].includes(item.value)).map(item => item.value.toLowerCase());
          const newMembers = members.filter(member => !existingUsernames.includes(member.username.toLowerCase())).map(member => ({
            value: member.username,
            label: member.name || member.username
          }));
          if (newMembers.length > 0) {
            updatedItems.push(...newMembers);
            this.updateAssignShortcut(updatedItems);
          }
        }
      }).catch(error => {
        console.error('Error fetching group members:', error);
      });
    }, 100);
    assignItems.push({
      value: 'separator',
      label: '────── Other ──────'
    });
    assignItems.push({
      value: '@me',
      label: 'Myself'
    });
    assignItems.push({
      value: 'none',
      label: 'Unassign'
    });
  }
  async fetchGroupMembers() {
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
      let members;
      if (pathInfo.type === 'project') {
        members = await this.gitlabApi.callGitLabApiWithCache(`projects/${pathInfo.encodedPath}/members/all`, {
          params: {
            per_page: 100,
            all_available: true
          }
        });
      } else if (pathInfo.type === 'group') {
        members = await this.gitlabApi.callGitLabApiWithCache(`groups/${pathInfo.encodedPath}/members/all`, {
          params: {
            per_page: 100,
            all_available: true
          }
        });
      } else {
        throw new Error('Unsupported path type: ' + pathInfo.type);
      }
      if (!Array.isArray(members)) {
        console.warn('API did not return an array of members');
        return [];
      }
      this.fetchedMembers = members.map(member => ({
        id: member.id,
        name: member.name,
        username: member.username,
        avatar_url: member.avatar_url
      }));
      return this.fetchedMembers;
    } catch (error) {
      console.error('Error fetching group members:', error);
      return [];
    }
  }
  setSelectedIssues(issues) {
    this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
    if (this.selectionDisplay) {
      this.selectionDisplay.setSelectedIssues(this.selectedIssues);
    }
  }
  onRemoveIssue(index) {
    if (this.selectedIssues.length > index) {
      const removedIssue = this.selectedIssues[index];
      this.selectedIssues.splice(index, 1);
      if (this.uiManager && this.uiManager.issueSelector) {
        this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      } else if (window.uiManager && window.uiManager.issueSelector) {
        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      }
      const statusEl = document.getElementById('comment-status');
      if (statusEl) {
        const count = this.selectedIssues.length;
        if (count > 0) {
          statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
          statusEl.style.color = 'green';
        } else {
          statusEl.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
          statusEl.style.color = '#666';
        }
      }
      if (this.selectionDisplay) {
        this.selectionDisplay.setSelectedIssues([...this.selectedIssues]);
      }
    }
  }
  createActionButtons(container) {
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '8px';
    buttonContainer.style.marginBottom = '8px';
    const selectBtn = document.createElement('button');
    selectBtn.id = 'select-issues-button';
    selectBtn.textContent = 'Select';
    selectBtn.style.padding = '8px 12px';
    selectBtn.style.backgroundColor = '#6c757d';
    selectBtn.style.color = 'white';
    selectBtn.style.border = 'none';
    selectBtn.style.borderRadius = '4px';
    selectBtn.style.cursor = 'pointer';
    selectBtn.style.fontSize = '14px';
    selectBtn.style.transition = 'background-color 0.2s ease';
    selectBtn.style.display = 'flex';
    selectBtn.style.alignItems = 'center';
    selectBtn.style.justifyContent = 'center';
    selectBtn.style.minWidth = '80px';
    selectBtn.addEventListener('mouseenter', () => {
      selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#218838' : '#5a6268';
    });
    selectBtn.addEventListener('mouseleave', () => {
      selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#28a745' : '#6c757d';
    });
    selectBtn.onclick = () => {
      if (this.uiManager && this.uiManager.issueSelector) {
        if (this.uiManager.issueSelector.isSelectingIssue) {
          this.uiManager.issueSelector.exitSelectionMode();
          selectBtn.dataset.active = 'false';
          selectBtn.style.backgroundColor = '#6c757d';
          selectBtn.textContent = 'Select';
        } else {
          this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
          this.uiManager.issueSelector.startSelection();
          selectBtn.dataset.active = 'true';
          selectBtn.style.backgroundColor = '#28a745';
          selectBtn.textContent = 'Done';
        }
      } else {
        console.error('Issue selector not initialized');
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
          statusEl.textContent = 'Error: Issue selector not initialized.';
          statusEl.style.color = '#dc3545';
        }
      }
    };
    buttonContainer.appendChild(selectBtn);
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Send';
    submitBtn.style.padding = '8px 12px';
    submitBtn.style.backgroundColor = '#1f75cb';
    submitBtn.style.color = 'white';
    submitBtn.style.border = 'none';
    submitBtn.style.borderRadius = '4px';
    submitBtn.style.cursor = 'pointer';
    submitBtn.style.fontSize = '14px';
    submitBtn.style.transition = 'background-color 0.2s ease';
    submitBtn.style.display = 'flex';
    submitBtn.style.alignItems = 'center';
    submitBtn.style.justifyContent = 'center';
    submitBtn.style.flex = '1';
    submitBtn.style.minWidth = '80px';
    submitBtn.addEventListener('mouseenter', () => {
      submitBtn.style.backgroundColor = '#1a63ac';
    });
    submitBtn.addEventListener('mouseleave', () => {
      submitBtn.style.backgroundColor = '#1f75cb';
    });
    submitBtn.onclick = () => this.submitComments();
    buttonContainer.appendChild(submitBtn);
    container.appendChild(buttonContainer);
  }
  clearSelectedIssues() {
    this.selectedIssues.splice(0, this.selectedIssues.length);
    this.selectedIssues = [];
    if (this.selectionDisplay && typeof this.selectionDisplay.setSelectedIssues === 'function') {
      this.selectionDisplay.setSelectedIssues([]);
    } else {
      console.warn('selectionDisplay not available or missing setSelectedIssues method');
      if (this.uiManager && this.uiManager.bulkCommentsView && this.uiManager.bulkCommentsView.selectionDisplay) {
        this.uiManager.bulkCommentsView.selectionDisplay.setSelectedIssues([]);
      }
    }
    const statusEl = document.getElementById('comment-status');
    if (statusEl) {
      statusEl.textContent = 'Selection cleared.';
      statusEl.style.color = '#666';
    }
    if (this.notification) {
      this.notification.info('Selection cleared');
    }
    if (this.uiManager && this.uiManager.issueSelector) {
      this.uiManager.issueSelector.setSelectedIssues([]);
    }
    if (typeof this.$forceUpdate === 'function') {
      this.$forceUpdate();
    }
  }
  render() {
    const bulkCommentsContent = document.getElementById('bulk-comments-content');
    if (!bulkCommentsContent) return;
    bulkCommentsContent.innerHTML = '';
    this.addCommentSection(bulkCommentsContent);
    if (this.commandShortcuts) {
      this.initializeAllShortcuts();
      this.isLoading = true;
      if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
        this.labelManager.fetchAllLabels().then(labels => {
          this.addLabelShortcut();
          this.isLoading = false;
          this.hideLoadingState();
          if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('bulkcomments-tab');
          }
        }).catch(error => {
          console.error('Error loading labels:', error);
          this.addLabelShortcut(this.getFallbackLabels());
          this.isLoading = false;
          this.hideLoadingState();
          if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('bulkcomments-tab');
          }
        });
      } else {
        console.warn('Label manager not available, using fallback labels');
        this.addLabelShortcut(this.getFallbackLabels());
        this.isLoading = false;
        this.hideLoadingState();
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
          this.uiManager.removeLoadingScreen('bulkcomments-tab');
        }
      }
    } else {
      console.error('Command shortcuts not initialized');
      this.isLoading = false;
      this.hideLoadingState();
      if (this.uiManager && this.uiManager.removeLoadingScreen) {
        this.uiManager.removeLoadingScreen('bulkcomments-tab');
      }
    }
  }
  addCommentSection(container) {
    const commentSection = document.createElement('div');
    commentSection.classList.add('api-section');
    commentSection.style.backgroundColor = '#f5f5f5';
    commentSection.style.borderRadius = '8px';
    commentSection.style.border = '1px solid #e0e0e0';
    this.selectionDisplay.createSelectionContainer(commentSection);
    this.createCommentInput(commentSection);
    this.createActionButtons(commentSection);
    this.createStatusElements(document.getElementById("assignee-time-summary"));
    this.isLoading = true;
    this.showLoadingState();
    try {
      if (this.commentInput && this.commandShortcuts) {
        this.initializeAllShortcuts();
        this.addLabelShortcut([{
          value: '',
          label: 'Loading labels...'
        }]);
        if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
          this.labelManager.fetchAllLabels().then(labels => {
            this.addLabelShortcut();
            this.isLoading = false;
            this.hideLoadingState();
          }).catch(error => {
            console.error('Error loading labels:', error);
            this.addLabelShortcut(this.getFallbackLabels());
            this.isLoading = false;
            this.hideLoadingState();
          });
        } else {
          console.warn('Label manager not available, using fallback labels');
          this.addLabelShortcut(this.getFallbackLabels());
          this.isLoading = false;
          this.hideLoadingState();
        }
      } else {
        console.error('Textarea or command shortcuts not initialized');
        this.isLoading = false;
        this.hideLoadingState();
      }
    } catch (error) {
      console.error('Error initializing shortcuts:', error);
      this.isLoading = false;
      this.hideLoadingState();
    }
    container.appendChild(commentSection);
  }
  getFallbackLabels() {
    return [{
      value: '',
      label: 'Add Label'
    }, {
      value: 'bug',
      label: 'Bug'
    }, {
      value: 'feature',
      label: 'Feature'
    }, {
      value: 'enhancement',
      label: 'Enhancement'
    }, {
      value: 'documentation',
      label: 'Documentation'
    }, {
      value: 'custom',
      label: 'Custom...'
    }];
  }
  createCommentInput(container) {
    const shortcutsWrapper = document.createElement('div');
    shortcutsWrapper.id = 'shortcuts-wrapper';
    shortcutsWrapper.style.width = '100%';
    shortcutsWrapper.style.marginBottom = '15px';
    shortcutsWrapper.style.minHeight = '120px';
    shortcutsWrapper.style.position = 'relative';
    const placeholderShortcuts = document.createElement('div');
    placeholderShortcuts.style.opacity = '0.4';
    placeholderShortcuts.style.pointerEvents = 'none';
    ['Estimate', 'Label', 'Milestone', 'Assign'].forEach(type => {
      const placeholder = document.createElement('div');
      placeholder.style.display = 'flex';
      placeholder.style.alignItems = 'center';
      placeholder.style.marginBottom = '8px';
      placeholder.style.height = '36px';
      placeholder.style.border = '1px solid #ddd';
      placeholder.style.borderRadius = '4px';
      placeholder.style.padding = '6px 10px';
      const label = document.createElement('div');
      label.textContent = `/${type.toLowerCase()}`;
      label.style.fontWeight = 'bold';
      label.style.minWidth = '100px';
      const dropdown = document.createElement('div');
      dropdown.style.flex = '1';
      dropdown.style.height = '24px';
      dropdown.style.backgroundColor = '#eee';
      dropdown.style.marginLeft = '10px';
      dropdown.style.borderRadius = '4px';
      placeholder.appendChild(label);
      placeholder.appendChild(dropdown);
      placeholderShortcuts.appendChild(placeholder);
    });
    shortcutsWrapper.appendChild(placeholderShortcuts);
    container.appendChild(shortcutsWrapper);
    const commentInput = document.createElement('textarea');
    commentInput.id = 'issue-comment-input';
    commentInput.placeholder = 'Enter your comment here...';
    commentInput.style.width = '100%';
    commentInput.style.padding = '8px';
    commentInput.style.marginBottom = '12px';
    commentInput.style.borderRadius = '4px';
    commentInput.style.border = '1px solid #ccc';
    commentInput.style.minHeight = '60px';
    commentInput.style.fontSize = '14px';
    commentInput.style.transition = 'border-color 0.2s ease';
    commentInput.style.resize = 'vertical';
    commentInput.style.boxSizing = 'border-box';
    commentInput.addEventListener('focus', () => {
      commentInput.style.borderColor = '#1f75cb';
      commentInput.style.outline = 'none';
      commentInput.style.boxShadow = '0 0 0 2px rgba(31, 117, 203, 0.2)';
    });
    commentInput.addEventListener('blur', () => {
      commentInput.style.borderColor = '#ccc';
      commentInput.style.boxShadow = 'none';
    });
    container.appendChild(commentInput);
    this.commentInput = commentInput;
    try {
      if (typeof CommandShortcut === 'function') {
        this.commandShortcuts = new CommandShortcut({
          targetElement: commentInput,
          onShortcutInsert: (type, value) => {}
        });
        this.commandShortcuts.initialize(shortcutsWrapper);
        if (placeholderShortcuts.parentNode === shortcutsWrapper) {
          shortcutsWrapper.removeChild(placeholderShortcuts);
        }
      } else {
        console.error('CommandShortcut class not available');
      }
    } catch (e) {
      console.error('Error initializing CommandShortcut:', e);
    }
  }
  insertTextAtCursor(textarea, text) {
    if (!textarea) return;
    const currentText = textarea.value;
    const startPos = textarea.selectionStart;
    const endPos = textarea.selectionEnd;
    let insertText = text;
    if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
      insertText = '\n' + insertText;
    }
    textarea.value = currentText.substring(0, startPos) + insertText + currentText.substring(endPos);
    const newCursorPos = startPos + insertText.length;
    textarea.setSelectionRange(newCursorPos, newCursorPos);
    textarea.focus();
  }
  createStatusElements(container) {
    const progressContainer = document.createElement('div');
    progressContainer.id = 'comment-progress-container';
    progressContainer.style.display = 'none';
    progressContainer.style.marginTop = '15px';
    progressContainer.style.color = 'white';
    const progressLabel = document.createElement('div');
    progressLabel.id = 'comment-progress-label';
    progressLabel.textContent = 'Submitting comments...';
    progressLabel.style.fontSize = '13px';
    progressLabel.style.marginBottom = '8px';
    progressLabel.style.textAlign = 'center';
    progressLabel.style.fontWeight = 'bold';
    progressContainer.appendChild(progressLabel);
    const progressBarOuter = document.createElement('div');
    progressBarOuter.style.height = '12px';
    progressBarOuter.style.backgroundColor = 'black';
    progressBarOuter.style.overflow = 'hidden';
    progressBarOuter.style.boxShadow = 'inset 0 1px 3px rgba(255,255,255,0.1)';
    const progressBarInner = document.createElement('div');
    progressBarInner.id = 'comment-progress-bar';
    progressBarInner.style.height = '100%';
    progressBarInner.style.width = '0%';
    progressBarInner.style.backgroundColor = '#00ff2ac7';
    progressBarInner.style.transition = 'width 0.3s ease';
    progressBarOuter.appendChild(progressBarInner);
    progressContainer.appendChild(progressBarOuter);
    container.appendChild(progressContainer);
  }
  showLoadingState() {
    if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.label) {
      this.addLabelShortcut([{
        value: '',
        label: 'Loading labels...'
      }]);
    }
    if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.milestone) {
      this.addMilestoneShortcut();
    }
    if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.assign) {
      this.addAssignShortcut();
    }
    if (this.commentInput) {
      this.commentInput.disabled = true;
      this.commentInput.style.backgroundColor = '#f9f9f9';
    }
  }
  hideLoadingState() {
    const statusEl = document.getElementById('comment-status');
    if (statusEl) {
      const count = this.selectedIssues.length;
      if (count > 0) {
        statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
        statusEl.style.color = '#28a745';
        statusEl.style.backgroundColor = '#f8f9fa';
        statusEl.style.border = '1px solid #e9ecef';
      } else {
        statusEl.textContent = 'Select issues to add comments.';
        statusEl.style.color = '#666';
        statusEl.style.backgroundColor = '#f8f9fa';
        statusEl.style.border = '1px solid #e9ecef';
      }
    }
    const commentInput = document.getElementById('issue-comment-input');
    if (commentInput) {
      commentInput.disabled = false;
      commentInput.style.opacity = '1';
      commentInput.style.cursor = 'text';
    }
    const buttons = document.querySelectorAll('.api-section button');
    buttons.forEach(button => {
      button.disabled = false;
      button.style.opacity = '1';
      button.style.cursor = 'pointer';
    });
  }
  async submitComments() {
    if (!this.commentInput) {
      this.notification.error('Comment input not found');
      return;
    }
    const progressContainer = document.getElementById('comment-progress-container');
    const progressBar = document.getElementById('comment-progress-bar');
    const progressLabel = document.getElementById('comment-progress-label');
    if (this.selectedIssues.length === 0) {
      this.notification.error('No issues selected');
      return;
    }
    const comment = this.commentInput.value.trim();
    if (!comment) {
      this.notification.error('Comment cannot be empty');
      return;
    }
    let fullUILoadingScreen;
    if (this.uiManager && this.uiManager.addLoadingScreen) {
      const mainContainer = document.getElementById('assignee-time-summary');
      if (mainContainer) {
        const containerPosition = window.getComputedStyle(mainContainer).position;
        if (containerPosition === 'static') {
          mainContainer.style.position = 'relative';
          mainContainer.dataset.originalPosition = containerPosition;
        }
        fullUILoadingScreen = this.uiManager.addLoadingScreen(mainContainer, 'comment-submit', `Sending comments to ${this.selectedIssues.length} issues...`);
      }
    }
    if (progressContainer) {
      progressContainer.style.display = 'block';
      progressContainer.style.position = 'absolute';
      progressContainer.style.left = 0;
      progressContainer.style.right = 0;
      progressContainer.style.bottom = 0;
      progressContainer.style.zIndex = 102;
    }
    if (progressBar) {
      progressBar.style.width = '0%';
    }
    const submitBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent && b.textContent.includes('Send'));
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.style.opacity = '0.7';
      submitBtn.style.cursor = 'not-allowed';
    }
    let successCount = 0;
    let failCount = 0;
    const gitlabApi = this.gitlabApi || window.gitlabApi || this.uiManager && this.uiManager.gitlabApi;
    if (!gitlabApi) {
      this.notification.error('GitLab API not available');
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.style.opacity = '1';
        submitBtn.style.cursor = 'pointer';
      }
      if (progressContainer) {
        progressContainer.style.display = 'none';
      }
      if (this.uiManager && this.uiManager.removeLoadingScreen && fullUILoadingScreen) {
        this.uiManager.removeLoadingScreen('comment-submit');
      }
      return;
    }
    for (let i = 0; i < this.selectedIssues.length; i++) {
      const issue = this.selectedIssues[i];
      if (!issue) {
        failCount++;
        continue;
      }
      const progress = Math.round(i / this.selectedIssues.length * 100);
      if (progressBar) {
        progressBar.style.width = `${progress}%`;
      }
      if (progressLabel) {
        progressLabel.textContent = `Processing ${i + 1} of ${this.selectedIssues.length} issues...`;
      }
      if (this.uiManager && this.uiManager.updateLoadingMessage) {
        this.uiManager.updateLoadingMessage('comment-submit', `Sending comment to issue #${issue.iid || i + 1} (${i + 1}/${this.selectedIssues.length})...`);
      }
      try {
        await gitlabApi.addComment(issue, comment);
        successCount++;
      } catch (error) {
        console.error(`Failed to add comment to issue #${issue.iid}:`, error);
        failCount++;
      }
    }
    if (progressBar) {
      progressBar.style.width = '100%';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.style.opacity = '1';
      submitBtn.style.cursor = 'pointer';
    }
    if (successCount === this.selectedIssues.length) {
      this.notification.success(`Added comment to ${successCount} issues`);
      if (this.commentInput) {
        this.commentInput.value = '';
      }
      let that = this;
      this.refreshBoard().then(function () {
        progressContainer.style.display = 'none';
        that.clearSelectedIssues();
        that.uiManager.issueSelector.exitSelectionMode();
        that.uiManager.removeLoadingScreen('comment-submit');
      });
    } else {
      if (successCount > 0) {
        this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);
        this.refreshBoard().then(function () {
          progressContainer.style.display = 'none';
          that.clearSelectedIssues();
          that.uiManager.issueSelector.exitSelectionMode();
          that.uiManager.removeLoadingScreen('comment-submit');
        });
      } else {
        this.notification.error(`Failed to add comments to all ${failCount} issues`);
      }
      if (progressBar) {
        progressBar.style.backgroundColor = successCount > 0 ? '#ff9900' : '#dc3545';
      }
    }
  }
  addLabelShortcut(customLabels) {
    if (!this.commandShortcuts) return;
    try {
      let currentValue = null;
      if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label'] && this.commandShortcuts.shortcuts['label'].dropdown) {
        currentValue = this.commandShortcuts.shortcuts['label'].dropdown.value;
      }
      let labelItems;
      if (customLabels) {
        labelItems = customLabels;
      } else if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
        labelItems = [{
          value: '',
          label: 'Add Label'
        }];
        const labels = this.labelManager.filteredLabels.map(label => ({
          value: label.name,
          label: label.name
        }));
        labelItems = labelItems.concat(labels);
        labelItems.push({
          value: 'custom',
          label: 'Custom...'
        });
      } else {
        try {
          const whitelist = getLabelWhitelist();
          if (whitelist && whitelist.length > 0) {
            labelItems = [{
              value: '',
              label: 'Add Label'
            }];
            const whitelistItems = whitelist.map(term => ({
              value: term,
              label: term
            }));
            labelItems = labelItems.concat(whitelistItems);
            labelItems.push({
              value: 'custom',
              label: 'Custom...'
            });
          } else {
            labelItems = this.getFallbackLabels();
          }
        } catch (e) {
          console.error('Error getting label whitelist:', e);
          labelItems = this.getFallbackLabels();
        }
      }
      if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label']) {
        this.commandShortcuts.removeShortcut('label');
      }
      this.commandShortcuts.addCustomShortcut({
        type: 'label',
        label: '/label',
        items: labelItems,
        toggleMode: true,
        onSelect: (value, mode) => {
          if (!value) return;
          if (value === 'custom') {
            const customLabel = prompt('Enter custom label name:');
            if (!customLabel) return;
            value = customLabel;
          }
          const textarea = document.getElementById('issue-comment-input');
          if (!textarea) return;
          let labelText;
          if (mode === 'remove') {
            labelText = `/unlabel ~"${value}"`;
          } else {
            labelText = `/label ~"${value}"`;
          }
          this.insertTextAtCursor(textarea, labelText);
          if (mode === 'remove') {
            this.notification.info(`Label removal command added: ${value}`);
          } else {
            this.notification.info(`Label added: ${value}`);
          }
        }
      });
      if (currentValue && this.commandShortcuts.shortcuts['label'] && this.commandShortcuts.shortcuts['label'].dropdown) {
        this.commandShortcuts.shortcuts['label'].dropdown.value = currentValue;
      }
    } catch (e) {
      console.error('Error adding label shortcut:', e);
    }
  }
  async refreshBoard() {
    try {
      const boardLists = document.querySelectorAll('.board-list-component');
      const refetchPromises = [];
      for (const list of boardLists) {
        if (list.__vue__ && list.__vue__.$apollo && list.__vue__.$apollo.queries.currentList) {
          const refetchPromise = list.__vue__.$apollo.queries.currentList.refetch();
          refetchPromises.push(refetchPromise);
        }
      }
      await Promise.all(refetchPromises);
      if (window.uiManager && window.uiManager.issueSelector) {
        window.uiManager.issueSelector.applyOverflowFixes();
      }
      if (typeof window.updateSummary === 'function') {
        window.updateSummary(true);
      }
      return true;
    } catch (error) {
      console.error("Error refreshing boards:", error);
      return false;
    }
  }
}

// File: lib/ui/views/StatsView.js
window.StatsView = class StatsView {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.notification = null;
    try {
      if (typeof Notification === 'function') {
        this.notification = new Notification({
          position: 'bottom-right',
          duration: 3000
        });
      }
    } catch (e) {
      console.error('Error initializing notification:', e);
    }
  }
  render() {
    const statsContent = document.getElementById('stats-content');
    if (!statsContent) return;
    statsContent.innerHTML = '';
    const comingSoonContainer = document.createElement('div');
    comingSoonContainer.style.display = 'flex';
    comingSoonContainer.style.flexDirection = 'column';
    comingSoonContainer.style.alignItems = 'center';
    comingSoonContainer.style.justifyContent = 'center';
    comingSoonContainer.style.height = '100%';
    comingSoonContainer.style.padding = '40px 20px';
    comingSoonContainer.style.textAlign = 'center';
    const soonIcon = document.createElement('div');
    soonIcon.innerHTML = '🔍';
    soonIcon.style.fontSize = '48px';
    soonIcon.style.marginBottom = '20px';
    const soonTitle = document.createElement('h3');
    soonTitle.textContent = 'Statistics Coming Soon';
    soonTitle.style.marginBottom = '15px';
    soonTitle.style.color = '#1f75cb';
    const soonDesc = document.createElement('p');
    soonDesc.textContent = 'Detailed team and individual performance statistics will be available here soon.';
    soonDesc.style.color = '#666';
    soonDesc.style.maxWidth = '500px';
    comingSoonContainer.appendChild(soonIcon);
    comingSoonContainer.appendChild(soonTitle);
    comingSoonContainer.appendChild(soonDesc);
    statsContent.appendChild(comingSoonContainer);
    if (this.uiManager && this.uiManager.removeLoadingScreen) {
      this.uiManager.removeLoadingScreen('stats-tab');
    }
  }
}

// File: lib/ui/UIManager.js
window.UIManager = class UIManager {
  constructor() {
    this.gitlabApi = window.gitlabApi;
    this.container = null;
    this.contentWrapper = null;
    this.headerDiv = null;
    this.header = null;
    this.recalculateBtn = null;
    this.collapseBtn = null;
    this.boardStats = null;
    this.initializeManagers();
    this.tabManager = new TabManager(this);
    this.summaryView = new SummaryView(this);
    this.boardsView = new BoardsView(this);
    this.bulkCommentsView = new BulkCommentsView(this);
    this.sprintManagementView = new SprintManagementView(this);
    this.statsView = new StatsView(this);
    this.issueSelector = new IssueSelector({
      uiManager: this,
      onSelectionChange: selectedIssues => {
        if (this.bulkCommentsView) {
          this.bulkCommentsView.setSelectedIssues(selectedIssues);
        }
      }
    });
  }
  initialize(attachmentElement = document.body) {
    if (document.getElementById('assignee-time-summary')) {
      this.container = document.getElementById('assignee-time-summary');
      this.contentWrapper = document.getElementById('assignee-time-summary-wrapper');
      this.container.style.position = 'relative';
      return;
    }
    this.container = document.createElement('div');
    this.container.id = 'assignee-time-summary';
    this.container.style.position = 'fixed';
    this.container.style.bottom = '15px';
    this.container.style.right = '15px';
    this.container.style.backgroundColor = 'white';
    this.container.style.border = '1px solid #ddd';
    this.container.style.borderRadius = '4px';
    this.container.style.padding = '10px';
    this.container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    this.container.style.zIndex = '100';
    this.container.style.maxHeight = '80vh';
    this.container.style.overflow = 'hidden';
    this.container.style.fontSize = '14px';
    this.container.style.width = '400px';
    this.container.style.transition = 'height 0.3s ease-in-out';
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.id = 'assignee-time-summary-wrapper';
    this.contentWrapper.style.display = 'block';
    this.contentWrapper.style.maxHeight = '70vh';
    this.contentWrapper.style.minHeight = '350px';
    this.contentWrapper.style.overflowY = 'auto';
    this.contentWrapper.style.position = 'relative';
    this.createHeader();
    this.createBoardStats();
    this.tabManager.initialize(this.contentWrapper);
    this.ensureTabContentHeight();
    this.container.appendChild(this.contentWrapper);
    attachmentElement.appendChild(this.container);
    this.attachmentElement = attachmentElement;
    this.container.addEventListener('click', e => {
      if (this.issueSelector && this.issueSelector.isSelectingIssue && !e.target.classList.contains('card-selection-overlay') && !e.target.classList.contains('selection-badge') && !e.target.closest('#bulk-comments-content button') && !e.target.closest('#issue-comment-input') && !e.target.closest('#shortcuts-wrapper') && !e.target.closest('#selected-issues-list') && !e.target.closest('#selection-cancel-button')) {
        this.issueSelector.exitSelectionMode();
      }
    });
    this.initializeKeyboardShortcuts();
    try {
      const isCollapsed = loadFromStorage('gitlabTimeSummaryCollapsed', 'false') === 'true';
      if (isCollapsed) {
        this.contentWrapper.style.display = 'none';
        if (this.collapseBtn) {
          this.collapseBtn.textContent = '▲';
        }
        this.container.style.height = 'auto';
      }
    } catch (e) {
      console.warn('Error loading collapsed state:', e);
    }
  }
  initializeManagers() {
    try {
      this.labelManager = new LabelManager({
        gitlabApi: this.gitlabApi,
        onLabelsLoaded: labels => {
          if (this.bulkCommentsView && this.bulkCommentsView.addLabelShortcut) {
            this.bulkCommentsView.addLabelShortcut();
          }
        }
      });
    } catch (e) {
      console.error('Error initializing LabelManager:', e);
      this.labelManager = {
        filteredLabels: [],
        fetchAllLabels: () => Promise.resolve([]),
        isLabelInWhitelist: () => false
      };
    }
    try {
      this.assigneeManager = new AssigneeManager({
        gitlabApi: this.gitlabApi,
        onAssigneesChange: assignees => {
          if (this.bulkCommentsView && this.bulkCommentsView.addAssignShortcut) {
            this.bulkCommentsView.addAssignShortcut();
          }
        }
      });
    } catch (e) {
      console.error('Error initializing AssigneeManager:', e);
      this.assigneeManager = {
        getAssigneeWhitelist: () => []
      };
    }
    try {
      this.milestoneManager = new MilestoneManager({
        gitlabApi: this.gitlabApi,
        onMilestonesLoaded: milestones => {}
      });
    } catch (e) {
      console.error('Error initializing MilestoneManager:', e);
      this.milestoneManager = {
        milestones: [],
        fetchMilestones: () => Promise.resolve([])
      };
    }
  }
  createHeader() {
    this.headerDiv = document.createElement('div');
    this.headerDiv.style.display = 'flex';
    this.headerDiv.style.justifyContent = 'space-between';
    this.headerDiv.style.alignItems = 'center';
    this.headerDiv.style.marginBottom = '5px';
    this.headerDiv.style.cursor = 'pointer';
    this.headerDiv.addEventListener('click', e => {
      if (e.target === this.recalculateBtn || e.target === this.collapseBtn || e.target === this.settingsBtn) {
        return;
      }
      this.toggleCollapse();
    });
    this.header = document.createElement('h3');
    this.header.id = 'assignee-time-summary-header';
    this.header.textContent = 'Summary';
    this.header.style.margin = '0';
    this.header.style.fontSize = '16px';
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '5px';
    this.recalculateBtn = document.createElement('button');
    this.recalculateBtn.textContent = '🔄';
    this.recalculateBtn.title = 'Recalculate';
    this.recalculateBtn.style.padding = '3px 6px';
    this.recalculateBtn.style.fontSize = '12px';
    this.recalculateBtn.style.backgroundColor = '#1f75cb';
    this.recalculateBtn.style.color = 'white';
    this.recalculateBtn.style.border = 'none';
    this.recalculateBtn.style.borderRadius = '3px';
    this.recalculateBtn.style.cursor = 'pointer';
    this.recalculateBtn.onclick = e => {
      e.stopPropagation();
      if (typeof window.updateSummary === 'function') {
        window.updateSummary(true);
      }
      this.recalculateBtn.textContent = '✓';
      setTimeout(() => {
        this.recalculateBtn.textContent = '🔄';
      }, 1000);
    };
    this.settingsBtn = document.createElement('button');
    this.settingsBtn.textContent = '⚙️';
    this.settingsBtn.title = 'Settings';
    this.settingsBtn.style.padding = '3px 6px';
    this.settingsBtn.style.fontSize = '12px';
    this.settingsBtn.style.backgroundColor = '#6c757d';
    this.settingsBtn.style.color = 'white';
    this.settingsBtn.style.border = 'none';
    this.settingsBtn.style.borderRadius = '3px';
    this.settingsBtn.style.cursor = 'pointer';
    this.settingsBtn.onclick = e => {
      e.stopPropagation();
      this.openSettings();
    };
    this.collapseBtn = document.createElement('button');
    this.collapseBtn.textContent = '▼';
    this.collapseBtn.title = 'Collapse/Expand';
    this.collapseBtn.style.padding = '3px 6px';
    this.collapseBtn.style.fontSize = '12px';
    this.collapseBtn.style.backgroundColor = '#777';
    this.collapseBtn.style.color = 'white';
    this.collapseBtn.style.border = 'none';
    this.collapseBtn.style.borderRadius = '3px';
    this.collapseBtn.style.cursor = 'pointer';
    this.collapseBtn.onclick = e => {
      e.stopPropagation();
      this.toggleCollapse();
    };
    buttonContainer.appendChild(this.recalculateBtn);
    buttonContainer.appendChild(this.settingsBtn);
    buttonContainer.appendChild(this.collapseBtn);
    this.headerDiv.appendChild(this.header);
    this.headerDiv.appendChild(buttonContainer);
    this.container.appendChild(this.headerDiv);
  }
  createBoardStats() {
    const existingStats = document.getElementById('board-stats-summary');
    if (existingStats) {
      this.boardStats = existingStats;
      return;
    }
    this.boardStats = document.createElement('div');
    this.boardStats.id = 'board-stats-summary';
    this.boardStats.style.fontSize = '13px';
    this.boardStats.style.color = '#555';
    this.boardStats.style.marginBottom = '10px';
    this.boardStats.style.display = 'flex';
    this.boardStats.style.justifyContent = 'space-between';
    this.boardStats.textContent = 'Loading board statistics...';
    this.container.appendChild(this.boardStats);
  }
  updateBoardStats(stats) {
    if (!this.boardStats) return;
    const totalCards = stats?.totalCards || 0;
    const withTimeCards = stats?.withTimeCards || 0;
    const closedCards = stats?.closedCards || 0;
    this.boardStats.innerHTML = '';
    const totalStats = document.createElement('div');
    totalStats.style.display = 'flex';
    totalStats.style.gap = '8px';
    const totalText = document.createElement('span');
    totalText.textContent = `Total: ${totalCards} cards`;
    totalStats.appendChild(totalText);
    const closedStats = document.createElement('div');
    closedStats.textContent = `Closed: ${closedCards} cards`;
    closedStats.style.color = '#28a745';
    this.boardStats.appendChild(totalStats);
    this.boardStats.appendChild(closedStats);
  }
  toggleCollapse() {
    if (!this.contentWrapper || !this.collapseBtn) return;
    try {
      if (this.contentWrapper.style.display === 'none') {
        this.contentWrapper.style.display = 'block';
        this.collapseBtn.textContent = '▼';
        this.container.style.height = '';
        saveToStorage('gitlabTimeSummaryCollapsed', 'false');
      } else {
        this.contentWrapper.style.display = 'none';
        this.collapseBtn.textContent = '▲';
        this.container.style.height = 'auto';
        saveToStorage('gitlabTimeSummaryCollapsed', 'true');
      }
    } catch (e) {
      console.error('Error toggling collapse state:', e);
    }
  }
  openSettings() {
    try {
      if (typeof window.SettingsManager === 'function') {
        const settingsManager = new window.SettingsManager({
          labelManager: this.labelManager,
          assigneeManager: this.assigneeManager,
          gitlabApi: this.gitlabApi,
          uiManager: this,
          onSettingsChanged: type => {
            if (type === 'all' || type === 'labels') {
              if (this.bulkCommentsView) {
                this.bulkCommentsView.addLabelShortcut();
              }
            }
            if (type === 'all' || type === 'assignees') {
              if (this.bulkCommentsView) {
                this.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
        settingsManager.openSettingsModal();
      } else {
        console.error('SettingsManager not available');
      }
    } catch (e) {
      console.error('Error opening settings:', e);
    }
  }
  updateHeader(text) {
    if (this.header) {
      this.header.innerHTML = text;
    }
  }
  addLoadingScreen(container, name, message = 'Loading...') {
    if (typeof container === 'string') {
      container = document.getElementById(container);
    }
    if (!container) {
      console.warn(`Container not found for loading screen: ${name}`);
      return null;
    }
    const existingLoader = document.getElementById(`loading-screen-${name}`);
    if (existingLoader) {
      const messageEl = existingLoader.querySelector('.loading-message');
      if (messageEl) {
        messageEl.textContent = message;
      }
      return existingLoader;
    }
    const loadingScreen = document.createElement('div');
    loadingScreen.id = `loading-screen-${name}`;
    loadingScreen.className = 'gitlab-helper-loading-screen';
    loadingScreen.style.position = 'absolute';
    loadingScreen.style.top = '0';
    loadingScreen.style.left = '0';
    loadingScreen.style.width = '100%';
    loadingScreen.style.height = '100%';
    loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    loadingScreen.style.display = 'flex';
    loadingScreen.style.flexDirection = 'column';
    loadingScreen.style.justifyContent = 'center';
    loadingScreen.style.alignItems = 'center';
    loadingScreen.style.zIndex = '101';
    loadingScreen.style.transition = 'opacity 0.3s ease';
    const spinner = document.createElement('div');
    spinner.className = 'loading-spinner';
    spinner.style.width = '40px';
    spinner.style.height = '40px';
    spinner.style.borderRadius = '50%';
    spinner.style.border = '3px solid rgba(255, 255, 255, 0.2)';
    spinner.style.borderTopColor = '#ffffff';
    spinner.style.animation = 'gitlab-helper-spin 1s linear infinite';
    const messageEl = document.createElement('div');
    messageEl.className = 'loading-message';
    messageEl.textContent = message;
    messageEl.style.marginTop = '15px';
    messageEl.style.fontWeight = 'bold';
    messageEl.style.color = '#ffffff';
    messageEl.style.fontSize = '14px';
    messageEl.style.textAlign = 'center';
    messageEl.style.padding = '0 20px';
    messageEl.style.maxWidth = '90%';
    if (!document.getElementById('gitlab-helper-loading-styles')) {
      const styleEl = document.createElement('style');
      styleEl.id = 'gitlab-helper-loading-styles';
      styleEl.textContent = `
        @keyframes gitlab-helper-spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        @keyframes gitlab-helper-pulse {
            0% { opacity: 0.6; }
            50% { opacity: 1; }
            100% { opacity: 0.6; }
        }
    `;
      document.head.appendChild(styleEl);
    }
    loadingScreen.appendChild(spinner);
    loadingScreen.appendChild(messageEl);
    const containerPosition = window.getComputedStyle(container).position;
    if (containerPosition === 'static' || !containerPosition) {
      container.style.position = 'relative';
      container.dataset.originalPosition = containerPosition;
    }
    container.appendChild(loadingScreen);
    messageEl.style.animation = 'gitlab-helper-pulse 2s ease infinite';
    return loadingScreen;
  }
  removeLoadingScreen(name, fadeOut = true) {
    const loadingScreen = document.getElementById(`loading-screen-${name}`);
    if (!loadingScreen) return;
    const container = loadingScreen.parentNode;
    if (fadeOut) {
      loadingScreen.style.opacity = '0';
      setTimeout(() => {
        if (loadingScreen.parentNode) {
          loadingScreen.parentNode.removeChild(loadingScreen);
        }
        if (container && container.dataset.originalPosition) {
          container.style.position = container.dataset.originalPosition;
          delete container.dataset.originalPosition;
        }
      }, 300);
    } else {
      loadingScreen.parentNode.removeChild(loadingScreen);
      if (container && container.dataset.originalPosition) {
        container.style.position = container.dataset.originalPosition;
        delete container.dataset.originalPosition;
      }
    }
  }
  updateLoadingMessage(name, message) {
    const loadingScreen = document.getElementById(`loading-screen-${name}`);
    if (!loadingScreen) return;
    const messageEl = loadingScreen.querySelector('.loading-message');
    if (messageEl) {
      messageEl.textContent = message;
    }
  }
  ensureTabContentHeight() {
    const tabContents = [document.getElementById('assignee-time-summary-content'), document.getElementById('boards-time-summary-content'), document.getElementById('bulk-comments-content')];
    const wrapper = document.getElementById('assignee-time-summary-wrapper');
    const headerDiv = this.headerDiv || document.querySelector('#assignee-time-summary > div:first-child');
    if (!wrapper || !headerDiv) {
      console.warn('Could not find wrapper or header elements for height calculation');
      tabContents.forEach(content => {
        if (content) {
          content.style.minHeight = '300px';
          content.style.position = 'relative';
        }
      });
      return;
    }
    const headerHeight = headerDiv.offsetHeight;
    const tabNavHeight = 36;
    const statsHeight = this.boardStats ? this.boardStats.offsetHeight : 0;
    const subtractHeight = headerHeight + tabNavHeight + statsHeight + 20;
    tabContents.forEach(content => {
      if (content) {
        content.style.minHeight = `calc(100% - ${subtractHeight}px)`;
        content.style.height = `calc(100% - ${subtractHeight}px)`;
        content.style.position = 'relative';
      }
    });
  }
  initializeKeyboardShortcuts() {
    try {
      this.toggleShortcut = getToggleShortcut();
      this.keyboardHandler = this.createKeyboardHandler();
      document.addEventListener('keydown', this.keyboardHandler);
    } catch (error) {
      console.error('Error initializing keyboard shortcuts:', error);
    }
  }
  createKeyboardHandler() {
    return e => {
      if (isActiveInputElement(e.target)) {
        return;
      }
      if (e.ctrlKey || e.altKey || e.shiftKey || e.metaKey) {
        return;
      }
      if (e.key.toLowerCase() === this.toggleShortcut.toLowerCase()) {
        this.toggleCollapse();
        e.preventDefault();
      }
    };
  }
  updateKeyboardShortcut(newShortcut) {
    if (!newShortcut || typeof newShortcut !== 'string' || newShortcut.length !== 1) {
      console.warn('Invalid shortcut provided:', newShortcut);
      return;
    }
    try {
      if (this.keyboardHandler) {
        document.removeEventListener('keydown', this.keyboardHandler);
      }
      this.toggleShortcut = newShortcut;
      this.keyboardHandler = this.createKeyboardHandler();
      document.addEventListener('keydown', this.keyboardHandler);
    } catch (error) {
      console.error('Error updating keyboard shortcut:', error);
    }
  }
}

// File: lib/ui/index.js
window.uiManager = window.uiManager || new UIManager();
window.createSummaryContainer = function createSummaryContainer() {
  uiManager.initialize();
  return uiManager.container;
}
function createUIManager() {
  window.uiManager = window.uiManager || new UIManager();
  if (uiManager.settingsBtn) {
    uiManager.settingsBtn.onclick = e => {
      e.stopPropagation();
      if (uiManager.bulkCommentsView && uiManager.bulkCommentsView.settingsManager) {
        uiManager.bulkCommentsView.settingsManager.openSettingsModal();
      } else if (window.settingsManager) {
        window.settingsManager.openSettingsModal();
      } else {
        const settingsManager = new SettingsManager({
          labelManager: uiManager.labelManager,
          assigneeManager: uiManager.assigneeManager,
          gitlabApi: window.gitlabApi || uiManager.gitlabApi,
          onSettingsChanged: type => {
            if (type === 'all' || type === 'labels') {
              if (uiManager.bulkCommentsView) {
                uiManager.bulkCommentsView.addLabelShortcut();
              }
            }
            if (type === 'all' || type === 'assignees') {
              if (uiManager.bulkCommentsView) {
                uiManager.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
        if (uiManager.bulkCommentsView) {
          uiManager.bulkCommentsView.settingsManager = settingsManager;
        }
        window.settingsManager = settingsManager;
        settingsManager.openSettingsModal();
      }
    };
  }
  return uiManager;
}
window.updateSummaryTab = async function(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
  if (typeof processBoards === 'function') {
    const {
      closedBoardCards
    } = processBoards();
    uiManager.updateBoardStats({
      totalCards: cardsProcessed,
      withTimeCards: cardsWithTime,
      closedCards: closedBoardCards || 0
    });
  }
  await uiManager.summaryView.render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData);
}
window.updateBoardsTab = function updateBoardsTab(boardData, boardAssigneeData) {
  uiManager.boardsView.render(boardData, boardAssigneeData);
}
window.updateBulkCommentsTab = function updateBulkCommentsTab() {
  uiManager.bulkCommentsView.render();
}
window.renderHistory = function renderHistory() {
  uiManager.historyView.render();
}
window.addEventListener('scroll', () => {
  if (uiManager && uiManager.issueSelector) {
    if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
      uiManager.issueSelector.repositionOverlays();
    }
  }
});
window.addEventListener('resize', () => {
  if (uiManager && uiManager.issueSelector) {
    if (typeof uiManager.issueSelector.repositionOverlays === 'function') {
      uiManager.issueSelector.repositionOverlays();
    }
  }
});
window.uiManager = uiManager;
window.updateSummaryTab = updateSummaryTab;
window.updateBoardsTab = updateBoardsTab;
window.updateBulkCommentsTab = updateBulkCommentsTab;
window.renderHistory = renderHistory;
window.createSummaryContainer = createSummaryContainer;
window.SettingsManager = SettingsManager;
setTimeout(() => {
  const settingsBtn = document.querySelector('#assignee-time-summary button[title="Settings"]');
  if (settingsBtn) {
    settingsBtn.onclick = e => {
      e.stopPropagation();
      try {
        const settingsManager = new SettingsManager({
          labelManager: window.uiManager?.labelManager,
          assigneeManager: window.uiManager?.assigneeManager,
          gitlabApi: window.gitlabApi,
          onSettingsChanged: type => {
            if (window.uiManager?.bulkCommentsView) {
              if (type === 'all' || type === 'labels') {
                window.uiManager.bulkCommentsView.addLabelShortcut();
              }
              if (type === 'all' || type === 'assignees') {
                window.uiManager.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
        settingsManager.openSettingsModal();
      } catch (error) {
        console.error('Error creating settings manager:', error);
      }
    };
  } else {
    console.warn('Settings button not found');
  }
}, 2000);

// File: lib/index.js
let linkedItemsManager = null;
let labelDisplayManager = null;

function initializeLinkedItemsManager() {
  if (!linkedItemsManager) {
    linkedItemsManager = new LinkedItemsManager({
      uiManager: window.uiManager
    });
    window.linkedItemsManager = linkedItemsManager;
    linkedItemsManager.initialize();
  }
}

function toggleLinkedItems() {
  if (!linkedItemsManager) {
    initializeLinkedItemsManager();
  } else {
    if (linkedItemsManager.initialized) {
      linkedItemsManager.cleanup();
    } else {
      linkedItemsManager.initialize();
    }
  }
}

function initializeLabelDisplayManager() {
  if (!labelDisplayManager) {
    labelDisplayManager = new LabelDisplayManager({
      uiManager: window.uiManager
    });
    window.labelDisplayManager = labelDisplayManager;
    labelDisplayManager.initialize();
  }
}

function toggleHideLabels() {
  if (!labelDisplayManager) {
    initializeLabelDisplayManager();
    initializeLinkedItemsManager();
  } else {
    if (labelDisplayManager.initialized) {
      labelDisplayManager.cleanup();
      linkedItemsManager.repositionDropdowns()
    } else {
      labelDisplayManager.initialize();
      linkedItemsManager.repositionDropdowns()
    }
  }
}

window.toggleLinkedItems = toggleLinkedItems;
window.toggleHideLabels = toggleHideLabels;

var gitlabApi = window.gitlabApi || new GitLabAPI();

function createUIManager(attachmentElement = document.body) {
  if (!window.gitlabApi) {
    try {
      window.gitlabApi = new GitLabAPI();
    } catch (e) {
      console.error('Error creating GitLabAPI instance:', e);
    }
  }
  try {
    window.uiManager = window.uiManager || new UIManager();
    uiManager.initialize(attachmentElement);
    window.uiManager = uiManager;
    if (!window.settingsManager && typeof SettingsManager === 'function') {
      try {
        window.settingsManager = new SettingsManager({
          labelManager: uiManager?.labelManager,
          assigneeManager: uiManager?.assigneeManager,
          gitlabApi: window.gitlabApi,
          onSettingsChanged: type => {
            if (uiManager?.bulkCommentsView) {
              if (type === 'all' || type === 'labels') {
                uiManager.bulkCommentsView.addLabelShortcut();
              }
              if (type === 'all' || type === 'assignees') {
                uiManager.bulkCommentsView.addAssignShortcut();
              }
            }
          }
        });
      } catch (e) {
        console.error('Error creating SettingsManager:', e);
      }
    }
    return uiManager;
  } catch (e) {
    console.error('Error creating UI Manager:', e);
    return null;
  }
}

let isInitialized = false;
function checkAndInit() {
  if (isInitialized) {
    return;
  }
  if (window.location.href.includes('/boards')) {
    waitForBoardsElement().then(boardsElement => {
      const uiManager = createUIManager(boardsElement);
      if (!window.historyManager) {
        try {
          window.historyManager = new HistoryManager();
        } catch (e) {
          console.error('Error initializing HistoryManager:', e);
        }
      }
      isInitialized = true;
      initializeLabelDisplayManager();
      initializeLinkedItemsManager();
      waitForBoards();
    }).catch(error => {
      console.error('Error initializing UI:', error);
      const uiManager = createUIManager(document.body);
      if (!window.historyManager) {
        try {
          window.historyManager = new HistoryManager();
        } catch (e) {
          console.error('Error initializing HistoryManager:', e);
        }
      }
      isInitialized = true;
      initializeLabelDisplayManager();
      initializeLinkedItemsManager();
      waitForBoards();
    });
  }
}
function waitForBoardsElement(maxAttempts = 30, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const checkForElement = () => {
      attempts++;
      const boardsElement = document.querySelector('[data-testid="boards-list"]');
      if (boardsElement) {
        resolve(boardsElement);
        return;
      }
      const fallbackSelectors = ['.boards-list', '.board-list-component', '.boards-app'];
      for (const selector of fallbackSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          resolve(element);
          return;
        }
      }
      if (attempts >= maxAttempts) {
        console.warn('Maximum attempts reached, attaching to body as fallback');
        resolve(document.body);
        return;
      }
      setTimeout(checkForElement, interval);
    };
    checkForElement();
  });
}
function updateSummary(forceHistoryUpdate = false) {
  if (!window.uiManager) {
    console.warn('UI Manager not initialized, cannot update summary');
    return;
  }
  let boardFullyLoaded = false;
  let loadingTimeout;
  clearTimeout(loadingTimeout);
  try {
    const result = processBoards();
    const {
      assigneeTimeMap,
      boardData,
      boardAssigneeData,
      totalEstimate,
      cardsProcessed,
      cardsWithTime,
      currentMilestone,
      closedBoardCards
    } = result;
    clearTimeout(loadingTimeout);
    loadingTimeout = setTimeout(() => {
      boardFullyLoaded = true;
    }, 3000);
    window.uiManager.updateBoardStats({
      totalCards: cardsProcessed,
      withTimeCards: cardsWithTime,
      closedCards: closedBoardCards || 0
    });
    const totalHours = totalEstimate / 3600;
    window.uiManager.updateHeader(`Summary ${totalHours}h`);
    const validBoardData = boardData || {};
    const validBoardAssigneeData = boardAssigneeData || {};
    if (window.uiManager.summaryView) {
      window.uiManager.summaryView.render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, validBoardData, validBoardAssigneeData);
    }
    if (window.uiManager.boardsView) {
      window.uiManager.boardsView.render(validBoardData, validBoardAssigneeData);
    }
    const sprintManagementContent = document.getElementById('sprint-management-content');
    if (sprintManagementContent && sprintManagementContent.style.display === 'block' && window.uiManager.sprintManagementView) {
      window.uiManager.sprintManagementView.render();
    }
    const bulkCommentsContent = document.getElementById('bulk-comments-content');
    if (bulkCommentsContent && bulkCommentsContent.style.display === 'block' && window.uiManager.bulkCommentsView) {
      window.uiManager.bulkCommentsView.render();
    }
  } catch (e) {
    console.error('Error updating summary:', e);
  }
}
function addBoardChangeListeners() {
  try {
    const boardLists = document.querySelectorAll('.board-list');
    boardLists.forEach(boardList => {
      const boardObserver = new MutationObserver(() => {
        updateSummary();
      });
      boardObserver.observe(boardList, {
        childList: true,
        subtree: true
      });
    });
  } catch (e) {
    console.error('Error adding board change listeners:', e);
  }
}
function setupSettingsManager(uiManager) {
  if (!window.settingsManager && typeof SettingsManager === 'function') {
    try {
      window.settingsManager = new SettingsManager({
        labelManager: uiManager?.labelManager,
        assigneeManager: uiManager?.assigneeManager,
        gitlabApi: window.gitlabApi,
        onSettingsChanged: type => {
          if (uiManager?.bulkCommentsView) {
            if (type === 'all' || type === 'labels') {
              uiManager.bulkCommentsView.addLabelShortcut();
            }
            if (type === 'all' || type === 'assignees') {
              uiManager.bulkCommentsView.addAssignShortcut();
            }
          }
        }
      });
    } catch (e) {
      console.error('Error creating SettingsManager:', e);
    }
  }
}
function waitForBoards() {
  if (window.boardsInitialized) {
    return;
  }
  let statusDiv = document.getElementById('board-stats-summary');
  if (!statusDiv) {
    statusDiv = document.createElement('div');
    statusDiv.id = 'board-stats-summary';
    statusDiv.style.fontSize = '13px';
    statusDiv.style.color = '#555';
    statusDiv.style.marginBottom = '10px';
    if (window.uiManager?.container) {
      window.uiManager.container.appendChild(statusDiv);
    } else {
      const tempContainer = document.createElement('div');
      tempContainer.id = 'temp-stats-container';
      tempContainer.appendChild(statusDiv);
      document.body.appendChild(tempContainer);
    }
  }
  statusDiv.textContent = 'Waiting for boards to load...';
  let attempts = 0;
  const maxAttempts = 30;
  const boardCheckInterval = setInterval(() => {
    attempts++;
    if (window.linkedItemsManager && !window.linkedItemsManager.initialized) {
      initializeLinkedItemsManager();
    } else if (window.linkedItemsManager && window.linkedItemsManager.initialized) {
      window.linkedItemsManager.refreshDropdowns();
    }
    const boardLists = document.querySelectorAll('.board-list');
    if (boardLists.length >= 3) {
      clearInterval(boardCheckInterval);
      if (statusDiv) {
        statusDiv.textContent = `Found ${boardLists.length} boards, initializing...`;
      }
      setTimeout(() => {
        updateSummary();
        addBoardChangeListeners();
        window.boardsInitialized = true;
      }, 1000);
    } else if (attempts >= maxAttempts) {
      clearInterval(boardCheckInterval);
      if (statusDiv) {
        statusDiv.textContent = `Found ${boardLists.length} boards, continuing anyway...`;
      }
      setTimeout(() => {
        updateSummary();
        addBoardChangeListeners();
        window.boardsInitialized = true;
      }, 1000);
    } else if (boardLists.length > 0 && statusDiv) {
      statusDiv.textContent = `Found ${boardLists.length} boards, waiting for more...`;
    }
  }, 500);
}
checkAndInit();
let lastUrl = window.location.href;
try {
  const urlObserver = new MutationObserver(() => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      setTimeout(checkAndInit, 1000);
    }
  });
  urlObserver.observe(document, {
    subtree: true,
    childList: true
  });
} catch (e) {
  console.error('Error setting up URL observer:', e);
}
window.updateSummary = updateSummary;
window.checkAndInit = checkAndInit;
window.waitForBoards = waitForBoards;
window.SettingsManager = SettingsManager;
window.LabelManager = LabelManager;
window.AssigneeManager = AssigneeManager;
window.addEventListener('scroll', () => {
  if (window.uiManager?.issueSelector) {
    if (typeof window.uiManager.issueSelector.repositionOverlays === 'function') {
      window.uiManager.issueSelector.repositionOverlays();
    }
  }
});
window.addEventListener('resize', () => {
  if (window.uiManager?.issueSelector) {
    if (typeof window.uiManager.issueSelector.repositionOverlays === 'function') {
      window.uiManager.issueSelector.repositionOverlays();
    }
  }
});


// File: main.js (main script content)


(function () {
    'use strict';

    function setupGlobalReferences() {
    }

    

})();

})(window);

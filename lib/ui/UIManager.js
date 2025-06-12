import TabManager from './managers/TabManager';
import SummaryView from './views/SummaryView';
import BoardsView from './views/BoardsView';
import BulkCommentsView from './views/BulkCommentsView';
import SprintManagementView from './views/SprintManagementView';
import StatsView from './views/StatsView';
import IssueSelector from './components/IssueSelector';
import LabelManager from './managers/LabelManager';
import AssigneeManager from './managers/AssigneeManager';
import MilestoneManager from './managers/MilestoneManager';
import { loadFromStorage, saveToStorage } from '../storage/LocalStorage';
import { getToggleShortcut } from '../storage/SettingsStorage';
import { isActiveInputElement } from "../core/Utils";
export default class UIManager {
  constructor() {
    this.gitlabApi = window.gitlabApi;
    this.container = null;
    this.contentWrapper = null;
    this.headerDiv = null;
    this.header = null;
    this.recalculateBtn = null;
    this.collapseBtn = null;
    this.boardStats = null;
    this.versionDisplay = null;
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
      this.updateVersionDisplay();
      return;
    }
    this.container = document.createElement('div');
    this.container.id = 'assignee-time-summary';
    Object.assign(this.container.style, {
      position: 'fixed',
      bottom: '15px',
      right: '15px',
      backgroundColor: 'white',
      border: '1px solid #ddd',
      borderRadius: '4px',
      padding: '10px',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
      zIndex: '100',
      maxHeight: '80vh',
      overflow: 'hidden',
      fontSize: '14px',
      width: '400px',
      transition: 'height 0.3s ease-in-out'
    });
    this.contentWrapper = document.createElement('div');
    this.contentWrapper.id = 'assignee-time-summary-wrapper';
    Object.assign(this.contentWrapper.style, {
      display: 'block',
      maxHeight: '70vh',
      minHeight: '350px',
      overflowY: 'auto',
      position: 'relative'
    });
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
    this.updateVersionDisplay();
    try {
      const isCollapsed = loadFromStorage('gitlabTimeSummaryCollapsed', 'false') === 'true';
      if (isCollapsed) {
        this.contentWrapper.style.display = 'none';
        if (this.collapseBtn) this.collapseBtn.textContent = '▲';
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
    const needsMergeCards = stats?.needsMergeCards || 0;
    const totalClosedCards = closedCards + needsMergeCards;
    this.boardStats.innerHTML = '';
    const totalStats = document.createElement('div');
    totalStats.style.display = 'flex';
    totalStats.style.gap = '8px';
    const totalText = document.createElement('span');
    // Show all cards, not just those with time estimates
    totalText.textContent = `Total: ${totalCards} cards`;
    totalStats.appendChild(totalText);
    const closedStats = document.createElement('div');
    // Show all closed cards, not just those with time estimates
    closedStats.textContent = `Done: ${closedCards} cards`;
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
  updateVersionDisplay() {
    if (!this.versionDisplay) {
      this.versionDisplay = document.createElement('div');
      this.versionDisplay.id = 'gitlab-helper-version';
      this.versionDisplay.style.fontSize = '10px';
      this.versionDisplay.style.color = '#888';
      this.versionDisplay.style.position = 'absolute';
      this.versionDisplay.style.top = '6px'; // Position at the top near the tabs
      this.versionDisplay.style.right = '5px'; // Right position to be next to tab controls
      this.versionDisplay.style.zIndex = '1'; // Ensure it's above other elements

      // Find the tabs container and place the version display after it
      const tabContainer = this.container.querySelector('.tabs-container') ||
          this.container.querySelector('#assignee-time-summary div:nth-child(3)');

      if (tabContainer) {
        tabContainer.style.position = 'relative'; // Ensure relative positioning
        tabContainer.appendChild(this.versionDisplay);
      } else {
        this.container.appendChild(this.versionDisplay);
      }
    }
    const version = window.gitLabHelperVersion || '1.0.0';
    this.versionDisplay.textContent = `v${version}`;
  }
}
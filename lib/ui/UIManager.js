import TabManager from './managers/TabManager';
import SummaryView from './views/SummaryView';
import BoardsView from './views/BoardsView';
import BulkCommentsView from './views/BulkCommentsView';
import SprintManagementView from './views/SprintManagementView';
import IssueSelector from './components/IssueSelector';
import LabelManager from './managers/LabelManager';
import AssigneeManager from './managers/AssigneeManager';
import MilestoneManager from './managers/MilestoneManager';
import {loadFromStorage, saveToStorage} from '../storage/LocalStorage';
import {getToggleShortcut} from '../storage/SettingsStorage';
import {isActiveInputElement} from "../core/Utils";

/**
 * Main UI Manager that coordinates all UI components
 */
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
        this.initializeManagers();
        this.tabManager = new TabManager(this);
        this.summaryView = new SummaryView(this);
        this.boardsView = new BoardsView(this);
        this.bulkCommentsView = new BulkCommentsView(this);
        this.sprintManagementView = new SprintManagementView(this);
        this.issueSelector = new IssueSelector({
            uiManager: this,
            onSelectionChange: (selectedIssues) => {
                if (this.bulkCommentsView) {
                    this.bulkCommentsView.setSelectedIssues(selectedIssues);
                }
            }
        });

    }

    /**
     * Initialize the UI and create the container
     * @param {HTMLElement} attachmentElement - Element to attach the UI to (defaults to document.body)
     */
    initialize(attachmentElement = document.body) {
        if (document.getElementById('assignee-time-summary')) {
            this.container = document.getElementById('assignee-time-summary');
            this.contentWrapper = document.getElementById('assignee-time-summary-wrapper');
            this.container.style.position = 'relative';
            return;
        }
        this.container = document.createElement('div');
        this.container.id = 'assignee-time-summary';
        this.container.style.position = 'fixed'; // Using fixed position
        this.container.style.bottom = '15px'; // Position at bottom-right
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
        this.container.style.width = '400px'; // Increased width from 350px to 400px
        this.container.style.transition = 'height 0.3s ease-in-out';
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'assignee-time-summary-wrapper';
        this.contentWrapper.style.display = 'block';
        this.contentWrapper.style.maxHeight = '70vh';
        this.contentWrapper.style.minHeight = '350px'; // Add minimum height of 350px
        this.contentWrapper.style.overflowY = 'auto';
        this.contentWrapper.style.position = 'relative'; // Ensure content wrapper has position relative
        this.createHeader();
        this.createBoardStats();
        this.tabManager.initialize(this.contentWrapper);
        this.ensureTabContentHeight();
        this.container.appendChild(this.contentWrapper);
        attachmentElement.appendChild(this.container);
        this.attachmentElement = attachmentElement;
        this.container.addEventListener('click', (e) => {
            if (this.issueSelector && this.issueSelector.isSelectingIssue &&
                !e.target.classList.contains('card-selection-overlay') &&
                !e.target.classList.contains('selection-badge') &&
                !e.target.closest('#bulk-comments-content button') &&
                !e.target.closest('#issue-comment-input') &&
                !e.target.closest('#shortcuts-wrapper') &&
                !e.target.closest('#selected-issues-list') &&
                !e.target.closest('#selection-cancel-button')) {
                this.issueSelector.exitSelectionMode();
            }
        });
        // Initialize keyboard shortcuts
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

    /**
     * Initialize managers with error handling
     */
    initializeManagers() {
        try {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
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
                onAssigneesChange: (assignees) => {
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
                onMilestonesLoaded: (milestones) => {
                }
            });
        } catch (e) {
            console.error('Error initializing MilestoneManager:', e);
            this.milestoneManager = {
                milestones: [],
                fetchMilestones: () => Promise.resolve([])
            };
        }
    }

    /**
     * Create header with title and buttons
     */
    createHeader() {
        this.headerDiv = document.createElement('div');
        this.headerDiv.style.display = 'flex';
        this.headerDiv.style.justifyContent = 'space-between';
        this.headerDiv.style.alignItems = 'center';
        this.headerDiv.style.marginBottom = '5px';
        this.headerDiv.style.cursor = 'pointer';
        this.headerDiv.addEventListener('click', (e) => {
            if (e.target === this.recalculateBtn ||
                e.target === this.collapseBtn ||
                e.target === this.settingsBtn) {
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
        this.recalculateBtn.onclick = (e) => {
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
        this.settingsBtn.onclick = (e) => {
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
        this.collapseBtn.onclick = (e) => {
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

    /**
     * Create board stats display
     */
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

    /**
     * Update board statistics display
     * @param {Object} stats - Board statistics data
     * @param {number} stats.totalCards - Total number of cards
     * @param {number} stats.withTimeCards - Cards with time estimates
     * @param {number} stats.closedCards - Cards in closed/done board
     */
    updateBoardStats(stats) {
        if (!this.boardStats) return;
        const totalCards = stats?.totalCards || a0;
        const withTimeCards = stats?.withTimeCards || 0;
        const closedCards = stats?.closedCards || 0;

        this.boardStats.innerHTML = ''; // Clear previous content
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

    /**
     * Toggle collapse state of the panel
     */
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

    /**
     * Open settings modal
     */
    openSettings() {
        try {
            if (typeof window.SettingsManager === 'function') {
                const settingsManager = new window.SettingsManager({
                    labelManager: this.labelManager,
                    assigneeManager: this.assigneeManager,
                    gitlabApi: this.gitlabApi,
                    uiManager: this,  // Pass reference to this UIManager instance
                    onSettingsChanged: (type) => {
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

    /**
     * Update the header text (with total hours)
     * @param {string} text - Header text to display
     */
    updateHeader(text) {
        if (this.header) {
            this.header.innerHTML = text;
        }
    }

    /**
     * Show loading state in the UI
     * @param {string} message - Message to display
     */
    /**
     * Add a loading screen to a specific container
     * @param {HTMLElement|string} container - Container element or ID
     * @param {string} name - Unique name for this loading screen
     * @param {string} message - Optional message to display
     * @returns {HTMLElement} The created loading screen element
     */
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
        loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';  // Semi-transparent backdrop
        loadingScreen.style.display = 'flex';
        loadingScreen.style.flexDirection = 'column';
        loadingScreen.style.justifyContent = 'center';
        loadingScreen.style.alignItems = 'center';

        loadingScreen.style.zIndex = '101';  // Higher z-index to be above other elements
        loadingScreen.style.transition = 'opacity 0.3s ease';
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.width = '40px';
        spinner.style.height = '40px';
        spinner.style.borderRadius = '50%';
        spinner.style.border = '3px solid rgba(255, 255, 255, 0.2)';  // White border for dark backdrop
        spinner.style.borderTopColor = '#ffffff';  // White spinner for dark backdrop
        spinner.style.animation = 'gitlab-helper-spin 1s linear infinite';
        const messageEl = document.createElement('div');
        messageEl.className = 'loading-message';
        messageEl.textContent = message;
        messageEl.style.marginTop = '15px';
        messageEl.style.fontWeight = 'bold';
        messageEl.style.color = '#ffffff';  // White text for dark backdrop
        messageEl.style.fontSize = '14px';
        messageEl.style.textAlign = 'center'; // Ensure text is centered
        messageEl.style.padding = '0 20px'; // Add some padding for longer messages
        messageEl.style.maxWidth = '90%'; // Prevent text from overflowing on smaller screens
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

    /**
     * Remove a loading screen by name
     * @param {string} name - Name of the loading screen to remove
     * @param {boolean} fadeOut - Whether to fade out the loading screen
     */
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
            }, 300); // Match the transition duration
        } else {
            loadingScreen.parentNode.removeChild(loadingScreen);
            if (container && container.dataset.originalPosition) {
                container.style.position = container.dataset.originalPosition;
                delete container.dataset.originalPosition;
            }
        }
    }

    /**
     * Update the message of an existing loading screen
     * @param {string} name - Name of the loading screen
     * @param {string} message - New message to display
     */
    updateLoadingMessage(name, message) {
        const loadingScreen = document.getElementById(`loading-screen-${name}`);
        if (!loadingScreen) return;

        const messageEl = loadingScreen.querySelector('.loading-message');
        if (messageEl) {
            messageEl.textContent = message;
        }
    }

    /**
     * Ensure tab content has proper minimum height for loading screens
     */
    ensureTabContentHeight() {
        const tabContents = [
            document.getElementById('assignee-time-summary-content'),
            document.getElementById('boards-time-summary-content'),
            document.getElementById('bulk-comments-content')
        ];
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
        const tabNavHeight = 36; // Approximate height of tab navigation
        const statsHeight = this.boardStats ? this.boardStats.offsetHeight : 0;
        const subtractHeight = headerHeight + tabNavHeight + statsHeight + 20; // +20px for padding/margins
        tabContents.forEach(content => {
            if (content) {
                content.style.minHeight = `calc(100% - ${subtractHeight}px)`;
                content.style.height = `calc(100% - ${subtractHeight}px)`;
                content.style.position = 'relative';
            }
        });
    }

    /**
     * Initialize keyboard shortcut handling
     */
    initializeKeyboardShortcuts() {
        try {
            // Get the toggle shortcut from settings
            this.toggleShortcut = getToggleShortcut();

            // Define the keyboard handler
            this.keyboardHandler = this.createKeyboardHandler();

            // Add global keyboard listener
            document.addEventListener('keydown', this.keyboardHandler);

            console.log(`Initialized keyboard shortcuts: toggle with '${this.toggleShortcut}'`);
        } catch (error) {
            console.error('Error initializing keyboard shortcuts:', error);
        }
    }

    /**
     * Create a keyboard event handler function
     * @returns {function} Keyboard event handler
     */
    createKeyboardHandler() {
        return (e) => {
            // Skip if user is typing in an input, textarea, or contenteditable element
            if (isActiveInputElement(e.target)) {
                return;
            }

            // Toggle visibility with the configured shortcut
            if (e.key.toLowerCase() === this.toggleShortcut.toLowerCase()) {
                this.toggleCollapse();
                e.preventDefault(); // Prevent default browser action
            }
        };
    }

    /**
     * Update the keyboard shortcut
     * @param {string} newShortcut - The new shortcut key
     */
    updateKeyboardShortcut(newShortcut) {
        if (!newShortcut || typeof newShortcut !== 'string' || newShortcut.length !== 1) {
            console.warn('Invalid shortcut provided:', newShortcut);
            return;
        }

        try {
            // Remove the old event listener
            if (this.keyboardHandler) {
                document.removeEventListener('keydown', this.keyboardHandler);
            }

            // Update the shortcut
            this.toggleShortcut = newShortcut;

            // Create and attach a new event handler
            this.keyboardHandler = this.createKeyboardHandler();
            document.addEventListener('keydown', this.keyboardHandler);

            console.log(`Updated keyboard shortcut to: '${this.toggleShortcut}'`);
        } catch (error) {
            console.error('Error updating keyboard shortcut:', error);
        }
    }
}

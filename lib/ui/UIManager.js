// UIManager.js - Main UI coordination class with fixed initialization
import TabManager from './managers/TabManager';
import SummaryView from './views/SummaryView';
import BoardsView from './views/BoardsView';
import HistoryView from './views/HistoryView';
import BulkCommentsView from './views/BulkCommentsView';
import IssueSelector from './components/IssueSelector';
import LabelManager from './managers/LabelManager';
import AssigneeManager from './managers/AssigneeManager';
import MilestoneManager from './managers/MilestoneManager';
import { loadFromStorage, saveToStorage } from '../storage/LocalStorage';

/**
 * Main UI Manager that coordinates all UI components
 */
export default class UIManager {
    constructor() {
        // Initialize GitLab API reference
        this.gitlabApi = window.gitlabApi;

        // Initialize container elements
        this.container = null;
        this.contentWrapper = null;
        this.headerDiv = null;
        this.header = null;
        this.recalculateBtn = null;
        this.collapseBtn = null;
        this.boardStats = null;

        // Initialize managers first (they're dependencies for views)
        this.initializeManagers();

        // Initialize tab manager and views
        this.tabManager = new TabManager(this);
        this.summaryView = new SummaryView(this);
        this.boardsView = new BoardsView(this);
        this.historyView = new HistoryView(this);
        this.bulkCommentsView = new BulkCommentsView(this);
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
     * Initialize managers with error handling
     */
    initializeManagers() {
        // Initialize Label Manager
        try {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    console.log(`Loaded ${labels.length} labels`);
                    // Refresh UI elements that depend on labels
                    if (this.bulkCommentsView && this.bulkCommentsView.addLabelShortcut) {
                        this.bulkCommentsView.addLabelShortcut();
                    }
                }
            });
        } catch (e) {
            console.error('Error initializing LabelManager:', e);
            // Create a placeholder if initialization fails
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([]),
                isLabelInWhitelist: () => false
            };
        }

        // Initialize Assignee Manager
        try {
            this.assigneeManager = new AssigneeManager({
                gitlabApi: this.gitlabApi,
                onAssigneesChange: (assignees) => {
                    console.log(`Assignee whitelist updated with ${assignees.length} entries`);
                    // Refresh UI elements that depend on assignees
                    if (this.bulkCommentsView && this.bulkCommentsView.addAssignShortcut) {
                        this.bulkCommentsView.addAssignShortcut();
                    }
                }
            });
        } catch (e) {
            console.error('Error initializing AssigneeManager:', e);
            // Create a placeholder if initialization fails
            this.assigneeManager = {
                getAssigneeWhitelist: () => []
            };
        }

        // Initialize Milestone Manager
        try {
            this.milestoneManager = new MilestoneManager({
                gitlabApi: this.gitlabApi,
                onMilestonesLoaded: (milestones) => {
                    console.log(`Loaded ${milestones.length} milestones`);
                }
            });
        } catch (e) {
            console.error('Error initializing MilestoneManager:', e);
            // Create a placeholder if initialization fails
            this.milestoneManager = {
                milestones: [],
                fetchMilestones: () => Promise.resolve([])
            };
        }
    }

    /**
     * Initialize the UI and create the container
     */
    initialize() {
        // Create main container if it doesn't exist
        if (document.getElementById('assignee-time-summary')) {
            this.container = document.getElementById('assignee-time-summary');
            return;
        }

        // Create container with wider width
        this.container = document.createElement('div');
        this.container.id = 'assignee-time-summary';
        this.container.style.position = 'fixed';
        this.container.style.bottom = '15px'; // Position at bottom-right as it was before
        this.container.style.right = '15px';
        this.container.style.backgroundColor = 'white';
        this.container.style.border = '1px solid #ddd';
        this.container.style.borderRadius = '4px';
        this.container.style.padding = '10px';
        this.container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
        this.container.style.zIndex = '1000';
        this.container.style.maxHeight = '80vh';
        this.container.style.overflow = 'hidden';
        this.container.style.fontSize = '14px';
        this.container.style.width = '400px'; // Increased width from 350px to 400px
        this.container.style.transition = 'height 0.3s ease-in-out';

        // Create content wrapper (for collapsing)
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'assignee-time-summary-wrapper';
        this.contentWrapper.style.display = 'block';
        this.contentWrapper.style.maxHeight = '70vh';
        this.contentWrapper.style.overflowY = 'auto';

        // Create header
        this.createHeader();

        // Create board stats display
        this.createBoardStats();

        // Initialize tabs
        this.tabManager.initialize(this.contentWrapper);

        // Add content wrapper to container
        this.container.appendChild(this.contentWrapper);

        // Add container to body
        document.body.appendChild(this.container);

        // Modified click event handler to exclude select issues function
        // and to exclude the selection overlays and badges
        this.container.addEventListener('click', (e) => {
            // If issue selection is active and the click is inside our container
            // (but not on the selection overlays themselves or buttons from the bulk comments tab)
            if (this.issueSelector && this.issueSelector.isSelectingIssue &&
                !e.target.classList.contains('card-selection-overlay') &&
                !e.target.classList.contains('selection-badge') &&
                // Don't abort when clicking these elements
                !e.target.closest('#bulk-comments-content button') &&
                !e.target.closest('#issue-comment-input') &&
                !e.target.closest('#shortcuts-wrapper') &&
                !e.target.closest('#selected-issues-list') &&
                !e.target.closest('#selection-cancel-button')) {
                this.issueSelector.exitSelectionMode();
            }
        });

        // Check if it should be collapsed initially (from localStorage)
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
     * Create header with title and buttons
     */
    createHeader() {
        this.headerDiv = document.createElement('div');
        this.headerDiv.style.display = 'flex';
        this.headerDiv.style.justifyContent = 'space-between';
        this.headerDiv.style.alignItems = 'center';
        this.headerDiv.style.marginBottom = '5px';
        this.headerDiv.style.cursor = 'pointer';

        // Add click event to header for collapsing
        this.headerDiv.addEventListener('click', (e) => {
            // Don't collapse if clicking on buttons
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

        // Button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '5px';

        // Create recalculate button
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
            // Call external updateSummary function with force update
            if (typeof window.updateSummary === 'function') {
                window.updateSummary(true);
            }

            // Visual feedback
            this.recalculateBtn.textContent = '✓';
            setTimeout(() => {
                this.recalculateBtn.textContent = '🔄';
            }, 1000);
        };

        // Create settings button
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

        // Create collapse button
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

        // Use default values if not provided
        const totalCards = stats?.totalCards || 0;
        const withTimeCards = stats?.withTimeCards || 0;
        const closedCards = stats?.closedCards || 0;

        this.boardStats.innerHTML = ''; // Clear previous content

        // Create left side stats (total cards)
        const totalStats = document.createElement('div');
        totalStats.style.display = 'flex';
        totalStats.style.gap = '8px';

        const totalText = document.createElement('span');
        totalText.textContent = `Total: ${totalCards} cards`;
        totalStats.appendChild(totalText);

        const withTimeText = document.createElement('span');
        withTimeText.textContent = `(${withTimeCards} with time)`;
        withTimeText.style.color = '#777';
        totalStats.appendChild(withTimeText);

        // Create right side stats (closed cards)
        const closedStats = document.createElement('div');
        closedStats.textContent = `Closed: ${closedCards} cards`;
        closedStats.style.color = '#28a745';

        // Add to board stats container
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
                // Expand
                this.contentWrapper.style.display = 'block';
                this.collapseBtn.textContent = '▼';
                this.container.style.height = '';
                saveToStorage('gitlabTimeSummaryCollapsed', 'false');
            } else {
                // Collapse
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
            // Check if we have a SettingsManager
            if (typeof window.SettingsManager === 'function') {
                const settingsManager = new window.SettingsManager({
                    labelManager: this.labelManager,
                    assigneeManager: this.assigneeManager,
                    gitlabApi: this.gitlabApi,
                    onSettingsChanged: (type) => {
                        console.log(`Settings changed: ${type}`);
                        // Refresh relevant UI components
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
            this.header.textContent = text;
        }
    }
}
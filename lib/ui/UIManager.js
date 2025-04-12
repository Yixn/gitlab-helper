import TabManager from './managers/TabManager';
import SummaryView from './views/SummaryView';
import BoardsView from './views/BoardsView';
import HistoryView from './views/HistoryView';
import BulkCommentsView from './views/BulkCommentsView';
import IssueSelector from './components/IssueSelector';
import LabelManager from './managers/LabelManager';
import AssigneeManager from './managers/AssigneeManager';
import MilestoneManager from './managers/MilestoneManager';
import {loadFromStorage, saveToStorage} from '../storage/LocalStorage';

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
     * Initialize the UI and create the container
     * @param {HTMLElement} attachmentElement - Element to attach the UI to
     */
    /**
     * Initialize the UI and create the container
     * @param {HTMLElement} attachmentElement - Element to attach the UI to (defaults to document.body)
     */
    initialize(attachmentElement = document.body) {
        // Create main container if it doesn't exist
        if (document.getElementById('assignee-time-summary')) {
            this.container = document.getElementById('assignee-time-summary');

            // Also get reference to the content wrapper if it exists
            this.contentWrapper = document.getElementById('assignee-time-summary-wrapper');

            // Ensure container has position relative for loading screens
            this.container.style.position = 'relative';

            return;
        }

        // Create container with fixed position
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

        // Create content wrapper (for collapsing)
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'assignee-time-summary-wrapper';
        this.contentWrapper.style.display = 'block';
        this.contentWrapper.style.maxHeight = '70vh';
        this.contentWrapper.style.minHeight = '350px'; // Add minimum height of 350px
        this.contentWrapper.style.overflowY = 'auto';
        this.contentWrapper.style.position = 'relative'; // Ensure content wrapper has position relative

        // Create header
        this.createHeader();

        // Create board stats display
        this.createBoardStats();

        // Initialize tabs
        this.tabManager.initialize(this.contentWrapper);

        // Ensure tab contents have proper height
        this.ensureTabContentHeight();

        // Add content wrapper to container
        this.container.appendChild(this.contentWrapper);

        // Log the attachment element we're using
        
        // Attach to the specified element
        attachmentElement.appendChild(this.container);

        // Store a reference to the attachment element
        this.attachmentElement = attachmentElement;

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
     * Initialize managers with error handling
     */
    initializeManagers() {
        // Initialize Label Manager
        try {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
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
        // Check if the boardStats element already exists
        const existingStats = document.getElementById('board-stats-summary');
        if (existingStats) {
            // If it exists, just store the reference and return
            this.boardStats = existingStats;
            return;
        }

        // Otherwise create a new one
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
            // Use innerHTML instead of textContent to allow HTML styling
            this.header.innerHTML = text;
        }
    }

    /**
     * Show loading state in the UI
     * @param {string} message - Message to display
     */
    /**
     * Show loading state in the UI
     * @param {string} message - Message to display
     */
    showLoading(message = 'Loading...') {
        // Check if loading element already exists
        let loadingEl = document.getElementById('assignee-time-summary-loading');

        if (!loadingEl) {
            // Create loading element
            loadingEl = document.createElement('div');
            loadingEl.id = 'assignee-time-summary-loading';
            loadingEl.style.position = 'absolute';
            loadingEl.style.top = '0';
            loadingEl.style.left = '0';
            loadingEl.style.width = '100%';
            loadingEl.style.height = '100%';
            loadingEl.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';  // Semi-transparent background
            loadingEl.style.display = 'flex';
            loadingEl.style.justifyContent = 'center';
            loadingEl.style.alignItems = 'center';
            loadingEl.style.zIndex = '101';
            loadingEl.style.flexDirection = 'column';

            const spinnerSize = '40px';
            const spinnerHTML = `
            <div style="width: ${spinnerSize}; height: ${spinnerSize}; border: 3px solid rgba(255, 255, 255, 0.2); 
                        border-top: 3px solid #ffffff; border-radius: 50%; 
                        animation: spin 1s linear infinite;"></div>
            <style>
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            </style>
        `;

            loadingEl.innerHTML = spinnerHTML;

            const loadingText = document.createElement('div');
            loadingText.textContent = message;
            loadingText.style.marginTop = '10px';
            loadingText.style.fontWeight = 'bold';
            loadingText.style.color = '#ffffff';  // White text
            loadingText.style.maxWidth = '90%';   // Prevent text overflow
            loadingText.style.textAlign = 'center'; // Center the text
            loadingText.style.padding = '0 20px';  // Add some padding
            loadingEl.appendChild(loadingText);

            this.container.style.position = 'relative';
            this.container.appendChild(loadingEl);
        } else {
            // Update existing loading element's message
            const loadingText = loadingEl.querySelector('div:not([style*="animation"])');
            if (loadingText) {
                loadingText.textContent = message;
            }
            loadingEl.style.display = 'flex';
        }
    }

    /**
     * Hide loading state
     */
    hideLoading() {
        const loadingEl = document.getElementById('assignee-time-summary-loading');
        if (loadingEl) {
            loadingEl.style.display = 'none';
        }
    }

    /**
     * Show error message
     * @param {string} message - Error message
     */
    showErrorMessage(message) {
        // First check if there's already an error message
        let errorEl = document.getElementById('assignee-time-summary-error');

        if (!errorEl) {
            // Create error element
            errorEl = document.createElement('div');
            errorEl.id = 'assignee-time-summary-error';
            errorEl.style.margin = '10px 0';
            errorEl.style.padding = '10px';
            errorEl.style.backgroundColor = '#f8d7da';
            errorEl.style.color = '#721c24';
            errorEl.style.borderRadius = '4px';
            errorEl.style.border = '1px solid #f5c6cb';
            errorEl.style.fontSize = '14px';
            errorEl.style.display = 'flex';
            errorEl.style.justifyContent = 'space-between';
            errorEl.style.alignItems = 'center';

            const errorText = document.createElement('div');
            errorText.textContent = message;
            errorEl.appendChild(errorText);

            // Add close button
            const closeBtn = document.createElement('button');
            closeBtn.innerHTML = '&times;';
            closeBtn.style.background = 'none';
            closeBtn.style.border = 'none';
            closeBtn.style.fontSize = '20px';
            closeBtn.style.cursor = 'pointer';
            closeBtn.style.color = '#721c24';
            closeBtn.style.fontWeight = 'bold';
            closeBtn.onclick = () => {
                errorEl.remove();
            };

            errorEl.appendChild(closeBtn);

            // Add to beginning of content
            if (this.contentWrapper) {
                this.contentWrapper.insertBefore(errorEl, this.contentWrapper.firstChild);
            }
        } else {
            // Update existing error message
            const errorText = errorEl.querySelector('div');
            if (errorText) {
                errorText.textContent = message;
            }
            errorEl.style.display = 'flex';
        }

        // Auto-hide error after 10 seconds
        setTimeout(() => {
            if (errorEl && errorEl.parentNode) {
                errorEl.remove();
            }
        }, 10000);
    }

    /**
     * Add a loading screen to a specific container
     * @param {HTMLElement|string} container - Container element or ID
     * @param {string} name - Unique name for this loading screen
     * @param {string} message - Optional message to display
     * @returns {HTMLElement} The created loading screen element
     */
    addLoadingScreen(container, name, message = 'Loading...') {
        // Get container element if string ID was provided
        if (typeof container === 'string') {
            container = document.getElementById(container);
        }

        // Return if container not found
        if (!container) {
            console.warn(`Container not found for loading screen: ${name}`);
            return null;
        }

        // Check if this loading screen already exists
        const existingLoader = document.getElementById(`loading-screen-${name}`);
        if (existingLoader) {
            // Just update the message if it exists
            const messageEl = existingLoader.querySelector('.loading-message');
            if (messageEl) {
                messageEl.textContent = message;
            }
            return existingLoader;
        }

        // Create loading screen overlay
        const loadingScreen = document.createElement('div');
        loadingScreen.id = `loading-screen-${name}`;
        loadingScreen.className = 'gitlab-helper-loading-screen';

        // Position absolutely over the container
        loadingScreen.style.position = 'absolute';
        loadingScreen.style.top = '0';
        loadingScreen.style.left = '0';
        loadingScreen.style.width = '100%';
        loadingScreen.style.height = '100%';
        loadingScreen.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';  // Semi-transparent backdrop

        // Use flex for perfect centering
        loadingScreen.style.display = 'flex';
        loadingScreen.style.flexDirection = 'column';
        loadingScreen.style.justifyContent = 'center';
        loadingScreen.style.alignItems = 'center';

        loadingScreen.style.zIndex = '101';  // Higher z-index to be above other elements
        loadingScreen.style.transition = 'opacity 0.3s ease';

        // Create spinner animation
        const spinner = document.createElement('div');
        spinner.className = 'loading-spinner';
        spinner.style.width = '40px';
        spinner.style.height = '40px';
        spinner.style.borderRadius = '50%';
        spinner.style.border = '3px solid rgba(255, 255, 255, 0.2)';  // White border for dark backdrop
        spinner.style.borderTopColor = '#ffffff';  // White spinner for dark backdrop
        spinner.style.animation = 'gitlab-helper-spin 1s linear infinite';

        // Create loading message
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

        // Add animation keyframes if they don't exist yet
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

        // Assemble the loading screen
        loadingScreen.appendChild(spinner);
        loadingScreen.appendChild(messageEl);

        // Make sure container has position set for absolute positioning to work
        const containerPosition = window.getComputedStyle(container).position;
        if (containerPosition === 'static' || !containerPosition) {
            // Log a message to help debug positioning issues
            
            // Set container to relative positioning
            container.style.position = 'relative';

            // Store original position to restore later
            container.dataset.originalPosition = containerPosition;
        }

        // Append to container
        container.appendChild(loadingScreen);

        // Add a subtle animation to the message
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

        // Get parent container to restore position if needed
        const container = loadingScreen.parentNode;

        if (fadeOut) {
            // Fade out animation
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                if (loadingScreen.parentNode) {
                    loadingScreen.parentNode.removeChild(loadingScreen);
                }

                // Restore original position if we changed it
                if (container && container.dataset.originalPosition) {
                    container.style.position = container.dataset.originalPosition;
                    delete container.dataset.originalPosition;
                }
            }, 300); // Match the transition duration
        } else {
            // Remove immediately
            loadingScreen.parentNode.removeChild(loadingScreen);

            // Restore original position if we changed it
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
        // Find all tab content containers
        const tabContents = [
            document.getElementById('assignee-time-summary-content'),
            document.getElementById('boards-time-summary-content'),
            document.getElementById('history-time-summary-content'),
            document.getElementById('bulk-comments-content')
        ];

        // Get wrapper and header heights
        const wrapper = document.getElementById('assignee-time-summary-wrapper');
        const headerDiv = this.headerDiv || document.querySelector('#assignee-time-summary > div:first-child');

        if (!wrapper || !headerDiv) {
            console.warn('Could not find wrapper or header elements for height calculation');
            // Fallback to fixed height
            tabContents.forEach(content => {
                if (content) {
                    content.style.minHeight = '300px';
                    content.style.position = 'relative';
                }
            });
            return;
        }

        // Calculate available height
        // outerHeight = height + padding + border + margin
        const headerHeight = headerDiv.offsetHeight;
        const tabNavHeight = 36; // Approximate height of tab navigation
        const statsHeight = this.boardStats ? this.boardStats.offsetHeight : 0;

        // Calculate the height we need to subtract from wrapper
        const subtractHeight = headerHeight + tabNavHeight + statsHeight + 20; // +20px for padding/margins

        
        // Set minimum height for each tab content
        tabContents.forEach(content => {
            if (content) {
                // Set the height with calc() to make it dynamic
                content.style.minHeight = `calc(100% - ${subtractHeight}px)`;
                content.style.height = `calc(100% - ${subtractHeight}px)`;
                content.style.position = 'relative';

                            }
        });
    }
}

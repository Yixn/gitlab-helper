// UIManager.js - Main UI coordination class

class UIManager {
    constructor() {
        this.container = null;
        this.contentWrapper = null;
        this.statusDiv = null;
        this.header = null;
        this.headerDiv = null;
        this.recalculateBtn = null;
        this.collapseBtn = null;

        // Initialize tab manager and views
        this.tabManager = new TabManager(this);
        this.summaryView = new SummaryTabView(this);
        this.boardsView = new BoardsTabView(this);
        this.historyView = new HistoryTabView(this);
        this.apiView = new ApiTabView(this);
        this.issueSelector = new IssueSelector(this);
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

        // Create container
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
        this.container.style.zIndex = '1000';
        this.container.style.maxHeight = '80vh';
        this.container.style.overflow = 'hidden';
        this.container.style.fontSize = '14px';
        this.container.style.width = '300px';
        this.container.style.transition = 'height 0.3s ease-in-out';

        // Create content wrapper (for collapsing)
        this.contentWrapper = document.createElement('div');
        this.contentWrapper.id = 'assignee-time-summary-wrapper';
        this.contentWrapper.style.display = 'block';
        this.contentWrapper.style.maxHeight = '70vh';
        this.contentWrapper.style.overflowY = 'auto';

        // Create header
        this.createHeader();

        // Create status indicator
        this.statusDiv = document.createElement('div');
        this.statusDiv.id = 'assignee-time-summary-status';
        this.statusDiv.style.fontSize = '12px';
        this.statusDiv.style.color = '#666';
        this.statusDiv.style.marginBottom = '10px';
        this.statusDiv.style.marginTop = '10px';
        this.statusDiv.textContent = 'Initializing...';
        this.contentWrapper.appendChild(this.statusDiv);

        // Initialize tabs
        this.tabManager.initialize(this.contentWrapper);

        // Add content wrapper to container
        this.container.appendChild(this.contentWrapper);

        // Add container to body
        document.body.appendChild(this.container);

        // Check if it should be collapsed initially (from localStorage)
        if (localStorage.getItem('gitlabTimeSummaryCollapsed') === 'true') {
            this.contentWrapper.style.display = 'none';
            this.collapseBtn.textContent = '▲';
            this.container.style.height = 'auto';
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
        this.headerDiv.style.marginBottom = '0px';
        this.headerDiv.style.cursor = 'pointer';

        // Add click event to header for collapsing
        this.headerDiv.addEventListener('click', (e) => {
            // Don't collapse if clicking on buttons
            if (e.target === this.recalculateBtn || e.target === this.collapseBtn) {
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
            updateSummary(true);

            // Visual feedback
            this.recalculateBtn.textContent = '✓';
            setTimeout(() => {
                this.recalculateBtn.textContent = '🔄';
            }, 1000);
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
        buttonContainer.appendChild(this.collapseBtn);
        this.headerDiv.appendChild(this.header);
        this.headerDiv.appendChild(buttonContainer);
        this.container.appendChild(this.headerDiv);
    }

    /**
     * Toggle collapse state of the panel
     */
    toggleCollapse() {
        if (this.contentWrapper.style.display === 'none') {
            // Expand
            this.contentWrapper.style.display = 'block';
            this.collapseBtn.textContent = '▼';
            this.container.style.height = '';
            localStorage.setItem('gitlabTimeSummaryCollapsed', 'false');
        } else {
            // Collapse
            this.contentWrapper.style.display = 'none';
            this.collapseBtn.textContent = '▲';
            this.container.style.height = 'auto';
            localStorage.setItem('gitlabTimeSummaryCollapsed', 'true');
        }
    }

    /**
     * Update the status message
     * @param {string} message - Status message to display
     */
    updateStatus(message) {
        if (this.statusDiv) {
            this.statusDiv.textContent = message;
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

// Export singleton instance
const uiManager = new UIManager();
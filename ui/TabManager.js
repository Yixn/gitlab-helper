// TabManager.js - Manages tab switching and tab UI

class TabManager {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.tabContainer = null;
        this.tabs = {};
        this.contentAreas = {};
        this.currentTab = 'summary';
    }

    /**
     * Initialize the tab navigation
     * @param {HTMLElement} parentElement - Element to append tabs to
     */
    initialize(parentElement) {
        // Create tab container
        this.tabContainer = document.createElement('div');
        this.tabContainer.style.display = 'flex';
        this.tabContainer.style.marginBottom = '10px';
        this.tabContainer.style.borderBottom = '1px solid #ddd';

        // Create tabs
        this.createTab('summary', 'Summary', true);
        this.createTab('boards', 'Boards');
        this.createTab('history', 'History');
        this.createTab('api', 'API');

        // Append tab container to parent
        parentElement.appendChild(this.tabContainer);

        // Create content areas for each tab
        this.createContentAreas(parentElement);
    }

    /**
     * Create a tab element
     * @param {string} id - Tab identifier
     * @param {string} label - Tab display label
     * @param {boolean} isActive - Whether tab is initially active
     */
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

    /**
     * Create content areas for each tab
     * @param {HTMLElement} parentElement - Element to append content areas to
     */
    createContentAreas(parentElement) {
        // Summary tab content
        const summaryContent = document.createElement('div');
        summaryContent.id = 'assignee-time-summary-content';
        summaryContent.style.display = this.currentTab === 'summary' ? 'block' : 'none';
        parentElement.appendChild(summaryContent);
        this.contentAreas['summary'] = summaryContent;

        // Boards tab content
        const boardsContent = document.createElement('div');
        boardsContent.id = 'boards-time-summary-content';
        boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
        parentElement.appendChild(boardsContent);
        this.contentAreas['boards'] = boardsContent;

        // History tab content
        const historyContent = document.createElement('div');
        historyContent.id = 'history-time-summary-content';
        historyContent.style.display = this.currentTab === 'history' ? 'block' : 'none';
        parentElement.appendChild(historyContent);
        this.contentAreas['history'] = historyContent;

        // API tab content
        const apiContent = document.createElement('div');
        apiContent.id = 'api-info-content';
        apiContent.style.display = this.currentTab === 'api' ? 'block' : 'none';
        parentElement.appendChild(apiContent);
        this.contentAreas['api'] = apiContent;
    }

    /**
     * Switch to a specific tab
     * @param {string} tabId - ID of tab to switch to
     */
    switchToTab(tabId) {
        // Reset all tabs
        Object.keys(this.tabs).forEach(id => {
            this.tabs[id].style.borderBottom = 'none';
            this.tabs[id].style.fontWeight = 'normal';
            this.contentAreas[id].style.display = 'none';
        });

        // Activate the selected tab
        this.tabs[tabId].style.borderBottom = '2px solid #1f75cb';
        this.tabs[tabId].style.fontWeight = 'bold';
        this.contentAreas[tabId].style.display = 'block';

        // Store the current tab
        this.currentTab = tabId;

        // Initialize tab content if needed
        if (tabId === 'history') {
            renderHistory(); // Call external renderHistory function
        } else if (tabId === 'api') {
            this.uiManager.apiView.render();
        }
    }

    /**
     * Get the content element for a specific tab
     * @param {string} tabId - ID of the tab
     * @returns {HTMLElement} Content area element
     */
    getContentArea(tabId) {
        return this.contentAreas[tabId];
    }

    /**
     * Get the current active tab ID
     * @returns {string} Active tab ID
     */
    getCurrentTab() {
        return this.currentTab;
    }
}
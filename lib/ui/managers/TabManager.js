// TabManager.js - Manages tab switching and tab UI
import { getLastActiveTab, saveLastActiveTab } from '../../storage/SettingsStorage';

/**
 * Manager for tab switching and tab UI
 */
export default class TabManager {
    /**
     * Constructor for TabManager
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.tabContainer = null;
        this.tabs = {};
        this.contentAreas = {};

        // Get last active tab or default to 'summary'
        try {
            this.currentTab = getLastActiveTab() || 'summary';
        } catch (e) {
            console.warn('Error loading last active tab:', e);
            this.currentTab = 'summary';
        }

        console.log('Initial active tab:', this.currentTab);
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
        this.createTab('summary', 'Summary', this.currentTab === 'summary');
        this.createTab('boards', 'Boards', this.currentTab === 'boards');
        this.createTab('history', 'History', this.currentTab === 'history');
        this.createTab('bulkcomments', 'Bulk Comments', this.currentTab === 'bulkcomments'); // Renamed from "API" to "Bulk Comments"

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
        summaryContent.style.position = 'relative'; // Explicitly set position relative
        summaryContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(summaryContent);
        this.contentAreas['summary'] = summaryContent;

        // Add loading screen to summary tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(summaryContent, 'summary-tab', 'Loading summary data...');
        }

        // Boards tab content
        const boardsContent = document.createElement('div');
        boardsContent.id = 'boards-time-summary-content';
        boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
        boardsContent.style.position = 'relative'; // Explicitly set position relative
        boardsContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(boardsContent);
        this.contentAreas['boards'] = boardsContent;

        // Add loading screen to boards tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(boardsContent, 'boards-tab', 'Loading board data...');
        }

        // History tab content
        const historyContent = document.createElement('div');
        historyContent.id = 'history-time-summary-content';
        historyContent.style.display = this.currentTab === 'history' ? 'block' : 'none';
        historyContent.style.position = 'relative'; // Explicitly set position relative
        historyContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(historyContent);
        this.contentAreas['history'] = historyContent;

        // Add loading screen to history tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(historyContent, 'history-tab', 'Loading history data...');
        }

        // Bulk Comments tab content (renamed from API)
        const bulkCommentsContent = document.createElement('div');
        bulkCommentsContent.id = 'bulk-comments-content';
        bulkCommentsContent.style.display = this.currentTab === 'bulkcomments' ? 'block' : 'none';
        bulkCommentsContent.style.position = 'relative'; // Explicitly set position relative
        bulkCommentsContent.style.minHeight = '150px'; // Minimum height for the loader
        parentElement.appendChild(bulkCommentsContent);
        this.contentAreas['bulkcomments'] = bulkCommentsContent;

        // Add loading screen to bulk comments tab
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
        }
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
        try {
            // Add error handling for saving the tab
            saveLastActiveTab(tabId);
        } catch(e) {
            console.warn('Error saving tab selection:', e);
        }

        // Initialize tab content if needed
        if (tabId === 'history' && typeof window.renderHistory === 'function') {
            window.renderHistory(); // Call external renderHistory function

            // Remove loading screen if exists
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('history-tab');
            }
        } else if (tabId === 'bulkcomments' && this.uiManager.bulkCommentsView) {
            this.uiManager.bulkCommentsView.render();

            // Remove loading screen if exists
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
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
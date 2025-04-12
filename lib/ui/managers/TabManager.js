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
        try {
            this.currentTab = getLastActiveTab() || 'summary';
        } catch (e) {
            console.warn('Error loading last active tab:', e);
            this.currentTab = 'summary';
        }

            }

    /**
     * Initialize the tab navigation
     * @param {HTMLElement} parentElement - Element to append tabs to
     */
    initialize(parentElement) {
        this.tabContainer = document.createElement('div');
        this.tabContainer.style.display = 'flex';
        this.tabContainer.style.marginBottom = '10px';
        this.tabContainer.style.borderBottom = '1px solid #ddd';
        this.createTab('summary', 'Summary', this.currentTab === 'summary');
        this.createTab('boards', 'Boards', this.currentTab === 'boards');
        this.createTab('history', 'History', this.currentTab === 'history');
        this.createTab('bulkcomments', 'Bulk Comments', this.currentTab === 'bulkcomments'); // Renamed from "API" to "Bulk Comments"
        parentElement.appendChild(this.tabContainer);
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
    createContentAreas(parentElement) {
        const summaryContent = document.createElement('div');
        summaryContent.id = 'assignee-time-summary-content';
        summaryContent.style.display = this.currentTab === 'summary' ? 'block' : 'none';
        summaryContent.style.position = 'relative'; // Explicitly set position relative
        summaryContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(summaryContent);
        this.contentAreas['summary'] = summaryContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(summaryContent, 'summary-tab', 'Loading summary data...');
        }
        const boardsContent = document.createElement('div');
        boardsContent.id = 'boards-time-summary-content';
        boardsContent.style.display = this.currentTab === 'boards' ? 'block' : 'none';
        boardsContent.style.position = 'relative'; // Explicitly set position relative
        boardsContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(boardsContent);
        this.contentAreas['boards'] = boardsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(boardsContent, 'boards-tab', 'Loading board data...');
        }
        const historyContent = document.createElement('div');
        historyContent.id = 'history-time-summary-content';
        historyContent.style.display = this.currentTab === 'history' ? 'block' : 'none';
        historyContent.style.position = 'relative'; // Explicitly set position relative
        historyContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(historyContent);
        this.contentAreas['history'] = historyContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(historyContent, 'history-tab', 'Loading history data...');
        }
        const bulkCommentsContent = document.createElement('div');
        bulkCommentsContent.id = 'bulk-comments-content';
        bulkCommentsContent.style.display = this.currentTab === 'bulkcomments' ? 'block' : 'none';
        bulkCommentsContent.style.position = 'relative'; // Explicitly set position relative
        bulkCommentsContent.style.minHeight = '300px'; // Increased minimum height for the loader
        parentElement.appendChild(bulkCommentsContent);
        this.contentAreas['bulkcomments'] = bulkCommentsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
        }
    }

    /**
     * Switch to a specific tab
     * @param {string} tabId - ID of tab to switch to
     */
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
        } catch(e) {
            console.warn('Error saving tab selection:', e);
        }
        if (tabId === 'history' && typeof window.renderHistory === 'function') {
            window.renderHistory(); // Call external renderHistory function
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('history-tab');
            }
        } else if (tabId === 'bulkcomments' && this.uiManager.bulkCommentsView) {
            this.uiManager.bulkCommentsView.render();
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
        }
    }
}
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
            let lastTab = getLastActiveTab() || 'summary';
            // If last tab was history, default to summary
            if (lastTab === 'history') {
                lastTab = 'summary';
            }
            this.currentTab = lastTab;
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
        this.createTab('bulkcomments', 'Issues', this.currentTab === 'bulkcomments');
        this.createTab('sprintmanagement', 'Sprint', this.currentTab === 'sprintmanagement');
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
        boardsContent.style.position = 'relative'; // Explicitly set position relative
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
        bulkCommentsContent.style.position = 'relative'; // Explicitly set position relative
        bulkCommentsContent.style.height = '530px';
        bulkCommentsContent.style.overflowY = 'auto';
        bulkCommentsContent.style.maxHeight = '60vh';
        parentElement.appendChild(bulkCommentsContent);
        this.contentAreas['bulkcomments'] = bulkCommentsContent;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            this.uiManager.addLoadingScreen(bulkCommentsContent, 'bulkcomments-tab', 'Loading comment tools...');
        }

        // Add the Sprint Management content area
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
        uiManager.issueSelector.applyOverflowFixes()
    }
}
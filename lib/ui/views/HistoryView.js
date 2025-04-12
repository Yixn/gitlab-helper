// HistoryView.js - Manages the History tab UI
import { getHistoryKey } from '../../api/APIUtils';

/**
 * View for the History tab
 */
export default class HistoryView {
    /**
     * Constructor for HistoryView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    /**
     * Render the history tab
     */
    render() {
        const historyContent = document.getElementById('history-time-summary-content');
        if (!historyContent) return;

        // Clear existing content
        historyContent.innerHTML = '';

        // Get current URL key
        const urlKey = getHistoryKey();

        // Get history data specific to this URL
        const history = GM_getValue(urlKey, []);

        // Show current URL being displayed
        const urlInfo = document.createElement('div');
        urlInfo.style.fontSize = '12px';
        urlInfo.style.color = '#666';
        urlInfo.style.marginBottom = '10px';
        urlInfo.style.wordBreak = 'break-all';

        // Truncate the URL if it's too long
        let displayUrl = window.location.href;
        if (displayUrl.length > 60) {
            displayUrl = displayUrl.substring(0, 57) + '...';
        }
        historyContent.appendChild(urlInfo);

        // If no history, show message
        if (history.length === 0) {
            this.renderNoHistoryMessage(historyContent);
            return;
        }

        // Add clear history button
        this.addClearHistoryButton(historyContent, urlKey);

        // Create and populate history table
        this.renderHistoryTable(historyContent, history);
    }

    /**
     * Render message when no history data is available
     * @param {HTMLElement} container - Container element
     */
    renderNoHistoryMessage(container) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No history data available for this URL yet.';
        noDataMsg.style.color = '#666';
        container.appendChild(noDataMsg);
    }

    /**
     * Add button to clear history data
     * @param {HTMLElement} container - Container element
     * @param {string} urlKey - Key for storing history data
     */
    addClearHistoryButton(container, urlKey) {
        const clearHistoryBtn = document.createElement('button');
        clearHistoryBtn.textContent = 'Clear History';
        clearHistoryBtn.style.padding = '3px 6px';
        clearHistoryBtn.style.fontSize = '12px';
        clearHistoryBtn.style.backgroundColor = '#dc3545';
        clearHistoryBtn.style.color = 'white';
        clearHistoryBtn.style.border = 'none';
        clearHistoryBtn.style.borderRadius = '3px';
        clearHistoryBtn.style.cursor = 'pointer';
        clearHistoryBtn.style.marginBottom = '10px';
        clearHistoryBtn.onclick = () => {
            if (confirm('Are you sure you want to clear history data for this URL?')) {
                GM_setValue(urlKey, []);
                this.render(); // Re-render the tab
            }
        };
        container.appendChild(clearHistoryBtn);
    }

    /**
     * Render table showing history data
     * @param {HTMLElement} container - Container element
     * @param {Array} history - Array of history entries
     */
    renderHistoryTable(container, history) {
        // Create history table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Table header
        const headerRow = document.createElement('tr');
        headerRow.style.borderBottom = '2px solid #ddd';
        headerRow.style.fontWeight = 'bold';

        const dateHeader = document.createElement('th');
        dateHeader.textContent = 'Date';
        dateHeader.style.textAlign = 'left';
        dateHeader.style.padding = '5px 0';

        const hoursHeader = document.createElement('th');
        hoursHeader.textContent = 'Hours';
        hoursHeader.style.textAlign = 'right';
        hoursHeader.style.padding = '5px 0';

        const milestoneHeader = document.createElement('th');
        milestoneHeader.textContent = 'Milestone';
        milestoneHeader.style.textAlign = 'left';
        milestoneHeader.style.padding = '5px 0';

        headerRow.appendChild(dateHeader);
        headerRow.appendChild(hoursHeader);
        headerRow.appendChild(milestoneHeader);
        table.appendChild(headerRow);

        // Add data rows in reverse order (newest first)
        history.slice().reverse().forEach(entry => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            const dateCell = document.createElement('td');
            const entryDate = new Date(entry.timestamp);
            dateCell.textContent = entryDate.toLocaleDateString() + ' ' + entryDate.toLocaleTimeString().substring(0, 5);
            dateCell.style.padding = '5px 0';

            const hoursCell = document.createElement('td');
            hoursCell.textContent = `${entry.totalHours}h`;
            hoursCell.style.textAlign = 'right';
            hoursCell.style.padding = '5px 0';

            const milestoneCell = document.createElement('td');
            milestoneCell.textContent = entry.milestone;
            milestoneCell.style.padding = '5px 0';

            row.appendChild(dateCell);
            row.appendChild(hoursCell);
            row.appendChild(milestoneCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }
}
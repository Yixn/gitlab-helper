// SummaryTabView.js - Manages the Summary tab UI

class SummaryTabView {
    constructor(uiManager) {
        this.uiManager = uiManager;
    }

    /**
     * Render or update the Summary tab with data
     * @param {Object} assigneeTimeMap - Map of assignee names to time estimates
     * @param {number} totalEstimate - Total time estimate in seconds
     * @param {number} cardsProcessed - Number of cards processed
     * @param {number} cardsWithTime - Number of cards with time estimates
     * @param {string} currentMilestone - Current milestone name
     */
    render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone) {
        const summaryContent = document.getElementById('assignee-time-summary-content');

        if (!summaryContent) return;

        // Clear existing content
        summaryContent.innerHTML = '';

        // Update status
        this.uiManager.updateStatus(`Processed ${cardsProcessed} tickets`);

        // Handle case with no data
        if (cardsWithTime === 0) {
            this.renderNoDataMessage(summaryContent);
            return;
        }

        // Convert seconds to hours for display
        const totalHours = (totalEstimate / 3600).toFixed(1);

        // Update the header to include total hours
        this.uiManager.updateHeader(`Summary ${totalHours}h`);

        // Show milestone info if available
        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }

        // Create and populate the data table
        this.renderDataTable(summaryContent, assigneeTimeMap, totalHours);
    }

    /**
     * Render message when no data is available
     * @param {HTMLElement} container - Container element
     */
    renderNoDataMessage(container) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No time estimate data found. Make sure the board is fully loaded and try again.';
        noDataMsg.style.color = '#666';
        container.appendChild(noDataMsg);

        const tipMsg = document.createElement('p');
        tipMsg.style.fontSize = '12px';
        tipMsg.style.fontStyle = 'italic';
        tipMsg.innerHTML = 'Tip: Try scrolling through all cards to ensure they are loaded before clicking Recalculate.';
        container.appendChild(tipMsg);

        // Update header to show 0h when no data found
        this.uiManager.updateHeader('Summary 0.0h');
    }

    /**
     * Render milestone information
     * @param {HTMLElement} container - Container element
     * @param {string} milestoneName - Name of the milestone
     */
    renderMilestoneInfo(container, milestoneName) {
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.marginBottom = '10px';
        milestoneInfo.style.fontSize = '13px';
        milestoneInfo.style.color = '#555';
        milestoneInfo.textContent = `Current Milestone: ${milestoneName}`;
        container.appendChild(milestoneInfo);
    }

    /**
     * Render data table with assignee time estimates
     * @param {HTMLElement} container - Container element
     * @param {Object} assigneeTimeMap - Map of assignee names to time estimates
     * @param {string} totalHours - Total hours formatted as string
     */
    renderDataTable(container, assigneeTimeMap, totalHours) {
        // Create table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Add total row at top
        const totalRow = document.createElement('tr');
        totalRow.style.borderBottom = '2px solid #ddd';
        totalRow.style.fontWeight = 'bold';

        const totalLabelCell = document.createElement('td');
        totalLabelCell.textContent = 'Total';
        totalLabelCell.style.padding = '5px 0';

        const totalValueCell = document.createElement('td');
        totalValueCell.textContent = `${totalHours}h`;
        totalValueCell.style.textAlign = 'right';
        totalValueCell.style.padding = '5px 0';

        totalRow.appendChild(totalLabelCell);
        totalRow.appendChild(totalValueCell);
        table.appendChild(totalRow);

        // Sort assignees by time (descending)
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
            return assigneeTimeMap[b] - assigneeTimeMap[a];
        });

        // Add a row for each assignee
        sortedAssignees.forEach(name => {
            const hours = (assigneeTimeMap[name] / 3600).toFixed(1);

            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.style.padding = '5px 0';

            const timeCell = document.createElement('td');
            timeCell.textContent = `${hours}h`;
            timeCell.style.textAlign = 'right';
            timeCell.style.padding = '5px 0';

            row.appendChild(nameCell);
            row.appendChild(timeCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }
}
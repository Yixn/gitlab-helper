// SummaryView.js - Manages the Summary tab UI
import { formatHours } from '../../core/Utils';

/**
 * View for the Summary tab
 */
export default class SummaryView {
    /**
     * Constructor for SummaryView
     * @param {Object} uiManager - Reference to the main UI manager
     */
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
     * @param {Object} boardData - Data for each board
     * @param {Object} boardAssigneeData - Assignee data for each board
     */
    render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');

        if (!summaryContent) return;

        // Clear existing content
        summaryContent.innerHTML = '';

        // Update board stats in the UI Manager
        this.uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: this.getClosedBoardCount()
        });

        // Handle case with no data
        if (cardsWithTime === 0) {
            this.renderNoDataMessage(summaryContent);
            return;
        }

        // Convert seconds to hours for display
        const totalHours = formatHours(totalEstimate);

        // Update the header to include total hours
        this.uiManager.updateHeader(`Summary ${totalHours}h`);

        // Show milestone info if available
        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }

        // Create and populate the data table with hour distribution
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);
    }

    /**
     * Count cards in "closed" or "done" boards
     * @returns {number} Count of cards in closed boards
     */
    getClosedBoardCount() {
        let closedCount = 0;
        const boardLists = document.querySelectorAll('.board-list');

        boardLists.forEach(boardList => {
            let boardTitle = '';

            try {
                // First attempt to get the title from the Vue component
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child =>
                        child.$props && child.$props.list && child.$props.list.title);

                    if (boardComponent && boardComponent.$props.list.title) {
                        boardTitle = boardComponent.$props.list.title.toLowerCase();
                    }
                }

                // Fallback to DOM if Vue component approach failed
                if (!boardTitle) {
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
                // Fallback to DOM
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim().toLowerCase();
                }
            }

            // Count cards in "closed" or "done" boards
            if (boardTitle.includes('done') || boardTitle.includes('closed') ||
                boardTitle.includes('complete') || boardTitle.includes('finished')) {
                const cards = boardList.querySelectorAll('.board-card');
                closedCount += cards.length;
            }
        });

        return closedCount;
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
     * Render data table with assignee time estimates and hour distribution
     * @param {HTMLElement} container - Container element
     * @param {Object} assigneeTimeMap - Map of assignee names to time estimates
     * @param {string} totalHours - Total hours formatted as string
     * @param {Object} boardData - Data for each board
     * @param {Object} boardAssigneeData - Assignee data for each board
     */
    renderDataTableWithDistribution(container, assigneeTimeMap, totalHours, boardData, boardAssigneeData) {
        // Create table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Get board names in order
        const boardNames = Object.keys(boardData || {});

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

        // Add distribution cell for total
        const totalDistributionCell = document.createElement('td');
        totalDistributionCell.style.textAlign = 'right';
        totalDistributionCell.style.padding = '5px 0 5px 15px';
        totalDistributionCell.style.color = '#666';
        totalDistributionCell.style.fontSize = '12px';

        // Create distribution for total across all boards
        if (boardNames.length > 0 && boardData) {
            const distributionElements = boardNames.map(boardName => {
                const hoursFloat = parseFloat(formatHours(boardData[boardName]?.timeEstimate || 0));
                const hours = Math.round(hoursFloat); // Round to integer

                const span = document.createElement('span');
                span.textContent = hours;
                span.style.marginLeft = '0px';

                // Style based on value
                if (hours === 0) {
                    span.style.color = '#aaa'; // Grey for zero values
                }

                // Make the last board green if greater than 0
                if (boardName === boardNames[boardNames.length - 1] && hours > 0) {
                    span.style.color = '#28a745'; // Green for last board with hours
                }

                return span;
            });

            // Add distribution elements with slashes between them
            distributionElements.forEach((span, index) => {
                totalDistributionCell.appendChild(span);
                if (index < distributionElements.length - 1) {
                    totalDistributionCell.appendChild(document.createTextNode('/'));
                }
            });
        }

        totalRow.appendChild(totalLabelCell);
        totalRow.appendChild(totalValueCell);
        totalRow.appendChild(totalDistributionCell);
        table.appendChild(totalRow);

        // Sort assignees by time (descending)
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
            return assigneeTimeMap[b] - assigneeTimeMap[a];
        });

        // Add a row for each assignee
        sortedAssignees.forEach(name => {
            const hours = formatHours(assigneeTimeMap[name]);

            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #eee';

            const nameCell = document.createElement('td');
            nameCell.textContent = name;
            nameCell.style.padding = '5px 0';

            const timeCell = document.createElement('td');
            timeCell.textContent = `${hours}h`;
            timeCell.style.textAlign = 'right';
            timeCell.style.padding = '5px 0';

            // Add distribution cell for this assignee
            const distributionCell = document.createElement('td');
            distributionCell.style.textAlign = 'right';
            distributionCell.style.padding = '5px 0 5px 15px';
            distributionCell.style.color = '#666';
            distributionCell.style.fontSize = '12px';

            // Create distribution for this assignee across all boards
            if (boardNames.length > 0 && boardAssigneeData) {
                const distributionElements = boardNames.map((boardName, index) => {
                    const assigneeInBoard = boardAssigneeData[boardName] &&
                        boardAssigneeData[boardName][name];
                    const hoursFloat = assigneeInBoard ?
                        parseFloat(formatHours(assigneeInBoard.timeEstimate)) : 0;
                    const hours = Math.round(hoursFloat); // Round to integer

                    const span = document.createElement('span');
                    span.textContent = hours;
                    span.style.marginLeft = '0px';

                    // Style based on value
                    if (hours === 0) {
                        span.style.color = '#aaa'; // Grey for zero values
                    }

                    // Make the last board green if greater than 0
                    if (index === boardNames.length - 1 && hours > 0) {
                        span.style.color = '#28a745'; // Green for last board with hours
                    }

                    return span;
                });

                // Add distribution elements with slashes between them
                distributionElements.forEach((span, index) => {
                    distributionCell.appendChild(span);
                    if (index < distributionElements.length - 1) {
                        distributionCell.appendChild(document.createTextNode('/'));
                    }
                });
            }

            row.appendChild(nameCell);
            row.appendChild(timeCell);
            row.appendChild(distributionCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }
}
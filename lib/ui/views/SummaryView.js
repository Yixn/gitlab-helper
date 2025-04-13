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
        summaryContent.innerHTML = '';
        this.uiManager.updateBoardStats({
            totalCards: cardsProcessed,
            withTimeCards: cardsWithTime,
            closedCards: this.getClosedBoardCount()
        });
        if (cardsWithTime === 0) {
            this.renderNoDataMessage(summaryContent);
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('summary-tab');
            }
            return;
        }
        const totalHours = formatHours(totalEstimate);
        let doneHours = 0;
        for (const boardName in boardData) {
            const lowerBoardName = boardName.toLowerCase();
            if (lowerBoardName.includes('done') ||
                lowerBoardName.includes('closed') ||
                lowerBoardName.includes('complete') ||
                lowerBoardName.includes('finished')) {

                doneHours += boardData[boardName].timeEstimate || 0;
            }
        }
        const doneHoursFormatted = formatHours(doneHours);
        this.uiManager.updateHeader(
            `Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`
        );
        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('summary-tab');
        }
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
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child =>
                        child.$props && child.$props.list && child.$props.list.title);

                    if (boardComponent && boardComponent.$props.list.title) {
                        boardTitle = boardComponent.$props.list.title.toLowerCase();
                    }
                }
                if (!boardTitle) {
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim().toLowerCase();
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim().toLowerCase();
                }
            }
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
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        const boardNames = Object.keys(boardData || {});
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
        const totalDistributionCell = document.createElement('td');
        totalDistributionCell.style.textAlign = 'right';
        totalDistributionCell.style.padding = '5px 0 5px 15px';
        totalDistributionCell.style.color = '#666';
        totalDistributionCell.style.fontSize = '12px';
        if (boardNames.length > 0 && boardData) {
            const distributionValues = boardNames.map(boardName => {
                const boardDataObj = boardData[boardName] || { timeEstimate: 0 };
                const hoursFloat = parseFloat(formatHours(boardDataObj.timeEstimate || 0));
                return Math.round(hoursFloat); // Round to integer
            });
            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;
                if (hours === 0) {
                    spanHTML += `color:#aaa;`; // Grey for zero values
                }
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`; // Green for last board with hours
                }

                spanHTML += `">${hours}h</span>`;
                return spanHTML;
            }).join('/');

            totalDistributionCell.innerHTML = distributionText;
        }

        totalRow.appendChild(totalLabelCell);
        totalRow.appendChild(totalValueCell);
        totalRow.appendChild(totalDistributionCell);
        table.appendChild(totalRow);
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
            return assigneeTimeMap[b] - assigneeTimeMap[a];
        });
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
            const distributionCell = document.createElement('td');
            distributionCell.style.textAlign = 'right';
            distributionCell.style.padding = '5px 0 5px 15px';
            distributionCell.style.color = '#666';
            distributionCell.style.fontSize = '12px';
            if (boardNames.length > 0 && boardAssigneeData) {
                const distributionValues = boardNames.map(boardName => {
                    const boardAssignees = boardAssigneeData[boardName] || {};
                    const assigneeInBoard = boardAssignees[name] || { timeEstimate: 0 };
                    const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
                    return Math.round(hoursFloat); // Round to integer
                });
                const distributionText = distributionValues.map((hours, index) => {
                    let spanHTML = `<span style="`;
                    if (hours === 0) {
                        spanHTML += `color:#aaa;`; // Grey for zero values
                    }
                    if (index === distributionValues.length - 1 && hours > 0) {
                        spanHTML += `color:#28a745;`; // Green for last board with hours
                    }

                    spanHTML += `">${hours}h</span>`;
                    return spanHTML;
                }).join('/');

                distributionCell.innerHTML = distributionText;
            }

            row.appendChild(nameCell);
            row.appendChild(timeCell);
            row.appendChild(distributionCell);
            table.appendChild(row);
        });

        container.appendChild(table);
    }
}
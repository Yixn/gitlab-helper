import { formatHours } from '../../core/Utils';

/**
 * View for the Boards tab
 */
export default class BoardsView {
    /**
     * Constructor for BoardsView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
    }
    /**
     * Render or update the Boards tab with data
     * @param {Object} boardData - Map of board names to board data
     * @param {Object} boardAssigneeData - Map of board names to assignee data
     */
    render(boardData, boardAssigneeData) {
        const boardsContent = document.getElementById('boards-time-summary-content');
        if (!boardsContent) return;

        // Clear existing content
        boardsContent.innerHTML = '';

        // Create accordion-style list of boards
        const boardsList = document.createElement('div');
        boardsList.className = 'boards-list-summary';

        // Sort boards by time estimate (descending)
        const sortedBoards = Object.keys(boardData).sort((a, b) => {
            return boardData[b].timeEstimate - boardData[a].timeEstimate;
        });

        // Create a section for each board
        sortedBoards.forEach(boardName => {
            const boardSection = this.createBoardSection(
                boardName,
                boardData[boardName],
                boardAssigneeData[boardName]
            );
            boardsList.appendChild(boardSection);
        });

        boardsContent.appendChild(boardsList);

        // Remove loading screen
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('boards-tab');
        }
    }

    /**
     * Create a board section with collapsible details
     * @param {string} boardName - Name of the board
     * @param {Object} boardData - Data for this board
     * @param {Object} assigneeData - Assignee data for this board
     * @returns {HTMLElement} Board section element
     */
    createBoardSection(boardName, boardData, assigneeData) {
        const boardHours = formatHours(boardData.timeEstimate);

        // Create board section container
        const boardSection = document.createElement('div');
        boardSection.className = 'board-section';
        boardSection.style.marginBottom = '15px';

        // Board header with expand/collapse functionality
        const boardHeader = document.createElement('div');
        boardHeader.className = 'board-header';
        boardHeader.style.display = 'flex';
        boardHeader.style.justifyContent = 'space-between';
        boardHeader.style.padding = '5px';
        boardHeader.style.backgroundColor = '#f5f5f5';
        boardHeader.style.borderRadius = '3px';
        boardHeader.style.cursor = 'pointer';
        boardHeader.style.fontWeight = 'bold';

        // Board details area (initially hidden)
        const boardDetails = document.createElement('div');
        boardDetails.className = 'board-details';
        boardDetails.style.display = 'none';
        boardDetails.style.marginTop = '5px';
        boardDetails.style.marginLeft = '10px';

        // Toggle details when header is clicked
        boardHeader.addEventListener('click', () => {
            if (boardDetails.style.display === 'none') {
                boardDetails.style.display = 'block';
                boardToggle.textContent = '▼';
            } else {
                boardDetails.style.display = 'none';
                boardToggle.textContent = '▶';
            }
        });

        // Board info text
        const boardInfo = document.createElement('div');
        boardInfo.textContent = `${boardName} (${boardData.tickets} tickets, ${boardHours}h)`;

        // Toggle indicator
        const boardToggle = document.createElement('span');
        boardToggle.textContent = '▶';
        boardToggle.style.marginLeft = '5px';

        boardHeader.appendChild(boardInfo);
        boardHeader.appendChild(boardToggle);

        // Add assignee table if we have data
        if (assigneeData) {
            boardDetails.appendChild(
                this.createAssigneeTable(assigneeData)
            );
        }

        boardSection.appendChild(boardHeader);
        boardSection.appendChild(boardDetails);

        return boardSection;
    }

    /**
     * Create a table showing assignee data for a board
     * @param {Object} assigneeData - Assignee data for a board
     * @returns {HTMLElement} Table element
     */
    createAssigneeTable(assigneeData) {
        const assigneeTable = document.createElement('table');
        assigneeTable.style.width = '100%';
        assigneeTable.style.borderCollapse = 'collapse';
        assigneeTable.style.marginTop = '5px';

        // Table headers
        const headerRow = document.createElement('tr');
        headerRow.style.borderBottom = '1px solid #ddd';

        const nameHeader = document.createElement('th');
        nameHeader.textContent = 'Assignee';
        nameHeader.style.textAlign = 'left';
        nameHeader.style.padding = '3px 0';

        const ticketsHeader = document.createElement('th');
        ticketsHeader.textContent = 'Tickets';
        ticketsHeader.style.textAlign = 'right';
        ticketsHeader.style.padding = '3px 5px';

        const timeHeader = document.createElement('th');
        timeHeader.textContent = 'Hours';
        timeHeader.style.textAlign = 'right';
        timeHeader.style.padding = '3px 0';

        headerRow.appendChild(nameHeader);
        headerRow.appendChild(ticketsHeader);
        headerRow.appendChild(timeHeader);
        assigneeTable.appendChild(headerRow);

        // Sort assignees by time for this board
        const boardAssignees = Object.keys(assigneeData).sort((a, b) => {
            return assigneeData[b].timeEstimate - assigneeData[a].timeEstimate;
        });

        // Add a row for each assignee
        boardAssignees.forEach(assigneeName => {
            const assigneeInfo = assigneeData[assigneeName];
            const assigneeHours = formatHours(assigneeInfo.timeEstimate);

            const assigneeRow = document.createElement('tr');
            assigneeRow.style.borderBottom = '1px solid #eee';
            const nameCell = document.createElement('td');
            nameCell.textContent = assigneeName;
            nameCell.style.padding = '3px 0';

            const ticketsCell = document.createElement('td');
            ticketsCell.textContent = assigneeInfo.tickets;
            ticketsCell.style.textAlign = 'right';
            ticketsCell.style.padding = '3px 5px';

            const timeCell = document.createElement('td');
            timeCell.textContent = `${assigneeHours}h`;
            timeCell.style.textAlign = 'right';
            timeCell.style.padding = '3px 0';

            assigneeRow.appendChild(nameCell);
            assigneeRow.appendChild(ticketsCell);
            assigneeRow.appendChild(timeCell);
            assigneeTable.appendChild(assigneeRow);
        });

        return assigneeTable;
    }
}
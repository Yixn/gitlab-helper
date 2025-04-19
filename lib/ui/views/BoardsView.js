import { formatHours } from '../../core/Utils';
export default class BoardsView {
  constructor(uiManager) {
    this.uiManager = uiManager;
  }
  render(boardData, boardAssigneeData) {
    const boardsContent = document.getElementById('boards-time-summary-content');
    if (!boardsContent) return;
    boardsContent.innerHTML = '';
    const boardsList = document.createElement('div');
    boardsList.className = 'boards-list-summary';
    const nonEmptyBoards = Object.keys(boardData).filter(boardName => {
      return boardData[boardName].tickets > 0 && boardData[boardName].timeEstimate > 0;
    });
    const sortedBoards = nonEmptyBoards.sort((a, b) => {
      return boardData[b].timeEstimate - boardData[a].timeEstimate;
    });
    if (sortedBoards.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No boards with time estimates found.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      boardsList.appendChild(emptyMessage);
    } else {
      sortedBoards.forEach(boardName => {
        const boardSection = this.createBoardSection(boardName, boardData[boardName], boardAssigneeData[boardName]);
        boardsList.appendChild(boardSection);
      });
    }
    boardsContent.appendChild(boardsList);
    if (this.uiManager && this.uiManager.removeLoadingScreen) {
      this.uiManager.removeLoadingScreen('boards-tab');
    }
  }
  createBoardSection(boardName, boardData, assigneeData) {
    const boardHours = formatHours(boardData.timeEstimate);
    const boardSection = document.createElement('div');
    boardSection.className = 'board-section';
    boardSection.style.marginBottom = '15px';
    const boardHeader = document.createElement('div');
    boardHeader.className = 'board-header';
    Object.assign(boardHeader.style, {
      display: 'flex',
      justifyContent: 'space-between',
      padding: '5px',
      backgroundColor: '#f5f5f5',
      borderRadius: '3px',
      cursor: 'pointer',
      fontWeight: 'bold'
    });
    const boardDetails = document.createElement('div');
    boardDetails.className = 'board-details';
    boardDetails.style.display = 'none';
    boardDetails.style.marginTop = '5px';
    boardDetails.style.marginLeft = '10px';
    boardHeader.addEventListener('click', () => {
      const isVisible = boardDetails.style.display !== 'none';
      boardDetails.style.display = isVisible ? 'none' : 'block';
      boardToggle.textContent = isVisible ? '▶' : '▼';
    });
    const boardInfo = document.createElement('div');
    boardInfo.textContent = `${boardName} (${boardData.tickets} tickets, ${boardHours}h)`;
    const boardToggle = document.createElement('span');
    boardToggle.textContent = '▶';
    boardToggle.style.marginLeft = '5px';
    boardHeader.appendChild(boardInfo);
    boardHeader.appendChild(boardToggle);
    if (assigneeData && Object.keys(assigneeData).length > 0) {
      boardDetails.appendChild(this.createAssigneeTable(assigneeData));
    } else {
      const noAssigneesMsg = document.createElement('div');
      noAssigneesMsg.textContent = 'No assignee data available for this board.';
      noAssigneesMsg.style.padding = '8px 0';
      noAssigneesMsg.style.color = '#666';
      noAssigneesMsg.style.fontStyle = 'italic';
      boardDetails.appendChild(noAssigneesMsg);
    }
    boardSection.appendChild(boardHeader);
    boardSection.appendChild(boardDetails);
    return boardSection;
  }
  createAssigneeTable(assigneeData) {
    const assigneeTable = document.createElement('table');
    assigneeTable.style.width = '100%';
    assigneeTable.style.borderCollapse = 'collapse';
    assigneeTable.style.marginTop = '5px';
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
    const boardAssignees = Object.keys(assigneeData).sort((a, b) => {
      return assigneeData[b].timeEstimate - assigneeData[a].timeEstimate;
    });
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
// UI Components for GitLab Assignee Time Summary

// Create summary container
function createSummaryContainer() {
    // Main container div
    const container = document.createElement('div');
    container.id = 'assignee-time-summary';
    container.style.position = 'fixed';
    container.style.bottom = '15px';
    container.style.right = '15px';
    container.style.backgroundColor = 'white';
    container.style.border = '1px solid #ddd';
    container.style.borderRadius = '4px';
    container.style.padding = '10px';
    container.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
    container.style.zIndex = '1000';
    container.style.maxHeight = '80vh';
    container.style.overflow = 'hidden';
    container.style.fontSize = '14px';
    container.style.width = '300px'; // Increased width for more content
    container.style.transition = 'height 0.3s ease-in-out';

    // Content wrapper (for collapsing)
    const contentWrapper = document.createElement('div');
    contentWrapper.id = 'assignee-time-summary-wrapper';
    contentWrapper.style.display = 'block';
    contentWrapper.style.maxHeight = '70vh';
    contentWrapper.style.overflowY = 'auto';

    // Create header with title and buttons
    const headerDiv = document.createElement('div');
    headerDiv.style.display = 'flex';
    headerDiv.style.justifyContent = 'space-between';
    headerDiv.style.alignItems = 'center';
    headerDiv.style.marginBottom = '0px';
    headerDiv.style.cursor = 'pointer';

    // Add click event to header for collapsing
    headerDiv.addEventListener('click', function(e) {
        // Don't collapse if clicking on buttons
        if (e.target === recalculateBtn || e.target === collapseBtn) {
            return;
        }
        toggleCollapse();
    });

    const header = document.createElement('h3');
    header.id = 'assignee-time-summary-header';
    header.textContent = 'Summary';
    header.style.margin = '0';
    header.style.fontSize = '16px';

    // Button container (for multiple buttons)
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.gap = '5px';

    // Create recalculate button
    const recalculateBtn = document.createElement('button');
    recalculateBtn.textContent = '🔄';
    recalculateBtn.title = 'Recalculate';
    recalculateBtn.style.padding = '3px 6px';
    recalculateBtn.style.fontSize = '12px';
    recalculateBtn.style.backgroundColor = '#1f75cb';
    recalculateBtn.style.color = 'white';
    recalculateBtn.style.border = 'none';
    recalculateBtn.style.borderRadius = '3px';
    recalculateBtn.style.cursor = 'pointer';
    recalculateBtn.onclick = function(e) {
        e.stopPropagation();
        updateSummary(true); // Pass true to force history update

        // Visual feedback that recalculation happened
        recalculateBtn.textContent = '✓';
        setTimeout(() => {
            recalculateBtn.textContent = '🔄';
        }, 1000);
    };

    // Create collapse button
    const collapseBtn = document.createElement('button');
    collapseBtn.textContent = '▼';
    collapseBtn.title = 'Collapse/Expand';
    collapseBtn.style.padding = '3px 6px';
    collapseBtn.style.fontSize = '12px';
    collapseBtn.style.backgroundColor = '#777';
    collapseBtn.style.color = 'white';
    collapseBtn.style.border = 'none';
    collapseBtn.style.borderRadius = '3px';
    collapseBtn.style.cursor = 'pointer';
    collapseBtn.onclick = function(e) {
        e.stopPropagation();
        toggleCollapse();
    };

    // Function to toggle collapse state
    function toggleCollapse() {
        const wrapper = document.getElementById('assignee-time-summary-wrapper');
        if (wrapper.style.display === 'none') {
            // Expand
            wrapper.style.display = 'block';
            collapseBtn.textContent = '▼';
            container.style.height = '';
            localStorage.setItem('gitlabTimeSummaryCollapsed', 'false');
        } else {
            // Collapse
            wrapper.style.display = 'none';
            collapseBtn.textContent = '▲';
            container.style.height = 'auto';
            localStorage.setItem('gitlabTimeSummaryCollapsed', 'true');
        }
    }

    buttonContainer.appendChild(recalculateBtn);
    buttonContainer.appendChild(collapseBtn);
    headerDiv.appendChild(header);
    headerDiv.appendChild(buttonContainer);
    container.appendChild(headerDiv);

    // All content goes in the wrapper for collapsing
    // Status indicator
    const statusDiv = document.createElement('div');
    statusDiv.id = 'assignee-time-summary-status';
    statusDiv.style.fontSize = '12px';
    statusDiv.style.color = '#666';
    statusDiv.style.marginBottom = '10px';
    statusDiv.style.marginTop = '10px';
    statusDiv.textContent = 'Initializing...';
    contentWrapper.appendChild(statusDiv);

    // Create tab navigation for different views
    const tabContainer = document.createElement('div');
    tabContainer.style.display = 'flex';
    tabContainer.style.marginBottom = '10px';
    tabContainer.style.borderBottom = '1px solid #ddd';

    const summaryTab = document.createElement('div');
    summaryTab.textContent = 'Summary';
    summaryTab.dataset.tab = 'summary';
    summaryTab.style.padding = '5px 10px';
    summaryTab.style.cursor = 'pointer';
    summaryTab.style.borderBottom = '2px solid #1f75cb';
    summaryTab.style.fontWeight = 'bold';

    const boardsTab = document.createElement('div');
    boardsTab.textContent = 'Boards';
    boardsTab.dataset.tab = 'boards';
    boardsTab.style.padding = '5px 10px';
    boardsTab.style.cursor = 'pointer';

    const historyTab = document.createElement('div');
    historyTab.textContent = 'History';
    historyTab.dataset.tab = 'history';
    historyTab.style.padding = '5px 10px';
    historyTab.style.cursor = 'pointer';

    // Tab click handlers
    summaryTab.addEventListener('click', function() {
        switchTab('summary');
        summaryTab.style.borderBottom = '2px solid #1f75cb';
        summaryTab.style.fontWeight = 'bold';
        boardsTab.style.borderBottom = 'none';
        boardsTab.style.fontWeight = 'normal';
        historyTab.style.borderBottom = 'none';
        historyTab.style.fontWeight = 'normal';
    });

    boardsTab.addEventListener('click', function() {
        switchTab('boards');
        boardsTab.style.borderBottom = '2px solid #1f75cb';
        boardsTab.style.fontWeight = 'bold';
        summaryTab.style.borderBottom = 'none';
        summaryTab.style.fontWeight = 'normal';
        historyTab.style.borderBottom = 'none';
        historyTab.style.fontWeight = 'normal';
    });

    historyTab.addEventListener('click', function() {
        switchTab('history');
        historyTab.style.borderBottom = '2px solid #1f75cb';
        historyTab.style.fontWeight = 'bold';
        summaryTab.style.borderBottom = 'none';
        summaryTab.style.fontWeight = 'normal';
        boardsTab.style.borderBottom = 'none';
        boardsTab.style.fontWeight = 'normal';
    });

    tabContainer.appendChild(summaryTab);
    tabContainer.appendChild(boardsTab);
    tabContainer.appendChild(historyTab);
    contentWrapper.appendChild(tabContainer);

    // Content areas for each tab
    const summaryContent = document.createElement('div');
    summaryContent.id = 'assignee-time-summary-content';
    summaryContent.style.display = 'block';
    contentWrapper.appendChild(summaryContent);

    const boardsContent = document.createElement('div');
    boardsContent.id = 'boards-time-summary-content';
    boardsContent.style.display = 'none';
    contentWrapper.appendChild(boardsContent);

    const historyContent = document.createElement('div');
    historyContent.id = 'history-time-summary-content';
    historyContent.style.display = 'none';
    contentWrapper.appendChild(historyContent);

    function switchTab(tabName) {
        document.getElementById('assignee-time-summary-content').style.display = 'none';
        document.getElementById('boards-time-summary-content').style.display = 'none';
        document.getElementById('history-time-summary-content').style.display = 'none';

        if (tabName === 'summary') {
            document.getElementById('assignee-time-summary-content').style.display = 'block';
        } else if (tabName === 'boards') {
            document.getElementById('boards-time-summary-content').style.display = 'block';
        } else if (tabName === 'history') {
            document.getElementById('history-time-summary-content').style.display = 'block';
            renderHistory();
        }
    }

    container.appendChild(contentWrapper);
    document.body.appendChild(container);

    // Check if it should be collapsed initially (from localStorage)
    if (localStorage.getItem('gitlabTimeSummaryCollapsed') === 'true') {
        contentWrapper.style.display = 'none';
        collapseBtn.textContent = '▲';
        container.style.height = 'auto';
    }

    return container;
}

// Update the Summary Tab
function updateSummaryTab(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone) {
    const summaryContent = document.getElementById('assignee-time-summary-content');
    const statusDiv = document.getElementById('assignee-time-summary-status');

    if (!summaryContent) return;

    // Clear existing content
    summaryContent.innerHTML = '';

    if (statusDiv) {
        statusDiv.textContent = `Processed ${cardsProcessed} tickets`;
    }

    // If no data found, show message
    if (cardsWithTime === 0) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No time estimate data found. Make sure the board is fully loaded and try again.';
        noDataMsg.style.color = '#666';
        summaryContent.appendChild(noDataMsg);

        const tipMsg = document.createElement('p');
        tipMsg.style.fontSize = '12px';
        tipMsg.style.fontStyle = 'italic';
        tipMsg.innerHTML = 'Tip: Try scrolling through all cards to ensure they are loaded before clicking Recalculate.';
        summaryContent.appendChild(tipMsg);

        // Update header to show 0h when no data found
        const headerElement = document.getElementById('assignee-time-summary-header');
        if (headerElement) {
            headerElement.textContent = 'Summary 0.0h';
        }

        return;
    }

    // Convert seconds to hours for display
    const totalHours = (totalEstimate / 3600).toFixed(1);

    // Update the header to include total hours
    const headerElement = document.getElementById('assignee-time-summary-header');
    if (headerElement) {
        headerElement.textContent = `Summary ${totalHours}h`;
    }

    // Show milestone info if available
    if (currentMilestone) {
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.marginBottom = '10px';
        milestoneInfo.style.fontSize = '13px';
        milestoneInfo.style.color = '#555';
        milestoneInfo.textContent = `Current Milestone: ${currentMilestone}`;
        summaryContent.appendChild(milestoneInfo);
    }

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

    summaryContent.appendChild(table);
}

// Update the Boards Tab
function updateBoardsTab(boardData, boardAssigneeData) {
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

    sortedBoards.forEach(boardName => {
        const boardHours = (boardData[boardName].timeEstimate / 3600).toFixed(1);

        // Create board header
        const boardSection = document.createElement('div');
        boardSection.className = 'board-section';
        boardSection.style.marginBottom = '15px';

        // Board header with expand/collapse
        const boardHeader = document.createElement('div');
        boardHeader.className = 'board-header';
        boardHeader.style.display = 'flex';
        boardHeader.style.justifyContent = 'space-between';
        boardHeader.style.padding = '5px';
        boardHeader.style.backgroundColor = '#f5f5f5';
        boardHeader.style.borderRadius = '3px';
        boardHeader.style.cursor = 'pointer';
        boardHeader.style.fontWeight = 'bold';

        // Make the header collapsible
        const boardDetails = document.createElement('div');
        boardDetails.className = 'board-details';
        boardDetails.style.display = 'none';
        boardDetails.style.marginTop = '5px';
        boardDetails.style.marginLeft = '10px';

        boardHeader.addEventListener('click', () => {
            if (boardDetails.style.display === 'none') {
                boardDetails.style.display = 'block';
                boardToggle.textContent = '▼';
            } else {
                boardDetails.style.display = 'none';
                boardToggle.textContent = '▶';
            }
        });

        const boardInfo = document.createElement('div');
        boardInfo.textContent = `${boardName} (${boardData[boardName].tickets} tickets, ${boardHours}h)`;

        const boardToggle = document.createElement('span');
        boardToggle.textContent = '▶';
        boardToggle.style.marginLeft = '5px';

        boardHeader.appendChild(boardInfo);
        boardHeader.appendChild(boardToggle);

        // Board assignee details table
        if (boardAssigneeData[boardName]) {
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
            const boardAssignees = Object.keys(boardAssigneeData[boardName]).sort((a, b) => {
                return boardAssigneeData[boardName][b].timeEstimate - boardAssigneeData[boardName][a].timeEstimate;
            });

            boardAssignees.forEach(assigneeName => {
                const assigneeData = boardAssigneeData[boardName][assigneeName];
                const assigneeHours = (assigneeData.timeEstimate / 3600).toFixed(1);

                const assigneeRow = document.createElement('tr');
                assigneeRow.style.borderBottom = '1px solid #eee';

                const nameCell = document.createElement('td');
                nameCell.textContent = assigneeName;
                nameCell.style.padding = '3px 0';

                const ticketsCell = document.createElement('td');
                ticketsCell.textContent = assigneeData.tickets;
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

            boardDetails.appendChild(assigneeTable);
        }

        boardSection.appendChild(boardHeader);
        boardSection.appendChild(boardDetails);
        boardsList.appendChild(boardSection);
    });

    boardsContent.appendChild(boardsList);
}

// Add these functions to your ui.js file

// Create API tab content
function updateApiInfoTab() {
    const apiContent = document.getElementById('api-info-content');
    if (!apiContent) return;

    // Clear previous content
    apiContent.innerHTML = '';

    // Create header
    const header = document.createElement('h4');
    header.textContent = 'GitLab API Tools';
    header.style.margin = '0 0 10px 0';
    apiContent.appendChild(header);

    // Create loading indicator
    const loadingDiv = document.createElement('div');
    loadingDiv.id = 'api-loading';
    loadingDiv.textContent = 'Loading user info...';
    loadingDiv.style.fontSize = '12px';
    loadingDiv.style.color = '#666';
    loadingDiv.style.fontStyle = 'italic';
    apiContent.appendChild(loadingDiv);

    // Add user info section
    gitlabApi.getCurrentUser()
        .then(user => {
            // Remove loading indicator
            document.getElementById('api-loading')?.remove();

            // Add user info
            const userInfo = document.createElement('div');
            userInfo.classList.add('api-section');
            userInfo.style.marginBottom = '15px';

            const userHeader = document.createElement('div');
            userHeader.style.fontWeight = 'bold';
            userHeader.style.marginBottom = '5px';
            userHeader.textContent = 'Current User:';
            userInfo.appendChild(userHeader);

            const userName = document.createElement('div');
            userName.textContent = `${user.name} (${user.username})`;
            userInfo.appendChild(userName);

            apiContent.appendChild(userInfo);

            // Add utility sections after user loaded
            addApiUtilitySection(apiContent);
        })
        .catch(error => {
            const errorDiv = document.getElementById('api-loading');
            if (errorDiv) {
                errorDiv.textContent = `Error: ${error.message}`;
                errorDiv.style.color = '#dc3545';
            }
            console.error("Error fetching user info:", error);

            // Still add utility section even if user info fails
            addApiUtilitySection(apiContent);
        });
}

// Add utility section to API tab
function addApiUtilitySection(apiContent) {
    // Create comment tool section
    const commentSection = document.createElement('div');
    commentSection.classList.add('api-section');
    commentSection.style.marginBottom = '15px';
    commentSection.style.padding = '10px';
    commentSection.style.backgroundColor = '#f5f5f5';
    commentSection.style.borderRadius = '4px';

    const commentHeader = document.createElement('div');
    commentHeader.style.fontWeight = 'bold';
    commentHeader.style.marginBottom = '10px';
    commentHeader.textContent = 'Add Comment to Selected Issue';
    commentSection.appendChild(commentHeader);

    // Instructions
    const instructions = document.createElement('div');
    instructions.style.fontSize = '12px';
    instructions.style.marginBottom = '10px';
    instructions.textContent = 'Select a card on the board, then enter your comment below:';
    commentSection.appendChild(instructions);

    // Selected issue display
    const selectedIssue = document.createElement('div');
    selectedIssue.id = 'selected-issue-display';
    selectedIssue.style.fontSize = '12px';
    selectedIssue.style.color = '#666';
    selectedIssue.style.marginBottom = '10px';
    selectedIssue.textContent = 'No issue selected';
    commentSection.appendChild(selectedIssue);

    // Comment textarea
    const commentInput = document.createElement('textarea');
    commentInput.id = 'issue-comment-input';
    commentInput.placeholder = 'Enter your comment here...';
    commentInput.style.width = '100%';
    commentInput.style.padding = '5px';
    commentInput.style.marginBottom = '10px';
    commentInput.style.borderRadius = '3px';
    commentInput.style.border = '1px solid #ccc';
    commentInput.style.minHeight = '60px';
    commentSection.appendChild(commentInput);

    // Submit button
    const submitBtn = document.createElement('button');
    submitBtn.textContent = 'Add Comment';
    submitBtn.style.padding = '5px 10px';
    submitBtn.style.backgroundColor = '#1f75cb';
    submitBtn.style.color = 'white';
    submitBtn.style.border = 'none';
    submitBtn.style.borderRadius = '3px';
    submitBtn.style.cursor = 'pointer';
    submitBtn.onclick = submitIssueComment;
    commentSection.appendChild(submitBtn);

    // Status message
    const statusMsg = document.createElement('div');
    statusMsg.id = 'comment-status';
    statusMsg.style.fontSize = '12px';
    statusMsg.style.marginTop = '5px';
    statusMsg.style.fontStyle = 'italic';
    commentSection.appendChild(statusMsg);

    apiContent.appendChild(commentSection);

    // Add select issue button
    const selectBtn = document.createElement('button');
    selectBtn.textContent = 'Select Issue';
    selectBtn.style.padding = '5px 10px';
    selectBtn.style.backgroundColor = '#6c757d';
    selectBtn.style.color = 'white';
    selectBtn.style.border = 'none';
    selectBtn.style.borderRadius = '3px';
    selectBtn.style.cursor = 'pointer';
    selectBtn.style.marginRight = '5px';
    selectBtn.onclick = selectIssueFromBoard;
    commentSection.insertBefore(selectBtn, submitBtn);

    // Add issue selection mode instruction
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            exitSelectionMode();
        }
    });
}

// Global variable to store selected issue
let selectedIssue = null;
let isSelectingIssue = false;

// Function to enter issue selection mode
function selectIssueFromBoard() {
    isSelectingIssue = true;

    // Update status message
    const statusMsg = document.getElementById('comment-status');
    if (statusMsg) {
        statusMsg.textContent = 'Click on a card to select an issue. Press ESC to cancel.';
        statusMsg.style.color = '#1f75cb';
    }

    // Add temporary overlay for visual indication
    const overlay = document.createElement('div');
    overlay.id = 'selection-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.1)';
    overlay.style.zIndex = '999';
    overlay.style.cursor = 'crosshair';
    overlay.style.pointerEvents = 'none';
    document.body.appendChild(overlay);

    // Add click listeners to all cards
    const boardCards = document.querySelectorAll('.board-card');
    boardCards.forEach(card => {
        card.style.cursor = 'pointer';
        card.dataset.originalZIndex = card.style.zIndex || '';
        card.style.zIndex = '1000';
        card.addEventListener('click', handleCardSelection);
    });
}

// Function to handle card selection
function handleCardSelection(e) {
    if (!isSelectingIssue) return;

    const card = e.currentTarget;
    const issueItem = gitlabApi.getIssueItemFromCard(card);

    if (issueItem) {
        selectedIssue = issueItem;
        const displayEl = document.getElementById('selected-issue-display');
        if (displayEl) {
            displayEl.textContent = `Selected: #${issueItem.iid} - ${issueItem.title}`;
            displayEl.style.color = '#1f75cb';
            displayEl.style.fontWeight = 'bold';
        }
    }

    exitSelectionMode();
    e.stopPropagation();
}

// Function to exit selection mode
function exitSelectionMode() {
    isSelectingIssue = false;

    // Remove overlay
    document.getElementById('selection-overlay')?.remove();

    // Remove click listeners
    const boardCards = document.querySelectorAll('.board-card');
    boardCards.forEach(card => {
        card.style.cursor = '';
        card.style.zIndex = card.dataset.originalZIndex || '';
        card.removeEventListener('click', handleCardSelection);
    });

    // Update status
    const statusMsg = document.getElementById('comment-status');
    if (statusMsg) {
        if (selectedIssue) {
            statusMsg.textContent = 'Issue selected. Enter your comment and click "Add Comment".';
            statusMsg.style.color = 'green';
        } else {
            statusMsg.textContent = 'Selection canceled. Try again.';
            statusMsg.style.color = '#666';
        }
    }
}

// Function to submit comment
function submitIssueComment() {
    const commentEl = document.getElementById('issue-comment-input');
    const statusEl = document.getElementById('comment-status');

    if (!selectedIssue) {
        statusEl.textContent = 'Error: No issue selected.';
        statusEl.style.color = '#dc3545';
        return;
    }

    const comment = commentEl.value.trim();
    if (!comment) {
        statusEl.textContent = 'Error: Comment cannot be empty.';
        statusEl.style.color = '#dc3545';
        return;
    }

    // Update status
    statusEl.textContent = 'Submitting comment...';
    statusEl.style.color = '#1f75cb';

    // Submit comment
    gitlabApi.addComment(selectedIssue, comment)
        .then(response => {
            statusEl.textContent = 'Comment added successfully!';
            statusEl.style.color = 'green';

            // Clear the input
            commentEl.value = '';

            // Clear selected issue after 3 seconds
            setTimeout(() => {
                selectedIssue = null;
                document.getElementById('selected-issue-display').textContent = 'No issue selected';
                document.getElementById('selected-issue-display').style.color = '#666';
                document.getElementById('selected-issue-display').style.fontWeight = 'normal';
                statusEl.textContent = '';
            }, 3000);
        })
        .catch(error => {
            statusEl.textContent = `Error: ${error.message}`;
            statusEl.style.color = '#dc3545';
            console.error('Failed to add comment:', error);
        });
}
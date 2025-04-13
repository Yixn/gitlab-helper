/**
 * View for the Sprint Management tab
 */
export default class SprintManagementView {
    /**
     * Constructor for SprintManagementView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.notification = null;
        try {
            // Import Notification if available
            if (typeof Notification === 'function') {
                this.notification = new Notification({
                    position: 'bottom-right',
                    duration: 3000
                });
            }
        } catch (e) {
            console.error('Error initializing notification:', e);
        }
    }

    /**
     * Render or update the Sprint Management tab with tools
     */
    render() {
        const sprintManagementContent = document.getElementById('sprint-management-content');
        if (!sprintManagementContent) return;

        sprintManagementContent.innerHTML = '';

        // Create the copy button directly
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy Closed Issue Names';
        copyButton.className = 'copy-tickets-button';
        copyButton.style.padding = '10px 16px';
        copyButton.style.backgroundColor = '#1f75cb';
        copyButton.style.color = 'white';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '4px';
        copyButton.style.cursor = 'pointer';
        copyButton.style.fontWeight = 'bold';
        copyButton.style.transition = 'background-color 0.2s ease';
        copyButton.style.margin = '20px';

        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.backgroundColor = '#1a63ac';
        });

        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.backgroundColor = '#1f75cb';
        });

        copyButton.addEventListener('click', () => this.copyClosedTickets());

        sprintManagementContent.appendChild(copyButton);

        // Create status message (hidden initially)
        const statusMsg = document.createElement('div');
        statusMsg.id = 'copy-status-message';
        statusMsg.style.marginLeft = '20px';
        statusMsg.style.fontSize = '14px';
        statusMsg.style.color = '#666';
        statusMsg.style.fontStyle = 'italic';
        statusMsg.style.display = 'none'; // Hide initially
        sprintManagementContent.appendChild(statusMsg);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('sprint-management-tab');
        }
    }

    /**
     * Copy closed tickets to clipboard
     */
    copyClosedTickets() {
        try {
            // Get all closed tickets
            const closedTickets = this.getClosedTickets();

            if (closedTickets.length === 0) {
                this.updateStatus('No closed tickets found on the board', 'warning');
                return;
            }

            // Format tickets as plain text with newlines
            const formattedText = closedTickets.map(ticket => ticket.title).join('\n');

            // Copy to clipboard
            navigator.clipboard.writeText(formattedText)
                .then(() => {
                    this.updateStatus(`Copied ${closedTickets.length} issue ${closedTickets.length !== 1 ? 'names' : 'name'} to clipboard`, 'success');
                })
                .catch(err => {
                    console.error('Error copying to clipboard:', err);
                    this.updateStatus('Failed to copy to clipboard', 'error');
                });

        } catch (error) {
            console.error('Error copying closed tickets:', error);
            this.updateStatus('Error processing issues', 'error');
        }
    }

    /**
     * Update status message
     * @param {string} message - Message to display
     * @param {string} type - Type of message (success, warning, error)
     */
    updateStatus(message, type = 'info') {
        const statusMsg = document.getElementById('copy-status-message');
        if (!statusMsg) return;

        statusMsg.textContent = message;
        statusMsg.style.display = 'block'; // Show the message

        // Set color based on type
        switch (type) {
            case 'success':
                statusMsg.style.color = '#28a745';
                break;
            case 'warning':
                statusMsg.style.color = '#ffc107';
                break;
            case 'error':
                statusMsg.style.color = '#dc3545';
                break;
            default:
                statusMsg.style.color = '#666';
        }

        // Auto-hide after 3 seconds
        setTimeout(() => {
            if (statusMsg) {
                statusMsg.style.display = 'none';
            }
        }, 3000);

        // Also show notification if available
        if (this.notification) {
            this.notification[type](message);
        }
    }

    /**
     * Get all closed tickets from the board
     * @returns {Array} Array of closed ticket objects with id and title
     */
    getClosedTickets() {
        const closedTickets = [];
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

            // Check if this is a closed/done board
            const isClosedBoard = boardTitle.includes('done') ||
                boardTitle.includes('closed') ||
                boardTitle.includes('complete') ||
                boardTitle.includes('finished');

            if (isClosedBoard) {
                // Process all cards in this closed board
                const boardCards = boardList.querySelectorAll('.board-card');

                boardCards.forEach(card => {
                    try {
                        if (card.__vue__ && card.__vue__.$children) {
                            const issue = card.__vue__.$children.find(child =>
                                child.$props && child.$props.item);

                            if (issue && issue.$props && issue.$props.item) {
                                const item = issue.$props.item;

                                // Extract title and id from the issue
                                const title = item.title;
                                const id = item.iid;

                                if (title) {
                                    closedTickets.push({
                                        id: id || 'unknown',
                                        title: title
                                    });
                                }
                            }
                        } else {
                            // Fallback if Vue component not available
                            const titleEl = card.querySelector('.board-card-title');
                            if (titleEl) {
                                const title = titleEl.textContent.trim();
                                let id = 'unknown';

                                // Try to extract ID if available
                                const idMatch = card.querySelector('[data-issue-id]');
                                if (idMatch && idMatch.dataset.issueId) {
                                    id = idMatch.dataset.issueId;
                                }

                                if (title) {
                                    closedTickets.push({
                                        id: id,
                                        title: title
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.error('Error processing card:', err);
                    }
                });
            }
        });

        return closedTickets;
    }
}
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

        // Create button container for better layout
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.flexDirection = 'column';
        buttonContainer.style.gap = '15px';
        buttonContainer.style.margin = '20px';

        // Create the copy button for closed issue names
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

        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.backgroundColor = '#1a63ac';
        });

        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.backgroundColor = '#1f75cb';
        });

        copyButton.addEventListener('click', () => this.copyClosedTickets());

        // Create the sprint data button
        const sprintDataButton = document.createElement('button');
        sprintDataButton.textContent = 'Copy Sprint Data Summary';
        sprintDataButton.className = 'sprint-data-button';
        sprintDataButton.style.padding = '10px 16px';
        sprintDataButton.style.backgroundColor = '#28a745';
        sprintDataButton.style.color = 'white';
        sprintDataButton.style.border = 'none';
        sprintDataButton.style.borderRadius = '4px';
        sprintDataButton.style.cursor = 'pointer';
        sprintDataButton.style.fontWeight = 'bold';
        sprintDataButton.style.transition = 'background-color 0.2s ease';

        sprintDataButton.addEventListener('mouseenter', () => {
            sprintDataButton.style.backgroundColor = '#218838';
        });

        sprintDataButton.addEventListener('mouseleave', () => {
            sprintDataButton.style.backgroundColor = '#28a745';
        });

        sprintDataButton.addEventListener('click', () => this.copySprintData());

        buttonContainer.appendChild(copyButton);
        buttonContainer.appendChild(sprintDataButton);
        sprintManagementContent.appendChild(buttonContainer);

        // Removed status message element

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('sprintmanagement-tab');
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
     * Update status with notification only
     * @param {string} message - Message to display
     * @param {string} type - Type of message (success, warning, error)
     */
    updateStatus(message, type = 'info') {
        // Only use notifications - no DOM elements
        if (this.notification) {
            this.notification[type](message);
        } else {
            // Fallback if notification system is not available
            console.log(`${type.toUpperCase()}: ${message}`);
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
    /**
     * Copy sprint data summary to clipboard in the requested format
     */
    copySprintData() {
        try {
            // Get all relevant data
            const closedTickets = this.getClosedTickets();
            const sprintData = this.calculateSprintData();

            const formattedData = `${sprintData.totalTickets}\n${closedTickets.length}\n${sprintData.totalHours}\n${sprintData.closedHours}\n\n${sprintData.prediction}`;

            // Copy to clipboard
            navigator.clipboard.writeText(formattedData)
                .then(() => {
                    this.updateStatus('Sprint data copied to clipboard', 'success');
                })
                .catch(err => {
                    console.error('Error copying sprint data to clipboard:', err);
                    this.updateStatus('Failed to copy sprint data', 'error');
                });
        } catch (error) {
            console.error('Error copying sprint data:', error);
            this.updateStatus('Error processing sprint data', 'error');
        }
    }

    /**
     * Calculate sprint data metrics
     * @returns {Object} Object containing total tickets, closed tickets, total hours, closed hours, and prediction
     */
    calculateSprintData() {
        let totalTickets = 0;
        let totalHours = 0;
        let closedHours = 0;

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

            // Process all cards in this board
            const boardCards = boardList.querySelectorAll('.board-card');

            boardCards.forEach(card => {
                try {
                    if (card.__vue__ && card.__vue__.$children) {
                        const issue = card.__vue__.$children.find(child =>
                            child.$props && child.$props.item);

                        if (issue && issue.$props && issue.$props.item) {
                            const item = issue.$props.item;

                            // Count total tickets
                            totalTickets++;

                            // Sum up time estimates if available
                            if (item.timeEstimate) {
                                const hours = item.timeEstimate / 3600; // Convert seconds to hours
                                totalHours += hours;

                                // Add to closed hours if in closed board
                                if (isClosedBoard) {
                                    closedHours += hours;
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error('Error processing card:', err);
                }
            });
        });

        // Round the hours to 1 decimal place
        totalHours = Math.round(totalHours * 10) / 10;
        closedHours = Math.round(closedHours * 10) / 10;

        // Calculate prediction
        let prediction = 'schlecht';
        const closedTickets = this.getClosedTickets().length;

        // Calculate ratios
        const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
        const hoursRatio = totalHours > 0 ? closedHours / totalHours : 0;

        // Determine prediction based on ratios
        if (ticketRatio > 0.7 || hoursRatio > 0.7) {
            prediction = 'gut';
        } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
            prediction = 'mittel';
        }

        return {
            totalTickets,
            totalHours,
            closedHours,
            prediction
        };
    }
}
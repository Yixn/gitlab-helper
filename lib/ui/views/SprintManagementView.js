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

        // Initialize sprint state
        this.sprintState = {
            endSprint: false,
            preparedForNext: false,  // Renamed from survivorsSet
            currentMilestone: null,
            userPerformance: {}  // Add user performance tracking
        };

        // Initialize sprint history
        this.sprintHistory = [];

        // Load state from localStorage
        this.loadSprintState();
        this.loadSprintHistory();
    }

    /**
     * Render or update the Sprint Management tab with tools
     */
    render() {
        const sprintManagementContent = document.getElementById('sprint-management-content');
        if (!sprintManagementContent) return;

        sprintManagementContent.innerHTML = '';

        // Check URL for required milestone_title parameter
        const urlParams = new URLSearchParams(window.location.search);

        // Check that there is exactly one parameter (milestone_title=Started)
        let isValidUrl = false;

        if (urlParams.has('milestone_title') && urlParams.get('milestone_title') === 'Started') {
            // Count the number of parameters to ensure there are no others
            let paramCount = 0;
            urlParams.forEach(() => {
                paramCount++;
            });

            // Only valid if milestone_title=Started is the only parameter
            isValidUrl = (paramCount === 1);
        }

        // If URL doesn't exactly match milestone_title=Started with no other params, show locked message
        if (!isValidUrl) {
            this.renderLockedState(sprintManagementContent);
            return;
        }

        // Continue with normal rendering if URL check passes
        // Get current milestone
        this.getCurrentMilestone();

        // Create milestone display
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.padding = '10px';
        milestoneInfo.style.margin = '0 10px';
        milestoneInfo.style.backgroundColor = '#f8f9fa';
        milestoneInfo.style.borderRadius = '6px';
        milestoneInfo.style.fontWeight = 'bold';

        if (this.sprintState.currentMilestone) {
            milestoneInfo.textContent = `Current Milestone: ${this.sprintState.currentMilestone}`;
        } else {
            milestoneInfo.textContent = 'No milestone detected';
            milestoneInfo.style.color = '#dc3545';
        }

        sprintManagementContent.appendChild(milestoneInfo);

        // Create step container
        const stepsContainer = document.createElement('div');
        stepsContainer.style.display = 'flex';
        stepsContainer.style.flexDirection = 'column';
        stepsContainer.style.gap = '5px';
        stepsContainer.style.marginTop = '';
        stepsContainer.style.padding = '15px';
        stepsContainer.style.backgroundColor = '#f8f9fa';
        stepsContainer.style.borderRadius = '6px';
        stepsContainer.style.border = '1px solid #dee2e6';
        stepsContainer.style.margin = '10px 10px 0';
        // Step 1: End Sprint Button
        this.createStepButton(
            stepsContainer,
            '1. End Sprint',
            '#1f75cb',
            () => this.endSprint(),
            !this.sprintState.endSprint  // Only enabled if step not completed
        );

        // Step 2: Prepare for Next Sprint Button (renamed from Set Sprint Survivors)
        this.createStepButton(
            stepsContainer,
            '2. Ready for next Sprint',
            '#6f42c1',
            () => this.prepareForNextSprint(),
            this.sprintState.endSprint && !this.sprintState.preparedForNext  // Only enabled if step 1 is done but step 2 is not
        );

        // Step 4: Copy Sprint Data Button
        this.createStepButton(
            stepsContainer,
            '3. Copy Sprint Data Summary',
            '#28a745',
            () => this.copySprintData(),
            this.sprintState.preparedForNext  // Only enabled if steps 1 and 2 are done
        );

        // Step 3: Copy Closed Issues Button
        this.createStepButton(
            stepsContainer,
            '4. Copy Closed Issue Names',
            '#fd7e14',
            () => this.copyClosedTickets(),
            this.sprintState.preparedForNext  // Only enabled if steps 1 and 2 are done
        );

// Utility buttons
        const utilityContainer = document.createElement('div');
        utilityContainer.style.display = 'flex';
        utilityContainer.style.justifyContent = 'space-between';
        utilityContainer.style.marginTop = '10px';

// Reset Sprint Button (always enabled)
        const resetButton = document.createElement('button');
        resetButton.textContent = '5. Reset Sprint';
        resetButton.className = 'reset-sprint-button';
        resetButton.style.padding = '10px 16px';
        resetButton.style.backgroundColor = '#dc3545';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.fontWeight = 'bold';
        resetButton.addEventListener('click', () => this.resetSprint());

// Edit Data Button (only enabled if step 1 is done)
        const editButton = document.createElement('button');
        editButton.textContent = '6. Edit Data';
        editButton.className = 'edit-sprint-data-button';
        editButton.style.padding = '10px 16px';

// Check if step 1 is done before enabling the edit button
        const editEnabled = this.sprintState.endSprint;
        editButton.style.backgroundColor = editEnabled ? '#17a2b8' : '#6c757d';
        editButton.style.color = 'white';
        editButton.style.border = 'none';
        editButton.style.borderRadius = '4px';
        editButton.style.cursor = editEnabled ? 'pointer' : 'not-allowed';
        editButton.style.fontWeight = 'bold';
        editButton.style.opacity = editEnabled ? '1' : '0.7';
        editButton.disabled = !editEnabled;

        if (editEnabled) {
            editButton.addEventListener('click', () => this.editSprintData());
        }

        utilityContainer.appendChild(resetButton);
        utilityContainer.appendChild(editButton);
        stepsContainer.appendChild(utilityContainer);

        // Add the steps container to the main content
        sprintManagementContent.appendChild(stepsContainer);

        // Show current sprint data if available
        if (this.sprintState.totalTickets !== undefined) {
            this.showSprintDataSummary(sprintManagementContent);
        }

        // Add sprint history section
        this.renderSprintHistory(sprintManagementContent);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('sprintmanagement-tab');
        }
    }

    /**
     * Render a locked state message when URL parameters don't match requirements
     * @param {HTMLElement} container - Container to render into
     */
    renderLockedState(container) {
        const lockedContainer = document.createElement('div');
        lockedContainer.style.display = 'flex';
        lockedContainer.style.flexDirection = 'column';
        lockedContainer.style.alignItems = 'center';
        lockedContainer.style.justifyContent = 'center';
        lockedContainer.style.padding = '40px';
        lockedContainer.style.backgroundColor = '#f8f9fa';
        lockedContainer.style.borderRadius = '6px';
        lockedContainer.style.margin = '10px';
        lockedContainer.style.textAlign = 'center';

        // Lock icon
        const lockIcon = document.createElement('div');
        lockIcon.innerHTML = '🔒';
        lockIcon.style.fontSize = '48px';
        lockIcon.style.marginBottom = '20px';

        // Message
        const message = document.createElement('h3');
        message.textContent = 'Sprint Management is Locked';
        message.style.marginBottom = '15px';
        message.style.color = '#495057';

        // Instruction with updated text about exact parameter requirements
        const instruction = document.createElement('p');
        instruction.innerHTML = 'Sprint Management is only available when URL contains <strong>exactly</strong> <code>?milestone_title=Started</code> with no other parameters';
        instruction.style.color = '#6c757d';
        instruction.style.marginBottom = '20px';

        // Link to access with correct parameters - will replace all current parameters
        const link = document.createElement('a');

        // Create a clean URL with just the necessary parameter
        const currentUrl = new URL(window.location.href);

        // Remove all current parameters
        currentUrl.search = '';

        // Add only the milestone_title parameter
        currentUrl.searchParams.set('milestone_title', 'Started');

        link.href = currentUrl.toString();
        link.textContent = 'Access Sprint Management';
        link.style.display = 'inline-block';
        link.style.padding = '10px 16px';
        link.style.backgroundColor = '#1f75cb';
        link.style.color = 'white';
        link.style.textDecoration = 'none';
        link.style.borderRadius = '4px';
        link.style.fontWeight = 'bold';
        link.style.marginTop = '10px';

        lockedContainer.appendChild(lockIcon);
        lockedContainer.appendChild(message);
        lockedContainer.appendChild(instruction);
        lockedContainer.appendChild(link);

        container.appendChild(lockedContainer);

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
                this.notification.warning('No closed tickets found on the board');
                return;
            }

            // Format tickets as plain text with newlines
            const formattedText = closedTickets.map(ticket => ticket.title).join('\n');

            // Copy to clipboard
            navigator.clipboard.writeText(formattedText)
                .then(() => {
                    this.notification.success(`Copied ${closedTickets.length} issue ${closedTickets.length !== 1 ? 'names' : 'name'} to clipboard`);
                })
                .catch(err => {
                    console.error('Error copying to clipboard:', err);
                    this.notification.error('Failed to copy to clipboard');
                });

        } catch (error) {
            console.error('Error copying closed tickets:', error);
            this.notification.error('Error processing issues');
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
            // Get data from sprint state
            const {totalTickets, closedTickets, totalHours, closedHours, extraHoursClosed = 0} = this.sprintState;

            // Calculate the total closed hours including extras
            const totalClosedHours = closedHours + extraHoursClosed;

            // Calculate prediction
            let prediction = 'schlecht';
            const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
            const hoursRatio = totalHours > 0 ? totalClosedHours / totalHours : 0;

            if (ticketRatio > 0.7 || hoursRatio > 0.7) {
                prediction = 'gut';
            } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
                prediction = 'mittel';
            }

            const formattedData = `${totalTickets}\n${closedTickets}\n${totalHours}\n${totalClosedHours}\n\n${prediction}`;

            // Copy to clipboard
            navigator.clipboard.writeText(formattedData)
                .then(() => {
                    this.notification.success('Sprint data copied to clipboard');
                })
                .catch(err => {
                    console.error('Error copying sprint data to clipboard:', err);
                    this.notification.error('Failed to copy sprint data');
                });
        } catch (error) {
            console.error('Error copying sprint data:', error);
            this.notification.error('Error processing sprint data');
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

    // Method to create step buttons
    createStepButton(container, title, color, onClick, enabled = true) {
        const buttonWrapper = document.createElement('div');
        buttonWrapper.style.display = 'flex';
        buttonWrapper.style.flexDirection = 'column';
        buttonWrapper.style.gap = '5px';

        const button = document.createElement('button');
        button.textContent = title;
        button.style.padding = '12px 16px';
        button.style.backgroundColor = enabled ? color : '#6c757d';
        button.style.color = 'white';
        button.style.border = 'none';
        button.style.borderRadius = '4px';
        button.style.cursor = enabled ? 'pointer' : 'not-allowed';
        button.style.fontWeight = 'bold';
        button.style.opacity = enabled ? '1' : '0.7';
        button.style.transition = 'all 0.2s ease';
        button.disabled = !enabled;

        if (enabled) {
            const hoverColor = this.darkenColor(color, 10);

            button.addEventListener('mouseenter', function () {
                this.style.backgroundColor = hoverColor;
            });

            button.addEventListener('mouseleave', function () {
                this.style.backgroundColor = color;
            });

            // Use a regular function instead of an arrow function
            button.addEventListener('click', function () {
                onClick();
            });
        }

        buttonWrapper.appendChild(button);
        container.appendChild(buttonWrapper);

        return button;
    }

// Method to darken a color for button hover effects
    darkenColor(hex, percent) {
        // Remove # if present
        hex = hex.replace(/^#/, '');

        // Parse r, g, b values
        let r = parseInt(hex.substr(0, 2), 16);
        let g = parseInt(hex.substr(2, 2), 16);
        let b = parseInt(hex.substr(4, 2), 16);

        // Darken
        r = Math.floor(r * (100 - percent) / 100);
        g = Math.floor(g * (100 - percent) / 100);
        b = Math.floor(b * (100 - percent) / 100);

        // Ensure values are in range
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));

        // Convert back to hex
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

// Method to get current milestone from board data
    getCurrentMilestone() {
        try {
            // Try to get milestone from board data
            const boardLists = document.querySelectorAll('.board-list');

            boardLists.forEach(boardList => {
                const boardItems = boardList.querySelectorAll('.board-card');

                boardItems.forEach(item => {
                    try {
                        if (item.__vue__ && item.__vue__.$children) {
                            const issue = item.__vue__.$children.find(child =>
                                child.$props && child.$props.item && child.$props.item.milestone);

                            if (issue && issue.$props.item && issue.$props.item.milestone && issue.$props.item.milestone.title) {
                                this.sprintState.currentMilestone = issue.$props.item.milestone.title;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing issue for milestone:', e);
                    }
                });
            });

            // If we found a milestone, save it
            if (this.sprintState.currentMilestone) {
                this.saveSprintState();
            }
        } catch (e) {
            console.error('Error getting current milestone:', e);
        }
    }

// Method to execute step 1: End Sprint
    endSprint() {
        try {
            const sprintData = this.calculateSprintData();
            const closedTickets = this.getClosedTickets();
            const userPerformance = this.calculateUserPerformance();

            // Generate a unique ID for this sprint
            const sprintId = Date.now().toString();

            // Save the current sprint state
            this.sprintState.id = sprintId;  // Add ID to the sprint state
            this.sprintState.endSprint = true;
            this.sprintState.totalTickets = sprintData.totalTickets;
            this.sprintState.closedTickets = closedTickets.length;
            this.sprintState.totalHours = sprintData.totalHours;
            this.sprintState.closedHours = sprintData.closedHours;
            this.sprintState.userPerformance = userPerformance;
            this.sprintState.timestamp = new Date().toISOString();

            // Save to localStorage
            this.saveSprintState();

            // Notify user
            this.notification.success('Sprint ended. Data captured successfully.');

            // Automatically start issue selection process
            if (this.uiManager && this.uiManager.issueSelector && typeof this.uiManager.issueSelector.startSelection === 'function') {
                // Switch to bulkcomments tab first if possible
                if (this.uiManager.tabManager && typeof this.uiManager.tabManager.switchToTab === 'function') {
                    this.uiManager.tabManager.switchToTab('bulkcomments');
                }

                // Start issue selection after a brief delay to allow tab switching
                setTimeout(() => {
                    this.uiManager.issueSelector.startSelection();
                }, 300);

                this.notification.info('Issue selection started. Please select issues to process.');
            }

            // Refresh the view
            this.render();
        } catch (error) {
            console.error('Error ending sprint:', error);
            this.notification.error('Failed to end sprint: ' + error.message);
        }
    }

// Method to execute step 2: Set Sprint Survivors
    prepareForNextSprint() {
        try {
            // Get current data
            const currentData = this.calculateSprintData();

            // Calculate the difference between saved total hours and current total hours
            // This represents work that carried over (survivors)
            const extraHoursClosed = Math.max(0, this.sprintState.totalHours - currentData.totalHours);

            // Archive the completed sprint before preparing for next
            this.archiveCompletedSprint();

            // Update sprint state
            this.sprintState.preparedForNext = true;
            this.sprintState.extraHoursClosed = extraHoursClosed;

            // Save to localStorage
            this.saveSprintState();

            // Notify and refresh
            this.notification.success(`Sprint preparation complete. ${extraHoursClosed.toFixed(1)}h of carried over work identified.`);
            this.render();
        } catch (error) {
            console.error('Error preparing for next sprint:', error);
            this.notification.error('Failed to prepare for next sprint: ' + error.message);
        }
    }

// Method to reset the sprint state
    resetSprint() {
        if (confirm('Are you sure you want to reset all sprint data? This cannot be undone.')) {
            // Archive the sprint first if it was ended but not prepared
            if (this.sprintState.endSprint && !this.sprintState.preparedForNext) {
                this.archiveCompletedSprint();
            }

            // Get the current sprint ID if it exists
            const currentSprintId = this.sprintState.id;

            // Reset the state
            this.sprintState = {
                endSprint: false,
                preparedForNext: false,  // Renamed from survivorsSet
                currentMilestone: null,
                userPerformance: {}
            };

            // If we had an ID, remove that sprint from history
            if (currentSprintId && this.sprintHistory.length > 0) {
                this.sprintHistory = this.sprintHistory.filter(sprint => sprint.id !== currentSprintId);
                this.saveSprintHistory();
            }

            this.saveSprintState();
            this.notification.info('Sprint data has been reset.');
            this.render();
        }
    }

// Method to edit sprint data manually
    editSprintData() {
        try {
            const formHTML = `
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Total Tickets:</label>
                    <input type="number" id="edit-total-tickets" value="${this.sprintState.totalTickets || 0}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Closed Tickets:</label>
                    <input type="number" id="edit-closed-tickets" value="${this.sprintState.closedTickets || 0}" min="0" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Total Hours:</label>
                    <input type="number" id="edit-total-hours" value="${this.sprintState.totalHours || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Closed Hours:</label>
                    <input type="number" id="edit-closed-hours" value="${this.sprintState.closedHours || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
                <div>
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">Extra Closed Hours:</label>
                    <input type="number" id="edit-extra-hours" value="${this.sprintState.extraHoursClosed || 0}" min="0" step="0.1" style="width: 100%; padding: 8px; border-radius: 4px; border: 1px solid #ccc;">
                </div>
            </div>
        `;

            this.showModal('Edit Sprint Data', formHTML, () => {
                // Save the edited values
                this.sprintState.totalTickets = parseFloat(document.getElementById('edit-total-tickets').value) || 0;
                this.sprintState.closedTickets = parseFloat(document.getElementById('edit-closed-tickets').value) || 0;
                this.sprintState.totalHours = parseFloat(document.getElementById('edit-total-hours').value) || 0;
                this.sprintState.closedHours = parseFloat(document.getElementById('edit-closed-hours').value) || 0;
                this.sprintState.extraHoursClosed = parseFloat(document.getElementById('edit-extra-hours').value) || 0;

                // If data was entered but stages weren't set, set them now
                if (this.sprintState.totalTickets > 0 && !this.sprintState.endSprint) {
                    this.sprintState.endSprint = true;
                }

                if (this.sprintState.extraHoursClosed > 0 && !this.sprintState.survivorsSet) {
                    this.sprintState.survivorsSet = true;
                }

                this.saveSprintState();
                this.notification.success('Sprint data updated successfully.');
                this.render();
            });
        } catch (error) {
            console.error('Error editing sprint data:', error);
            this.notification.error('Failed to edit sprint data: ' + error.message);
        }
    }

// Method to show a modal dialog
    showModal(title, content, onSave) {
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1000';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        modalOverlay.style.cursor = 'pointer';

        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '500px';
        modalContent.style.maxWidth = '90%';

        const modalHeader = document.createElement('div');
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';

        const modalTitle = document.createElement('h3');
        modalTitle.style.margin = '0';
        modalTitle.textContent = title;

        const closeBtn = document.createElement('button');
        closeBtn.textContent = '×';
        closeBtn.style.background = 'none';
        closeBtn.style.border = 'none';
        closeBtn.style.fontSize = '24px';
        closeBtn.style.cursor = 'pointer';
        closeBtn.style.padding = '0';
        closeBtn.style.lineHeight = '1';

        closeBtn.onclick = () => {
            document.body.removeChild(modalOverlay);
        };

        modalHeader.appendChild(modalTitle);
        modalHeader.appendChild(closeBtn);

        const modalBody = document.createElement('div');
        modalBody.style.marginBottom = '20px';

        if (typeof content === 'string') {
            modalBody.innerHTML = content;
        } else {
            modalBody.appendChild(content);
        }

        const modalFooter = document.createElement('div');
        modalFooter.style.borderTop = '1px solid #eee';
        modalFooter.style.paddingTop = '15px';
        modalFooter.style.display = 'flex';
        modalFooter.style.justifyContent = 'flex-end';
        modalFooter.style.gap = '10px';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.padding = '8px 16px';
        cancelBtn.style.backgroundColor = '#6c757d';
        cancelBtn.style.color = 'white';
        cancelBtn.style.border = 'none';
        cancelBtn.style.borderRadius = '4px';
        cancelBtn.style.cursor = 'pointer';

        cancelBtn.onclick = () => {
            document.body.removeChild(modalOverlay);
        };

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.padding = '8px 16px';
        saveBtn.style.backgroundColor = '#28a745';
        saveBtn.style.color = 'white';
        saveBtn.style.border = 'none';
        saveBtn.style.borderRadius = '4px';
        saveBtn.style.cursor = 'pointer';

        saveBtn.onclick = () => {
            if (typeof onSave === 'function') {
                onSave();
            }
            document.body.removeChild(modalOverlay);
        };

        modalFooter.appendChild(cancelBtn);
        modalFooter.appendChild(saveBtn);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(modalBody);
        modalContent.appendChild(modalFooter);

        modalOverlay.appendChild(modalContent);
        modalOverlay.addEventListener('click', (e) => {
            // Only close if the click was directly on the overlay (not its children)
            if (e.target === modalOverlay) {
                document.body.removeChild(modalOverlay);
            }
        });
        document.body.appendChild(modalOverlay);
    }

// Method to display current sprint data
    showSprintDataSummary(container) {
        const dataContainer = document.createElement('div');
        dataContainer.style.margin = '10px';
        dataContainer.style.padding = '15px';
        dataContainer.style.backgroundColor = '#f8f9fa';
        dataContainer.style.borderRadius = '6px';
        dataContainer.style.border = '1px solid #dee2e6';

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Current Sprint Data';
        titleEl.style.margin = '0 0 15px 0';
        titleEl.style.fontSize = '16px';

        dataContainer.appendChild(titleEl);

        const createDataRow = (label, value) => {
            const row = document.createElement('div');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.marginBottom = '8px';
            row.style.padding = '5px 0';
            row.style.borderBottom = '1px solid #eee';

            const labelEl = document.createElement('div');
            labelEl.textContent = label;
            labelEl.style.fontWeight = 'bold';

            const valueEl = document.createElement('div');
            valueEl.textContent = value;

            row.appendChild(labelEl);
            row.appendChild(valueEl);

            return row;
        };

        const {
            totalTickets = 0,
            closedTickets = 0,
            totalHours = 0,
            closedHours = 0,
            extraHoursClosed = 0,
            timestamp
        } = this.sprintState;

        dataContainer.appendChild(createDataRow('Total Tickets:', totalTickets));
        dataContainer.appendChild(createDataRow('Closed Tickets:', closedTickets));
        dataContainer.appendChild(createDataRow('Total Hours:', totalHours.toFixed(1) + 'h'));
        dataContainer.appendChild(createDataRow('Closed Hours:', closedHours.toFixed(1) + 'h'));

        if (extraHoursClosed > 0) {
            dataContainer.appendChild(createDataRow('Extra Hours Closed:', extraHoursClosed.toFixed(1) + 'h'));
            dataContainer.appendChild(createDataRow('Total Hours Closed:', (closedHours + extraHoursClosed).toFixed(1) + 'h'));
        }

        if (timestamp) {
            const date = new Date(timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            dataContainer.appendChild(createDataRow('Captured On:', formattedDate));
        }

        container.appendChild(dataContainer);
    }

// Method to save sprint state to localStorage
    saveSprintState() {
        try {
            localStorage.setItem('gitLabHelperSprintState', JSON.stringify(this.sprintState));
        } catch (error) {
            console.error('Failed to save sprint state to localStorage:', error);
            this.notification.error('Failed to save sprint state');
        }
    }

// Method to load sprint state from localStorage
    loadSprintState() {
        try {
            const saved = localStorage.getItem('gitLabHelperSprintState');
            if (saved) {
                this.sprintState = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load sprint state from localStorage:', error);
            this.notification.error('Failed to load sprint state');
        }
    }

    calculateUserPerformance() {
        const userPerformance = {};

        try {
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

                                // Get assignees
                                let assignees = [];
                                if (item.assignees && item.assignees.nodes && item.assignees.nodes.length) {
                                    assignees = item.assignees.nodes;
                                } else if (item.assignees && item.assignees.length > 0) {
                                    assignees = item.assignees;
                                }

                                // Skip if no assignees
                                if (assignees.length === 0) {
                                    return;
                                }

                                // Calculate time per assignee
                                const timeEstimate = item.timeEstimate || 0;
                                const timePerAssignee = timeEstimate / assignees.length;

                                // Record for each assignee
                                assignees.forEach(assignee => {
                                    const name = assignee.name || assignee.username || 'Unknown';

                                    if (!userPerformance[name]) {
                                        userPerformance[name] = {
                                            totalTickets: 0,
                                            closedTickets: 0,
                                            totalHours: 0,
                                            closedHours: 0
                                        };
                                    }

                                    // Count ticket
                                    userPerformance[name].totalTickets++;

                                    // Add time estimate (in hours)
                                    userPerformance[name].totalHours += timePerAssignee / 3600;

                                    // If in closed board, count as closed
                                    if (isClosedBoard) {
                                        userPerformance[name].closedTickets++;
                                        userPerformance[name].closedHours += timePerAssignee / 3600;
                                    }
                                });
                            }
                        }
                    } catch (err) {
                        console.error('Error processing card for user performance:', err);
                    }
                });
            });

            // Round all hour values to one decimal place
            Object.keys(userPerformance).forEach(user => {
                userPerformance[user].totalHours = Math.round(userPerformance[user].totalHours * 10) / 10;
                userPerformance[user].closedHours = Math.round(userPerformance[user].closedHours * 10) / 10;
            });
        } catch (error) {
            console.error('Error calculating user performance:', error);
        }

        return userPerformance;
    }

    archiveCompletedSprint() {
        try {
            // Only archive if we have data to archive
            if (!this.sprintState.endSprint || !this.sprintState.timestamp) {
                return;
            }

            // Create archive entry
            const archiveEntry = {
                id: this.sprintState.id || Date.now().toString(), // Use existing ID or create new one
                milestone: this.sprintState.currentMilestone,
                totalTickets: this.sprintState.totalTickets,
                closedTickets: this.sprintState.closedTickets,
                totalHours: this.sprintState.totalHours,
                closedHours: this.sprintState.closedHours,
                extraHoursClosed: this.sprintState.extraHoursClosed || 0,
                userPerformance: this.sprintState.userPerformance || {},
                timestamp: this.sprintState.timestamp,
                completedAt: new Date().toISOString()
            };

            // Add to history
            this.sprintHistory.unshift(archiveEntry); // Add to beginning of array

            // Keep a reasonable history size (last 10 sprints)
            if (this.sprintHistory.length > 10) {
                this.sprintHistory = this.sprintHistory.slice(0, 10);
            }

            // Save history
            this.saveSprintHistory();
        } catch (error) {
            console.error('Error archiving sprint:', error);
        }
    }

    saveSprintHistory() {
        try {
            localStorage.setItem('gitLabHelperSprintHistory', JSON.stringify(this.sprintHistory));
        } catch (error) {
            console.error('Failed to save sprint history to localStorage:', error);
            this.notification.error('Failed to save sprint history');
        }
    }

    loadSprintHistory() {
        try {
            const saved = localStorage.getItem('gitLabHelperSprintHistory');
            if (saved) {
                this.sprintHistory = JSON.parse(saved);
            }
        } catch (error) {
            console.error('Failed to load sprint history from localStorage:', error);
            this.notification.error('Failed to load sprint history');
            this.sprintHistory = [];
        }
    }

    renderSprintHistory(container) {
        // Skip if no history
        if (!this.sprintHistory || this.sprintHistory.length === 0) {
            return;
        }

        const historySection = document.createElement('div');
        historySection.style.margin = '10px';
        historySection.style.padding = '15px';
        historySection.style.backgroundColor = '#f8f9fa';
        historySection.style.borderRadius = '6px';
        historySection.style.border = '1px solid #dee2e6';

        const titleEl = document.createElement('h3');
        titleEl.textContent = 'Sprint History';
        titleEl.style.margin = '0 0 15px 0';
        titleEl.style.fontSize = '16px';

        historySection.appendChild(titleEl);

        // Create table
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';

        // Create header row
        const thead = document.createElement('thead');
        const headerRow = document.createElement('tr');

        ['Sprint', 'Tickets', 'Hours', 'Completed'].forEach(text => {
            const th = document.createElement('th');
            th.textContent = text;
            th.style.padding = '8px';
            th.style.textAlign = 'left';
            th.style.borderBottom = '2px solid #dee2e6';
            headerRow.appendChild(th);
        });

        thead.appendChild(headerRow);
        table.appendChild(thead);

        // Create table body
        const tbody = document.createElement('tbody');

        this.sprintHistory.forEach(sprint => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #dee2e6';
            row.style.transition = 'background-color 0.2s';
            row.style.cursor = 'pointer';  // Make the entire row look clickable

            row.addEventListener('mouseenter', () => {
                row.style.backgroundColor = '#f1f1f1';
            });

            row.addEventListener('mouseleave', () => {
                row.style.backgroundColor = '';
            });

            row.addEventListener('click', () => {
                this.showSprintDetails(sprint);
            });

            // Sprint name/milestone - now clickable
            const tdMilestone = document.createElement('td');
            tdMilestone.style.padding = '8px';
            tdMilestone.textContent = sprint.milestone || 'Unnamed Sprint';
            tdMilestone.style.color = '#1f75cb';  // Make it look like a link
            tdMilestone.style.fontWeight = 'bold';
            row.appendChild(tdMilestone);

            // Tickets
            const tdTickets = document.createElement('td');
            tdTickets.style.padding = '8px';
            tdTickets.textContent = `${sprint.closedTickets}/${sprint.totalTickets}`;
            row.appendChild(tdTickets);

            // Hours
            const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
            const tdHours = document.createElement('td');
            tdHours.style.padding = '8px';
            tdHours.textContent = `${totalClosedHours.toFixed(1)}/${sprint.totalHours.toFixed(1)}h`;
            row.appendChild(tdHours);

            // Completion date
            const tdDate = document.createElement('td');
            tdDate.style.padding = '8px';
            const date = new Date(sprint.completedAt || sprint.timestamp);
            tdDate.textContent = date.toLocaleDateString();
            row.appendChild(tdDate);

            tbody.appendChild(row);
        });

        table.appendChild(tbody);
        historySection.appendChild(table);
        container.appendChild(historySection);
    }

    showSprintDetails(sprint) {
        const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
        const ticketCompletion = sprint.totalTickets > 0
            ? (sprint.closedTickets / sprint.totalTickets * 100).toFixed(1)
            : 0;
        const hourCompletion = sprint.totalHours > 0
            ? (totalClosedHours / sprint.totalHours * 100).toFixed(1)
            : 0;

        // Format dates
        const startDate = new Date(sprint.timestamp);
        const endDate = new Date(sprint.completedAt || sprint.timestamp);

        // Create content for the modal
        let content = `
        <div style="padding: 10px;">
            <h3 style="margin-top: 0; color: #1f75cb;">${sprint.milestone || 'Unnamed Sprint'}</h3>
            
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px;">
                <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                    <h4 style="margin-top: 0; font-size: 14px;">Tickets</h4>
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                        ${sprint.closedTickets}/${sprint.totalTickets}
                    </div>
                    <div style="font-size: 14px; color: #6c757d;">
                        ${ticketCompletion}% completed
                    </div>
                </div>
                
                <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                    <h4 style="margin-top: 0; font-size: 14px;">Hours</h4>
                    <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                        ${totalClosedHours.toFixed(1)}/${sprint.totalHours.toFixed(1)}h
                    </div>
                    <div style="font-size: 14px; color: #6c757d;">
                        ${hourCompletion}% completed
                    </div>
                </div>
            </div>
            
            <div style="margin-bottom: 20px;">
                <h4 style="margin-bottom: 10px; font-size: 16px;">Sprint Details</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Started:</td>
                        <td style="padding: 8px;">${startDate.toLocaleString()}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Completed:</td>
                        <td style="padding: 8px;">${endDate.toLocaleString()}</td>
                    </tr>
                    <tr style="border-bottom: 1px solid #dee2e6;">
                        <td style="padding: 8px; font-weight: bold;">Carried Over Hours:</td>
                        <td style="padding: 8px;">${(sprint.extraHoursClosed || 0).toFixed(1)}h</td>
                    </tr>
                </table>
            </div>
    `;

        // Add user performance if available
        if (sprint.userPerformance && Object.keys(sprint.userPerformance).length > 0) {
            content += `
            <div>
                <h4 style="margin-bottom: 10px; font-size: 16px;">User Performance</h4>
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background-color: #f8f9fa; border-bottom: 2px solid #dee2e6;">
                            <th style="padding: 8px; text-align: left;">User</th>
                            <th style="padding: 8px; text-align: center;">Tickets</th>
                            <th style="padding: 8px; text-align: center;">Completion</th>
                            <th style="padding: 8px; text-align: right;">Hours</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

            // Sort users by hours completed
            const sortedUsers = Object.entries(sprint.userPerformance)
                .sort(([, a], [, b]) => b.closedHours - a.closedHours);

            sortedUsers.forEach(([name, data]) => {
                const userTicketCompletion = data.totalTickets > 0
                    ? (data.closedTickets / data.totalTickets * 100).toFixed(0)
                    : 0;

                content += `
                <tr style="border-bottom: 1px solid #dee2e6;">
                    <td style="padding: 8px;">${name}</td>
                    <td style="padding: 8px; text-align: center;">${data.closedTickets}/${data.totalTickets}</td>
                    <td style="padding: 8px; text-align: center;">${userTicketCompletion}%</td>
                    <td style="padding: 8px; text-align: right;">${data.closedHours.toFixed(1)}/${data.totalHours.toFixed(1)}h</td>
                </tr>
            `;
            });

            content += `
                    </tbody>
                </table>
            </div>
        `;
        }

        content += '</div>';

        // Show the modal with sprint details
        this.showModal(`Sprint Details: ${sprint.milestone || 'Unnamed Sprint'}`, content);
    }
}
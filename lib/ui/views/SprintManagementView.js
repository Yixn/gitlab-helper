export default class SprintManagementView {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.notification = null;
        try {
            if (typeof Notification === 'function') {
                this.notification = new Notification({
                    position: 'bottom-right',
                    duration: 3000
                });
            }
        } catch (e) {
            console.error('Error initializing notification:', e);
        }
        this.sprintState = {
            endSprint: false,
            preparedForNext: false,
            newMilestoneCreated: false,
            survivorsSet: false,
            currentMilestone: null,
            userPerformance: {}
        };
        this.sprintHistory = [];
        this.loadSprintState();
        this.loadSprintHistory();
    }

// lib/ui/views/SprintManagementView.js - render function
    render() {
        const sprintManagementContent = document.getElementById('sprint-management-content');
        if (!sprintManagementContent) return;
        sprintManagementContent.innerHTML = '';
        const urlParams = new URLSearchParams(window.location.search);
        let isValidUrl = false;
        if (urlParams.has('milestone_title') && urlParams.get('milestone_title') === 'Started') {
            let paramCount = 0;
            urlParams.forEach(() => {
                paramCount++;
            });
            isValidUrl = paramCount === 1;
        }
        if (!isValidUrl) {
            this.renderLockedState(sprintManagementContent);
            return;
        }
        this.getCurrentMilestone();
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
        if (this.sprintState.newMilestoneCreated === undefined)
            this.sprintState.newMilestoneCreated = false
        if (this.sprintState.survivorsSet === undefined)
            this.sprintState.survivorsSet = false

        this.createStepButton(stepsContainer, '1. End Sprint', '#1f75cb', () => this.endSprint(), !this.sprintState.endSprint);
        this.createStepButton(stepsContainer, '2. Ready for next Sprint', '#6f42c1', () => this.prepareForNextSprint(), this.sprintState.endSprint && !this.sprintState.preparedForNext);
        this.createStepButton(stepsContainer, '3. Copy Sprint Data Summary', '#28a745', () => this.copySprintData(), this.sprintState.preparedForNext && !this.sprintState.newMilestoneCreated);
        this.createStepButton(stepsContainer, '4. Copy Closed Issue Names', '#fd7e14', () => this.copyClosedTickets(), this.sprintState.preparedForNext && !this.sprintState.newMilestoneCreated);
        this.createStepButton(stepsContainer, '5. Create new Milestone', '#17a2b8', () => this.createNewMilestone(), this.sprintState.preparedForNext && !this.sprintState.newMilestoneCreated );
        this.createStepButton(stepsContainer, '6. Set all except done to sprint survivor and new Milestone', '#6610f2', () => this.setSurvivorAndMilestone(), this.sprintState.newMilestoneCreated &&  !this.sprintState.survivorsSet);
        this.createStepButton(stepsContainer, '7. Close old milestone', '#dc3545', () => this.closeOldMilestone(), this.sprintState.survivorsSet);

        const utilityContainer = document.createElement('div');
        utilityContainer.style.display = 'flex';
        utilityContainer.style.justifyContent = 'space-between';
        utilityContainer.style.marginTop = '15px';
        utilityContainer.style.gap = '10px';
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset Current Sprint';
        resetButton.style.padding = '10px 16px';
        resetButton.style.backgroundColor = '#dc3545';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        resetButton.style.fontWeight = 'bold';
        resetButton.addEventListener('click', () => this.resetCurrentSprint());
        const editButton = document.createElement('button');
        editButton.textContent = 'Edit Data';
        editButton.className = 'edit-sprint-data-button';
        editButton.style.padding = '10px 16px';
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
        sprintManagementContent.appendChild(stepsContainer);
        if (this.sprintState.totalTickets !== undefined) {
            this.showSprintDataSummary(sprintManagementContent);
        }
        this.renderSprintHistory(sprintManagementContent);
        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('sprintmanagement-tab');
        }
    }

// New method stubs for the new buttons
    createNewMilestone() {
        try {
            // This is just a placeholder for now
            this.sprintState.newMilestoneCreated = true;
            this.saveSprintState();
            this.notification.success('New milestone created successfully');
            this.render();
        } catch (error) {
            console.error('Error creating new milestone:', error);
            this.notification.error('Failed to create new milestone: ' + error.message);
        }
    }

    setSurvivorAndMilestone() {
        try {
            // This is just a placeholder for now
            this.sprintState.survivorsSet = true;
            this.saveSprintState();
            this.notification.success('Issues set as sprint survivors and assigned to new milestone');
            this.render();
        } catch (error) {
            console.error('Error setting sprint survivors:', error);
            this.notification.error('Failed to set sprint survivors: ' + error.message);
        }
    }

    closeOldMilestone() {
        try {
            // This is just a placeholder for now
            this.sprintState.oldMilestoneClosed = true;
            this.saveSprintState();
            this.notification.success('Old milestone closed successfully');
            this.render();
        } catch (error) {
            console.error('Error closing old milestone:', error);
            this.notification.error('Failed to close old milestone: ' + error.message);
        }
    }

    // lib/ui/views/SprintManagementView.js - resetCurrentSprint function

    resetCurrentSprint() {
        if (confirm('Are you sure you want to reset the current sprint? This will delete all sprint data and cannot be undone.')) {
            try {
                // Remove the current sprint from history if it exists
                if (this.sprintState.id && this.sprintHistory && this.sprintHistory.length > 0) {
                    const historyIndex = this.sprintHistory.findIndex(sprint => sprint.id === this.sprintState.id);
                    if (historyIndex >= 0) {
                        this.sprintHistory.splice(historyIndex, 1);
                        this.saveSprintHistory();
                        this.notification.info("Current sprint removed from history.");
                    }
                }

                // Reset the sprint state
                this.sprintState = {
                    endSprint: false,
                    preparedForNext: false,
                    currentMilestone: null,
                    userPerformance: {}
                };
                this.saveSprintState();
                this.notification.success('Current sprint has been reset');
                this.render();
            } catch (error) {
                console.error('Error resetting current sprint:', error);
                this.notification.error('Failed to reset sprint: ' + error.message);
            }
        }
    }

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
        const lockIcon = document.createElement('div');
        lockIcon.innerHTML = '🔒';
        lockIcon.style.fontSize = '48px';
        lockIcon.style.marginBottom = '20px';
        const message = document.createElement('h3');
        message.textContent = 'Sprint Management is Locked';
        message.style.marginBottom = '15px';
        message.style.color = '#495057';
        const instruction = document.createElement('p');
        instruction.innerHTML = 'Sprint Management is only available when URL contains <strong>exactly</strong> <code>?milestone_title=Started</code> with no other parameters';
        instruction.style.color = '#6c757d';
        instruction.style.marginBottom = '20px';
        const link = document.createElement('a');
        const currentUrl = new URL(window.location.href);
        currentUrl.search = '';
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


    copyClosedTickets() {
        try {
            const closedTickets = this.sprintState.closedTicketsList || [];

            if (closedTickets.length === 0) {
                this.notification.warning('No closed tickets found in saved sprint history');
                return;
            }

            // Separate tickets into regular closed and needs-merge
            const regularClosed = closedTickets.filter(ticket => !ticket.hasNeedsMergeLabel);
            const needsMerge = closedTickets.filter(ticket => ticket.hasNeedsMergeLabel);

            // Format the text with sections
            let formattedText = "";

            if (regularClosed.length > 0) {
                formattedText += regularClosed.map(ticket => `- ${ticket.title}`).join('\n');
            }

            if (needsMerge.length > 0) {
                formattedText += "\n\nNeeds-merge:\n";
                formattedText += needsMerge.map(ticket => `- ${ticket.title}`).join('\n');
            }

            // Wrap in quotes
            formattedText = `"${formattedText}"`;

            navigator.clipboard.writeText(formattedText).then(() => {
                this.notification.success(`Copied ${closedTickets.length} issue ${closedTickets.length !== 1 ? 'names' : 'name'} to clipboard`);
            }).catch(err => {
                console.error('Error copying to clipboard:', err);
                this.notification.error('Failed to copy to clipboard');
            });
        } catch (error) {
            console.error('Error copying closed tickets:', error);
            this.notification.error('Error processing issues');
        }
    }

    updateStatus(message, type = 'info') {
        if (this.notification) {
            this.notification[type](message);
        } else {
        }
    }

    getClosedTickets() {
        const closedTickets = [];
        const boardLists = document.querySelectorAll('.board-list');
        boardLists.forEach(boardList => {
            let boardTitle = '';
            try {
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
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
            const isClosedBoard = boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished');
            const boardCards = boardList.querySelectorAll('.board-card');
            boardCards.forEach(card => {
                try {
                    let hasNeedsMergeLabel = false;
                    let item = null;
                    if (card.__vue__ && card.__vue__.$children) {
                        const issue = card.__vue__.$children.find(child => child.$props && child.$props.item);
                        if (issue && issue.$props && issue.$props.item) {
                            item = issue.$props.item;
                            if (item.labels) {
                                const labels = Array.isArray(item.labels) ? item.labels : item.labels.nodes ? item.labels.nodes : [];
                                hasNeedsMergeLabel = labels.some(label => {
                                    const labelName = label.title || label.name || '';
                                    return labelName.toLowerCase() === 'needs-merge';
                                });
                            }
                        }
                    }
                    if (isClosedBoard || hasNeedsMergeLabel) {
                        let title = '';
                        let id = '';
                        if (item) {
                            title = item.title;
                            id = item.iid;
                        } else {
                            const titleEl = card.querySelector('.board-card-title');
                            if (titleEl) {
                                title = titleEl.textContent.trim();
                            }
                            const idMatch = card.querySelector('[data-issue-id]');
                            if (idMatch && idMatch.dataset.issueId) {
                                id = idMatch.dataset.issueId;
                            } else {
                                id = 'unknown';
                            }
                        }
                        if (title) {
                            closedTickets.push({
                                id: id || 'unknown',
                                title: title,
                                hasNeedsMergeLabel: isClosedBoard ? false : hasNeedsMergeLabel
                            });
                        }
                    }

                } catch (err) {
                    console.error('Error processing card:', err);
                }
            });
        });
        return closedTickets;
    }

    copySprintData() {
        try {
            // Get data from saved state rather than calculating again
            const {
                totalTickets,
                closedTickets,
                totalHours,
                closedHours,
                extraHoursClosed = 0
            } = this.sprintState;

            const totalClosedHours = closedHours + extraHoursClosed;
            let prediction = 'schlecht';
            const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
            const hoursRatio = totalHours > 0 ? totalClosedHours / totalHours : 0;

            if (ticketRatio > 0.7 || hoursRatio > 0.7) {
                prediction = 'gut';
            } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
                prediction = 'mittel';
            }

            const formattedData = `${totalTickets}\n${closedTickets}\n${totalHours}\n${totalClosedHours}\n\n${prediction}`;

            navigator.clipboard.writeText(formattedData).then(() => {
                this.notification.success('Sprint data copied to clipboard');
            }).catch(err => {
                console.error('Error copying sprint data to clipboard:', err);
                this.notification.error('Failed to copy sprint data');
            });
        } catch (error) {
            console.error('Error copying sprint data:', error);
            this.notification.error('Error processing sprint data');
        }
    }

    calculateSprintData() {
        let totalTickets = 0;
        let totalHours = 0;
        let closedHours = 0;
        const boardLists = document.querySelectorAll('.board-list');
        boardLists.forEach(boardList => {
            let boardTitle = '';
            try {
                if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                    const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
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
            const isClosedBoard = boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished');
            const boardCards = boardList.querySelectorAll('.board-card');
            boardCards.forEach(card => {
                try {
                    if (card.__vue__ && card.__vue__.$children) {
                        const issue = card.__vue__.$children.find(child => child.$props && child.$props.item);
                        if (issue && issue.$props && issue.$props.item) {
                            const item = issue.$props.item;
                            totalTickets++;
                            let hasNeedsMergeLabel = false;
                            if (item.labels) {
                                const labels = Array.isArray(item.labels) ? item.labels : item.labels.nodes ? item.labels.nodes : [];
                                hasNeedsMergeLabel = labels.some(label => {
                                    const labelName = label.title || label.name || '';
                                    return labelName.toLowerCase() === 'needs-merge';
                                });
                            }
                            if (item.timeEstimate) {
                                const hours = item.timeEstimate / 3600;
                                totalHours += hours;
                                if (isClosedBoard || hasNeedsMergeLabel) {
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
        totalHours = Math.round(totalHours * 10) / 10;
        closedHours = Math.round(closedHours * 10) / 10;
        let prediction = 'schlecht';
        const closedTickets = this.getClosedTickets().length;
        const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
        const hoursRatio = totalHours > 0 ? closedHours / totalHours : 0;
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
            button.addEventListener('click', function () {
                onClick();
            });
        }
        buttonWrapper.appendChild(button);
        container.appendChild(buttonWrapper);
        return button;
    }

    darkenColor(hex, percent) {
        hex = hex.replace(/^#/, '');
        let r = parseInt(hex.substr(0, 2), 16);
        let g = parseInt(hex.substr(2, 2), 16);
        let b = parseInt(hex.substr(4, 2), 16);
        r = Math.floor(r * (100 - percent) / 100);
        g = Math.floor(g * (100 - percent) / 100);
        b = Math.floor(b * (100 - percent) / 100);
        r = Math.min(255, Math.max(0, r));
        g = Math.min(255, Math.max(0, g));
        b = Math.min(255, Math.max(0, b));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    getCurrentMilestone() {
        try {
            const boardLists = document.querySelectorAll('.board-list');
            boardLists.forEach(boardList => {
                const boardItems = boardList.querySelectorAll('.board-card');
                boardItems.forEach(item => {
                    try {
                        if (item.__vue__ && item.__vue__.$children) {
                            const issue = item.__vue__.$children.find(child => child.$props && child.$props.item && child.$props.item.milestone);
                            if (issue && issue.$props.item && issue.$props.item.milestone && issue.$props.item.milestone.title) {
                                this.sprintState.currentMilestone = issue.$props.item.milestone.title;
                            }
                        }
                    } catch (e) {
                        console.error('Error parsing issue for milestone:', e);
                    }
                });
            });
            if (this.sprintState.currentMilestone) {
                this.saveSprintState();
            }
        } catch (e) {
            console.error('Error getting current milestone:', e);
        }
    }

    endSprint() {
        try {
            const sprintData = this.calculateSprintData();
            const closedTickets = this.getClosedTickets();
            const userPerformance = this.calculateUserPerformance();
            const sprintId = Date.now().toString();
            this.sprintState.id = sprintId;
            this.sprintState.endSprint = true;
            this.sprintState.totalTickets = sprintData.totalTickets;
            this.sprintState.closedTickets = closedTickets.length;
            this.sprintState.totalHours = sprintData.totalHours;
            this.sprintState.closedHours = sprintData.closedHours;
            this.sprintState.userPerformance = userPerformance;
            this.sprintState.timestamp = new Date().toISOString();
            this.saveSprintState();
            this.notification.success('Sprint ended. Data captured successfully.');
            if (this.uiManager && this.uiManager.issueSelector && typeof this.uiManager.issueSelector.startSelection === 'function') {
                if (this.uiManager.tabManager && typeof this.uiManager.tabManager.switchToTab === 'function') {
                    this.uiManager.tabManager.switchToTab('bulkcomments');
                }
                setTimeout(() => {
                    this.uiManager.issueSelector.startSelection();
                }, 300);
                this.notification.info('Issue selection started. Please select issues to process.');
            }
            this.render();
        } catch (error) {
            console.error('Error ending sprint:', error);
            this.notification.error('Failed to end sprint: ' + error.message);
        }
    }

    deleteCurrentSprint() {
        try {
            if (this.sprintState.id && this.sprintHistory && this.sprintHistory.length > 0) {
                const historyIndex = this.sprintHistory.findIndex(sprint => sprint.id === this.sprintState.id);
                if (historyIndex >= 0) {
                    this.sprintHistory.splice(historyIndex, 1);
                    this.saveSprintHistory();
                    this.notification.info("Sprint removed from history.");
                }
            }
            this.sprintState = {
                endSprint: false,
                preparedForNext: false,
                currentMilestone: this.sprintState.currentMilestone,
                userPerformance: {}
            };
            this.saveSprintState();
            this.notification.success('Sprint data has been deleted.');
            this.render();
        } catch (error) {
            console.error('Error deleting sprint data:', error);
            this.notification.error('Failed to delete sprint data: ' + error.message);
        }
    }

    prepareForNextSprint() {
        try {
            const currentData = this.calculateSprintData();
            const extraHoursClosed = Math.max(0, this.sprintState.totalHours - currentData.totalHours);

            // Save closed tickets to history
            const closedTickets = this.getClosedTickets();
            this.sprintState.closedTickets = closedTickets.length;
            this.sprintState.closedTicketsList = closedTickets;

            // Archive the completed sprint
            this.archiveCompletedSprint();

            this.sprintState.preparedForNext = true;
            this.sprintState.extraHoursClosed = extraHoursClosed;
            this.saveSprintState();
            this.notification.success(`Sprint preparation complete. ${extraHoursClosed}h of carried over work identified.`);
            this.render();
        } catch (error) {
            console.error('Error preparing for next sprint:', error);
            this.notification.error('Failed to prepare for next sprint: ' + error.message);
        }
    }

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
                <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #eee;">
                    <button id="delete-sprint-btn" style="width: 100%; padding: 8px; background-color: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">Delete Current Sprint Data</button>
                </div>
            </div>
        `;
            this.showModal('Edit Sprint Data', formHTML, () => {
                this.sprintState.totalTickets = parseFloat(document.getElementById('edit-total-tickets').value) || 0;
                this.sprintState.closedTickets = parseFloat(document.getElementById('edit-closed-tickets').value) || 0;
                this.sprintState.totalHours = parseFloat(document.getElementById('edit-total-hours').value) || 0;
                this.sprintState.closedHours = parseFloat(document.getElementById('edit-closed-hours').value) || 0;
                this.sprintState.extraHoursClosed = parseFloat(document.getElementById('edit-extra-hours').value) || 0;
                if (this.sprintState.totalTickets > 0 && !this.sprintState.endSprint) {
                    this.sprintState.endSprint = true;
                }
                if (this.sprintState.extraHoursClosed > 0 && !this.sprintState.survivorsSet) {
                    this.sprintState.survivorsSet = true;
                }
                if (this.sprintState.id && this.sprintHistory && this.sprintHistory.length > 0) {
                    const historyIndex = this.sprintHistory.findIndex(sprint => sprint.id === this.sprintState.id);
                    if (historyIndex >= 0) {
                        this.sprintHistory[historyIndex].totalTickets = this.sprintState.totalTickets;
                        this.sprintHistory[historyIndex].closedTickets = this.sprintState.closedTickets;
                        this.sprintHistory[historyIndex].totalHours = this.sprintState.totalHours;
                        this.sprintHistory[historyIndex].closedHours = this.sprintState.closedHours;
                        this.sprintHistory[historyIndex].extraHoursClosed = this.sprintState.extraHoursClosed;
                        this.saveSprintHistory();
                        this.notification.info("Sprint data updated in history as well.");
                    }
                }
                this.saveSprintState();
                this.notification.success('Sprint data updated successfully.');
                this.render();
            });
            setTimeout(() => {
                const deleteButton = document.getElementById('delete-sprint-btn');
                if (deleteButton) {
                    deleteButton.addEventListener('click', e => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (confirm('Are you sure you want to delete the current sprint data? This action cannot be undone.')) {
                            this.deleteCurrentSprint();
                            const modalOverlay = document.querySelector('div[style*="position: fixed"][style*="z-index: 1000"]');
                            if (modalOverlay && modalOverlay.parentNode) {
                                modalOverlay.parentNode.removeChild(modalOverlay);
                            }
                        }
                    });
                }
            }, 100);
        } catch (error) {
            console.error('Error editing sprint data:', error);
            this.notification.error('Failed to edit sprint data: ' + error.message);
        }
    }

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
        modalOverlay.addEventListener('click', e => {
            if (e.target === modalOverlay) {
                document.body.removeChild(modalOverlay);
            }
        });
        document.body.appendChild(modalOverlay);
    }

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
        dataContainer.appendChild(createDataRow('Total Hours:', totalHours + 'h'));
        dataContainer.appendChild(createDataRow('Closed Hours:', closedHours + 'h'));
        if (extraHoursClosed > 0) {
            dataContainer.appendChild(createDataRow('Extra Hours Closed:', extraHoursClosed + 'h'));
            dataContainer.appendChild(createDataRow('Total Hours Closed:', closedHours + extraHoursClosed + 'h'));
        }
        if (timestamp) {
            const date = new Date(timestamp);
            const formattedDate = `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
            dataContainer.appendChild(createDataRow('Captured On:', formattedDate));
        }
        container.appendChild(dataContainer);
    }

    saveSprintState() {
        try {
            localStorage.setItem('gitLabHelperSprintState', JSON.stringify(this.sprintState));
        } catch (error) {
            console.error('Failed to save sprint state to localStorage:', error);
            this.notification.error('Failed to save sprint state');
        }
    }

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
                        const boardComponent = boardList.__vue__.$children.find(child => child.$props && child.$props.list && child.$props.list.title);
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
                const isClosedBoard = boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished');
                const boardCards = boardList.querySelectorAll('.board-card');
                boardCards.forEach(card => {
                    try {
                        if (card.__vue__ && card.__vue__.$children) {
                            const issue = card.__vue__.$children.find(child => child.$props && child.$props.item);
                            if (issue && issue.$props && issue.$props.item) {
                                const item = issue.$props.item;
                                let assignees = [];
                                if (item.assignees && item.assignees.nodes && item.assignees.nodes.length) {
                                    assignees = item.assignees.nodes;
                                } else if (item.assignees && item.assignees.length > 0) {
                                    assignees = item.assignees;
                                }
                                if (assignees.length === 0) {
                                    return;
                                }
                                const timeEstimate = item.timeEstimate || 0;
                                const timePerAssignee = timeEstimate / assignees.length;
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
                                    userPerformance[name].totalTickets++;
                                    userPerformance[name].totalHours += timePerAssignee / 3600;
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
            if (!this.sprintState.endSprint || !this.sprintState.timestamp) {
                return;
            }
            const archiveEntry = {
                id: this.sprintState.id || Date.now().toString(),
                milestone: this.sprintState.currentMilestone,
                totalTickets: this.sprintState.totalTickets,
                closedTickets: this.sprintState.closedTickets,
                totalHours: this.sprintState.totalHours,
                closedHours: this.sprintState.closedHours,
                extraHoursClosed: this.sprintState.extraHoursClosed || 0,
                userPerformance: this.sprintState.userPerformance || {},
                userDistributions: this.sprintState.userDistributions || {},
                timestamp: this.sprintState.timestamp,
                completedAt: new Date().toISOString(),
                closedTicketsList: this.sprintState.closedTicketsList || []
            };
            this.sprintHistory.unshift(archiveEntry);
            if (this.sprintHistory.length > 10) {
                this.sprintHistory = this.sprintHistory.slice(0, 10);
            }
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
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
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
        const tbody = document.createElement('tbody');
        this.sprintHistory.forEach(sprint => {
            const row = document.createElement('tr');
            row.style.borderBottom = '1px solid #dee2e6';
            row.style.transition = 'background-color 0.2s';
            row.style.cursor = 'pointer';
            row.addEventListener('mouseenter', () => {
                row.style.backgroundColor = '#f1f1f1';
            });
            row.addEventListener('mouseleave', () => {
                row.style.backgroundColor = '';
            });
            row.addEventListener('click', () => {
                this.showSprintDetails(sprint);
            });
            const tdMilestone = document.createElement('td');
            tdMilestone.style.padding = '8px';
            tdMilestone.textContent = sprint.milestone || 'Unnamed Sprint';
            tdMilestone.style.color = '#1f75cb';
            tdMilestone.style.fontWeight = 'bold';
            row.appendChild(tdMilestone);
            const tdTickets = document.createElement('td');
            tdTickets.style.padding = '8px';
            tdTickets.textContent = `${sprint.closedTickets}/${sprint.totalTickets}`;
            row.appendChild(tdTickets);
            const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
            const tdHours = document.createElement('td');
            tdHours.style.padding = '8px';
            tdHours.textContent = `${totalClosedHours}/${sprint.totalHours}h`;
            row.appendChild(tdHours);
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

    // lib/ui/views/SprintManagementView.js - archiveCompletedSprint function

    archiveCompletedSprint() {
        try {
            if (!this.sprintState.endSprint || !this.sprintState.timestamp) {
                return;
            }
            const archiveEntry = {
                id: this.sprintState.id || Date.now().toString(),
                milestone: this.sprintState.currentMilestone,
                totalTickets: this.sprintState.totalTickets,
                closedTickets: this.sprintState.closedTickets,
                totalHours: this.sprintState.totalHours,
                closedHours: this.sprintState.closedHours,
                extraHoursClosed: this.sprintState.extraHoursClosed || 0,
                userPerformance: this.sprintState.userPerformance || {},
                userDistributions: this.sprintState.userDistributions || {},
                timestamp: this.sprintState.timestamp,
                completedAt: new Date().toISOString(),
                closedTicketsList: this.sprintState.closedTicketsList || []
            };
            this.sprintHistory.unshift(archiveEntry);
            if (this.sprintHistory.length > 10) {
                this.sprintHistory = this.sprintHistory.slice(0, 10);
            }
            this.saveSprintHistory();
        } catch (error) {
            console.error('Error archiving sprint:', error);
        }
    }

// lib/ui/views/SprintManagementView.js - showSprintDetails function

    showSprintDetails(sprint) {
        const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);
        const ticketCompletion = sprint.totalTickets > 0 ? sprint.closedTickets / sprint.totalTickets * 100 : 0;
        const hourCompletion = sprint.totalHours > 0 ? totalClosedHours / sprint.totalHours * 100 : 0;
        const startDate = new Date(sprint.timestamp);
        const endDate = new Date(sprint.completedAt || sprint.timestamp);
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
                      ${ticketCompletion.toFixed(2)}% completed
                  </div>
              </div>
              
              <div style="padding: 10px; background-color: #e9ecef; border-radius: 4px;">
                  <h4 style="margin-top: 0; font-size: 14px;">Hours</h4>
                  <div style="font-size: 24px; font-weight: bold; margin-bottom: 5px;">
                      ${totalClosedHours}/${sprint.totalHours}h
                  </div>
                  <div style="font-size: 14px; color: #6c757d;">
                      ${hourCompletion.toFixed(2)}% completed
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
                      <td style="padding: 8px;">${sprint.extraHoursClosed || 0}h</td>
                  </tr>
              </table>
          </div>
  `;

        // Copy buttons for sprint data
        content += `
      <div style="margin-bottom: 20px; display: flex; gap: 10px;">
          <button id="copy-sprint-data-btn" style="padding: 8px 12px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
              Copy Sprint Data Summary
          </button>
          <button id="copy-closed-tickets-btn" style="padding: 8px 12px; background-color: #fd7e14; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
              Copy Closed Issue Names
          </button>
      </div>
  `;

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
            const sortedUsers = Object.entries(sprint.userPerformance).sort(([, a], [, b]) => b.closedHours - a.closedHours);
            sortedUsers.forEach(([name, data]) => {
                const userTicketCompletion = data.totalTickets > 0 ? (data.closedTickets / data.totalTickets * 100).toFixed(0) : 0;
                content += `
              <tr style="border-bottom: 1px solid #dee2e6;">
                  <td style="padding: 8px;">${name}</td>
                  <td style="padding: 8px; text-align: center;">${data.closedTickets}/${data.totalTickets}</td>
                  <td style="padding: 8px; text-align: center;">${userTicketCompletion}%</td>
                  <td style="padding: 8px; text-align: right;">${data.closedHours}/${data.totalHours}h</td>
              </tr>
          `;
            });
            content += `
                  </tbody>
              </table>
          </div>
      `;
        }

        // Add closed tickets list section
        if (sprint.closedTicketsList && sprint.closedTicketsList.length > 0) {
            // Separate tickets into regular closed and needs-merge
            const regularClosed = sprint.closedTicketsList.filter(ticket => !ticket.hasNeedsMergeLabel);
            const needsMerge = sprint.closedTicketsList.filter(ticket => ticket.hasNeedsMergeLabel);

            content += `
          <div style="margin-top: 20px;">
              <h4 style="margin-bottom: 10px; font-size: 16px;">Closed Issues (${sprint.closedTicketsList.length})</h4>
              <div style="max-height: 200px; overflow-y: auto; border: 1px solid #dee2e6; border-radius: 4px; padding: 10px; background-color: #f8f9fa;">
    `;

            if (regularClosed.length > 0) {
                content += `
                  <div style="margin-bottom: ${needsMerge.length > 0 ? '15px' : '0'};">
                    <ul style="margin: 0; padding-left: 20px;">
      `;

                regularClosed.forEach(ticket => {
                    content += `<li style="margin-bottom: 5px;">${ticket.title} <span style="color: #6c757d; font-size: 12px;">#${ticket.id}</span></li>`;
                });

                content += `
                    </ul>
                  </div>
      `;
            }

            if (needsMerge.length > 0) {
                content += `
                  <div>
                    <h5 style="margin-top: 0; font-size: 14px; color: #dc3545;">Needs-merge:</h5>
                    <ul style="margin: 0; padding-left: 20px;">
      `;

                needsMerge.forEach(ticket => {
                    content += `<li style="margin-bottom: 5px;">${ticket.title} <span style="color: #6c757d; font-size: 12px;">#${ticket.id}</span></li>`;
                });

                content += `
                    </ul>
                  </div>
      `;
            }

            content += `
              </div>
          </div>
    `;
        }

        content += '</div>';

        this.showModal(`Sprint Details: ${sprint.milestone || 'Unnamed Sprint'}`, content);

        // Add event listeners to the copy buttons
        setTimeout(() => {
            const copySprintDataBtn = document.getElementById('copy-sprint-data-btn');
            const copyClosedTicketsBtn = document.getElementById('copy-closed-tickets-btn');

            if (copySprintDataBtn) {
                copySprintDataBtn.addEventListener('click', () => {
                    this.copySprintDataFromHistory(sprint);
                });
            }

            if (copyClosedTicketsBtn) {
                copyClosedTicketsBtn.addEventListener('click', () => {
                    this.copyClosedTicketsFromHistory(sprint);
                });
            }
        }, 100);
    }
    copySprintDataFromHistory(sprint) {
        try {
            const totalTickets = sprint.totalTickets || 0;
            const closedTickets = sprint.closedTickets || 0;
            const totalHours = sprint.totalHours || 0;
            const totalClosedHours = (sprint.closedHours || 0) + (sprint.extraHoursClosed || 0);

            let prediction = 'schlecht';
            const ticketRatio = totalTickets > 0 ? closedTickets / totalTickets : 0;
            const hoursRatio = totalHours > 0 ? totalClosedHours / totalHours : 0;

            if (ticketRatio > 0.7 || hoursRatio > 0.7) {
                prediction = 'gut';
            } else if (ticketRatio > 0.5 || hoursRatio > 0.5) {
                prediction = 'mittel';
            }

            const formattedData = `${totalTickets}\n${closedTickets}\n${totalHours}\n${totalClosedHours}\n\n${prediction}`;

            navigator.clipboard.writeText(formattedData).then(() => {
                this.notification.success('Sprint data copied to clipboard');
            }).catch(err => {
                console.error('Error copying sprint data to clipboard:', err);
                this.notification.error('Failed to copy sprint data');
            });
        } catch (error) {
            console.error('Error copying sprint data from history:', error);
            this.notification.error('Error processing sprint data');
        }
    }

    copyClosedTicketsFromHistory(sprint) {
        try {
            const closedTickets = sprint.closedTicketsList || [];

            if (closedTickets.length === 0) {
                this.notification.warning('No closed tickets found for this sprint');
                return;
            }

            // Separate tickets into regular closed and needs-merge
            const regularClosed = closedTickets.filter(ticket => !ticket.hasNeedsMergeLabel);
            const needsMerge = closedTickets.filter(ticket => ticket.hasNeedsMergeLabel);

            // Format the text with sections
            let formattedText = "";

            if (regularClosed.length > 0) {
                formattedText += regularClosed.map(ticket => `- ${ticket.title}`).join('\n');
            }

            if (needsMerge.length > 0) {
                formattedText += "\n\nNeeds-merge:\n";
                formattedText += needsMerge.map(ticket => `- ${ticket.title}`).join('\n');
            }

            // Wrap in quotes
            formattedText = `"${formattedText}"`;

            navigator.clipboard.writeText(formattedText).then(() => {
                this.notification.success(`Copied ${closedTickets.length} issue ${closedTickets.length !== 1 ? 'names' : 'name'} to clipboard`);
            }).catch(err => {
                console.error('Error copying to clipboard:', err);
                this.notification.error('Failed to copy to clipboard');
            });
        } catch (error) {
            console.error('Error copying closed tickets from history:', error);
            this.notification.error('Error processing issues');
        }
    }
}
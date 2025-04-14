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
        this.membersList = []; // Add this line to store members

        // Try to get members from various sources
        if (this.gitlabApi) {
            this.fetchMembers();
        }
    }

    /**
     * Add copy summary button
     * @param {HTMLElement} container - Container element to add the button to
     * @param {Object} assigneeTimeMap - Map of assignee names to time estimates
     * @param {number} totalTickets - Total number of tickets
     */
    addCopySummaryButton(container, assigneeTimeMap, totalTickets) {
        // Initialize notification if not already available
        if (!this.notification) {
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

        // Create a button container with some margin
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '15px';
        buttonContainer.style.textAlign = 'center';

        // Create the copy button with improved styling
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy Summary Data';
        copyButton.style.padding = '8px 16px';
        copyButton.style.backgroundColor = '#1f75cb';
        copyButton.style.color = 'white';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '4px';
        copyButton.style.cursor = 'pointer';
        copyButton.style.fontWeight = 'bold';
        copyButton.style.transition = 'background-color 0.2s ease';

        // Hover effects
        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.backgroundColor = '#1a63ac';
        });

        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.backgroundColor = '#1f75cb';
        });

        // Click handler to format and copy data
        copyButton.onclick = () => {
            try {
                // Format data with tab separation
                let formattedData = '';

                // Sort assignees by time spent (descending)
                const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
                    return assigneeTimeMap[b] - assigneeTimeMap[a];
                });

                // Add each assignee with their hours - exactly one tab character between name and hours
                sortedAssignees.forEach(name => {
                    const hours = (assigneeTimeMap[name] / 3600); // Convert seconds to hours with 1 decimal
                    formattedData += `${name}\t${hours}\n`;
                });

                // Add total tickets count at the end
                formattedData += `Issues\t${totalTickets}`;

                // Copy to clipboard
                navigator.clipboard.writeText(formattedData)
                    .then(() => {
                        // Show notification - find the first available notification method
                        if (this.notification) {
                            this.notification.success('Summary data copied to clipboard');
                        } else if (this.uiManager && this.uiManager.notification) {
                            this.uiManager.notification.success('Summary data copied to clipboard');
                        } else {
                            console.log('Summary data copied to clipboard');
                        }
                    })
                    .catch(err => {
                        console.error('Failed to copy data:', err);
                        if (this.notification) {
                            this.notification.error('Failed to copy data to clipboard');
                        } else if (this.uiManager && this.uiManager.notification) {
                            this.uiManager.notification.error('Failed to copy data to clipboard');
                        } else {
                            console.error('Failed to copy data to clipboard');
                        }
                    });

                // Add visual feedback to the button
                const originalText = copyButton.textContent;
                copyButton.textContent = '✓ Copied!';
                copyButton.style.backgroundColor = '#28a745';

                setTimeout(() => {
                    copyButton.textContent = originalText;
                    copyButton.style.backgroundColor = '#1f75cb';
                }, 1500);

            } catch (error) {
                console.error('Error formatting or copying data:', error);
                if (this.notification) {
                    this.notification.error('Error preparing data for clipboard');
                } else if (this.uiManager && this.uiManager.notification) {
                    this.uiManager.notification.error('Error preparing data for clipboard');
                } else {
                    console.error('Error preparing data for clipboard');
                }
            }
        };

        buttonContainer.appendChild(copyButton);
        container.appendChild(buttonContainer);
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
    // Modified render method in SummaryView.js
// This is how you should update the existing render method

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

        // If we don't have members list yet, try to fetch them
        if (!this.membersList.length && this.gitlabApi) {
            this.fetchMembers().then(() => {
                // Refresh the view if we now have member data
                if (this.membersList.length) {
                    // We don't need to re-render as the links will already be created,
                    // but for future enhancements this could be useful
                }
            });
        }

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

        // Add the new copy button
        this.addCopySummaryButton(summaryContent, assigneeTimeMap, cardsWithTime);

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
    // lib/ui/views/SummaryView.js - renderDataTableWithDistribution method

    renderDataTableWithDistribution(container, assigneeTimeMap, totalHours, boardData, boardAssigneeData) {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        const boardNames = Object.keys(boardData || {});
        const totalRow = document.createElement('tr');
        totalRow.style.borderBottom = '2px solid #ddd';
        totalRow.style.fontWeight = 'bold';

        const totalLabelCell = document.createElement('td');
        // Make Total clickable
        const totalLink = document.createElement('a');
        totalLink.textContent = 'Total';
        totalLink.href = window.location.pathname + '?milestone_title=Started'; // Show all with current milestone
        totalLink.style.color = '#1f75cb';
        totalLink.style.textDecoration = 'none';
        totalLink.style.cursor = 'pointer';
        totalLink.addEventListener('mouseenter', () => {
            totalLink.style.textDecoration = 'underline';
        });
        totalLink.addEventListener('mouseleave', () => {
            totalLink.style.textDecoration = 'none';
        });
        totalLabelCell.appendChild(totalLink);
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
            // Make assignee name clickable
            const nameLink = document.createElement('a');

            // Handle 'Unassigned' differently
            if (name === 'Unassigned') {
                // For Unassigned, we'll link to the board with no assignee filter
                nameLink.href = window.location.pathname + '?milestone_title=Started';
                nameLink.textContent = name;
            } else {
                // For named assignees, add their username as a filter
                // We need to get the username based on the display name
                const username = this.getAssigneeUsername(name);
                nameLink.href = window.location.pathname + '?milestone_title=Started&assignee_username=' + username;
                nameLink.textContent = name;
            }

            nameLink.style.color = '#1f75cb';
            nameLink.style.textDecoration = 'none';
            nameLink.style.cursor = 'pointer';
            nameLink.addEventListener('mouseenter', () => {
                nameLink.style.textDecoration = 'underline';
            });
            nameLink.addEventListener('mouseleave', () => {
                nameLink.style.textDecoration = 'none';
            });
            nameCell.appendChild(nameLink);
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
    loadMembersList() {
        this.membersList =  this.uiManager.assigneeManager.fetchCurrentUser();
    }
    /**
     * Get the GitLab username for an assignee display name
     * @param {string} displayName - The display name to look up
     * @returns {string} The GitLab username, or a sanitized version of the display name if not found
     */
    getAssigneeUsername(displayName) {
        // If we have members from the API, check them first (most accurate)
        if (this.membersList && this.membersList.length > 0) {
            const member = this.membersList.find(m => m.name === displayName);
            if (member && member.username) {
                return member.username;
            }
        }

        // If members list is empty or the name wasn't found, try to fetch members
        if (!this.membersList.length) {
            // We'll need to rely on fallbacks since fetchMembers is async
            console.log('Member list not available, using fallback methods for username lookup');
        }

        // Try to find the username in the assignee whitelist if not found in members
        if (this.uiManager && this.uiManager.assigneeManager) {
            const whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
            if (whitelist && whitelist.length) {
                const assignee = whitelist.find(a => a.name === displayName);
                if (assignee && assignee.username) {
                    return assignee.username;
                }
            }
        }

        // Check if the name itself is a valid username (sometimes this happens)
        if (displayName && displayName.indexOf(' ') === -1 && /^[a-z0-9._-]+$/i.test(displayName)) {
            return displayName.toLowerCase();
        }

        // If we still don't have a username, sanitize the display name as a fallback
        // Remove spaces and special characters to create a username-like string
        return displayName.toLowerCase()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9._-]/g, '');
    }

    /**
     * Fetch members from GitLab API
     * @returns {Promise<Array>} Promise resolving to array of members
     */
    async fetchMembers() {
        try {
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
                if (!this.gitlabApi) {
                    console.warn('GitLab API not available for fetching members');
                    return [];
                }
            }

            const pathInfo = getPathFromUrl();
            if (!pathInfo) {
                console.warn('Could not determine project/group path');
                return [];
            }

            let endpoint;
            if (pathInfo.type === 'project') {
                endpoint = `projects/${pathInfo.encodedPath}/members`;
            } else if (pathInfo.type === 'group') {
                endpoint = `groups/${pathInfo.encodedPath}/members`;
            } else {
                console.warn('Unsupported path type:', pathInfo.type);
                return [];
            }

            // Use cached API call to avoid redundant requests
            const members = await this.gitlabApi.callGitLabApiWithCache(
                endpoint,
                {params: {per_page: 100}}
            );

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members');
                return [];
            }

            this.membersList = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            console.log(`Fetched ${this.membersList.length} members for username lookup`);
            return this.membersList;
        } catch (error) {
            console.error('Error fetching members for username lookup:', error);
            return [];
        }
    }

    
}
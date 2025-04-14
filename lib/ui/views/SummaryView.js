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
        this.membersList = []; // Store members
        this.potentialAssignees = []; // Store potential assignees that aren't on the current board

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
    render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');

        if (!summaryContent) return;

        // Make sure we have members list from at least one source
        if (!this.membersList || this.membersList.length === 0) {
            // First try loading from local sources (faster)
            this.loadMembersList();

            // Then try API fetch (async, might not be available immediately)
            if (this.gitlabApi || window.gitlabApi) {
                this.fetchMembers().then(members => {
                    if (members && members.length) {
                        console.log(`Successfully loaded ${members.length} members from API`);
                        // We don't need to re-render as the links will already be created,
                        // but for future enhancements this could be useful
                    }
                }).catch(err => {
                    console.warn('Failed to fetch members from API, using local sources only', err);
                });
            }
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

        // Identify potential assignees that aren't in current assigneeTimeMap
        this.findPotentialAssignees(assigneeTimeMap);

        // Render the data table with both current and potential assignees
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);

        // Add the new copy button
        this.addCopySummaryButton(summaryContent, assigneeTimeMap, cardsWithTime);

        if (this.uiManager && this.uiManager.removeLoadingScreen) {
            this.uiManager.removeLoadingScreen('summary-tab');
        }
    }

    /**
     * Find potential assignees by checking whitelist, members list, and history
     * @param {Object} currentAssigneeMap - Current assignee map (to exclude already listed assignees)
     */
    findPotentialAssignees(currentAssigneeMap) {
        this.potentialAssignees = [];

        try {
            // 1. Check assignee whitelist from settings
            const whitelistedAssignees = this.getWhitelistedAssignees();

            // 2. Check team members fetched from API
            if (this.membersList && this.membersList.length) {
                whitelistedAssignees.push(...this.membersList);
            }

            // 3. Check last sprint history for additional members
            const historyAssignees = this.getHistoryAssignees();
            if (historyAssignees.length) {
                whitelistedAssignees.push(...historyAssignees);
            }

            // Filter to keep only assignees not in the current map
            // and remove duplicates by using a temp Map
            const tempMap = new Map();
            const currentAssigneeSet = new Set(Object.keys(currentAssigneeMap || {}).map(name => name.toLowerCase()));

            whitelistedAssignees.forEach(assignee => {
                // Skip if we don't have a name or username
                if (!assignee || (!assignee.name && !assignee.username)) return;

                const name = assignee.name || assignee.username;

                // Skip if already in current assignees (case-insensitive comparison)
                if (currentAssigneeSet.has(name.toLowerCase())) return;

                // Use either username or name as key to avoid duplicates
                const key = (assignee.username || name).toLowerCase();

                // If we find an entry with stats, prioritize it
                if (assignee.stats && (!tempMap.has(key) || !tempMap.get(key).stats)) {
                    tempMap.set(key, assignee);
                } else if (!tempMap.has(key)) {
                    tempMap.set(key, assignee);
                }
            });

            // Convert back to array
            this.potentialAssignees = Array.from(tempMap.values());
        } catch (error) {
            console.error('Error finding potential assignees:', error);
        }
    }

    /**
     * Get whitelist of assignees from settings
     * @returns {Array} Whitelist of assignees
     */
    getWhitelistedAssignees() {
        let whitelist = [];

        try {
            // Try to get whitelist from the assignee manager
            if (this.uiManager && this.uiManager.assigneeManager &&
                typeof this.uiManager.assigneeManager.getAssigneeWhitelist === 'function') {
                whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
            }
            // Fall back to global function if available
            else if (typeof getAssigneeWhitelist === 'function') {
                whitelist = getAssigneeWhitelist();
            }
            // Try directly from localStorage as last resort
            else {
                try {
                    const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
                    if (storedValue) {
                        whitelist = JSON.parse(storedValue);
                    }
                } catch (e) {
                    console.warn('Error reading assignee whitelist from localStorage:', e);
                }
            }
        } catch (error) {
            console.error('Error getting whitelist:', error);
        }

        return Array.isArray(whitelist) ? whitelist : [];
    }

    /**
     * Get assignees from sprint history with their last performance stats
     * @returns {Array} Assignees from history with stats
     */
    getHistoryAssignees() {
        let historyAssignees = [];

        try {
            // Try to get sprint history from localStorage
            const historyStr = localStorage.getItem('gitLabHelperSprintHistory');

            if (historyStr) {
                const history = JSON.parse(historyStr);

                if (Array.isArray(history) && history.length > 0) {
                    // Get the most recent sprint entry
                    const latestSprint = history[0];

                    if (latestSprint && latestSprint.userPerformance) {
                        // Convert to array of assignees with stats
                        historyAssignees = Object.entries(latestSprint.userPerformance).map(([name, data]) => {
                            return {
                                name: name,
                                username: this.getUsernameFromName(name),
                                stats: {
                                    totalTickets: data.totalTickets || 0,
                                    closedTickets: data.closedTickets || 0,
                                    totalHours: data.totalHours || 0,
                                    closedHours: data.closedHours || 0,
                                    fromHistory: true
                                }
                            };
                        });
                    }
                }
            }
        } catch (error) {
            console.error('Error getting history assignees:', error);
        }

        return historyAssignees;
    }

    /**
     * Try to derive a username from a display name
     * @param {string} name - Display name
     * @returns {string} Best guess at username
     */
    getUsernameFromName(name) {
        if (!name) return '';

        // First check if we can find this name in our membersList
        if (this.membersList && this.membersList.length) {
            const match = this.membersList.find(m => m.name === name);
            if (match && match.username) {
                return match.username;
            }
        }

        // If not found, attempt to create a username by:
        // 1. Check if it already looks like a username (no spaces)
        if (!name.includes(' ')) {
            return name.toLowerCase();
        }

        // 2. If it has spaces, convert to dot format (e.g., "John Doe" -> "john.doe")
        return name.toLowerCase()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9._-]/g, '');
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

        // Add current assignees (sorted by time estimate)
        const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
            return assigneeTimeMap[b] - assigneeTimeMap[a];
        });

        sortedAssignees.forEach(name => {
            const hours = formatHours(assigneeTimeMap[name]);
            this.addAssigneeRow(table, name, hours, boardNames, boardAssigneeData);
        });

        // Add a separator if we have potential assignees
        if (this.potentialAssignees.length > 0) {
            const separatorRow = document.createElement('tr');
            const separatorCell = document.createElement('td');
            separatorCell.colSpan = 3;
            separatorCell.style.padding = '10px 0 5px';
            separatorCell.style.fontSize = '12px';
            separatorCell.style.color = '#666';
            separatorCell.style.fontStyle = 'italic';
            separatorCell.textContent = 'Other Potential Assignees:';
            separatorRow.appendChild(separatorCell);
            table.appendChild(separatorRow);

            // Add all potential assignees with history stats if available
            this.potentialAssignees.forEach(assignee => {
                // Use name or fallback to username
                const name = assignee.name || assignee.username;

                let extraInfo = '';
                if (assignee.stats) {
                    // Show last sprint's hours (marked with '?' to indicate it's historical)
                    const hours = `${assignee.stats.closedHours || 0}/${assignee.stats.totalHours || 0}h`;
                    extraInfo = ` (${hours}?)`;
                }

                this.addAssigneeRow(table, name + extraInfo, '0h', boardNames, {}, true);
            });
        }

        container.appendChild(table);
    }

    /**
     * Add an assignee row to the table
     * @param {HTMLElement} table - Table element to add row to
     * @param {string} name - Name of assignee
     * @param {string} hours - Hours for this assignee
     * @param {Array} boardNames - Array of board names
     * @param {Object} boardAssigneeData - Board assignee data
     * @param {boolean} isPotential - Whether this is a potential (non-active) assignee
     */
    addAssigneeRow(table, name, hours, boardNames, boardAssigneeData, isPotential = false) {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        // If it's a potential assignee with no current work, style it differently
        if (isPotential) {
            row.style.opacity = '0.75';
            row.style.fontStyle = 'italic';
        }

        const nameCell = document.createElement('td');
        // Extract the base name (without any stats info)
        const baseName = name.split(' (')[0];

        // Make assignee name clickable
        const nameLink = document.createElement('a');

        // Handle 'Unassigned' differently
        if (baseName === 'Unassigned') {
            // For Unassigned, we'll link to the board with no assignee filter
            nameLink.href = window.location.pathname + '?milestone_title=Started';
            nameLink.textContent = name;
        } else {
            // For named assignees, add their username as a filter
            // We need to get the username based on the display name
            const username = this.getAssigneeUsername(baseName);
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
        timeCell.textContent = `${hours}`;
        timeCell.style.textAlign = 'right';
        timeCell.style.padding = '5px 0';

        const distributionCell = document.createElement('td');
        distributionCell.style.textAlign = 'right';
        distributionCell.style.padding = '5px 0 5px 15px';
        distributionCell.style.color = '#666';
        distributionCell.style.fontSize = '12px';

        if (!isPotential && boardNames.length > 0 && boardAssigneeData) {
            const distributionValues = boardNames.map(boardName => {
                const boardAssignees = boardAssigneeData[boardName] || {};
                const assigneeInBoard = boardAssignees[baseName] || { timeEstimate: 0 };
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
        } else {
            // For potential assignees with no current work
            const emptyText = boardNames.map(() => {
                return `<span style="color:#aaa;">0h</span>`;
            }).join('/');

            distributionCell.innerHTML = emptyText;
        }

        row.appendChild(nameCell);
        row.appendChild(timeCell);
        row.appendChild(distributionCell);
        table.appendChild(row);
    }

    /**
     * Load members list from assigneeManager or other sources
     * This is an alternative to fetchMembers that doesn't use API
     */
    loadMembersList() {
        try {
            // First check if there's an assigneeManager available
            if (this.uiManager && this.uiManager.assigneeManager) {
                // Try to get current user
                if (typeof this.uiManager.assigneeManager.fetchCurrentUser === 'function') {
                    const currentUser = this.uiManager.assigneeManager.fetchCurrentUser();
                    if (currentUser) {
                        this.membersList = [currentUser];
                    }
                }

                // Also add whitelist members if available
                if (typeof this.uiManager.assigneeManager.getAssigneeWhitelist === 'function') {
                    const whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
                    if (Array.isArray(whitelist) && whitelist.length > 0) {
                        // If we already have members, add to them
                        if (this.membersList && this.membersList.length > 0) {
                            this.membersList = [...this.membersList, ...whitelist];
                        } else {
                            this.membersList = [...whitelist];
                        }
                    }
                }
            }

            // If no members found yet, try using global whitelist
            if (!this.membersList || this.membersList.length === 0) {
                const whitelist = this.getWhitelistedAssignees();
                if (whitelist && whitelist.length > 0) {
                    this.membersList = [...whitelist];
                }
            }

            // Ensure we have a valid array even if empty
            if (!this.membersList) {
                this.membersList = [];
            }

            console.log(`Loaded ${this.membersList.length} members from local sources`);
        } catch (error) {
            console.error('Error loading members list:', error);
            this.membersList = [];
        }
    }

    /**
     * Get the GitLab username for an assignee display name
     * @param {string} displayName - The display name to look up
     * @returns {string} The GitLab username, or a sanitized version of the display name if not found
     */
    getAssigneeUsername(displayName) {
        // Handle edge cases
        if (!displayName) return '';
        if (displayName === 'Unassigned') return 'none';

        // First, handle the case where displayName may include stats in parentheses
        // Extract just the name part (before any parentheses)
        const cleanName = displayName.split(' (')[0].trim();

        // If we have members from the API, check them first (most accurate)
        if (this.membersList && this.membersList.length > 0) {
            // First try exact match by name
            const exactMatch = this.membersList.find(m =>
                m.name === cleanName || m.username === cleanName);

            if (exactMatch && exactMatch.username) {
                return exactMatch.username;
            }

            // If no exact match, try case-insensitive match
            const caseInsensitiveMatch = this.membersList.find(m =>
                (m.name && m.name.toLowerCase() === cleanName.toLowerCase()) ||
                (m.username && m.username.toLowerCase() === cleanName.toLowerCase()));

            if (caseInsensitiveMatch && caseInsensitiveMatch.username) {
                return caseInsensitiveMatch.username;
            }
        }

        // If members list is empty or the name wasn't found, try to load members immediately
        if (!this.membersList || this.membersList.length === 0) {
            this.loadMembersList();

            // Check again with the newly loaded list
            if (this.membersList && this.membersList.length > 0) {
                const member = this.membersList.find(m =>
                    m.name === cleanName ||
                    m.username === cleanName ||
                    (m.name && m.name.toLowerCase() === cleanName.toLowerCase()) ||
                    (m.username && m.username.toLowerCase() === cleanName.toLowerCase()));

                if (member && member.username) {
                    return member.username;
                }
            }
        }

        // Check if the name itself is a valid username (sometimes this happens)
        if (cleanName && cleanName.indexOf(' ') === -1 && /^[a-z0-9._-]+$/i.test(cleanName)) {
            return cleanName.toLowerCase();
        }

        // If we still don't have a username, sanitize the display name as a fallback
        // Remove spaces and special characters to create a username-like string
        return cleanName.toLowerCase()
            .replace(/\s+/g, '.')
            .replace(/[^a-z0-9._-]/g, '');
    }

    /**
     * Fetch members from GitLab API and other sources
     * @returns {Promise<Array>} Promise resolving to array of members
     */
    async fetchMembers() {
        try {
            // Initialize with whitelist members first (as a fallback)
            const whitelistedAssignees = this.getWhitelistedAssignees();
            if (whitelistedAssignees && whitelistedAssignees.length > 0) {
                this.membersList = [...whitelistedAssignees];
                console.log(`Loaded ${this.membersList.length} members from whitelist as fallback`);
            }

            // Try to get gitlab API
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
                if (!this.gitlabApi) {
                    console.warn('GitLab API not available for fetching members, using whitelist only');
                    return this.membersList;
                }
            }

            // Get fetch path for GitLab API
            const pathInfo = getPathFromUrl?.();
            if (!pathInfo) {
                console.warn('Could not determine project/group path, using whitelist only');
                return this.membersList;
            }

            // Determine the correct endpoint
            let endpoint;
            if (pathInfo.type === 'project') {
                endpoint = `projects/${pathInfo.encodedPath}/members`;
            } else if (pathInfo.type === 'group') {
                endpoint = `groups/${pathInfo.encodedPath}/members`;
            } else {
                console.warn('Unsupported path type, using whitelist only:', pathInfo.type);
                return this.membersList;
            }

            // Use cached API call to avoid redundant requests
            console.log(`Fetching members from endpoint: ${endpoint}`);
            const members = await this.gitlabApi.callGitLabApiWithCache(
                endpoint,
                {params: {per_page: 100}}
            );

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members, using whitelist only');
                return this.membersList;
            }

            // Convert API response to our member format
            const apiMembers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            // Merge whitelist and API members, preferring API data
            const memberMap = new Map();

            // First add all API members
            apiMembers.forEach(member => {
                if (member.username) {
                    memberMap.set(member.username.toLowerCase(), member);
                }
            });

            // Then add whitelist members if not already in the map
            whitelistedAssignees.forEach(member => {
                if (member.username && !memberMap.has(member.username.toLowerCase())) {
                    memberMap.set(member.username.toLowerCase(), member);
                }
            });

            // Convert map back to array
            this.membersList = Array.from(memberMap.values());

            console.log(`Successfully fetched ${this.membersList.length} members for username lookup`);
            return this.membersList;
        } catch (error) {
            console.error('Error fetching members for username lookup:', error);
            // If we have a fallback list from whitelist, return it
            if (this.membersList && this.membersList.length > 0) {
                console.log(`Using ${this.membersList.length} members from whitelist after API error`);
                return this.membersList;
            }
            return [];
        }
    }
}
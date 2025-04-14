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
    async render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');
        if (!summaryContent) return;

        // Show a loading indicator while we fetch members
        if (!this.membersList || this.membersList.length === 0) {
            summaryContent.innerHTML = '<div style="text-align: center; padding: 20px;">Loading team members...</div>';

            try {
                // Wait for members to be fetched
                await this.fetchMembers();
            } catch (error) {
                console.error('Error fetching members:', error);
            }
        }

        // Clear the content to rebuild it
        summaryContent.innerHTML = '';

        // Update board stats
        if (this.uiManager) {
            this.uiManager.updateBoardStats({
                totalCards: cardsProcessed,
                withTimeCards: cardsWithTime,
                closedCards: this.getClosedBoardCount()
            });
        }

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

        if (this.uiManager) {
            this.uiManager.updateHeader(
                `Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`
            );
        }

        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }

        // Render the data table with both current and potential assignees
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData);

        // Add the copy button
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
            // Create a set of current assignee names (lowercase for case-insensitive comparison)
            const currentAssigneeSet = new Set();
            if (currentAssigneeMap) {
                Object.keys(currentAssigneeMap).forEach(name => {
                    currentAssigneeSet.add(name.toLowerCase());
                });
            }

            // 1. Collect all potential assignees from various sources
            let allPotentialAssignees = [];

            // First from whitelist settings
            const whitelistedAssignees = this.getWhitelistedAssignees();
            if (whitelistedAssignees && whitelistedAssignees.length) {
                allPotentialAssignees = [...allPotentialAssignees, ...whitelistedAssignees];
            }

            // Then from team members fetched from API
            if (this.membersList && this.membersList.length) {
                allPotentialAssignees = [...allPotentialAssignees, ...this.membersList];
            }

            // Finally from sprint history
            const historyAssignees = this.getHistoryAssignees();
            if (historyAssignees && historyAssignees.length) {
                allPotentialAssignees = [...allPotentialAssignees, ...historyAssignees];
            }

            // 2. Create a map to handle duplicates, preferring entries with stats
            const potentialAssigneeMap = new Map();

            allPotentialAssignees.forEach(assignee => {
                // Skip invalid entries
                if (!assignee || (!assignee.name && !assignee.username)) return;

                const name = assignee.name || assignee.username;
                // Skip if this person is already in current assignees
                if (currentAssigneeSet.has(name.toLowerCase())) return;

                // Use name as the key (lowercase for case-insensitive comparison)
                const key = name.toLowerCase();

                // If we already have this person, prefer the one with stats
                if (potentialAssigneeMap.has(key)) {
                    const existing = potentialAssigneeMap.get(key);
                    // Only replace if new one has stats and existing doesn't
                    if (assignee.stats && !existing.stats) {
                        potentialAssigneeMap.set(key, assignee);
                    }
                } else {
                    // First time seeing this person, add them
                    potentialAssigneeMap.set(key, assignee);
                }
            });

            // 3. Convert the map back to an array
            this.potentialAssignees = Array.from(potentialAssigneeMap.values());

            // 4. Log the results for debugging
            console.log(`Found ${this.potentialAssignees.length} potential assignees not currently on board`);
        } catch (error) {
            console.error('Error finding potential assignees:', error);
            this.potentialAssignees = [];
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
            // First try sprint history (more detailed)
            const sprintHistoryStr = localStorage.getItem('gitLabHelperSprintHistory');
            let foundSprintHistory = false;

            if (sprintHistoryStr) {
                const sprintHistory = JSON.parse(sprintHistoryStr);

                if (Array.isArray(sprintHistory) && sprintHistory.length > 0) {
                    // Get the most recent sprint entry
                    const latestSprint = sprintHistory[0];

                    if (latestSprint && latestSprint.userPerformance) {
                        // Convert to array of assignees with stats
                        historyAssignees = Object.entries(latestSprint.userPerformance).map(([name, data]) => {
                            const historyData = {
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

                            // Add distribution data if available
                            if (latestSprint.userDistributions &&
                                latestSprint.userDistributions[name] &&
                                latestSprint.userDistributions[name].distribution) {
                                historyData.stats.distribution = latestSprint.userDistributions[name].distribution;
                            }

                            return historyData;
                        });

                        foundSprintHistory = true;
                        console.log(`Found ${historyAssignees.length} assignees in sprint history`);
                    }
                }
            }

            // If no sprint history, try general history
            if (!foundSprintHistory) {
                const generalHistoryStr = localStorage.getItem('gitLabHelperHistory');

                if (generalHistoryStr) {
                    const generalHistory = JSON.parse(generalHistoryStr);

                    // Find most recent history entry for current board
                    const boardKey = this.getBoardKey();
                    if (generalHistory[boardKey]) {
                        const dates = Object.keys(generalHistory[boardKey]).sort().reverse();

                        if (dates.length > 0) {
                            const latestEntry = generalHistory[boardKey][dates[0]];

                            if (latestEntry && latestEntry.assigneeTimeMap) {
                                // Convert general history to assignee format
                                const additionalAssignees = Object.entries(latestEntry.assigneeTimeMap)
                                    .map(([name, timeEstimate]) => {
                                        return {
                                            name: name,
                                            username: this.getUsernameFromName(name),
                                            stats: {
                                                totalHours: formatHours(timeEstimate),
                                                closedHours: 0, // We don't know this from general history
                                                fromHistory: true
                                            }
                                        };
                                    });

                                console.log(`Found ${additionalAssignees.length} assignees in general history`);
                                historyAssignees = [...historyAssignees, ...additionalAssignees];
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error getting history assignees:', error);
        }

        return historyAssignees;
    }

    /**
     * Get board key for history lookup
     * @returns {string} Board key
     */
    getBoardKey() {
        try {
            const url = window.location.href;
            // Split at /boards/ and take everything after
            const splitAtBoards = url.split('/boards/');
            if (splitAtBoards.length < 2) {
                return 'unknown-board';
            }

            // Return everything after /boards/ as the key
            return splitAtBoards[1];
        } catch (error) {
            console.error('Error generating board key:', error);
            return 'unknown-board';
        }
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

        // Create the total row first
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
        totalLabelCell.style.padding = '8px 0';
        totalLabelCell.style.paddingLeft = '32px'; // Add padding to align with avatar rows

        const totalValueCell = document.createElement('td');
        totalValueCell.textContent = `${totalHours}h`;
        totalValueCell.style.textAlign = 'right';
        totalValueCell.style.padding = '8px 0';

        const totalDistributionCell = document.createElement('td');
        totalDistributionCell.style.textAlign = 'right';
        totalDistributionCell.style.padding = '8px 0 8px 15px';
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

        // STEP 1: Add current assignees (sorted by time estimate)
        // These are the users currently on the board
        const currentAssigneeSet = new Set();
        const sortedAssignees = Object.keys(assigneeTimeMap || {}).sort((a, b) => {
            return (assigneeTimeMap[b] || 0) - (assigneeTimeMap[a] || 0);
        });

        sortedAssignees.forEach(name => {
            if (!name) return;

            const hours = formatHours(assigneeTimeMap[name] || 0);
            this.addAssigneeRow(table, name, hours, boardNames, boardAssigneeData);

            // Remember this assignee is already shown
            currentAssigneeSet.add(name.toLowerCase());
        });

        // STEP 2: Find other members who have access to this board but aren't currently assigned
        if (this.membersList && this.membersList.length > 0) {
            const otherMembers = this.membersList.filter(member => {
                if (!member) return false;

                const name = member.name || member.username;
                if (!name) return false;

                return !currentAssigneeSet.has(name.toLowerCase());
            });

            if (otherMembers.length > 0) {
                const separatorRow = document.createElement('tr');
                const separatorCell = document.createElement('td');
                separatorCell.colSpan = 3;
                separatorCell.style.padding = '10px 0 5px 32px'; // Align with avatars
                separatorCell.style.fontSize = '12px';
                separatorCell.style.color = '#666';
                separatorCell.style.fontStyle = 'italic';
                separatorCell.textContent = 'Other Team Members:';
                separatorRow.appendChild(separatorCell);
                table.appendChild(separatorRow);

                // STEP 3: Add other members with board access
                otherMembers.forEach(member => {
                    const name = member.name || member.username;
                    if (!name) return;

                    // Display with historical data if available
                    if (member.stats) {
                        this.addAssigneeRow(table, name, '0h', boardNames, {}, true, member.stats);
                    } else {
                        this.addAssigneeRow(table, name, '0h', boardNames, {}, true);
                    }
                });
            }
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
     * @param {Object} historyStats - Historical statistics for this assignee
     */
    addAssigneeRow(table, name, hours, boardNames, boardAssigneeData, isPotential = false, historyStats = null) {
        if (!name) name = "Unknown User";

        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        // If it's a potential assignee with no current work, style it differently
        if (isPotential) {
            row.style.opacity = '0.75';
            row.style.fontStyle = 'italic';
        }

        const nameCell = document.createElement('td');
        nameCell.style.display = 'flex';
        nameCell.style.alignItems = 'center';
        nameCell.style.padding = '8px 0';

        // Find member details
        const member = this.findMemberByName(name);

        // Add avatar
        const avatar = document.createElement('div');
        avatar.style.width = '24px';
        avatar.style.height = '24px';
        avatar.style.borderRadius = '50%';
        avatar.style.marginRight = '8px';
        avatar.style.overflow = 'hidden';
        avatar.style.flexShrink = '0';

        if (member && member.avatar_url) {
            // Use actual avatar image
            const img = document.createElement('img');
            img.src = member.avatar_url;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            avatar.appendChild(img);
        } else {
            // Create placeholder with initials
            avatar.style.backgroundColor = '#e0e0e0';
            avatar.style.display = 'flex';
            avatar.style.alignItems = 'center';
            avatar.style.justifyContent = 'center';
            avatar.style.fontSize = '10px';
            avatar.style.fontWeight = 'bold';
            avatar.style.color = '#666';

            // Get initials from name
            const initials = name.split(' ')
                .map(part => part.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase();

            avatar.textContent = initials || '?';
        }

        nameCell.appendChild(avatar);

        // Create user name container
        const nameContainer = document.createElement('div');
        nameContainer.style.overflow = 'hidden';
        nameContainer.style.textOverflow = 'ellipsis';

        // Make assignee name clickable - link to user's issues
        const nameLink = document.createElement('a');

        // Create appropriate link based on username if available
        if (member && member.username) {
            // Link to user's issues in current milestone
            nameLink.href = window.location.pathname +
                `?milestone_title=Started&assignee_username=${member.username}`;
        } else {
            // Fall back to milestone view if no username
            nameLink.href = window.location.pathname + '?milestone_title=Started';
        }

        nameLink.textContent = name;
        nameLink.style.color = '#1f75cb';
        nameLink.style.textDecoration = 'none';
        nameLink.style.cursor = 'pointer';
        nameLink.style.display = 'block';
        nameLink.style.overflow = 'hidden';
        nameLink.style.textOverflow = 'ellipsis';
        nameLink.style.whiteSpace = 'nowrap';

        nameLink.addEventListener('mouseenter', () => {
            nameLink.style.textDecoration = 'underline';
        });
        nameLink.addEventListener('mouseleave', () => {
            nameLink.style.textDecoration = 'none';
        });

        nameContainer.appendChild(nameLink);
        nameCell.appendChild(nameContainer);

        const timeCell = document.createElement('td');
        timeCell.textContent = `${hours}`;
        timeCell.style.textAlign = 'right';
        timeCell.style.padding = '8px 0';

        const distributionCell = document.createElement('td');
        distributionCell.style.textAlign = 'right';
        distributionCell.style.padding = '8px 0 8px 15px';
        distributionCell.style.color = '#666';
        distributionCell.style.fontSize = '12px';

        if (!isPotential && boardNames.length > 0 && boardAssigneeData) {
            // For current assignees, show their board distribution
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
        } else if (historyStats && historyStats.fromHistory) {
            // For potential assignees with history stats

            if (historyStats.distribution && Array.isArray(historyStats.distribution)) {
                // Use the full distribution data if available
                const distributionText = historyStats.distribution.map((hours, index) => {
                    let spanHTML = `<span style="`;
                    if (hours === 0) {
                        spanHTML += `color:#aaa;`; // Grey for zero values
                    }
                    if (index === historyStats.distribution.length - 1 && hours > 0) {
                        spanHTML += `color:#28a745;`; // Green for last board with hours
                    }

                    spanHTML += `">${hours}h</span>`;
                    return spanHTML;
                }).join('/');

                // Add ? at the end to indicate it's historical
                distributionCell.innerHTML = distributionText + '?';
            } else {
                // Fallback to simpler style if we don't have distribution data
                const closedHours = historyStats.closedHours || 0;
                const totalHours = historyStats.totalHours || 0;

                // If we have boardNames, try to match the format
                if (boardNames && boardNames.length > 0) {
                    // Create empty placeholders for all but the last board
                    const placeholders = Array(boardNames.length - 1).fill('<span style="color:#aaa;">0h</span>');

                    // Add the historical data at the end
                    distributionCell.innerHTML = placeholders.join('/') +
                        `/<span style="color:#28a745;">${totalHours}h?</span>`;
                } else {
                    // Simple format
                    distributionCell.innerHTML = `<span style="color:#28a745;">${totalHours}h?</span>`;
                }
            }
        } else {
            // For potential assignees with no current work and no history
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
     * Fetch members from GitLab API who have access to the current board
     * @returns {Promise<Array>} Promise resolving to array of members
     */
    async fetchMembers() {
        try {
            // Initialize with whitelist members as these are likely relevant
            const whitelistedAssignees = this.getWhitelistedAssignees();
            let allMembers = [];

            if (whitelistedAssignees && whitelistedAssignees.length > 0) {
                allMembers = [...whitelistedAssignees];
                console.log(`Loaded ${allMembers.length} members from whitelist as initial set`);
            }

            // Try to get gitlab API
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
                if (!this.gitlabApi) {
                    console.warn('GitLab API not available for fetching members, using whitelist only');
                    this.membersList = allMembers;
                    return allMembers;
                }
            }

            // Get fetch path for GitLab API
            const pathInfo = getPathFromUrl?.() || {};
            if (!pathInfo || !pathInfo.type || !pathInfo.encodedPath) {
                console.warn('Could not determine project/group path, using whitelist only');
                this.membersList = allMembers;
                return allMembers;
            }

            // Determine the correct endpoint for this project/group
            let endpoint;
            if (pathInfo.type === 'project') {
                endpoint = `projects/${pathInfo.encodedPath}/members`;
            } else if (pathInfo.type === 'group') {
                endpoint = `groups/${pathInfo.encodedPath}/members`;
            } else {
                console.warn('Unsupported path type, using whitelist only:', pathInfo.type);
                this.membersList = allMembers;
                return allMembers;
            }

            // Use cached API call to avoid redundant requests
            console.log(`Fetching members from endpoint: ${endpoint}`);
            const members = await this.gitlabApi.callGitLabApiWithCache(
                endpoint,
                {params: {per_page: 100}}
            );

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members, using whitelist only');
                this.membersList = allMembers;
                return allMembers;
            }

            // Add project/group members
            allMembers.push(...members);

            // Convert API responses to our member format and remove duplicates
            const memberMap = new Map();

            allMembers.forEach(member => {
                if (!member || !member.username) return;

                const key = member.username.toLowerCase();

                // If we already have this member, keep the one with more information
                if (memberMap.has(key)) {
                    // Prefer entries with stats, or with complete data
                    const existing = memberMap.get(key);
                    if (!existing.id || (member.id && existing.name === undefined && member.name)) {
                        memberMap.set(key, {
                            id: member.id,
                            name: member.name || existing.name,
                            username: member.username,
                            avatar_url: member.avatar_url || existing.avatar_url,
                            // Keep stats if they exist
                            stats: existing.stats
                        });
                    }
                } else {
                    // New member, add them
                    memberMap.set(key, {
                        id: member.id,
                        name: member.name,
                        username: member.username,
                        avatar_url: member.avatar_url
                    });
                }
            });

            // Include history assignees for their stats
            const historyAssignees = this.getHistoryAssignees();
            historyAssignees.forEach(assignee => {
                if (!assignee || !assignee.username) return;

                const key = assignee.username.toLowerCase();

                if (memberMap.has(key)) {
                    // Update existing member with stats
                    const existing = memberMap.get(key);
                    memberMap.set(key, {
                        ...existing,
                        stats: assignee.stats
                    });
                } else {
                    // Only add history assignees that were in the whitelist
                    // (these are likely relevant to the current board)
                    const isWhitelisted = whitelistedAssignees.some(wa =>
                        wa.username && wa.username.toLowerCase() === key);

                    if (isWhitelisted) {
                        memberMap.set(key, assignee);
                    }
                }
            });

            // Convert map back to array
            this.membersList = Array.from(memberMap.values());

            console.log(`Successfully fetched ${this.membersList.length} members with access to this board`);
            return this.membersList;
        } catch (error) {
            console.error('Error fetching members:', error);
            // If we have a fallback list from whitelist, return it
            if (allMembers && allMembers.length > 0) {
                console.log(`Using ${allMembers.length} members from whitelist after API error`);
                this.membersList = allMembers;
                return allMembers;
            }
            this.membersList = [];
            return [];
        }
    }

    /**
     * Determines if a historical assignee matches a given filter username
     * @param {Object} assignee - The assignee object with name and username
     * @param {string} filterUsername - Username to filter by
     * @returns {boolean} Whether the assignee matches the filter
     */
    isHistoricalAssigneeRelevant(assignee, filterUsername) {
        if (!assignee || !filterUsername) return false;

        // Normalize for case-insensitive comparison
        const normalizedFilter = filterUsername.toLowerCase();

        // Check username
        if (assignee.username && assignee.username.toLowerCase() === normalizedFilter) {
            return true;
        }

        // Check name (the assignee might have their username in their display name)
        if (assignee.name) {
            const name = assignee.name.toLowerCase();
            if (name === normalizedFilter) return true;

            // Also check if the username is part of their display name
            if (name.includes(normalizedFilter)) return true;
        }

        return false;
    }

    /**
     * Find a member by name
     * @param {string} name - The name to look for
     * @returns {Object|null} - The member object if found, or null
     */
    findMemberByName(name) {
        if (!name || !this.membersList) return null;

        const lowerName = name.toLowerCase();
        return this.membersList.find(member => {
            if (!member) return false;

            // Check by name
            if (member.name && member.name.toLowerCase() === lowerName) {
                return true;
            }

            // Check by username
            if (member.username && member.username.toLowerCase() === lowerName) {
                return true;
            }

            return false;
        }) || null;
    }
}
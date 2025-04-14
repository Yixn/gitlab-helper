import {formatHours} from '../../core/Utils';
import {fetchAllBoards, getPathFromUrl} from '../../api/APIUtils';

export default class SummaryView {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.membersList = [];
        this.potentialAssignees = [];
        this.gitlabApi = uiManager?.gitlabApi || window.gitlabApi;
        if (this.gitlabApi) {
            this.fetchMembers();
        }
    }

    addCopySummaryButton(container, assigneeTimeMap, totalTickets) {
        if (!this.notification) {
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
        }
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '15px';
        buttonContainer.style.textAlign = 'center';
        const copyButton = document.createElement('button');
        copyButton.textContent = 'Copy Summary Data';
        copyButton.style.padding = '8px 16px';
        copyButton.style.backgroundColor = '#1f75cb';
        copyButton.style.color = 'white';
        copyButton.style.border = 'none';
        copyButton.style.borderRadius = '4px';
        copyButton.className = 'copySummaryBtn';
        copyButton.style.cursor = 'pointer';
        copyButton.style.fontWeight = 'bold';
        copyButton.style.transition = 'background-color 0.2s ease';
        copyButton.addEventListener('mouseenter', () => {
            copyButton.style.backgroundColor = '#1a63ac';
        });
        copyButton.addEventListener('mouseleave', () => {
            copyButton.style.backgroundColor = '#1f75cb';
        });
        copyButton.onclick = () => {
            try {
                let formattedData = '';
                const sortedAssignees = Object.keys(assigneeTimeMap).sort((a, b) => {
                    return assigneeTimeMap[b] - assigneeTimeMap[a];
                });
                sortedAssignees.forEach(name => {
                    const hours = assigneeTimeMap[name] / 3600;
                    formattedData += `${name}\t${hours}\n`;
                });
                formattedData += `Issues\t${totalTickets}`;
                navigator.clipboard.writeText(formattedData).then(() => {
                    if (this.notification) {
                        this.notification.success('Summary data copied to clipboard');
                    } else if (this.uiManager && this.uiManager.notification) {
                        this.uiManager.notification.success('Summary data copied to clipboard');
                    } else {
                    }
                }).catch(err => {
                    console.error('Failed to copy data:', err);
                    if (this.notification) {
                        this.notification.error('Failed to copy data to clipboard');
                    } else if (this.uiManager && this.uiManager.notification) {
                        this.uiManager.notification.error('Failed to copy data to clipboard');
                    } else {
                        console.error('Failed to copy data to clipboard');
                    }
                });
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

    async render(assigneeTimeMap, totalEstimate, cardsProcessed, cardsWithTime, currentMilestone, boardData, boardAssigneeData) {
        const summaryContent = document.getElementById('assignee-time-summary-content');
        if (!summaryContent) return;
        if (!this.membersList || this.membersList.length === 0) {
            summaryContent.innerHTML = '<div style="text-align: center; padding: 20px;">Loading team members...</div>';
            try {
                await this.fetchMembers();
            } catch (error) {
                console.error('Error fetching members:', error);
            }
        }
        summaryContent.innerHTML = '';
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
            if (lowerBoardName.includes('done') || lowerBoardName.includes('closed') || lowerBoardName.includes('complete') || lowerBoardName.includes('finished')) {
                doneHours += boardData[boardName].timeEstimate || 0;
            }
        }
        const doneHoursFormatted = formatHours(doneHours);
        if (this.uiManager) {
            this.uiManager.updateHeader(`Summary ${totalHours}h - <span style="color:#28a745">${doneHoursFormatted}h</span>`);
        }
        if (currentMilestone) {
            this.renderMilestoneInfo(summaryContent, currentMilestone);
        }
        let that = this
        this.renderDataTableWithDistribution(summaryContent, assigneeTimeMap, totalHours, boardData, boardAssigneeData).then(function () {
            that.addCopySummaryButton(summaryContent, assigneeTimeMap, cardsWithTime);
            if (that.uiManager && that.uiManager.removeLoadingScreen) {
                that.uiManager.removeLoadingScreen('summary-tab');
            }
        })

    }

    getWhitelistedAssignees() {
        let whitelist = [];
        try {
            if (this.uiManager && this.uiManager.assigneeManager && typeof this.uiManager.assigneeManager.getAssigneeWhitelist === 'function') {
                whitelist = this.uiManager.assigneeManager.getAssigneeWhitelist();
            } else if (typeof getAssigneeWhitelist === 'function') {
                whitelist = getAssigneeWhitelist();
            } else {
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

    getHistoryAssignees() {
        let historyAssignees = [];
        try {
            const generalHistoryStr = localStorage.getItem('gitLabHelperHistory');
            if (generalHistoryStr) {
                const generalHistory = JSON.parse(generalHistoryStr);
                const boardKey = "2478181?milestone_title=Started";
                if (generalHistory[boardKey]) {
                    const dates = Object.keys(generalHistory[boardKey]).sort().reverse();
                    if (dates.length > 0) {
                        const latestEntry = generalHistory[boardKey][dates[0]];
                        if (latestEntry && latestEntry.assigneeTimeMap) {
                            const userData = latestEntry.userData || {};
                            const additionalAssignees = Object.entries(latestEntry.assigneeTimeMap).map(([name, timeEstimate]) => {
                                const username = userData[name]?.username || this.getUsernameFromName(name);
                                const avatar_url = userData[name]?.avatar_url || '';
                                return {
                                    name: name,
                                    username: username,
                                    avatar_url: avatar_url,
                                    stats: {
                                        totalHours: formatHours(timeEstimate),
                                        closedHours: 0,
                                        fromHistory: true
                                    },
                                    userDistribution: latestEntry.userDistributions[name].distribution,
                                    boardAssigneeData: latestEntry.boardAssigneeData
                                };
                            });
                            historyAssignees = [...historyAssignees, ...additionalAssignees];
                        }
                    }
                }
            }
        } catch (error) {
            console.error('Error getting history assignees:', error);
        }
        return historyAssignees;
    }

    getBoardKey() {
        try {
            const url = window.location.href;
            const splitAtBoards = url.split('/boards/');
            if (splitAtBoards.length < 2) {
                return 'unknown-board';
            }
            return splitAtBoards[1];
        } catch (error) {
            console.error('Error generating board key:', error);
            return 'unknown-board';
        }
    }

    getUsernameFromName(name) {
        if (!name) return '';
        if (this.membersList && this.membersList.length) {
            const match = this.membersList.find(m => m.name === name);
            if (match && match.username) {
                return match.username;
            }
        }
        if (!name.includes(' ')) {
            return name.toLowerCase();
        }
        return name.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9._-]/g, '');
    }

    getClosedBoardCount() {
        let closedCount = 0;
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
            if (boardTitle.includes('done') || boardTitle.includes('closed') || boardTitle.includes('complete') || boardTitle.includes('finished')) {
                const cards = boardList.querySelectorAll('.board-card');
                closedCount += cards.length;
            }
        });
        return closedCount;
    }

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

    renderMilestoneInfo(container, milestoneName) {
        const milestoneInfo = document.createElement('div');
        milestoneInfo.style.marginBottom = '10px';
        milestoneInfo.style.fontSize = '13px';
        milestoneInfo.style.color = '#555';
        milestoneInfo.textContent = `Current Milestone: ${milestoneName}`;
        container.appendChild(milestoneInfo);
    }

    async renderDataTableWithDistribution(container, assigneeTimeMap, totalHours, boardData, boardAssigneeData) {
        const table = document.createElement('table');
        table.style.width = '100%';
        table.style.borderCollapse = 'collapse';
        table.style.tableLayout = 'fixed'; // Ensure table layout is fixed to maintain column widths

        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading board configuration...';
        loadingIndicator.style.padding = '15px';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.color = '#666';
        container.appendChild(loadingIndicator);

        // Fetch board names
        const fetchedBoardNames = await fetchAllBoards();
        try {
            // Replace loading indicator with table
            if (loadingIndicator.parentNode === container) {
                container.removeChild(loadingIndicator);
            }
        }catch(e){

        }

        try {
            const existingTable = container.querySelector('table');
            if (existingTable) {
                container.removeChild(existingTable);
        }
        }catch(e){

        }

        try {
            const copySummaryBtn = container.querySelector('.copySummaryBtn');
            if (copySummaryBtn) {
                $(copySummaryBtn).remove()
        }
        }catch(e){

        }

        container.appendChild(table);

        // Use fetched board names if available, otherwise fallback to Object.keys
        const boardNames = fetchedBoardNames && fetchedBoardNames.length > 0
            ? fetchedBoardNames
            : Object.keys(boardData || {});

        // Continue with the rest of your existing function using the boardNames array

        // Set table layout to fixed to maintain column widths
        table.style.tableLayout = 'fixed';

        // Create the total row first
        const totalRow = document.createElement('tr');
        totalRow.style.borderBottom = '2px solid #ddd';
        totalRow.style.fontWeight = 'bold';
        const totalLabelCell = document.createElement('td');
        const totalLink = document.createElement('a');
        totalLink.textContent = 'Total';
        totalLink.href = window.location.pathname + '?milestone_title=Started';
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
        totalLabelCell.style.paddingLeft = '32px';
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
                const boardDataObj = boardData[boardName] || {
                    timeEstimate: 0
                };
                const hoursFloat = parseFloat(formatHours(boardDataObj.timeEstimate || 0));
                return Math.round(hoursFloat);
            });
            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;
                if (hours === 0) {
                    spanHTML += `color:#aaa;`;
                }
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`;
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
        const currentAssigneeSet = new Set();
        const sortedAssignees = Object.keys(assigneeTimeMap || {}).sort((a, b) => {
            return (assigneeTimeMap[b] || 0) - (assigneeTimeMap[a] || 0);
        });
        sortedAssignees.forEach(name => {
            if (!name) return;
            const hours = formatHours(assigneeTimeMap[name] || 0);
            this.addAssigneeRow(table, name, `${hours}h`, boardNames, boardAssigneeData);
            currentAssigneeSet.add(name.toLowerCase());
        });
        const historyAssignees = this.getHistoryAssignees();
        const historicalMembers = [];
        if (historyAssignees && historyAssignees.length > 0) {
            historyAssignees.forEach(assignee => {
                if (!assignee || !assignee.name) return;
                const assigneeName = assignee.name.toLowerCase();
                if (currentAssigneeSet.has(assigneeName)) return;
                historicalMembers.push(assignee);
            });
        }
        const otherTeamMembers = [];
        if (this.membersList && this.membersList.length > 0) {
            this.membersList.forEach(member => {
                if (!member) return;
                const name = member.name || member.username;
                if (!name) return;
                const lowerName = name.toLowerCase();
                if (currentAssigneeSet.has(lowerName)) return;
                if (historicalMembers.some(h => (h.name || '').toLowerCase() === lowerName || (h.username || '').toLowerCase() === lowerName)) {
                    return;
                }
                otherTeamMembers.push(member);
            });
        }
        if (historicalMembers.length > 0) {
            const separatorRow = document.createElement('tr');
            const separatorCell = document.createElement('td');
            separatorCell.colSpan = 3;
            separatorCell.style.padding = '10px 0 5px 32px';
            separatorCell.style.fontSize = '12px';
            separatorCell.style.color = '#666';
            separatorCell.style.fontStyle = 'italic';
            separatorCell.style.borderTop = '1px solid #eee';
            separatorCell.textContent = 'Previously Active Members:';
            separatorRow.appendChild(separatorCell);
            table.appendChild(separatorRow);
            historicalMembers.sort((a, b) => {
                const aHours = a.stats?.totalHours || 0;
                const bHours = b.stats?.totalHours || 0;
                return bHours - aHours;
            });
            historicalMembers.forEach(member => {
                const name = member.name || member.username;
                if (!name) return;
                const hours = member.stats ? `${member.stats.totalHours}h` : '0h';
                this.addAssigneeRow(table, name, hours, boardNames, {}, true, member, member.boardAssigneeData);
            });
        }
        if (otherTeamMembers.length > 0) {
            const separatorRow = document.createElement('tr');
            const separatorCell = document.createElement('td');
            separatorCell.colSpan = 3;
            separatorCell.style.padding = '10px 0 5px 32px';
            separatorCell.style.fontSize = '12px';
            separatorCell.style.color = '#666';
            separatorCell.style.fontStyle = 'italic';
            separatorCell.style.borderTop = '1px solid #eee';

            // Create a container for the header and toggle button
            const headerContainer = document.createElement('div');
            headerContainer.style.display = 'flex';
            headerContainer.style.alignItems = 'center';
            headerContainer.style.cursor = 'pointer';

            // Add the text
            const headerText = document.createElement('span');
            headerText.textContent = 'Other Team Members:';
            headerContainer.appendChild(headerText);

            // Add the toggle button
            const toggleButton = document.createElement('span');
            toggleButton.textContent = '▶'; // Right arrow (collapsed)
            toggleButton.style.marginLeft = '5px';
            toggleButton.style.fontSize = '10px';
            toggleButton.style.transition = 'transform 0.3s';
            headerContainer.appendChild(toggleButton);

            // Add the header container to the cell
            separatorCell.appendChild(headerContainer);
            separatorRow.appendChild(separatorCell);
            table.appendChild(separatorRow);

            // Create a container for other team members that can be toggled
            const otherMembersContainer = document.createElement('tbody');
            otherMembersContainer.style.display = 'none'; // Start collapsed
            otherMembersContainer.id = 'other-team-members-container';

            // Add click event to toggle visibility
            headerContainer.addEventListener('click', () => {
                const isCollapsed = otherMembersContainer.style.display === 'none';
                otherMembersContainer.style.display = isCollapsed ? 'table-row-group' : 'none';
                toggleButton.textContent = isCollapsed ? '▼' : '▶'; // Down arrow (expanded) or right arrow (collapsed)
            });

            // Add other team members to the container
            otherTeamMembers.sort((a, b) => {
                const aName = (a.name || a.username || '').toLowerCase();
                const bName = (b.name || b.username || '').toLowerCase();
                return aName.localeCompare(bName);
            });

            otherTeamMembers.forEach(member => {
                const name = member.name || member.username;
                if (!name) return;
                const row = document.createElement('tr');
                this.addAssigneeRowToElement(row, name, '0h', boardNames, {}, true);
                otherMembersContainer.appendChild(row);
            });

            // Append the container after the separator row
            table.appendChild(otherMembersContainer);
        }

        // Set fixed width for time and distribution columns to prevent layout shift
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 3) {
                // Second column (time)
                if (cells[1]) {
                    cells[1].style.width = '80px';
                    cells[1].style.minWidth = '80px';
                    cells[1].style.maxWidth = '80px';
                }
                // Third column (distribution)
                if (cells[2]) {
                    cells[2].style.width = '180px';
                    cells[2].style.minWidth = '180px';
                    cells[2].style.maxWidth = '180px';
                }
                // First column (name) takes remaining space
                if (cells[0]) {
                    cells[0].style.width = 'auto';
                }
            }
        });

        container.appendChild(table);
    }

    addAssigneeRow(table, name, hours, boardNames, boardAssigneeData, isPotential = false, historyStats = null, historyboardAssigneeData = null) {
        if (!name) name = "Unknown User";

        const row = document.createElement('tr');
        this.addAssigneeRowToElement(row, name, hours, boardNames, boardAssigneeData, isPotential, historyStats, historyboardAssigneeData);
        table.appendChild(row);
        return row;
    }


    async fetchMembers() {
        try {
            const whitelistedAssignees = this.getWhitelistedAssignees();
            let allMembers = [];
            if (whitelistedAssignees && whitelistedAssignees.length > 0) {
                allMembers = [...whitelistedAssignees];
            }
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
                if (!this.gitlabApi) {
                    console.warn('GitLab API not available for fetching members, using whitelist only');
                    this.membersList = allMembers;
                    return allMembers;
                }
            }
            const pathInfo = getPathFromUrl?.() || {};
            if (!pathInfo || !pathInfo.type || !pathInfo.encodedPath) {
                console.warn('Could not determine project/group path, using whitelist only');
                this.membersList = allMembers;
                return allMembers;
            }
            let endpoint;
            if (pathInfo.type === 'project') {
                endpoint = `projects/${pathInfo.encodedPath}/members/all`;
            } else if (pathInfo.type === 'group') {
                endpoint = `groups/${pathInfo.encodedPath}/members/all`;
            } else {
                console.warn('Unsupported path type, using whitelist only:', pathInfo.type);
                this.membersList = allMembers;
                return allMembers;
            }
            const members = await this.gitlabApi.callGitLabApiWithCache(endpoint, {
                params: {
                    per_page: 100,
                    all_available: true
                }
            });
            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members, using whitelist only');
                this.membersList = allMembers;
                return allMembers;
            }
            allMembers.push(...members);
            const memberMap = new Map();
            allMembers.forEach(member => {
                if (!member || !member.username) return;
                const key = member.username.toLowerCase();
                if (memberMap.has(key)) {
                    const existing = memberMap.get(key);
                    if (!existing.id || member.id && existing.name === undefined && member.name) {
                        memberMap.set(key, {
                            id: member.id,
                            name: member.name || existing.name,
                            username: member.username,
                            avatar_url: member.avatar_url || existing.avatar_url,
                            stats: existing.stats
                        });
                    }
                } else {
                    memberMap.set(key, {
                        id: member.id,
                        name: member.name,
                        username: member.username,
                        avatar_url: member.avatar_url
                    });
                }
            });
            const historyAssignees = this.getHistoryAssignees();
            historyAssignees.forEach(assignee => {
                if (!assignee || !assignee.username) return;
                const key = assignee.username.toLowerCase();
                if (memberMap.has(key)) {
                    const existing = memberMap.get(key);
                    memberMap.set(key, {
                        ...existing,
                        stats: assignee.stats
                    });
                } else {
                    const isWhitelisted = whitelistedAssignees.some(wa => wa.username && wa.username.toLowerCase() === key);
                    if (isWhitelisted) {
                        memberMap.set(key, assignee);
                    }
                }
            });
            this.membersList = Array.from(memberMap.values());
            return this.membersList;
        } catch (error) {
            console.error('Error fetching members:', error);
            if (allMembers && allMembers.length > 0) {
                this.membersList = allMembers;
                return allMembers;
            }
            this.membersList = [];
            return [];
        }
    }

    findMemberByName(name) {
        if (!name) return null;
        const lowerName = name.toLowerCase();
        if (this.membersList && this.membersList.length) {
            const memberMatch = this.membersList.find(member => {
                if (!member) return false;
                if (member.name && member.name.toLowerCase() === lowerName) {
                    return true;
                }
                if (member.username && member.username.toLowerCase() === lowerName) {
                    return true;
                }
                return false;
            });
            if (memberMatch) return memberMatch;
        }
        try {
            const sprintHistoryStr = localStorage.getItem('gitLabHelperSprintHistory');
            if (sprintHistoryStr) {
                const sprintHistory = JSON.parse(sprintHistoryStr);
                if (Array.isArray(sprintHistory) && sprintHistory.length > 0) {
                    const latestSprint = sprintHistory[0];
                    if (latestSprint.userPerformance && latestSprint.userPerformance[name]) {
                        const userData = latestSprint.userPerformance[name];
                        if (userData.username || userData.avatar_url) {
                            return {
                                name: name,
                                username: userData.username || '',
                                avatar_url: userData.avatar_url || '',
                                fromHistory: true
                            };
                        }
                    }
                    if (latestSprint.userDistributions && latestSprint.userDistributions[name]) {
                        const userData = latestSprint.userDistributions[name];
                        if (userData.username || userData.avatar_url) {
                            return {
                                name: name,
                                username: userData.username || '',
                                avatar_url: userData.avatar_url || '',
                                fromHistory: true
                            };
                        }
                    }
                    if (latestSprint.userData && latestSprint.userData[name]) {
                        const userData = latestSprint.userData[name];
                        return {
                            name: name,
                            username: userData.username || '',
                            avatar_url: userData.avatar_url || '',
                            fromHistory: true
                        };
                    }
                }
            }
            const generalHistoryStr = localStorage.getItem('gitLabHelperHistory');
            if (generalHistoryStr) {
                const generalHistory = JSON.parse(generalHistoryStr);
                const boardKey = this.getBoardKey();
                if (generalHistory[boardKey]) {
                    const dates = Object.keys(generalHistory[boardKey]).sort().reverse();
                    for (const date of dates) {
                        const entry = generalHistory[boardKey][date];
                        if (entry.userData && entry.userData[name]) {
                            const userData = entry.userData[name];
                            return {
                                name: name,
                                username: userData.username || '',
                                avatar_url: userData.avatar_url || '',
                                fromHistory: true
                            };
                        }
                        if (entry.userDistributions && entry.userDistributions[name]) {
                            const userData = entry.userDistributions[name];
                            if (userData.username || userData.avatar_url) {
                                return {
                                    name: name,
                                    username: userData.username || '',
                                    avatar_url: userData.avatar_url || '',
                                    fromHistory: true
                                };
                            }
                        }
                    }
                }
            }
        } catch (error) {
            console.warn('Error searching history for member:', error);
        }
        return null;
    }

    addAssigneeRowToElement(row, name, hours, boardNames, boardAssigneeData, isPotential = false, historyStats = null, historyboardAssigneeData = null) {
        if (!name) name = "Unknown User";

        row.style.borderBottom = '1px solid #eee';
        if (isPotential) {
            row.style.opacity = '0.75';
            row.style.fontStyle = 'italic';
        }

        const nameCell = document.createElement('td');
        nameCell.style.display = 'flex';
        nameCell.style.alignItems = 'center';
        nameCell.style.padding = '8px 0';
        nameCell.style.width = 'auto'; // First column takes remaining space

        const member = this.findMemberByName(name);
        const avatar = document.createElement('div');
        avatar.style.width = '24px';
        avatar.style.height = '24px';
        avatar.style.borderRadius = '50%';
        avatar.style.marginRight = '8px';
        avatar.style.overflow = 'hidden';
        avatar.style.flexShrink = '0';

        let avatar_url = '';
        if (member && member.avatar_url) {
            avatar_url = member.avatar_url;
        } else if (historyStats && historyStats.avatar_url) {
            avatar_url = historyStats.avatar_url;
        }

        if (avatar_url) {
            const img = document.createElement('img');
            img.src = avatar_url;
            img.style.width = '100%';
            img.style.height = '100%';
            img.style.objectFit = 'cover';
            avatar.appendChild(img);
        } else {
            avatar.style.backgroundColor = '#e0e0e0';
            avatar.style.display = 'flex';
            avatar.style.alignItems = 'center';
            avatar.style.justifyContent = 'center';
            avatar.style.fontSize = '10px';
            avatar.style.fontWeight = 'bold';
            avatar.style.color = '#666';
            const initials = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
            avatar.textContent = initials || '?';
        }

        nameCell.appendChild(avatar);

        const nameContainer = document.createElement('div');
        nameContainer.style.overflow = 'hidden';
        nameContainer.style.textOverflow = 'ellipsis';

        const nameLink = document.createElement('a');
        let username = '';
        if (member && member.username) {
            username = member.username;
        } else if (historyStats && historyStats.username) {
            username = historyStats.username;
        } else {
            username = this.getUsernameFromName(name);
        }

        if (username) {
            nameLink.href = window.location.pathname + `?milestone_title=Started&assignee_username=${username}`;
        } else {
            nameLink.href = window.location.pathname + '?milestone_title=Started';
        }

        nameLink.textContent = name + (Object.keys(boardAssigneeData).length == 0 ? " ?" : "");
        nameLink.title = username ? `@${username}` : name;
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
        timeCell.style.textAlign = 'center';
        timeCell.style.padding = '8px 0';
        timeCell.style.width = '80px';
        timeCell.style.minWidth = '80px';
        timeCell.style.maxWidth = '80px';

        const distributionCell = document.createElement('td');
        distributionCell.style.textAlign = 'right';
        distributionCell.style.padding = '8px 0 8px 15px';
        distributionCell.style.color = '#666';
        distributionCell.style.fontSize = '12px';
        distributionCell.style.width = '180px';
        distributionCell.style.minWidth = '180px';
        distributionCell.style.maxWidth = '180px';

        if (!isPotential && boardNames.length > 0 && boardAssigneeData) {
            const distributionValues = boardNames.map(boardName => {
                const boardAssignees = boardAssigneeData[boardName] || {};
                const assigneeInBoard = boardAssignees[name] || {
                    timeEstimate: 0
                };
                const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
                return Math.round(hoursFloat);
            });

            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;
                if (hours === 0) {
                    spanHTML += `color:#aaa;`;
                }
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`;
                }
                spanHTML += `">${hours}h</span>`;
                return spanHTML;
            }).join('/');

            distributionCell.innerHTML = distributionText;
        } else if (historyboardAssigneeData) {
            const distributionValues = boardNames.map(boardName => {
                const boardAssignees = historyboardAssigneeData[boardName] || {};
                const assigneeInBoard = boardAssignees[name] || {
                    timeEstimate: 0
                };
                const hoursFloat = parseFloat(formatHours(assigneeInBoard.timeEstimate || 0));
                return Math.round(hoursFloat);
            });

            const distributionText = distributionValues.map((hours, index) => {
                let spanHTML = `<span style="`;
                if (hours === 0) {
                    spanHTML += `color:#aaa;`;
                }
                if (index === distributionValues.length - 1 && hours > 0) {
                    spanHTML += `color:#28a745;`;
                }
                spanHTML += `">${hours}h</span>`;
                return spanHTML;
            }).join('/');

            distributionCell.innerHTML = distributionText;
        } else {
            const emptyText = boardNames.map(() => {
                return `<span style="color:#aaa;">0h</span>`;
            }).join('/');

            distributionCell.innerHTML = emptyText;
        }

        row.appendChild(nameCell);
        row.appendChild(timeCell);
        row.appendChild(distributionCell);
    }
}
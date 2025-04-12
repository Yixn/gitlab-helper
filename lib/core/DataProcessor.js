// Data processing functions for GitLab Assignee Time Summary

/**
 * Process all boards and extract data
 * @returns {Object} Object containing processed board data
 */
export async function processBoards() {
    console.log('Starting board processing...');
    const assigneeTimeMap = {};
    const boardData = {};
    const boardAssigneeData = {};
    let totalEstimate = 0;
    let cardsProcessed = 0;
    let cardsWithTime = 0;
    let currentMilestone = null;
    let closedBoardCards = 0;

    try {
        // Ensure API is available
        const gitlabApi = window.gitlabApi;
        if (!gitlabApi) {
            console.warn('GitLab API not available, proceeding with DOM-only methods');
        } else {
            console.log('GitLab API available for API requests');
        }

        // Get path info for API requests
        const pathInfo = getPathFromUrl();
        if (!pathInfo) {
            console.warn('Could not determine project/group path for API requests');
        } else {
            console.log('Path info for API requests:', pathInfo);
        }

        // Loop over all board lists
        const boardLists = document.querySelectorAll('.board-list');
        console.log(`Found ${boardLists.length} board lists`);

        for (const boardList of boardLists) {
            let boardTitle = 'Unknown';
            let boardId = null;

            try {
                // First try to get board ID from Vue attributes
                if (boardList.__vue__ && boardList.__vue__.$attrs) {
                    boardId = boardList.__vue__.$attrs.id ||
                        boardList.__vue__.$attrs['data-id'] ||
                        boardList.__vue__.$attrs['list-id'];

                    console.log(`Found board ID from Vue attributes: ${boardId}`);

                    // If we found a board ID, try to fetch board data via API
                    if (boardId && gitlabApi && pathInfo) {
                        try {
                            // Construct API endpoint
                            const endpoint = `${pathInfo.type}s/${pathInfo.encodedPath}/boards/lists/${boardId}`;
                            console.log(`Attempting API request to: ${endpoint}`);

                            // Make API request
                            const boardApiData = await gitlabApi.callGitLabApi(endpoint);

                            if (boardApiData && boardApiData.title) {
                                boardTitle = boardApiData.title;
                                console.log(`Found board title via API: ${boardTitle}`);
                            }
                        } catch (apiError) {
                            console.warn(`API request failed for board ID ${boardId}:`, apiError);
                            // Continue with other methods
                        }
                    }
                }

                // Fallback to DOM or Vue component if API request failed
                if (boardTitle === 'Unknown') {
                    // Try DOM approach
                    const boardHeader = boardList.querySelector('.board-title-text');
                    if (boardHeader) {
                        boardTitle = boardHeader.textContent.trim();
                        console.log(`Found board title via DOM: ${boardTitle}`);
                    }
                    // Try Vue component approach
                    else if (boardList.__vue__ && boardList.__vue__.$children) {
                        const boardComponent = boardList.__vue__.$children.find(child =>
                            child.$props && child.$props.list && child.$props.list.title);
                        if (boardComponent && boardComponent.$props.list.title) {
                            boardTitle = boardComponent.$props.list.title;
                            console.log(`Found board title via Vue: ${boardTitle}`);
                        }
                    }
                }
            } catch (e) {
                console.error('Error getting board title:', e);
            }

            // Initialize board data
            if (boardTitle !== 'Unknown') {
                boardData[boardTitle] = {
                    tickets: 0,
                    timeEstimate: 0,
                    boardId: boardId // Store the board ID for reference
                };
                boardAssigneeData[boardTitle] = {};
            } else {
                // If we still don't have a title but have an ID, use the ID as title
                if (boardId) {
                    boardTitle = `Board-${boardId}`;
                    boardData[boardTitle] = {
                        tickets: 0,
                        timeEstimate: 0,
                        boardId: boardId
                    };
                    boardAssigneeData[boardTitle] = {};
                } else {
                    console.warn('Could not determine title for a board list, skipping');
                    continue; // Skip this board
                }
            }

            // Check if this is a closed/done board
            const lowerTitle = boardTitle.toLowerCase();
            const isClosedBoard = lowerTitle.includes('done') ||
                lowerTitle.includes('closed') ||
                lowerTitle.includes('complete') ||
                lowerTitle.includes('finished');

            // Find all cards in this list
            const boardItems = boardList.querySelectorAll('.board-card');
            console.log(`Board "${boardTitle}" has ${boardItems.length} cards`);

            // If this is a closed board, count its cards
            if (isClosedBoard) {
                closedBoardCards += boardItems.length;
            }

            // Process each card
            for (const item of boardItems) {
                try {
                    cardsProcessed++;
                    boardData[boardTitle].tickets++;

                    // Multiple approaches to extract time estimates
                    let timeEstimate = 0;
                    let assignees = [];
                    let foundTime = false;
                    let cardId = null;

                    // Try to get card ID for API requests
                    if (item.__vue__ && item.__vue__.$attrs) {
                        cardId = item.__vue__.$attrs.id ||
                            item.__vue__.$attrs['data-id'] ||
                            item.__vue__.$attrs['card-id'];
                    }

                    // Approach 1: Vue component (primary method)
                    if (item.__vue__ && item.__vue__.$children) {
                        const issueComponent = item.__vue__.$children.find(child =>
                            child.$props && child.$props.item);

                        if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
                            const props = issueComponent.$props;

                            // Try to get milestone
                            if (!currentMilestone && props.item && props.item.milestone) {
                                currentMilestone = props.item.milestone.title;
                            }

                            // Get time estimate
                            if (props.item && props.item.timeEstimate !== undefined) {
                                timeEstimate = props.item.timeEstimate;
                                foundTime = true;
                                cardsWithTime++;

                                console.log(`Found time via Vue: ${timeEstimate} seconds for card`, props.item.title || 'Unknown');
                            }

                            // Get assignees
                            if (props.item.assignees) {
                                if (props.item.assignees.nodes && props.item.assignees.nodes.length) {
                                    assignees = props.item.assignees.nodes;
                                } else if (Array.isArray(props.item.assignees) && props.item.assignees.length > 0) {
                                    assignees = props.item.assignees;
                                }
                            }

                            // If we have an iid but no time, try API fetch
                            if (!foundTime && props.item.iid && props.item.referencePath && gitlabApi) {
                                cardId = props.item.iid;
                                try {
                                    console.log(`Attempting to fetch issue time data via API for ${cardId}`);
                                    const issueData = await gitlabApi.getIssue(props.item);

                                    if (issueData && issueData.time_stats &&
                                        issueData.time_stats.time_estimate !== undefined) {
                                        timeEstimate = issueData.time_stats.time_estimate;
                                        foundTime = true;
                                        cardsWithTime++;

                                        console.log(`Found time via API: ${timeEstimate} seconds`);
                                    }
                                } catch (apiError) {
                                    console.warn(`API request failed for card ${cardId}:`, apiError);
                                }
                            }
                        }
                    }

                    // Approach 2: Look for time estimate directly in DOM (fallback)
                    if (!foundTime) {
                        const timeElement = item.querySelector('.board-card-time-stats');
                        if (timeElement) {
                            const timeText = timeElement.textContent.trim();
                            console.log(`Found time via DOM: ${timeText}`);

                            // Parse time in various formats: 2h, 2h 30m, 30m, etc.
                            // First try to match hours and minutes
                            let hours = 0;
                            let minutes = 0;

                            const hoursMatch = timeText.match(/(\d+)h/);
                            if (hoursMatch && hoursMatch[1]) {
                                hours = parseInt(hoursMatch[1]);
                            }

                            const minutesMatch = timeText.match(/(\d+)m/);
                            if (minutesMatch && minutesMatch[1]) {
                                minutes = parseInt(minutesMatch[1]);
                            }

                            timeEstimate = (hours * 3600) + (minutes * 60);

                            if (timeEstimate > 0) {
                                foundTime = true;
                                cardsWithTime++;
                                console.log(`Parsed time estimate: ${timeEstimate} seconds`);
                            }
                        }
                    }

                    // Try another approach if time estimate still not found
                    if (!foundTime) {
                        // Look for estimate in card title/description
                        const cardTitle = item.querySelector('.board-card-title');
                        if (cardTitle) {
                            const titleText = cardTitle.textContent.trim();
                            const estimateMatch = titleText.match(/\((\d+)h\)/);
                            if (estimateMatch && estimateMatch[1]) {
                                timeEstimate = parseInt(estimateMatch[1]) * 3600;
                                foundTime = true;
                                cardsWithTime++;
                                console.log(`Found time in title: ${timeEstimate} seconds`);
                            }
                        }
                    }

                    // If we found time, update totals
                    if (foundTime) {
                        totalEstimate += timeEstimate;
                        boardData[boardTitle].timeEstimate += timeEstimate;

                        // Process assignees
                        if (assignees.length > 0) {
                            // Split time among assignees
                            const assigneeShare = timeEstimate / assignees.length;

                            assignees.forEach(assignee => {
                                const name = assignee.name || assignee.username || 'Unknown';

                                // Update global assignee data
                                if (!assigneeTimeMap[name]) {
                                    assigneeTimeMap[name] = 0;
                                }
                                assigneeTimeMap[name] += assigneeShare;

                                // Update board-specific assignee data
                                if (!boardAssigneeData[boardTitle][name]) {
                                    boardAssigneeData[boardTitle][name] = {
                                        tickets: 0,
                                        timeEstimate: 0
                                    };
                                }
                                boardAssigneeData[boardTitle][name].tickets++;
                                boardAssigneeData[boardTitle][name].timeEstimate += assigneeShare;
                            });
                        } else {
                            // Unassigned issue
                            const unassignedName = 'Unassigned';

                            // Global unassigned
                            if (!assigneeTimeMap[unassignedName]) {
                                assigneeTimeMap[unassignedName] = 0;
                            }
                            assigneeTimeMap[unassignedName] += timeEstimate;

                            // Board-specific unassigned
                            if (!boardAssigneeData[boardTitle][unassignedName]) {
                                boardAssigneeData[boardTitle][unassignedName] = {
                                    tickets: 0,
                                    timeEstimate: 0
                                };
                            }
                            boardAssigneeData[boardTitle][unassignedName].tickets++;
                            boardAssigneeData[boardTitle][unassignedName].timeEstimate += timeEstimate;
                        }
                    }
                } catch (e) {
                    console.error('Error processing card:', e);
                }
            }
        }

        console.log(`Processed: ${cardsProcessed} cards, ${cardsWithTime} with time`);
        console.log('Board data:', boardData);
        console.log('Assignee data:', assigneeTimeMap);
    } catch (e) {
        console.error('Error in processBoards:', e);
    }

    // Make function accessible globally for debugging and to fix reference errors
    if (typeof window !== 'undefined') {
        window.processBoards = processBoards;
    }

    return {
        assigneeTimeMap,
        boardData,
        boardAssigneeData,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone,
        closedBoardCards
    };
}

// Make sure it's available globally
if (typeof window !== 'undefined') {
    window.processBoards = processBoards;
}
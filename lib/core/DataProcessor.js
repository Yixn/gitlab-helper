import { formatHours } from './Utils';

/**
 * Process all boards and extract data
 * @returns {Object} Object containing processed board data
 */
export function processBoards() {
    const assigneeTimeMap = {};
    const boardData = {};
    const boardAssigneeData = {};
    let totalEstimate = 0;
    let cardsProcessed = 0;
    let cardsWithTime = 0;
    let currentMilestone = null;
    let closedBoardCards = 0;
    // Initialize userDistributionMap here at the top level
    const userDistributionMap = {};
    // Create a map to store user data including usernames
    const userDataMap = {};



    const boardLists = document.querySelectorAll('.board-list');

    boardLists.forEach((boardList, listIndex) => {
        let boardTitle = "U" + listIndex.toString();

        try {
            if (boardList.__vue__ && boardList.__vue__.$children && boardList.__vue__.$children.length > 0) {
                const boardComponent = boardList.__vue__.$children.find(child =>
                    child.$props && child.$props.list && child.$props.list.title);

                if (boardComponent && boardComponent.$props.list.title) {
                    boardTitle = boardComponent.$props.list.title;
                }
            }
            if (boardTitle === 'Unknown') {
                const boardHeader = boardList.querySelector('.board-title-text');
                if (boardHeader) {
                    boardTitle = boardHeader.textContent.trim();
                }
            }
        } catch (e) {
            console.error('Error getting board title:', e);
            const boardHeader = boardList.querySelector('.board-title-text');
            if (boardHeader) {
                boardTitle = boardHeader.textContent.trim();
            }
        }
        if (boardTitle !== 'Unknown') {
            if (!boardData[boardTitle]) {
                boardData[boardTitle] = {
                    tickets: 0,
                    timeEstimate: 0
                };
            }

            if (!boardAssigneeData[boardTitle]) {
                boardAssigneeData[boardTitle] = {};
            }
            const lowerTitle = boardTitle.toLowerCase();
            const isClosedBoard = lowerTitle.includes('done') ||
                lowerTitle.includes('closed') ||
                lowerTitle.includes('complete') ||
                lowerTitle.includes('finished');
        } else {
            return; // Skip processing this board
        }
        const boardItems = boardList.querySelectorAll('.board-card');
        const lowerTitle = boardTitle.toLowerCase();
        const isClosedBoard = lowerTitle.includes('done') ||
            lowerTitle.includes('closed') ||
            lowerTitle.includes('complete') ||
            lowerTitle.includes('finished');
        if (isClosedBoard) {
            closedBoardCards += boardItems.length;
        }

        boardItems.forEach(item => {
            try {
                cardsProcessed++;
                boardData[boardTitle].tickets++;
                if (item.__vue__ && item.__vue__.$children) {
                    const issue = item.__vue__.$children.find(child =>
                        child.$props && child.$props.item && child.$props.item.timeEstimate !== undefined);

                    if (issue && issue.$props) {
                        const props = issue.$props;
                        if (!currentMilestone && props.item && props.item.milestone) {
                            currentMilestone = props.item.milestone.title;
                        }

                        if (props.item && props.item.timeEstimate) {
                            cardsWithTime++;
                            const timeEstimate = props.item.timeEstimate; // In seconds
                            totalEstimate += timeEstimate;
                            boardData[boardTitle].timeEstimate += timeEstimate;

                            let assignees = [];
                            if (props.item.assignees && props.item.assignees.nodes && props.item.assignees.nodes.length) {
                                assignees = props.item.assignees.nodes;
                            } else if (props.item.assignees && props.item.assignees.length > 0) {
                                assignees = props.item.assignees;
                            }
                            if (assignees.length > 0) {
                                assignees.forEach(assignee => {
                                    const assigneeShare = timeEstimate / assignees.length;
                                    const name = assignee.name;
                                    const username = assignee.username || '';
                                    // Store user data with username
                                    if (!userDataMap[name]) {
                                        userDataMap[name] = {
                                            name: name,
                                            username: username,
                                            avatar_url: assignee.avatarUrl || '',
                                            timeEstimate: 0
                                        };
                                    }
                                    userDataMap[name].timeEstimate += assigneeShare;


                                    // Initialize user distribution map if needed
                                    if (!userDistributionMap[name]) {
                                        userDistributionMap[name] = {};
                                        // Initialize with zero for all boards
                                        Object.keys(boardData).forEach(board => {
                                            userDistributionMap[name][board] = 0;
                                        });
                                    }

                                    // Update the distribution for this board
                                    userDistributionMap[name][boardTitle] =
                                        (userDistributionMap[name][boardTitle] || 0) + assigneeShare;

                                    if (!assigneeTimeMap[name]) {
                                        assigneeTimeMap[name] = 0;
                                    }
                                    assigneeTimeMap[name] += assigneeShare;
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
                                // Handle unassigned items
                                if (!userDistributionMap['Unassigned']) {
                                    userDistributionMap['Unassigned'] = {};
                                    // Initialize with zero for all boards
                                    Object.keys(boardData).forEach(board => {
                                        userDistributionMap['Unassigned'][board] = 0;
                                    });
                                }

                                // Update the distribution for this board
                                userDistributionMap['Unassigned'][boardTitle] =
                                    (userDistributionMap['Unassigned'][boardTitle] || 0) + timeEstimate;

                                if (!assigneeTimeMap['Unassigned']) {
                                    assigneeTimeMap['Unassigned'] = 0;
                                }
                                assigneeTimeMap['Unassigned'] += timeEstimate;
                                if (!boardAssigneeData[boardTitle]['Unassigned']) {
                                    boardAssigneeData[boardTitle]['Unassigned'] = {
                                        tickets: 0,
                                        timeEstimate: 0
                                    };
                                }
                                boardAssigneeData[boardTitle]['Unassigned'].tickets++;
                                boardAssigneeData[boardTitle]['Unassigned'].timeEstimate += timeEstimate;
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Error processing card:', e);
            }
        });

        uiManager.issueSelector.applyOverflowFixes()
    });

    // Format the distribution data to store with the history
    const formattedUserDistributions = {};
    Object.keys(userDistributionMap).forEach(name => {
        // Get ordered board names to ensure consistent order
        const orderedBoards = Object.keys(userDistributionMap[name]).sort((a, b) => {
            // Put done/closed boards at the end
            const aIsClosed = a.toLowerCase().includes('done') ||
                a.toLowerCase().includes('closed') ||
                a.toLowerCase().includes('complete') ||
                a.toLowerCase().includes('finished');
            const bIsClosed = b.toLowerCase().includes('done') ||
                b.toLowerCase().includes('closed') ||
                b.toLowerCase().includes('complete') ||
                b.toLowerCase().includes('finished');

            if (aIsClosed && !bIsClosed) return 1;
            if (!aIsClosed && bIsClosed) return -1;
            return a.localeCompare(b);
        });

        // Create an array of formatted hour values
        formattedUserDistributions[name] = {
            distribution: orderedBoards.map(board => {
                const timeInSeconds = userDistributionMap[name][board] || 0;
                return Math.round(formatHours(timeInSeconds));
            }),
            // Add username and avatar if available
            username: userDataMap[name]?.username || '',
            avatar_url: userDataMap[name]?.avatar_url || ''
        };
    });

    try {
        if (window.historyManager) {
            window.historyManager.saveHistoryEntry({
                assigneeTimeMap,
                boardData,
                boardAssigneeData,
                totalEstimate,
                cardsProcessed,
                cardsWithTime,
                currentMilestone,
                closedBoardCards,
                userDistributions: formattedUserDistributions, // Add this to history
                userData: userDataMap // Add user data to history
            });
        }
    } catch (e) {
        console.error('Error saving history data:', e);
    }

    return {
        assigneeTimeMap,
        boardData,
        boardAssigneeData,
        totalEstimate,
        cardsProcessed,
        cardsWithTime,
        currentMilestone,
        closedBoardCards,
        userDistributions: formattedUserDistributions, // Also return it
        userData: userDataMap // Return user data
    };
}
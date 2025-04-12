
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
    });

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
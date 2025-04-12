// History functions for GitLab Assignee Time Summary

// Get a sanitized URL key for storing history
function getCurrentUrlKey() {
    const url = window.location.href;
    // Remove any fragment identifiers
    return url.split('#')[0];
}

// Get URL specific history key
function getHistoryKey() {
    return `timeEstimateHistory_${getCurrentUrlKey()}`;
}

// Save history entry
function saveHistoryEntry(totalEstimate, milestoneInfo, forceUpdate = false) {
    try {
        const now = new Date();
        const dateString = now.toISOString();
        const totalHours = (totalEstimate / 3600).toFixed(1);

        // Get current URL for storing history by URL
        const urlKey = getHistoryKey();

        // Prepare milestone info for storage
        let currentMilestone = "None";
        if (milestoneInfo) {
            // Clean up milestone text (remove line breaks, trim whitespace)
            currentMilestone = milestoneInfo.replace(/\n/g, ' ').trim();
        }

        // Get existing history for this URL
        let history = GM_getValue(urlKey, []);

        // Create the new entry
        const newEntry = {
            date: dateString,
            timestamp: now.getTime(),
            totalHours: totalHours,
            milestone: currentMilestone,
            url: window.location.href
        };

        // Check if the new entry is different from the last one
        let shouldSave = false;

        if (history.length === 0) {
            // Always save if this is the first entry
            shouldSave = true;
        } else {
            const lastEntry = history[history.length - 1];
            // Only save if the hours or milestone changed, even on forced updates
            if (lastEntry.totalHours !== newEntry.totalHours || lastEntry.milestone !== newEntry.milestone) {
                shouldSave = true;
            } else if (forceUpdate) {
                // If forcing update but values are identical, maybe just update timestamp
                // without creating a duplicate entry
            }
        }

        // Save the new entry if it's different
        if (shouldSave) {
            history.push(newEntry);
            // Limit history size (keep last 100 entries)
            if (history.length > 100) {
                history = history.slice(-100);
            }
            GM_setValue(urlKey, history);

            // Re-render the history tab if it's currently visible
            if (document.getElementById('history-time-summary-content').style.display === 'block') {
                renderHistory();
            }
        }
    } catch (error) {
        console.error('Error saving history:', error);
    }
}

// Render history tab
function renderHistory() {
    const historyContent = document.getElementById('history-time-summary-content');
    if (!historyContent) return;

    // Clear existing content
    historyContent.innerHTML = '';

    // Get current URL key
    const urlKey = getHistoryKey();

    // Get history data specific to this URL
    const history = GM_getValue(urlKey, []);

    // Show current URL being displayed
    const urlInfo = document.createElement('div');
    urlInfo.style.fontSize = '12px';
    urlInfo.style.color = '#666';
    urlInfo.style.marginBottom = '10px';
    urlInfo.style.wordBreak = 'break-all';

    // Truncate the URL if it's too long
    let displayUrl = window.location.href;
    if (displayUrl.length > 60) {
        displayUrl = displayUrl.substring(0, 57) + '...';
    }
    historyContent.appendChild(urlInfo);

    // If no history, show message
    if (history.length === 0) {
        const noDataMsg = document.createElement('p');
        noDataMsg.textContent = 'No history data available for this URL yet.';
        noDataMsg.style.color = '#666';
        historyContent.appendChild(noDataMsg);
        return;
    }

    // Add clear history button
    const clearHistoryBtn = document.createElement('button');
    clearHistoryBtn.textContent = 'Clear History';
    clearHistoryBtn.style.padding = '3px 6px';
    clearHistoryBtn.style.fontSize = '12px';
    clearHistoryBtn.style.backgroundColor = '#dc3545';
    clearHistoryBtn.style.color = 'white';
    clearHistoryBtn.style.border = 'none';
    clearHistoryBtn.style.borderRadius = '3px';
    clearHistoryBtn.style.cursor = 'pointer';
    clearHistoryBtn.style.marginBottom = '10px';
    clearHistoryBtn.onclick = function() {
        if (confirm('Are you sure you want to clear history data for this URL?')) {
            GM_setValue(urlKey, []);
            renderHistory();
        }
    };
    historyContent.appendChild(clearHistoryBtn);

    // Create history table
    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';

    // Table header
    const headerRow = document.createElement('tr');
    headerRow.style.borderBottom = '2px solid #ddd';
    headerRow.style.fontWeight = 'bold';

    const dateHeader = document.createElement('th');
    dateHeader.textContent = 'Date';
    dateHeader.style.textAlign = 'left';
    dateHeader.style.padding = '5px 0';

    const hoursHeader = document.createElement('th');
    hoursHeader.textContent = 'Hours';
    hoursHeader.style.textAlign = 'right';
    hoursHeader.style.padding = '5px 0';

    const milestoneHeader = document.createElement('th');
    milestoneHeader.textContent = 'Milestone';
    milestoneHeader.style.textAlign = 'left';
    milestoneHeader.style.padding = '5px 0';

    headerRow.appendChild(dateHeader);
    headerRow.appendChild(hoursHeader);
    headerRow.appendChild(milestoneHeader);
    table.appendChild(headerRow);

    // Add data rows in reverse order (newest first)
    history.slice().reverse().forEach(entry => {
        const row = document.createElement('tr');
        row.style.borderBottom = '1px solid #eee';

        const dateCell = document.createElement('td');
        const entryDate = new Date(entry.timestamp);
        dateCell.textContent = entryDate.toLocaleDateString() + ' ' + entryDate.toLocaleTimeString().substring(0, 5);
        dateCell.style.padding = '5px 0';

        const hoursCell = document.createElement('td');
        hoursCell.textContent = `${entry.totalHours}h`;
        hoursCell.style.textAlign = 'right';
        hoursCell.style.padding = '5px 0';

        const milestoneCell = document.createElement('td');
        milestoneCell.textContent = entry.milestone;
        milestoneCell.style.padding = '5px 0';

        row.appendChild(dateCell);
        row.appendChild(hoursCell);
        row.appendChild(milestoneCell);
        table.appendChild(row);
    });

    historyContent.appendChild(table);
}
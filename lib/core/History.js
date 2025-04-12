import { getHistoryKey } from '../api/APIUtils';

/**
 * Save history entry
 * @param {number} totalEstimate - Total time estimate in seconds
 * @param {string} milestoneInfo - Current milestone info
 * @param {boolean} forceUpdate - Whether to force update even if no changes
 */
export function saveHistoryEntry(totalEstimate, milestoneInfo, forceUpdate = false) {
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
                // Importing UIManager would create circular dependencies,
                // so we'll rely on the global function to re-render
                if (typeof window.renderHistory === 'function') {
                    window.renderHistory();
                }
            }
        }
    } catch (error) {
        console.error('Error saving history:', error);
    }
}
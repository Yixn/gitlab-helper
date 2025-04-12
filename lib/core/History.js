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
        const urlKey = getHistoryKey();
        let currentMilestone = "None";
        if (milestoneInfo) {
            currentMilestone = milestoneInfo.replace(/\n/g, ' ').trim();
        }
        let history = GM_getValue(urlKey, []);
        const newEntry = {
            date: dateString,
            timestamp: now.getTime(),
            totalHours: totalHours,
            milestone: currentMilestone,
            url: window.location.href
        };
        let shouldSave = false;

        if (history.length === 0) {
            shouldSave = true;
        } else {
            const lastEntry = history[history.length - 1];
            if (lastEntry.totalHours !== newEntry.totalHours || lastEntry.milestone !== newEntry.milestone) {
                shouldSave = true;
            } else if (forceUpdate) {
            }
        }
        if (shouldSave) {
            history.push(newEntry);
            if (history.length > 100) {
                history = history.slice(-100);
            }
            GM_setValue(urlKey, history);
            if (document.getElementById('history-time-summary-content').style.display === 'block') {
                if (typeof window.renderHistory === 'function') {
                    window.renderHistory();
                }
            }
        }
    } catch (error) {
        console.error('Error saving history:', error);
    }
}
/**
 * Manager for sprint history data
 */
export default class HistoryManager {
    constructor() {
        this.historyData = {};
    }

    /**
     * Generate a unique key for current board and parameters
     * @returns {string} Unique key for storage
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
     * Save history entry for current day
     * @param {Object} data - Sprint data to save
     */
    saveHistoryEntry(data) {
        try {
            const boardKey = this.getBoardKey();
            const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

            // Load existing history
            const history = this.loadHistory();

            // Initialize board history if needed
            if (!history[boardKey]) {
                history[boardKey] = {};
            }

            // Extract user data components
            const userPerformance = data.userPerformance || {};
            const userDistributions = data.userDistributions || {};
            const userData = data.userData || {};
            const boardAssigneeData = data.boardAssigneeData || {};

            // If we have both user performance and distributions, merge them
            if (Object.keys(userPerformance).length > 0 && Object.keys(userDistributions).length > 0) {
                Object.entries(userPerformance).forEach(([name, performanceData]) => {
                    if (userDistributions[name]) {
                        userPerformance[name].distribution = userDistributions[name].distribution;

                        // Add username and avatar if available in userDistributions
                        if (userDistributions[name].username) {
                            userPerformance[name].username = userDistributions[name].username;
                        }
                        if (userDistributions[name].avatar_url) {
                            userPerformance[name].avatar_url = userDistributions[name].avatar_url;
                        }
                    }

                    // Also check userData for any additional user data
                    if (userData[name]) {
                        if (!userPerformance[name].username && userData[name].username) {
                            userPerformance[name].username = userData[name].username;
                        }
                        if (!userPerformance[name].avatar_url && userData[name].avatar_url) {
                            userPerformance[name].avatar_url = userData[name].avatar_url;
                        }
                    }
                });
            }

            // Update or create today's entry
            history[boardKey][today] = {
                ...data,
                userDistributions: userDistributions, // Ensure this is saved
                userData: userData, // Save the user data
                timestamp: new Date().toISOString(),
                boardAssigneeData: boardAssigneeData
            };

            // Save back to localStorage
            localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));

            return true;
        } catch (error) {
            console.error('Error saving history entry:', error);
            return false;
        }
    }

    /**
     * Load all history data
     * @returns {Object} History data organized by board and date
     */
    loadHistory() {
        try {
            const historyData = localStorage.getItem('gitLabHelperHistory');
            if (!historyData) {
                return {};
            }
            return JSON.parse(historyData);
        } catch (error) {
            console.error('Error loading history data:', error);
            return {};
        }
    }

    /**
     * Get history for current board
     * @returns {Object} History data for current board
     */
    getCurrentBoardHistory() {
        const boardKey = this.getBoardKey();
        const history = this.loadHistory();
        return history[boardKey] || {};
    }

    /**
     * Clear all history data
     * @returns {boolean} Success status
     */
    clearAllHistory() {
        try {
            localStorage.removeItem('gitLabHelperHistory');
            return true;
        } catch (error) {
            console.error('Error clearing history:', error);
            return false;
        }
    }

    /**
     * Clear history for current board only
     * @returns {boolean} Success status
     */
    clearCurrentBoardHistory() {
        try {
            const boardKey = this.getBoardKey();
            const history = this.loadHistory();

            if (history[boardKey]) {
                delete history[boardKey];
                localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));
            }

            return true;
        } catch (error) {
            console.error('Error clearing board history:', error);
            return false;
        }
    }
}
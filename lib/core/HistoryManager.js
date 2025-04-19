export default class HistoryManager {
  constructor() {
    this.historyData = {};
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
  saveHistoryEntry(data) {
    try {
      const {
        hasOnlyAllowedParams
      } = window;
      if (!hasOnlyAllowedParams()) {
        return false;
      }
      const boardKey = this.getBoardKey();
      const today = new Date().toISOString().split('T')[0];
      const history = this.loadHistory();
      if (!history[boardKey]) {
        history[boardKey] = {};
      }
      const userPerformance = data.userPerformance || {};
      const userDistributions = data.userDistributions || {};
      const userData = data.userData || {};
      const boardAssigneeData = data.boardAssigneeData || {};
      if (Object.keys(userPerformance).length > 0 && Object.keys(userDistributions).length > 0) {
        Object.entries(userPerformance).forEach(([name, performanceData]) => {
          if (userDistributions[name]) {
            userPerformance[name].distribution = userDistributions[name].distribution;
            if (userDistributions[name].username) {
              userPerformance[name].username = userDistributions[name].username;
            }
            if (userDistributions[name].avatar_url) {
              userPerformance[name].avatar_url = userDistributions[name].avatar_url;
            }
          }
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
      history[boardKey][today] = {
        ...data,
        userDistributions: userDistributions,
        userData: userData,
        timestamp: new Date().toISOString(),
        boardAssigneeData: boardAssigneeData
      };
      localStorage.setItem('gitLabHelperHistory', JSON.stringify(history));
      return true;
    } catch (error) {
      console.error('Error saving history entry:', error);
      return false;
    }
  }
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
  getCurrentBoardHistory() {
    const boardKey = this.getBoardKey();
    const history = this.loadHistory();
    return history[boardKey] || {};
  }
  clearAllHistory() {
    try {
      localStorage.removeItem('gitLabHelperHistory');
      localStorage.removeItem('gitLabHelperSprintHistory');
      localStorage.removeItem('gitLabHelperSprintState');
      this.historyData = {};
      return true;
    } catch (error) {
      console.error('Error clearing history:', error);
      return false;
    }
  }
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
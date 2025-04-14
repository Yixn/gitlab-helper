export default class StatsView {
  constructor(uiManager) {
    this.uiManager = uiManager;
    this.notification = null;
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
  render() {
    const statsContent = document.getElementById('stats-content');
    if (!statsContent) return;
    statsContent.innerHTML = '';
    const comingSoonContainer = document.createElement('div');
    comingSoonContainer.style.display = 'flex';
    comingSoonContainer.style.flexDirection = 'column';
    comingSoonContainer.style.alignItems = 'center';
    comingSoonContainer.style.justifyContent = 'center';
    comingSoonContainer.style.height = '100%';
    comingSoonContainer.style.padding = '40px 20px';
    comingSoonContainer.style.textAlign = 'center';
    const soonIcon = document.createElement('div');
    soonIcon.innerHTML = '🔍';
    soonIcon.style.fontSize = '48px';
    soonIcon.style.marginBottom = '20px';
    const soonTitle = document.createElement('h3');
    soonTitle.textContent = 'Statistics Coming Soon';
    soonTitle.style.marginBottom = '15px';
    soonTitle.style.color = '#1f75cb';
    const soonDesc = document.createElement('p');
    soonDesc.textContent = 'Detailed team and individual performance statistics will be available here soon.';
    soonDesc.style.color = '#666';
    soonDesc.style.maxWidth = '500px';
    comingSoonContainer.appendChild(soonIcon);
    comingSoonContainer.appendChild(soonTitle);
    comingSoonContainer.appendChild(soonDesc);
    statsContent.appendChild(comingSoonContainer);
    if (this.uiManager && this.uiManager.removeLoadingScreen) {
      this.uiManager.removeLoadingScreen('stats-tab');
    }
  }
}
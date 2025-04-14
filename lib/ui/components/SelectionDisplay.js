export default class SelectionDisplay {
  constructor(options = {}) {
    this.selectedIssues = options.selectedIssues || [];
    this.onRemoveIssue = options.onRemoveIssue || null;
    this.container = null;
    this.issuesList = null;
  }
  createSelectionContainer(container) {
    this.container = container;
    const selectedIssuesContainer = document.createElement('div');
    selectedIssuesContainer.style.marginBottom = '12px';
    selectedIssuesContainer.style.padding = '8px';
    selectedIssuesContainer.style.borderRadius = '4px';
    selectedIssuesContainer.style.border = '1px dashed #ccc';
    selectedIssuesContainer.style.backgroundColor = '#f9f9f9';
    selectedIssuesContainer.style.maxHeight = '150px';
    selectedIssuesContainer.style.overflowY = 'auto';
    const issueLabel = document.createElement('div');
    issueLabel.style.fontSize = '12px';
    issueLabel.style.color = '#666';
    issueLabel.style.marginBottom = '5px';
    issueLabel.textContent = 'Selected Issues:';
    selectedIssuesContainer.appendChild(issueLabel);
    const selectedIssuesList = document.createElement('div');
    selectedIssuesList.id = 'selected-issues-list';
    selectedIssuesList.style.fontSize = '14px';
    this.issuesList = selectedIssuesList;
    this.displayNoIssuesMessage();
    selectedIssuesContainer.appendChild(selectedIssuesList);
    container.appendChild(selectedIssuesContainer);
    this.updateDisplay();
  }
  displayNoIssuesMessage() {
    if (!this.issuesList) return;
    const existingMessage = this.issuesList.querySelector('#no-issues-selected');
    if (existingMessage) return;
    const noIssuesSelected = document.createElement('div');
    noIssuesSelected.id = 'no-issues-selected';
    noIssuesSelected.textContent = 'No issues selected';
    noIssuesSelected.style.color = '#666';
    noIssuesSelected.style.fontStyle = 'italic';
    this.issuesList.appendChild(noIssuesSelected);
  }
  updateDisplay() {
    if (!this.issuesList) {
      console.error('Issues list not initialized');
      return;
    }
    this.issuesList.innerHTML = '';
    if (!this.selectedIssues || this.selectedIssues.length === 0) {
      this.displayNoIssuesMessage();
      const container = this.issuesList.parentElement;
      if (container) {
        container.style.borderColor = '#ccc';
        container.style.backgroundColor = '#f9f9f9';
      }
      return;
    }
    const container = this.issuesList.parentElement;
    if (container) {
      container.style.borderColor = '#1f75cb';
      container.style.backgroundColor = 'rgba(31, 117, 203, 0.05)';
    }
    this.selectedIssues.forEach((issue, index) => {
      if (!issue) return;
      const issueItem = document.createElement('div');
      issueItem.className = 'selected-issue-item';
      issueItem.style.padding = '5px';
      issueItem.style.marginBottom = '3px';
      issueItem.style.borderRadius = '3px';
      issueItem.style.backgroundColor = 'rgba(31, 117, 203, 0.1)';
      issueItem.style.display = 'flex';
      issueItem.style.justifyContent = 'space-between';
      issueItem.style.alignItems = 'center';
      const issueInfo = document.createElement('div');
      const issueId = issue.iid || 'Unknown';
      const issueTitle = issue.title || 'Untitled Issue';
      issueInfo.innerHTML = `<strong>#${issueId}</strong> - ${issueTitle}`;
      issueInfo.style.overflow = 'hidden';
      issueInfo.style.textOverflow = 'ellipsis';
      issueInfo.style.whiteSpace = 'nowrap';
      issueInfo.style.marginRight = '5px';
      issueItem.appendChild(issueInfo);
      const removeBtn = document.createElement('button');
      removeBtn.textContent = '×';
      removeBtn.style.backgroundColor = 'transparent';
      removeBtn.style.border = 'none';
      removeBtn.style.color = '#dc3545';
      removeBtn.style.fontSize = '16px';
      removeBtn.style.fontWeight = 'bold';
      removeBtn.style.cursor = 'pointer';
      removeBtn.style.padding = '0 5px';
      removeBtn.title = 'Remove this issue';
      removeBtn.setAttribute('data-index', index);
      removeBtn.addEventListener('mouseenter', () => {
        removeBtn.style.color = '#c82333';
      });
      removeBtn.addEventListener('mouseleave', () => {
        removeBtn.style.color = '#dc3545';
      });
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        const clickedIndex = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        if (!isNaN(clickedIndex)) {
          this.removeIssue(clickedIndex);
        }
      });
      issueItem.appendChild(removeBtn);
      this.issuesList.appendChild(issueItem);
    });
  }
  removeIssue(index) {
    if (this.selectedIssues.length > index) {
      const removedIssue = this.selectedIssues[index];
      this.selectedIssues.splice(index, 1);
      if (this.uiManager && this.uiManager.issueSelector) {
        this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      } else if (window.uiManager && window.uiManager.issueSelector) {
        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      }
      this.updateDisplay();
      const statusEl = document.getElementById('comment-status');
      if (statusEl) {
        const count = this.selectedIssues.length;
        if (count > 0) {
          statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
          statusEl.style.color = 'green';
        } else {
          statusEl.textContent = 'No issues selected. Click "Select Issues" to choose issues.';
          statusEl.style.color = '#666';
        }
      }
    }
  }
  onRemoveIssue(index) {
    if (this.selectedIssues.length > index) {
      const removedIssue = this.selectedIssues[index];
      this.selectedIssues.splice(index, 1);
      if (this.uiManager && this.uiManager.issueSelector) {
        this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      } else if (window.uiManager && window.uiManager.issueSelector) {
        window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
      }
    }
  }
  setSelectedIssues(issues) {
    this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
    this.updateDisplay();
  }
}
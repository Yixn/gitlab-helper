import { getLabelWhitelist, saveLabelWhitelist, resetLabelWhitelist, getAssigneeWhitelist, saveAssigneeWhitelist, getToggleShortcut, saveToggleShortcut } from '../../storage/SettingsStorage';
import { generateColorFromString, getContrastColor } from '../../core/Utils';
import Notification from '../components/Notification';
export default class SettingsManager {
  constructor(options = {}) {
    this.labelManager = options.labelManager;
    this.assigneeManager = options.assigneeManager;
    this.gitlabApi = options.gitlabApi || window.gitlabApi;
    this.uiManager = options.uiManager || window.uiManager;
    this.onSettingsChanged = options.onSettingsChanged || null;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.availableAssignees = [];
    this.isLoadingAssignees = false;
  }
  openSettingsModal() {
    const modalOverlay = document.createElement('div');
    modalOverlay.id = 'git-helper-settings-overlay';
    modalOverlay.style.position = 'fixed';
    modalOverlay.style.top = '0';
    modalOverlay.style.left = '0';
    modalOverlay.style.width = '100%';
    modalOverlay.style.height = '100%';
    modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    modalOverlay.style.zIndex = '1000';
    modalOverlay.style.display = 'flex';
    modalOverlay.style.justifyContent = 'center';
    modalOverlay.style.alignItems = 'center';
    modalOverlay.style.cursor = 'pointer';
    this.currentModal = modalOverlay;
    const modalContent = document.createElement('div');
    modalContent.style.backgroundColor = 'white';
    modalContent.style.borderRadius = '6px';
    modalContent.style.padding = '20px';
    modalContent.style.width = '700px';
    modalContent.style.maxWidth = '90%';
    modalContent.style.maxHeight = '80vh';
    modalContent.style.overflow = 'auto';
    modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
    const modalHeader = document.createElement('div');
    modalHeader.style.display = 'flex';
    modalHeader.style.justifyContent = 'space-between';
    modalHeader.style.alignItems = 'center';
    modalHeader.style.marginBottom = '15px';
    modalHeader.style.borderBottom = '1px solid #eee';
    modalHeader.style.paddingBottom = '10px';
    const modalTitle = document.createElement('h3');
    modalTitle.textContent = 'Settings';
    modalTitle.style.margin = '0';
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.fontSize = '24px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.onclick = () => modalOverlay.remove();
    modalHeader.appendChild(modalTitle);
    modalHeader.appendChild(closeButton);
    const contentContainer = document.createElement('div');
    this.createCollapsibleSection(contentContainer, 'General', 'Configure application-wide settings', container => this.createGeneralSettings(container), true);
    this.createCollapsibleSection(contentContainer, 'Assignees', 'Manage assignees for quick access in comments', container => this.createAssigneeSettings(container), false);
    this.createCollapsibleSection(contentContainer, 'Labels', 'Manage which labels appear in the dropdown menus', container => this.createLabelWhitelistSettings(container), false);
    this.createCollapsibleSection(contentContainer, 'Appearance', 'Customize the appearance of GitLab Sprint Helper', container => this.createAppearanceSettings(container), false);
    const buttonContainer = document.createElement('div');
    buttonContainer.style.marginTop = '20px';
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-between';
    buttonContainer.style.alignItems = 'center';
    buttonContainer.style.borderTop = '1px solid #eee';
    buttonContainer.style.paddingTop = '15px';
    const resetButton = document.createElement('button');
    resetButton.textContent = 'Reset to Defaults';
    resetButton.style.padding = '8px 16px';
    resetButton.style.backgroundColor = '#6c757d';
    resetButton.style.color = 'white';
    resetButton.style.border = 'none';
    resetButton.style.borderRadius = '4px';
    resetButton.style.cursor = 'pointer';
    resetButton.onclick = () => {
      if (confirm('Are you sure you want to reset all settings to default values?')) {
        this.resetAllSettings();
        modalOverlay.remove();
        this.notification.success('Settings reset to defaults');
      }
    };
    const closeModalButton = document.createElement('button');
    closeModalButton.textContent = 'Close';
    closeModalButton.onclick = () => {
      if (this.currentModal) {
        this.currentModal.remove();
        this.currentModal = null;
      }
    };
    buttonContainer.appendChild(resetButton);
    buttonContainer.appendChild(closeModalButton);
    modalContent.appendChild(modalHeader);
    modalContent.appendChild(contentContainer);
    modalContent.appendChild(buttonContainer);
    modalOverlay.appendChild(modalContent);
    document.body.appendChild(modalOverlay);
    modalOverlay.addEventListener('click', e => {
      if (e.target === modalOverlay) {
        modalOverlay.remove();
      }
    });
  }
  createCollapsibleSection(container, title, description, contentBuilder, startExpanded = false) {
    startExpanded = false;
    const section = document.createElement('div');
    section.className = 'gitlab-helper-settings-section';
    section.style.marginBottom = '15px';
    section.style.border = '1px solid #ddd';
    section.style.borderRadius = '6px';
    section.style.overflow = 'hidden';
    const header = document.createElement('div');
    header.className = 'gitlab-helper-settings-header';
    header.style.padding = '12px 15px';
    header.style.backgroundColor = '#f8f9fa';
    header.style.borderBottom = startExpanded ? '1px solid #ddd' : 'none';
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.cursor = 'pointer';
    header.style.transition = 'background-color 0.2s ease';
    header.addEventListener('mouseenter', () => {
      header.style.backgroundColor = '#e9ecef';
    });
    header.addEventListener('mouseleave', () => {
      header.style.backgroundColor = '#f8f9fa';
    });
    const titleContainer = document.createElement('div');
    const titleEl = document.createElement('h4');
    titleEl.textContent = title;
    titleEl.style.margin = '0';
    titleEl.style.fontSize = '16px';
    const descEl = document.createElement('div');
    descEl.textContent = description;
    descEl.style.fontSize = '13px';
    descEl.style.color = '#6c757d';
    descEl.style.marginTop = '4px';
    titleContainer.appendChild(titleEl);
    titleContainer.appendChild(descEl);
    const toggle = document.createElement('span');
    toggle.textContent = startExpanded ? '▼' : '▶';
    toggle.style.fontSize = '14px';
    toggle.style.transition = 'transform 0.3s ease';
    header.appendChild(titleContainer);
    header.appendChild(toggle);
    const content = document.createElement('div');
    content.className = 'gitlab-helper-settings-content';
    content.style.padding = '5px';
    content.style.display = startExpanded ? 'block' : 'none';
    content.style.backgroundColor = 'white';
    let contentBuilt = false;
    header.addEventListener('click', () => {
      const isExpanded = content.style.display === 'block';
      content.style.display = isExpanded ? 'none' : 'block';
      toggle.textContent = isExpanded ? '▶' : '▼';
      header.style.borderBottom = isExpanded ? 'none' : '1px solid #ddd';
      if (!contentBuilt && !isExpanded) {
        contentBuilder(content);
        contentBuilt = true;
      }
    });
    section.appendChild(header);
    section.appendChild(content);
    container.appendChild(section);
    return section;
  }
  createAssigneeSettings(container) {
    const assigneeSection = document.createElement('div');
    const actionsRow = document.createElement('div');
    actionsRow.style.display = 'flex';
    actionsRow.style.justifyContent = 'space-between';
    actionsRow.style.marginBottom = '15px';
    actionsRow.style.gap = '10px';
    const searchContainer = document.createElement('div');
    searchContainer.style.flex = '1';
    const searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search assignees...';
    searchInput.style.width = '100%';
    searchInput.style.padding = '8px 10px';
    searchInput.style.borderRadius = '4px';
    searchInput.style.border = '1px solid #ccc';
    searchContainer.appendChild(searchInput);
    const fetchButton = document.createElement('button');
    fetchButton.textContent = 'Fetch GitLab Users';
    fetchButton.style.padding = '8px 12px';
    fetchButton.style.backgroundColor = '#1f75cb';
    fetchButton.style.color = 'white';
    fetchButton.style.border = 'none';
    fetchButton.style.borderRadius = '4px';
    fetchButton.style.cursor = 'pointer';
    fetchButton.onclick = () => this.fetchGitLabUsers(availableListContainer);
    actionsRow.appendChild(searchContainer);
    actionsRow.appendChild(fetchButton);
    assigneeSection.appendChild(actionsRow);
    const tabsContainer = document.createElement('div');
    tabsContainer.style.display = 'flex';
    tabsContainer.style.borderBottom = '1px solid #dee2e6';
    tabsContainer.style.marginBottom = '15px';
    const tabs = [{
      id: 'whitelisted',
      label: 'My Assignees',
      active: true
    }, {
      id: 'available',
      label: 'Available Users',
      active: false
    }];
    const tabElements = {};
    const tabContents = {};
    tabs.forEach(tab => {
      const tabElement = document.createElement('div');
      tabElement.textContent = tab.label;
      tabElement.style.padding = '8px 15px';
      tabElement.style.cursor = 'pointer';
      tabElement.style.transition = 'all 0.2s ease';
      if (tab.active) {
        tabElement.style.borderBottom = '2px solid #1f75cb';
        tabElement.style.fontWeight = 'bold';
      }
      tabElement.addEventListener('mouseenter', () => {
        if (!tab.active) {
          tabElement.style.backgroundColor = '#f5f5f5';
        }
      });
      tabElement.addEventListener('mouseleave', () => {
        if (!tab.active) {
          tabElement.style.backgroundColor = '';
        }
      });
      tabElement.addEventListener('click', () => {
        tabs.forEach(t => {
          t.active = false;
          tabElements[t.id].style.borderBottom = 'none';
          tabElements[t.id].style.fontWeight = 'normal';
          tabElements[t.id].style.backgroundColor = '';
          tabContents[t.id].style.display = 'none';
        });
        tab.active = true;
        tabElement.style.borderBottom = '2px solid #1f75cb';
        tabElement.style.fontWeight = 'bold';
        tabContents[tab.id].style.display = 'block';
        if (tab.id === 'whitelisted') {
          this.refreshAssigneeList(assigneeListContainer);
        } else if (tab.id === 'available') {
          this.fetchGitLabUsers(availableListContainer);
        }
      });
      tabElements[tab.id] = tabElement;
      tabsContainer.appendChild(tabElement);
    });
    assigneeSection.appendChild(tabsContainer);
    const whitelistedContent = document.createElement('div');
    whitelistedContent.style.display = 'block';
    const availableContent = document.createElement('div');
    availableContent.style.display = 'none';
    const assigneeListContainer = document.createElement('div');
    assigneeListContainer.style.height = '300px';
    assigneeListContainer.style.overflowY = 'auto';
    assigneeListContainer.style.border = '1px solid #eee';
    assigneeListContainer.style.borderRadius = '4px';
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      return emptyMessage;
    };
    let assignees = [];
    if (this.assigneeManager) {
      assignees = this.assigneeManager.getAssigneeWhitelist();
    } else {
      assignees = getAssigneeWhitelist();
    }
    if (assignees.length > 0) {
      assignees.forEach((assignee, index) => {
        assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
      });
    } else {
      assigneeListContainer.appendChild(createEmptyMessage());
    }
    whitelistedContent.appendChild(assigneeListContainer);
    const availableListContainer = document.createElement('div');
    availableListContainer.className = 'available-assignees-list';
    availableListContainer.style.height = '300px';
    availableListContainer.style.overflowY = 'auto';
    availableListContainer.style.border = '1px solid #eee';
    availableListContainer.style.borderRadius = '4px';
    const availableEmptyMessage = document.createElement('div');
    availableEmptyMessage.textContent = 'Click "Fetch GitLab Users" to load available assignees.';
    availableEmptyMessage.style.padding = '15px';
    availableEmptyMessage.style.color = '#666';
    availableEmptyMessage.style.fontStyle = 'italic';
    availableEmptyMessage.style.textAlign = 'center';
    availableListContainer.appendChild(availableEmptyMessage);
    availableContent.appendChild(availableListContainer);
    tabContents['whitelisted'] = whitelistedContent;
    tabContents['available'] = availableContent;
    assigneeSection.appendChild(whitelistedContent);
    assigneeSection.appendChild(availableContent);
    searchInput.addEventListener('input', () => {
      const searchText = searchInput.value.toLowerCase();
      const activeTab = tabs.find(t => t.active).id;
      const list = activeTab === 'whitelisted' ? assigneeListContainer : availableListContainer;
      const items = list.querySelectorAll('.assignee-item');
      items.forEach(item => {
        const nameEl = item.querySelector('.assignee-name');
        const usernameEl = item.querySelector('.assignee-username');
        if (!nameEl || !usernameEl) return;
        const name = nameEl.textContent.toLowerCase();
        const username = usernameEl.textContent.toLowerCase();
        if (name.includes(searchText) || username.includes(searchText)) {
          item.style.display = '';
        } else {
          item.style.display = 'none';
        }
      });
    });
    container.appendChild(assigneeSection);
  }
  createAddAssigneeForm(listContainer, createEmptyMessage) {
    const addForm = document.createElement('div');
    addForm.style.marginTop = '15px';
    addForm.style.padding = '15px';
    addForm.style.backgroundColor = '#f8f9fa';
    addForm.style.borderRadius = '4px';
    const formTitle = document.createElement('h5');
    formTitle.textContent = 'Add New Assignee';
    formTitle.style.marginTop = '0';
    formTitle.style.marginBottom = '10px';
    const nameContainer = document.createElement('div');
    nameContainer.style.marginBottom = '10px';
    const nameLabel = document.createElement('label');
    nameLabel.textContent = 'Display Name:';
    nameLabel.style.display = 'block';
    nameLabel.style.marginBottom = '5px';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'John Doe';
    nameInput.style.width = '100%';
    nameInput.style.padding = '6px 10px';
    nameInput.style.borderRadius = '4px';
    nameInput.style.border = '1px solid #ccc';
    nameContainer.appendChild(nameLabel);
    nameContainer.appendChild(nameInput);
    const usernameContainer = document.createElement('div');
    usernameContainer.style.marginBottom = '15px';
    const usernameLabel = document.createElement('label');
    usernameLabel.textContent = 'GitLab Username:';
    usernameLabel.style.display = 'block';
    usernameLabel.style.marginBottom = '5px';
    const usernameInput = document.createElement('input');
    usernameInput.type = 'text';
    usernameInput.placeholder = 'username (without @)';
    usernameInput.style.width = '100%';
    usernameInput.style.padding = '6px 10px';
    usernameInput.style.borderRadius = '4px';
    usernameInput.style.border = '1px solid #ccc';
    usernameContainer.appendChild(usernameLabel);
    usernameContainer.appendChild(usernameInput);
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'flex-end';
    const addButton = document.createElement('button');
    addButton.textContent = 'Add Assignee';
    addButton.style.padding = '6px 12px';
    addButton.style.backgroundColor = '#28a745';
    addButton.style.color = 'white';
    addButton.style.border = 'none';
    addButton.style.borderRadius = '4px';
    addButton.style.cursor = 'pointer';
    addButton.onclick = () => {
      const name = nameInput.value.trim();
      const username = usernameInput.value.trim();
      if (!username) {
        this.notification.error('Username is required');
        return;
      }
      const newAssignee = {
        name: name || username,
        username: username
      };
      if (this.assigneeManager) {
        this.assigneeManager.addAssignee(newAssignee);
      } else {
        const assignees = getAssigneeWhitelist();
        const existingIndex = assignees.findIndex(a => a.username === username);
        if (existingIndex >= 0) {
          assignees[existingIndex] = newAssignee;
        } else {
          assignees.push(newAssignee);
        }
        saveAssigneeWhitelist(assignees);
      }
      const emptyMessage = listContainer.querySelector('div[style*="italic"]');
      if (emptyMessage) {
        emptyMessage.remove();
      }
      const assignees = getAssigneeWhitelist();
      listContainer.appendChild(this.createAssigneeListItem(newAssignee, assignees.length - 1, listContainer, createEmptyMessage));
      nameInput.value = '';
      usernameInput.value = '';
      this.notification.success(`Added assignee: ${newAssignee.name}`);
      if (this.onSettingsChanged) {
        this.onSettingsChanged('assignees');
      }
    };
    buttonContainer.appendChild(addButton);
    addForm.appendChild(formTitle);
    addForm.appendChild(nameContainer);
    addForm.appendChild(usernameContainer);
    addForm.appendChild(buttonContainer);
    return addForm;
  }
  async fetchGitLabUsers(container) {
    try {
      if (!this.gitlabApi) {
        this.notification.error('GitLab API not available');
        return;
      }
      this.isLoadingAssignees = true;
      container.innerHTML = '';
      const loadingMessage = document.createElement('div');
      loadingMessage.textContent = 'Loading users from GitLab...';
      loadingMessage.style.padding = '15px';
      loadingMessage.style.textAlign = 'center';
      container.appendChild(loadingMessage);
      try {
        const pathInfo = getPathFromUrl();
        if (!pathInfo) {
          throw new Error('Could not determine project/group path');
        }
        let users = [];
        if (pathInfo.type === 'project') {
          users = await this.gitlabApi.callGitLabApi(`projects/${pathInfo.encodedPath}/members/all`, {
            params: {
              per_page: 100,
              all_available: true
            }
          });
        } else if (pathInfo.type === 'group') {
          users = await this.gitlabApi.callGitLabApi(`groups/${pathInfo.encodedPath}/members/all`, {
            params: {
              per_page: 100,
              all_available: true
            }
          });
        }
        this.availableAssignees = users.map(user => ({
          id: user.id,
          name: user.name,
          username: user.username,
          avatar_url: user.avatar_url
        }));
        this.renderAvailableUsers(container);
      } catch (error) {
        console.error('Error fetching GitLab users:', error);
        container.innerHTML = '';
        const errorMessage = document.createElement('div');
        errorMessage.textContent = `Error loading users: ${error.message}`;
        errorMessage.style.padding = '15px';
        errorMessage.style.color = '#dc3545';
        errorMessage.style.textAlign = 'center';
        container.appendChild(errorMessage);
        this.notification.error('Failed to load GitLab users');
      } finally {
        this.isLoadingAssignees = false;
      }
    } catch (error) {}
  }
  renderAvailableUsers(container) {
    container.innerHTML = '';
    const whitelist = getAssigneeWhitelist();
    const whitelistUsernames = whitelist.map(a => a.username.toLowerCase());
    if (this.availableAssignees.length === 0) {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No users found. Try fetching again.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      container.appendChild(emptyMessage);
      return;
    }
    this.availableAssignees.sort((a, b) => a.name.localeCompare(b.name));
    this.availableAssignees.forEach(user => {
      const isWhitelisted = whitelistUsernames.includes(user.username.toLowerCase());
      const userItem = document.createElement('div');
      userItem.className = 'assignee-item';
      userItem.style.display = 'flex';
      userItem.style.justifyContent = 'space-between';
      userItem.style.alignItems = 'center';
      userItem.style.padding = '10px 15px';
      userItem.style.borderBottom = '1px solid #eee';
      userItem.style.backgroundColor = isWhitelisted ? 'rgba(40, 167, 69, 0.05)' : '';
      const userInfo = document.createElement('div');
      userInfo.style.display = 'flex';
      userInfo.style.alignItems = 'center';
      if (user.avatar_url) {
        const avatar = document.createElement('img');
        avatar.src = user.avatar_url;
        avatar.style.width = '30px';
        avatar.style.height = '30px';
        avatar.style.borderRadius = '50%';
        avatar.style.marginRight = '10px';
        userInfo.appendChild(avatar);
      } else {
        const avatarPlaceholder = document.createElement('div');
        avatarPlaceholder.style.width = '30px';
        avatarPlaceholder.style.height = '30px';
        avatarPlaceholder.style.borderRadius = '50%';
        avatarPlaceholder.style.backgroundColor = '#e0e0e0';
        avatarPlaceholder.style.display = 'flex';
        avatarPlaceholder.style.alignItems = 'center';
        avatarPlaceholder.style.justifyContent = 'center';
        avatarPlaceholder.style.marginRight = '10px';
        avatarPlaceholder.style.fontWeight = 'bold';
        avatarPlaceholder.style.color = '#666';
        const name = user.name || user.username;
        const initials = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
        avatarPlaceholder.textContent = initials;
        userInfo.appendChild(avatarPlaceholder);
      }
      const userDetails = document.createElement('div');
      const userName = document.createElement('div');
      userName.className = 'assignee-name';
      userName.textContent = user.name;
      userName.style.fontWeight = 'bold';
      const userUsername = document.createElement('div');
      userUsername.className = 'assignee-username';
      userUsername.textContent = `@${user.username}`;
      userUsername.style.fontSize = '12px';
      userUsername.style.color = '#666';
      userDetails.appendChild(userName);
      userDetails.appendChild(userUsername);
      userInfo.appendChild(userDetails);
      const actionButton = document.createElement('button');
      if (isWhitelisted) {
        actionButton.textContent = 'Added ✓';
        actionButton.style.backgroundColor = '#e9ecef';
        actionButton.style.color = '#28a745';
        actionButton.style.cursor = 'default';
      } else {
        actionButton.textContent = 'Add';
        actionButton.style.backgroundColor = '#28a745';
        actionButton.style.color = 'white';
        actionButton.style.cursor = 'pointer';
        actionButton.addEventListener('click', () => {
          const assignee = {
            name: user.name,
            username: user.username
          };
          if (this.assigneeManager) {
            this.assigneeManager.addAssignee(assignee);
          } else {
            const whitelist = getAssigneeWhitelist();
            whitelist.push(assignee);
            saveAssigneeWhitelist(whitelist);
          }
          actionButton.textContent = 'Added ✓';
          actionButton.style.backgroundColor = '#e9ecef';
          actionButton.style.color = '#28a745';
          actionButton.style.cursor = 'default';
          userItem.style.backgroundColor = 'rgba(40, 167, 69, 0.05)';
          this.notification.success(`Added ${user.name} to assignees`);
          if (typeof this.onSettingsChanged === 'function') {
            this.onSettingsChanged('assignees');
          }
          this.refreshWhitelistedTab();
        });
      }
      actionButton.style.padding = '5px 10px';
      actionButton.style.border = 'none';
      actionButton.style.borderRadius = '4px';
      actionButton.style.fontSize = '12px';
      userItem.appendChild(userInfo);
      userItem.appendChild(actionButton);
      container.appendChild(userItem);
    });
  }
  refreshWhitelistedTab() {
    const whitelistedContent = document.querySelector('div[style*="display: block"]');
    if (!whitelistedContent) return;
    const assigneeListContainer = whitelistedContent.querySelector('div[style*="overflowY: auto"]');
    if (!assigneeListContainer) return;
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      return emptyMessage;
    };
    assigneeListContainer.innerHTML = '';
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = 'Refreshing assignees...';
    loadingIndicator.style.padding = '15px';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.color = '#666';
    assigneeListContainer.appendChild(loadingIndicator);
    setTimeout(() => {
      let assignees = [];
      if (this.assigneeManager) {
        assignees = this.assigneeManager.getAssigneeWhitelist();
      } else {
        assignees = getAssigneeWhitelist();
      }
      assigneeListContainer.innerHTML = '';
      if (assignees.length > 0) {
        assignees.forEach((assignee, index) => {
          assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
        });
      } else {
        assigneeListContainer.appendChild(createEmptyMessage());
      }
    }, 300);
  }
  createAssigneeListItem(assignee, index, listContainer, createEmptyMessage) {
    const item = document.createElement('div');
    item.className = 'assignee-item';
    item.style.display = 'flex';
    item.style.justifyContent = 'space-between';
    item.style.alignItems = 'center';
    item.style.padding = '10px 15px';
    item.style.borderBottom = '1px solid #eee';
    const info = document.createElement('div');
    info.style.display = 'flex';
    info.style.alignItems = 'center';
    const avatar = document.createElement('div');
    avatar.style.width = '30px';
    avatar.style.height = '30px';
    avatar.style.borderRadius = '50%';
    avatar.style.backgroundColor = '#e0e0e0';
    avatar.style.display = 'flex';
    avatar.style.alignItems = 'center';
    avatar.style.justifyContent = 'center';
    avatar.style.marginRight = '10px';
    avatar.style.fontWeight = 'bold';
    avatar.style.color = '#666';
    const name = assignee.name || assignee.username;
    const initials = name.split(' ').map(part => part.charAt(0)).slice(0, 2).join('').toUpperCase();
    avatar.textContent = initials;
    info.appendChild(avatar);
    const nameContainer = document.createElement('div');
    const displayName = document.createElement('div');
    displayName.className = 'assignee-name';
    displayName.textContent = assignee.name || assignee.username;
    displayName.style.fontWeight = 'bold';
    const username = document.createElement('div');
    username.className = 'assignee-username';
    username.textContent = `@${assignee.username}`;
    username.style.fontSize = '12px';
    username.style.color = '#666';
    nameContainer.appendChild(displayName);
    nameContainer.appendChild(username);
    info.appendChild(nameContainer);
    const buttons = document.createElement('div');
    const removeButton = document.createElement('button');
    removeButton.textContent = 'Remove';
    removeButton.style.padding = '5px 10px';
    removeButton.style.backgroundColor = '#dc3545';
    removeButton.style.color = 'white';
    removeButton.style.border = 'none';
    removeButton.style.borderRadius = '4px';
    removeButton.style.cursor = 'pointer';
    removeButton.style.fontSize = '12px';
    removeButton.onclick = () => {
      let assignees = [];
      if (this.assigneeManager) {
        this.assigneeManager.removeAssignee(assignee.username);
        assignees = this.assigneeManager.getAssigneeWhitelist();
      } else {
        assignees = getAssigneeWhitelist();
        const filteredAssignees = assignees.filter(a => a.username.toLowerCase() !== assignee.username.toLowerCase());
        saveAssigneeWhitelist(filteredAssignees);
        assignees = filteredAssignees;
      }
      item.remove();
      if (assignees.length === 0) {
        listContainer.appendChild(createEmptyMessage());
      }
      this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);
      if (this.onSettingsChanged) {
        this.onSettingsChanged('assignees');
      }
    };
    buttons.appendChild(removeButton);
    item.appendChild(info);
    item.appendChild(buttons);
    return item;
  }
  createLabelWhitelistSettings(container) {
    const whitelistSection = document.createElement('div');
    whitelistSection.style.marginBottom = '20px';
    const whitelistTitle = document.createElement('h4');
    whitelistTitle.textContent = 'Label Whitelist';
    whitelistTitle.style.marginBottom = '10px';
    const whitelistDescription = document.createElement('p');
    whitelistDescription.textContent = 'Select which labels should appear in the dropdown. The system will show any label that contains these terms.';
    whitelistDescription.style.marginBottom = '15px';
    whitelistDescription.style.fontSize = '14px';
    whitelistDescription.style.color = '#666';
    whitelistSection.appendChild(whitelistTitle);
    whitelistSection.appendChild(whitelistDescription);
    const loadingMessage = document.createElement('div');
    loadingMessage.id = 'whitelist-loading-message';
    loadingMessage.textContent = 'Loading all labels from GitLab...';
    loadingMessage.style.fontStyle = 'italic';
    loadingMessage.style.color = '#666';
    whitelistSection.appendChild(loadingMessage);
    const whitelistContainer = document.createElement('div');
    whitelistContainer.id = 'whitelist-container';
    whitelistContainer.style.display = 'flex';
    whitelistContainer.style.flexWrap = 'wrap';
    whitelistContainer.style.gap = '10px';
    whitelistContainer.style.marginTop = '15px';
    whitelistContainer.style.height = '300px';
    whitelistContainer.style.overflowY = 'auto';
    whitelistContainer.style.border = '1px solid #eee';
    whitelistContainer.style.borderRadius = '4px';
    whitelistContainer.style.padding = '10px';
    whitelistSection.appendChild(whitelistContainer);
    const currentWhitelist = getLabelWhitelist();
    const safeWhitelist = Array.isArray(currentWhitelist) ? currentWhitelist : [];
    const fetchAndDisplayAllLabels = async () => {
      try {
        if (!this.gitlabApi) {
          throw new Error('GitLab API not available');
        }
        const pathInfo = getPathFromUrl();
        if (!pathInfo || !pathInfo.apiUrl) {
          throw new Error('Could not determine project/group path');
        }
        const allLabels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
          params: {
            per_page: 100
          }
        });
        displayLabels(allLabels);
      } catch (error) {
        console.error('Error fetching ALL labels:', error);
        loadingMessage.textContent = 'Error loading labels. ' + error.message;
        loadingMessage.style.color = '#dc3545';
      }
    };
    const displayLabels = labels => {
      loadingMessage.remove();
      if (!labels || labels.length === 0) {
        const noLabelsMessage = document.createElement('div');
        noLabelsMessage.textContent = 'No labels found in this project.';
        noLabelsMessage.style.width = '100%';
        noLabelsMessage.style.textAlign = 'center';
        noLabelsMessage.style.marginBottom = '15px';
        noLabelsMessage.style.color = '#666';
        whitelistContainer.appendChild(noLabelsMessage);
        return;
      }
      labels.sort((a, b) => a.name.localeCompare(b.name));
      const seenLabels = new Set();
      labels.forEach(label => {
        if (seenLabels.has(label.name.toLowerCase())) return;
        seenLabels.add(label.name.toLowerCase());
        const checkboxContainer = document.createElement('div');
        checkboxContainer.style.display = 'flex';
        checkboxContainer.style.alignItems = 'center';
        checkboxContainer.style.marginBottom = '10px';
        checkboxContainer.style.width = 'calc(33.33% - 10px)';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `label-${label.name}`;
        checkbox.dataset.label = label.name.toLowerCase();
        checkbox.style.marginRight = '8px';
        const isWhitelisted = safeWhitelist.some(term => label.name.toLowerCase().includes(term.toLowerCase()));
        checkbox.checked = isWhitelisted;
        const labelElement = this.createGitLabStyleLabel(label);
        labelElement.style.cursor = 'pointer';
        labelElement.onclick = () => {
          checkbox.checked = !checkbox.checked;
          this.autoSaveWhitelist(whitelistContainer);
        };
        checkbox.addEventListener('change', () => {
          this.autoSaveWhitelist(whitelistContainer);
        });
        checkboxContainer.appendChild(checkbox);
        checkboxContainer.appendChild(labelElement);
        whitelistContainer.appendChild(checkboxContainer);
      });
    };
    fetchAndDisplayAllLabels();
    container.appendChild(whitelistSection);
  }
  refreshAssigneeList(container) {
    if (!container) return;
    const loadingIndicator = document.createElement('div');
    loadingIndicator.textContent = 'Refreshing assignees...';
    loadingIndicator.style.padding = '15px';
    loadingIndicator.style.textAlign = 'center';
    loadingIndicator.style.color = '#666';
    container.innerHTML = '';
    container.appendChild(loadingIndicator);
    const createEmptyMessage = () => {
      const emptyMessage = document.createElement('div');
      emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
      emptyMessage.style.padding = '15px';
      emptyMessage.style.color = '#666';
      emptyMessage.style.fontStyle = 'italic';
      emptyMessage.style.textAlign = 'center';
      return emptyMessage;
    };
    setTimeout(() => {
      let assignees = [];
      if (this.assigneeManager) {
        assignees = this.assigneeManager.getAssigneeWhitelist();
      } else {
        assignees = getAssigneeWhitelist();
      }
      container.innerHTML = '';
      if (assignees.length > 0) {
        assignees.forEach((assignee, index) => {
          container.appendChild(this.createAssigneeListItem(assignee, index, container, createEmptyMessage));
        });
      } else {
        container.appendChild(createEmptyMessage());
      }
    }, 300);
  }
  createAppearanceSettings(container) {
    const appearanceSection = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = 'Appearance Settings';
    title.style.marginBottom = '10px';
    const description = document.createElement('p');
    description.textContent = 'Customize the appearance of the GitLab Sprint Helper.';
    description.style.marginBottom = '15px';
    description.style.fontSize = '14px';
    description.style.color = '#666';
    appearanceSection.appendChild(title);
    appearanceSection.appendChild(description);
    const comingSoon = document.createElement('div');
    comingSoon.style.padding = '20px';
    comingSoon.style.textAlign = 'center';
    comingSoon.style.backgroundColor = '#f8f9fa';
    comingSoon.style.borderRadius = '4px';
    comingSoon.style.color = '#666';
    comingSoon.textContent = 'Appearance settings coming soon!';
    appearanceSection.appendChild(comingSoon);
    container.appendChild(appearanceSection);
  }
  createGitLabStyleLabel(label) {
    const labelElement = document.createElement('span');
    labelElement.textContent = label.name;
    const bgColor = label.color || generateColorFromString(label.name);
    const textColor = getContrastColor(bgColor);
    labelElement.style.backgroundColor = bgColor;
    labelElement.style.color = textColor;
    labelElement.style.padding = '4px 8px';
    labelElement.style.borderRadius = '100px';
    labelElement.style.fontSize = '12px';
    labelElement.style.fontWeight = '500';
    labelElement.style.display = 'inline-block';
    labelElement.style.margin = '2px';
    labelElement.style.maxWidth = '100%';
    labelElement.style.overflow = 'hidden';
    labelElement.style.textOverflow = 'ellipsis';
    labelElement.style.whiteSpace = 'nowrap';
    return labelElement;
  }
  resetLabelWhitelist() {
    resetLabelWhitelist();
    if (this.labelManager) {
      this.labelManager.resetToDefaultWhitelist();
    }
    if (this.onSettingsChanged) {
      this.onSettingsChanged('labels');
    }
  }
  resetAllSettings() {
    this.resetLabelWhitelist();
    saveAssigneeWhitelist([]);
    const defaultShortcut = DEFAULT_SETTINGS.toggleShortcut;
    saveToggleShortcut(defaultShortcut);
    if (window.uiManager && typeof window.uiManager.updateKeyboardShortcut === 'function') {
      window.uiManager.updateKeyboardShortcut(defaultShortcut);
    } else if (this.uiManager && typeof this.uiManager.updateKeyboardShortcut === 'function') {
      this.uiManager.updateKeyboardShortcut(defaultShortcut);
    }
    if (this.onSettingsChanged) {
      this.onSettingsChanged('all');
    }
  }
  autoSaveWhitelist(container) {
    const newWhitelist = [];
    const addedTerms = new Set();
    const checkboxes = container.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
      if (checkbox.checked) {
        const term = checkbox.dataset.label.toLowerCase();
        if (!addedTerms.has(term)) {
          newWhitelist.push(term);
          addedTerms.add(term);
        }
      }
    });
    saveLabelWhitelist(newWhitelist);
    if (this.labelManager) {
      this.labelManager.saveWhitelist(newWhitelist);
    }
    if (this.notification) {
      this.notification.success(`Label whitelist updated`);
    }
    if (this.onSettingsChanged) {
      this.onSettingsChanged('labels');
    }
  }
  createGeneralSettings(container) {
    const generalSection = document.createElement('div');
    const title = document.createElement('h4');
    title.textContent = 'General Settings';
    title.style.marginBottom = '10px';
    const description = document.createElement('p');
    description.textContent = 'Configure general behavior of the GitLab Sprint Helper.';
    description.style.marginBottom = '15px';
    description.style.fontSize = '14px';
    description.style.color = '#666';
    generalSection.appendChild(title);
    generalSection.appendChild(description);
    const shortcutSection = document.createElement('div');
    shortcutSection.style.marginBottom = '20px';
    shortcutSection.style.padding = '15px';
    shortcutSection.style.backgroundColor = '#f8f9fa';
    shortcutSection.style.borderRadius = '4px';
    const shortcutTitle = document.createElement('h5');
    shortcutTitle.textContent = 'Toggle Visibility Shortcut';
    shortcutTitle.style.marginTop = '0';
    shortcutTitle.style.marginBottom = '10px';
    shortcutTitle.style.fontSize = '16px';
    const shortcutDescription = document.createElement('p');
    shortcutDescription.textContent = 'Set a keyboard shortcut to toggle the visibility of GitLab Sprint Helper. The shortcut will only work when not typing in an input field.';
    shortcutDescription.style.marginBottom = '15px';
    shortcutDescription.style.fontSize = '14px';
    shortcutDescription.style.color = '#666';
    const shortcutInputContainer = document.createElement('div');
    shortcutInputContainer.style.display = 'flex';
    shortcutInputContainer.style.alignItems = 'center';
    shortcutInputContainer.style.gap = '10px';
    const shortcutLabel = document.createElement('label');
    shortcutLabel.textContent = 'Shortcut Key:';
    shortcutLabel.style.fontWeight = 'bold';
    shortcutLabel.style.minWidth = '100px';
    const shortcutInput = document.createElement('input');
    shortcutInput.type = 'text';
    shortcutInput.maxLength = 1;
    shortcutInput.style.padding = '8px';
    shortcutInput.style.width = '60px';
    shortcutInput.style.textAlign = 'center';
    shortcutInput.style.fontSize = '16px';
    shortcutInput.style.border = '1px solid #ccc';
    shortcutInput.style.borderRadius = '4px';
    const currentShortcut = getToggleShortcut();
    shortcutInput.value = currentShortcut;
    const shortcutPreview = document.createElement('div');
    shortcutPreview.style.marginLeft = '10px';
    shortcutPreview.style.color = '#666';
    shortcutPreview.textContent = `Current: Press '${currentShortcut}' to toggle`;
    shortcutInput.addEventListener('input', () => {
      if (shortcutInput.value.length === 0) return;
      const newShortcut = shortcutInput.value.charAt(0).toLowerCase();
      if (newShortcut) {
        saveToggleShortcut(newShortcut);
        shortcutPreview.textContent = `Current: Press '${newShortcut}' to toggle`;
        this.notification.success(`Shortcut changed to '${newShortcut}'`);
        if (window.uiManager && typeof window.uiManager.updateKeyboardShortcut === 'function') {
          window.uiManager.updateKeyboardShortcut(newShortcut);
        } else if (this.uiManager && typeof this.uiManager.updateKeyboardShortcut === 'function') {
          this.uiManager.updateKeyboardShortcut(newShortcut);
        }
        if (this.onSettingsChanged) {
          this.onSettingsChanged('general');
        }
      }
    });
    shortcutInput.addEventListener('keyup', () => {
      shortcutInput.value = shortcutInput.value.toLowerCase();
    });
    shortcutInputContainer.appendChild(shortcutLabel);
    shortcutInputContainer.appendChild(shortcutInput);
    shortcutInputContainer.appendChild(shortcutPreview);
    shortcutSection.appendChild(shortcutTitle);
    shortcutSection.appendChild(shortcutDescription);
    shortcutSection.appendChild(shortcutInputContainer);
    generalSection.appendChild(shortcutSection);
    const resetSection = document.createElement('div');
    resetSection.style.marginTop = '20px';
    resetSection.style.padding = '15px';
    resetSection.style.backgroundColor = '#fff0f0';
    resetSection.style.borderRadius = '4px';
    resetSection.style.border = '1px solid #ffcccc';
    const resetTitle = document.createElement('h5');
    resetTitle.textContent = 'Data Management';
    resetTitle.style.marginTop = '0';
    resetTitle.style.marginBottom = '10px';
    resetTitle.style.fontSize = '16px';
    resetTitle.style.color = '#dc3545';
    const resetDescription = document.createElement('p');
    resetDescription.textContent = 'Reset various data stored by GitLab Sprint Helper. Warning: These actions cannot be undone!';
    resetDescription.style.marginBottom = '15px';
    resetDescription.style.fontSize = '14px';
    resetDescription.style.color = '#666';
    const resetButtonsContainer = document.createElement('div');
    resetButtonsContainer.style.display = 'flex';
    resetButtonsContainer.style.gap = '10px';
    resetButtonsContainer.style.flexWrap = 'wrap';
    const resetAllButton = document.createElement('button');
    resetAllButton.textContent = 'Reset All Data';
    resetAllButton.style.backgroundColor = '#dc3545';
    resetAllButton.style.color = 'white';
    resetAllButton.style.border = 'none';
    resetAllButton.style.borderRadius = '4px';
    resetAllButton.style.padding = '8px 16px';
    resetAllButton.style.cursor = 'pointer';
    resetAllButton.style.fontWeight = 'bold';
    resetAllButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset ALL data? This will remove all settings, history, and sprint data. This action cannot be undone!')) {
        this.resetAllSettings();
        if (window.historyManager && typeof window.historyManager.clearAllHistory === 'function') {
          window.historyManager.clearAllHistory();
        }
        localStorage.removeItem('gitLabHelperSprintState');
        localStorage.removeItem('gitLabHelperSprintHistory');
        this.notification.success('All data has been reset');
        if (this.currentModal) {
          this.currentModal.remove();
          this.currentModal = null;
        }
      }
    });
    const resetHistoryButton = document.createElement('button');
    resetHistoryButton.textContent = 'Reset History';
    resetHistoryButton.style.backgroundColor = '#dc3545';
    resetHistoryButton.style.color = 'white';
    resetHistoryButton.style.border = 'none';
    resetHistoryButton.style.borderRadius = '4px';
    resetHistoryButton.style.padding = '8px 16px';
    resetHistoryButton.style.cursor = 'pointer';
    resetHistoryButton.style.fontWeight = 'bold';
    resetHistoryButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset all history data? This action cannot be undone!')) {
        if (window.historyManager && typeof window.historyManager.clearAllHistory === 'function') {
          window.historyManager.clearAllHistory();
          this.notification.success('History data has been reset');
        } else {
          this.notification.error('History manager not available');
        }
      }
    });
    const resetSprintButton = document.createElement('button');
    resetSprintButton.textContent = 'Reset Current Sprint';
    resetSprintButton.style.backgroundColor = '#dc3545';
    resetSprintButton.style.color = 'white';
    resetSprintButton.style.border = 'none';
    resetSprintButton.style.borderRadius = '4px';
    resetSprintButton.style.padding = '8px 16px';
    resetSprintButton.style.cursor = 'pointer';
    resetSprintButton.style.fontWeight = 'bold';
    resetSprintButton.addEventListener('click', () => {
      if (confirm('Are you sure you want to reset the current sprint data? This action cannot be undone!')) {
        localStorage.removeItem('gitLabHelperSprintState');
        this.notification.success('Current sprint data has been reset');
        if (window.uiManager && window.uiManager.tabManager && window.uiManager.tabManager.currentTab === 'sprintmanagement' && window.uiManager.sprintManagementView) {
          window.uiManager.sprintManagementView.render();
        }
      }
    });
    resetButtonsContainer.appendChild(resetAllButton);
    resetButtonsContainer.appendChild(resetHistoryButton);
    resetButtonsContainer.appendChild(resetSprintButton);
    resetSection.appendChild(resetTitle);
    resetSection.appendChild(resetDescription);
    resetSection.appendChild(resetButtonsContainer);
    generalSection.appendChild(resetSection);
    container.appendChild(generalSection);
  }
}
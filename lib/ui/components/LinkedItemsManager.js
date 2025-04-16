export default class LinkedItemsManager {
  constructor(options = {}) {
    this.initialized = false;
    this.dropdowns = [];
    this.cardLinks = new Map();
    this.uiManager = options.uiManager || window.uiManager;
    this.gitlabApi = options.gitlabApi || window.gitlabApi;
    this.cache = {
      issues: new Map(),
      mergeRequests: new Map(),
      relatedIssues: new Map()
    };
    this.loadCacheFromLocalStorage();
    this.handleScroll = this.handleScroll.bind(this);
    this.handleResize = this.handleResize.bind(this);
    this.refreshDropdowns = this.refreshDropdowns.bind(this);
    window.addEventListener('scroll', this.handleScroll);
    window.addEventListener('resize', this.handleResize);
    this.setupMutationObserver();
    this.checkEnabled();
  }
  checkEnabled() {
    try {
      const enabled = localStorage.getItem('gitLabHelperLinkedItemsEnabled');
      if (enabled === null) {
        return true;
      }
      return enabled === 'true';
    } catch (e) {
      console.error('Error checking linked items enabled state:', e);
      return true;
    }
  }
  loadCacheFromLocalStorage() {
    try {
      const savedCache = localStorage.getItem('gitlabHelperLinkedItemsCache');
      if (savedCache) {
        const cacheData = JSON.parse(savedCache);
        if (cacheData.timestamp && Date.now() - cacheData.timestamp < 8 * 60 * 60 * 1000) {
          if (cacheData.issues) {
            Object.entries(cacheData.issues).forEach(([key, items]) => {
              this.cache.issues.set(key, items);
            });
          }
          if (cacheData.mergeRequests) {
            Object.entries(cacheData.mergeRequests).forEach(([key, items]) => {
              this.cache.mergeRequests.set(key, items);
            });
          }
          if (cacheData.relatedIssues) {
            Object.entries(cacheData.relatedIssues).forEach(([key, items]) => {
              this.cache.relatedIssues.set(key, items);
            });
          }
        } else {
          localStorage.removeItem('gitlabHelperLinkedItemsCache');
        }
      }
    } catch (error) {
      console.warn('Error loading cache from localStorage:', error);
      localStorage.removeItem('gitlabHelperLinkedItemsCache');
    }
  }
  saveCacheToLocalStorage() {
    try {
      const cacheObject = {
        issues: {},
        mergeRequests: {},
        relatedIssues: {}
      };
      this.cache.issues.forEach((value, key) => {
        cacheObject.issues[key] = value;
      });
      this.cache.mergeRequests.forEach((value, key) => {
        cacheObject.mergeRequests[key] = value;
      });
      this.cache.relatedIssues.forEach((value, key) => {
        cacheObject.relatedIssues[key] = value;
      });
      const cacheData = {
        timestamp: Date.now(),
        issues: cacheObject.issues,
        mergeRequests: cacheObject.mergeRequests,
        relatedIssues: cacheObject.relatedIssues
      };
      localStorage.setItem('gitlabHelperLinkedItemsCache', JSON.stringify(cacheData));
    } catch (error) {
      console.warn('Error saving cache to localStorage:', error);
    }
  }
  initialize() {
    if (!this.checkEnabled()) {
      return;
    }
    if (this.initialized) {
      return;
    }
    this.initialized = true;
    this.applyOverflowFixes();
    this.createCardDropdowns();
    this.refreshInterval = setInterval(this.refreshDropdowns, 2000);
    this.setupCardsMutationObserver();
    this.cacheSaveInterval = setInterval(() => {
      this.saveCacheToLocalStorage();
    }, 60000);
  }
  applyOverflowFixes() {
    this.originalStyles = [];
    const ulElements = document.querySelectorAll('ul.board-list');
    ulElements.forEach(ul => {
      this.originalStyles.push({
        element: ul,
        property: 'overflow-x',
        value: ul.style.overflowX
      });
      ul.style.setProperty('overflow-x', 'unset', 'important');
      ul.style.setProperty('overflow-y', 'unset', 'important');
    });
    const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
    cardAreas.forEach(area => {
      this.originalStyles.push({
        element: area,
        property: 'overflow',
        value: area.style.overflow
      });
      this.originalStyles.push({
        element: area,
        property: 'position',
        value: area.style.position
      });
      area.style.overflow = 'auto';
      area.style.position = 'relative';
    });
    return cardAreas;
  }
  createCardDropdowns() {
    this.dropdowns.forEach(dropdown => {
      if (dropdown && dropdown.parentNode) {
        dropdown.parentNode.removeChild(dropdown);
      }
    });
    this.dropdowns = [];
    const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
    cardAreas.forEach(cardArea => {
      try {
        const cards = cardArea.querySelectorAll('.board-card');
        cards.forEach((card, index) => {
          try {
            const dropdown = this.createPlaceholderDropdown(card, cardArea);
            if (dropdown) {
              this.dropdowns.push(dropdown);
              this.fetchAndUpdateDropdown(dropdown, card);
            }
          } catch (error) {
            console.error('Error creating dropdown for card:', error);
          }
        });
      } catch (error) {
        console.error('Error processing card area:', error);
      }
    });
  }
  async fetchAndUpdateDropdown(dropdown, card) {
    try {
      if (!dropdown || !card) return;
      const issueItem = await this.getIssueItemFromCard(card);
      if (!issueItem) return;
      const projectPath = this.extractRepositoryPath(issueItem.referencePath || window.location.pathname);
      const issueIid = issueItem.iid ? issueItem.iid.toString().split('#').pop() : null;
      const cacheKey = issueIid ? `${projectPath}/${issueIid}` : null;
      if (cacheKey && this.cache.issues.has(cacheKey)) {
        const cachedItems = this.cache.issues.get(cacheKey);
        const cardId = dropdown.dataset.cardId;
        this.cardLinks.set(cardId, cachedItems);
        dropdown.isLoading = false;
        this.updateDropdownWithLinkedItems(dropdown, cachedItems);
        return;
      }
      const initialLinkedItems = [];
      const baseUrl = window.location.origin;
      this.addLinkedItemsFromProps(issueItem, initialLinkedItems, baseUrl, projectPath);
      if (initialLinkedItems.length > 0) {
        const cardId = dropdown.dataset.cardId;
        this.cardLinks.set(cardId, initialLinkedItems);
        dropdown.isLoading = false;
        this.updateDropdownWithLinkedItems(dropdown, initialLinkedItems);
      }
      const linkedItems = await this.getLinkedItemsFromIssue(issueItem);
      const cardId = dropdown.dataset.cardId;
      this.cardLinks.set(cardId, linkedItems);
      dropdown.isLoading = false;
      this.updateDropdownWithLinkedItems(dropdown, linkedItems);
    } catch (error) {
      console.error('Error fetching and updating dropdown:', error);
      this.updateDropdownWithError(dropdown);
    }
  }
  updateDropdownEmpty(dropdown) {
    const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
    const dropdownContent = dropdown.querySelector('.linked-items-content');
    if (!dropdownToggle || !dropdownContent) return;
    dropdownToggle.style.backgroundColor = '#6c757d';
    dropdownToggle.title = 'No linked items found';
    dropdownContent.innerHTML = '';
    const emptyMessage = document.createElement('div');
    emptyMessage.textContent = 'No linked items found';
    emptyMessage.style.padding = '10px 12px';
    emptyMessage.style.color = '#666';
    emptyMessage.style.fontStyle = 'italic';
    emptyMessage.style.fontSize = '13px';
    emptyMessage.style.textAlign = 'center';
    dropdownContent.appendChild(emptyMessage);
    const card = dropdown.originalCard;
    const issueItem = this.getIssueItemFromCard(card);
    if (issueItem && issueItem.iid) {
      const projectPath = this.extractRepositoryPath(window.location.pathname);
      const baseUrl = window.location.origin;
      const viewIssueItem = {
        type: 'issue_detail',
        title: 'View Issue Details',
        url: `${baseUrl}/${projectPath}/-/issues/${issueItem.iid}`
      };
      dropdownContent.appendChild(document.createElement('hr'));
      dropdownContent.appendChild(this.createLinkItem(viewIssueItem));
    }
  }
  updateDropdownWithError(dropdown) {
    const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
    const dropdownContent = dropdown.querySelector('.linked-items-content');
    if (!dropdownToggle || !dropdownContent) return;
    dropdownToggle.style.backgroundColor = '#dc3545';
    dropdownToggle.title = 'Error loading linked items';
    dropdownContent.innerHTML = '';
    const errorMessage = document.createElement('div');
    errorMessage.textContent = 'Error loading linked items';
    errorMessage.style.padding = '10px 12px';
    errorMessage.style.color = '#dc3545';
    errorMessage.style.fontStyle = 'italic';
    errorMessage.style.fontSize = '13px';
    errorMessage.style.textAlign = 'center';
    dropdownContent.appendChild(errorMessage);
  }
  updateDropdownWithLinkedItems(dropdown, linkedItems) {
    if (!linkedItems || linkedItems.length === 0) {
      this.updateDropdownEmpty(dropdown);
      return;
    }
    const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
    const dropdownContent = dropdown.querySelector('.linked-items-content');
    if (!dropdownToggle || !dropdownContent) return;
    dropdownToggle.title = `${linkedItems.length} linked item${linkedItems.length !== 1 ? 's' : ''}`;
    const mrCount = linkedItems.filter(item => item.type === 'merge_request').length;
    const branchCount = linkedItems.filter(item => item.type === 'branch').length;
    const issueCount = linkedItems.filter(item => item.type === 'issue').length;
    if (mrCount > 0 || branchCount > 0) {
      dropdownToggle.title = `${mrCount ? mrCount + ' MR' + (mrCount > 1 ? 's' : '') : ''}${mrCount && branchCount ? ', ' : ''}${branchCount ? branchCount + ' branch' + (branchCount > 1 ? 'es' : '') : ''}${issueCount ? (mrCount || branchCount ? ', ' : '') + issueCount + ' issue' + (issueCount > 1 ? 's' : '') : ''}`;
    }
    dropdownContent.innerHTML = '';
    const groupedItems = {
      merge_request: [],
      branch: [],
      issue: [],
      other: []
    };
    linkedItems.forEach(item => {
      if (groupedItems[item.type]) {
        groupedItems[item.type].push(item);
      } else {
        groupedItems.other.push(item);
      }
    });
    const createSectionHeader = title => {
      const header = document.createElement('div');
      header.style.backgroundColor = '#f8f9fa';
      header.style.padding = '5px 12px';
      header.style.fontSize = '11px';
      header.style.fontWeight = 'bold';
      header.style.color = '#6c757d';
      header.style.textTransform = 'uppercase';
      header.style.borderBottom = '1px solid #eee';
      header.textContent = title;
      return header;
    };
    if (groupedItems.merge_request.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Merge Requests'));
      groupedItems.merge_request.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    if (groupedItems.branch.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Branches'));
      groupedItems.branch.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    if (groupedItems.issue.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Related Issues'));
      groupedItems.issue.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    if (groupedItems.other.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Actions'));
      groupedItems.other.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
  }
  createPlaceholderDropdown(card, cardArea) {
    const cardId = card.id || `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dropdown = document.createElement('div');
    dropdown.className = 'linked-items-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.zIndex = '99';
    dropdown.style.cursor = 'pointer';
    dropdown.style.transition = 'all 0.2s ease';
    dropdown.dataset.cardId = cardId;
    dropdown.originalCard = card;
    dropdown.isLoading = true;
    this.positionDropdown(dropdown, card, cardArea);
    const dropdownToggle = document.createElement('div');
    dropdownToggle.className = 'linked-items-toggle';
    dropdownToggle.style.backgroundColor = '#1f75cb';
    dropdownToggle.style.color = 'white';
    dropdownToggle.style.borderRadius = '50%';
    dropdownToggle.style.width = '22px';
    dropdownToggle.style.height = '22px';
    dropdownToggle.style.display = 'flex';
    dropdownToggle.style.alignItems = 'center';
    dropdownToggle.style.justifyContent = 'center';
    dropdownToggle.style.fontSize = '12px';
    dropdownToggle.style.fontWeight = 'bold';
    dropdownToggle.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
    dropdownToggle.style.border = '2px solid white';
    dropdownToggle.title = 'Loading linked items...';
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('role', 'img');
    svgIcon.setAttribute('aria-hidden', 'true');
    svgIcon.classList.add('gl-icon');
    svgIcon.style.width = '12px';
    svgIcon.style.height = '12px';
    svgIcon.style.fill = 'white';
    const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    useElement.setAttribute('href', '/assets/icons-aa2c8ddf99d22b77153ca2bb092a23889c12c597fc8b8de94b0f730eb53513f6.svg#issue-type-issue');
    svgIcon.appendChild(useElement);
    dropdownToggle.appendChild(svgIcon);
    dropdownToggle.addEventListener('mouseenter', function () {
      this.style.backgroundColor = '#0056b3';
      this.style.transform = 'scale(1.1)';
    });
    dropdownToggle.addEventListener('mouseleave', function () {
      this.style.backgroundColor = '#1f75cb';
      this.style.transform = 'scale(1)';
    });
    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'linked-items-content';
    dropdownContent.style.display = 'none';
    dropdownContent.style.position = 'absolute';
    dropdownContent.style.backgroundColor = 'white';
    dropdownContent.style.minWidth = '200px';
    dropdownContent.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
    dropdownContent.style.zIndex = '100';
    dropdownContent.style.borderRadius = '4px';
    dropdownContent.style.border = '1px solid #ddd';
    dropdownContent.style.left = '0';
    dropdownContent.style.top = '30px';
    const loadingItem = document.createElement('div');
    loadingItem.textContent = 'Loading linked items...';
    loadingItem.style.padding = '10px 12px';
    loadingItem.style.color = '#666';
    loadingItem.style.fontStyle = 'italic';
    loadingItem.style.fontSize = '13px';
    loadingItem.style.textAlign = 'center';
    dropdownContent.appendChild(loadingItem);
    dropdownToggle.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.linked-items-content').forEach(content => {
        if (content !== dropdownContent) {
          content.style.display = 'none';
          const parentDropdown = content.closest('.linked-items-dropdown');
          if (parentDropdown) {
            parentDropdown.style.zIndex = '99';
          }
        }
      });
      const isCurrentlyOpen = dropdownContent.style.display === 'block';
      if (!isCurrentlyOpen) {
        dropdown.style.zIndex = '100';
        dropdownContent.style.display = 'block';
      } else {
        dropdown.style.zIndex = '99';
        dropdownContent.style.display = 'none';
      }
    });
    document.addEventListener('click', () => {
      if (dropdownContent.style.display === 'block') {
        dropdownContent.style.display = 'none';
        dropdown.style.zIndex = '99';
      }
    });
    dropdown.appendChild(dropdownToggle);
    dropdown.appendChild(dropdownContent);
    cardArea.appendChild(dropdown);
    return dropdown;
  }
  getIssueItemFromCard(boardCard) {
    try {
      if (boardCard.__vue__) {
        if (boardCard.__vue__.$children && boardCard.__vue__.$children.length > 0) {
          const issueComponent = boardCard.__vue__.$children.find(child => child.$props && child.$props.item);
          if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
            return issueComponent.$props.item;
          }
        }
        if (boardCard.__vue__.$options && boardCard.__vue__.$options.children && boardCard.__vue__.$options.children.length > 0) {
          const issueComponent = boardCard.__vue__.$options.children.find(child => child.$props && child.$props.item);
          if (issueComponent && issueComponent.$props && issueComponent.$props.item) {
            return issueComponent.$props.item;
          }
        }
        if (boardCard.__vue__.$props && boardCard.__vue__.$props.item) {
          return boardCard.__vue__.$props.item;
        }
      }
      const issueId = boardCard.querySelector('[data-issue-id]')?.dataset?.issueId;
      const titleElement = boardCard.querySelector('.board-card-title');
      if (issueId && titleElement) {
        return {
          iid: issueId,
          title: titleElement.textContent.trim(),
          referencePath: window.location.pathname.split('/boards')[0]
        };
      }
    } catch (e) {
      console.error('Error getting issue item from card:', e);
    }
    return null;
  }
  async getLinkedItemsFromIssue(issueItem) {
    const linkedItems = [];
    try {
      let projectPath = this.extractRepositoryPath(issueItem.referencePath || window.location.pathname);
      const baseUrl = window.location.origin;
      if (issueItem.iid) {
        let issueIid = issueItem.iid;
        if (typeof issueIid === 'string' && issueIid.includes('#')) {
          issueIid = issueIid.split('#').pop();
        }
        if (projectPath.includes('#')) {
          projectPath = projectPath.split('#')[0];
        }
        const cacheKey = `${projectPath}/${issueIid}`;
        if (this.cache.issues.has(cacheKey)) {
          return this.cache.issues.get(cacheKey);
        }
        this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
        const gitlabApi = window.gitlabApi || this.uiManager?.gitlabApi;
        if (gitlabApi && typeof gitlabApi.callGitLabApiWithCache === 'function') {
          try {
            const encodedPath = encodeURIComponent(projectPath);
            try {
              const relatedMRs = await gitlabApi.callGitLabApiWithCache(`projects/${encodedPath}/issues/${issueIid}/related_merge_requests`, {}, 60000);
              if (Array.isArray(relatedMRs) && relatedMRs.length > 0) {
                for (let i = linkedItems.length - 1; i >= 0; i--) {
                  if (linkedItems[i].type === 'merge_request') {
                    linkedItems.splice(i, 1);
                  }
                }
                relatedMRs.forEach(mr => {
                  linkedItems.push({
                    type: 'merge_request',
                    title: mr.title || `Merge Request !${mr.iid}`,
                    state: mr.state,
                    url: mr.web_url || `${baseUrl}/${projectPath}/-/merge_requests/${mr.iid}`
                  });
                });
                this.cache.mergeRequests.set(cacheKey, [...relatedMRs]);
              }
            } catch (mrError) {
              console.warn('Error fetching related merge requests:', mrError);
            }
            try {
              const relatedIssues = await gitlabApi.callGitLabApiWithCache(`projects/${encodedPath}/issues/${issueIid}/links`, {}, 60000);
              if (Array.isArray(relatedIssues)) {
                for (let i = linkedItems.length - 1; i >= 0; i--) {
                  if (linkedItems[i].type === 'issue') {
                    linkedItems.splice(i, 1);
                  }
                }
                relatedIssues.forEach(related => {
                  linkedItems.push({
                    type: 'issue',
                    title: related.title || `Issue #${related.iid}`,
                    state: related.state,
                    url: related.web_url || `${baseUrl}/${projectPath}/-/issues/${related.iid}`
                  });
                });
                this.cache.relatedIssues.set(cacheKey, [...relatedIssues]);
              }
            } catch (linkError) {
              console.warn('Error fetching related issues:', linkError);
            }
          } catch (apiError) {
            console.warn('Error fetching issue details via API:', apiError);
            if (linkedItems.length === 0) {
              this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
            }
          }
        } else {
          if (linkedItems.length === 0) {
            this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
          }
        }
      } else {
        this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
      }
      if (issueItem.iid) {
        let issueIid = issueItem.iid;
        if (typeof issueIid === 'string' && issueIid.includes('#')) {
          issueIid = issueIid.split('#').pop();
        }
        const hasIssueLink = linkedItems.some(item => item.type === 'issue_detail');
        if (!hasIssueLink) {
          linkedItems.push({
            type: 'issue_detail',
            title: 'View Issue Details',
            url: `${baseUrl}/${projectPath}/-/issues/${issueIid}`
          });
        }
      }
      if (issueItem.iid) {
        const cacheKey = `${projectPath}/${issueItem.iid.toString().split('#').pop()}`;
        this.cache.issues.set(cacheKey, [...linkedItems]);
        if (Math.random() < 0.1) {
          this.saveCacheToLocalStorage();
        }
      }
    } catch (e) {
      console.error('Error extracting linked items:', e);
    }
    return linkedItems;
  }
  createDropdownForCard(card, issueItem, cardArea) {
    const cardId = card.id || `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const dropdown = document.createElement('div');
    dropdown.className = 'linked-items-dropdown';
    dropdown.style.position = 'absolute';
    dropdown.style.zIndex = '99';
    dropdown.style.cursor = 'pointer';
    dropdown.style.transition = 'all 0.2s ease';
    dropdown.dataset.cardId = cardId;
    dropdown.originalCard = card;
    this.positionDropdown(dropdown, card, cardArea);
    const linkedItems = this.getLinkedItemsFromIssue(issueItem);
    this.cardLinks.set(cardId, linkedItems);
    if (linkedItems.length === 0) {
      return null;
    }
    const dropdownToggle = document.createElement('div');
    dropdownToggle.className = 'linked-items-toggle';
    dropdownToggle.style.backgroundColor = '#1f75cb';
    dropdownToggle.style.color = 'white';
    dropdownToggle.style.borderRadius = '50%';
    dropdownToggle.style.width = '22px';
    dropdownToggle.style.height = '22px';
    dropdownToggle.style.display = 'flex';
    dropdownToggle.style.alignItems = 'center';
    dropdownToggle.style.justifyContent = 'center';
    dropdownToggle.style.fontSize = '12px';
    dropdownToggle.style.fontWeight = 'bold';
    dropdownToggle.style.boxShadow = '0 2px 5px rgba(0, 0, 0, 0.2)';
    dropdownToggle.style.border = '2px solid white';
    dropdownToggle.title = `${linkedItems.length} linked item${linkedItems.length !== 1 ? 's' : ''}`;
    const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svgIcon.setAttribute('role', 'img');
    svgIcon.setAttribute('aria-hidden', 'true');
    svgIcon.classList.add('gl-icon');
    svgIcon.style.width = '12px';
    svgIcon.style.height = '12px';
    svgIcon.style.fill = 'white';
    const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    useElement.setAttribute('href', '/assets/icons-aa2c8ddf99d22b77153ca2bb092a23889c12c597fc8b8de94b0f730eb53513f6.svg#issue-type-issue');
    svgIcon.appendChild(useElement);
    dropdownToggle.appendChild(svgIcon);
    const mrCount = linkedItems.filter(item => item.type === 'merge_request').length;
    const branchCount = linkedItems.filter(item => item.type === 'branch').length;
    const issueCount = linkedItems.filter(item => item.type === 'issue').length;
    if (mrCount > 0 || branchCount > 0) {
      dropdownToggle.title = `${mrCount ? mrCount + ' MR' + (mrCount > 1 ? 's' : '') : ''}${mrCount && branchCount ? ', ' : ''}${branchCount ? branchCount + ' branch' + (branchCount > 1 ? 'es' : '') : ''}${issueCount ? (mrCount || branchCount ? ', ' : '') + issueCount + ' issue' + (issueCount > 1 ? 's' : '') : ''}`;
    }
    dropdownToggle.addEventListener('mouseenter', function () {
      this.style.backgroundColor = '#0056b3';
      this.style.transform = 'scale(1.1)';
    });
    dropdownToggle.addEventListener('mouseleave', function () {
      this.style.backgroundColor = '#1f75cb';
      this.style.transform = 'scale(1)';
    });
    const dropdownContent = document.createElement('div');
    dropdownContent.className = 'linked-items-content';
    dropdownContent.style.display = 'none';
    dropdownContent.style.position = 'absolute';
    dropdownContent.style.backgroundColor = 'white';
    dropdownContent.style.minWidth = '200px';
    dropdownContent.style.boxShadow = '0 8px 16px rgba(0,0,0,0.2)';
    dropdownContent.style.zIndex = '100';
    dropdownContent.style.borderRadius = '4px';
    dropdownContent.style.border = '1px solid #ddd';
    dropdownContent.style.left = '0';
    dropdownContent.style.top = '30px';
    const groupedItems = {
      merge_request: [],
      branch: [],
      issue: [],
      other: []
    };
    linkedItems.forEach(item => {
      if (groupedItems[item.type]) {
        groupedItems[item.type].push(item);
      } else {
        groupedItems.other.push(item);
      }
    });
    const createSectionHeader = title => {
      const header = document.createElement('div');
      header.style.backgroundColor = '#f8f9fa';
      header.style.padding = '5px 12px';
      header.style.fontSize = '11px';
      header.style.fontWeight = 'bold';
      header.style.color = '#6c757d';
      header.style.textTransform = 'uppercase';
      header.style.borderBottom = '1px solid #eee';
      header.textContent = title;
      return header;
    };
    if (groupedItems.merge_request.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Merge Requests'));
      groupedItems.merge_request.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    if (groupedItems.branch.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Branches'));
      groupedItems.branch.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    if (groupedItems.issue.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Related Issues'));
      groupedItems.issue.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    if (groupedItems.other.length > 0) {
      dropdownContent.appendChild(createSectionHeader('Actions'));
      groupedItems.other.forEach(item => {
        dropdownContent.appendChild(this.createLinkItem(item));
      });
    }
    dropdownToggle.addEventListener('click', e => {
      e.stopPropagation();
      document.querySelectorAll('.linked-items-content').forEach(content => {
        if (content !== dropdownContent) {
          content.style.display = 'none';
          const parentDropdown = content.closest('.linked-items-dropdown');
          if (parentDropdown) {
            parentDropdown.style.zIndex = '99';
          }
        }
      });
      const isCurrentlyOpen = dropdownContent.style.display === 'block';
      if (!isCurrentlyOpen) {
        dropdown.style.zIndex = '100';
        dropdownContent.style.display = 'block';
      } else {
        dropdown.style.zIndex = '99';
        dropdownContent.style.display = 'none';
      }
      if (dropdownContent.style.display === 'block') {
        const rect = dropdownContent.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
          dropdownContent.style.right = 'auto';
          dropdownContent.style.left = `-${rect.width - dropdownToggle.offsetWidth}px`;
        }
      }
    });
    document.addEventListener('click', () => {
      if (dropdownContent.style.display === 'block') {
        dropdownContent.style.display = 'none';
        dropdown.style.zIndex = '99';
      }
    });
    dropdown.appendChild(dropdownToggle);
    dropdown.appendChild(dropdownContent);
    cardArea.appendChild(dropdown);
    return dropdown;
  }
  createLinkItem(item) {
    const link = document.createElement('a');
    link.href = item.url;
    link.target = '_blank';
    link.style.padding = '8px 12px';
    link.style.display = 'flex';
    link.style.alignItems = 'center';
    link.style.textDecoration = 'none';
    link.style.color = '#333';
    link.style.borderBottom = '1px solid #eee';
    const icon = document.createElement('span');
    switch (item.type) {
      case 'merge_request':
        icon.textContent = '🔀';
        icon.title = 'Merge Request';
        if (item.state) {
          if (item.state.toLowerCase() === 'merged') {
            icon.style.color = '#6f42c1';
          } else if (item.state.toLowerCase() === 'opened' || item.state.toLowerCase() === 'open') {
            icon.style.color = '#28a745';
          } else if (item.state.toLowerCase() === 'closed') {
            icon.style.color = '#dc3545';
          }
        }
        break;
      case 'branch':
        icon.textContent = '🌿';
        icon.title = 'Branch';
        icon.style.color = '#f9bc00';
        break;
      case 'issue':
        icon.textContent = '📝';
        icon.title = 'Issue';
        if (item.state) {
          if (item.state.toLowerCase() === 'closed') {
            icon.style.color = '#dc3545';
          } else if (item.state.toLowerCase() === 'opened' || item.state.toLowerCase() === 'open') {
            icon.style.color = '#28a745';
          }
        }
        break;
      case 'issue_detail':
        icon.textContent = '👁️';
        icon.title = 'View Issue';
        icon.style.color = '#17a2b8';
        break;
      default:
        icon.textContent = '🔗';
        icon.style.color = '#6c757d';
    }
    icon.style.marginRight = '8px';
    icon.style.fontSize = '16px';
    const text = document.createElement('span');
    text.textContent = this.truncateText(item.title, 30);
    text.style.flex = '1';
    text.style.overflow = 'hidden';
    text.style.textOverflow = 'ellipsis';
    text.style.whiteSpace = 'nowrap';
    if (item.state) {
      const status = document.createElement('span');
      status.style.borderRadius = '10px';
      status.style.padding = '2px 6px';
      status.style.fontSize = '10px';
      status.style.marginLeft = '4px';
      status.textContent = item.state;
      if (item.state.toLowerCase() === 'open' || item.state.toLowerCase() === 'opened') {
        status.style.backgroundColor = '#28a745';
        status.style.color = 'white';
      } else if (item.state.toLowerCase() === 'closed') {
        status.style.backgroundColor = '#dc3545';
        status.style.color = 'white';
      } else if (item.state.toLowerCase() === 'merged') {
        status.style.backgroundColor = '#6f42c1';
        status.style.color = 'white';
      }
      link.appendChild(status);
    }
    link.prepend(icon);
    link.appendChild(text);
    link.addEventListener('mouseenter', function () {
      this.style.backgroundColor = '#f8f9fa';
    });
    link.addEventListener('mouseleave', function () {
      this.style.backgroundColor = 'white';
    });
    return link;
  }
  positionDropdown(dropdown, card, cardArea) {
    try {
      const cardRect = card.getBoundingClientRect();
      const areaRect = cardArea.getBoundingClientRect();
      const top = cardRect.top - areaRect.top + cardArea.scrollTop;
      const left = cardRect.left - areaRect.left + cardArea.scrollLeft + 5 - 13;
      dropdown.style.top = `${top}px`;
      dropdown.style.left = `${left}px`;
    } catch (e) {
      console.error('Error positioning dropdown:', e);
    }
  }
  refreshDropdowns() {
    if (!this.initialized) {
      return;
    }
    this.repositionDropdowns();
    this.checkForNewCards();
  }
  repositionDropdowns() {
    this.dropdowns.forEach(dropdown => {
      if (dropdown && dropdown.className === 'linked-items-dropdown' && dropdown.originalCard) {
        const card = dropdown.originalCard;
        const container = dropdown.parentNode;
        if (card && container) {
          this.positionDropdown(dropdown, card, container);
        }
      }
    });
  }
  checkForNewCards() {
    const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
    let newCardsFound = false;
    cardAreas.forEach(cardArea => {
      const cards = cardArea.querySelectorAll('.board-card');
      cards.forEach(card => {
        const cardId = card.id || '';
        const hasDropdown = this.dropdowns.some(dropdown => dropdown.dataset.cardId === cardId || dropdown.originalCard === card);
        if (!hasDropdown) {
          try {
            const dropdown = this.createPlaceholderDropdown(card, cardArea);
            if (dropdown) {
              this.dropdowns.push(dropdown);
              newCardsFound = true;
              this.fetchAndUpdateDropdown(dropdown, card);
            }
          } catch (error) {
            console.error('Error creating dropdown for new card:', error);
          }
        }
      });
    });
    return newCardsFound;
  }
  truncateText(text, maxLength) {
    if (!text) return '';
    return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  }
  handleScroll() {
    this.repositionDropdowns();
  }
  handleResize() {
    this.repositionDropdowns();
  }
  setupMutationObserver() {
    if (this.boardObserver) {
      this.boardObserver.disconnect();
    }
    this.boardObserver = new MutationObserver(mutations => {
      let needsUpdate = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          const hasCardChanges = Array.from(mutation.addedNodes).some(node => node.classList && node.classList.contains('board-card'));
          if (hasCardChanges) {
            needsUpdate = true;
          }
        }
      });
      if (needsUpdate && this.initialized) {
        clearTimeout(this.updateTimeout);
        this.updateTimeout = setTimeout(() => {
          this.refreshDropdowns();
        }, 100);
      }
    });
    const boardContainers = document.querySelectorAll('.board-list, [data-testid="board-list"], .boards-list');
    boardContainers.forEach(container => {
      this.boardObserver.observe(container, {
        childList: true,
        subtree: true
      });
    });
  }
  cleanup() {
    this.saveCacheToLocalStorage();
    this.dropdowns.forEach(dropdown => {
      if (dropdown && dropdown.parentNode) {
        dropdown.parentNode.removeChild(dropdown);
      }
    });
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.cacheSaveInterval) {
      clearInterval(this.cacheSaveInterval);
      this.cacheSaveInterval = null;
    }
    if (this.boardObserver) {
      this.boardObserver.disconnect();
      this.boardObserver = null;
    }
    if (this.cardsObserver) {
      this.cardsObserver.disconnect();
      this.cardsObserver = null;
    }
    this.dropdowns = [];
    this.cardLinks.clear();
    this.cache.issues.clear();
    this.cache.mergeRequests.clear();
    this.cache.relatedIssues.clear();
    this.initialized = false;
  }
  setupCardsMutationObserver() {
    if (this.cardsObserver) {
      this.cardsObserver.disconnect();
    }
    this.cardsObserver = new MutationObserver(mutations => {
      let needsCheck = false;
      mutations.forEach(mutation => {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          needsCheck = true;
        }
      });
      if (needsCheck) {
        this.checkForNewCards();
      }
    });
    document.body.querySelectorAll('.boards-app, .boards-list').forEach(container => {
      this.cardsObserver.observe(container, {
        childList: true,
        subtree: true
      });
    });
    if (!document.querySelector('.boards-app, .boards-list')) {
      this.cardsObserver.observe(document.body, {
        childList: true,
        subtree: true
      });
    }
  }
  extractRepositoryPath(path) {
    if (!path) {
      return window.location.pathname.split('/boards')[0].replace(/^\//, '');
    }
    if (!path.includes('/') && !path.includes('#')) {
      return path;
    }
    let cleanPath = path;
    if (cleanPath.includes('#')) {
      cleanPath = cleanPath.split('#')[0];
    }
    const boardsMatch = cleanPath.match(/\/boards\/([^\/]+\/[^\/]+)/);
    if (boardsMatch && boardsMatch[1]) {
      return boardsMatch[1];
    }
    const projectMatch = cleanPath.match(/^\/([^\/]+\/[^\/]+)/);
    if (projectMatch && projectMatch[1]) {
      return projectMatch[1];
    }
    const simpleMatch = cleanPath.match(/^\/([^\/]+\/[^\/]+)\/?$/);
    if (simpleMatch && simpleMatch[1]) {
      return simpleMatch[1];
    }
    const fallback = cleanPath.replace(/^\//, '').split('/boards')[0];
    if (fallback.includes('/')) {
      return fallback;
    }
    return window.location.pathname.split('/boards')[0].replace(/^\//, '');
  }
  addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath) {
    if (issueItem.mergeRequests && issueItem.mergeRequests.nodes) {
      issueItem.mergeRequests.nodes.forEach(mr => {
        const mrUrl = mr.webUrl || `${baseUrl}/${projectPath}/-/merge_requests/${mr.iid}`;
        linkedItems.push({
          type: 'merge_request',
          title: mr.title || `Merge Request !${mr.iid}`,
          state: mr.state,
          url: mrUrl
        });
      });
    }
    if (issueItem.relatedIssues && issueItem.relatedIssues.nodes) {
      issueItem.relatedIssues.nodes.forEach(related => {
        const relatedPath = related.referencePath || projectPath;
        const issueUrl = related.webUrl || `${baseUrl}/${relatedPath}/-/issues/${related.iid}`;
        linkedItems.push({
          type: 'issue',
          title: related.title || `Issue #${related.iid}`,
          state: related.state,
          url: issueUrl
        });
      });
    }
  }
  async preloadMergeRequests(projectPath) {
    if (!projectPath) return;
    try {
      const gitlabApi = window.gitlabApi || this.uiManager?.gitlabApi;
      if (!gitlabApi || typeof gitlabApi.callGitLabApiWithCache !== 'function') return;
      const encodedPath = encodeURIComponent(projectPath);
    } catch (error) {
      console.warn('Error preloading merge requests:', error);
    }
  }
}
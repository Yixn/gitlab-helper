export default class LinkedItemsManager {
    constructor(options = {}) {
        this.initialized = false;
        this.dropdowns = [];
        this.cardLinks = new Map();
        this.uiManager = options.uiManager || window.uiManager;
        this.gitlabApi = options.gitlabApi || window.gitlabApi;

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

    initialize() {
        if (!this.checkEnabled()) {
            return;
        }
        if (this.initialized) {
            return;
        }
        this.initialized = true;
        this.applyOverflowFixes();

        // Create dropdowns for all cards
        this.createCardDropdowns();

        // Set up periodic refresh to catch new cards
        this.refreshInterval = setInterval(() => {
            this.refreshDropdowns();
        }, 2000);

        this.setupCardsMutationObserver();
    }

    loadFromCacheAndCreateDropdowns() {
        // Create dropdowns for all existing cards
        this.createCardDropdowns();

        // Update all dropdowns with fresh data
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.originalCard) {
                this.fetchAndUpdateDropdown(dropdown, dropdown.originalCard);
            }
        });
    }

    getEnhancedMRStatus(item) {
        if (!item || !item.state) {
            return 'Unknown';
        }

        // If the MR is already merged or closed, just return that state
        if (item.state.toLowerCase() === 'merged') {
            return 'Merged';
        }

        if (item.state.toLowerCase() === 'closed') {
            return 'Closed';
        }

        // For open MRs, determine the specific status
        if (item.state.toLowerCase() === 'opened' || item.state.toLowerCase() === 'open') {
            // Check for draft/WIP status first
            if (item.title) {
                if (item.title.toLowerCase().startsWith('draft:') ||
                    item.title.toLowerCase().startsWith('wip:') ||
                    item.title.toLowerCase().includes('[wip]') ||
                    item.title.toLowerCase().includes('[draft]')) {
                    return 'Draft';
                }
            }

            // Check for merge conflicts
            if (item.has_conflicts === true) {
                return 'Pipeline Failed';
            }

            // Check for blocking discussions not resolved
            if (item.blocking_discussions_resolved === false) {
                return 'Changes Needed';
            }

            // Check if MR has been approved but not yet merged
            if (item.approvals_required !== undefined &&
                item.approved_by !== undefined &&
                item.approved_by.length >= item.approvals_required &&
                item.approvals_required > 0) {
                return 'Approved';
            }

            // Check for discussions/comments to determine if it's being reviewed
            if (item.has_discussions === true ||
                (item.user_notes_count !== undefined && item.user_notes_count > 0)) {
                return 'Reviewing';
            }

            // Check if approval is required but no approvals yet
            if (item.approvals_required !== undefined &&
                item.approved_by !== undefined) {
                if (item.approvals_required > 0 &&
                    (!item.approved_by || item.approved_by.length < item.approvals_required)) {
                    return 'Needs Review';
                }
            }

            // Check for pipeline status
            if (item.pipeline_status &&
                item.pipeline_status.status &&
                item.pipeline_status.status === 'failed') {
                return 'Pipeline Failed';
            }
        }

        // Default to standard state if we can't determine a more specific status
        return item.state.charAt(0).toUpperCase() + item.state.slice(1).toLowerCase();
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

            // Get linked items fresh each time
            const linkedItems = await this.getLinkedItemsFromIssue(issueItem);

            if (linkedItems.length > 0) {
                const cardId = dropdown.dataset.cardId;
                this.cardLinks.set(cardId, linkedItems);
                dropdown.isLoading = false;
                this.updateDropdownWithLinkedItems(dropdown, linkedItems);
            } else {
                this.updateDropdownEmpty(dropdown);
            }
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
        dropdownContent.style.width = `${$(card).width() + 1}px`;
        dropdownContent.style.boxShadow = '    box-shadow: rgba(0, 0, 0, 0.6) 0px 0px 6px;';
        dropdownContent.style.zIndex = '100';
        dropdownContent.style.borderRadius = '4px';
        dropdownContent.style.border = '1px solid #ddd';
        dropdownContent.style.left = '9px';
        dropdownContent.style.top = `${$(card).height()}px`;
        const loadingItem = document.createElement('div');
        loadingItem.textContent = 'Loading linked items...';
        loadingItem.style.padding = '10px 12px';
        loadingItem.style.color = '#666';
        loadingItem.style.fontStyle = 'italic';
        loadingItem.style.fontSize = '13px';
        loadingItem.style.textAlign = 'center';
        dropdownContent.appendChild(loadingItem);

        // Modify the click event handler to dim other cards
        dropdownToggle.addEventListener('click', e => {
            e.stopPropagation();
            dropdownContent.style.width = `${$(card).width() + 1}px`;
            dropdownContent.style.top = `${$(card).height()}px`;
            // Set all other cards to a lower opacity
            const allCards = document.querySelectorAll('.board-card');
            const allDropdowns = document.querySelectorAll('.linked-items-dropdown');
            const isCurrentlyOpen = dropdownContent.style.display === 'block';

            // Close all other dropdowns
            document.querySelectorAll('.linked-items-content').forEach(content => {
                if (content !== dropdownContent) {
                    content.style.display = 'none';
                    const parentDropdown = content.closest('.linked-items-dropdown');
                    if (parentDropdown) {
                        parentDropdown.style.zIndex = '99';
                    }
                }
            });

            // Toggle current dropdown
            if (!isCurrentlyOpen) {
                dropdown.style.zIndex = '100';
                dropdownContent.style.display = 'block';

                // Dim all other cards
                allCards.forEach(c => {
                    // Skip the current card
                    if (c !== card) {
                        c.style.transition = 'opacity 0.2s ease';
                        c.style.opacity = '0.25';
                    }
                });

                // Dim all other dropdowns
                allDropdowns.forEach(d => {
                    if (d !== dropdown) {
                        d.style.transition = 'opacity 0.2s ease';
                        d.style.opacity = '0.25';
                    }
                });

                // Make sure our card stays fully visible
                card.style.opacity = '1';
                card.style.zIndex = '10';
                dropdown.style.opacity = '1';
            } else {
                dropdown.style.zIndex = '99';
                dropdownContent.style.display = 'none';

                // Restore all cards and dropdowns to normal opacity
                allCards.forEach(c => {
                    c.style.opacity = '1';
                    c.style.removeProperty('z-index');
                });

                allDropdowns.forEach(d => {
                    d.style.opacity = '1';
                });
            }
        });

        // Also modify the document click handler to restore opacity when clicking outside
        document.addEventListener('click', () => {
            if (dropdownContent.style.display === 'block') {
                dropdownContent.style.display = 'none';
                dropdown.style.zIndex = '99';

                // Restore all cards and dropdowns to normal opacity
                const allCards = document.querySelectorAll('.board-card');
                const allDropdowns = document.querySelectorAll('.linked-items-dropdown');
                allCards.forEach(c => {
                    c.style.opacity = '1';
                    c.style.removeProperty('z-index');
                });

                allDropdowns.forEach(d => {
                    d.style.opacity = '1';
                });
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

                this.addLinkedItemsFromProps(issueItem, linkedItems, baseUrl, projectPath);
                const gitlabApi = window.gitlabApi || this.uiManager?.gitlabApi;

                if (gitlabApi && typeof gitlabApi.callGitLabApiWithCache === 'function') {
                    try {
                        const encodedPath = encodeURIComponent(projectPath);
                        try {
                            const relatedMRs = await gitlabApi.callGitLabApiWithCache(`projects/${encodedPath}/issues/${issueIid}/related_merge_requests`, {
                                params: {
                                    with_discussions_to_resolve: true,
                                    with_merge_status_recheck: true
                                }
                            }, 60000);

                            if (Array.isArray(relatedMRs) && relatedMRs.length > 0) {
                                for (let i = linkedItems.length - 1; i >= 0; i--) {
                                    if (linkedItems[i].type === 'merge_request') {
                                        linkedItems.splice(i, 1);
                                    }
                                }

                                for (const mr of relatedMRs) {
                                    let mrDetails = mr;
                                    mr.has_conflicts = mr.pipeline !== undefined && mr.pipeline.status === "failed"
                                    mr.rspec_running = mr.pipeline !== undefined && mr.pipeline.status === "running"
                                    if (!mr.blocking_discussions_resolved || !mr.has_conflicts) {
                                        try {
                                            const detailedMR = await gitlabApi.callGitLabApiWithCache(
                                                `projects/${encodedPath}/merge_requests/${mr.iid}`,
                                                {}, 60000
                                            );
                                            if (detailedMR) {
                                                mrDetails = {...mr, ...detailedMR};
                                            }
                                        } catch (detailsError) {
                                            console.warn(`Couldn't fetch detailed info for MR #${mr.iid}:`, detailsError);
                                        }
                                    }

                                    linkedItems.push({
                                        type: 'merge_request',
                                        title: mrDetails.title || `Merge Request !${mrDetails.iid}`,
                                        state: mrDetails.state,
                                        url: mrDetails.web_url || `${baseUrl}/${projectPath}/-/merge_requests/${mrDetails.iid}`,
                                        has_conflicts: mrDetails.has_conflicts,
                                        rspec_running: mr.rspec_running,
                                        blocking_discussions_resolved: mrDetails.blocking_discussions_resolved,
                                        has_discussions: mrDetails.discussion_locked !== undefined
                                            ? !mrDetails.discussion_locked
                                            : !!mrDetails.user_notes_count,
                                        approvals_required: mrDetails.approvals_required,
                                        approved_by: mrDetails.approved_by,
                                        pipeline_status: mrDetails.pipeline_status,
                                        mrDetails: mrDetails,
                                        issueItem: issueItem
                                    });
                                }
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
        } catch (e) {
            console.error('Error extracting linked items:', e);
        }
        return linkedItems;
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

                // Enhanced status display for merge requests
                const mrStatusText = this.getEnhancedMRStatus(item);
                if (mrStatusText === 'Merged') {
                    icon.style.color = '#6f42c1'; // Purple for merged
                } else if (mrStatusText === 'Reviewing') {
                    icon.style.color = '#f9bc00'; // Yellow for in-review
                } else if (mrStatusText === 'Approved') {
                    icon.style.color = '#28a745'; // Green for approved
                } else if (mrStatusText === 'Needs Review') {
                    icon.style.color = '#1f75cb'; // Blue for needs review
                } else if (mrStatusText === 'Changes Needed') {
                    icon.style.color = '#dc3545'; // Red for changes needed
                } else if (mrStatusText === 'Open') {
                    icon.style.color = '#1f75cb'; // Blue for open
                } else if (mrStatusText === 'Closed') {
                    icon.style.color = '#dc3545'; // Red for closed
                } else if (mrStatusText === 'Draft') {
                    icon.style.color = '#6c757d'; // Gray for drafts
                } else if (mrStatusText === 'Pipeline Failed') {
                    icon.style.color = '#dc3545'; // Red for conflicts
                } else if (mrStatusText === 'Pipeline Failed') {
                    icon.style.color = '#dc3545'; // Red for pipeline failures
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
                        icon.style.color = '#1f75cb';
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

        const infoContainer = document.createElement('div');
        infoContainer.style.display = 'flex';
        infoContainer.style.alignItems = 'center';
        infoContainer.style.marginLeft = 'auto';
        infoContainer.style.gap = '2px';

        if (item.state) {
            const status = document.createElement('span');
            status.style.borderRadius = '10px';
            status.style.padding = '2px 6px';
            status.style.fontSize = '10px';
            status.style.marginRight = '4px';

            // Use enhanced status for merge requests
            if (item.type === 'merge_request') {
                const statusText = this.getEnhancedMRStatus(item);
                status.textContent = statusText;

                if (statusText === 'Merged') {
                    status.style.backgroundColor = '#6f42c1';
                    status.style.color = 'white';
                } else if (statusText === 'Reviewing') {
                    status.style.backgroundColor = '#f9bc00'; // Yellow for in-review
                    status.style.color = 'black';
                } else if (statusText === 'Approved') {
                    status.style.backgroundColor = '#28a745'; // Green for approved
                    status.style.color = 'white';
                } else if (statusText === 'Needs Review') {
                    status.style.backgroundColor = '#1f75cb'; // Blue for needs review
                    status.style.color = 'white';
                } else if (statusText === 'Changes Needed') {
                    status.style.backgroundColor = '#dc3545'; // Red for changes needed
                    status.style.color = 'white';
                } else if (statusText === 'Draft') {
                    status.style.backgroundColor = '#6c757d'; // Gray for drafts
                    status.style.color = 'white';
                } else if (statusText === 'Pipeline Failed') {
                    status.style.backgroundColor = '#dc3545'; // Red for conflicts
                    status.style.color = 'white';
                } else if (statusText === 'Pipeline Failed') {
                    status.style.backgroundColor = '#dc3545'; // Red for failed pipeline
                    status.style.color = 'white';
                } else if (statusText === 'Open') {
                    status.style.backgroundColor = '#1f75cb'; // Blue for open
                    status.style.color = 'white';
                } else if (statusText === 'Closed') {
                    status.style.backgroundColor = '#000000'; // Black for closed
                    status.style.color = 'white';
                } else {
                    status.style.backgroundColor = '#6c757d';
                    status.style.color = 'white';
                }
                infoContainer.appendChild(status);

                // Add reviewer avatar if available (for merge requests)
                if (item.mrDetails && (item.mrDetails.reviewers || item.mrDetails.approved_by)) {
                    // First try the reviewers property
                    const reviewers = item.mrDetails.reviewers || [];
                    // Then try the approved_by property
                    const approvers = item.mrDetails.approved_by || [];

                    // Use the first reviewer or approver (whichever is available)
                    const reviewer = reviewers.length > 0 ? reviewers[0] :
                        (approvers.length > 0 ? approvers[0] : null);

                    if (reviewer && reviewer.avatar_url) {
                        const avatarContainer = document.createElement('div');
                        avatarContainer.style.position = 'relative';
                        avatarContainer.style.width = '25px';
                        avatarContainer.style.height = '25px';

                        const avatar = document.createElement('img');
                        avatar.src = reviewer.avatar_url;
                        avatar.alt = reviewer.name || 'Reviewer';
                        avatar.title = `Reviewer: ${reviewer.name || 'Unknown'}`;
                        avatar.style.width = '25px';
                        avatar.style.height = '25px';
                        avatar.style.borderRadius = '50%';
                        avatar.style.objectFit = 'cover';
                        avatar.style.border = '1px solid #e0e0e0';

                        avatarContainer.appendChild(avatar);

                        // Add a count badge if there are multiple reviewers
                        const totalReviewers = reviewers.length + approvers.length;
                        if (totalReviewers > 1) {
                            const badge = document.createElement('span');
                            badge.textContent = `+${totalReviewers - 1}`;
                            badge.style.position = 'absolute';
                            badge.style.top = '-4px';
                            badge.style.right = '-4px';
                            badge.style.backgroundColor = '#1f75cb';
                            badge.style.color = 'white';
                            badge.style.fontSize = '8px';
                            badge.style.borderRadius = '8px';
                            badge.style.padding = '1px 3px';
                            badge.style.fontWeight = 'bold';

                            avatarContainer.appendChild(badge);
                            avatarContainer.title = `${totalReviewers} reviewers`;
                        }

                        infoContainer.appendChild(avatarContainer);
                    }
                }
            } else if (item.type === 'issue') {
                const statusText = this.getEnhancedIssueStatus(item);
                status.textContent = statusText;

                if (statusText === 'Open') {
                    status.style.backgroundColor = '#1f75cb';
                    status.style.color = 'white';
                } else if (statusText === 'In Progress') {
                    status.style.backgroundColor = '#28a745';
                    status.style.color = 'white';
                } else if (statusText === 'Draft') {
                    status.style.backgroundColor = '#6c757d';
                    status.style.color = 'white';
                } else if (statusText === 'Active') {
                    status.style.backgroundColor = '#17a2b8';
                    status.style.color = 'white';
                } else if (statusText === 'Overdue') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else if (statusText === 'Due Soon') {
                    status.style.backgroundColor = '#f9bc00';
                    status.style.color = 'black';
                } else if (statusText === 'Resolved') {
                    status.style.backgroundColor = '#6f42c1';
                    status.style.color = 'white';
                } else if (statusText === 'Closed') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else {
                    // Default for any other status
                    status.style.backgroundColor = '#6c757d';
                    status.style.color = 'white';
                }
                infoContainer.appendChild(status);
            } else {
                status.textContent = item.state;

                if (item.state.toLowerCase() === 'open' || item.state.toLowerCase() === 'opened') {
                    status.style.backgroundColor = '#1f75cb';
                    status.style.color = 'white';
                } else if (item.state.toLowerCase() === 'closed') {
                    status.style.backgroundColor = '#dc3545';
                    status.style.color = 'white';
                } else if (item.state.toLowerCase() === 'merged') {
                    status.style.backgroundColor = '#6f42c1';
                    status.style.color = 'white';
                }
                infoContainer.appendChild(status);
            }
        }

        link.prepend(icon);
        link.appendChild(text);
        link.appendChild(infoContainer);

        link.addEventListener('mouseenter', function () {
            this.style.backgroundColor = '#f8f9fa';
        });
        link.addEventListener('mouseleave', function () {
            this.style.backgroundColor = 'white';
        });

        return link;
    }

    getEnhancedIssueStatus(item) {
        if (!item || !item.state) {
            return 'Unknown';
        }

        // Check basic states first
        const state = item.state.toLowerCase();
        if (state === 'closed') {
            // Could check for different closure reasons
            if (item.closed_at && item.updated_at &&
                new Date(item.closed_at).getTime() === new Date(item.updated_at).getTime()) {
                return 'Resolved';
            }
            return 'Closed';
        }

        if (state === 'open' || state === 'opened') {
            // Check for various open states

            // Check for draft or WIP
            if (item.title) {
                if (item.title.toLowerCase().startsWith('draft:') ||
                    item.title.toLowerCase().startsWith('wip:') ||
                    item.title.toLowerCase().includes('[wip]') ||
                    item.title.toLowerCase().includes('[draft]')) {
                    return 'Draft';
                }
            }

            // Check if it's being worked on
            if (item.assignees && item.assignees.length > 0) {
                return 'In Progress';
            }

            // Check for due date
            if (item.due_date) {
                const dueDate = new Date(item.due_date);
                const today = new Date();

                if (dueDate < today) {
                    return 'Overdue';
                }

                // Due within 2 days
                const twoDaysInMs = 2 * 24 * 60 * 60 * 1000;
                if (dueDate.getTime() - today.getTime() < twoDaysInMs) {
                    return 'Due Soon';
                }
            }

            // Check for activity level (comments)
            if (item.user_notes_count !== undefined && item.user_notes_count > 3) {
                return 'Active';
            }

            // Default open state with better wording
            return 'Open';
        }

        // If it's another state, just capitalize it
        return item.state.charAt(0).toUpperCase() + item.state.slice(1).toLowerCase();
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
        if (!this.initialized) {
            return false;
        }

        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        let newCardsFound = false;
        cardAreas.forEach(cardArea => {
            const cards = cardArea.querySelectorAll('.board-card');
            cards.forEach(card => {
                const cardId = card.id || '';
                const hasDropdown = this.dropdowns.some(dropdown =>
                    dropdown.dataset.cardId === cardId || dropdown.originalCard === card
                );

                if (!hasDropdown) {
                    try {
                        const dropdown = this.createPlaceholderDropdown(card, cardArea);
                        if (dropdown) {
                            this.dropdowns.push(dropdown);
                            newCardsFound = true;

                            // Always fetch data for new cards
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
                    url: mrUrl,
                    mrData: mr
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

    cleanup() {
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.parentNode) {
                dropdown.parentNode.removeChild(dropdown);
            }
        });
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
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
        this.initialized = false;
    }
}
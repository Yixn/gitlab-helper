export default class LinkedItemsManager {
    constructor(options = {}) {
        this.initialized = false;
        this.dropdowns = [];
        this.cardLinks = new Map(); // Maps card IDs to their links
        this.uiManager = options.uiManager || window.uiManager;

        // Bind methods that need 'this' context
        this.handleScroll = this.handleScroll.bind(this);
        this.handleResize = this.handleResize.bind(this);
        this.refreshDropdowns = this.refreshDropdowns.bind(this);

        // Add event listeners
        window.addEventListener('scroll', this.handleScroll);
        window.addEventListener('resize', this.handleResize);

        // Setup MutationObserver to detect board changes
        this.setupMutationObserver();

        // Check if feature is enabled
        this.checkEnabled();
    }

    checkEnabled() {
        try {
            const enabled = localStorage.getItem('gitLabHelperLinkedItemsEnabled');
            // If no setting exists, default to enabled
            if (enabled === null) {
                localStorage.setItem('gitLabHelperLinkedItemsEnabled', 'true');
                return true;
            }
            return enabled === 'true';
        } catch (e) {
            console.error('Error checking linked items enabled state:', e);
            return true; // Default to enabled
        }
    }

    initialize() {
        // Check if feature is enabled
        if (!this.checkEnabled()) {
            console.log('LinkedItemsManager: Feature is disabled');
            return;
        }

        if (this.initialized) {
            return;
        }

        this.initialized = true;
        console.log('LinkedItemsManager: Initializing...');

        this.applyOverflowFixes();
        this.createCardDropdowns();

        // Setup periodic refresh to catch any new cards
        this.refreshInterval = setInterval(this.refreshDropdowns, 5000);

        console.log('LinkedItemsManager: Initialized successfully');
    }

    applyOverflowFixes() {
        // Similar to IssueSelector's approach to ensure overlays work
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
        // Remove existing dropdowns
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.parentNode) {
                dropdown.parentNode.removeChild(dropdown);
            }
        });

        this.dropdowns = [];

        // Find all card areas and create dropdowns for each card
        const cardAreas = document.querySelectorAll('[data-testid="board-list-cards-area"]');
        cardAreas.forEach(cardArea => {
            try {
                const cards = cardArea.querySelectorAll('.board-card');
                cards.forEach((card, index) => {
                    try {
                        // Create a placeholder dropdown immediately for each card
                        const dropdown = this.createPlaceholderDropdown(card, cardArea);
                        if (dropdown) {
                            this.dropdowns.push(dropdown);

                            // Then asynchronously fetch and update with real data
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

            // Get issue data asynchronously
            const issueItem = await this.getIssueItemFromCard(card);
            if (!issueItem) return;

            // Get linked items
            const linkedItems = await this.getLinkedItemsFromIssue(issueItem);

            // Store links for this card
            const cardId = dropdown.dataset.cardId;
            this.cardLinks.set(cardId, linkedItems);

            // Mark as loaded
            dropdown.isLoading = false;

            // Update the dropdown with the real data
            this.updateDropdownWithLinkedItems(dropdown, linkedItems);
        } catch (error) {
            console.error('Error fetching and updating dropdown:', error);
            // Update with error state if needed
            this.updateDropdownWithError(dropdown);
        }
    }
    updateDropdownEmpty(dropdown) {
        const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
        const dropdownContent = dropdown.querySelector('.linked-items-content');

        if (!dropdownToggle || !dropdownContent) return;

        // Update toggle appearance
        dropdownToggle.style.backgroundColor = '#6c757d';
        dropdownToggle.title = 'No linked items found';

        // Clear the loading content
        dropdownContent.innerHTML = '';

        // Add message for no items
        const emptyMessage = document.createElement('div');
        emptyMessage.textContent = 'No linked items found';
        emptyMessage.style.padding = '10px 12px';
        emptyMessage.style.color = '#666';
        emptyMessage.style.fontStyle = 'italic';
        emptyMessage.style.fontSize = '13px';
        emptyMessage.style.textAlign = 'center';
        dropdownContent.appendChild(emptyMessage);

        // Add view issue item as fallback
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

        // Update toggle appearance
        dropdownToggle.style.backgroundColor = '#dc3545';
        dropdownToggle.title = 'Error loading linked items';

        // Clear the loading content
        dropdownContent.innerHTML = '';

        // Add error message
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
        // If no linked items found, update the button to show that
        if (!linkedItems || linkedItems.length === 0) {
            this.updateDropdownEmpty(dropdown);
            return;
        }

        // Get the dropdown toggle and content elements
        const dropdownToggle = dropdown.querySelector('.linked-items-toggle');
        const dropdownContent = dropdown.querySelector('.linked-items-content');

        if (!dropdownToggle || !dropdownContent) return;

        // Update the button appearance
        dropdownToggle.title = `${linkedItems.length} linked item${linkedItems.length !== 1 ? 's' : ''}`;

        // Count by type
        const mrCount = linkedItems.filter(item => item.type === 'merge_request').length;
        const branchCount = linkedItems.filter(item => item.type === 'branch').length;
        const issueCount = linkedItems.filter(item => item.type === 'issue').length;

        if (mrCount > 0 || branchCount > 0) {
            dropdownToggle.title = `${mrCount ? mrCount + ' MR' + (mrCount > 1 ? 's' : '') : ''}${mrCount && branchCount ? ', ' : ''}${branchCount ? branchCount + ' branch' + (branchCount > 1 ? 'es' : '') : ''}${issueCount ? (mrCount || branchCount ? ', ' : '') + issueCount + ' issue' + (issueCount > 1 ? 's' : '') : ''}`;
        }

        // Clear the loading content
        dropdownContent.innerHTML = '';

        // Group items by type
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

        // Helper to create section headers
        const createSectionHeader = (title) => {
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

        // Add merge requests section
        if (groupedItems.merge_request.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Merge Requests'));
            groupedItems.merge_request.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Add branches section
        if (groupedItems.branch.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Branches'));
            groupedItems.branch.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Add issues section
        if (groupedItems.issue.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Related Issues'));
            groupedItems.issue.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Add other links
        if (groupedItems.other.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Actions'));
            groupedItems.other.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }
    }
    createPlaceholderDropdown(card, cardArea) {
        // Generate unique ID for this card
        const cardId = card.id || `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create the dropdown button
        const dropdown = document.createElement('div');
        dropdown.className = 'linked-items-dropdown';
        dropdown.style.position = 'absolute';
        dropdown.style.zIndex = '99';
        dropdown.style.cursor = 'pointer';
        dropdown.style.transition = 'all 0.2s ease';
        dropdown.dataset.cardId = cardId;
        dropdown.originalCard = card;
        dropdown.isLoading = true;

        // Position the dropdown
        this.positionDropdown(dropdown, card, cardArea);

        // Create loading dropdown toggle button
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

        // Create SVG icon
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

        // Style for hover effect
        dropdownToggle.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#0056b3';
            this.style.transform = 'scale(1.1)';
        });

        dropdownToggle.addEventListener('mouseleave', function() {
            this.style.backgroundColor = '#1f75cb';
            this.style.transform = 'scale(1)';
        });

        // Create placeholder dropdown content
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

        // Add loading indicator
        const loadingItem = document.createElement('div');
        loadingItem.textContent = 'Loading linked items...';
        loadingItem.style.padding = '10px 12px';
        loadingItem.style.color = '#666';
        loadingItem.style.fontStyle = 'italic';
        loadingItem.style.fontSize = '13px';
        loadingItem.style.textAlign = 'center';
        dropdownContent.appendChild(loadingItem);

        // Toggle dropdown on click
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close all other dropdowns
            document.querySelectorAll('.linked-items-content').forEach(content => {
                if (content !== dropdownContent) {
                    content.style.display = 'none';
                }
            });

            // Toggle this dropdown
            dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';
        });

        // Close dropdown when clicking elsewhere
        document.addEventListener('click', () => {
            dropdownContent.style.display = 'none';
        });

        // Add components to the dropdown
        dropdown.appendChild(dropdownToggle);
        dropdown.appendChild(dropdownContent);

        // Add to the card area
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

    getLinkedItemsFromIssue(issueItem) {
        const linkedItems = [];

        try {
            // Extract the correct project path - fixing the URL generation issue
            let projectPath = '';
            if (issueItem.referencePath) {
                // If it's already a clean path like "linkster-co/frontend"
                if (!issueItem.referencePath.includes('/groups/')) {
                    projectPath = issueItem.referencePath;
                } else {
                    // Extract from things like "/groups/linkster-co/-/boards/linkster-co/frontend"
                    const matches = issueItem.referencePath.match(/\/boards\/(.+?)($|#|\/)/);
                    if (matches && matches[1]) {
                        projectPath = matches[1];
                    } else {
                        // Fallback to current URL parsing
                        projectPath = window.location.pathname.split('/boards')[0].replace(/^\//, '');
                    }
                }
            } else {
                // Fallback to window URL if no referencePath
                projectPath = window.location.pathname.split('/boards')[0].replace(/^\//, '');
            }

            // Base GitLab URL
            const baseUrl = window.location.origin;

            // Check for merge requests
            if (issueItem.mergeRequests && issueItem.mergeRequests.nodes) {
                issueItem.mergeRequests.nodes.forEach(mr => {
                    // Use direct webUrl if available, otherwise construct it
                    const mrUrl = mr.webUrl || `${baseUrl}/${projectPath}/-/merge_requests/${mr.iid}`;
                    linkedItems.push({
                        type: 'merge_request',
                        title: mr.title || `Merge Request !${mr.iid}`,
                        state: mr.state,
                        url: mrUrl
                    });
                });
            }

            // Check for linked branches
            if (issueItem.referencedBranches) {
                issueItem.referencedBranches.forEach(branch => {
                    const branchName = typeof branch === 'string' ? branch : branch.name;
                    linkedItems.push({
                        type: 'branch',
                        title: branchName,
                        url: `${baseUrl}/${projectPath}/-/tree/${encodeURIComponent(branchName)}`
                    });
                });
            }

            // Check for related issues
            if (issueItem.relatedIssues && issueItem.relatedIssues.nodes) {
                issueItem.relatedIssues.nodes.forEach(related => {
                    // Use direct webUrl if available, otherwise construct it
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

            // Add link to the issue itself
            if (issueItem.iid) {
                linkedItems.push({
                    type: 'issue_detail',
                    title: 'View Issue Details',
                    url: `${baseUrl}/${projectPath}/-/issues/${issueItem.iid}`
                });
            }
        } catch (e) {
            console.error('Error extracting linked items:', e);
        }

        return linkedItems;
    }

    createDropdownForCard(card, issueItem, cardArea) {
        // Generate unique ID for this card
        const cardId = card.id || `card-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Create the dropdown button
        const dropdown = document.createElement('div');
        dropdown.className = 'linked-items-dropdown';
        dropdown.style.position = 'absolute';
        dropdown.style.zIndex = '99';
        dropdown.style.cursor = 'pointer';
        dropdown.style.transition = 'all 0.2s ease';
        dropdown.dataset.cardId = cardId;
        dropdown.originalCard = card;

        // Position the dropdown
        this.positionDropdown(dropdown, card, cardArea);

        // Get linked items
        const linkedItems = this.getLinkedItemsFromIssue(issueItem);

        // Store links for this card
        this.cardLinks.set(cardId, linkedItems);

        // If no linked items found, don't create dropdown
        if (linkedItems.length === 0) {
            return null;
        }

        // Create dropdown toggle button
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

// Create and add SVG icon instead of using emoji
        const svgIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svgIcon.setAttribute('role', 'img');
        svgIcon.setAttribute('aria-hidden', 'true');
        svgIcon.classList.add('gl-icon');
        svgIcon.style.width = '12px';
        svgIcon.style.height = '12px';
        svgIcon.style.fill = 'white';

// Create use element to reference the SVG icon
        const useElement = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        useElement.setAttribute('href', '/assets/icons-aa2c8ddf99d22b77153ca2bb092a23889c12c597fc8b8de94b0f730eb53513f6.svg#issue-type-issue');
        svgIcon.appendChild(useElement);

// Add SVG to the dropdown toggle
        dropdownToggle.appendChild(svgIcon);

        // Count by type
        const mrCount = linkedItems.filter(item => item.type === 'merge_request').length;
        const branchCount = linkedItems.filter(item => item.type === 'branch').length;
        const issueCount = linkedItems.filter(item => item.type === 'issue').length;

        if (mrCount > 0 || branchCount > 0) {
            dropdownToggle.title = `${mrCount ? mrCount + ' MR' + (mrCount > 1 ? 's' : '') : ''}${mrCount && branchCount ? ', ' : ''}${branchCount ? branchCount + ' branch' + (branchCount > 1 ? 'es' : '') : ''}${issueCount ? (mrCount || branchCount ? ', ' : '') + issueCount + ' issue' + (issueCount > 1 ? 's' : '') : ''}`;
        }

        // Style for hover effect
        dropdownToggle.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#0056b3';
            this.style.transform = 'scale(1.1)';
        });

        dropdownToggle.addEventListener('mouseleave', function() {
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
        dropdownContent.style.left = '0'; // Change from 'right: 0' to 'left: 0'
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

        // Helper to create section headers
        const createSectionHeader = (title) => {
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

        // Add merge requests section
        if (groupedItems.merge_request.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Merge Requests'));
            groupedItems.merge_request.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Add branches section
        if (groupedItems.branch.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Branches'));
            groupedItems.branch.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Add issues section
        if (groupedItems.issue.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Related Issues'));
            groupedItems.issue.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Add other links
        if (groupedItems.other.length > 0) {
            dropdownContent.appendChild(createSectionHeader('Actions'));
            groupedItems.other.forEach(item => {
                dropdownContent.appendChild(this.createLinkItem(item));
            });
        }

        // Toggle dropdown on click
        dropdownToggle.addEventListener('click', (e) => {
            e.stopPropagation();

            // Close all other dropdowns
            document.querySelectorAll('.linked-items-content').forEach(content => {
                if (content !== dropdownContent) {
                    content.style.display = 'none';
                }
            });

            // Toggle this dropdown
            dropdownContent.style.display = dropdownContent.style.display === 'block' ? 'none' : 'block';

            // Position the dropdown content properly
            if (dropdownContent.style.display === 'block') {
                // Check if dropdown would go off-screen to the right
                const rect = dropdownContent.getBoundingClientRect();
                if (rect.right > window.innerWidth) {
                    dropdownContent.style.right = 'auto';
                    dropdownContent.style.left = `-${rect.width - dropdownToggle.offsetWidth}px`;
                }
            }
        });

        // Close dropdown when clicking elsewhere
        document.addEventListener('click', () => {
            dropdownContent.style.display = 'none';
        });

        // Add components to the dropdown
        dropdown.appendChild(dropdownToggle);
        dropdown.appendChild(dropdownContent);

        // Add to the card area
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

        // Icon based on type
        const icon = document.createElement('span');
        switch(item.type) {
            case 'merge_request':
                icon.textContent = '🔀';
                icon.title = 'Merge Request';
                break;
            case 'branch':
                icon.textContent = '🌿';
                icon.title = 'Branch';
                break;
            case 'issue':
                icon.textContent = '📝';
                icon.title = 'Issue';
                break;
            case 'issue_detail':
                icon.textContent = '👁️';
                icon.title = 'View Issue';
                break;
            default:
                icon.textContent = '🔗';
        }

        icon.style.marginRight = '8px';
        icon.style.fontSize = '16px';

        // Title text
        const text = document.createElement('span');
        text.textContent = this.truncateText(item.title, 30);
        text.style.flex = '1';
        text.style.overflow = 'hidden';
        text.style.textOverflow = 'ellipsis';
        text.style.whiteSpace = 'nowrap';

        // Status indicator for MRs and issues if applicable
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

        // Hover effect
        link.addEventListener('mouseenter', function() {
            this.style.backgroundColor = '#f8f9fa';
        });

        link.addEventListener('mouseleave', function() {
            this.style.backgroundColor = 'white';
        });

        return link;
    }

    positionDropdown(dropdown, card, cardArea) {
        try {
            const cardRect = card.getBoundingClientRect();
            const areaRect = cardArea.getBoundingClientRect();

            // Position at top left corner of the card instead of top right
            const top = cardRect.top - areaRect.top + cardArea.scrollTop;
            const left = cardRect.left - areaRect.left + cardArea.scrollLeft + 5 - 13; // Just add a small 5px margin

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

        // First reposition all existing dropdowns
        this.repositionDropdowns();

        // Then check for any new cards without dropdowns
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
                // Check if this card already has a dropdown
                const cardId = card.id || '';
                const hasDropdown = this.dropdowns.some(dropdown =>
                    dropdown.dataset.cardId === cardId || dropdown.originalCard === card
                );

                if (!hasDropdown) {
                    try {
                        // Create a placeholder immediately
                        const dropdown = this.createPlaceholderDropdown(card, cardArea);
                        if (dropdown) {
                            this.dropdowns.push(dropdown);
                            newCardsFound = true;

                            // Then fetch and update with real data
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
                    const hasCardChanges = Array.from(mutation.addedNodes).some(node =>
                        node.classList && node.classList.contains('board-card')
                    );

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
        // Remove all dropdowns
        this.dropdowns.forEach(dropdown => {
            if (dropdown && dropdown.parentNode) {
                dropdown.parentNode.removeChild(dropdown);
            }
        });

        // Clear interval
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }

        this.dropdowns = [];
        this.cardLinks.clear();

        this.initialized = false;
        console.log('LinkedItemsManager: Cleaned up');
    }


}
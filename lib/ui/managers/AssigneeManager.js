// AssigneeManager.js - Handles assignee-related functionality
import {getAssigneeWhitelist, saveAssigneeWhitelist} from '../../storage/SettingsStorage';
import Notification from '../components/Notification';

/**
 * Manager for assignee-related functionality
 */
export default class AssigneeManager {
    /**
     * Constructor for AssigneeManager
     * @param {Object} options - Configuration options
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Function} options.onAssigneesChange - Callback when assignees change
     */
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onAssigneesChange = options.onAssigneesChange || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Load assignee whitelist from storage
        this.assigneeWhitelist = getAssigneeWhitelist();

        // Initialize state
        this.currentUsers = [];
        this.isLoading = false;
    }

    /**
     * Get assignee whitelist
     * @returns {Array} Array of assignee objects
     */
    getAssigneeWhitelist() {
        return [...this.assigneeWhitelist];
    }

    /**
     * Save assignee whitelist
     * @param {Array} whitelist - Array of assignee objects
     */
    saveWhitelist(whitelist) {
        this.assigneeWhitelist = whitelist;
        saveAssigneeWhitelist(whitelist);

        // Notify listeners
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }
    }

    /**
     * Add an assignee to the whitelist
     * @param {Object} assignee - Assignee object with name and username
     * @returns {boolean} Whether assignee was added
     */
    addAssignee(assignee) {
        if (!assignee || !assignee.username) {
            return false;
        }

        // Check if already exists
        const existingIndex = this.assigneeWhitelist.findIndex(a =>
            a.username.toLowerCase() === assignee.username.toLowerCase());

        if (existingIndex >= 0) {
            // Update existing
            this.assigneeWhitelist[existingIndex] = {
                ...this.assigneeWhitelist[existingIndex],
                ...assignee
            };
        } else {
            // Add new
            this.assigneeWhitelist.push(assignee);
        }

        // Save changes
        saveAssigneeWhitelist(this.assigneeWhitelist);

        // Notify listeners
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }

        return true;
    }

    /**
     * Remove an assignee from the whitelist
     * @param {string} username - Username to remove
     * @returns {boolean} Whether assignee was removed
     */
    removeAssignee(username) {
        if (!username) {
            return false;
        }

        const initialLength = this.assigneeWhitelist.length;

        // Remove assignee with matching username
        this.assigneeWhitelist = this.assigneeWhitelist.filter(a =>
            a.username.toLowerCase() !== username.toLowerCase());

        // Check if anything was removed
        if (this.assigneeWhitelist.length === initialLength) {
            return false;
        }

        // Save changes
        saveAssigneeWhitelist(this.assigneeWhitelist);

        // Notify listeners
        if (typeof this.onAssigneesChange === 'function') {
            this.onAssigneesChange(this.assigneeWhitelist);
        }

        return true;
    }

    /**
     * Fetch current user from GitLab API
     * @returns {Promise<Object>} Current user object
     */
    async fetchCurrentUser() {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        try {
            const user = await this.gitlabApi.getCurrentUser();

            // Add to whitelist if not already present
            this.addAssignee({
                name: user.name,
                username: user.username
            });

            return user;
        } catch (error) {
            console.error('Error fetching current user:', error);
            throw error;
        }
    }

    /**
     * Fetch project members from GitLab API
     * @param {string} projectId - Project ID or path
     * @returns {Promise<Array>} Array of project members
     */
    async fetchProjectMembers(projectId) {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        if (!projectId) {
            throw new Error('Project ID is required');
        }

        try {
            // Mark as loading
            this.isLoading = true;

            // Get project members
            const members = await this.gitlabApi.callGitLabApi(
                `projects/${encodeURIComponent(projectId)}/members`,
                {params: {per_page: 100}}
            );

            // Process members
            this.currentUsers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            // No longer loading
            this.isLoading = false;

            // Return the members
            return this.currentUsers;
        } catch (error) {
            console.error(`Error fetching members for project ${projectId}:`, error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Fetch group members from GitLab API
     * @param {string} groupId - Group ID or path
     * @returns {Promise<Array>} Array of group members
     */
    async fetchGroupMembers(groupId) {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        if (!groupId) {
            throw new Error('Group ID is required');
        }

        try {
            // Mark as loading
            this.isLoading = true;

            // Get group members
            const members = await this.gitlabApi.callGitLabApi(
                `groups/${encodeURIComponent(groupId)}/members`,
                {params: {per_page: 100}}
            );

            // Process members
            this.currentUsers = members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));

            // No longer loading
            this.isLoading = false;

            // Return the members
            return this.currentUsers;
        } catch (error) {
            console.error(`Error fetching members for group ${groupId}:`, error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Insert assign command into textarea
     * @param {HTMLElement} textarea - Textarea to insert command into
     * @param {string} username - Username to assign to
     */
    insertAssignCommand(textarea, username) {
        if (!textarea) return;

        // Format command based on username
        let assignText = '/assign ';

        if (!username || username === 'none') {
            assignText += '@none';
        } else if (username === 'me') {
            assignText += '@me';
        } else {
            // Make sure username has @ prefix
            assignText += username.startsWith('@') ? username : `@${username}`;
        }

        // Check if there's already an assign command
        const assignRegex = /\/assign\s+@[^\n]+/g;
        const currentText = textarea.value;

        if (assignRegex.test(currentText)) {
            // Replace existing command
            textarea.value = currentText.replace(assignRegex, assignText);
        } else {
            // Insert at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Add newline if needed
            let insertText = assignText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text
            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Update cursor position
            const newPos = startPos + insertText.length;
            textarea.setSelectionRange(newPos, newPos);
        }

        // Focus textarea
        textarea.focus();

        // Show notification
        if (username === 'none') {
            this.notification.info('Issue will be unassigned');
        } else if (username === 'me') {
            this.notification.info('Issue will be assigned to you');
        } else {
            this.notification.info(`Issue will be assigned to ${username.replace('@', '')}`);
        }
    }

    /**
     * Create an assignee option element for the selector
     * @param {Object} assignee - Assignee object
     * @param {Function} onClick - Click handler
     * @returns {HTMLElement} Option element
     */
    createAssigneeOption(assignee, onClick) {
        const option = document.createElement('div');
        option.className = 'assignee-option';
        option.style.padding = '8px 12px';
        option.style.borderRadius = '4px';
        option.style.cursor = 'pointer';
        option.style.display = 'flex';
        option.style.alignItems = 'center';
        option.style.transition = 'background-color 0.2s ease';

        // Add hover effect
        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#f5f5f5';
        });

        option.addEventListener('mouseleave', () => {
            option.style.backgroundColor = '';
        });

        // Add avatar if available
        if (assignee.avatar_url) {
            const avatar = document.createElement('img');
            avatar.src = assignee.avatar_url;
            avatar.alt = assignee.name || assignee.username;
            avatar.style.width = '24px';
            avatar.style.height = '24px';
            avatar.style.borderRadius = '50%';
            avatar.style.marginRight = '8px';
            option.appendChild(avatar);
        } else {
            // Placeholder avatar with initials
            const avatarPlaceholder = document.createElement('div');
            avatarPlaceholder.style.width = '24px';
            avatarPlaceholder.style.height = '24px';
            avatarPlaceholder.style.borderRadius = '50%';
            avatarPlaceholder.style.backgroundColor = '#e0e0e0';
            avatarPlaceholder.style.display = 'flex';
            avatarPlaceholder.style.alignItems = 'center';
            avatarPlaceholder.style.justifyContent = 'center';
            avatarPlaceholder.style.marginRight = '8px';
            avatarPlaceholder.style.fontSize = '12px';
            avatarPlaceholder.style.fontWeight = 'bold';
            avatarPlaceholder.style.color = '#666';

            // Get initials
            const name = assignee.name || assignee.username || '';
            const initials = name.split(' ')
                .map(part => part.charAt(0))
                .slice(0, 2)
                .join('')
                .toUpperCase();

            avatarPlaceholder.textContent = initials;
            option.appendChild(avatarPlaceholder);
        }

        // Add assignee info
        const info = document.createElement('div');

        const name = document.createElement('div');
        name.textContent = assignee.name || assignee.username;
        name.style.fontWeight = 'bold';

        info.appendChild(name);

        // Add username if different from name
        if (assignee.username && assignee.username !== 'none' && assignee.username !== 'me' &&
            assignee.name && assignee.name !== assignee.username) {
            const username = document.createElement('div');
            username.textContent = `@${assignee.username}`;
            username.style.fontSize = '12px';
            username.style.color = '#666';
            info.appendChild(username);
        }

        option.appendChild(info);

        // Add click handler
        if (typeof onClick === 'function') {
            option.addEventListener('click', onClick);
        }

        return option;
    }

    /**
     * Open assignee selector dialog
     * @param {HTMLElement} targetElement - Textarea to insert command into after selection
     */
    openAssigneeSelector(targetElement) {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'assignee-selector-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Select Assignee';
        modalTitle.style.margin = '0';
        modalTitle.style.cursor = 'pointer'; // Show it's clickable
        // Add refresh icon next to title
        modalTitle.innerHTML = 'Select Assignee <span style="font-size: 14px; margin-left: 5px; color: #666;">🔄</span>';
        // Add hover effect
        modalTitle.addEventListener('mouseenter', () => {
            modalTitle.style.color = '#1f75cb';
        });
        modalTitle.addEventListener('mouseleave', () => {
            modalTitle.style.color = '';
        });
        // Add click event to refresh assignees
        modalTitle.addEventListener('click', () => {
            this.reloadAssigneeSelector(modalContent, targetElement);
        });

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

        // Create content area
        const contentArea = document.createElement('div');
        contentArea.id = 'assignee-selector-content';

        // Add search box
        const searchContainer = document.createElement('div');
        searchContainer.style.marginBottom = '15px';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search assignees...';
        searchInput.style.width = '100%';
        searchInput.style.padding = '8px';
        searchInput.style.borderRadius = '4px';
        searchInput.style.border = '1px solid #ccc';

        searchContainer.appendChild(searchInput);
        contentArea.appendChild(searchContainer);

        // Create special options section
        const specialOptions = document.createElement('div');
        specialOptions.style.marginBottom = '20px';

        // Create special assignee options
        const specialValues = [
            {value: 'none', label: 'Unassign', description: 'Remove assignee from this issue'},
            {value: '@me', label: 'Myself', description: 'Assign this issue to you'}
        ];

        specialValues.forEach(special => {
            const option = this.createAssigneeOption(
                special,
                () => {
                    this.insertAssignCommand(targetElement, special.value);
                    modalOverlay.remove();
                }
            );

            specialOptions.appendChild(option);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.borderBottom = '1px solid #eee';
        separator.style.margin = '20px 0';

        // Create loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.id = 'assignee-loading-indicator';
        loadingIndicator.textContent = 'Loading assignees...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.color = '#666';

        // Create assignees section
        const assigneesSection = document.createElement('div');
        assigneesSection.id = 'assignees-section';

        const assigneesTitle = document.createElement('h4');
        assigneesTitle.textContent = 'Whitelisted Assignees';
        assigneesTitle.style.marginBottom = '10px';
        // Make this header clickable too
        assigneesTitle.style.cursor = 'pointer';
        assigneesTitle.innerHTML = 'Whitelisted Assignees <span style="font-size: 12px; margin-left: 5px; color: #666;">🔄</span>';
        assigneesTitle.addEventListener('mouseenter', () => {
            assigneesTitle.style.color = '#1f75cb';
        });
        assigneesTitle.addEventListener('mouseleave', () => {
            assigneesTitle.style.color = '';
        });
        // Add click event to refresh assignees from whitelist
        assigneesTitle.addEventListener('click', () => {
            // Show loading state
            const assigneeList = document.getElementById('assignee-list-container');
            if (assigneeList) {
                assigneeList.innerHTML = '';
                assigneeList.appendChild(loadingIndicator.cloneNode(true));

                // Short timeout to show loading state before refreshing
                setTimeout(() => {
                    this.reloadWhitelistedAssignees(assigneeList, targetElement);
                }, 300);
            }
        });

        assigneesSection.appendChild(assigneesTitle);

        // Create assignee list container
        const assigneeList = document.createElement('div');
        assigneeList.id = 'assignee-list-container';
        assigneeList.style.height = '300px'; // Fixed height
        assigneeList.style.overflowY = 'auto';
        assigneeList.appendChild(loadingIndicator);
        assigneesSection.appendChild(assigneeList);

        // Add to content area
        contentArea.appendChild(specialOptions);
        contentArea.appendChild(separator);
        contentArea.appendChild(assigneesSection);

        // Add elements to container
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        // Load assignees
        this.loadAssigneesIntoSelector(assigneeList, targetElement);

        // Setup search functionality
        searchInput.addEventListener('input', () => {
            const searchText = searchInput.value.toLowerCase();

            // Filter assignees based on search
            const assigneeOptions = assigneeList.querySelectorAll('.assignee-option');
            assigneeOptions.forEach(option => {
                const nameElement = option.querySelector('div > div:first-child');
                const usernameElement = option.querySelector('div > div:last-child');

                if (!nameElement) return;

                const name = nameElement.textContent.toLowerCase();
                const username = usernameElement ? usernameElement.textContent.toLowerCase() : '';

                if (name.includes(searchText) || username.includes(searchText)) {
                    option.style.display = '';
                } else {
                    option.style.display = 'none';
                }
            });
        });
    }

    /**
     * Reload the entire assignee selector
     * @param {HTMLElement} modalContent - The modal content element
     * @param {HTMLElement} targetElement - The target textarea element
     */
    reloadAssigneeSelector(modalContent, targetElement) {
        // Show loading message
        const contentArea = modalContent.querySelector('#assignee-selector-content');
        if (!contentArea) return;

        // Add or update loading indicator
        let loadingIndicator = contentArea.querySelector('#full-reload-indicator');
        if (!loadingIndicator) {
            loadingIndicator = document.createElement('div');
            loadingIndicator.id = 'full-reload-indicator';
            loadingIndicator.style.position = 'absolute';
            loadingIndicator.style.top = '0';
            loadingIndicator.style.left = '0';
            loadingIndicator.style.width = '100%';
            loadingIndicator.style.height = '100%';
            loadingIndicator.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
            loadingIndicator.style.display = 'flex';
            loadingIndicator.style.justifyContent = 'center';
            loadingIndicator.style.alignItems = 'center';
            loadingIndicator.style.zIndex = '10';

            const loadingText = document.createElement('div');
            loadingText.textContent = 'Reloading assignees...';
            loadingText.style.backgroundColor = '#1f75cb';
            loadingText.style.color = 'white';
            loadingText.style.padding = '10px 20px';
            loadingText.style.borderRadius = '4px';
            loadingText.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';

            loadingIndicator.appendChild(loadingText);
            modalContent.style.position = 'relative';
            modalContent.appendChild(loadingIndicator);
        } else {
            loadingIndicator.style.display = 'flex';
        }

        // Refresh whitelisted assignees (with short timeout to show loading)
        setTimeout(() => {
            // Reload the assignee list
            const assigneeList = contentArea.querySelector('#assignee-list-container');
            if (assigneeList) {
                assigneeList.innerHTML = '';

                const tempLoadingIndicator = document.createElement('div');
                tempLoadingIndicator.textContent = 'Loading assignees...';
                tempLoadingIndicator.style.textAlign = 'center';
                tempLoadingIndicator.style.padding = '20px';
                tempLoadingIndicator.style.color = '#666';

                assigneeList.appendChild(tempLoadingIndicator);

                // Reload the assignees
                this.loadAssigneesIntoSelector(assigneeList, targetElement);
            }

            // Hide the full loading overlay
            setTimeout(() => {
                if (loadingIndicator) {
                    loadingIndicator.style.display = 'none';
                }
            }, 300);
        }, 500);

        // Show a notification for better feedback
        this.notification.info('Refreshing assignee list...');
    }
    /**
     * Reload whitelisted assignees into the container
     * @param {HTMLElement} container - Container to add assignees to
     * @param {HTMLElement} targetElement - Target textarea element
     */
    reloadWhitelistedAssignees(container, targetElement) {
        // Clear container
        container.innerHTML = '';

        // Get fresh whitelist (to ensure we have the latest data)
        this.assigneeWhitelist = getAssigneeWhitelist();

        if (this.assigneeWhitelist.length === 0) {
            // Show empty message
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some from Available Users or add manually below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '15px';
            container.appendChild(emptyMessage);
        } else {
            // Create a grid layout for assignees
            const assigneeGrid = document.createElement('div');
            assigneeGrid.style.display = 'grid';
            assigneeGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
            assigneeGrid.style.gap = '10px';

            // Sort assignees alphabetically by name
            const sortedAssignees = [...this.assigneeWhitelist].sort((a, b) => {
                const nameA = (a.name || a.username || '').toLowerCase();
                const nameB = (b.name || b.username || '').toLowerCase();
                return nameA.localeCompare(nameB);
            });

            // Add each assignee to the grid
            sortedAssignees.forEach(assignee => {
                const option = this.createAssigneeOption(
                    assignee,
                    () => {
                        this.insertAssignCommand(targetElement, assignee.username);
                        // Find and close the modal
                        const modal = document.getElementById('assignee-selector-overlay');
                        if (modal) modal.remove();
                    }
                );

                assigneeGrid.appendChild(option);
            });

            container.appendChild(assigneeGrid);
        }

        // Add button to fetch group members
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'center';
        buttonContainer.style.marginTop = '15px';

        const fetchButton = document.createElement('button');
        fetchButton.textContent = 'Fetch Project Members';
        fetchButton.style.padding = '8px 16px';
        fetchButton.style.backgroundColor = '#1f75cb';
        fetchButton.style.color = 'white';
        fetchButton.style.border = 'none';
        fetchButton.style.borderRadius = '4px';
        fetchButton.style.cursor = 'pointer';

        fetchButton.addEventListener('click', () => {
            this.fetchProjectMembers().then(members => {
                if (members && members.length > 0) {
                    // Show project members in a separate section
                    this.showProjectMembers(container, members, targetElement);
                } else {
                    this.notification.info('No project members found');
                }
            }).catch(error => {
                console.error('Error fetching project members:', error);
                this.notification.error('Failed to fetch project members');
            });
        });

        buttonContainer.appendChild(fetchButton);
        container.appendChild(buttonContainer);
    }

    /**
     * Show project members in the container
     * @param {HTMLElement} container - Container to add members to
     * @param {Array} members - Array of project members
     * @param {HTMLElement} targetElement - Target textarea element
     */
    showProjectMembers(container, members, targetElement) {
        // Create project members section
        const membersSection = document.createElement('div');
        membersSection.style.marginTop = '20px';

        const membersTitle = document.createElement('h4');
        membersTitle.textContent = 'Project Members';
        membersTitle.style.borderTop = '1px solid #eee';
        membersTitle.style.paddingTop = '15px';
        membersTitle.style.marginBottom = '10px';

        membersSection.appendChild(membersTitle);

        // Create grid for members
        const membersGrid = document.createElement('div');
        membersGrid.style.display = 'grid';
        membersGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
        membersGrid.style.gap = '10px';

        // Sort members alphabetically
        const sortedMembers = [...members].sort((a, b) => {
            return (a.name || a.username || '').localeCompare(b.name || b.username || '');
        });

        // Add each member to the grid
        sortedMembers.forEach(member => {
            // Check if already in whitelist to avoid duplicates
            const inWhitelist = this.assigneeWhitelist.some(a =>
                a.username.toLowerCase() === member.username.toLowerCase()
            );

            if (!inWhitelist) {
                const option = this.createAssigneeOption(
                    member,
                    () => {
                        this.insertAssignCommand(targetElement, member.username);
                        // Find and close the modal
                        const modal = document.getElementById('assignee-selector-overlay');
                        if (modal) modal.remove();
                    }
                );

                // Add button to add to whitelist
                const addButton = document.createElement('button');
                addButton.textContent = '+ Save';
                addButton.style.padding = '4px 8px';
                addButton.style.backgroundColor = '#28a745';
                addButton.style.color = 'white';
                addButton.style.border = 'none';
                addButton.style.borderRadius = '3px';
                addButton.style.marginLeft = '10px';
                addButton.style.cursor = 'pointer';

                addButton.addEventListener('click', (e) => {
                    e.stopPropagation(); // Prevent selecting this assignee

                    // Add to whitelist
                    this.addAssignee({
                        name: member.name || member.username,
                        username: member.username
                    });

                    // Show notification
                    this.notification.success(`Added ${member.name || member.username} to saved assignees`);

                    // Update button to show added
                    addButton.textContent = '✓ Saved';
                    addButton.style.backgroundColor = '#6c757d';
                    addButton.disabled = true;
                    addButton.style.cursor = 'default';
                });

                // Find where to add the button
                const infoElement = option.querySelector('div:last-child');
                if (infoElement) {
                    infoElement.appendChild(addButton);
                }

                membersGrid.appendChild(option);
            }
        });

        // Check if we added any new members
        if (membersGrid.children.length === 0) {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'All project members are already in your saved assignees.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            emptyMessage.style.padding = '15px';
            membersSection.appendChild(emptyMessage);
        } else {
            membersSection.appendChild(membersGrid);
        }

        container.appendChild(membersSection);
    }

    /**
     * Load assignees into the selector
     * @param {HTMLElement} container - Container to add assignees to
     * @param {HTMLElement} targetElement - Target textarea element
     */
    loadAssigneesIntoSelector(container, targetElement) {
        // Clear container
        container.innerHTML = '';

        // Show loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading assignees...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.color = '#666';
        container.appendChild(loadingIndicator);

        // Reload assignees from whitelist (short timeout to show loading state)
        setTimeout(() => {
            this.reloadWhitelistedAssignees(container, targetElement);
        }, 300);
    }

    /**
     * Open assignee management dialog
     * Allows adding/removing assignees without assigning to a specific issue
     */
    openAssigneeManager() {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '1010';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';

        // Create modal header
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

        const modalTitle = document.createElement('h3');
        modalTitle.textContent = 'Manage Assignees';
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

        // Create content area
        const contentArea = document.createElement('div');

        // Create description
        const description = document.createElement('p');
        description.textContent = 'Manage assignees that appear in the assignee dropdown. These users will be available for quick assignment to issues.';
        description.style.marginBottom = '20px';

        // Create assignee list section
        const listSection = document.createElement('div');
        listSection.style.marginBottom = '20px';

        const listTitle = document.createElement('h4');
        listTitle.textContent = 'Current Assignees';
        listTitle.style.marginBottom = '10px';
        listTitle.style.fontSize = '16px';

        listSection.appendChild(listTitle);

        // Create assignee list
        const assigneeList = document.createElement('div');
        assigneeList.style.height = '300px'; // Fixed height
        assigneeList.style.overflowY = 'auto';
        assigneeList.style.border = '1px solid #eee';
        assigneeList.style.borderRadius = '4px';

        // Populate assignee list
        if (this.assigneeWhitelist.length > 0) {
            this.assigneeWhitelist.forEach((assignee, index) => {
                const assigneeItem = document.createElement('div');
                assigneeItem.style.display = 'flex';
                assigneeItem.style.justifyContent = 'space-between';
                assigneeItem.style.alignItems = 'center';
                assigneeItem.style.padding = '10px';
                assigneeItem.style.borderBottom = index < this.assigneeWhitelist.length - 1 ? '1px solid #eee' : 'none';

                const assigneeInfo = document.createElement('div');
                assigneeInfo.style.display = 'flex';
                assigneeInfo.style.alignItems = 'center';

                // Add avatar placeholder
                const avatarPlaceholder = document.createElement('div');
                avatarPlaceholder.style.width = '32px';
                avatarPlaceholder.style.height = '32px';
                avatarPlaceholder.style.borderRadius = '50%';
                avatarPlaceholder.style.backgroundColor = '#e0e0e0';
                avatarPlaceholder.style.display = 'flex';
                avatarPlaceholder.style.alignItems = 'center';
                avatarPlaceholder.style.justifyContent = 'center';
                avatarPlaceholder.style.marginRight = '10px';
                avatarPlaceholder.style.fontSize = '14px';
                avatarPlaceholder.style.fontWeight = 'bold';
                avatarPlaceholder.style.color = '#666';

                // Get initials
                const name = assignee.name || assignee.username || '';
                const initials = name.split(' ')
                    .map(part => part.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                avatarPlaceholder.textContent = initials;
                assigneeInfo.appendChild(avatarPlaceholder);

                // Add name and username
                const nameContainer = document.createElement('div');

                const displayName = document.createElement('div');
                displayName.textContent = assignee.name || assignee.username;
                displayName.style.fontWeight = 'bold';

                const username = document.createElement('div');
                username.textContent = `@${assignee.username}`;
                username.style.fontSize = '12px';
                username.style.color = '#666';

                nameContainer.appendChild(displayName);
                nameContainer.appendChild(username);
                assigneeInfo.appendChild(nameContainer);

                // Create remove button
                const removeButton = document.createElement('button');
                removeButton.textContent = 'Remove';
                removeButton.style.padding = '4px 8px';
                removeButton.style.backgroundColor = '#dc3545';
                removeButton.style.color = 'white';
                removeButton.style.border = 'none';
                removeButton.style.borderRadius = '4px';
                removeButton.style.cursor = 'pointer';

                removeButton.onclick = () => {
                    this.removeAssignee(assignee.username);
                    assigneeItem.remove();

                    // Show success message
                    this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);

                    // Show empty message if list is now empty
                    if (this.assigneeWhitelist.length === 0) {
                        const emptyMessage = document.createElement('div');
                        emptyMessage.textContent = 'No assignees added yet. Add some below.';
                        emptyMessage.style.padding = '10px';
                        emptyMessage.style.color = '#666';
                        emptyMessage.style.fontStyle = 'italic';
                        assigneeList.appendChild(emptyMessage);
                    }
                };

                assigneeItem.appendChild(assigneeInfo);
                assigneeItem.appendChild(removeButton);

                assigneeList.appendChild(assigneeItem);
            });
        } else {
            // Show empty message
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.padding = '10px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            assigneeList.appendChild(emptyMessage);
        }

        listSection.appendChild(assigneeList);

        // Create add assignee form
        const addForm = document.createElement('div');
        addForm.style.marginTop = '20px';
        addForm.style.padding = '15px';
        addForm.style.backgroundColor = '#f8f9fa';
        addForm.style.borderRadius = '4px';

        const formTitle = document.createElement('h4');
        formTitle.textContent = 'Add New Assignee';
        formTitle.style.marginBottom = '15px';
        formTitle.style.fontSize = '16px';

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
        nameInput.style.padding = '8px';
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
        usernameInput.style.padding = '8px';
        usernameInput.style.borderRadius = '4px';
        usernameInput.style.border = '1px solid #ccc';

        usernameContainer.appendChild(usernameLabel);
        usernameContainer.appendChild(usernameInput);

        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';

        const addButton = document.createElement('button');
        addButton.textContent = 'Add Assignee';
        addButton.style.padding = '8px 16px';
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

            // Add to whitelist
            const newAssignee = {
                name: name || username,
                username: username
            };

            this.addAssignee(newAssignee);

            // Show success message
            this.notification.success(`Added assignee: ${newAssignee.name}`);

            // Close and reopen to refresh the list
            modalOverlay.remove();
            this.openAssigneeManager();
        };

        // Add fetch current user button
        const fetchUserButton = document.createElement('button');
        fetchUserButton.textContent = 'Add Current User';
        fetchUserButton.style.padding = '8px 16px';
        fetchUserButton.style.backgroundColor = '#17a2b8';
        fetchUserButton.style.color = 'white';
        fetchUserButton.style.border = 'none';
        fetchUserButton.style.borderRadius = '4px';
        fetchUserButton.style.cursor = 'pointer';
        fetchUserButton.style.marginRight = '10px';

        fetchUserButton.onclick = async () => {
            // Disable button while loading
            fetchUserButton.disabled = true;
            fetchUserButton.textContent = 'Loading...';

            try {
                // Fetch current user
                const user = await this.fetchCurrentUser();

                // Show success message
                this.notification.success(`Added current user: ${user.name}`);

                // Close and reopen to refresh the list
                modalOverlay.remove();
                this.openAssigneeManager();
            } catch (error) {
                this.notification.error('Failed to fetch current user');

                // Re-enable button
                fetchUserButton.disabled = false;
                fetchUserButton.textContent = 'Add Current User';
            }
        };

        buttonContainer.appendChild(fetchUserButton);
        buttonContainer.appendChild(addButton);

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(buttonContainer);

        // Add footer with close button
        const footer = document.createElement('div');
        footer.style.marginTop = '20px';
        footer.style.display = 'flex';
        footer.style.justifyContent = 'flex-end';

        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = 'Close';
        closeModalButton.style.padding = '8px 16px';
        closeModalButton.style.backgroundColor = '#6c757d';
        closeModalButton.style.color = 'white';
        closeModalButton.style.border = 'none';
        closeModalButton.style.borderRadius = '4px';
        closeModalButton.style.cursor = 'pointer';

        closeModalButton.onclick = () => {
            modalOverlay.remove();
        };

        footer.appendChild(closeModalButton);

        // Assemble the modal
        contentArea.appendChild(description);
        contentArea.appendChild(listSection);
        contentArea.appendChild(addForm);
        contentArea.appendChild(footer);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }
}
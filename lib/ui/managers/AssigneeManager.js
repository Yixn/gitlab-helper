// AssigneeManager.js - Handles assignee-related functionality
import { getAssigneeWhitelist, saveAssigneeWhitelist } from '../../storage/SettingsStorage';
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
                { params: { per_page: 100 } }
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
                { params: { per_page: 100 } }
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

        // Create special options section
        const specialOptions = document.createElement('div');
        specialOptions.style.marginBottom = '20px';

        // Create "Unassign" option
        const unassignOption = this.createAssigneeOption(
            { name: 'Unassign', username: 'none' },
            () => {
                this.insertAssignCommand(targetElement, 'none');
                modalOverlay.remove();
            }
        );

        // Create "Assign to me" option
        const assignToMeOption = this.createAssigneeOption(
            { name: 'Assign to me', username: 'me' },
            () => {
                this.insertAssignCommand(targetElement, 'me');
                modalOverlay.remove();
            }
        );

        specialOptions.appendChild(unassignOption);
        specialOptions.appendChild(assignToMeOption);

        // Add separator
        const separator = document.createElement('div');
        separator.style.borderBottom = '1px solid #eee';
        separator.style.marginBottom = '15px';

        // Create whitelist section
        const whitelistSection = document.createElement('div');
        whitelistSection.style.marginBottom = '20px';

        const whitelistTitle = document.createElement('h4');
        whitelistTitle.textContent = 'Saved Assignees';
        whitelistTitle.style.marginBottom = '10px';
        whitelistTitle.style.fontSize = '16px';

        whitelistSection.appendChild(whitelistTitle);

        // Add whitelist items
        if (this.assigneeWhitelist.length > 0) {
            const whitelistGrid = document.createElement('div');
            whitelistGrid.style.display = 'grid';
            whitelistGrid.style.gridTemplateColumns = 'repeat(auto-fill, minmax(250px, 1fr))';
            whitelistGrid.style.gap = '8px';

            this.assigneeWhitelist.forEach(assignee => {
                const option = this.createAssigneeOption(
                    assignee,
                    () => {
                        this.insertAssignCommand(targetElement, assignee.username);
                        modalOverlay.remove();
                    }
                );

                whitelistGrid.appendChild(option);
            });

            whitelistSection.appendChild(whitelistGrid);
        } else {
            const emptyMessage = document.createElement('p');
            emptyMessage.textContent = 'No saved assignees. Add some below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';

            whitelistSection.appendChild(emptyMessage);
        }

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

        const addButtonContainer = document.createElement('div');
        addButtonContainer.style.display = 'flex';
        addButtonContainer.style.justifyContent = 'flex-end';

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
            this.openAssigneeSelector(targetElement);
        };

        addButtonContainer.appendChild(addButton);

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(addButtonContainer);

        // Assemble the modal
        contentArea.appendChild(specialOptions);
        contentArea.appendChild(separator);
        contentArea.appendChild(whitelistSection);
        contentArea.appendChild(addForm);

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
        assigneeList.style.maxHeight = '300px';
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
// SettingsManager.js - Manages application settings and UI
import {
    getLabelWhitelist, saveLabelWhitelist, resetLabelWhitelist,
    getAssigneeWhitelist, saveAssigneeWhitelist
} from '../../storage/SettingsStorage';
import {generateColorFromString, getContrastColor} from '../../core/Utils';
import Notification from '../components/Notification';

/**
 * Manager for application settings
 */
export default class SettingsManager {
    /**
     * Constructor for SettingsManager
     * @param {Object} options - Configuration options
     * @param {Object} options.labelManager - Label manager instance
     * @param {Object} options.assigneeManager - Assignee manager instance
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Function} options.onSettingsChanged - Callback when settings change
     */
    constructor(options = {}) {
        this.labelManager = options.labelManager;
        this.assigneeManager = options.assigneeManager;
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.onSettingsChanged = options.onSettingsChanged || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Store fetched assignees
        this.availableAssignees = [];
        this.isLoadingAssignees = false;
    }

    /**
     * Create and open settings modal with enhanced UI
     */
    openSettingsModal() {
        // Create modal overlay (background)
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'git-helper-settings-overlay';
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

        // Create modal content container - make it wider
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '700px'; // Wider for better readability
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

        // Create content container
        const contentContainer = document.createElement('div');

        // Create collapsible sections
        this.createCollapsibleSection(
            contentContainer,
            'Assignees',
            'Manage assignees for quick access in comments',
            (container) => this.createAssigneeSettings(container),
            true // Start expanded
        );

        this.createCollapsibleSection(
            contentContainer,
            'Labels',
            'Manage which labels appear in the dropdown menus',
            (container) => this.createLabelWhitelistSettings(container),
            false // Start collapsed
        );

        this.createCollapsibleSection(
            contentContainer,
            'Appearance',
            'Customize the appearance of GitLab Sprint Helper',
            (container) => this.createAppearanceSettings(container),
            false // Start collapsed
        );

        // Add button container at bottom
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.borderTop = '1px solid #eee';
        buttonContainer.style.paddingTop = '15px';

        // Reset to defaults button
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

        // Close button
        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = 'Close';
        closeModalButton.style.padding = '8px 16px';
        closeModalButton.style.backgroundColor = '#28a745';
        closeModalButton.style.color = 'white';
        closeModalButton.style.border = 'none';
        closeModalButton.style.borderRadius = '4px';
        closeModalButton.style.cursor = 'pointer';
        closeModalButton.onclick = () => {
            modalOverlay.remove();
        };

        buttonContainer.appendChild(resetButton);
        buttonContainer.appendChild(closeModalButton);

        // Assemble the modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentContainer);
        modalContent.appendChild(buttonContainer);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close modal when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    /**
     * Create a collapsible section
     * @param {HTMLElement} container - Parent container
     * @param {string} title - Section title
     * @param {string} description - Section description
     * @param {Function} contentBuilder - Function that builds the section content
     * @param {boolean} startExpanded - Whether section should start expanded
     */
    createCollapsibleSection(container, title, description, contentBuilder, startExpanded = false) {
        // Always start collapsed regardless of passed parameter
        startExpanded = false;

        // Create section container
        const section = document.createElement('div');
        section.className = 'settings-section';
        section.style.marginBottom = '15px';
        section.style.border = '1px solid #ddd';
        section.style.borderRadius = '6px';
        section.style.overflow = 'hidden';

        // Create header/toggle
        const header = document.createElement('div');
        header.className = 'settings-section-header';
        header.style.padding = '12px 15px';
        header.style.backgroundColor = '#f8f9fa';
        header.style.borderBottom = startExpanded ? '1px solid #ddd' : 'none';
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.cursor = 'pointer';
        header.style.transition = 'background-color 0.2s ease';

        // Add hover effect
        header.addEventListener('mouseenter', () => {
            header.style.backgroundColor = '#e9ecef';
        });
        header.addEventListener('mouseleave', () => {
            header.style.backgroundColor = '#f8f9fa';
        });

        // Title container
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

        // Toggle indicator
        const toggle = document.createElement('span');
        toggle.textContent = startExpanded ? '▼' : '▶';
        toggle.style.fontSize = '14px';
        toggle.style.transition = 'transform 0.3s ease';

        header.appendChild(titleContainer);
        header.appendChild(toggle);

        // Create content container
        const content = document.createElement('div');
        content.className = 'settings-section-content';
        content.style.padding = '15px';
        content.style.display = startExpanded ? 'block' : 'none';
        content.style.backgroundColor = 'white';

        // Build content using the provided function (lazily load content only when opened)
        let contentBuilt = false;

        // Add toggle behavior
        header.addEventListener('click', () => {
            const isExpanded = content.style.display === 'block';
            content.style.display = isExpanded ? 'none' : 'block';
            toggle.textContent = isExpanded ? '▶' : '▼';
            header.style.borderBottom = isExpanded ? 'none' : '1px solid #ddd';

            // Build content if this is the first time opening
            if (!contentBuilt && !isExpanded) {
                contentBuilder(content);
                contentBuilt = true;
            }
        });

        // Assemble section
        section.appendChild(header);
        section.appendChild(content);
        container.appendChild(section);

        return section;
    }

    /**
     * Create enhanced assignee settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createAssigneeSettings(container) {
        const assigneeSection = document.createElement('div');

        // Create top actions row
        const actionsRow = document.createElement('div');
        actionsRow.style.display = 'flex';
        actionsRow.style.justifyContent = 'space-between';
        actionsRow.style.marginBottom = '15px';
        actionsRow.style.gap = '10px';

        // Create search input
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

        // Create fetch button
        const fetchButton = document.createElement('button');
        fetchButton.textContent = 'Fetch GitLab Users';
        fetchButton.style.padding = '8px 12px';
        fetchButton.style.backgroundColor = '#1f75cb';
        fetchButton.style.color = 'white';
        fetchButton.style.border = 'none';
        fetchButton.style.borderRadius = '4px';
        fetchButton.style.cursor = 'pointer';
        fetchButton.onclick = () => this.fetchGitLabUsers(assigneeListContainer);

        actionsRow.appendChild(searchContainer);
        actionsRow.appendChild(fetchButton);

        assigneeSection.appendChild(actionsRow);

        // Create tabs for Whitelisted vs. Available
        const tabsContainer = document.createElement('div');
        tabsContainer.style.display = 'flex';
        tabsContainer.style.borderBottom = '1px solid #dee2e6';
        tabsContainer.style.marginBottom = '15px';

        const tabs = [
            {id: 'whitelisted', label: 'My Assignees', active: true},
            {id: 'available', label: 'Available Users', active: false}
        ];

        const tabElements = {};
        const tabContents = {};

        // Create tab buttons
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

            // Add hover effect
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

            // Handle tab clicks
            tabElement.addEventListener('click', () => {
                // Deactivate all tabs
                tabs.forEach(t => {
                    t.active = false;
                    tabElements[t.id].style.borderBottom = 'none';
                    tabElements[t.id].style.fontWeight = 'normal';
                    tabElements[t.id].style.backgroundColor = '';
                    tabContents[t.id].style.display = 'none';
                });

                // Activate clicked tab
                tab.active = true;
                tabElement.style.borderBottom = '2px solid #1f75cb';
                tabElement.style.fontWeight = 'bold';
                tabContents[tab.id].style.display = 'block';

                // Special handling for available users tab - fetch if empty
                if (tab.id === 'available' && this.availableAssignees.length === 0) {
                    this.fetchGitLabUsers(availableListContainer);
                }
            });

            tabElements[tab.id] = tabElement;
            tabsContainer.appendChild(tabElement);
        });

        assigneeSection.appendChild(tabsContainer);

        // Create content containers for each tab
        const whitelistedContent = document.createElement('div');
        whitelistedContent.style.display = 'block';

        const availableContent = document.createElement('div');
        availableContent.style.display = 'none';

        // Populate whitelisted assignees
        const assigneeListContainer = document.createElement('div');
        assigneeListContainer.style.maxHeight = '300px';
        assigneeListContainer.style.overflowY = 'auto';
        assigneeListContainer.style.border = '1px solid #eee';
        assigneeListContainer.style.borderRadius = '4px';

        // Create empty message function
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add from Available Users or add manually below.';
            emptyMessage.style.padding = '15px';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.textAlign = 'center';
            return emptyMessage;
        };

        // Get whitelist from the assignee manager if available
        let assignees = [];
        if (this.assigneeManager) {
            assignees = this.assigneeManager.getAssigneeWhitelist();
        } else {
            assignees = getAssigneeWhitelist();
        }

        // Populate whitelist
        if (assignees.length > 0) {
            assignees.forEach((assignee, index) => {
                assigneeListContainer.appendChild(this.createAssigneeListItem(assignee, index, assigneeListContainer, createEmptyMessage));
            });
        } else {
            assigneeListContainer.appendChild(createEmptyMessage());
        }

        whitelistedContent.appendChild(assigneeListContainer);

        // Add manual assignee form to whitelisted tab
        whitelistedContent.appendChild(this.createAddAssigneeForm(assigneeListContainer, createEmptyMessage));

        // Create available users container
        const availableListContainer = document.createElement('div');
        availableListContainer.className = 'available-assignees-list';
        availableListContainer.style.maxHeight = '400px';
        availableListContainer.style.overflowY = 'auto';
        availableListContainer.style.border = '1px solid #eee';
        availableListContainer.style.borderRadius = '4px';

        // Add loading or empty message initially
        const availableEmptyMessage = document.createElement('div');
        availableEmptyMessage.textContent = 'Click "Fetch GitLab Users" to load available assignees.';
        availableEmptyMessage.style.padding = '15px';
        availableEmptyMessage.style.color = '#666';
        availableEmptyMessage.style.fontStyle = 'italic';
        availableEmptyMessage.style.textAlign = 'center';

        availableListContainer.appendChild(availableEmptyMessage);
        availableContent.appendChild(availableListContainer);

        // Store references to content containers
        tabContents['whitelisted'] = whitelistedContent;
        tabContents['available'] = availableContent;

        // Add content containers to section
        assigneeSection.appendChild(whitelistedContent);
        assigneeSection.appendChild(availableContent);

        // Add search functionality
        searchInput.addEventListener('input', () => {
            const searchText = searchInput.value.toLowerCase();
            const activeTab = tabs.find(t => t.active).id;

            // Determine which list to search based on active tab
            const list = activeTab === 'whitelisted' ? assigneeListContainer : availableListContainer;
            const items = list.querySelectorAll('.assignee-item');

            // Filter items
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

    /**
     * Create form to add assignees manually
     * @param {HTMLElement} listContainer - Container for assignee list
     * @param {Function} createEmptyMessage - Function to create empty message
     * @returns {HTMLElement} Form container
     */
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

        // Create name field
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

        // Create username field
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

        // Create button container
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

            // Add to whitelist
            const newAssignee = {
                name: name || username,
                username: username
            };

            // Check if we should use the assigneeManager
            if (this.assigneeManager) {
                this.assigneeManager.addAssignee(newAssignee);
            } else {
                // Direct add to whitelist
                const assignees = getAssigneeWhitelist();
                const existingIndex = assignees.findIndex(a => a.username === username);

                if (existingIndex >= 0) {
                    // Update existing
                    assignees[existingIndex] = newAssignee;
                } else {
                    // Add new
                    assignees.push(newAssignee);
                }

                // Save whitelist
                saveAssigneeWhitelist(assignees);
            }

            // Refresh the list
            const emptyMessage = listContainer.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // Add the new assignee to the list
            const assignees = getAssigneeWhitelist();
            listContainer.appendChild(this.createAssigneeListItem(
                newAssignee,
                assignees.length - 1,
                listContainer,
                createEmptyMessage
            ));

            // Clear inputs
            nameInput.value = '';
            usernameInput.value = '';

            // Show success message
            this.notification.success(`Added assignee: ${newAssignee.name}`);

            // Notify of change
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttonContainer.appendChild(addButton);

        // Assemble the form
        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(buttonContainer);

        return addForm;
    }

    /**
     * Fetch GitLab users from API
     * @param {HTMLElement} container - Container to display users in
     */
    async fetchGitLabUsers(container) {
        if (!this.gitlabApi) {
            this.notification.error('GitLab API not available');
            return;
        }

        // Show loading state
        this.isLoadingAssignees = true;
        container.innerHTML = '';

        const loadingMessage = document.createElement('div');
        loadingMessage.textContent = 'Loading users from GitLab...';
        loadingMessage.style.padding = '15px';
        loadingMessage.style.textAlign = 'center';
        container.appendChild(loadingMessage);

        try {
            // Get path info for current project/group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }

            // Fetch users based on path info
            let users = [];
            if (pathInfo.type === 'project') {
                users = await this.gitlabApi.callGitLabApi(
                    `projects/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            } else if (pathInfo.type === 'group') {
                users = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            }

            // Process and store users
            this.availableAssignees = users.map(user => ({
                id: user.id,
                name: user.name,
                username: user.username,
                avatar_url: user.avatar_url
            }));

            // Display users
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
    }

    /**
     * Render available users in container
     * @param {HTMLElement} container - Container to render users in
     */
    renderAvailableUsers(container) {
        // Clear container
        container.innerHTML = '';

        // Get current whitelist for comparison
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

        // Sort users alphabetically
        this.availableAssignees.sort((a, b) => a.name.localeCompare(b.name));

        // Create user items
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

            // User info section
            const userInfo = document.createElement('div');
            userInfo.style.display = 'flex';
            userInfo.style.alignItems = 'center';

            // Avatar
            if (user.avatar_url) {
                const avatar = document.createElement('img');
                avatar.src = user.avatar_url;
                avatar.style.width = '30px';
                avatar.style.height = '30px';
                avatar.style.borderRadius = '50%';
                avatar.style.marginRight = '10px';
                userInfo.appendChild(avatar);
            } else {
                // Placeholder avatar
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

                // Get initials
                const name = user.name || user.username;
                const initials = name.split(' ')
                    .map(part => part.charAt(0))
                    .slice(0, 2)
                    .join('')
                    .toUpperCase();

                avatarPlaceholder.textContent = initials;
                userInfo.appendChild(avatarPlaceholder);
            }

            // User details
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

            // Action button
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

                // Add event listener
                actionButton.addEventListener('click', () => {
                    // Add to whitelist
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

                    // Update UI
                    actionButton.textContent = 'Added ✓';
                    actionButton.style.backgroundColor = '#e9ecef';
                    actionButton.style.color = '#28a745';
                    actionButton.style.cursor = 'default';
                    userItem.style.backgroundColor = 'rgba(40, 167, 69, 0.05)';

                    // Show notification
                    this.notification.success(`Added ${user.name} to assignees`);

                    // Notify of change
                    if (this.onSettingsChanged) {
                        this.onSettingsChanged('assignees');
                    }
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

    /**
     * Create an assignee list item
     * @param {Object} assignee - Assignee object
     * @param {number} index - Index in the list
     * @param {HTMLElement} listContainer - List container
     * @param {Function} createEmptyMessage - Function to create empty message
     * @returns {HTMLElement} Assignee list item
     */
    createAssigneeListItem(assignee, index, listContainer, createEmptyMessage) {
        const item = document.createElement('div');
        item.className = 'assignee-item';
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px 15px';
        item.style.borderBottom = '1px solid #eee';

        // Create assignee info
        const info = document.createElement('div');
        info.style.display = 'flex';
        info.style.alignItems = 'center';

        // Create avatar placeholder
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

        // Get initials
        const name = assignee.name || assignee.username;
        const initials = name.split(' ')
            .map(part => part.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase();

        avatar.textContent = initials;
        info.appendChild(avatar);

        // Create name container
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

        // Create buttons container
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
            // Get current assignees
            let assignees = [];

            if (this.assigneeManager) {
                this.assigneeManager.removeAssignee(assignee.username);
                assignees = this.assigneeManager.getAssigneeWhitelist();
            } else {
                assignees = getAssigneeWhitelist();
                // Remove assignee
                const filteredAssignees = assignees.filter(a =>
                    a.username.toLowerCase() !== assignee.username.toLowerCase()
                );
                // Save whitelist
                saveAssigneeWhitelist(filteredAssignees);
                assignees = filteredAssignees;
            }

            // Remove from list
            item.remove();

            // Show empty message if no assignees left
            if (assignees.length === 0) {
                listContainer.appendChild(createEmptyMessage());
            }

            // Show success message
            this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);

            // Notify of change
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttons.appendChild(removeButton);

        // Assemble item
        item.appendChild(info);
        item.appendChild(buttons);

        return item;
    }

    /**
     * Create label whitelist settings section
     * @param {HTMLElement} container - Container to add settings to
     */
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

        // Add label whitelist editor
        this.createWhitelistEditor(whitelistSection);

        // Add save and reset buttons for this section
        const labelButtonContainer = document.createElement('div');
        labelButtonContainer.style.display = 'flex';
        labelButtonContainer.style.justifyContent = 'flex-end';
        labelButtonContainer.style.marginTop = '15px';
        labelButtonContainer.style.gap = '10px';

        // Reset labels button
        const resetLabelsButton = document.createElement('button');
        resetLabelsButton.textContent = 'Reset Labels';
        resetLabelsButton.style.padding = '6px 12px';
        resetLabelsButton.style.backgroundColor = '#6c757d';
        resetLabelsButton.style.color = 'white';
        resetLabelsButton.style.border = 'none';
        resetLabelsButton.style.borderRadius = '4px';
        resetLabelsButton.style.cursor = 'pointer';
        resetLabelsButton.onclick = () => {
            if (confirm('Reset label whitelist to default values?')) {
                this.resetLabelWhitelist();

                // Refresh the editor
                while (whitelistSection.firstChild) {
                    whitelistSection.removeChild(whitelistSection.firstChild);
                }

                whitelistSection.appendChild(whitelistTitle);
                whitelistSection.appendChild(whitelistDescription);
                this.createWhitelistEditor(whitelistSection);
                whitelistSection.appendChild(labelButtonContainer);

                this.notification.success('Label whitelist reset to defaults');
            }
        };

        // Save labels button
        const saveLabelsButton = document.createElement('button');
        saveLabelsButton.textContent = 'Save Labels';
        saveLabelsButton.style.padding = '6px 12px';
        saveLabelsButton.style.backgroundColor = '#28a745';
        saveLabelsButton.style.color = 'white';
        saveLabelsButton.style.border = 'none';
        saveLabelsButton.style.borderRadius = '4px';
        saveLabelsButton.style.cursor = 'pointer';
        saveLabelsButton.onclick = () => {
            this.saveWhitelistSettings();
            this.notification.success('Label settings saved');
        };

        labelButtonContainer.appendChild(resetLabelsButton);
        labelButtonContainer.appendChild(saveLabelsButton);

        whitelistSection.appendChild(labelButtonContainer);

        container.appendChild(whitelistSection);
    }

    /**
     * Create appearance settings section
     * @param {HTMLElement} container - Container to add settings to
     */
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

        // Add settings coming soon message
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

    /**
     * Create a GitLab-styled label element
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createGitLabStyleLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.name;

        // Use provided color or generate one
        const bgColor = label.color || generateColorFromString(label.name);

        // Calculate text color (black or white) based on background color brightness
        const textColor = getContrastColor(bgColor);

        // Apply GitLab label styles
        labelElement.style.backgroundColor = bgColor;
        labelElement.style.color = textColor;
        labelElement.style.padding = '4px 8px';
        labelElement.style.borderRadius = '100px'; // Rounded pill shape
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

    /**
     * Create whitelist editor with checkboxes for all available labels
     * @param {HTMLElement} container - Container to add whitelist editor to
     */
    /**
     * Create whitelist editor with checkboxes for all available labels
     * @param {HTMLElement} container - Container to add whitelist editor to
     */
    createWhitelistEditor(container) {
        // Add loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'whitelist-loading-message';
        loadingMessage.textContent = 'Loading available labels...';
        loadingMessage.style.fontStyle = 'italic';
        loadingMessage.style.color = '#666';
        container.appendChild(loadingMessage);

        // Create whitelist container with flex layout
        const whitelistContainer = document.createElement('div');
        whitelistContainer.id = 'whitelist-container';
        whitelistContainer.style.display = 'flex';
        whitelistContainer.style.flexWrap = 'wrap';
        whitelistContainer.style.gap = '10px';
        whitelistContainer.style.marginTop = '15px';
        container.appendChild(whitelistContainer);

        // Load current whitelist
        const currentWhitelist = getLabelWhitelist();

        // Fix: Ensure currentWhitelist is an array
        if (!Array.isArray(currentWhitelist)) {
            console.warn("Whitelist is not an array, using default");
            currentWhitelist = [];
        }

        // Get all available labels from API
        if (this.labelManager) {
            this.labelManager.fetchAllLabels().then(allLabels => {
                // Remove loading message
                loadingMessage.remove();

                if (!allLabels || allLabels.length === 0) {
                    const noLabelsMessage = document.createElement('div');
                    noLabelsMessage.textContent = 'No labels found. Showing whitelist terms instead.';
                    noLabelsMessage.style.width = '100%';
                    noLabelsMessage.style.marginBottom = '15px';
                    whitelistContainer.appendChild(noLabelsMessage);

                    // Show the current whitelist terms as checkboxes
                    this.showWhitelistTermsOnly(whitelistContainer, currentWhitelist);
                    return;
                }

                // Continue with original code for showing labels...
                // Sort labels alphabetically
                allLabels.sort((a, b) => a.name.localeCompare(b.name));

                // Create a checkbox for each unique label
                const seenLabels = new Set();

                allLabels.forEach(label => {
                    // Skip duplicate labels
                    if (seenLabels.has(label.name.toLowerCase())) return;
                    seenLabels.add(label.name.toLowerCase());

                    // Create checkbox container
                    const checkboxContainer = document.createElement('div');
                    checkboxContainer.style.display = 'flex';
                    checkboxContainer.style.alignItems = 'center';
                    checkboxContainer.style.marginBottom = '10px';
                    checkboxContainer.style.width = 'calc(33.33% - 10px)'; // 3 columns with gap

                    const checkbox = document.createElement('input');
                    checkbox.type = 'checkbox';
                    checkbox.id = `label-${label.name}`;
                    checkbox.dataset.label = label.name.toLowerCase();
                    checkbox.style.marginRight = '8px';

                    // Check if this label is in the whitelist
                    if (this.labelManager.isLabelInWhitelist(label.name, currentWhitelist)) {
                        checkbox.checked = true;
                    }

                    // Create GitLab-styled label
                    const labelElement = this.createGitLabStyleLabel(label);

                    // Make the label clickable to toggle the checkbox
                    labelElement.style.cursor = 'pointer';
                    labelElement.onclick = () => {
                        checkbox.checked = !checkbox.checked;
                    };

                    // Add label and checkbox to container
                    checkboxContainer.appendChild(checkbox);
                    checkboxContainer.appendChild(labelElement);
                    whitelistContainer.appendChild(checkboxContainer);
                });

                // Add custom input for adding custom terms
                const customInputContainer = document.createElement('div');
                customInputContainer.style.width = '100%';
                customInputContainer.style.marginTop = '20px';
                customInputContainer.style.padding = '15px';
                customInputContainer.style.borderTop = '1px solid #ddd';

                const customInputLabel = document.createElement('div');
                customInputLabel.textContent = 'Add custom terms (comma separated):';
                customInputLabel.style.marginBottom = '8px';
                customInputLabel.style.fontWeight = 'bold';

                const customInput = document.createElement('input');
                customInput.type = 'text';
                customInput.id = 'custom-whitelist-terms';
                customInput.style.width = '100%';
                customInput.style.padding = '8px';
                customInput.style.borderRadius = '4px';
                customInput.style.border = '1px solid #ccc';

                // Fixed - Add custom terms from whitelist that aren't in labels
                const labelTerms = Array.from(seenLabels);

                // Filter custom terms safely with appropriate checks
                let customTerms = [];
                if (Array.isArray(currentWhitelist)) {
                    customTerms = currentWhitelist.filter(term => {
                        // Make sure term is a string
                        if (typeof term !== 'string') return false;

                        // Check if any label includes this term
                        return !labelTerms.some(label =>
                            label.includes(term.toLowerCase())
                        );
                    });
                }

                customInput.value = customTerms.join(', ');

                customInputContainer.appendChild(customInputLabel);
                customInputContainer.appendChild(customInput);
                whitelistContainer.appendChild(customInputContainer);
            }).catch(error => {
                console.error('Error fetching labels for whitelist editor:', error);
                loadingMessage.textContent = 'Error loading labels. Using whitelist terms instead.';
                loadingMessage.style.color = '#dc3545';

                // Show the current whitelist terms
                this.showWhitelistTermsOnly(whitelistContainer, currentWhitelist);
            });
        } else {
            loadingMessage.textContent = 'Label manager not available. Using whitelist terms instead.';
            loadingMessage.style.color = '#dc3545';

            // Show the current whitelist terms
            this.showWhitelistTermsOnly(whitelistContainer, currentWhitelist);
        }
    }

    /*** Display only the whitelist terms when label manager isn't available
     * @param {HTMLElement} container - Container element
     * @param {Array} whitelist - Whitelist terms
     */
    showWhitelistTermsOnly(container, whitelist) {
        // Ensure whitelist is an array
        if (!Array.isArray(whitelist)) {
            console.warn("Whitelist is not an array in showWhitelistTermsOnly");
            whitelist = [];
        }

        // Create checkboxes for each whitelist term
        whitelist.forEach(term => {
            // Skip invalid terms
            if (typeof term !== 'string') return;

            // Create checkbox container
            const checkboxContainer = document.createElement('div');
            checkboxContainer.style.display = 'flex';
            checkboxContainer.style.alignItems = 'center';
            checkboxContainer.style.marginBottom = '10px';
            checkboxContainer.style.width = 'calc(33.33% - 10px)'; // 3 columns with gap

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `label-${term}`;
            checkbox.dataset.label = term.toLowerCase();
            checkbox.style.marginRight = '8px';
            checkbox.checked = true;

            // Create label element
            const labelElement = document.createElement('span');
            labelElement.textContent = term;
            labelElement.style.padding = '4px 8px';
            labelElement.style.borderRadius = '100px';
            labelElement.style.fontSize = '12px';
            labelElement.style.fontWeight = '500';
            labelElement.style.display = 'inline-block';
            labelElement.style.margin = '2px';
            labelElement.style.backgroundColor = generateColorFromString(term);
            labelElement.style.color = getContrastColor(labelElement.style.backgroundColor);

            // Make the label clickable to toggle the checkbox
            labelElement.style.cursor = 'pointer';
            labelElement.onclick = () => {
                checkbox.checked = !checkbox.checked;
            };

            checkboxContainer.appendChild(checkbox);
            checkboxContainer.appendChild(labelElement);
            container.appendChild(checkboxContainer);
        });

        // Add custom input for adding custom terms
        const customInputContainer = document.createElement('div');
        customInputContainer.style.width = '100%';
        customInputContainer.style.marginTop = '20px';
        customInputContainer.style.padding = '15px';
        customInputContainer.style.borderTop = '1px solid #ddd';

        const customInputLabel = document.createElement('div');
        customInputLabel.textContent = 'Add custom terms (comma separated):';
        customInputLabel.style.marginBottom = '8px';
        customInputLabel.style.fontWeight = 'bold';

        const customInput = document.createElement('input');
        customInput.type = 'text';
        customInput.id = 'custom-whitelist-terms';
        customInput.style.width = '100%';
        customInput.style.padding = '8px';
        customInput.style.borderRadius = '4px';
        customInput.style.border = '1px solid #ccc';

        customInputContainer.appendChild(customInputLabel);
        customInputContainer.appendChild(customInput);
        container.appendChild(customInputContainer);
    }

    /**
     * Save whitelist settings from checkboxes and custom input
     */
    saveWhitelistSettings() {
        const newWhitelist = [];
        const addedTerms = new Set(); // Track already added terms to prevent duplicates

        // Get all checked labels
        const checkboxes = document.querySelectorAll('#whitelist-container input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                const term = checkbox.dataset.label.toLowerCase();
                if (!addedTerms.has(term)) {
                    newWhitelist.push(term);
                    addedTerms.add(term);
                }
            }
        });

        // Get custom terms
        const customInput = document.getElementById('custom-whitelist-terms');
        if (customInput && customInput.value) {
            const customTerms = customInput.value.split(',').map(term => term.trim().toLowerCase());
            customTerms.forEach(term => {
                if (term && !addedTerms.has(term)) {
                    newWhitelist.push(term);
                    addedTerms.add(term);
                }
            });
        }

        // Save to storage
        saveLabelWhitelist(newWhitelist);

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.saveWhitelist(newWhitelist);
        }

        // Show success notification
        if (this.notification) {
            this.notification.success(`Saved ${newWhitelist.length} whitelist terms`);
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    /**
     * Reset label whitelist to defaults
     */
    resetLabelWhitelist() {
        resetLabelWhitelist();

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.resetToDefaultWhitelist();
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    /**
     * Reset all settings to defaults
     */
    resetAllSettings() {
        // Reset label whitelist
        this.resetLabelWhitelist();

        // No default assignees, so just clear them
        saveAssigneeWhitelist([]);

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('all');
        }
    }

}
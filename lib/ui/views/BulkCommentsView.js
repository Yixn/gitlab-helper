// BulkCommentsView.js - Fixed version
import { getLabelWhitelist } from '../../storage/SettingsStorage';
import CommandShortcut from '../components/CommandShortcut';
import Notification from '../components/Notification';
import SelectionDisplay from '../components/SelectionDisplay';
import { getPathFromUrl } from '../../api/APIUtils';
import { getAssigneeWhitelist } from '../../storage/SettingsStorage';

/**
 * View for the Bulk Comments tab (previously API tab)
 */
export default class BulkCommentsView {
    /**
     * Constructor for BulkCommentsView
     * @param {Object} uiManager - Reference to the main UI manager
     */
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.selectedIssues = []; // Store selected issues
        this.commandShortcuts = null; // Will be initialized when Bulk Comments tab is rendered
        this.isLoading = false;
        this.initializedShortcuts = new Set(); // Track which shortcuts have been initialized
        this.commentInput = null; // Store reference to textarea element

        // Get the GitLab API instance from the window object or uiManager
        this.gitlabApi = window.gitlabApi || (uiManager && uiManager.gitlabApi);

        // Create a notification instance
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Important: Initialize labelManager manually if it's not in uiManager
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else if (typeof LabelManager === 'function') {
            // Make sure LabelManager is imported and available
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    if (this.commandShortcuts) {
                        this.addLabelShortcut();
                    }
                }
            });
        } else {
            // Create a simple placeholder that won't cause errors
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([])
            };
        }

        // Initialize the selection display
        this.selectionDisplay = new SelectionDisplay({
            selectedIssues: this.selectedIssues,
            onRemoveIssue: (index) => this.onRemoveIssue(index)
        });
    }

    /**
     * Initialize label and assignee managers with error handling
     * @param {Object} uiManager - Reference to the main UI manager
     */
    initializeManagers(uiManager) {
        // Try to get label manager from uiManager
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else {
            // Try to initialize from global if available
            try {
                if (typeof LabelManager === 'function') {
                    this.labelManager = new LabelManager({
                        gitlabApi: this.gitlabApi,
                        onLabelsLoaded: (labels) => {
                            // Re-add label shortcut when labels are loaded
                            if (this.commandShortcuts) {
                                this.addLabelShortcut();
                            }
                        }
                    });
                } else {
                    console.warn('LabelManager class not available, using placeholder');
                    // Create a simple placeholder
                    this.labelManager = {
                        filteredLabels: [],
                        fetchAllLabels: () => Promise.resolve([]),
                        isLabelInWhitelist: () => false
                    };
                }
            } catch (e) {
                console.error('Error initializing LabelManager:', e);
                // Create a simple placeholder
                this.labelManager = {
                    filteredLabels: [],
                    fetchAllLabels: () => Promise.resolve([]),
                    isLabelInWhitelist: () => false
                };
            }
        }

        // Same process for assignee manager
        if (uiManager && uiManager.assigneeManager) {
            this.assigneeManager = uiManager.assigneeManager;
        } else {
            // Try to find global
            this.assigneeManager = window.assigneeManager;
        }
    }
    /**
     * Update assign shortcut with the provided items
     * @param {Array} items - Items to show in the assign dropdown
     */
    /**
     * Update assign shortcut with the provided items
     * @param {Array} items - Items to show in the assign dropdown
     */
    updateAssignShortcut(items) {
        if (!this.commandShortcuts) {
            console.error("Cannot update assign shortcut: commandShortcuts not available");
            return;
        }

        // Skip if we have no items or just the default ones
        if (!items || items.length <= 3) {
            console.warn("Not updating assign shortcut: no meaningful items to add");
            return;
        }

        try {
            // Store current selected value if there is one
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['assign'].dropdown.value;
            }

            // First remove existing shortcut if it exists
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign']) {
                this.commandShortcuts.removeShortcut('assign');
            }

            // Then add the new shortcut
            this.commandShortcuts.addCustomShortcut({
                type: 'assign',
                label: '/assign',
                items: items,
                onSelect: (value) => {
                    if (!value || value === 'separator' || value === 'separator2') return;

                    if (value === 'manage') {
                        // Try different ways to open the assignee manager
                        if (this.assigneeManager && typeof this.assigneeManager.openAssigneeManager === 'function') {
                            this.assigneeManager.openAssigneeManager();
                        } else if (window.assigneeManager && typeof window.assigneeManager.openAssigneeManager === 'function') {
                            window.assigneeManager.openAssigneeManager();
                        } else if (typeof openAssigneeManager === 'function') {
                            openAssigneeManager();
                        } else {
                            console.error('No assignee manager found');
                            this.notification.error('Assignee manager not available');
                            return;
                        }

                        // After the manager is closed, refresh the shortcut
                        setTimeout(() => {
                            this.addAssignShortcut();
                        }, 500);
                        return;
                    }

                    if (value === 'custom') {
                        const customUser = prompt('Enter GitLab username (without @):');
                        if (!customUser) return;
                        value = customUser;
                    }

                    const textarea = this.commentInput || document.getElementById('issue-comment-input');
                    if (!textarea) {
                        console.error("No textarea found for inserting assign command");
                        return;
                    }

                    let assignText = '/assign ';

                    if (value === 'none') {
                        assignText += '@none';
                    } else if (value === '@me') {
                        assignText += '@me';
                    } else {
                        // Handle usernames - prefix with @ if not already there
                        assignText += value.startsWith('@') ? value : `@${value}`;
                    }

                    this.insertTextAtCursor(textarea, assignText);

                    if (value === 'none') {
                        this.notification.info('Issue will be unassigned');
                    } else if (value === '@me') {
                        this.notification.info('Issue will be assigned to you');
                    } else {
                        this.notification.info(`Issue will be assigned to ${value.replace('@', '')}`);
                    }
                }
            });

            // Restore selected value if it existed and is in the new items
            if (currentValue && this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                this.commandShortcuts.shortcuts['assign'].dropdown.value = currentValue;
            }

            console.log(`Successfully updated assign shortcut with ${items.length} items`);
        } catch (e) {
            console.error('Error updating assign shortcut:', e);
        }
    }
    /**
     * Initialize all shortcut types
     */
    initializeAllShortcuts() {
        if (!this.commandShortcuts) return;

        try {
            // Define a consistent order for the shortcuts
            const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];

            // Track already added shortcuts
            const addedShortcuts = new Set(Object.keys(this.commandShortcuts.shortcuts || {}));

            // Create estimate shortcut (always first) if not already added
            if (!addedShortcuts.has('estimate')) {
                this.commandShortcuts.initializeEstimateShortcut();
                addedShortcuts.add('estimate');
            }

            // Add label shortcut with placeholder labels if not already added
            if (!addedShortcuts.has('label')) {
                this.addLabelShortcut([
                    { value: '', label: 'Loading labels...' }
                ]);
                addedShortcuts.add('label');
            }

            // Add milestone shortcut if not already added
            if (!addedShortcuts.has('milestone')) {
                this.addMilestoneShortcut();
                addedShortcuts.add('milestone');
            }

            // Add assign shortcut if not already added
            if (!addedShortcuts.has('assign')) {
                this.addAssignShortcut();
                addedShortcuts.add('assign');
            }
        } catch (e) {
            console.error('Error initializing shortcuts:', e);
            this.notification.error('Error initializing shortcuts');
        }
    }

    /**
     * Add milestone shortcut
     */
    addMilestoneShortcut() {
        if (!this.commandShortcuts) return;

        try {
            this.commandShortcuts.addCustomShortcut({
                type: 'milestone',
                label: '/milestone',
                items: [
                    { value: '', label: 'Set Milestone' },
                    { value: '%current', label: 'Current Sprint' },
                    { value: '%next', label: 'Next Sprint' },
                    { value: '%upcoming', label: 'Upcoming' },
                    { value: 'none', label: 'Remove Milestone' },
                    { value: 'custom', label: 'Custom...' }
                ],
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customMilestone = prompt('Enter milestone name:');
                        if (!customMilestone) return;
                        value = customMilestone;
                    }

                    // Use the stored textarea reference instead of finding it by ID
                    if (!this.commentInput) {
                        console.warn('Comment input not available');
                        return;
                    }

                    // Format milestone text based on value
                    let milestoneText = '/milestone ';
                    if (value === 'none') {
                        milestoneText += '%""';
                    } else if (value.startsWith('%')) {
                        milestoneText += value;
                    } else {
                        milestoneText += `%"${value}"`;
                    }

                    this.insertTextAtCursor(this.commentInput, milestoneText);
                    this.notification.info(`Milestone set to ${value === 'none' ? 'none' : value}`);
                }
            });
        } catch (e) {
            console.error('Error adding milestone shortcut:', e);
        }
    }

    /**
     * Add assign shortcut
     */
    /**
     * Add assign shortcut
     */
    addAssignShortcut() {
        if (!this.commandShortcuts) return;

        console.log("Starting addAssignShortcut");

        // Log global objects to check availability
        console.log("Global assigneeManager available:", !!window.assigneeManager);
        console.log("Global settingsStorage available:", !!window.getAssigneeWhitelist);
        console.log("This.assigneeManager available:", !!this.assigneeManager);

        // Start with basic assign items
        let assignItems = [
            { value: '', label: 'Assign to...' },
            { value: '@me', label: 'Myself' },
            { value: 'none', label: 'Unassign' }
        ];

        // DIRECT ACCESS APPROACH: Attempt to directly access the storage via GM_getValue
        let directWhitelist = null;
        try {
            if (typeof GM_getValue === 'function') {
                directWhitelist = GM_getValue('gitLabHelperAssigneeWhitelist', []);
                console.log("Direct GM_getValue result:", directWhitelist);
            }
        } catch (e) {
            console.error("Error accessing GM_getValue:", e);
        }

        // If we got assignees directly, use them
        if (Array.isArray(directWhitelist) && directWhitelist.length > 0) {
            console.log("Using directly accessed whitelist:", directWhitelist);

            // Add a separator
            assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

            // Add whitelisted assignees
            const whitelistItems = directWhitelist.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
            }));

            assignItems = assignItems.concat(whitelistItems);
        }
        // If direct access failed, try other methods
        else {
            console.log("Direct access failed, trying fallbacks");

            // Try to find assignees from various sources
            let assignees = [];

            // Try the assigneeManager
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = this.assigneeManager.getAssigneeWhitelist();
                    console.log("Got assignees from this.assigneeManager:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from this.assigneeManager:", e);
                }
            }

            // Try global assigneeManager if local one failed
            if ((!assignees || !assignees.length) && window.assigneeManager &&
                typeof window.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.assigneeManager.getAssigneeWhitelist();
                    console.log("Got assignees from window.assigneeManager:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from window.assigneeManager:", e);
                }
            }

            // Try imported getAssigneeWhitelist if available
            if ((!assignees || !assignees.length) && typeof getAssigneeWhitelist === 'function') {
                try {
                    assignees = getAssigneeWhitelist();
                    console.log("Got assignees from imported getAssigneeWhitelist:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from imported getAssigneeWhitelist:", e);
                }
            }

            // Try global getAssigneeWhitelist if available
            if ((!assignees || !assignees.length) && typeof window.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.getAssigneeWhitelist();
                    console.log("Got assignees from window.getAssigneeWhitelist:", assignees);
                } catch (e) {
                    console.error("Error getting assignees from window.getAssigneeWhitelist:", e);
                }
            }

            // Try localStorage directly
            if (!assignees || !assignees.length) {
                try {
                    const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
                    if (storedValue) {
                        assignees = JSON.parse(storedValue);
                        console.log("Got assignees from localStorage directly:", assignees);
                    }
                } catch (e) {
                    console.error("Error getting assignees from localStorage:", e);
                }
            }

            // If we found any assignees by any method, add them to the dropdown
            if (Array.isArray(assignees) && assignees.length > 0) {
                // Add a separator
                assignItems.push({ value: 'separator', label: '────── Favorites ──────' });

                // Add whitelisted assignees
                const whitelistItems = assignees.map(assignee => ({
                    value: assignee.username,
                    label: assignee.name || assignee.username
                }));

                assignItems = assignItems.concat(whitelistItems);
            } else {
                console.warn("Could not find any assignees through any method");
            }
        }

        // Add custom option and manage option at the end
        assignItems.push({ value: 'custom', label: 'Custom...' });

        // Add this log to see what will be passed to the dropdown
        console.log("Final assignItems to be used:", assignItems);

        // Update the assign shortcut with our items
        this.updateAssignShortcut(assignItems);

        // Async attempt to fetch more group members
        setTimeout(() => {
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        console.log("Got group members:", members.length);

                        // Create a new array that includes existing items plus members
                        const updatedItems = [...assignItems];

                        // Add a separator if we have members
                        updatedItems.push({ value: 'separator2', label: '────── Group Members ──────' });

                        // Add group members, making sure to avoid duplicates with existing assignees
                        const existingUsernames = assignItems
                            .filter(item => item.value && !['separator', 'separator2', 'custom', 'manage', '@me', 'none', ''].includes(item.value))
                            .map(item => item.value.toLowerCase());

                        const newMembers = members
                            .filter(member => !existingUsernames.includes(member.username.toLowerCase()))
                            .map(member => ({
                                value: member.username,
                                label: member.name || member.username
                            }));

                        if (newMembers.length > 0) {
                            updatedItems.push(...newMembers);

                            // Update the shortcut with all the items
                            this.updateAssignShortcut(updatedItems);
                        }
                    }
                })
                .catch(error => {
                    console.error('Error fetching group members:', error);
                });
        }, 100);
    }



    /**
     * Fetch members from the current group/project
     * @returns {Promise<Array>} Promise resolving to array of members
     */
    async fetchGroupMembers() {
        try {
            // First, ensure we have an API instance
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                throw new Error('GitLab API not available');
            }

            // Get path info to determine project or group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }

            // Fetch members based on path type
            let members;
            if (pathInfo.type === 'project') {
                members = await this.gitlabApi.callGitLabApi(
                    `projects/${pathInfo.encodedPath}/members`,
                    { params: { per_page: 100 } }
                );
            } else if (pathInfo.type === 'group') {
                members = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    { params: { per_page: 100 } }
                );
            } else {
                throw new Error('Unsupported path type: ' + pathInfo.type);
            }

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members');
                return [];
            }

            // Process members
            return members.map(member => ({
                id: member.id,
                name: member.name,
                username: member.username,
                avatar_url: member.avatar_url
            }));
        } catch (error) {
            console.error('Error fetching group members:', error);
            return [];
        }
    }

    /**
     * Set multiple selected issues
     * @param {Array} issues - Array of selected issue objects
     */
    setSelectedIssues(issues) {
        // Make a defensive copy to prevent reference issues
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];

        // Update the SelectionDisplay with the new issues
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }

        // Update status message if it exists
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected. Enter your comment and click "Add Comment".`;
                statusEl.style.color = 'green';
            } else if (!this.isLoading) {
                statusEl.textContent = 'No issues selected. Click "Select Issues".';
                statusEl.style.color = '#666';
            }
        }

        // Log for debugging
        console.log(`BulkCommentsView: Set ${this.selectedIssues.length} selected issues`);
    }

    /**
     * Handler when an issue is removed from the selection
     * @param {number} index - Index of the removed issue
     */
    onRemoveIssue(index) {
        if (this.selectedIssues.length > index) {
            // Store the removed issue for debugging
            const removedIssue = this.selectedIssues[index];

            // Remove the issue
            this.selectedIssues.splice(index, 1);

            // Update UI manager's issue selector if available
            if (this.uiManager && this.uiManager.issueSelector) {
                this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            } else if (window.uiManager && window.uiManager.issueSelector) {
                // Try global uiManager as fallback
                window.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
            }
        }

        // Update status message if it exists
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

        // Log for debugging
        console.log(`Removed issue at index ${index}, remaining: ${this.selectedIssues.length}`);
    }

    /**
     * Create action buttons (select, submit, clear)
     * @param {HTMLElement} container - Container element
     */
    createActionButtons(container) {
        // Buttons container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';

        // Add select issues button with toggle functionality
        const selectBtn = document.createElement('button');
        selectBtn.id = 'select-issues-button';
        selectBtn.textContent = 'Select'; // Simplified text
        selectBtn.style.padding = '8px 12px';
        selectBtn.style.backgroundColor = '#6c757d';  // Default gray
        selectBtn.style.color = 'white';
        selectBtn.style.border = 'none';
        selectBtn.style.borderRadius = '4px';
        selectBtn.style.cursor = 'pointer';
        selectBtn.style.fontSize = '14px';
        selectBtn.style.transition = 'background-color 0.2s ease';
        selectBtn.style.display = 'flex';
        selectBtn.style.alignItems = 'center';
        selectBtn.style.justifyContent = 'center';
        selectBtn.style.minWidth = '80px'; // Ensure consistent widths

        // Add hover effect
        selectBtn.addEventListener('mouseenter', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#218838' : '#5a6268';
        });
        selectBtn.addEventListener('mouseleave', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#28a745' : '#6c757d';
        });

        selectBtn.onclick = () => {
            if (this.uiManager && this.uiManager.issueSelector) {
                // Toggle selection mode
                if (this.uiManager.issueSelector.isSelectingIssue) {
                    // Currently active, so exit selection mode
                    this.uiManager.issueSelector.exitSelectionMode();

                    // Update button styling
                    selectBtn.dataset.active = 'false';
                    selectBtn.style.backgroundColor = '#6c757d'; // Gray when inactive
                    selectBtn.textContent = 'Select';
                } else {
                    // Not active, so start selection mode
                    // Pass the current selection to maintain it
                    this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    this.uiManager.issueSelector.startSelection();

                    // Update button styling
                    selectBtn.dataset.active = 'true';
                    selectBtn.style.backgroundColor = '#28a745'; // Green when active
                    selectBtn.textContent = 'Done'; // Changed to "Done" when active
                }
            } else {
                console.error('Issue selector not initialized');
                const statusEl = document.getElementById('comment-status');
                if (statusEl) {
                    statusEl.textContent = 'Error: Issue selector not initialized.';
                    statusEl.style.color = '#dc3545';
                }
            }
        };
        buttonContainer.appendChild(selectBtn);

        // Add Save button (renamed from "Add Comment")
        const submitBtn = document.createElement('button');
        submitBtn.textContent = 'Send';  // Changed to clearer "Save" label
        submitBtn.style.padding = '8px 12px';
        submitBtn.style.backgroundColor = '#1f75cb';
        submitBtn.style.color = 'white';
        submitBtn.style.border = 'none';
        submitBtn.style.borderRadius = '4px';
        submitBtn.style.cursor = 'pointer';
        submitBtn.style.fontSize = '14px';
        submitBtn.style.transition = 'background-color 0.2s ease';
        submitBtn.style.display = 'flex';
        submitBtn.style.alignItems = 'center';
        submitBtn.style.justifyContent = 'center';
        submitBtn.style.flex = '1';
        submitBtn.style.minWidth = '80px'; // Ensure consistent widths

        // Add hover effect
        submitBtn.addEventListener('mouseenter', () => {
            submitBtn.style.backgroundColor = '#1a63ac';
        });
        submitBtn.addEventListener('mouseleave', () => {
            submitBtn.style.backgroundColor = '#1f75cb';
        });

        submitBtn.onclick = () => this.submitComments();
        buttonContainer.appendChild(submitBtn);

        container.appendChild(buttonContainer);
    }

    /**
     * Clear selected issues
     */
    clearSelectedIssues() {
        // Clear local selection
        this.selectedIssues = [];

        // Update the selection display
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues([]);
        }

        // Update status message
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }

        // Show notification
        if (this.notification) {
            this.notification.info('Selection cleared');
        }

        // Log for debugging
        console.log('Cleared selected issues');
    }

    /**
     * For backwards compatibility - set a single selected issue
     * @param {Object} issue - Selected issue object
     */
    setSelectedIssue(issue) {
        this.setSelectedIssues(issue ? [issue] : []);
    }

    /**
     * Render the Bulk Comments tab
     */
    render() {
        const bulkCommentsContent = document.getElementById('bulk-comments-content');
        if (!bulkCommentsContent) return;

        // Clear previous content
        bulkCommentsContent.innerHTML = '';

        // Add comment section
        this.addCommentSection(bulkCommentsContent);

        // Initialize shortcuts in the correct order
        if (this.commandShortcuts) {
            // Add all shortcut structure first before fetching data
            // This ensures consistent order from the beginning
            this.initializeAllShortcuts();

            // Show loading state
            this.isLoading = true;
            this.showLoadingState();

            // Now fetch data for the shortcuts asynchronously
            if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                // Fetch labels in the background without affecting order
                this.labelManager.fetchAllLabels()
                    .then(labels => {
                        // Update label shortcut with actual data
                        this.addLabelShortcut();
                        this.isLoading = false;
                        this.hideLoadingState();
                    })
                    .catch(error => {
                        console.error('Error loading labels:', error);
                        this.addLabelShortcut(this.getFallbackLabels());
                        this.isLoading = false;
                        this.hideLoadingState();
                    });
            } else {
                // No label manager, just use fallbacks
                console.warn('Label manager not available, using fallback labels');
                this.addLabelShortcut(this.getFallbackLabels());
                this.isLoading = false;
                this.hideLoadingState();
            }
        } else {
            console.error('Command shortcuts not initialized');
            this.isLoading = false;
            this.hideLoadingState();
        }
    }

    /**
     * Add comment utility section to Bulk Comments tab
     * @param {HTMLElement} container - Container element
     */
    addCommentSection(container) {
        // Create comment tool section
        const commentSection = document.createElement('div');
        commentSection.classList.add('api-section');
        commentSection.style.marginBottom = '15px';
        commentSection.style.padding = '10px';
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '8px';
        commentSection.style.border = '1px solid #e0e0e0';

        // Add selected issues container
        this.selectionDisplay.createSelectionContainer(commentSection);

        // Add comment input with shortcuts - initially with loading state
        this.createCommentInput(commentSection);

        // Add action buttons
        this.createActionButtons(commentSection);

        // Add status and progress elements
        this.createStatusElements(commentSection);

        // Show loading state
        this.isLoading = true;
        this.showLoadingState();

        // Initialize the shortcuts with placeholder labels
        try {
            // Make sure commentInput and commandShortcuts are initialized
            if (this.commentInput && this.commandShortcuts) {
                this.initializeAllShortcuts();

                // Show initial label shortcut with "Loading..." state
                this.addLabelShortcut([
                    { value: '', label: 'Loading labels...' }
                ]);

                // Now try to fetch labels asynchronously
                if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                    // Try to fetch labels in the background
                    this.labelManager.fetchAllLabels()
                        .then(labels => {
                            // Update the label shortcut with fetched labels
                            this.addLabelShortcut();
                            this.isLoading = false;
                            this.hideLoadingState();
                        })
                        .catch(error => {
                            console.error('Error loading labels:', error);
                            // If fetching fails, update with fallback labels
                            this.addLabelShortcut(this.getFallbackLabels());
                            this.isLoading = false;
                            this.hideLoadingState();
                        });
                } else {
                    // No label manager, just use fallbacks
                    console.warn('Label manager not available, using fallback labels');
                    this.addLabelShortcut(this.getFallbackLabels());
                    this.isLoading = false;
                    this.hideLoadingState();
                }
            } else {
                console.error('Textarea or command shortcuts not initialized');
                this.isLoading = false;
                this.hideLoadingState();
            }
        } catch (error) {
            console.error('Error initializing shortcuts:', error);
            this.isLoading = false;
            this.hideLoadingState();
        }

        container.appendChild(commentSection);
    }


    /**
     * Get fallback labels when fetching fails
     * @returns {Array} Array of fallback label items
     */
    getFallbackLabels() {
        return [
            { value: '', label: 'Add Label' },
            { value: 'bug', label: 'Bug' },
            { value: 'feature', label: 'Feature' },
            { value: 'enhancement', label: 'Enhancement' },
            { value: 'documentation', label: 'Documentation' },
            { value: 'custom', label: 'Custom...' }
        ];
    }

    /**
     * This function should be added to the BulkCommentsView.js file
     */
    createCommentInput(container) {
        // Create a wrapper for shortcuts with fixed dimensions
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.id = 'shortcuts-wrapper';
        shortcutsWrapper.style.width = '100%';
        shortcutsWrapper.style.marginBottom = '15px';
        shortcutsWrapper.style.minHeight = '120px'; // Set a fixed minimum height that accommodates all shortcuts
        shortcutsWrapper.style.position = 'relative'; // Important for stable layout

        // Add a placeholder layout while loading to prevent jumping
        const placeholderShortcuts = document.createElement('div');
        placeholderShortcuts.style.opacity = '0.4';
        placeholderShortcuts.style.pointerEvents = 'none';

        // Create placeholder items that mimic the shortcut layout
        ['Estimate', 'Label', 'Milestone', 'Assign'].forEach(type => {
            const placeholder = document.createElement('div');
            placeholder.style.display = 'flex';
            placeholder.style.alignItems = 'center';
            placeholder.style.marginBottom = '8px';
            placeholder.style.height = '36px'; // Fixed height
            placeholder.style.border = '1px solid #ddd';
            placeholder.style.borderRadius = '4px';
            placeholder.style.padding = '6px 10px';

            const label = document.createElement('div');
            label.textContent = `/${type.toLowerCase()}`;
            label.style.fontWeight = 'bold';
            label.style.minWidth = '100px';

            const dropdown = document.createElement('div');
            dropdown.style.flex = '1';
            dropdown.style.height = '24px';
            dropdown.style.backgroundColor = '#eee';
            dropdown.style.marginLeft = '10px';
            dropdown.style.borderRadius = '4px';

            placeholder.appendChild(label);
            placeholder.appendChild(dropdown);
            placeholderShortcuts.appendChild(placeholder);
        });

        shortcutsWrapper.appendChild(placeholderShortcuts);
        container.appendChild(shortcutsWrapper);

        // Comment textarea with improved styling
        const commentInput = document.createElement('textarea');
        commentInput.id = 'issue-comment-input';
        commentInput.placeholder = 'Enter your comment here...';
        commentInput.style.width = '100%';
        commentInput.style.padding = '8px';
        commentInput.style.marginBottom = '12px';
        commentInput.style.borderRadius = '4px';
        commentInput.style.border = '1px solid #ccc';
        commentInput.style.minHeight = '60px';
        commentInput.style.fontSize = '14px';
        commentInput.style.transition = 'border-color 0.2s ease';
        commentInput.style.resize = 'vertical';
        commentInput.style.boxSizing = 'border-box';

        // Add focus effect
        commentInput.addEventListener('focus', () => {
            commentInput.style.borderColor = '#1f75cb';
            commentInput.style.outline = 'none';
            commentInput.style.boxShadow = '0 0 0 2px rgba(31, 117, 203, 0.2)';
        });

        commentInput.addEventListener('blur', () => {
            commentInput.style.borderColor = '#ccc';
            commentInput.style.boxShadow = 'none';
        });

        // Add the textarea after the shortcuts wrapper
        container.appendChild(commentInput);

        // Store reference to the textarea
        this.commentInput = commentInput;

        // Initialize CommandShortcut with the newly created textarea
        try {
            if (typeof CommandShortcut === 'function') {
                this.commandShortcuts = new CommandShortcut({
                    targetElement: commentInput,
                    onShortcutInsert: (type, value) => {
                        console.log(`Shortcut inserted: ${type} with value ${value}`);
                    }
                });

                // Initialize shortcuts container, replacing the placeholder
                this.commandShortcuts.initialize(shortcutsWrapper);

                // Remove placeholder after initialization
                if (placeholderShortcuts.parentNode === shortcutsWrapper) {
                    shortcutsWrapper.removeChild(placeholderShortcuts);
                }
            } else {
                console.error('CommandShortcut class not available');
            }
        } catch (e) {
            console.error('Error initializing CommandShortcut:', e);
        }
    }


    /**
     * Insert text at cursor position in textarea
     * @param {HTMLElement} textarea - The textarea element
     * @param {string} text - Text to insert
     */
    insertTextAtCursor(textarea, text) {
        if (!textarea) return;

        // Get current text
        const currentText = textarea.value;

        // Get cursor position
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;

        // Check if we need to add a new line before the text
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }

        // Insert text at cursor position
        textarea.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);

        // Set cursor position after inserted text
        const newCursorPos = startPos + insertText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);

        // Focus textarea
        textarea.focus();
    }

    /**
     * Create status message and progress bar elements
     * @param {HTMLElement} container - Container element
     */
    createStatusElements(container) {
        // Status message with improved styling
        const statusMsg = document.createElement('div');
        statusMsg.id = 'comment-status';
        statusMsg.style.fontSize = '13px';
        statusMsg.style.marginTop = '10px';
        statusMsg.style.padding = '8px 12px';
        statusMsg.style.borderRadius = '4px';
        statusMsg.style.backgroundColor = '#f8f9fa';
        statusMsg.style.border = '1px solid #e9ecef';
        statusMsg.style.textAlign = 'center';
        statusMsg.style.color = '#666';
        statusMsg.textContent = 'Loading shortcuts...';
        container.appendChild(statusMsg);

        // Progress bar container
        const progressContainer = document.createElement('div');
        progressContainer.id = 'comment-progress-container';
        progressContainer.style.display = 'none';
        progressContainer.style.marginTop = '15px';
        progressContainer.style.padding = '10px';
        progressContainer.style.backgroundColor = '#f8f9fa';
        progressContainer.style.borderRadius = '4px';
        progressContainer.style.border = '1px solid #e9ecef';

        const progressLabel = document.createElement('div');
        progressLabel.id = 'comment-progress-label';
        progressLabel.textContent = 'Submitting comments...';
        progressLabel.style.fontSize = '13px';
        progressLabel.style.marginBottom = '8px';
        progressLabel.style.textAlign = 'center';
        progressLabel.style.fontWeight = 'bold';
        progressContainer.appendChild(progressLabel);

        const progressBarOuter = document.createElement('div');
        progressBarOuter.style.height = '12px';
        progressBarOuter.style.backgroundColor = '#e9ecef';
        progressBarOuter.style.borderRadius = '6px';
        progressBarOuter.style.overflow = 'hidden';
        progressBarOuter.style.boxShadow = 'inset 0 1px 3px rgba(0,0,0,0.1)';

        const progressBarInner = document.createElement('div');
        progressBarInner.id = 'comment-progress-bar';
        progressBarInner.style.height = '100%';
        progressBarInner.style.width = '0%';
        progressBarInner.style.backgroundColor = '#1f75cb';
        progressBarInner.style.transition = 'width 0.3s ease';

        progressBarOuter.appendChild(progressBarInner);
        progressContainer.appendChild(progressBarOuter);
        container.appendChild(progressContainer);
    }

    /**
     * Show loading state for shortcuts
     */
    showLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Loading shortcuts...';
            statusEl.style.color = '#1f75cb';
            statusEl.style.backgroundColor = '#f8f9fa';
            statusEl.style.border = '1px solid #e9ecef';
        }

        // Instead of showing a spinner or changing opacity,
        // pre-populate with placeholders that maintain the layout
        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.label) {
            this.addLabelShortcut([
                { value: '', label: 'Loading labels...' }
            ]);
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.milestone) {
            this.addMilestoneShortcut();
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.assign) {
            this.addAssignShortcut();
        }

        // Disable without changing appearance dramatically
        if (this.commentInput) {
            this.commentInput.disabled = true;
            this.commentInput.style.backgroundColor = '#f9f9f9';
        }
    }

    /**
     * Hide loading state for shortcuts
     */
    hideLoadingState() {
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            const count = this.selectedIssues.length;
            if (count > 0) {
                statusEl.textContent = `${count} issue${count !== 1 ? 's' : ''} selected.`;
                statusEl.style.color = '#28a745';
                statusEl.style.backgroundColor = '#f8f9fa';
                statusEl.style.border = '1px solid #e9ecef';
            } else {
                statusEl.textContent = 'Select issues to add comments.';
                statusEl.style.color = '#666';
                statusEl.style.backgroundColor = '#f8f9fa';
                statusEl.style.border = '1px solid #e9ecef';
            }
        }

        // Enable comment input
        const commentInput = document.getElementById('issue-comment-input');
        if (commentInput) {
            commentInput.disabled = false;
            commentInput.style.opacity = '1';
            commentInput.style.cursor = 'text';
        }

        // Enable buttons
        const buttons = document.querySelectorAll('.api-section button');
        buttons.forEach(button => {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        });
    }

    /**
     * Submit comments to all selected issues
     */
    async submitComments() {
        if (!this.commentInput) {
            this.notification.error('Comment input not found');
            return;
        }

        const statusEl = document.getElementById('comment-status');
        const progressContainer = document.getElementById('comment-progress-container');
        const progressBar = document.getElementById('comment-progress-bar');
        const progressLabel = document.getElementById('comment-progress-label');

        if (this.selectedIssues.length === 0) {
            this.notification.error('No issues selected');
            if (statusEl) {
                statusEl.textContent = 'Error: No issues selected.';
                statusEl.style.color = '#dc3545';
            }
            return;
        }

        const comment = this.commentInput.value.trim();
        if (!comment) {
            this.notification.error('Comment cannot be empty');
            if (statusEl) {
                statusEl.textContent = 'Error: Comment cannot be empty.';
                statusEl.style.color = '#dc3545';
            }
            return;
        }

        // Update status and show progress bar
        if (statusEl) {
            statusEl.textContent = `Submitting comments to ${this.selectedIssues.length} issues...`;
            statusEl.style.color = '#1f75cb';
        }

        if (progressContainer) {
            progressContainer.style.display = 'block';
        }

        if (progressBar) {
            progressBar.style.width = '0%';
        }

        // Disable submit button during operation
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent && b.textContent.includes('Send'));

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        let successCount = 0;
        let failCount = 0;

        // Check if gitlabApi is available
        const gitlabApi = this.gitlabApi || window.gitlabApi || (this.uiManager && this.uiManager.gitlabApi);

        if (!gitlabApi) {
            this.notification.error('GitLab API not available');
            if (statusEl) {
                statusEl.textContent = 'Error: GitLab API not available.';
                statusEl.style.color = '#dc3545';
            }

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }

            if (progressContainer) {
                progressContainer.style.display = 'none';
            }

            return;
        }

        // Process issues one by one
        for (let i = 0; i < this.selectedIssues.length; i++) {
            const issue = this.selectedIssues[i];
            if (!issue) {
                failCount++;
                continue;
            }

            // Update progress
            const progress = Math.round((i / this.selectedIssues.length) * 100);
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            if (progressLabel) {
                progressLabel.textContent = `Processing ${i+1} of ${this.selectedIssues.length} issues...`;
            }

            try {
                // Submit comment to this issue
                await gitlabApi.addComment(issue, comment);
                successCount++;
            } catch (error) {
                console.error(`Failed to add comment to issue #${issue.iid}:`, error);
                failCount++;
            }
        }

        // Final progress update
        if (progressBar) {
            progressBar.style.width = '100%';
        }

        // Enable submit button again
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }

        // Update status based on results
        if (successCount === this.selectedIssues.length) {
            if (statusEl) {
                statusEl.textContent = `Successfully added comment to all ${successCount} issues!`;
                statusEl.style.color = '#28a745';
            }

            this.notification.success(`Added comment to ${successCount} issues`);

            // Clear the input after success - FIXED: use this.commentInput instead of commentEl
            if (this.commentInput) {
                this.commentInput.value = '';
            }

            // Hide progress bar after a delay
            setTimeout(() => {
                if (progressContainer) {
                    progressContainer.style.display = 'none';
                }
            }, 2000);

            // End selection overlay and clear selected issues after a delay
            setTimeout(() => {
                // Exit selection mode if active
                if (this.uiManager && this.uiManager.issueSelector && this.uiManager.issueSelector.isSelectingIssue) {
                    this.uiManager.issueSelector.exitSelectionMode();
                }

                // Clear selected issues
                this.clearSelectedIssues();

                if (statusEl) {
                    statusEl.textContent = '';
                }
            }, 3000);

            // Refresh the board by clicking the search button
            setTimeout(() => {
                this.refreshBoard();
            }, 1000);
        } else {
            if (statusEl) {
                statusEl.textContent = `Added comment to ${successCount} issues, failed for ${failCount} issues.`;
                statusEl.style.color = successCount > 0 ? '#ff9900' : '#dc3545';
            }

            // Show appropriate notification
            if (successCount > 0) {
                this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);

                // Refresh the board even on partial success
                setTimeout(() => {
                    this.refreshBoard();
                }, 1000);
            } else {
                this.notification.error(`Failed to add comments to all ${failCount} issues`);
            }

            // Keep progress bar visible for failed operations
            if (progressBar) {
                progressBar.style.backgroundColor = successCount > 0 ? '#ff9900' : '#dc3545';
            }
        }
    }

    /**
     * Add label shortcut using provided labels or from label manager
     * @param {Array} customLabels - Optional custom labels to use instead of from labelManager
     */
    addLabelShortcut(customLabels) {
        if (!this.commandShortcuts) return;

        try {
            // Store current selected value if there is one
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['label'].dropdown.value;
            }

            // Use provided labels, or try to get them from labelManager, or use fallbacks
            let labelItems;

            if (customLabels) {
                // Use provided custom labels
                labelItems = customLabels;
            } else if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
                // Get labels from label manager if available
                labelItems = [{ value: '', label: 'Add Label' }];

                // Add actual labels from label manager
                const labels = this.labelManager.filteredLabels.map(label => ({
                    value: label.name,
                    label: label.name
                }));

                labelItems = labelItems.concat(labels);

                // Add custom option
                labelItems.push({ value: 'custom', label: 'Custom...' });
            } else {
                // Try to get whitelist directly from settings storage
                try {
                    const whitelist = getLabelWhitelist();
                    if (whitelist && whitelist.length > 0) {
                        labelItems = [{ value: '', label: 'Add Label' }];

                        // Convert whitelist terms to dropdown items
                        const whitelistItems = whitelist.map(term => ({
                            value: term,
                            label: term
                        }));

                        labelItems = labelItems.concat(whitelistItems);
                        labelItems.push({ value: 'custom', label: 'Custom...' });
                    } else {
                        // Fallback if no whitelist available
                        labelItems = this.getFallbackLabels();
                    }
                } catch (e) {
                    console.error('Error getting label whitelist:', e);
                    // Fallback if error
                    labelItems = this.getFallbackLabels();
                }
            }

            // First remove existing shortcut if it exists
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label']) {
                this.commandShortcuts.removeShortcut('label');
            }

            // Then add the new shortcut
            this.commandShortcuts.addCustomShortcut({
                type: 'label',
                label: '/label',
                items: labelItems,
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customLabel = prompt('Enter custom label name:');
                        if (!customLabel) return;
                        value = customLabel;
                    }

                    const textarea = document.getElementById('issue-comment-input');
                    if (!textarea) return;

                    // Create the label command
                    const labelText = `/label ~"${value}"`;

                    this.insertTextAtCursor(textarea, labelText);
                    this.notification.info(`Label added: ${value}`);
                }
            });

            // Restore selected value if it existed
            if (currentValue && this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                this.commandShortcuts.shortcuts['label'].dropdown.value = currentValue;
            }
        } catch (e) {
            console.error('Error adding label shortcut:', e);
        }
    }

    /**
     * Refresh the GitLab board
     */
    refreshBoard() {
        window.location.reload()
    }
}
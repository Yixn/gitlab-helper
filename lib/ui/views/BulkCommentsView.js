import {getLabelWhitelist} from '../../storage/SettingsStorage';
import CommandShortcut from '../components/CommandShortcut';
import Notification from '../components/Notification';
import SelectionDisplay from '../components/SelectionDisplay';
import {getPathFromUrl} from '../../api/APIUtils';
import {getAssigneeWhitelist} from '../../storage/SettingsStorage';

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
        this.gitlabApi = window.gitlabApi || (uiManager && uiManager.gitlabApi);
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        if (uiManager && uiManager.labelManager) {
            this.labelManager = uiManager.labelManager;
        } else if (typeof LabelManager === 'function') {
            this.labelManager = new LabelManager({
                gitlabApi: this.gitlabApi,
                onLabelsLoaded: (labels) => {
                    if (this.commandShortcuts) {
                        this.addLabelShortcut();
                    }
                }
            });
        } else {
            this.labelManager = {
                filteredLabels: [],
                fetchAllLabels: () => Promise.resolve([])
            };
        }
        this.selectionDisplay = new SelectionDisplay({
            selectedIssues: this.selectedIssues,
            onRemoveIssue: (index) => this.onRemoveIssue(index)
        });
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
        if (!items || items.length <= 3) {
            console.warn("Not updating assign shortcut: no meaningful items to add");
            return;
        }

        try {
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['assign'].dropdown.value;
            }
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['assign']) {
                this.commandShortcuts.removeShortcut('assign');
            }
            this.commandShortcuts.addCustomShortcut({
                type: 'assign',
                label: '/assign',
                items: items,
                onSelect: (value) => {
                    if (!value || value === 'separator' || value === 'separator2') return;

                    if (value === 'manage') {
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
            if (currentValue && this.commandShortcuts.shortcuts['assign'] &&
                this.commandShortcuts.shortcuts['assign'].dropdown) {
                this.commandShortcuts.shortcuts['assign'].dropdown.value = currentValue;
            }

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
            const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
            const addedShortcuts = new Set(Object.keys(this.commandShortcuts.shortcuts || {}));
            if (!addedShortcuts.has('estimate')) {
                this.commandShortcuts.initializeEstimateShortcut();
                addedShortcuts.add('estimate');
            }
            if (!addedShortcuts.has('label')) {
                this.addLabelShortcut([
                    {value: '', label: 'Loading labels...'}
                ]);
                addedShortcuts.add('label');
            }
            if (!addedShortcuts.has('milestone')) {
                this.addMilestoneShortcut();
                addedShortcuts.add('milestone');
            }
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
                    {value: '', label: 'Set Milestone'},
                    {value: '%current', label: 'Current Sprint'},
                    {value: '%next', label: 'Next Sprint'},
                    {value: '%upcoming', label: 'Upcoming'},
                    {value: 'none', label: 'Remove Milestone'},
                    {value: 'custom', label: 'Custom...'}
                ],
                onSelect: (value) => {
                    if (!value) return;

                    if (value === 'custom') {
                        const customMilestone = prompt('Enter milestone name:');
                        if (!customMilestone) return;
                        value = customMilestone;
                    }
                    if (!this.commentInput) {
                        console.warn('Comment input not available');
                        return;
                    }
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
        let assignItems = [
            {value: '', label: 'Assign to...'},
            {value: '@me', label: 'Myself'},
            {value: 'none', label: 'Unassign'}
        ];
        let directWhitelist = null;
        try {
            if (typeof GM_getValue === 'function') {
                directWhitelist = GM_getValue('gitLabHelperAssigneeWhitelist', []);
            }
        } catch (e) {
            console.error("Error accessing GM_getValue:", e);
        }
        if (Array.isArray(directWhitelist) && directWhitelist.length > 0) {
            assignItems.push({value: 'separator', label: '────── Favorites ──────'});
            const whitelistItems = directWhitelist.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
            }));

            assignItems = assignItems.concat(whitelistItems);
        } else {
            let assignees = [];
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = this.assigneeManager.getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from this.assigneeManager:", e);
                }
            }
            if ((!assignees || !assignees.length) && window.assigneeManager &&
                typeof window.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.assigneeManager.getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from window.assigneeManager:", e);
                }
            }
            if ((!assignees || !assignees.length) && typeof getAssigneeWhitelist === 'function') {
                try {
                    assignees = getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from imported getAssigneeWhitelist:", e);
                }
            }
            if ((!assignees || !assignees.length) && typeof window.getAssigneeWhitelist === 'function') {
                try {
                    assignees = window.getAssigneeWhitelist();
                } catch (e) {
                    console.error("Error getting assignees from window.getAssigneeWhitelist:", e);
                }
            }
            if (!assignees || !assignees.length) {
                try {
                    const storedValue = localStorage.getItem('gitLabHelperAssigneeWhitelist');
                    if (storedValue) {
                        assignees = JSON.parse(storedValue);
                    }
                } catch (e) {
                    console.error("Error getting assignees from localStorage:", e);
                }
            }
            if (Array.isArray(assignees) && assignees.length > 0) {
                assignItems.push({value: 'separator', label: '────── Favorites ──────'});
                const whitelistItems = assignees.map(assignee => ({
                    value: assignee.username,
                    label: assignee.name || assignee.username
                }));

                assignItems = assignItems.concat(whitelistItems);
            } else {
                console.warn("Could not find any assignees through any method");
            }
        }
        assignItems.push({value: 'custom', label: 'Custom...'});
        this.updateAssignShortcut(assignItems);
        setTimeout(() => {
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        const updatedItems = [...assignItems];
                        updatedItems.push({value: 'separator2', label: '────── Group Members ──────'});
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
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                throw new Error('GitLab API not available');
            }
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                throw new Error('Could not determine project/group path');
            }
            let members;
            if (pathInfo.type === 'project') {
                members = await this.gitlabApi.callGitLabApi(
                    `projects/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            } else if (pathInfo.type === 'group') {
                members = await this.gitlabApi.callGitLabApi(
                    `groups/${pathInfo.encodedPath}/members`,
                    {params: {per_page: 100}}
                );
            } else {
                throw new Error('Unsupported path type: ' + pathInfo.type);
            }

            if (!Array.isArray(members)) {
                console.warn('API did not return an array of members');
                return [];
            }
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
        this.selectedIssues = Array.isArray(issues) ? [...issues] : [];
        if (this.selectionDisplay) {
            this.selectionDisplay.setSelectedIssues(this.selectedIssues);
        }
        // Remove the status element update
    }

    /**
     * Handler when an issue is removed from the selection
     * @param {number} index - Index of the removed issue
     */
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

    /**
     * Create action buttons (select, submit, clear)
     * @param {HTMLElement} container - Container element
     */
    createActionButtons(container) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.marginBottom = '8px';
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
        selectBtn.addEventListener('mouseenter', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#218838' : '#5a6268';
        });
        selectBtn.addEventListener('mouseleave', () => {
            selectBtn.style.backgroundColor = selectBtn.dataset.active === 'true' ? '#28a745' : '#6c757d';
        });

        selectBtn.onclick = () => {
            if (this.uiManager && this.uiManager.issueSelector) {
                if (this.uiManager.issueSelector.isSelectingIssue) {
                    this.uiManager.issueSelector.exitSelectionMode();
                    selectBtn.dataset.active = 'false';
                    selectBtn.style.backgroundColor = '#6c757d'; // Gray when inactive
                    selectBtn.textContent = 'Select';
                } else {
                    this.uiManager.issueSelector.setSelectedIssues([...this.selectedIssues]);
                    this.uiManager.issueSelector.startSelection();
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
        // First, make sure we're working with the right object
        console.log('Current selectedIssues:', this.selectedIssues);

        // Clear the array with proper Vue reactivity
        this.selectedIssues.splice(0, this.selectedIssues.length);

        // Alternative approach - assign a new empty array
        this.selectedIssues = [];

        // Check if selectionDisplay exists and has the method
        if (this.selectionDisplay && typeof this.selectionDisplay.setSelectedIssues === 'function') {
            console.log('Calling selectionDisplay.setSelectedIssues with empty array');
            this.selectionDisplay.setSelectedIssues([]);
        } else {
            console.warn('selectionDisplay not available or missing setSelectedIssues method');
            // Try to find it if not available
            if (this.uiManager && this.uiManager.bulkCommentsView &&
                this.uiManager.bulkCommentsView.selectionDisplay) {
                console.log('Found selectionDisplay through uiManager');
                this.uiManager.bulkCommentsView.selectionDisplay.setSelectedIssues([]);
            }
        }

        // Set status message
        const statusEl = document.getElementById('comment-status');
        if (statusEl) {
            statusEl.textContent = 'Selection cleared.';
            statusEl.style.color = '#666';
        }

        // Show notification
        if (this.notification) {
            this.notification.info('Selection cleared');
        }

        // Also try to clear selection in issueSelector if available
        if (this.uiManager && this.uiManager.issueSelector) {
            console.log('Clearing selection in issueSelector');
            this.uiManager.issueSelector.setSelectedIssues([]);
        }

        // Force a component update
        if (typeof this.$forceUpdate === 'function') {
            this.$forceUpdate();
        }

        console.log('Selection cleared, current selectedIssues:', this.selectedIssues);
    }

    /**
     * Render the Bulk Comments tab
     */
    render() {
        const bulkCommentsContent = document.getElementById('bulk-comments-content');
        if (!bulkCommentsContent) return;
        bulkCommentsContent.innerHTML = '';
        this.addCommentSection(bulkCommentsContent);
        if (this.commandShortcuts) {
            this.initializeAllShortcuts();
            this.isLoading = true;
            if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                this.labelManager.fetchAllLabels()
                    .then(labels => {
                        this.addLabelShortcut();
                        this.isLoading = false;
                        this.hideLoadingState();
                        if (this.uiManager && this.uiManager.removeLoadingScreen) {
                            this.uiManager.removeLoadingScreen('bulkcomments-tab');
                        }
                    })
                    .catch(error => {
                        console.error('Error loading labels:', error);
                        this.addLabelShortcut(this.getFallbackLabels());
                        this.isLoading = false;
                        this.hideLoadingState();
                        if (this.uiManager && this.uiManager.removeLoadingScreen) {
                            this.uiManager.removeLoadingScreen('bulkcomments-tab');
                        }
                    });
            } else {
                console.warn('Label manager not available, using fallback labels');
                this.addLabelShortcut(this.getFallbackLabels());
                this.isLoading = false;
                this.hideLoadingState();
                if (this.uiManager && this.uiManager.removeLoadingScreen) {
                    this.uiManager.removeLoadingScreen('bulkcomments-tab');
                }
            }
        } else {
            console.error('Command shortcuts not initialized');
            this.isLoading = false;
            this.hideLoadingState();
            if (this.uiManager && this.uiManager.removeLoadingScreen) {
                this.uiManager.removeLoadingScreen('bulkcomments-tab');
            }
        }
    }

    /**
     * Add comment utility section to Bulk Comments tab
     * @param {HTMLElement} container - Container element
     */
    addCommentSection(container) {
        const commentSection = document.createElement('div');
        commentSection.classList.add('api-section');
        commentSection.style.marginBottom = '15px';
        commentSection.style.padding = '10px';
        commentSection.style.backgroundColor = '#f5f5f5';
        commentSection.style.borderRadius = '8px';
        commentSection.style.border = '1px solid #e0e0e0';
        this.selectionDisplay.createSelectionContainer(commentSection);
        this.createCommentInput(commentSection);
        this.createActionButtons(commentSection);
        this.createStatusElements(commentSection);
        this.isLoading = true;
        this.showLoadingState();
        try {
            if (this.commentInput && this.commandShortcuts) {
                this.initializeAllShortcuts();
                this.addLabelShortcut([
                    {value: '', label: 'Loading labels...'}
                ]);
                if (this.labelManager && typeof this.labelManager.fetchAllLabels === 'function') {
                    this.labelManager.fetchAllLabels()
                        .then(labels => {
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
            {value: '', label: 'Add Label'},
            {value: 'bug', label: 'Bug'},
            {value: 'feature', label: 'Feature'},
            {value: 'enhancement', label: 'Enhancement'},
            {value: 'documentation', label: 'Documentation'},
            {value: 'custom', label: 'Custom...'}
        ];
    }

    /**
     * This function should be added to the BulkCommentsView.js file
     */
    createCommentInput(container) {
        const shortcutsWrapper = document.createElement('div');
        shortcutsWrapper.id = 'shortcuts-wrapper';
        shortcutsWrapper.style.width = '100%';
        shortcutsWrapper.style.marginBottom = '15px';
        shortcutsWrapper.style.minHeight = '120px'; // Set a fixed minimum height that accommodates all shortcuts
        shortcutsWrapper.style.position = 'relative'; // Important for stable layout
        const placeholderShortcuts = document.createElement('div');
        placeholderShortcuts.style.opacity = '0.4';
        placeholderShortcuts.style.pointerEvents = 'none';
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
        commentInput.addEventListener('focus', () => {
            commentInput.style.borderColor = '#1f75cb';
            commentInput.style.outline = 'none';
            commentInput.style.boxShadow = '0 0 0 2px rgba(31, 117, 203, 0.2)';
        });

        commentInput.addEventListener('blur', () => {
            commentInput.style.borderColor = '#ccc';
            commentInput.style.boxShadow = 'none';
        });
        container.appendChild(commentInput);
        this.commentInput = commentInput;
        try {
            if (typeof CommandShortcut === 'function') {
                this.commandShortcuts = new CommandShortcut({
                    targetElement: commentInput,
                    onShortcutInsert: (type, value) => {
                    }
                });
                this.commandShortcuts.initialize(shortcutsWrapper);
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
        const currentText = textarea.value;
        const startPos = textarea.selectionStart;
        const endPos = textarea.selectionEnd;
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }
        textarea.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);
        const newCursorPos = startPos + insertText.length;
        textarea.setSelectionRange(newCursorPos, newCursorPos);
        textarea.focus();
    }

    /**
     * Create status message and progress bar elements
     * @param {HTMLElement} container - Container element
     */
    createStatusElements(container) {
        // Remove the status message element completely

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
        // Remove the reference to statusEl since we're no longer using it

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.label) {
            this.addLabelShortcut([
                {value: '', label: 'Loading labels...'}
            ]);
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.milestone) {
            this.addMilestoneShortcut();
        }

        if (this.commandShortcuts && !this.commandShortcuts.shortcuts?.assign) {
            this.addAssignShortcut();
        }
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
        const commentInput = document.getElementById('issue-comment-input');
        if (commentInput) {
            commentInput.disabled = false;
            commentInput.style.opacity = '1';
            commentInput.style.cursor = 'text';
        }
        const buttons = document.querySelectorAll('.api-section button');
        buttons.forEach(button => {
            button.disabled = false;
            button.style.opacity = '1';
            button.style.cursor = 'pointer';
        });
    }

    async submitComments() {
        if (!this.commentInput) {
            this.notification.error('Comment input not found');
            return;
        }

        // Remove references to the status element
        const progressContainer = document.getElementById('comment-progress-container');
        const progressBar = document.getElementById('comment-progress-bar');
        const progressLabel = document.getElementById('comment-progress-label');

        if (this.selectedIssues.length === 0) {
            this.notification.error('No issues selected');
            return;
        }

        const comment = this.commentInput.value.trim();
        if (!comment) {
            this.notification.error('Comment cannot be empty');
            return;
        }
        let fullUILoadingScreen;
        if (this.uiManager && this.uiManager.addLoadingScreen) {
            const mainContainer = document.getElementById('assignee-time-summary');
            if (mainContainer) {
                const containerPosition = window.getComputedStyle(mainContainer).position;
                if (containerPosition === 'static') {
                    mainContainer.style.position = 'relative';
                    mainContainer.dataset.originalPosition = containerPosition;
                }
                fullUILoadingScreen = this.uiManager.addLoadingScreen(
                    mainContainer,
                    'comment-submit',
                    `Sending comments to ${this.selectedIssues.length} issues...`
                );
            }
        }

        if (progressContainer) {
            progressContainer.style.display = 'block';
        }

        if (progressBar) {
            progressBar.style.width = '0%';
        }
        const submitBtn = Array.from(document.querySelectorAll('button')).find(b =>
            b.textContent && b.textContent.includes('Send'));

        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.style.opacity = '0.7';
            submitBtn.style.cursor = 'not-allowed';
        }

        let successCount = 0;
        let failCount = 0;
        const gitlabApi = this.gitlabApi || window.gitlabApi || (this.uiManager && this.uiManager.gitlabApi);

        if (!gitlabApi) {
            this.notification.error('GitLab API not available');

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.style.opacity = '1';
                submitBtn.style.cursor = 'pointer';
            }

            if (progressContainer) {
                progressContainer.style.display = 'none';
            }
            if (this.uiManager && this.uiManager.removeLoadingScreen && fullUILoadingScreen) {
                this.uiManager.removeLoadingScreen('comment-submit');
            }

            return;
        }
        for (let i = 0; i < this.selectedIssues.length; i++) {
            const issue = this.selectedIssues[i];
            if (!issue) {
                failCount++;
                continue;
            }
            const progress = Math.round((i / this.selectedIssues.length) * 100);
            if (progressBar) {
                progressBar.style.width = `${progress}%`;
            }

            if (progressLabel) {
                progressLabel.textContent = `Processing ${i + 1} of ${this.selectedIssues.length} issues...`;
            }
            if (this.uiManager && this.uiManager.updateLoadingMessage) {
                this.uiManager.updateLoadingMessage(
                    'comment-submit',
                    `Sending comment to issue #${issue.iid || i + 1} (${i + 1}/${this.selectedIssues.length})...`
                );
            }

            try {
                await gitlabApi.addComment(issue, comment);
                successCount++;
            } catch (error) {
                console.error(`Failed to add comment to issue #${issue.iid}:`, error);
                failCount++;
            }
        }
        if (progressBar) {
            progressBar.style.width = '100%';
        }
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.style.opacity = '1';
            submitBtn.style.cursor = 'pointer';
        }
        if (successCount === this.selectedIssues.length) {
            this.notification.success(`Added comment to ${successCount} issues`);
            if (this.commentInput) {
                this.commentInput.value = '';
            }
            let that = this
            this.refreshBoard().then(function(){
                progressContainer.style.display = 'none';
                that.uiManager.issueSelector.applyOverflowFixes()
                that.clearSelectedIssues();
                that.uiManager.issueSelector.exitSelectionMode();
                that.uiManager.removeLoadingScreen('comment-submit');
            })

        } else {
            if (successCount > 0) {
                this.notification.warning(`Added comment to ${successCount} issues, failed for ${failCount}`);
                setTimeout(() => {
                    this.refreshBoard();
                }, 1000);
            } else {
                this.notification.error(`Failed to add comments to all ${failCount} issues`);
            }
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
            let currentValue = null;
            if (this.commandShortcuts.shortcuts &&
                this.commandShortcuts.shortcuts['label'] &&
                this.commandShortcuts.shortcuts['label'].dropdown) {
                currentValue = this.commandShortcuts.shortcuts['label'].dropdown.value;
            }
            let labelItems;

            if (customLabels) {
                labelItems = customLabels;
            } else if (this.labelManager && this.labelManager.filteredLabels && this.labelManager.filteredLabels.length) {
                labelItems = [{value: '', label: 'Add Label'}];
                const labels = this.labelManager.filteredLabels.map(label => ({
                    value: label.name,
                    label: label.name
                }));

                labelItems = labelItems.concat(labels);
                labelItems.push({value: 'custom', label: 'Custom...'});
            } else {
                try {
                    const whitelist = getLabelWhitelist();
                    if (whitelist && whitelist.length > 0) {
                        labelItems = [{value: '', label: 'Add Label'}];
                        const whitelistItems = whitelist.map(term => ({
                            value: term,
                            label: term
                        }));

                        labelItems = labelItems.concat(whitelistItems);
                        labelItems.push({value: 'custom', label: 'Custom...'});
                    } else {
                        labelItems = this.getFallbackLabels();
                    }
                } catch (e) {
                    console.error('Error getting label whitelist:', e);
                    labelItems = this.getFallbackLabels();
                }
            }
            if (this.commandShortcuts.shortcuts && this.commandShortcuts.shortcuts['label']) {
                this.commandShortcuts.removeShortcut('label');
            }
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
                    const labelText = `/label ~"${value}"`;

                    this.insertTextAtCursor(textarea, labelText);
                    this.notification.info(`Label added: ${value}`);
                }
            });
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
    async refreshBoard() {
        const boardLists = document.querySelectorAll('.board-list-component');
        for (const list of boardLists) {
            list.__vue__.$apollo.queries.currentList.refetch().then(function(){
                uiManager.issueSelector.applyOverflowFixes()
            })
        }
    }
}
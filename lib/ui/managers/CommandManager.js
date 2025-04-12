import { getAssigneeWhitelist, saveAssigneeWhitelist } from '../../storage/SettingsStorage';
import CommandShortcut from '../components/CommandShortcut';
import Notification from '../components/Notification';

/**
 * Manager for GitLab commands and shortcuts
 */
export default class CommandManager {
    /**
     * Constructor for CommandManager
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.targetElement - Target textarea element
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Object} options.labelManager - Label manager instance
     * @param {Function} options.onCommandInsert - Callback when command is inserted
     */
    constructor(options = {}) {
        this.targetElement = options.targetElement;
        this.gitlabApi = options.gitlabApi;
        this.labelManager = options.labelManager;
        this.onCommandInsert = options.onCommandInsert || null;
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
        this.assigneeWhitelist = getAssigneeWhitelist();
        this.shortcutContainer = null;
        this.commandShortcut = null;
    }

    /**
     * Initialize the command shortcuts UI
     * @param {HTMLElement} container - Container to add shortcuts to
     */
    initialize(container) {
        this.shortcutContainer = container;
        this.commandShortcut = new CommandShortcut({
            targetElement: this.targetElement,
            onShortcutInsert: (type, value) => {
                if (typeof this.onCommandInsert === 'function') {
                    this.onCommandInsert(type, value);
                }
            }
        });
        this.commandShortcut.initialize(container);
        this.addCustomShortcuts();
    }

    /**
     * Add custom shortcuts beyond the default estimate shortcut
     */
    addCustomShortcuts() {
        if (!this.commandShortcut) return;
        this.addMilestoneShortcut();
        this.addAssignShortcut();
        this.addDueDateShortcut();
        this.addWeightShortcut();
    }

    /**
     * Add milestone shortcut
     */
    addMilestoneShortcut() {
        this.commandShortcut.addCustomShortcut({
            type: 'milestone',
            label: '/milestone',
            items: [
                { value: '', label: 'Set Milestone' },
                { value: '%current', label: 'Current Sprint' },
                { value: '%next', label: 'Next Sprint' },
                { value: '%upcoming', label: 'Upcoming' },
                { value: '%backlog', label: 'Backlog' },
                { value: 'none', label: 'Remove Milestone' }
            ],
            onSelect: (value) => {
                if (!this.targetElement) return;
                let milestoneText = '/milestone ';
                if (value === 'none') {
                    milestoneText += '%""';
                } else if (value.startsWith('%')) {
                    milestoneText += value;
                } else {
                    milestoneText += `%"${value}"`;
                }
                const milestoneRegex = /\/milestone\s+%[^\n]+/g;

                this.replaceOrInsertCommand(
                    'milestone',
                    milestoneText,
                    milestoneRegex,
                    () => this.insertTextAtCursor(milestoneText)
                );
                this.notification.info(`Milestone command added: ${value}`);
            }
        });
    }

    /**
     * Add assign shortcut with whitelist support
     */
    /**
     * Add assign shortcut
     */
    addAssignShortcut() {
        if (!this.commandShortcuts) return;

        try {
            let assignItems = [
                { value: '', label: 'Assign to...' },
                { value: '@me', label: 'Myself' },
                { value: 'none', label: 'Unassign' }
            ];
            if (this.assigneeManager && typeof this.assigneeManager.getAssigneeWhitelist === 'function') {
                try {
                    const whitelistedAssignees = this.assigneeManager.getAssigneeWhitelist();
                    
                    if (Array.isArray(whitelistedAssignees) && whitelistedAssignees.length > 0) {
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
                        const whitelistItems = whitelistedAssignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                } catch (e) {
                    console.error('Error getting assignee whitelist from manager:', e);
                    try {
                        const assignees = getAssigneeWhitelist();
                        
                        if (Array.isArray(assignees) && assignees.length > 0) {
                            assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
                            const whitelistItems = assignees.map(assignee => ({
                                value: assignee.username,
                                label: assignee.name || assignee.username
                            }));

                            assignItems = assignItems.concat(whitelistItems);
                        }
                    } catch (storageError) {
                        console.error('Error accessing assignee whitelist from storage:', storageError);
                    }
                }
            } else {
                try {
                    let assignees = [];
                    if (typeof getAssigneeWhitelist === 'function') {
                        assignees = getAssigneeWhitelist();
                    } else if (window.getAssigneeWhitelist) {
                        assignees = window.getAssigneeWhitelist();
                    } else {
                        console.warn('getAssigneeWhitelist function not available, no assignees will be loaded');
                    }

                    
                    if (Array.isArray(assignees) && assignees.length > 0) {
                        assignItems.push({ value: 'separator', label: '────── Favorites ──────' });
                        const whitelistItems = assignees.map(assignee => ({
                            value: assignee.username,
                            label: assignee.name || assignee.username
                        }));

                        assignItems = assignItems.concat(whitelistItems);
                    }
                } catch (directError) {
                    console.error('Error directly accessing assignee whitelist:', directError);
                }
            }
            this.fetchGroupMembers()
                .then(members => {
                    if (members && members.length > 0) {
                        assignItems.push({ value: 'separator2', label: '────── Group Members ──────' });
                        const memberItems = members.map(member => ({
                            value: member.username,
                            label: member.name || member.username
                        }));

                        assignItems = assignItems.concat(memberItems);
                        this.updateAssignShortcut(assignItems);
                    }
                })
                .catch(error => {
                    console.error('Error fetching group members:', error);
                });
            assignItems.push({ value: 'custom', label: 'Custom...' });
            assignItems.push({ value: 'manage', label: '✏️ Manage Assignees...' });
            this.updateAssignShortcut(assignItems);
        } catch (e) {
            console.error('Error adding assign shortcut:', e);
        }
    }

    /**
     * Add due date shortcut
     */
    addDueDateShortcut() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const formatDate = (date) => {
            return date.toISOString().substring(0, 10); // YYYY-MM-DD
        };

        this.commandShortcut.addCustomShortcut({
            type: 'due',
            label: '/due',
            items: [
                { value: '', label: 'Set Due Date' },
                { value: formatDate(today), label: 'Today' },
                { value: formatDate(tomorrow), label: 'Tomorrow' },
                { value: formatDate(nextWeek), label: 'Next Week' },
                { value: formatDate(nextMonth), label: 'Next Month' },
                { value: 'custom', label: 'Custom Date...' },
                { value: 'none', label: 'Remove Due Date' }
            ],
            onSelect: (value) => {
                if (!this.targetElement) return;
                if (value === 'custom') {
                    const customDate = prompt('Enter due date (YYYY-MM-DD):', formatDate(today));

                    if (!customDate) return;
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
                        this.notification.error('Invalid date format. Please use YYYY-MM-DD');
                        return;
                    }

                    value = customDate;
                }
                let dueText = '/due ';

                if (value === 'none') {
                    dueText += 'none';
                } else {
                    dueText += value;
                }
                const dueRegex = /\/due\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'due',
                    dueText,
                    dueRegex,
                    () => this.insertTextAtCursor(dueText)
                );
                if (value === 'none') {
                    this.notification.info('Due date will be removed');
                } else {
                    this.notification.info(`Due date set to ${value}`);
                }
            }
        });
    }

    /**
     * Add weight shortcut
     */
    addWeightShortcut() {
        this.commandShortcut.addCustomShortcut({
            type: 'weight',
            label: '/weight',
            items: [
                { value: '', label: 'Set Weight' },
                { value: '1', label: '1 (Trivial)' },
                { value: '2', label: '2 (Small)' },
                { value: '3', label: '3 (Medium)' },
                { value: '5', label: '5 (Large)' },
                { value: '8', label: '8 (Very Large)' },
                { value: 'custom', label: 'Custom Weight...' },
                { value: 'none', label: 'Remove Weight' }
            ],
            onSelect: (value) => {
                if (!this.targetElement) return;
                if (value === 'custom') {
                    const customWeight = prompt('Enter weight (number):', '');

                    if (!customWeight) return;
                    const weight = parseInt(customWeight, 10);
                    if (isNaN(weight) || weight < 0) {
                        this.notification.error('Invalid weight. Please enter a positive number');
                        return;
                    }

                    value = customWeight;
                }
                let weightText = '/weight ';

                if (value === 'none') {
                    weightText += 'none';
                } else {
                    weightText += value;
                }
                const weightRegex = /\/weight\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'weight',
                    weightText,
                    weightRegex,
                    () => this.insertTextAtCursor(weightText)
                );
                if (value === 'none') {
                    this.notification.info('Weight will be removed');
                } else {
                    this.notification.info(`Weight set to ${value}`);
                }
            }
        });
    }

    /**
     * Open assignee whitelist manager dialog
     */
    openAssigneeManager() {
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'assignee-manager-overlay';
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '110';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '500px';
        modalContent.style.maxWidth = '90%';
        modalContent.style.maxHeight = '80vh';
        modalContent.style.overflow = 'auto';
        modalContent.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        const modalHeader = document.createElement('div');
        modalHeader.style.display = 'flex';
        modalHeader.style.justifyContent = 'space-between';
        modalHeader.style.alignItems = 'center';
        modalHeader.style.marginBottom = '15px';

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
        const assigneeSection = document.createElement('div');
        const description = document.createElement('p');
        description.textContent = 'Add usernames to quickly assign issues. These will appear in your /assign dropdown.';
        description.style.marginBottom = '15px';
        const assigneeList = document.createElement('div');
        assigneeList.style.marginBottom = '15px';
        assigneeList.style.maxHeight = '200px';
        assigneeList.style.overflowY = 'auto';
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.padding = '10px 0';
            return emptyMessage;
        };
        this.assigneeWhitelist.forEach((assignee, index) => {
            const assigneeItem = document.createElement('div');
            assigneeItem.style.display = 'flex';
            assigneeItem.style.justifyContent = 'space-between';
            assigneeItem.style.alignItems = 'center';
            assigneeItem.style.padding = '8px';
            assigneeItem.style.borderBottom = '1px solid #eee';

            const assigneeInfo = document.createElement('div');
            assigneeInfo.style.display = 'flex';
            assigneeInfo.style.alignItems = 'center';

            const assigneeName = document.createElement('div');
            assigneeName.textContent = assignee.name || assignee.username;
            assigneeName.style.fontWeight = 'bold';
            assigneeName.style.marginRight = '5px';

            const assigneeUsername = document.createElement('div');
            assigneeUsername.textContent = `@${assignee.username}`;
            assigneeUsername.style.color = '#666';
            assigneeUsername.style.fontSize = '13px';

            assigneeInfo.appendChild(assigneeName);
            assigneeInfo.appendChild(assigneeUsername);

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.style.padding = '3px 8px';
            removeButton.style.backgroundColor = '#dc3545';
            removeButton.style.color = 'white';
            removeButton.style.border = 'none';
            removeButton.style.borderRadius = '3px';
            removeButton.style.cursor = 'pointer';
            removeButton.onclick = () => {
                this.assigneeWhitelist.splice(index, 1);
                saveAssigneeWhitelist(this.assigneeWhitelist);
                assigneeItem.remove();
                if (this.assigneeWhitelist.length === 0) {
                    assigneeList.appendChild(createEmptyMessage());
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);
        });
        if (this.assigneeWhitelist.length === 0) {
            assigneeList.appendChild(createEmptyMessage());
        }
        const addForm = document.createElement('div');
        addForm.style.marginTop = '20px';
        addForm.style.marginBottom = '20px';
        addForm.style.padding = '15px';
        addForm.style.backgroundColor = '#f8f9fa';
        addForm.style.borderRadius = '4px';

        const formTitle = document.createElement('div');
        formTitle.textContent = 'Add New Assignee';
        formTitle.style.fontWeight = 'bold';
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
                alert('Username is required');
                return;
            }
            const newAssignee = {
                name: name || username, // Use name if provided, otherwise use username
                username: username
            };
            const existingIndex = this.assigneeWhitelist.findIndex(a => a.username === username);
            if (existingIndex >= 0) {
                this.assigneeWhitelist[existingIndex] = newAssignee;
            } else {
                this.assigneeWhitelist.push(newAssignee);
            }
            saveAssigneeWhitelist(this.assigneeWhitelist);
            const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }
            const assigneeItem = document.createElement('div');
            assigneeItem.style.display = 'flex';
            assigneeItem.style.justifyContent = 'space-between';
            assigneeItem.style.alignItems = 'center';
            assigneeItem.style.padding = '8px';
            assigneeItem.style.borderBottom = '1px solid #eee';

            const assigneeInfo = document.createElement('div');
            assigneeInfo.style.display = 'flex';
            assigneeInfo.style.alignItems = 'center';

            const assigneeName = document.createElement('div');
            assigneeName.textContent = newAssignee.name;
            assigneeName.style.fontWeight = 'bold';
            assigneeName.style.marginRight = '5px';

            const assigneeUsername = document.createElement('div');
            assigneeUsername.textContent = `@${newAssignee.username}`;
            assigneeUsername.style.color = '#666';
            assigneeUsername.style.fontSize = '13px';

            assigneeInfo.appendChild(assigneeName);
            assigneeInfo.appendChild(assigneeUsername);

            const removeButton = document.createElement('button');
            removeButton.textContent = 'Remove';
            removeButton.style.padding = '3px 8px';
            removeButton.style.backgroundColor = '#dc3545';
            removeButton.style.color = 'white';
            removeButton.style.border = 'none';
            removeButton.style.borderRadius = '3px';
            removeButton.style.cursor = 'pointer';
            removeButton.onclick = () => {
                const index = this.assigneeWhitelist.findIndex(a => a.username === newAssignee.username);
                if (index >= 0) {
                    this.assigneeWhitelist.splice(index, 1);
                    saveAssigneeWhitelist(this.assigneeWhitelist);
                    assigneeItem.remove();
                    if (this.assigneeWhitelist.length === 0) {
                        assigneeList.appendChild(createEmptyMessage());
                    }
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);
            nameInput.value = '';
            usernameInput.value = '';
            this.notification.success(`Added assignee: ${newAssignee.name}`);
        };

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(addButton);
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Close';
        saveButton.style.padding = '8px 16px';
        saveButton.style.backgroundColor = '#6c757d';
        saveButton.style.color = 'white';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '4px';
        saveButton.style.cursor = 'pointer';
        saveButton.style.marginTop = '10px';
        saveButton.onclick = () => {
            modalOverlay.remove();
            this.addAssignShortcut();
        };
        assigneeSection.appendChild(description);
        assigneeSection.appendChild(assigneeList);
        assigneeSection.appendChild(addForm);
        assigneeSection.appendChild(saveButton);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(assigneeSection);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
                this.addAssignShortcut();
            }
        });
    }

    /**
     * Insert text at cursor position in textarea
     * @param {string} text - Text to insert
     */
    insertTextAtCursor(text) {
        if (!this.targetElement) return;

        const startPos = this.targetElement.selectionStart;
        const endPos = this.targetElement.selectionEnd;
        const currentText = this.targetElement.value;
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }
        this.targetElement.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);
        const newCursorPos = startPos + insertText.length;
        this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
        this.targetElement.focus();
    }

    /**
     * Apply replacement logic for command types
     * @param {string} type - Type of shortcut (e.g., 'label', 'milestone')
     * @param {string} command - The command to insert (e.g., '/label ~bug')
     * @param {RegExp} regex - Regular expression to match existing commands
     * @param {Function} insertFn - Function to handle the insertion if no existing command
     */
    replaceOrInsertCommand(type, command, regex, insertFn) {
        if (!this.targetElement) return;
        const currentText = this.targetElement.value;
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            const newText = currentText.replace(regex, command);
            this.targetElement.value = newText;
            this.targetElement.focus();
        } else {
            insertFn();
        }
        if (typeof this.onCommandInsert === 'function') {
            this.onCommandInsert(type, command);
        }
    }
}
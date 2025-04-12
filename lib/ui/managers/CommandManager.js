// CommandManager.js - Handles GitLab commands and shortcuts
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

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Load assignee whitelist from storage
        this.assigneeWhitelist = getAssigneeWhitelist();

        // Initialize shortcuts container
        this.shortcutContainer = null;
        this.commandShortcut = null;
    }

    /**
     * Initialize the command shortcuts UI
     * @param {HTMLElement} container - Container to add shortcuts to
     */
    initialize(container) {
        this.shortcutContainer = container;

        // Create command shortcut instance
        this.commandShortcut = new CommandShortcut({
            targetElement: this.targetElement,
            onShortcutInsert: (type, value) => {
                // Handle shortcut insertion
                console.log(`Shortcut inserted: ${type} with value ${value}`);

                // Call callback if provided
                if (typeof this.onCommandInsert === 'function') {
                    this.onCommandInsert(type, value);
                }
            }
        });

        // Initialize shortcuts
        this.commandShortcut.initialize(container);

        // Add custom shortcuts beyond the default estimate shortcut
        this.addCustomShortcuts();
    }

    /**
     * Add custom shortcuts beyond the default estimate shortcut
     */
    addCustomShortcuts() {
        if (!this.commandShortcut) return;

        // Add milestone shortcut
        this.addMilestoneShortcut();

        // Add assign shortcut
        this.addAssignShortcut();

        // Add due date shortcut
        this.addDueDateShortcut();

        // Add weight shortcut
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
                // Get the textarea
                if (!this.targetElement) return;

                // Format milestone text based on value
                let milestoneText = '/milestone ';
                if (value === 'none') {
                    milestoneText += '%""';
                } else if (value.startsWith('%')) {
                    milestoneText += value;
                } else {
                    milestoneText += `%"${value}"`;
                }

                // Check if there's already a milestone command
                const milestoneRegex = /\/milestone\s+%[^\n]+/g;

                this.replaceOrInsertCommand(
                    'milestone',
                    milestoneText,
                    milestoneRegex,
                    () => this.insertTextAtCursor(milestoneText)
                );

                // Show notification
                this.notification.info(`Milestone command added: ${value}`);
            }
        });
    }

    /**
     * Add assign shortcut with whitelist support
     */
    addAssignShortcut() {
        // Base assign items
        const assignItems = [
            { value: '', label: 'Assign to...' },
            { value: '@me', label: 'Myself' },
            { value: 'none', label: 'Unassign' }
        ];

        // Add whitelisted assignees if available
        if (this.assigneeWhitelist && this.assigneeWhitelist.length > 0) {
            const whitelistItems = this.assigneeWhitelist.map(assignee => ({
                value: assignee.username,
                label: assignee.name || assignee.username
            }));

            // Add whitelist items after the built-in options
            assignItems.push(...whitelistItems);
        }

        // Also add a way to edit the whitelist
        assignItems.push({ value: 'manage_whitelist', label: '✏️ Manage Assignees...' });

        this.commandShortcut.addCustomShortcut({
            type: 'assign',
            label: '/assign',
            items: assignItems,
            onSelect: (value) => {
                // Handle special case for managing the whitelist
                if (value === 'manage_whitelist') {
                    this.openAssigneeManager();
                    return;
                }

                if (!this.targetElement) return;

                let assignText = '/assign ';

                if (value === 'none') {
                    assignText += '@none';
                } else if (value === '@me') {
                    assignText += '@me';
                } else {
                    // Handle usernames - prefix with @ if not already there
                    assignText += value.startsWith('@') ? value : `@${value}`;
                }

                // Check if there's already an assign command
                const assignRegex = /\/assign\s+@[^\n]+/g;

                this.replaceOrInsertCommand(
                    'assign',
                    assignText,
                    assignRegex,
                    () => this.insertTextAtCursor(assignText)
                );

                // Show notification
                if (value === 'none') {
                    this.notification.info('Issue will be unassigned');
                } else {
                    this.notification.info(`Issue will be assigned to ${value.replace('@', '')}`);
                }
            }
        });
    }

    /**
     * Add due date shortcut
     */
    addDueDateShortcut() {
        // Calculate some common dates
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);

        const nextMonth = new Date(today);
        nextMonth.setMonth(nextMonth.getMonth() + 1);

        // Format the dates
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

                // Handle custom date input
                if (value === 'custom') {
                    const customDate = prompt('Enter due date (YYYY-MM-DD):', formatDate(today));

                    if (!customDate) return;

                    // Validate date format
                    if (!/^\d{4}-\d{2}-\d{2}$/.test(customDate)) {
                        this.notification.error('Invalid date format. Please use YYYY-MM-DD');
                        return;
                    }

                    value = customDate;
                }

                // Create the due date command
                let dueText = '/due ';

                if (value === 'none') {
                    dueText += 'none';
                } else {
                    dueText += value;
                }

                // Check if there's already a due date command
                const dueRegex = /\/due\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'due',
                    dueText,
                    dueRegex,
                    () => this.insertTextAtCursor(dueText)
                );

                // Show notification
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

                // Handle custom weight input
                if (value === 'custom') {
                    const customWeight = prompt('Enter weight (number):', '');

                    if (!customWeight) return;

                    // Validate weight
                    const weight = parseInt(customWeight, 10);
                    if (isNaN(weight) || weight < 0) {
                        this.notification.error('Invalid weight. Please enter a positive number');
                        return;
                    }

                    value = customWeight;
                }

                // Create the weight command
                let weightText = '/weight ';

                if (value === 'none') {
                    weightText += 'none';
                } else {
                    weightText += value;
                }

                // Check if there's already a weight command
                const weightRegex = /\/weight\s+[^\n]+/g;

                this.replaceOrInsertCommand(
                    'weight',
                    weightText,
                    weightRegex,
                    () => this.insertTextAtCursor(weightText)
                );

                // Show notification
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
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'assignee-manager-overlay';
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
        modalContent.style.width = '500px';
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

        // Create assignee list section
        const assigneeSection = document.createElement('div');

        // Create description
        const description = document.createElement('p');
        description.textContent = 'Add usernames to quickly assign issues. These will appear in your /assign dropdown.';
        description.style.marginBottom = '15px';

        // Create current assignee list
        const assigneeList = document.createElement('div');
        assigneeList.style.marginBottom = '15px';
        assigneeList.style.maxHeight = '200px';
        assigneeList.style.overflowY = 'auto';

        // Helper function to create empty message when list is empty
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.padding = '10px 0';
            return emptyMessage;
        };

        // Create assignee items
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

                // Show empty message if no assignees left
                if (this.assigneeWhitelist.length === 0) {
                    assigneeList.appendChild(createEmptyMessage());
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);
        });

        // Show empty message if no assignees
        if (this.assigneeWhitelist.length === 0) {
            assigneeList.appendChild(createEmptyMessage());
        }

        // Create add assignee form
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

        // Create form fields
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

        // Add button
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

            // Add to whitelist
            const newAssignee = {
                name: name || username, // Use name if provided, otherwise use username
                username: username
            };

            // Check if already exists
            const existingIndex = this.assigneeWhitelist.findIndex(a => a.username === username);
            if (existingIndex >= 0) {
                // Update existing
                this.assigneeWhitelist[existingIndex] = newAssignee;
            } else {
                // Add new
                this.assigneeWhitelist.push(newAssignee);
            }

            // Save whitelist
            saveAssigneeWhitelist(this.assigneeWhitelist);

            // Remove empty message if it exists
            const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // Create new assignee item and add to list
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

                    // Show empty message if no assignees left
                    if (this.assigneeWhitelist.length === 0) {
                        assigneeList.appendChild(createEmptyMessage());
                    }
                }
            };

            assigneeItem.appendChild(assigneeInfo);
            assigneeItem.appendChild(removeButton);

            assigneeList.appendChild(assigneeItem);

            // Clear inputs
            nameInput.value = '';
            usernameInput.value = '';

            // Show notification
            this.notification.success(`Added assignee: ${newAssignee.name}`);
        };

        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(addButton);

        // Add save and close button
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
            // Close modal and refresh the UI to show new assignees
            modalOverlay.remove();

            // Update the assign shortcut with new whitelist
            this.addAssignShortcut();
        };

        // Add all components to the modal
        assigneeSection.appendChild(description);
        assigneeSection.appendChild(assigneeList);
        assigneeSection.appendChild(addForm);
        assigneeSection.appendChild(saveButton);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(assigneeSection);
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();

                // Update the assign shortcut with new whitelist
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

        // Add newline if needed
        let insertText = text;
        if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
            insertText = '\n' + insertText;
        }

        // Insert text at cursor position
        this.targetElement.value = currentText.substring(0, startPos) +
            insertText +
            currentText.substring(endPos);

        // Set cursor position after inserted text
        const newCursorPos = startPos + insertText.length;
        this.targetElement.setSelectionRange(newCursorPos, newCursorPos);

        // Focus the textarea
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

        // Get current text
        const currentText = this.targetElement.value;

        // Check if there's already a command of this type
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            const newText = currentText.replace(regex, command);
            this.targetElement.value = newText;

            // Set focus back to textarea
            this.targetElement.focus();
        } else {
            // Execute the provided insertion function
            insertFn();
        }

        // Call the callback if provided
        if (typeof this.onCommandInsert === 'function') {
            this.onCommandInsert(type, command);
        }
    }
}
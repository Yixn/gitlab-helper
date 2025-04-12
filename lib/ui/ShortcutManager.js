// ShortcutManager.js - Handles custom shortcuts and command replacements

class ShortcutManager {
    constructor(apiTabView) {
        this.apiTabView = apiTabView;
        this.assigneeWhitelist = this.loadAssigneeWhitelist();
    }

    /**
     * Load assignee whitelist from localStorage or return default empty array
     * @returns {Array} Whitelist array
     */
    loadAssigneeWhitelist() {
        const savedWhitelist = localStorage.getItem('gitLabHelperAssigneeWhitelist');
        if (savedWhitelist) {
            try {
                return JSON.parse(savedWhitelist);
            } catch (e) {
                console.error('Error parsing saved assignee whitelist:', e);
                return [];
            }
        }
        return [];
    }

    /**
     * Save assignee whitelist to localStorage
     * @param {Array} whitelist - Array of assignee objects
     */
    saveAssigneeWhitelist(whitelist) {
        localStorage.setItem('gitLabHelperAssigneeWhitelist', JSON.stringify(whitelist));
    }

    /**
     * Add custom shortcuts beyond the default estimate shortcut
     */
    addCustomShortcuts() {
        if (!this.apiTabView.commentShortcuts) return;

        // Add milestone shortcut
        this.addMilestoneShortcut();

        // Add assign shortcut
        this.addAssignShortcut();
    }

    /**
     * Add milestone shortcut
     */
    addMilestoneShortcut() {
        this.apiTabView.commentShortcuts.addCustomShortcut({
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
                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

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

                this.replaceOrInsertCommand(textarea, 'milestone', milestoneText, milestoneRegex, () => {
                    // This function is executed if no existing milestone command is found
                    // Get current cursor position
                    const startPos = textarea.selectionStart;
                    const endPos = textarea.selectionEnd;

                    // Get existing text
                    const currentText = textarea.value;

                    // Check if we need to add a new line before the command
                    let insertText = milestoneText;
                    if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                        insertText = '\n' + insertText;
                    }

                    // Insert text at cursor position
                    const newText = currentText.substring(0, startPos) +
                        insertText +
                        currentText.substring(endPos);

                    // Update textarea value
                    textarea.value = newText;

                    // Set cursor position after inserted text
                    const newCursorPos = startPos + insertText.length;
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                });
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

        this.apiTabView.commentShortcuts.addCustomShortcut({
            type: 'assign',
            label: '/assign',
            items: assignItems,
            onSelect: (value) => {
                const textarea = document.getElementById('issue-comment-input');

                // Handle special case for managing the whitelist
                if (value === 'manage_whitelist') {
                    this.openAssigneeManager();
                    return;
                }

                if (!textarea) return;

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

                this.replaceOrInsertCommand(textarea, 'assign', assignText, assignRegex, () => {
                    // This function is executed if no existing assign command is found
                    const startPos = textarea.selectionStart;
                    const endPos = textarea.selectionEnd;
                    const currentText = textarea.value;

                    let insertText = assignText;
                    if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                        insertText = '\n' + insertText;
                    }

                    const newText = currentText.substring(0, startPos) +
                        insertText +
                        currentText.substring(endPos);

                    textarea.value = newText;

                    const newCursorPos = startPos + insertText.length;
                    textarea.setSelectionRange(newCursorPos, newCursorPos);
                });
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
                this.saveAssigneeWhitelist(this.assigneeWhitelist);
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

        // Create empty message if no assignees
        function createEmptyMessage() {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.color = '#666';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.padding = '10px 0';
            return emptyMessage;
        }

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
            this.saveAssigneeWhitelist(this.assigneeWhitelist);

            // Remove empty message if it exists
            const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                emptyMessage.remove();
            }

            // Create new assignee item
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
                    this.saveAssigneeWhitelist(this.assigneeWhitelist);
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
     * Format date as YYYY-MM-DD
     * @param {Date} date - Date to format
     * @returns {string} Formatted date string
     */
    formatDate(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    /**
     * Apply replacement logic for command types
     * @param {HTMLElement} textarea - Textarea element
     * @param {string} type - Type of shortcut (e.g., 'label', 'milestone')
     * @param {string} command - The command to insert (e.g., '/label ~bug')
     * @param {RegExp} regex - Regular expression to match existing commands
     * @param {Function} insertFn - Function to handle the insertion if no existing command
     */
    replaceOrInsertCommand(textarea, type, command, regex, insertFn) {
        if (!textarea) return;

        // Get current text
        const currentText = textarea.value;

        // Check if there's already a command of this type
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            const newText = currentText.replace(regex, command);
            textarea.value = newText;

            // Set focus back to textarea
            textarea.focus();
        } else {
            // Execute the provided insertion function
            insertFn();
        }

        // Call the callback if provided
        if (this.apiTabView.commentShortcuts.onShortcutInsert) {
            this.apiTabView.commentShortcuts.onShortcutInsert(type, command);
        }
    }
}
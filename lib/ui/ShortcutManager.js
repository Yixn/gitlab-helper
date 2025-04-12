// ShortcutManager.js - Handles custom shortcuts and command replacements

class ShortcutManager {
    constructor(apiTabView) {
        this.apiTabView = apiTabView;
    }

    /**
     * Add custom shortcuts beyond the default estimate shortcut
     */
    addCustomShortcuts() {
        if (!this.apiTabView.commentShortcuts) return;

        // Add milestone shortcut
        this.addMilestoneShortcut();

        // Add due date shortcut
        this.addDueDateShortcut();

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
     * Add due date shortcut
     */
    addDueDateShortcut() {
        this.apiTabView.commentShortcuts.addCustomShortcut({
            type: 'due',
            label: '/due',
            items: [
                { value: '', label: 'Set Due Date' },
                { value: 'today', label: 'Today' },
                { value: 'tomorrow', label: 'Tomorrow' },
                { value: 'week', label: 'In 1 week' },
                { value: 'month', label: 'In 1 month' },
                { value: 'custom', label: 'Custom...' },
                { value: 'none', label: 'Remove Due Date' }
            ],
            onSelect: (value) => {
                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                let dueText = '/due ';

                if (value === 'none') {
                    dueText += 'none';
                } else if (value === 'custom') {
                    const customDate = prompt('Enter due date (format: YYYY-MM-DD):', '');
                    if (!customDate) return;
                    dueText += customDate;
                } else if (value === 'today') {
                    dueText += 'today';
                } else if (value === 'tomorrow') {
                    dueText += 'tomorrow';
                } else if (value === 'week') {
                    // Calculate date 1 week from now
                    const date = new Date();
                    date.setDate(date.getDate() + 7);
                    dueText += this.formatDate(date);
                } else if (value === 'month') {
                    // Calculate date 1 month from now
                    const date = new Date();
                    date.setMonth(date.getMonth() + 1);
                    dueText += this.formatDate(date);
                }

                // Check if there's already a due command
                const dueRegex = /\/due\s+[^\n]+/g;

                this.replaceOrInsertCommand(textarea, 'due', dueText, dueRegex, () => {
                    // This function is executed if no existing due command is found
                    const startPos = textarea.selectionStart;
                    const endPos = textarea.selectionEnd;
                    const currentText = textarea.value;

                    let insertText = dueText;
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
     * Add assign shortcut
     */
    addAssignShortcut() {
        this.apiTabView.commentShortcuts.addCustomShortcut({
            type: 'assign',
            label: '/assign',
            items: [
                { value: '', label: 'Assign to...' },
                { value: '@me', label: 'Myself' },
                { value: 'none', label: 'Unassign' }
            ],
            onSelect: (value) => {
                const textarea = document.getElementById('issue-comment-input');
                if (!textarea) return;

                let assignText = '/assign ';

                if (value === 'none') {
                    assignText += '@none';
                } else if (value === '@me') {
                    assignText += '@me';
                } else {
                    return; // No other values currently supported
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
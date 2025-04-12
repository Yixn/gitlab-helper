// CommentShortcuts.js - Reusable module for comment action shortcuts

class CommentShortcuts {
    /**
     * Constructor for CommentShortcuts module
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.targetElement - The textarea or input element to insert shortcuts into
     * @param {Function} options.onShortcutInsert - Callback function that runs after shortcut insertion (optional)
     */
    constructor(options) {
        this.targetElement = options.targetElement;
        this.onShortcutInsert = options.onShortcutInsert || null;
        this.shortcutsContainer = null;
        this.shortcuts = {};
        this.customDropdowns = [];
    }

    /**
     * Initialize shortcuts container
     * @param {HTMLElement} parentElement - Element to attach the shortcuts container to
     */
    initialize(parentElement) {
        // Clear existing container if present
        if (this.shortcutsContainer && this.shortcutsContainer.parentNode) {
            this.shortcutsContainer.parentNode.removeChild(this.shortcutsContainer);
        }

        // Create shortcuts container
        this.shortcutsContainer = document.createElement('div');
        this.shortcutsContainer.className = 'comment-shortcuts-container';
        this.shortcutsContainer.style.marginBottom = '10px';
        this.shortcutsContainer.style.display = 'flex';
        this.shortcutsContainer.style.flexWrap = 'wrap';
        this.shortcutsContainer.style.gap = '8px';
        this.shortcutsContainer.style.alignItems = 'center';

        // Append to parent element (don't use insertBefore)
        parentElement.appendChild(this.shortcutsContainer);

        // Initialize default shortcuts
        this.initializeEstimateShortcut();
    }

    /**
     * Initialize the estimate shortcut with dropdown
     */
    initializeEstimateShortcut() {
        // Check if the shortcut already exists and remove it if it does
        if (this.shortcuts['estimate']) {
            this.removeShortcut('estimate');
        }

        // Create shortcut and add it to shortcuts container
        this.addCustomShortcut({
            type: 'estimate',
            label: '/estimate',
            items: [
                { value: '', label: 'Estimate Hours' },
                { value: '1', label: '1h' },
                { value: '2', label: '2h' },
                { value: '4', label: '4h' },
                { value: '8', label: '8h' },
                { value: '16', label: '16h' },
                { value: '32', label: '32h' },
                { value: 'custom', label: 'Custom...' }
            ],
            onSelect: (value) => {
                if (value === 'custom') {
                    this.handleCustomEstimate();
                } else if (value) {
                    this.insertEstimateText(value);
                }
            }
        });
    }

    /**
     * Remove a shortcut by type
     * @param {string} type - Shortcut type to remove
     */
    removeShortcut(type) {
        if (this.shortcuts[type] && this.shortcuts[type].element) {
            // Remove shortcut from DOM
            const element = this.shortcuts[type].element;
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }

            // Remove from shortcuts object
            delete this.shortcuts[type];
        }
    }

    /**
     * Handle custom estimate option with prompt
     */
    handleCustomEstimate() {
        const customValue = prompt('Enter custom estimate hours (whole numbers only):', '');

        // Validate input - must be a positive integer
        if (customValue === null || customValue === '') {
            // User cancelled or entered empty string
            return;
        }

        const parsedValue = parseInt(customValue, 10);
        if (isNaN(parsedValue) || parsedValue <= 0 || parsedValue !== parseFloat(customValue)) {
            alert('Please enter a valid positive whole number.');
            return;
        }

        // Insert the valid estimate
        this.insertEstimateText(parsedValue.toString());
    }

    /**
     * Insert estimate text into target element, replacing any existing estimate
     * @param {string} hours - Number of hours to estimate
     */
    insertEstimateText(hours) {
        if (!this.targetElement) return;

        const estimateText = `/estimate ${hours}h`;

        // Get current text
        const currentText = this.targetElement.value;

        // Check if there's already an estimate command
        const estimateRegex = /\/estimate\s+\d+h/g;
        const hasEstimate = estimateRegex.test(currentText);

        if (hasEstimate) {
            // Replace existing estimate with new one
            const newText = currentText.replace(estimateRegex, estimateText);
            this.targetElement.value = newText;
        } else {
            // Insert new estimate at cursor position
            const startPos = this.targetElement.selectionStart;
            const endPos = this.targetElement.selectionEnd;

            // Check if we need to add a new line before the estimate
            let insertText = estimateText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text at cursor position
            const newText = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Update textarea value
            this.targetElement.value = newText;

            // Set cursor position after inserted text
            const newCursorPos = startPos + insertText.length;
            this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
        }

        // Set focus back to textarea
        this.targetElement.focus();

        // Call the callback if provided
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert('estimate', hours);
        }
    }

    /**
     * Add a custom shortcut dropdown with consistent styling
     * @param {Object} options - Shortcut configuration
     * @param {string} options.type - Type identifier for the shortcut
     * @param {string} options.label - Label text to display
     * @param {Array} options.items - Array of {value, label} objects for dropdown
     * @param {Function} options.onSelect - Function to call when an item is selected
     * @param {Function} options.customOptionRenderer - Optional function to render custom option elements
     * @returns {HTMLElement} The created shortcut element
     */
    addCustomShortcut(options) {
        // Check if this type already exists and remove it if it does
        if (this.shortcuts[options.type]) {
            this.removeShortcut(options.type);
        }

        // Create shortcut container with consistent styling
        const shortcutContainer = document.createElement('div');
        shortcutContainer.className = `shortcut-item ${options.type}-shortcut`;
        shortcutContainer.style.display = 'flex';
        shortcutContainer.style.alignItems = 'center';
        shortcutContainer.style.width = '100%'; // Make the container full width
        shortcutContainer.style.marginBottom = '8px'; // Add some spacing between items
        shortcutContainer.style.justifyContent = 'space-between';
        shortcutContainer.style.border = '1px solid #ddd';
        shortcutContainer.style.borderRadius = '4px';
        shortcutContainer.style.padding = '6px 10px'; // Slightly increase padding
        shortcutContainer.style.backgroundColor = '#f8f9fa';

        // Create label with consistent styling
        const shortcutLabel = document.createElement('span');
        shortcutLabel.textContent = options.label;
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.fontFamily = 'monospace';
        shortcutLabel.style.color = '#555';
        shortcutLabel.style.fontWeight = 'bold';
        shortcutLabel.style.minWidth = '100px'; // Set a minimum width for the label

        // Create dropdown with consistent styling
        const dropdown = document.createElement('select');
        dropdown.className = `${options.type}-dropdown`;
        dropdown.style.border = 'none';
        dropdown.style.backgroundColor = 'transparent';
        dropdown.style.fontSize = '13px'; // Slightly larger font
        dropdown.style.appearance = 'none';
        dropdown.style.paddingRight = '20px';
        dropdown.style.paddingLeft = '5px';
        dropdown.style.width = '100%'; // Make the dropdown fill remaining space
        dropdown.style.backgroundImage = 'url("data:image/svg+xml;charset=utf8,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 4 5\'%3E%3Cpath fill=\'%23666\' d=\'M2 0L0 2h4zm0 5L0 3h4z\'/%3E%3C/svg%3E")';
        dropdown.style.backgroundRepeat = 'no-repeat';
        dropdown.style.backgroundPosition = 'right 5px center';
        dropdown.style.backgroundSize = '8px 10px';
        dropdown.style.WebkitAppearance = 'none';
        dropdown.style.outline = 'none';
        dropdown.style.cursor = 'pointer';

        // Container for the dropdown to give it proper width
        const dropdownContainer = document.createElement('div');
        dropdownContainer.style.flexGrow = '1'; // Allow dropdown container to grow
        dropdownContainer.style.marginLeft = '10px'; // Add spacing between label and dropdown

        // Add options to dropdown
        options.items.forEach(item => {
            const optionElement = document.createElement('option');
            optionElement.value = item.value;
            optionElement.textContent = item.label;
            dropdown.appendChild(optionElement);
        });

        // Add change event for dropdown
        dropdown.addEventListener('change', () => {
            const selectedValue = dropdown.value;

            if (selectedValue && typeof options.onSelect === 'function') {
                options.onSelect(selectedValue);
            }

            // Reset dropdown to first option
            dropdown.value = '';
        });

        // Add elements to container
        shortcutContainer.appendChild(shortcutLabel);
        dropdownContainer.appendChild(dropdown);
        shortcutContainer.appendChild(dropdownContainer);

        // Add to shortcuts container
        this.shortcutsContainer.appendChild(shortcutContainer);

        // Store for future reference
        this.shortcuts[options.type] = {
            element: shortcutContainer,
            dropdown: dropdown,
            options: options
        };

        return shortcutContainer;
    }

    /**
     * Apply replacement logic for commands
     * @param {string} type - Type of shortcut (e.g., 'label', 'milestone')
     * @param {string} command - The command to insert (e.g., '/label ~bug')
     * @param {RegExp} regex - Regular expression to match existing commands
     * @param {Function} replacementFn - Function to handle the insertion/replacement
     */
    replaceOrInsertCommand(type, command, regex, replacementFn) {
        if (!this.targetElement) return;

        // Get current text
        const currentText = this.targetElement.value;

        // Check if there's already a command of this type
        const hasCommand = regex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            const newText = currentText.replace(regex, command);
            this.targetElement.value = newText;
        } else {
            // Execute the provided insertion function
            replacementFn();
        }

        // Set focus back to textarea
        this.targetElement.focus();

        // Call the callback if provided
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert(type, command);
        }
    }
}
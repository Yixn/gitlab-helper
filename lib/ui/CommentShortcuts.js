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
        this.shortcuts = [];
    }

    /**
     * Initialize shortcuts container
     * @param {HTMLElement} parentElement - Element to attach the shortcuts container to
     */
    initialize(parentElement) {
        // Create shortcuts container
        this.shortcutsContainer = document.createElement('div');
        this.shortcutsContainer.className = 'comment-shortcuts-container';
        this.shortcutsContainer.style.marginBottom = '10px';
        this.shortcutsContainer.style.display = 'flex';
        this.shortcutsContainer.style.flexWrap = 'wrap';
        this.shortcutsContainer.style.gap = '8px';

        // Add shortcuts container to parent
        parentElement.insertBefore(this.shortcutsContainer, this.targetElement);

        // Initialize default shortcuts
        this.initializeEstimateShortcut();
    }

    /**
     * Initialize the estimate shortcut with dropdown
     */
    initializeEstimateShortcut() {
        // Create shortcut container
        const shortcutContainer = document.createElement('div');
        shortcutContainer.className = 'shortcut-item estimate-shortcut';
        shortcutContainer.style.display = 'flex';
        shortcutContainer.style.alignItems = 'center';

        // Create label
        const shortcutLabel = document.createElement('span');
        shortcutLabel.textContent = '/estimate';
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.marginRight = '5px';
        shortcutLabel.style.fontFamily = 'monospace';
        shortcutLabel.style.color = '#555';
        shortcutContainer.appendChild(shortcutLabel);

        // Create dropdown select
        const estimateSelect = document.createElement('select');
        estimateSelect.className = 'estimate-dropdown';
        estimateSelect.style.padding = '3px 6px';
        estimateSelect.style.borderRadius = '3px';
        estimateSelect.style.border = '1px solid #ccc';
        estimateSelect.style.backgroundColor = '#f8f9fa';
        estimateSelect.style.fontSize = '12px';

        // Add options to dropdown
        const options = [
            { value: '', label: 'Estimate Hours' },
            { value: '1', label: '1h' },
            { value: '2', label: '2h' },
            { value: '4', label: '4h' },
            { value: '8', label: '8h' },
            { value: '16', label: '16h' },
            { value: '32', label: '32h' },
            { value: 'custom', label: 'Custom...' }
        ];

        options.forEach(option => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.label;
            estimateSelect.appendChild(optionElement);
        });

        // Add change event for dropdown
        estimateSelect.addEventListener('change', () => {
            const selectedValue = estimateSelect.value;

            if (!selectedValue) {
                // If the first option is selected (empty), do nothing
                return;
            }

            if (selectedValue === 'custom') {
                // For custom option, show prompt
                this.handleCustomEstimate();
            } else {
                // For predefined options, insert directly
                this.insertEstimateText(selectedValue);
            }

            // Reset dropdown to first option
            estimateSelect.value = '';
        });

        shortcutContainer.appendChild(estimateSelect);

        // Add to shortcuts container
        this.shortcutsContainer.appendChild(shortcutContainer);

        // Store for future reference
        this.shortcuts.push({
            type: 'estimate',
            element: shortcutContainer
        });
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
     * Insert estimate text into target element
     * @param {string} hours - Number of hours to estimate
     */
    insertEstimateText(hours) {
        if (!this.targetElement) return;

        const estimateText = `/estimate ${hours}h`;

        // Get current cursor position
        const startPos = this.targetElement.selectionStart;
        const endPos = this.targetElement.selectionEnd;

        // Get existing text
        const currentText = this.targetElement.value;

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

        // Set focus back to textarea
        this.targetElement.focus();

        // Set cursor position after inserted text
        const newCursorPos = startPos + insertText.length;
        this.targetElement.setSelectionRange(newCursorPos, newCursorPos);

        // Call the callback if provided
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert('estimate', hours);
        }
    }

    /**
     * Add a custom shortcut dropdown
     * @param {Object} options - Shortcut configuration
     * @param {string} options.type - Type identifier for the shortcut
     * @param {string} options.label - Label text to display
     * @param {Array} options.items - Array of {value, label} objects for dropdown
     * @param {Function} options.onSelect - Function to call when an item is selected
     */
    addCustomShortcut(options) {
        // Create shortcut container
        const shortcutContainer = document.createElement('div');
        shortcutContainer.className = `shortcut-item ${options.type}-shortcut`;
        shortcutContainer.style.display = 'flex';
        shortcutContainer.style.alignItems = 'center';

        // Create label
        const shortcutLabel = document.createElement('span');
        shortcutLabel.textContent = options.label;
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.marginRight = '5px';
        shortcutLabel.style.fontFamily = 'monospace';
        shortcutLabel.style.color = '#555';
        shortcutContainer.appendChild(shortcutLabel);

        // Create dropdown select
        const dropdown = document.createElement('select');
        dropdown.className = `${options.type}-dropdown`;
        dropdown.style.padding = '3px 6px';
        dropdown.style.borderRadius = '3px';
        dropdown.style.border = '1px solid #ccc';
        dropdown.style.backgroundColor = '#f8f9fa';
        dropdown.style.fontSize = '12px';

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

        shortcutContainer.appendChild(dropdown);

        // Add to shortcuts container
        this.shortcutsContainer.appendChild(shortcutContainer);

        // Store for future reference
        this.shortcuts.push({
            type: options.type,
            element: shortcutContainer
        });
    }
}
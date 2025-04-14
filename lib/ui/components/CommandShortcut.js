
/**
 * Class that manages command shortcuts for GitLab comments
 */
export default class CommandShortcut {
    /**
     * Constructor for CommandShortcut module
     * @param {Object} options - Configuration options
     * @param {HTMLElement} options.targetElement - The textarea or input element to insert shortcuts into
     * @param {Function} options.onShortcutInsert - Callback function that runs after shortcut insertion (optional)
     */
    constructor(options) {
        this.targetElement = options.targetElement;
        this.onShortcutInsert = options.onShortcutInsert || null;
        this.shortcutsContainer = null;
        this.shortcuts = {};
    }

    /**
     * Initialize shortcuts container
     * @param {HTMLElement} parentElement - Element to attach the shortcuts container to
     */
    initialize(parentElement) {
        if (this.shortcutsContainer && this.shortcutsContainer.parentNode) {
            this.shortcutsContainer.parentNode.removeChild(this.shortcutsContainer);
        }
        this.shortcutsContainer = document.createElement('div');
        this.shortcutsContainer.className = 'command-shortcuts-container';
        this.shortcutsContainer.style.marginBottom = '10px';
        this.shortcutsContainer.style.display = 'flex';
        this.shortcutsContainer.style.flexDirection = 'column'; // Changed to column to ensure consistent order
        this.shortcutsContainer.style.gap = '8px';
        this.shortcutsContainer.style.alignItems = 'stretch';
        parentElement.appendChild(this.shortcutsContainer);
        this.initializeEstimateShortcut();
    }

    /**
     * Initialize the estimate shortcut with dropdown
     */
    initializeEstimateShortcut() {
        if (this.shortcuts['estimate']) {
            this.removeShortcut('estimate');
        }
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
            const element = this.shortcuts[type].element;
            if (element.parentNode) {
                element.parentNode.removeChild(element);
            }
            delete this.shortcuts[type];
        }
    }

    /**
     * Handle custom estimate option with prompt
     */
    handleCustomEstimate() {
        const customValue = prompt('Enter custom estimate hours (whole numbers only):', '');
        if (customValue === null || customValue === '') {
            return;
        }

        const parsedValue = parseInt(customValue, 10);
        if (isNaN(parsedValue) || parsedValue <= 0 || parsedValue !== parseFloat(customValue)) {
            alert('Please enter a valid positive whole number.');
            return;
        }
        this.insertEstimateText(parsedValue.toString());
    }

    /**
     * Insert estimate text into target element, replacing any existing estimate
     * @param {string} hours - Number of hours to estimate
     */
    insertEstimateText(hours) {
        if (!this.targetElement) return;

        const estimateText = `/estimate ${hours}h`;
        const currentText = this.targetElement.value;
        const estimateRegex = /\/estimate\s+\d+h/g;
        const hasEstimate = estimateRegex.test(currentText);

        if (hasEstimate) {
            this.targetElement.value = currentText.replace(estimateRegex, estimateText);
        } else {
            const startPos = this.targetElement.selectionStart;
            const endPos = this.targetElement.selectionEnd;
            let insertText = estimateText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }
            this.targetElement.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);
            const newCursorPos = startPos + insertText.length;
            this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
        }
        this.targetElement.focus();
        if (typeof this.onShortcutInsert === 'function') {
            this.onShortcutInsert('estimate', hours);
        }
    }

    // Modify the CommandShortcut class in lib/ui/components/CommandShortcut.js to support toggle mode

    /**
     * Add a custom shortcut dropdown with consistent styling
     * @param {Object} options - Shortcut configuration
     * @param {string} options.type - Type identifier for the shortcut
     * @param {string} options.label - Label text to display
     * @param {Array} options.items - Array of {value, label} objects for dropdown
     * @param {Function} options.onSelect - Function to call when an item is selected
     * @param {boolean} options.toggleMode - Whether this shortcut has add/remove toggle
     * @param {Function} options.customOptionRenderer - Optional function to render custom option elements
     * @returns {HTMLElement} The created shortcut element
     */
    addCustomShortcut(options) {
        if (!this.shortcutsContainer) {
            console.error("Shortcuts container not initialized");
            return null;
        }
        if (this.shortcuts && this.shortcuts[options.type]) {
            this.removeShortcut(options.type);
        }
        const shortcutContainer = document.createElement('div');
        shortcutContainer.className = `shortcut-item ${options.type}-shortcut`;
        shortcutContainer.style.display = 'flex';
        shortcutContainer.style.alignItems = 'center';
        shortcutContainer.style.width = '100%';
        shortcutContainer.style.marginBottom = '8px';
        shortcutContainer.style.justifyContent = 'space-between';
        shortcutContainer.style.border = '1px solid #ddd';
        shortcutContainer.style.borderRadius = '4px';
        shortcutContainer.style.padding = '6px 10px';
        shortcutContainer.style.backgroundColor = '#f8f9fa';
        shortcutContainer.style.height = '36px'; // Fixed height
        shortcutContainer.style.boxSizing = 'border-box';
        shortcutContainer.dataset.shortcutType = options.type; // Add data attribute for ordering

        // Label and Toggle container (new)
        const labelContainer = document.createElement('div');
        labelContainer.style.display = 'flex';
        labelContainer.style.alignItems = 'center';
        labelContainer.style.minWidth = '100px';
        labelContainer.style.flexShrink = '0'; // Prevent shrinking

        const shortcutLabel = document.createElement('div');
        shortcutLabel.textContent = options.label;
        shortcutLabel.style.fontSize = '13px';
        shortcutLabel.style.fontWeight = 'bold';
        shortcutLabel.style.color = '#555';
        shortcutLabel.style.whiteSpace = 'nowrap';

        labelContainer.appendChild(shortcutLabel);

        // Create toggle button if toggleMode is enabled
        let toggleButton = null;
        let isAddMode = true; // Default to add mode
        let originalItems = [...options.items]; // Store original items

        if (options.toggleMode) {
            toggleButton = document.createElement('button');
            toggleButton.type = 'button';
            toggleButton.innerHTML = '+'; // Default to add mode
            toggleButton.title = 'Toggle between Add and Remove mode';
            toggleButton.style.marginLeft = '6px';
            toggleButton.style.width = '20px';
            toggleButton.style.height = '20px';
            toggleButton.style.display = 'flex';
            toggleButton.style.alignItems = 'center';
            toggleButton.style.justifyContent = 'center';
            toggleButton.style.border = '1px solid #ccc';
            toggleButton.style.borderRadius = '50%';
            toggleButton.style.backgroundColor = '#28a745'; // Green for add
            toggleButton.style.color = 'white';
            toggleButton.style.fontSize = '14px';
            toggleButton.style.fontWeight = 'bold';
            toggleButton.style.cursor = 'pointer';
            toggleButton.style.padding = '0';
            toggleButton.style.lineHeight = '1';

            toggleButton.addEventListener('click', () => {
                isAddMode = !isAddMode;

                // Update toggle button appearance
                if (isAddMode) {
                    toggleButton.innerHTML = '+';
                    toggleButton.style.backgroundColor = '#28a745'; // Green for add
                    toggleButton.title = 'Switch to Remove mode';
                } else {
                    toggleButton.innerHTML = '−'; // Using minus sign
                    toggleButton.style.backgroundColor = '#dc3545'; // Red for remove
                    toggleButton.title = 'Switch to Add mode';
                }

                // Update dropdown first option
                if (dropdown.options.length > 0) {
                    if (options.type === 'label') {
                        dropdown.options[0].text = isAddMode ? 'Add Label' : 'Remove Label';
                    } else if (options.type === 'assign') {
                        dropdown.options[0].text = isAddMode ? 'Assign to...' : 'Unassign from...';
                    }
                }

                // Store the mode in the dropdown element for access in the handler
                dropdown.dataset.mode = isAddMode ? 'add' : 'remove';
            });

            labelContainer.appendChild(toggleButton);
        }

        const dropdownContainer = document.createElement('div');
        dropdownContainer.style.flex = '1';
        dropdownContainer.style.position = 'relative';
        dropdownContainer.style.height = '24px'; // Fixed height
        dropdownContainer.style.marginLeft = '10px';

        const dropdown = document.createElement('select');
        dropdown.className = `${options.type}-dropdown`;
        dropdown.style.width = '100%';
        dropdown.style.height = '100%';
        dropdown.style.appearance = 'auto'; // Use native appearance for stability
        dropdown.style.padding = '0 25px 0 8px'; // Add some padding for the arrow
        dropdown.style.fontSize = '13px';
        dropdown.style.border = '1px solid #ccc';
        dropdown.style.borderRadius = '4px';
        dropdown.style.backgroundColor = '#fff';
        dropdown.style.boxSizing = 'border-box';

        // Set initial mode
        dropdown.dataset.mode = 'add';

        const placeholderOption = document.createElement('option');
        placeholderOption.value = '';
        placeholderOption.textContent = options.items[0]?.label || 'Select...';
        placeholderOption.selected = true;
        dropdown.appendChild(placeholderOption);

        if (options.items && options.items.length > 0) {
            options.items.forEach((item, index) => {
                if (index === 0) return; // Skip the first one, already added as placeholder

                const option = document.createElement('option');
                option.value = item.value;
                option.textContent = item.label;
                dropdown.appendChild(option);
            });
        }

        dropdown.addEventListener('change', (e) => {
            const selectedValue = e.target.value;
            if (selectedValue && options.onSelect) {
                // Pass the current mode to the onSelect handler
                const currentMode = dropdown.dataset.mode || 'add';
                options.onSelect(selectedValue, currentMode);
                e.target.value = ''; // Reset after selection
            }
        });

        dropdownContainer.appendChild(dropdown);
        shortcutContainer.appendChild(labelContainer);
        shortcutContainer.appendChild(dropdownContainer);

        const shortcutOrder = ['estimate', 'label', 'milestone', 'assign'];
        const thisTypeIndex = shortcutOrder.indexOf(options.type);

        if (thisTypeIndex === -1) {
            this.shortcutsContainer.appendChild(shortcutContainer);
        } else {
            let inserted = false;
            const existingShortcuts = this.shortcutsContainer.querySelectorAll('.shortcut-item');

            for (let i = 0; i < existingShortcuts.length; i++) {
                const existingType = existingShortcuts[i].dataset.shortcutType;
                const existingIndex = shortcutOrder.indexOf(existingType);

                if (existingIndex > thisTypeIndex) {
                    this.shortcutsContainer.insertBefore(shortcutContainer, existingShortcuts[i]);
                    inserted = true;
                    break;
                }
            }
            if (!inserted) {
                this.shortcutsContainer.appendChild(shortcutContainer);
            }
        }

        this.shortcuts[options.type] = {
            element: shortcutContainer,
            dropdown: dropdown,
            toggleButton: toggleButton,
            options: options
        };

        return shortcutContainer;
    }
}
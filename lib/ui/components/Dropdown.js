
/**
 * Class that creates custom styled dropdown components
 */
export default class Dropdown {
    /**
     * Constructor for Dropdown component
     * @param {Object} options - Configuration options
     * @param {Array} options.items - Array of {value, label} objects
     * @param {Function} options.onChange - Callback function when selection changes
     * @param {string} options.placeholder - Placeholder text when no selection (optional)
     * @param {Function} options.optionRenderer - Custom renderer for options (optional)
     * @param {boolean} options.searchable - Whether to enable search (optional)
     * @param {string} options.width - Width of dropdown (optional)
     */
    constructor(options) {
        this.items = options.items || [];
        this.onChange = options.onChange;
        this.placeholder = options.placeholder || 'Select an option...';
        this.optionRenderer = options.optionRenderer;
        this.searchable = options.searchable || false;
        this.width = options.width || '100%';

        this.container = null;
        this.selectElement = null;
        this.selectedValue = null;
        this.open = false;
    }

    /**
     * Render the dropdown
     * @param {HTMLElement} parentElement - Element to attach dropdown to
     * @returns {HTMLElement} Dropdown container element
     */
    render(parentElement) {
        // Create container
        this.container = document.createElement('div');
        this.container.className = 'custom-dropdown';
        this.container.style.position = 'relative';
        this.container.style.display = 'inline-block';
        this.container.style.width = this.width;

        // Create select-like box
        this.selectElement = document.createElement('div');
        this.selectElement.className = 'custom-dropdown-select';
        this.selectElement.style.border = '1px solid #ddd';
        this.selectElement.style.borderRadius = '4px';
        this.selectElement.style.padding = '6px 10px';
        this.selectElement.style.backgroundColor = '#fff';
        this.selectElement.style.cursor = 'pointer';
        this.selectElement.style.display = 'flex';
        this.selectElement.style.justifyContent = 'space-between';
        this.selectElement.style.alignItems = 'center';
        this.selectElement.style.fontSize = '13px';

        // Placeholder text
        const placeholderText = document.createElement('span');
        placeholderText.className = 'dropdown-placeholder';
        placeholderText.textContent = this.placeholder;
        placeholderText.style.color = '#666';

        // Arrow icon
        const arrowIcon = document.createElement('span');
        arrowIcon.className = 'dropdown-arrow';
        arrowIcon.innerHTML = '▼';
        arrowIcon.style.fontSize = '10px';
        arrowIcon.style.marginLeft = '5px';
        arrowIcon.style.transition = 'transform 0.2s ease';

        this.selectElement.appendChild(placeholderText);
        this.selectElement.appendChild(arrowIcon);

        // Create dropdown menu (initially hidden)
        const dropdownMenu = document.createElement('div');
        dropdownMenu.className = 'dropdown-menu';
        dropdownMenu.style.position = 'absolute';
        dropdownMenu.style.top = '100%';
        dropdownMenu.style.left = '0';
        dropdownMenu.style.right = '0';
        dropdownMenu.style.backgroundColor = '#fff';
        dropdownMenu.style.border = '1px solid #ddd';
        dropdownMenu.style.borderRadius = '0 0 4px 4px';
        dropdownMenu.style.maxHeight = '200px';
        dropdownMenu.style.overflowY = 'auto';
        dropdownMenu.style.zIndex = '100';
        dropdownMenu.style.display = 'none';
        dropdownMenu.style.boxShadow = '0 4px 8px rgba(0,0,0,0.1)';

        // Add search input if searchable
        if (this.searchable) {
            const searchContainer = document.createElement('div');
            searchContainer.style.padding = '5px';
            searchContainer.style.position = 'sticky';
            searchContainer.style.top = '0';
            searchContainer.style.backgroundColor = '#fff';
            searchContainer.style.borderBottom = '1px solid #eee';

            const searchInput = document.createElement('input');
            searchInput.type = 'text';
            searchInput.placeholder = 'Search...';
            searchInput.style.width = '100%';
            searchInput.style.padding = '5px';
            searchInput.style.border = '1px solid #ccc';
            searchInput.style.borderRadius = '3px';
            searchInput.style.fontSize = '12px';

            searchInput.addEventListener('input', (e) => {
                const searchText = e.target.value.toLowerCase();
                this.filterItems(searchText, dropdownMenu);
            });

            searchContainer.appendChild(searchInput);
            dropdownMenu.appendChild(searchContainer);
        }

        // Add items to dropdown
        this.populateDropdown(dropdownMenu);

        // Toggle dropdown on click
        this.selectElement.addEventListener('click', () => {
            this.toggleDropdown(dropdownMenu, arrowIcon);
        });

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!this.container.contains(e.target) && this.open) {
                this.closeDropdown(dropdownMenu, arrowIcon);
            }
        });

        // Add elements to container
        this.container.appendChild(this.selectElement);
        this.container.appendChild(dropdownMenu);

        // Add to parent
        if (parentElement) {
            parentElement.appendChild(this.container);
        }

        return this.container;
    }

    /**
     * Populate dropdown with items
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     */
    populateDropdown(dropdownMenu) {
        // Create option elements
        this.items.forEach(item => {
            const option = document.createElement('div');
            option.className = 'dropdown-item';
            option.dataset.value = item.value;
            option.style.padding = '8px 10px';
            option.style.cursor = 'pointer';
            option.style.transition = 'background-color 0.2s ease';

            // Hover effect
            option.addEventListener('mouseenter', () => {
                option.style.backgroundColor = '#f5f5f5';
            });

            option.addEventListener('mouseleave', () => {
                option.style.backgroundColor = '';
            });

            // Use custom renderer if provided, otherwise use default
            if (this.optionRenderer && typeof this.optionRenderer === 'function') {
                const customContent = this.optionRenderer(item);
                if (customContent instanceof HTMLElement) {
                    option.appendChild(customContent);
                } else {
                    option.innerHTML = customContent;
                }
            } else {
                option.textContent = item.label;
            }

            // Set click handler
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.selectItem(item, option);
                this.closeDropdown(dropdownMenu);
            });

            dropdownMenu.appendChild(option);
        });
    }

    /**
     * Filter dropdown items based on search text
     * @param {string} searchText - Text to filter by
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     */
    filterItems(searchText, dropdownMenu) {
        const items = dropdownMenu.querySelectorAll('.dropdown-item');
        items.forEach(item => {
            const itemText = item.textContent.toLowerCase();
            if (itemText.includes(searchText)) {
                item.style.display = '';
            } else {
                item.style.display = 'none';
            }
        });
    }

    /**
     * Toggle dropdown open/closed state
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     * @param {HTMLElement} arrowIcon - Arrow icon element
     */
    toggleDropdown(dropdownMenu, arrowIcon) {
        if (this.open) {
            this.closeDropdown(dropdownMenu, arrowIcon);
        } else {
            this.openDropdown(dropdownMenu, arrowIcon);
        }
    }

    /**
     * Open the dropdown
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     * @param {HTMLElement} arrowIcon - Arrow icon element
     */
    openDropdown(dropdownMenu, arrowIcon) {
        dropdownMenu.style.display = 'block';
        arrowIcon.style.transform = 'rotate(180deg)';
        this.open = true;

        // Focus search input if searchable
        if (this.searchable) {
            const searchInput = dropdownMenu.querySelector('input');
            if (searchInput) {
                searchInput.focus();
            }
        }
    }

    /**
     * Close the dropdown
     * @param {HTMLElement} dropdownMenu - Dropdown menu element
     * @param {HTMLElement} arrowIcon - Arrow icon element
     */
    closeDropdown(dropdownMenu, arrowIcon) {
        dropdownMenu.style.display = 'none';
        if (arrowIcon) {
            arrowIcon.style.transform = '';
        }
        this.open = false;
    }

    /**
     * Handle item selection
     * @param {Object} item - Selected item {value, label}
     * @param {HTMLElement} optionElement - Selected option element
     */
    selectItem(item, optionElement) {
        this.selectedValue = item.value;

        // Update select box display
        const placeholder = this.selectElement.querySelector('.dropdown-placeholder');

        if (this.optionRenderer && typeof this.optionRenderer === 'function') {
            // Clear existing content
            placeholder.innerHTML = '';

            // Create a copy of the rendered option
            const renderedContent = this.optionRenderer(item);
            if (renderedContent instanceof HTMLElement) {
                placeholder.appendChild(renderedContent.cloneNode(true));
            } else {
                placeholder.innerHTML = renderedContent;
            }

            // Update styling to show it's selected
            placeholder.style.color = '';
        } else {
            placeholder.textContent = item.label;
            placeholder.style.color = '';
        }

        // Call onChange callback
        if (typeof this.onChange === 'function') {
            this.onChange(item.value, item);
        }
    }

    /**
     * Set value programmatically
     * @param {string} value - Value to select
     * @returns {boolean} Whether the value was found and selected
     */
    setValue(value) {
        const item = this.items.find(item => item.value === value);
        if (item) {
            // Find the option element
            const optionElement = this.container.querySelector(`.dropdown-item[data-value="${value}"]`);
            if (optionElement) {
                this.selectItem(item, optionElement);
                return true;
            }
        }
        return false;
    }

    /**
     * Get current selected value
     * @returns {*} Currently selected value
     */
    getValue() {
        return this.selectedValue;
    }

    /**
     * Reset dropdown to placeholder state
     */
    reset() {
        this.selectedValue = null;
        const placeholder = this.selectElement.querySelector('.dropdown-placeholder');
        placeholder.textContent = this.placeholder;
        placeholder.style.color = '#666';
    }

    /**
     * Update dropdown items
     * @param {Array} newItems - New items array
     */
    updateItems(newItems) {
        this.items = newItems;

        // Clear dropdown menu
        const dropdownMenu = this.container.querySelector('.dropdown-menu');

        // Remove all items but keep the search box if present
        const searchBox = this.searchable ? dropdownMenu.firstChild : null;
        dropdownMenu.innerHTML = '';

        if (searchBox) {
            dropdownMenu.appendChild(searchBox);
        }

        // Re-populate with new items
        this.populateDropdown(dropdownMenu);

        // Reset selection
        this.reset();
    }

    /**
     * Disable the dropdown
     */
    disable() {
        this.selectElement.style.opacity = '0.6';
        this.selectElement.style.pointerEvents = 'none';
    }

    /**
     * Enable the dropdown
     */
    enable() {
        this.selectElement.style.opacity = '1';
        this.selectElement.style.pointerEvents = 'auto';
    }
}
// LabelManager.js - Handles fetching and filtering labels
import { getLabelWhitelist, saveLabelWhitelist, resetLabelWhitelist } from '../../storage/SettingsStorage';
import { getPathFromUrl } from '../../api/APIUtils';
import { generateColorFromString, getContrastColor } from '../../core/Utils';

/**
 * Manager for GitLab labels
 */
export default class LabelManager {
    /**
     * Constructor for LabelManager
     * @param {Object} options - Configuration options
     * @param {Function} options.onLabelsLoaded - Callback when labels are loaded
     * @param {GitLabAPI} options.gitlabApi - GitLab API instance
     */
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onLabelsLoaded = options.onLabelsLoaded || null;

        // Load saved whitelist
        this.labelWhitelist = getLabelWhitelist();

        // Initialize storage for fetched labels
        this.availableLabels = [];
        this.filteredLabels = [];
        this.isLoading = false;
    }

    /**
     * Save whitelist to storage
     * @param {Array} whitelist - Array of whitelist terms
     */
    saveWhitelist(whitelist) {
        this.labelWhitelist = whitelist;
        saveLabelWhitelist(whitelist);

        // Re-filter labels with new whitelist
        this.filterLabels();
    }

    /**
     * Reset whitelist to default values
     */
    resetToDefaultWhitelist() {
        this.labelWhitelist = resetLabelWhitelist();

        // Re-filter labels with default whitelist
        this.filterLabels();
    }

    /**
     * Check if a label matches the whitelist
     * @param {string} labelName - Label name to check
     * @param {Array} whitelist - Whitelist to check against (optional)
     * @returns {boolean} True if label matches whitelist
     */
    isLabelInWhitelist(labelName, whitelist = this.labelWhitelist) {
        const lowerName = labelName.toLowerCase();
        return whitelist.some(term => lowerName.includes(term.toLowerCase()));
    }

    /**
     * Filter labels based on current whitelist
     */
    filterLabels() {
        if (!this.availableLabels || this.availableLabels.length === 0) {
            this.filteredLabels = [];
            return;
        }

        // Filter labels using whitelist
        this.filteredLabels = this.availableLabels.filter(label =>
            this.isLabelInWhitelist(label.name)
        );

        // Sort labels alphabetically
        this.filteredLabels.sort((a, b) => a.name.localeCompare(b.name));

        // Notify callback if provided
        if (typeof this.onLabelsLoaded === 'function') {
            this.onLabelsLoaded(this.filteredLabels);
        }
    }

    /**
     * Fetch all labels from GitLab API
     * @returns {Promise<Array>} Promise resolving to array of labels
     */
    async fetchAllLabels() {
        try {
            this.isLoading = true;

            // Get path info (project or group)
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                console.warn('Path info not found, returning empty labels array');
                this.isLoading = false;
                return [];
            }

            // Fetch labels from API using the correct endpoint
            const labels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                params: { per_page: 100 }
            }).catch(error => {
                console.error(`Error fetching ${pathInfo.type} labels from API:`, error);
                return [];
            });

            this.availableLabels = labels;
            this.filterLabels();

            this.isLoading = false;
            return labels;
        } catch (error) {
            console.error('Error in fetchAllLabels:', error);
            this.isLoading = false;
            return [];
        }
    }

    /**
     * Get labels for dropdown
     * @param {boolean} includeEmpty - Whether to include empty option
     * @returns {Array} Array of label options for dropdown
     */
    getLabelOptions(includeEmpty = true) {
        // Map to format needed for dropdown
        const labelOptions = this.filteredLabels.map(label => ({
            value: label.name,
            label: label.name,
            color: label.color
        }));

        // Add empty option at the beginning if requested
        if (includeEmpty) {
            labelOptions.unshift({ value: '', label: 'Add Label' });
        }

        return labelOptions;
    }

    /**
     * Create a styled label element for dropdowns
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createStyledLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.label || label.name;

        // Use provided color or generate one based on name
        const bgColor = label.color || generateColorFromString(label.label || label.name);

        // Calculate text color (black or white) based on background color brightness
        const textColor = getContrastColor(bgColor);

        // Apply GitLab label styles
        labelElement.style.backgroundColor = bgColor;
        labelElement.style.color = textColor;
        labelElement.style.padding = '4px 8px';
        labelElement.style.borderRadius = '100px'; // Rounded pill shape
        labelElement.style.fontSize = '12px';
        labelElement.style.fontWeight = '500';
        labelElement.style.display = 'inline-block';
        labelElement.style.margin = '2px';
        labelElement.style.maxWidth = '100%';
        labelElement.style.overflow = 'hidden';
        labelElement.style.textOverflow = 'ellipsis';
        labelElement.style.whiteSpace = 'nowrap';

        return labelElement;
    }

    /**
     * Add label command to textarea
     * @param {HTMLElement} textarea - Textarea element to insert command into
     * @param {string} labelName - Label name to add
     */
    insertLabelCommand(textarea, labelName) {
        if (!textarea) return;

        // Create the label command
        const labelText = `/label ~${labelName}`;

        // Check if there's already a label command
        const labelRegex = /\/label\s+~[^\n]+/g;

        // Get current text
        const currentText = textarea.value;

        // Check if there's already a label command
        const hasCommand = labelRegex.test(currentText);

        if (hasCommand) {
            // Replace existing command with new one
            textarea.value = currentText.replace(labelRegex, labelText);
        } else {
            // Insert new command at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Check if we need to add a new line before the command
            let insertText = labelText;
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
        }

        // Set focus back to textarea
        textarea.focus();
    }

    /**
     * Initialize label dropdown with fetch and render
     * @param {Function} createDropdown - Function to create dropdown with options
     * @param {Object} dropdownOptions - Additional options for dropdown
     * @returns {Object} Created dropdown instance
     */
    async initLabelDropdown(createDropdown, dropdownOptions = {}) {
        // Start with empty dropdown
        const dropdown = createDropdown({
            items: [{ value: '', label: 'Loading labels...' }],
            disabled: true,
            ...dropdownOptions
        });

        // Fetch and populate labels
        try {
            await this.fetchAllLabels();

            // Update dropdown with actual labels
            dropdown.updateItems(this.getLabelOptions());
            dropdown.enable();
        } catch (error) {
            console.error('Error initializing label dropdown:', error);

            // Update with error state
            dropdown.updateItems([
                { value: '', label: 'Error loading labels' },
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' }
            ]);
            dropdown.enable();
        }

        return dropdown;
    }
}
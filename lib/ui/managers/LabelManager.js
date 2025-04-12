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
        // Try to get gitlabApi from options or from window global
        this.gitlabApi = options.gitlabApi || window.gitlabApi;
        this.onLabelsLoaded = options.onLabelsLoaded || null;

        // Initialize with empty whitelist
        this.labelWhitelist = [];

        // Try to load saved whitelist, with error handling
        try {
            this.labelWhitelist = getLabelWhitelist();
            // Ensure it's an array
            if (!Array.isArray(this.labelWhitelist)) {
                console.warn("Loaded whitelist is not an array, using default");
                this.labelWhitelist = this.getDefaultWhitelist();
            }
        } catch (e) {
            console.warn("Error loading label whitelist, using default", e);
            this.labelWhitelist = this.getDefaultWhitelist();
        }

        // Initialize storage for fetched labels
        this.availableLabels = [];
        this.filteredLabels = [];
        this.isLoading = false;
    }

    /**
     * Get default whitelist values
     * @returns {Array} Default whitelist array
     */
    getDefaultWhitelist() {
        return [
            'bug', 'feature', 'documentation', 'enhancement', 'security',
            'priority', 'high', 'medium', 'low', 'critical',
            'frontend', 'backend', 'ui', 'ux', 'api',
            'wontfix', 'duplicate', 'invalid', 'question',
            'ready', 'in progress', 'review', 'blocked'
        ];
    }

    /**
     * Save whitelist to storage
     * @param {Array} whitelist - Array of whitelist terms
     */
    saveWhitelist(whitelist) {
        // Ensure whitelist is an array
        if (!Array.isArray(whitelist)) {
            whitelist = [];
        }
        this.labelWhitelist = whitelist;

        try {
            saveLabelWhitelist(whitelist);
        } catch (e) {
            console.error("Error saving label whitelist", e);
        }

        // Re-filter labels with new whitelist
        this.filterLabels();
    }

    /**
     * Reset whitelist to default values
     */
    resetToDefaultWhitelist() {
        try {
            this.labelWhitelist = this.getDefaultWhitelist();
            saveLabelWhitelist(this.labelWhitelist);
        } catch (e) {
            console.error("Error resetting label whitelist", e);
        }

        // Re-filter labels with default whitelist
        this.filterLabels();

        return this.labelWhitelist;
    }

    /**
     * Check if a label matches the whitelist
     * @param {string} labelName - Label name to check
     * @param {Array} whitelist - Whitelist to check against (optional)
     * @returns {boolean} True if label matches whitelist
     */
    isLabelInWhitelist(labelName, whitelist = null) {
        // Use provided whitelist or instance whitelist
        const whitelistToUse = whitelist || this.labelWhitelist;

        // Ensure we have a valid whitelist and label name
        if (!Array.isArray(whitelistToUse) || typeof labelName !== 'string') {
            return false;
        }

        const lowerName = labelName.toLowerCase();
        return whitelistToUse.some(term => {
            // Ensure term is a string
            if (typeof term !== 'string') return false;
            return lowerName.includes(term.toLowerCase());
        });
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
        this.filteredLabels = this.availableLabels.filter(label => {
            // Ensure the label has a name property
            if (!label || typeof label.name !== 'string') return false;
            return this.isLabelInWhitelist(label.name);
        });

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

            // Check if GitLab API instance is available
            // If not, try to get it from the window object as a last resort
            if (!this.gitlabApi) {
                this.gitlabApi = window.gitlabApi;
            }

            if (!this.gitlabApi) {
                console.warn('GitLab API instance not available, using fallback labels');
                this.isLoading = false;
                return this.addFallbackLabels();
            }

            // Get path info (project or group)
            const pathInfo = getPathFromUrl();

            if (!pathInfo || !pathInfo.apiUrl) {
                console.warn('Path info not found or invalid, returning fallback labels');
                this.isLoading = false;
                return this.addFallbackLabels();
            }

            // Fetch labels from API using the correct endpoint
            try {
                const labels = await this.gitlabApi.callGitLabApi(pathInfo.apiUrl, {
                    params: { per_page: 100 }
                });

                // Validate received labels
                if (!Array.isArray(labels)) {
                    console.warn('API did not return an array of labels, using fallback');
                    this.isLoading = false;
                    return this.addFallbackLabels();
                }

                this.availableLabels = labels;
                this.filterLabels();

                this.isLoading = false;
                return this.filteredLabels;
            } catch (apiError) {
                console.error(`Error fetching ${pathInfo.type} labels from API:`, apiError);
                this.isLoading = false;
                return this.addFallbackLabels();
            }
        } catch (error) {
            console.error('Error in fetchAllLabels:', error);
            this.isLoading = false;
            return this.addFallbackLabels();
        }
    }

    /**
     * Add fallback labels when API fails
     * @returns {Array} Array of fallback labels
     */
    addFallbackLabels() {
        // Create basic fallback labels
        const fallbackLabels = [
            { name: 'bug', color: '#ff0000' },
            { name: 'feature', color: '#1f75cb' },
            { name: 'enhancement', color: '#7057ff' },
            { name: 'documentation', color: '#0075ca' },
            { name: 'priority', color: '#d73a4a' },
            { name: 'blocked', color: '#b60205' }
        ];

        // Set as available labels
        this.availableLabels = fallbackLabels;

        // Filter and sort (even with fallbacks, respect whitelist)
        this.filterLabels();

        // Notify callback if provided
        if (typeof this.onLabelsLoaded === 'function') {
            this.onLabelsLoaded(this.filteredLabels);
        }

        return this.filteredLabels;
    }

    /**
     * Get labels for dropdown
     * @param {boolean} includeEmpty - Whether to include empty option
     * @returns {Array} Array of label options for dropdown
     */
    getLabelOptions(includeEmpty = true) {
        // Check if we have filteredLabels
        if (!this.filteredLabels || this.filteredLabels.length === 0) {
            // Return basic options if no filtered labels
            const basicOptions = [];
            if (includeEmpty) {
                basicOptions.push({ value: '', label: 'Add Label' });
            }
            return basicOptions.concat([
                { value: 'bug', label: 'Bug' },
                { value: 'feature', label: 'Feature' },
                { value: 'enhancement', label: 'Enhancement' },
                { value: 'custom', label: 'Custom...' }
            ]);
        }

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

        // Add custom option at the end
        labelOptions.push({ value: 'custom', label: 'Custom...' });

        return labelOptions;
    }

    /**
     * Create a styled label element for dropdowns
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createStyledLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.label || label.name || '';

        // Use provided color or generate one based on name
        const labelText = label.label || label.name || 'label';
        const bgColor = label.color || generateColorFromString(labelText);

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
        if (!textarea || typeof labelName !== 'string') return;

        // Create the label command
        const labelText = `/label ~"${labelName}"`;

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
                { value: 'feature', label: 'Feature' },
                { value: 'custom', label: 'Custom...' }
            ]);
            dropdown.enable();
        }

        return dropdown;
    }
}
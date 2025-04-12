// SettingsManager.js - Handles settings UI and persistence with GitLab-styled labels

class SettingsManager {
    constructor(apiTabView) {
        this.apiTabView = apiTabView;
    }

    /**
     * Add settings button to the UI
     * @param {HTMLElement} container - Container to add settings button to
     */
    addSettingsButton(container) {
        const settingsButton = document.createElement('button');
        settingsButton.textContent = '⚙️ Settings';
        settingsButton.style.padding = '6px 10px';
        settingsButton.style.backgroundColor = '#6c757d';
        settingsButton.style.color = 'white';
        settingsButton.style.border = 'none';
        settingsButton.style.borderRadius = '4px';
        settingsButton.style.cursor = 'pointer';
        settingsButton.style.fontSize = '12px';
        settingsButton.style.marginTop = '10px';
        settingsButton.style.display = 'flex';
        settingsButton.style.alignItems = 'center';
        settingsButton.style.marginLeft = 'auto';

        // Add hover effect
        settingsButton.addEventListener('mouseenter', () => {
            settingsButton.style.backgroundColor = '#5a6268';
        });

        settingsButton.addEventListener('mouseleave', () => {
            settingsButton.style.backgroundColor = '#6c757d';
        });

        // Open settings modal on click
        settingsButton.onclick = () => this.openSettingsModal();

        container.appendChild(settingsButton);
    }

    /**
     * Create and open settings modal
     */
    openSettingsModal() {
        // Create modal overlay (background)
        const modalOverlay = document.createElement('div');
        modalOverlay.id = 'git-helper-settings-overlay';
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

        // Create modal content container - make it wider
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '700px'; // Increased from 500px to 700px
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
        modalTitle.textContent = 'Settings';
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

        // Create whitelist settings section
        const whitelistSection = document.createElement('div');
        whitelistSection.style.marginBottom = '20px';

        const whitelistTitle = document.createElement('h4');
        whitelistTitle.textContent = 'Label Whitelist';
        whitelistTitle.style.marginBottom = '10px';

        const whitelistDescription = document.createElement('p');
        whitelistDescription.textContent = 'Select which labels should appear in the dropdown. The system will show any label that contains these terms.';
        whitelistDescription.style.marginBottom = '15px';
        whitelistDescription.style.fontSize = '14px';
        whitelistDescription.style.color = '#666';

        whitelistSection.appendChild(whitelistTitle);
        whitelistSection.appendChild(whitelistDescription);

        // Get available labels and create checkboxes
        this.createWhitelistEditor(whitelistSection);

        // Add sections to modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(whitelistSection);

        // Add button container at bottom
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.alignItems = 'center';

        // Reset to defaults button
        const resetButton = document.createElement('button');
        resetButton.textContent = 'Reset to Defaults';
        resetButton.style.padding = '8px 16px';
        resetButton.style.backgroundColor = '#6c757d';
        resetButton.style.color = 'white';
        resetButton.style.border = 'none';
        resetButton.style.borderRadius = '4px';
        resetButton.style.cursor = 'pointer';
        resetButton.onclick = () => {
            if (confirm('Are you sure you want to reset all settings to default values?')) {
                this.apiTabView.labelManager.resetToDefaultWhitelist();
                this.showSettingsSavedNotification('Settings reset to defaults');
                modalOverlay.remove();
                // Reload labels with default whitelist
                this.apiTabView.labelManager.fetchAndAddLabels();
            }
        };

        // Save button
        const saveButton = document.createElement('button');
        saveButton.textContent = 'Save Settings';
        saveButton.style.padding = '8px 16px';
        saveButton.style.backgroundColor = '#28a745';
        saveButton.style.color = 'white';
        saveButton.style.border = 'none';
        saveButton.style.borderRadius = '4px';
        saveButton.style.cursor = 'pointer';
        saveButton.onclick = () => {
            this.saveWhitelistSettings();
            modalOverlay.remove();

            // Show success notification
            this.showSettingsSavedNotification('Settings saved successfully');

            // Reload labels with new whitelist
            this.apiTabView.labelManager.fetchAndAddLabels();
        };

        buttonContainer.appendChild(resetButton);
        buttonContainer.appendChild(saveButton);
        modalContent.appendChild(buttonContainer);

        // Add modal to page
        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close modal when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });
    }

    /**
     * Create a GitLab-styled label element
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createGitLabStyleLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.name;

        // Get background color from label or generate one
        const bgColor = label.color || this.getColorForLabel(label.name);

        // Calculate text color (black or white) based on background color brightness
        const textColor = this.getContrastColor(bgColor);

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
     * Generate a color based on the label name
     * This ensures consistent colors for the same label names
     * @param {string} name - Label name
     * @returns {string} HEX color code
     */
    getColorForLabel(name) {
        // Simple hash function for the string
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash |= 0; // Convert to 32bit integer
        }

        // Generate pastel colors for better readability
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 70%, 75%)`;
    }

    /**
     * Determine if text should be black or white based on background color
     * @param {string} bgColor - Background color (hex, rgb, or named color)
     * @returns {string} 'black' or 'white'
     */
    getContrastColor(bgColor) {
        // Convert background color to RGB values
        let rgb = { r: 0, g: 0, b: 0 };

        if (bgColor.startsWith('#')) {
            // Hex color
            const hex = bgColor.substring(1);
            rgb.r = parseInt(hex.substr(0, 2), 16);
            rgb.g = parseInt(hex.substr(2, 2), 16);
            rgb.b = parseInt(hex.substr(4, 2), 16);
        } else if (bgColor.startsWith('rgb')) {
            // RGB color
            const parts = bgColor.match(/\d+/g);
            if (parts && parts.length >= 3) {
                rgb.r = parseInt(parts[0]);
                rgb.g = parseInt(parts[1]);
                rgb.b = parseInt(parts[2]);
            }
        } else if (bgColor.startsWith('hsl')) {
            // For HSL, we'll make a rough approximation based on lightness
            const parts = bgColor.match(/\d+/g);
            if (parts && parts.length >= 3) {
                // Simple check - if lightness > 70%, use black text
                return parseInt(parts[2]) > 70 ? 'black' : 'white';
            }
        }

        // Calculate perceived brightness (YIQ formula)
        const brightness = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;

        // Use white text on dark backgrounds, black on light
        return brightness > 125 ? 'black' : 'white';
    }

    /**
     * Create whitelist editor with checkboxes for all available labels
     * @param {HTMLElement} container - Container to add whitelist editor to
     */
    createWhitelistEditor(container) {
        // Add loading message
        const loadingMessage = document.createElement('div');
        loadingMessage.id = 'whitelist-loading-message';
        loadingMessage.textContent = 'Loading available labels...';
        loadingMessage.style.fontStyle = 'italic';
        loadingMessage.style.color = '#666';
        container.appendChild(loadingMessage);

        // Create whitelist container with flex layout
        const whitelistContainer = document.createElement('div');
        whitelistContainer.id = 'whitelist-container';
        whitelistContainer.style.display = 'flex';
        whitelistContainer.style.flexWrap = 'wrap';
        whitelistContainer.style.gap = '10px';
        whitelistContainer.style.marginTop = '15px';
        container.appendChild(whitelistContainer);

        // Load current whitelist
        const currentWhitelist = this.apiTabView.labelManager.labelWhitelist;

        // Get all available labels from API
        this.apiTabView.labelManager.fetchAllLabels().then(allLabels => {
            // Remove loading message
            loadingMessage.remove();

            if (allLabels.length === 0) {
                const noLabelsMessage = document.createElement('div');
                noLabelsMessage.textContent = 'No labels found. Try refreshing the page.';
                noLabelsMessage.style.width = '100%';
                whitelistContainer.appendChild(noLabelsMessage);
                return;
            }

            // Sort labels alphabetically
            allLabels.sort((a, b) => a.name.localeCompare(b.name));

            // Create a checkbox for each unique label
            const seenLabels = new Set();

            allLabels.forEach(label => {
                // Skip duplicate labels
                if (seenLabels.has(label.name.toLowerCase())) return;
                seenLabels.add(label.name.toLowerCase());

                // Create checkbox container
                const checkboxContainer = document.createElement('div');
                checkboxContainer.style.display = 'flex';
                checkboxContainer.style.alignItems = 'center';
                checkboxContainer.style.marginBottom = '10px';
                checkboxContainer.style.width = 'calc(33.33% - 10px)'; // 3 columns with gap

                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = `label-${label.name}`;
                checkbox.dataset.label = label.name.toLowerCase();
                checkbox.style.marginRight = '8px';

                // Check if this label is in the whitelist
                if (this.apiTabView.labelManager.isLabelInWhitelist(label.name, currentWhitelist)) {
                    checkbox.checked = true;
                }

                // Create GitLab-styled label
                const labelElement = this.createGitLabStyleLabel(label);

                // Make the label clickable to toggle the checkbox
                labelElement.style.cursor = 'pointer';
                labelElement.onclick = () => {
                    checkbox.checked = !checkbox.checked;
                };

                // Add label and checkbox to container
                checkboxContainer.appendChild(checkbox);
                checkboxContainer.appendChild(labelElement);
                whitelistContainer.appendChild(checkboxContainer);
            });

            // Add custom input for adding custom terms
            const customInputContainer = document.createElement('div');
            customInputContainer.style.width = '100%';
            customInputContainer.style.marginTop = '20px';
            customInputContainer.style.padding = '15px';
            customInputContainer.style.borderTop = '1px solid #ddd';

            const customInputLabel = document.createElement('div');
            customInputLabel.textContent = 'Add custom terms (comma separated):';
            customInputLabel.style.marginBottom = '8px';
            customInputLabel.style.fontWeight = 'bold';

            const customInput = document.createElement('input');
            customInput.type = 'text';
            customInput.id = 'custom-whitelist-terms';
            customInput.style.width = '100%';
            customInput.style.padding = '8px';
            customInput.style.borderRadius = '4px';
            customInput.style.border = '1px solid #ccc';

            // Add custom terms from whitelist that aren't in labels
            const labelTerms = Array.from(seenLabels);
            const customTerms = currentWhitelist.filter(term =>
                !labelTerms.some(label => label.includes(term))
            );

            customInput.value = customTerms.join(', ');

            customInputContainer.appendChild(customInputLabel);
            customInputContainer.appendChild(customInput);
            whitelistContainer.appendChild(customInputContainer);
        }).catch(error => {
            console.error('Error fetching labels for whitelist editor:', error);
            loadingMessage.textContent = 'Error loading labels. Try refreshing the page.';
            loadingMessage.style.color = '#dc3545';
        });
    }

    /**
     * Save whitelist settings from checkboxes and custom input
     */
    saveWhitelistSettings() {
        const newWhitelist = [];

        // Get all checked labels
        const checkboxes = document.querySelectorAll('#whitelist-container input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            if (checkbox.checked) {
                newWhitelist.push(checkbox.dataset.label.toLowerCase());
            }
        });

        // Get custom terms
        const customInput = document.getElementById('custom-whitelist-terms');
        if (customInput && customInput.value) {
            const customTerms = customInput.value.split(',').map(term => term.trim().toLowerCase());
            customTerms.forEach(term => {
                if (term && !newWhitelist.includes(term)) {
                    newWhitelist.push(term);
                }
            });
        }

        // Save to LabelManager
        this.apiTabView.labelManager.saveWhitelist(newWhitelist);
    }

    /**
     * Show notification that settings were saved
     * @param {string} message - Message to display
     */
    showSettingsSavedNotification(message = 'Settings saved successfully!') {
        const notification = document.createElement('div');
        notification.textContent = message;
        notification.style.position = 'fixed';
        notification.style.bottom = '20px';
        notification.style.right = '20px';
        notification.style.backgroundColor = '#28a745';
        notification.style.color = 'white';
        notification.style.padding = '10px 20px';
        notification.style.borderRadius = '4px';
        notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
        notification.style.zIndex = '1001';
        notification.style.opacity = '0';
        notification.style.transform = 'translateY(20px)';
        notification.style.transition = 'opacity 0.3s ease, transform 0.3s ease';

        document.body.appendChild(notification);

        // Animate in
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Animate out and remove
        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transform = 'translateY(20px)';

            setTimeout(() => {
                notification.remove();
            }, 300);
        }, 3000);
    }
}
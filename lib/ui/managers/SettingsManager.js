// SettingsManager.js - Manages application settings and UI
import { getLabelWhitelist, saveLabelWhitelist, resetLabelWhitelist,
    getAssigneeWhitelist, saveAssigneeWhitelist } from '../../storage/SettingsStorage';
import { generateColorFromString, getContrastColor } from '../../core/Utils';
import Notification from '../components/Notification';

/**
 * Manager for application settings
 */
export default class SettingsManager {
    /**
     * Constructor for SettingsManager
     * @param {Object} options - Configuration options
     * @param {Object} options.labelManager - Label manager instance
     * @param {Object} options.assigneeManager - Assignee manager instance
     * @param {Function} options.onSettingsChanged - Callback when settings change
     */
    constructor(options = {}) {
        this.labelManager = options.labelManager;
        this.assigneeManager = options.assigneeManager;
        this.onSettingsChanged = options.onSettingsChanged || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });
    }

    /**
     * Add settings button to the UI
     * @param {HTMLElement} container - Container to add settings button to
     * @returns {HTMLElement} The created settings button
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

        // Add to container if provided
        if (container) {
            container.appendChild(settingsButton);
        }

        return settingsButton;
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
        modalContent.style.width = '700px'; // Wider for better readability
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
        modalHeader.style.borderBottom = '1px solid #eee';
        modalHeader.style.paddingBottom = '10px';

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

        // Create tabs for different settings categories
        const tabsContainer = document.createElement('div');
        tabsContainer.style.display = 'flex';
        tabsContainer.style.borderBottom = '1px solid #dee2e6';
        tabsContainer.style.marginBottom = '20px';

        const tabs = [
            { id: 'labels', label: 'Labels', active: true },
            { id: 'assignees', label: 'Assignees', active: false },
            { id: 'appearance', label: 'Appearance', active: false }
        ];

        const tabElements = {};
        const contentElements = {};

        // Create tab elements
        tabs.forEach(tab => {
            const tabElement = document.createElement('div');
            tabElement.textContent = tab.label;
            tabElement.style.padding = '10px 15px';
            tabElement.style.cursor = 'pointer';
            tabElement.style.transition = 'all 0.2s ease';

            if (tab.active) {
                tabElement.style.borderBottom = '2px solid #1f75cb';
                tabElement.style.fontWeight = 'bold';
            }

            // Add hover effect
            tabElement.addEventListener('mouseenter', () => {
                if (!tab.active) {
                    tabElement.style.backgroundColor = '#f5f5f5';
                }
            });

            tabElement.addEventListener('mouseleave', () => {
                if (!tab.active) {
                    tabElement.style.backgroundColor = '';
                }
            });

            // Add click handler
            tabElement.addEventListener('click', () => {
                // Deactivate all tabs
                tabs.forEach(t => {
                    tabElements[t.id].style.borderBottom = 'none';
                    tabElements[t.id].style.fontWeight = 'normal';
                    tabElements[t.id].style.backgroundColor = '';
                    contentElements[t.id].style.display = 'none';
                    t.active = false;
                });

                // Activate clicked tab
                tabElement.style.borderBottom = '2px solid #1f75cb';
                tabElement.style.fontWeight = 'bold';
                contentElements[tab.id].style.display = 'block';
                tab.active = true;
            });

            tabsContainer.appendChild(tabElement);
            tabElements[tab.id] = tabElement;
        });

        // Create content containers for each tab
        tabs.forEach(tab => {
            const contentElement = document.createElement('div');
            contentElement.style.display = tab.active ? 'block' : 'none';

            contentElements[tab.id] = contentElement;
        });

        // Add content to label tab
        this.createLabelWhitelistSettings(contentElements['labels']);

        // Add content to assignee tab
        this.createAssigneeSettings(contentElements['assignees']);

        // Add content to appearance tab
        this.createAppearanceSettings(contentElements['appearance']);

        // Add button container at bottom
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '20px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'space-between';
        buttonContainer.style.alignItems = 'center';
        buttonContainer.style.borderTop = '1px solid #eee';
        buttonContainer.style.paddingTop = '15px';

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
                this.resetAllSettings();
                modalOverlay.remove();
                this.notification.success('Settings reset to defaults');
            }
        };

        // Close button
        const closeModalButton = document.createElement('button');
        closeModalButton.textContent = 'Close';
        closeModalButton.style.padding = '8px 16px';
        closeModalButton.style.backgroundColor = '#28a745';
        closeModalButton.style.color = 'white';
        closeModalButton.style.border = 'none';
        closeModalButton.style.borderRadius = '4px';
        closeModalButton.style.cursor = 'pointer';
        closeModalButton.onclick = () => {
            modalOverlay.remove();
        };

        buttonContainer.appendChild(resetButton);
        buttonContainer.appendChild(closeModalButton);

        // Assemble the modal
        modalContent.appendChild(modalHeader);
        modalContent.appendChild(tabsContainer);

        // Add content elements to modal
        Object.values(contentElements).forEach(element => {
            modalContent.appendChild(element);
        });

        modalContent.appendChild(buttonContainer);
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
     * Create label whitelist settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createLabelWhitelistSettings(container) {
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

        // Add label whitelist editor
        this.createWhitelistEditor(whitelistSection);

        // Add save and reset buttons for this section
        const labelButtonContainer = document.createElement('div');
        labelButtonContainer.style.display = 'flex';
        labelButtonContainer.style.justifyContent = 'flex-end';
        labelButtonContainer.style.marginTop = '15px';
        labelButtonContainer.style.gap = '10px';

        // Reset labels button
        const resetLabelsButton = document.createElement('button');
        resetLabelsButton.textContent = 'Reset Labels';
        resetLabelsButton.style.padding = '6px 12px';
        resetLabelsButton.style.backgroundColor = '#6c757d';
        resetLabelsButton.style.color = 'white';
        resetLabelsButton.style.border = 'none';
        resetLabelsButton.style.borderRadius = '4px';
        resetLabelsButton.style.cursor = 'pointer';
        resetLabelsButton.onclick = () => {
            if (confirm('Reset label whitelist to default values?')) {
                this.resetLabelWhitelist();

                // Refresh the editor
                while (whitelistSection.firstChild) {
                    whitelistSection.removeChild(whitelistSection.firstChild);
                }

                whitelistSection.appendChild(whitelistTitle);
                whitelistSection.appendChild(whitelistDescription);
                this.createWhitelistEditor(whitelistSection);
                whitelistSection.appendChild(labelButtonContainer);

                this.notification.success('Label whitelist reset to defaults');
            }
        };

        // Save labels button
        const saveLabelsButton = document.createElement('button');
        saveLabelsButton.textContent = 'Save Labels';
        saveLabelsButton.style.padding = '6px 12px';
        saveLabelsButton.style.backgroundColor = '#28a745';
        saveLabelsButton.style.color = 'white';
        saveLabelsButton.style.border = 'none';
        saveLabelsButton.style.borderRadius = '4px';
        saveLabelsButton.style.cursor = 'pointer';
        saveLabelsButton.onclick = () => {
            this.saveWhitelistSettings();
            this.notification.success('Label settings saved');
        };

        labelButtonContainer.appendChild(resetLabelsButton);
        labelButtonContainer.appendChild(saveLabelsButton);

        whitelistSection.appendChild(labelButtonContainer);

        container.appendChild(whitelistSection);
    }

    /**
     * Create assignee settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createAssigneeSettings(container) {
        const assigneeSection = document.createElement('div');

        const title = document.createElement('h4');
        title.textContent = 'Manage Assignees';
        title.style.marginBottom = '10px';

        const description = document.createElement('p');
        description.textContent = 'Add assignees that will appear in the assignee dropdown. These users will be available for quick assignment to issues.';
        description.style.marginBottom = '15px';
        description.style.fontSize = '14px';
        description.style.color = '#666';

        assigneeSection.appendChild(title);
        assigneeSection.appendChild(description);

        // Get assignee whitelist
        const assignees = getAssigneeWhitelist();

        // Create assignee list
        const assigneeList = document.createElement('div');
        assigneeList.style.marginBottom = '20px';
        assigneeList.style.maxHeight = '300px';
        assigneeList.style.overflowY = 'auto';
        assigneeList.style.border = '1px solid #eee';
        assigneeList.style.borderRadius = '4px';

        // Create function for empty message
        const createEmptyMessage = () => {
            const emptyMessage = document.createElement('div');
            emptyMessage.textContent = 'No assignees added yet. Add some below.';
            emptyMessage.style.padding = '10px';
            emptyMessage.style.fontStyle = 'italic';
            emptyMessage.style.color = '#666';
            return emptyMessage;
        };

        // Add assignees to list
        if (assignees.length > 0) {
            assignees.forEach((assignee, index) => {
                assigneeList.appendChild(this.createAssigneeListItem(assignee, index, assigneeList, createEmptyMessage));
            });
        } else {
            assigneeList.appendChild(createEmptyMessage());
        }

        assigneeSection.appendChild(assigneeList);

        // Create add assignee form
        const addForm = document.createElement('div');
        addForm.style.marginTop = '20px';
        addForm.style.padding = '15px';
        addForm.style.backgroundColor = '#f8f9fa';
        addForm.style.borderRadius = '4px';

        const formTitle = document.createElement('h5');
        formTitle.textContent = 'Add New Assignee';
        formTitle.style.marginBottom = '10px';

        // Create name field
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
        nameInput.style.padding = '6px 8px';
        nameInput.style.borderRadius = '4px';
        nameInput.style.border = '1px solid #ccc';

        nameContainer.appendChild(nameLabel);
        nameContainer.appendChild(nameInput);

        // Create username field
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
        usernameInput.style.padding = '6px 8px';
        usernameInput.style.borderRadius = '4px';
        usernameInput.style.border = '1px solid #ccc';

        usernameContainer.appendChild(usernameLabel);
        usernameContainer.appendChild(usernameInput);

        // Create button container
        const buttonContainer = document.createElement('div');
        buttonContainer.style.display = 'flex';
        buttonContainer.style.justifyContent = 'flex-end';

        const addButton = document.createElement('button');
        addButton.textContent = 'Add Assignee';
        addButton.style.padding = '6px 12px';
        addButton.style.backgroundColor = '#28a745';
        addButton.style.color = 'white';
        addButton.style.border = 'none';
        addButton.style.borderRadius = '4px';
        addButton.style.cursor = 'pointer';

        addButton.onclick = () => {
            const name = nameInput.value.trim();
            const username = usernameInput.value.trim();

            if (!username) {
                this.notification.error('Username is required');
                return;
            }

            // Add to whitelist
            const newAssignee = {
                name: name || username,
                username: username
            };

            // Check if already exists
            const assignees = getAssigneeWhitelist();
            const existingIndex = assignees.findIndex(a => a.username === username);

            if (existingIndex >= 0) {
                // Update existing
                assignees[existingIndex] = newAssignee;
            } else {
                // Add new
                assignees.push(newAssignee);
            }

            // Save whitelist
            saveAssigneeWhitelist(assignees);

            // Refresh the list
            const emptyMessage = assigneeList.querySelector('div[style*="italic"]');
            if (emptyMessage) {
                assigneeList.removeChild(emptyMessage);
            }

            // Add the new assignee to the list
            assigneeList.appendChild(this.createAssigneeListItem(
                newAssignee,
                assignees.length - 1,
                assigneeList,
                createEmptyMessage
            ));

            // Clear inputs
            nameInput.value = '';
            usernameInput.value = '';

            // Show success message
            this.notification.success(`Added assignee: ${newAssignee.name}`);

            // Notify of change
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttonContainer.appendChild(addButton);

        // Assemble the form
        addForm.appendChild(formTitle);
        addForm.appendChild(nameContainer);
        addForm.appendChild(usernameContainer);
        addForm.appendChild(buttonContainer);

        assigneeSection.appendChild(addForm);

        container.appendChild(assigneeSection);
    }

    /**
     * Create an assignee list item
     * @param {Object} assignee - Assignee object
     * @param {number} index - Index in the list
     * @param {HTMLElement} listContainer - List container
     * @param {Function} createEmptyMessage - Function to create empty message
     * @returns {HTMLElement} Assignee list item
     */
    createAssigneeListItem(assignee, index, listContainer, createEmptyMessage) {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '10px';
        item.style.borderBottom = '1px solid #eee';

        // Create assignee info
        const info = document.createElement('div');
        info.style.display = 'flex';
        info.style.alignItems = 'center';

        // Create avatar placeholder
        const avatar = document.createElement('div');
        avatar.style.width = '32px';
        avatar.style.height = '32px';
        avatar.style.borderRadius = '50%';
        avatar.style.backgroundColor = '#e0e0e0';
        avatar.style.display = 'flex';
        avatar.style.alignItems = 'center';
        avatar.style.justifyContent = 'center';
        avatar.style.marginRight = '10px';
        avatar.style.fontWeight = 'bold';
        avatar.style.color = '#666';

        // Get initials
        const name = assignee.name || assignee.username;
        const initials = name.split(' ')
            .map(part => part.charAt(0))
            .slice(0, 2)
            .join('')
            .toUpperCase();

        avatar.textContent = initials;

        // Create name container
        const nameContainer = document.createElement('div');

        const displayName = document.createElement('div');
        displayName.textContent = assignee.name || assignee.username;
        displayName.style.fontWeight = 'bold';

        const username = document.createElement('div');
        username.textContent = `@${assignee.username}`;
        username.style.fontSize = '12px';
        username.style.color = '#666';

        nameContainer.appendChild(displayName);
        nameContainer.appendChild(username);

        info.appendChild(avatar);
        info.appendChild(nameContainer);

        // Create buttons
        const buttons = document.createElement('div');

        const removeButton = document.createElement('button');
        removeButton.textContent = 'Remove';
        removeButton.style.padding = '3px 8px';
        removeButton.style.backgroundColor = '#dc3545';
        removeButton.style.color = 'white';
        removeButton.style.border = 'none';
        removeButton.style.borderRadius = '3px';
        removeButton.style.cursor = 'pointer';

        removeButton.onclick = () => {
            // Get current assignees
            const assignees = getAssigneeWhitelist();

            // Remove assignee
            assignees.splice(index, 1);

            // Save whitelist
            saveAssigneeWhitelist(assignees);

            // Remove from list
            item.remove();

            // Show empty message if no assignees left
            if (assignees.length === 0) {
                listContainer.appendChild(createEmptyMessage());
            }

            // Show success message
            this.notification.info(`Removed assignee: ${assignee.name || assignee.username}`);

            // Notify of change
            if (this.onSettingsChanged) {
                this.onSettingsChanged('assignees');
            }
        };

        buttons.appendChild(removeButton);

        // Assemble item
        item.appendChild(info);
        item.appendChild(buttons);

        return item;
    }

    /**
     * Create appearance settings section
     * @param {HTMLElement} container - Container to add settings to
     */
    createAppearanceSettings(container) {
        const appearanceSection = document.createElement('div');

        const title = document.createElement('h4');
        title.textContent = 'Appearance Settings';
        title.style.marginBottom = '10px';

        const description = document.createElement('p');
        description.textContent = 'Customize the appearance of the GitLab Sprint Helper.';
        description.style.marginBottom = '15px';
        description.style.fontSize = '14px';
        description.style.color = '#666';

        appearanceSection.appendChild(title);
        appearanceSection.appendChild(description);

        // Add settings coming soon message
        const comingSoon = document.createElement('div');
        comingSoon.style.padding = '20px';
        comingSoon.style.textAlign = 'center';
        comingSoon.style.backgroundColor = '#f8f9fa';
        comingSoon.style.borderRadius = '4px';
        comingSoon.style.color = '#666';
        comingSoon.textContent = 'Appearance settings coming soon!';

        appearanceSection.appendChild(comingSoon);

        container.appendChild(appearanceSection);
    }

    /**
     * Create a GitLab-styled label element
     * @param {Object} label - Label object with name and color
     * @returns {HTMLElement} Styled label element
     */
    createGitLabStyleLabel(label) {
        const labelElement = document.createElement('span');
        labelElement.textContent = label.name;

        // Use provided color or generate one
        const bgColor = label.color || generateColorFromString(label.name);

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
        const currentWhitelist = getLabelWhitelist();

        // Get all available labels from API
        if (this.labelManager) {
            this.labelManager.fetchAllLabels().then(allLabels => {
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
                    if (this.labelManager.isLabelInWhitelist(label.name, currentWhitelist)) {
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
        } else {
            loadingMessage.textContent = 'Label manager not available.';
            loadingMessage.style.color = '#dc3545';
        }
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

        // Save to storage
        saveLabelWhitelist(newWhitelist);

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.saveWhitelist(newWhitelist);
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    /**
     * Reset label whitelist to defaults
     */
    resetLabelWhitelist() {
        resetLabelWhitelist();

        // Update label manager if available
        if (this.labelManager) {
            this.labelManager.resetToDefaultWhitelist();
        }

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('labels');
        }
    }

    /**
     * Reset all settings to defaults
     */
    resetAllSettings() {
        // Reset label whitelist
        this.resetLabelWhitelist();

        // No default assignees, so just clear them
        saveAssigneeWhitelist([]);

        // Notify of change
        if (this.onSettingsChanged) {
            this.onSettingsChanged('all');
        }
    }

    /**
     * Show notification that settings were saved
     * @param {string} message - Message to display
     */
    showSettingsSavedNotification(message = 'Settings saved successfully!') {
        this.notification.success(message);
    }
}
// MilestoneManager.js - Handles milestone-related functionality
import { getPathFromUrl } from '../../api/APIUtils';
import Notification from '../components/Notification';

/**
 * Manager for milestone functionality
 */
export default class MilestoneManager {
    /**
     * Constructor for MilestoneManager
     * @param {Object} options - Configuration options
     * @param {Object} options.gitlabApi - GitLab API instance
     * @param {Function} options.onMilestonesLoaded - Callback when milestones are loaded
     */
    constructor(options = {}) {
        this.gitlabApi = options.gitlabApi;
        this.onMilestonesLoaded = options.onMilestonesLoaded || null;

        // Create notification instance for feedback
        this.notification = new Notification({
            position: 'bottom-right',
            duration: 3000
        });

        // Initialize state
        this.milestones = [];
        this.currentMilestone = null;
        this.isLoading = false;
    }

    /**
     * Fetch milestones from GitLab API
     * @param {string} state - Filter by milestone state (active, closed, all)
     * @returns {Promise<Array>} Array of milestone objects
     */
    async fetchMilestones(state = 'active') {
        if (!this.gitlabApi) {
            throw new Error('GitLab API instance not provided');
        }

        try {
            // Mark as loading
            this.isLoading = true;

            // Get path info for current project/group
            const pathInfo = getPathFromUrl();

            if (!pathInfo) {
                console.warn('Could not determine project/group path');
                this.isLoading = false;
                return [];
            }

            // Construct API endpoint based on project or group
            const endpoint = `${pathInfo.type}s/${pathInfo.encodedPath}/milestones`;

            // Fetch milestones
            const milestones = await this.gitlabApi.callGitLabApi(endpoint, {
                params: {
                    state: state,
                    per_page: 100,
                    order_by: 'due_date'
                }
            });

            // Process and store milestones
            this.milestones = milestones.map(milestone => ({
                id: milestone.id,
                iid: milestone.iid,
                title: milestone.title,
                description: milestone.description,
                state: milestone.state,
                due_date: milestone.due_date,
                start_date: milestone.start_date,
                web_url: milestone.web_url
            }));

            // No longer loading
            this.isLoading = false;

            // Call callback if provided
            if (typeof this.onMilestonesLoaded === 'function') {
                this.onMilestonesLoaded(this.milestones);
            }

            return this.milestones;
        } catch (error) {
            console.error('Error fetching milestones:', error);
            this.isLoading = false;
            throw error;
        }
    }

    /**
     * Get milestone by ID or title
     * @param {string|number} idOrTitle - Milestone ID or title
     * @returns {Object|null} Milestone object or null if not found
     */
    getMilestone(idOrTitle) {
        if (!idOrTitle) return null;

        if (typeof idOrTitle === 'number' || /^\d+$/.test(idOrTitle)) {
            // Search by ID
            return this.milestones.find(m => m.id === parseInt(idOrTitle) || m.iid === parseInt(idOrTitle));
        } else {
            // Search by title
            return this.milestones.find(m => m.title === idOrTitle);
        }
    }

    /**
     * Get the current milestone for a project/group
     * This is usually the milestone with the closest due date that hasn't passed
     * @returns {Object|null} Current milestone or null if none found
     */
    getCurrentMilestone() {
        if (this.milestones.length === 0) {
            return null;
        }

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // First try to find an active milestone with due date in the future
        const activeMilestones = this.milestones.filter(m =>
            m.state === 'active' && m.due_date && new Date(m.due_date) >= today);

        if (activeMilestones.length > 0) {
            // Sort by due date (ascending) and return the first one
            return activeMilestones.sort((a, b) =>
                new Date(a.due_date) - new Date(b.due_date))[0];
        }

        // If no suitable active milestones, return the most recent active one
        const recentActive = this.milestones.filter(m => m.state === 'active');

        if (recentActive.length > 0) {
            // Return the first one (should be sorted by due_date already from API)
            return recentActive[0];
        }

        // If no active milestones at all, return null
        return null;
    }

    /**
     * Get next milestone after the current one
     * @returns {Object|null} Next milestone or null if none found
     */
    getNextMilestone() {
        const current = this.getCurrentMilestone();

        if (!current || !current.due_date) {
            // If no current milestone or it has no due date, just return the first active one
            const active = this.milestones.filter(m => m.state === 'active');
            return active.length > 0 ? active[0] : null;
        }

        const currentDue = new Date(current.due_date);

        // Find milestones with due dates after the current one
        const upcoming = this.milestones.filter(m =>
            m.state === 'active' &&
            m.due_date &&
            new Date(m.due_date) > currentDue);

        if (upcoming.length > 0) {
            // Sort by due date (ascending) and return the first one
            return upcoming.sort((a, b) =>
                new Date(a.due_date) - new Date(b.due_date))[0];
        }

        return null;
    }

    /**
     * Get upcoming milestones (excluding current and next)
     * @param {number} limit - Maximum number of milestones to return
     * @returns {Array} Array of upcoming milestone objects
     */
    getUpcomingMilestones(limit = 5) {
        const current = this.getCurrentMilestone();
        const next = this.getNextMilestone();

        // Filter out current and next milestones
        const filtered = this.milestones.filter(m => {
            if (!m.due_date || m.state !== 'active') return false;

            // Skip current and next milestones
            if (current && m.id === current.id) return false;
            if (next && m.id === next.id) return false;

            // Only include milestones with future due dates
            const dueDate = new Date(m.due_date);
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            return dueDate >= today;
        });

        // Sort by due date (ascending)
        const sorted = filtered.sort((a, b) =>
            new Date(a.due_date) - new Date(b.due_date));

        // Return up to the specified limit
        return sorted.slice(0, limit);
    }

    /**
     * Get milestone dropdown options
     * Includes special values and actual milestones
     * @returns {Array} Array of option objects with value and label
     */
    getMilestoneOptions() {
        const options = [
            { value: '', label: 'Set Milestone' },
            { value: '%current', label: 'Current Sprint' },
            { value: '%next', label: 'Next Sprint' },
            { value: '%upcoming', label: 'Upcoming' },
            { value: 'none', label: 'Remove Milestone' }
        ];

        // Add actual milestones if available
        if (this.milestones.length > 0) {
            // Add separator
            options.push({ value: 'separator', label: '─────────────' });

            // Add active milestones
            const activeMilestones = this.milestones
                .filter(m => m.state === 'active')
                .map(m => ({
                    value: m.title,
                    label: m.title,
                    dueDate: m.due_date
                }));

            options.push(...activeMilestones);
        }

        return options;
    }

    /**
     * Insert milestone command into textarea
     * @param {HTMLElement} textarea - Textarea to insert command into
     * @param {string} value - Milestone value (special value or title)
     */
    insertMilestoneCommand(textarea, value) {
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
        const currentText = textarea.value;

        if (milestoneRegex.test(currentText)) {
            // Replace existing command
            textarea.value = currentText.replace(milestoneRegex, milestoneText);
        } else {
            // Insert at cursor position
            const startPos = textarea.selectionStart;
            const endPos = textarea.selectionEnd;

            // Add newline if needed
            let insertText = milestoneText;
            if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
                insertText = '\n' + insertText;
            }

            // Insert text
            textarea.value = currentText.substring(0, startPos) +
                insertText +
                currentText.substring(endPos);

            // Update cursor position
            const newPos = startPos + insertText.length;
            textarea.setSelectionRange(newPos, newPos);
        }

        // Focus textarea
        textarea.focus();

        // Show notification
        if (value === 'none') {
            this.notification.info('Milestone will be removed');
        } else {
            const displayValue = value.startsWith('%')
                ? value.substring(1)
                : value;
            this.notification.info(`Milestone set to ${displayValue}`);
        }
    }

    /**
     * Create a milestone option element for the selector
     * @param {Object} milestone - Milestone object
     * @param {Function} onClick - Click handler
     * @returns {HTMLElement} Option element
     */
    createMilestoneOption(milestone, onClick) {
        const option = document.createElement('div');
        option.className = 'milestone-option';
        option.style.padding = '10px';
        option.style.borderRadius = '4px';
        option.style.border = '1px solid #dee2e6';
        option.style.cursor = 'pointer';
        option.style.transition = 'background-color 0.2s ease';

        // Add hover effect
        option.addEventListener('mouseenter', () => {
            option.style.backgroundColor = '#f5f5f5';
        });

        option.addEventListener('mouseleave', () => {
            option.style.backgroundColor = '';
        });

        // Create title element
        const title = document.createElement('div');
        title.className = 'milestone-title';
        title.textContent = milestone.label;
        title.style.fontWeight = 'bold';
        title.style.fontSize = '14px';
        title.style.marginBottom = '5px';

        option.appendChild(title);

        // Add due date if available
        if (milestone.dueDate) {
            const dueDate = document.createElement('div');
            dueDate.className = 'milestone-due-date';

            // Format the date
            const date = new Date(milestone.dueDate);
            const formattedDate = date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });

            dueDate.textContent = `Due: ${formattedDate}`;
            dueDate.style.fontSize = '12px';
            dueDate.style.color = '#6c757d';
            dueDate.style.marginBottom = '5px';

            option.appendChild(dueDate);
        }

        // Add description if available
        if (milestone.description) {
            const description = document.createElement('div');
            description.className = 'milestone-description';

            // Truncate long descriptions
            let descText = milestone.description;
            if (descText.length > 100) {
                descText = descText.substring(0, 97) + '...';
            }

            description.textContent = descText;
            description.style.fontSize = '12px';
            description.style.color = '#6c757d';

            option.appendChild(description);
        }

        // Add state indicator if available
        if (milestone.state) {
            const stateContainer = document.createElement('div');
            stateContainer.style.display = 'flex';
            stateContainer.style.justifyContent = 'flex-end';
            stateContainer.style.marginTop = '5px';

            const state = document.createElement('span');
            state.className = 'milestone-state';
            state.textContent = milestone.state;
            state.style.fontSize = '11px';
            state.style.padding = '2px 6px';
            state.style.borderRadius = '10px';
            state.style.textTransform = 'capitalize';

            // Set color based on state
            if (milestone.state === 'active') {
                state.style.backgroundColor = '#28a745';
                state.style.color = 'white';
            } else if (milestone.state === 'closed') {
                state.style.backgroundColor = '#6c757d';
                state.style.color = 'white';
            }

            stateContainer.appendChild(state);
            option.appendChild(stateContainer);
        }

        // Add click handler
        if (typeof onClick === 'function') {
            option.addEventListener('click', onClick);
        }

        return option;
    }

    /**
     * Open milestone selector dialog
     * @param {HTMLElement} targetElement - Textarea to insert command into after selection
     */
    openMilestoneSelector(targetElement) {
        // Create modal overlay
        const modalOverlay = document.createElement('div');
        modalOverlay.style.position = 'fixed';
        modalOverlay.style.top = '0';
        modalOverlay.style.left = '0';
        modalOverlay.style.width = '100%';
        modalOverlay.style.height = '100%';
        modalOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
        modalOverlay.style.zIndex = '110';
        modalOverlay.style.display = 'flex';
        modalOverlay.style.justifyContent = 'center';
        modalOverlay.style.alignItems = 'center';

        // Create modal content
        const modalContent = document.createElement('div');
        modalContent.style.backgroundColor = 'white';
        modalContent.style.borderRadius = '6px';
        modalContent.style.padding = '20px';
        modalContent.style.width = '600px';
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
        modalTitle.textContent = 'Select Milestone';
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

        // Create content area
        const contentArea = document.createElement('div');

        // Add search box
        const searchContainer = document.createElement('div');
        searchContainer.style.marginBottom = '15px';

        const searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.placeholder = 'Search milestones...';
        searchInput.style.width = '100%';
        searchInput.style.padding = '8px';
        searchInput.style.borderRadius = '4px';
        searchInput.style.border = '1px solid #ccc';

        searchContainer.appendChild(searchInput);
        contentArea.appendChild(searchContainer);

        // Create special options section
        const specialOptions = document.createElement('div');
        specialOptions.style.marginBottom = '20px';

        // Create special milestone options
        const specialValues = [
            { value: '%current', label: 'Current Sprint', description: 'The active milestone with the closest due date' },
            { value: '%next', label: 'Next Sprint', description: 'The milestone following the current one' },
            { value: '%upcoming', label: 'Upcoming', description: 'Future milestones beyond the next one' },
            { value: 'none', label: 'Remove Milestone', description: 'Clear the milestone from this issue' }
        ];

        specialValues.forEach(special => {
            const option = this.createMilestoneOption(
                special,
                () => {
                    this.insertMilestoneCommand(targetElement, special.value);
                    modalOverlay.remove();
                }
            );

            specialOptions.appendChild(option);
        });

        // Add separator
        const separator = document.createElement('div');
        separator.style.borderBottom = '1px solid #eee';
        separator.style.margin = '20px 0';

        // Create loading indicator
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading milestones...';
        loadingIndicator.style.textAlign = 'center';
        loadingIndicator.style.padding = '20px';
        loadingIndicator.style.color = '#666';

        // Create milestones section
        const milestonesSection = document.createElement('div');

        const milestonesTitle = document.createElement('h4');
        milestonesTitle.textContent = 'Project Milestones';
        milestonesTitle.style.marginBottom = '10px';

        milestonesSection.appendChild(milestonesTitle);
        milestonesSection.appendChild(loadingIndicator);

        // Add refresh button
        const refreshContainer = document.createElement('div');
        refreshContainer.style.display = 'flex';
        refreshContainer.style.justifyContent = 'flex-end';
        refreshContainer.style.marginTop = '20px';

        const refreshButton = document.createElement('button');
        refreshButton.textContent = 'Refresh Milestones';
        refreshButton.style.padding = '6px 12px';
        refreshButton.style.backgroundColor = '#6c757d';
        refreshButton.style.color = 'white';
        refreshButton.style.border = 'none';
        refreshButton.style.borderRadius = '4px';
        refreshButton.style.cursor = 'pointer';

        refreshContainer.appendChild(refreshButton);

        // Assemble the modal
        contentArea.appendChild(specialOptions);
        contentArea.appendChild(separator);
        contentArea.appendChild(milestonesSection);
        contentArea.appendChild(refreshContainer);

        modalContent.appendChild(modalHeader);
        modalContent.appendChild(contentArea);

        modalOverlay.appendChild(modalContent);
        document.body.appendChild(modalOverlay);

        // Close when clicking outside
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.remove();
            }
        });

        // Load milestones
        this.fetchMilestones().then(milestones => {
            // Remove loading indicator
            loadingIndicator.remove();

            if (milestones.length === 0) {
                // Show empty message
                const emptyMessage = document.createElement('div');
                emptyMessage.textContent = 'No milestones found for this project.';
                emptyMessage.style.textAlign = 'center';
                emptyMessage.style.padding = '20px';
                emptyMessage.style.color = '#666';

                milestonesSection.appendChild(emptyMessage);
                return;
            }

            // Create milestones container with grid layout
            const milestonesGrid = document.createElement('div');
            milestonesGrid.style.display = 'grid';
            milestonesGrid.style.gap = '10px';
            milestonesGrid.style.gridTemplateColumns = '1fr';

            // Add milestone options
            milestones.forEach(milestone => {
                const option = this.createMilestoneOption(
                    {
                        value: milestone.title,
                        label: milestone.title,
                        description: milestone.description,
                        dueDate: milestone.due_date,
                        state: milestone.state
                    },
                    () => {
                        this.insertMilestoneCommand(targetElement, milestone.title);
                        modalOverlay.remove();
                    }
                );

                milestonesGrid.appendChild(option);
            });

            milestonesSection.appendChild(milestonesGrid);

            // Setup search functionality
            searchInput.addEventListener('input', () => {
                const searchText = searchInput.value.toLowerCase();

                // Filter milestones based on search text
                Array.from(milestonesGrid.children).forEach(option => {
                    const titleElement = option.querySelector('.milestone-title');
                    const descriptionElement = option.querySelector('.milestone-description');

                    if (!titleElement) return;

                    const title = titleElement.textContent.toLowerCase();
                    const description = descriptionElement ?
                        descriptionElement.textContent.toLowerCase() : '';

                    if (title.includes(searchText) || description.includes(searchText)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                });
            });

            // Setup refresh button
            refreshButton.addEventListener('click', () => {
                // Show loading indicator
                milestonesGrid.innerHTML = '';
                milestonesGrid.appendChild(loadingIndicator);
                loadingIndicator.style.display = 'block';

                // Refresh milestones
                this.fetchMilestones().then(refreshedMilestones => {
                    // Remove loading indicator
                    loadingIndicator.style.display = 'none';

                    // Recreate milestone options
                    milestonesGrid.innerHTML = '';

                    refreshedMilestones.forEach(milestone => {
                        const option = this.createMilestoneOption(
                            {
                                value: milestone.title,
                                label: milestone.title,
                                description: milestone.description,
                                dueDate: milestone.due_date,
                                state: milestone.state
                            },
                            () => {
                                this.insertMilestoneCommand(targetElement, milestone.title);
                                modalOverlay.remove();
                            }
                        );

                        milestonesGrid.appendChild(option);
                    });

                    // Show notification
                    this.notification.success('Milestones refreshed');
                }).catch(error => {
                    console.error('Error refreshing milestones:', error);

                    // Show error
                    loadingIndicator.style.display = 'none';
                    const errorMessage = document.createElement('div');
                    errorMessage.textContent = 'Error refreshing milestones.';
                    errorMessage.style.color = '#dc3545';
                    errorMessage.style.textAlign = 'center';
                    errorMessage.style.padding = '10px';

                    milestonesGrid.innerHTML = '';
                    milestonesGrid.appendChild(errorMessage);

                    // Show notification
                    this.notification.error('Failed to refresh milestones');
                });
            });
        }).catch(error => {
            console.error('Error loading milestones:', error);

            // Show error
            loadingIndicator.textContent = 'Error loading milestones.';
            loadingIndicator.style.color = '#dc3545';
        });
    }
}
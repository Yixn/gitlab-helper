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
}
import { getPathFromUrl } from '../../api/APIUtils';
import Notification from '../components/Notification';
export default class MilestoneManager {
  constructor(options = {}) {
    this.gitlabApi = options.gitlabApi;
    this.onMilestonesLoaded = options.onMilestonesLoaded || null;
    this.notification = new Notification({
      position: 'bottom-right',
      duration: 3000
    });
    this.milestones = [];
    this.currentMilestone = null;
    this.isLoading = false;
  }
}
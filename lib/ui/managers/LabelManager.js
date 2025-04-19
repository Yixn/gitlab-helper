import { getLabelWhitelist, saveLabelWhitelist } from '../../storage/SettingsStorage';
import { getPathFromUrl } from '../../api/APIUtils';
import { generateColorFromString, getContrastColor } from '../../core/Utils';
export default class LabelManager {
  constructor(options = {}) {
    this.gitlabApi = options.gitlabApi || window.gitlabApi;
    this.onLabelsLoaded = options.onLabelsLoaded || null;
    this.labelWhitelist = [];
    try {
      this.labelWhitelist = getLabelWhitelist();
      if (!Array.isArray(this.labelWhitelist)) {
        console.warn("Loaded whitelist is not an array, using default");
        this.labelWhitelist = this.getDefaultWhitelist();
      }
    } catch (e) {
      console.warn("Error loading label whitelist, using default", e);
      this.labelWhitelist = this.getDefaultWhitelist();
    }
    this.availableLabels = [];
    this.filteredLabels = [];
    this.isLoading = false;
  }
  getDefaultWhitelist() {
    return ['bug', 'feature', 'documentation', 'enhancement', 'security', 'priority', 'high', 'medium', 'low', 'critical', 'frontend', 'backend', 'ui', 'ux', 'api', 'wontfix', 'duplicate', 'invalid', 'question', 'ready', 'in progress', 'review', 'blocked'];
  }
  saveWhitelist(whitelist) {
    if (!Array.isArray(whitelist)) {
      whitelist = [];
    }
    this.labelWhitelist = whitelist;
    try {
      saveLabelWhitelist(whitelist);
    } catch (e) {
      console.error("Error saving label whitelist", e);
    }
    this.filterLabels();
  }
  resetToDefaultWhitelist() {
    try {
      this.labelWhitelist = this.getDefaultWhitelist();
      saveLabelWhitelist(this.labelWhitelist);
    } catch (e) {
      console.error("Error resetting label whitelist", e);
    }
    this.filterLabels();
    return this.labelWhitelist;
  }
  isLabelInWhitelist(labelName, whitelist = null) {
    const whitelistToUse = whitelist || this.labelWhitelist;
    if (!Array.isArray(whitelistToUse) || typeof labelName !== 'string') {
      return false;
    }
    const lowerName = labelName.toLowerCase();
    return whitelistToUse.some(term => {
      if (typeof term !== 'string') return false;
      return lowerName.includes(term.toLowerCase());
    });
  }
  filterLabels() {
    if (!this.availableLabels || this.availableLabels.length === 0) {
      this.filteredLabels = [];
      return;
    }
    this.filteredLabels = this.availableLabels.filter(label => {
      if (!label || typeof label.name !== 'string') return false;
      return this.isLabelInWhitelist(label.name);
    });
    this.filteredLabels.sort((a, b) => a.name.localeCompare(b.name));
    if (this.onLabelsLoaded) this.onLabelsLoaded(this.filteredLabels);
  }
  async fetchAllLabels() {
    try {
      this.isLoading = true;
      if (!this.gitlabApi) {
        this.gitlabApi = window.gitlabApi;
      }
      if (!this.gitlabApi) {
        console.warn('GitLab API instance not available, using fallback labels');
        this.isLoading = false;
        return this.addFallbackLabels();
      }
      const pathInfo = getPathFromUrl();
      if (!pathInfo || !pathInfo.apiUrl) {
        console.warn('Path info not found or invalid, returning fallback labels');
        this.isLoading = false;
        return this.addFallbackLabels();
      }
      try {
        const labels = await this.gitlabApi.callGitLabApiWithCache(pathInfo.apiUrl, {
          params: {
            per_page: 100
          }
        });
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
  addFallbackLabels() {
    const fallbackLabels = [{
      name: 'bug',
      color: '#ff0000'
    }, {
      name: 'feature',
      color: '#1f75cb'
    }, {
      name: 'enhancement',
      color: '#7057ff'
    }, {
      name: 'documentation',
      color: '#0075ca'
    }, {
      name: 'priority',
      color: '#d73a4a'
    }, {
      name: 'blocked',
      color: '#b60205'
    }];
    this.availableLabels = fallbackLabels;
    this.filterLabels();
    if (typeof this.onLabelsLoaded === 'function') {
      this.onLabelsLoaded(this.filteredLabels);
    }
    return this.filteredLabels;
  }
  getLabelOptions(includeEmpty = true) {
    if (!this.filteredLabels || this.filteredLabels.length === 0) {
      const basicOptions = [];
      if (includeEmpty) {
        basicOptions.push({
          value: '',
          label: 'Add Label'
        });
      }
      return basicOptions.concat([{
        value: 'bug',
        label: 'Bug'
      }, {
        value: 'feature',
        label: 'Feature'
      }, {
        value: 'enhancement',
        label: 'Enhancement'
      }, {
        value: 'custom',
        label: 'Custom...'
      }]);
    }
    const labelOptions = this.filteredLabels.map(label => ({
      value: label.name,
      label: label.name,
      color: label.color
    }));
    if (includeEmpty) {
      labelOptions.unshift({
        value: '',
        label: 'Add Label'
      });
    }
    labelOptions.push({
      value: 'custom',
      label: 'Custom...'
    });
    return labelOptions;
  }
  createStyledLabel(label) {
    const labelElement = document.createElement('span');
    labelElement.textContent = label.label || label.name || '';
    const labelText = label.label || label.name || 'label';
    const bgColor = label.color || generateColorFromString(labelText);
    const textColor = getContrastColor(bgColor);
    labelElement.style.backgroundColor = bgColor;
    labelElement.style.color = textColor;
    labelElement.style.padding = '4px 8px';
    labelElement.style.borderRadius = '100px';
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
  insertLabelCommand(textarea, labelName) {
    if (!textarea || typeof labelName !== 'string') return;
    const labelText = `/label ~"${labelName}"`;
    const labelRegex = /\/label\s+~[^\n]+/g;
    const currentText = textarea.value;
    const hasCommand = labelRegex.test(currentText);
    if (hasCommand) {
      textarea.value = currentText.replace(labelRegex, labelText);
    } else {
      const startPos = textarea.selectionStart;
      const endPos = textarea.selectionEnd;
      let insertText = labelText;
      if (startPos > 0 && currentText.charAt(startPos - 1) !== '\n' && currentText.length > 0) {
        insertText = '\n' + insertText;
      }
      textarea.value = currentText.substring(0, startPos) + insertText + currentText.substring(endPos);
      const newCursorPos = startPos + insertText.length;
      textarea.setSelectionRange(newCursorPos, newCursorPos);
    }
    textarea.focus();
  }
  async initLabelDropdown(createDropdown, dropdownOptions = {}) {
    const dropdown = createDropdown({
      items: [{
        value: '',
        label: 'Loading labels...'
      }],
      disabled: true,
      ...dropdownOptions
    });
    try {
      await this.fetchAllLabels();
      dropdown.updateItems(this.getLabelOptions());
      dropdown.enable();
    } catch (error) {
      console.error('Error initializing label dropdown:', error);
      dropdown.updateItems([{
        value: '',
        label: 'Error loading labels'
      }, {
        value: 'bug',
        label: 'Bug'
      }, {
        value: 'feature',
        label: 'Feature'
      }, {
        value: 'custom',
        label: 'Custom...'
      }]);
      dropdown.enable();
    }
    return dropdown;
  }
}
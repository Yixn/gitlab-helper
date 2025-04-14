export default class CommandShortcut {
  constructor(options) {
    this.targetElement = options.targetElement;
    this.onShortcutInsert = options.onShortcutInsert || null;
    this.shortcutsContainer = null;
    this.shortcuts = {};
  }
  initialize(parentElement) {
    if (this.shortcutsContainer && this.shortcutsContainer.parentNode) {
      this.shortcutsContainer.parentNode.removeChild(this.shortcutsContainer);
    }
    this.shortcutsContainer = document.createElement('div');
    this.shortcutsContainer.className = 'command-shortcuts-container';
    this.shortcutsContainer.style.marginBottom = '10px';
    this.shortcutsContainer.style.display = 'flex';
    this.shortcutsContainer.style.flexDirection = 'column';
    this.shortcutsContainer.style.gap = '8px';
    this.shortcutsContainer.style.alignItems = 'stretch';
    parentElement.appendChild(this.shortcutsContainer);
    this.initializeEstimateShortcut();
  }
  initializeEstimateShortcut() {
    if (this.shortcuts['estimate']) {
      this.removeShortcut('estimate');
    }
    this.addCustomShortcut({
      type: 'estimate',
      label: '/estimate',
      items: [{
        value: '',
        label: 'Estimate Hours'
      }, {
        value: '1',
        label: '1h'
      }, {
        value: '2',
        label: '2h'
      }, {
        value: '4',
        label: '4h'
      }, {
        value: '8',
        label: '8h'
      }, {
        value: '16',
        label: '16h'
      }, {
        value: '32',
        label: '32h'
      }, {
        value: 'custom',
        label: 'Custom...'
      }],
      onSelect: value => {
        if (value === 'custom') {
          this.handleCustomEstimate();
        } else if (value) {
          this.insertEstimateText(value);
        }
      }
    });
  }
  removeShortcut(type) {
    if (this.shortcuts[type] && this.shortcuts[type].element) {
      const element = this.shortcuts[type].element;
      if (element.parentNode) {
        element.parentNode.removeChild(element);
      }
      delete this.shortcuts[type];
    }
  }
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
      this.targetElement.value = currentText.substring(0, startPos) + insertText + currentText.substring(endPos);
      const newCursorPos = startPos + insertText.length;
      this.targetElement.setSelectionRange(newCursorPos, newCursorPos);
    }
    this.targetElement.focus();
    if (typeof this.onShortcutInsert === 'function') {
      this.onShortcutInsert('estimate', hours);
    }
  }
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
    shortcutContainer.style.height = '36px';
    shortcutContainer.style.boxSizing = 'border-box';
    shortcutContainer.dataset.shortcutType = options.type;
    const labelContainer = document.createElement('div');
    labelContainer.style.display = 'flex';
    labelContainer.style.alignItems = 'center';
    labelContainer.style.minWidth = '100px';
    labelContainer.style.flexShrink = '0';
    const shortcutLabel = document.createElement('div');
    shortcutLabel.textContent = options.label;
    shortcutLabel.style.fontSize = '13px';
    shortcutLabel.style.fontWeight = 'bold';
    shortcutLabel.style.color = '#555';
    shortcutLabel.style.whiteSpace = 'nowrap';
    labelContainer.appendChild(shortcutLabel);
    let toggleButton = null;
    let isAddMode = true;
    let originalItems = [...options.items];
    if (options.toggleMode) {
      toggleButton = document.createElement('button');
      toggleButton.type = 'button';
      toggleButton.innerHTML = '+';
      toggleButton.title = 'Toggle between Add and Remove mode';
      toggleButton.style.marginLeft = '6px';
      toggleButton.style.width = '20px';
      toggleButton.style.height = '20px';
      toggleButton.style.display = 'flex';
      toggleButton.style.alignItems = 'center';
      toggleButton.style.justifyContent = 'center';
      toggleButton.style.border = '1px solid #ccc';
      toggleButton.style.borderRadius = '50%';
      toggleButton.style.backgroundColor = '#28a745';
      toggleButton.style.color = 'white';
      toggleButton.style.fontSize = '14px';
      toggleButton.style.fontWeight = 'bold';
      toggleButton.style.cursor = 'pointer';
      toggleButton.style.padding = '0';
      toggleButton.style.lineHeight = '1';
      toggleButton.addEventListener('click', () => {
        isAddMode = !isAddMode;
        if (isAddMode) {
          toggleButton.innerHTML = '+';
          toggleButton.style.backgroundColor = '#28a745';
          toggleButton.title = 'Switch to Remove mode';
        } else {
          toggleButton.innerHTML = '−';
          toggleButton.style.backgroundColor = '#dc3545';
          toggleButton.title = 'Switch to Add mode';
        }
        if (dropdown.options.length > 0) {
          if (options.type === 'label') {
            dropdown.options[0].text = isAddMode ? 'Add Label' : 'Remove Label';
          } else if (options.type === 'assign') {
            dropdown.options[0].text = isAddMode ? 'Assign to...' : 'Unassign from...';
          }
        }
        dropdown.dataset.mode = isAddMode ? 'add' : 'remove';
      });
      labelContainer.appendChild(toggleButton);
    }
    const dropdownContainer = document.createElement('div');
    dropdownContainer.style.flex = '1';
    dropdownContainer.style.position = 'relative';
    dropdownContainer.style.height = '24px';
    dropdownContainer.style.marginLeft = '10px';
    const dropdown = document.createElement('select');
    dropdown.className = `${options.type}-dropdown`;
    dropdown.style.width = '100%';
    dropdown.style.height = '100%';
    dropdown.style.appearance = 'auto';
    dropdown.style.padding = '0 25px 0 8px';
    dropdown.style.fontSize = '13px';
    dropdown.style.border = '1px solid #ccc';
    dropdown.style.borderRadius = '4px';
    dropdown.style.backgroundColor = '#fff';
    dropdown.style.boxSizing = 'border-box';
    dropdown.dataset.mode = 'add';
    const placeholderOption = document.createElement('option');
    placeholderOption.value = '';
    placeholderOption.textContent = options.items[0]?.label || 'Select...';
    placeholderOption.selected = true;
    dropdown.appendChild(placeholderOption);
    if (options.items && options.items.length > 0) {
      options.items.forEach((item, index) => {
        if (index === 0) return;
        const option = document.createElement('option');
        option.value = item.value;
        option.textContent = item.label;
        dropdown.appendChild(option);
      });
    }
    dropdown.addEventListener('change', e => {
      const selectedValue = e.target.value;
      if (selectedValue && options.onSelect) {
        const currentMode = dropdown.dataset.mode || 'add';
        options.onSelect(selectedValue, currentMode);
        e.target.value = '';
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
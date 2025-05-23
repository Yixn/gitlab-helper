export default class Notification {
  constructor(options = {}) {
    this.position = 'top-right';
    this.duration = options.duration || 3000;
    this.animationDuration = options.animationDuration || '0.3s';
    this.container = null;
    this.createContainer();
  }
  createContainer() {
    if (document.getElementById('gitlab-helper-notifications')) {
      this.container = document.getElementById('gitlab-helper-notifications');
      return;
    }
    this.container = document.createElement('div');
    this.container.id = 'gitlab-helper-notifications';
    this.container.style.position = 'fixed';
    this.container.style.zIndex = '100';
    switch (this.position) {
      case 'top-right':
        this.container.style.top = '120px';
        this.container.style.right = '20px';
        break;
      case 'top-left':
        this.container.style.top = '20px';
        this.container.style.left = '20px';
        break;
      case 'top-center':
        this.container.style.top = '20px';
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-left':
        this.container.style.bottom = '20px';
        this.container.style.left = '20px';
        break;
      case 'bottom-center':
        this.container.style.bottom = '20px';
        this.container.style.left = '50%';
        this.container.style.transform = 'translateX(-50%)';
        break;
      case 'bottom-right':
      default:
        this.container.style.bottom = '20px';
        this.container.style.right = '20px';
        break;
    }
    document.body.appendChild(this.container);
  }
  show(options) {
    const message = options.message || '';
    const type = options.type || 'info';
    const duration = options.duration || this.duration;
    const onClose = options.onClose || null;
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.style.padding = '12px 16px';
    notification.style.marginBottom = '10px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    notification.style.display = 'flex';
    notification.style.alignItems = 'center';
    notification.style.justifyContent = 'space-between';
    notification.style.minWidth = '200px';
    notification.style.maxWidth = '350px';
    notification.style.opacity = '0';
    notification.style.transform = this.getInitialTransform();
    notification.style.transition = `opacity ${this.animationDuration} ease, transform ${this.animationDuration} ease`;
    switch (type) {
      case 'success':
        notification.style.backgroundColor = '#28a745';
        break;
      case 'error':
        notification.style.backgroundColor = '#dc3545';
        break;
      case 'warning':
        notification.style.backgroundColor = '#ffc107';
        notification.style.color = 'black';
        break;
      default:
        notification.style.backgroundColor = '#17a2b8';
    }
    notification.style.color = notification.style.color || 'white';
    const messageContainer = document.createElement('div');
    messageContainer.style.flex = '1';
    messageContainer.textContent = message;
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '&times;';
    closeButton.style.backgroundColor = 'transparent';
    closeButton.style.border = 'none';
    closeButton.style.color = notification.style.color;
    closeButton.style.fontSize = '18px';
    closeButton.style.marginLeft = '10px';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 5px';
    closeButton.style.opacity = '0.7';
    closeButton.style.transition = 'opacity 0.2s ease';
    closeButton.style.outline = 'none';
    closeButton.addEventListener('mouseenter', () => closeButton.style.opacity = '1');
    closeButton.addEventListener('mouseleave', () => closeButton.style.opacity = '0.7');
    closeButton.addEventListener('click', () => this.close(notification, onClose));
    notification.appendChild(messageContainer);
    notification.appendChild(closeButton);
    this.container.appendChild(notification);
    setTimeout(() => {
      notification.style.opacity = '1';
      notification.style.transform = 'translateY(0)';
    }, 10);
    if (duration > 0) {
      setTimeout(() => this.close(notification, onClose), duration);
    }
    return notification;
  }
  close(notification, callback = null) {
    if (notification.dataset.closing === 'true') {
      return;
    }
    notification.dataset.closing = 'true';
    notification.style.opacity = '0';
    notification.style.transform = this.getInitialTransform();
    setTimeout(() => {
      if (notification.parentNode === this.container) {
        this.container.removeChild(notification);
      }
      if (callback && typeof callback === 'function') {
        callback();
      }
    }, parseFloat(this.animationDuration) * 1000);
  }
  getInitialTransform() {
    if (this.position.startsWith('top')) {
      return 'translateY(-20px)';
    } else {
      return 'translateY(20px)';
    }
  }
  success(message, options = {}) {
    return this.show({
      message,
      type: 'success',
      ...options
    });
  }
  error(message, options = {}) {
    return this.show({
      message,
      type: 'error',
      ...options
    });
  }
  warning(message, options = {}) {
    return this.show({
      message,
      type: 'warning',
      ...options
    });
  }
  info(message, options = {}) {
    return this.show({
      message,
      type: 'info',
      ...options
    });
  }
}
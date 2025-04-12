// Notification.js - Toast notification component

/**
 * Create and show toast notifications
 */
export default class Notification {
    /**
     * Constructor
     * @param {Object} options - Configuration options
     * @param {string} options.position - Position of notification (default: 'bottom-right')
     * @param {number} options.duration - Duration in ms (default: 3000)
     * @param {string} options.animationDuration - Animation duration (default: '0.3s')
     */
    constructor(options = {}) {
        this.position = options.position || 'bottom-right';
        this.duration = options.duration || 3000;
        this.animationDuration = options.animationDuration || '0.3s';
        this.container = null;

        // Initialize container
        this.createContainer();
    }

    /**
     * Create notification container
     */
    createContainer() {
        // Check if container already exists
        if (document.getElementById('gitlab-helper-notifications')) {
            this.container = document.getElementById('gitlab-helper-notifications');
            return;
        }

        // Create container based on position
        this.container = document.createElement('div');
        this.container.id = 'gitlab-helper-notifications';
        this.container.style.position = 'fixed';
        this.container.style.zIndex = '10000';

        // Set position styling
        switch (this.position) {
            case 'top-right':
                this.container.style.top = '20px';
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

        // Add container to document
        document.body.appendChild(this.container);
    }

    /**
     * Show a notification
     * @param {Object} options - Notification options
     * @param {string} options.message - Notification message
     * @param {string} options.type - Notification type (success, error, warning, info)
     * @param {number} options.duration - Duration in ms (optional)
     * @param {Function} options.onClose - Callback on close (optional)
     * @returns {HTMLElement} Notification element
     */
    show(options) {
        // Get options
        const message = options.message || '';
        const type = options.type || 'info';
        const duration = options.duration || this.duration;
        const onClose = options.onClose || null;

        // Create notification element
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

        // Set color based on type
        switch (type) {
            case 'success':
                notification.style.backgroundColor = '#28a745';
                notification.style.color = 'white';
                break;
            case 'error':
                notification.style.backgroundColor = '#dc3545';
                notification.style.color = 'white';
                break;
            case 'warning':
                notification.style.backgroundColor = '#ffc107';
                notification.style.color = 'black';
                break;
            case 'info':
            default:
                notification.style.backgroundColor = '#17a2b8';
                notification.style.color = 'white';
                break;
        }

        // Add message
        const messageContainer = document.createElement('div');
        messageContainer.style.flex = '1';
        messageContainer.textContent = message;

        // Add close button
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

        // Hover effect for close button
        closeButton.addEventListener('mouseenter', () => {
            closeButton.style.opacity = '1';
        });

        closeButton.addEventListener('mouseleave', () => {
            closeButton.style.opacity = '0.7';
        });

        // Close notification on click
        closeButton.addEventListener('click', () => {
            this.close(notification, onClose);
        });

        // Add elements to notification
        notification.appendChild(messageContainer);
        notification.appendChild(closeButton);

        // Add notification to container
        this.container.appendChild(notification);

        // Trigger animation
        setTimeout(() => {
            notification.style.opacity = '1';
            notification.style.transform = 'translateY(0)';
        }, 10);

        // Auto-close after duration
        if (duration > 0) {
            setTimeout(() => {
                this.close(notification, onClose);
            }, duration);
        }

        return notification;
    }

    /**
     * Close a notification
     * @param {HTMLElement} notification - Notification element
     * @param {Function} callback - Callback function
     */
    close(notification, callback = null) {
        // Skip if already animating out
        if (notification.dataset.closing === 'true') {
            return;
        }

        // Mark as closing
        notification.dataset.closing = 'true';

        // Animate out
        notification.style.opacity = '0';
        notification.style.transform = this.getInitialTransform();

        // Remove after animation
        setTimeout(() => {
            if (notification.parentNode === this.container) {
                this.container.removeChild(notification);
            }

            // Call callback if provided
            if (callback && typeof callback === 'function') {
                callback();
            }
        }, parseFloat(this.animationDuration) * 1000);
    }

    /**
     * Get initial transform based on position
     * @returns {string} Transform value
     */
    getInitialTransform() {
        // Different animations based on position
        if (this.position.startsWith('top')) {
            return 'translateY(-20px)';
        } else {
            return 'translateY(20px)';
        }
    }

    /**
     * Show a success notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    success(message, options = {}) {
        return this.show({
            message,
            type: 'success',
            ...options
        });
    }

    /**
     * Show an error notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    error(message, options = {}) {
        return this.show({
            message,
            type: 'error',
            ...options
        });
    }

    /**
     * Show a warning notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    warning(message, options = {}) {
        return this.show({
            message,
            type: 'warning',
            ...options
        });
    }

    /**
     * Show an info notification
     * @param {string} message - Notification message
     * @param {Object} options - Additional options
     * @returns {HTMLElement} Notification element
     */
    info(message, options = {}) {
        return this.show({
            message,
            type: 'info',
            ...options
        });
    }

    /**
     * Clear all notifications
     */
    clearAll() {
        while (this.container.firstChild) {
            this.container.removeChild(this.container.firstChild);
        }
    }
}
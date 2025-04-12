// ==UserScript==
// @name         GitLab Sprint Helper
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Display a summary of assignees' time estimates on GitLab boards with API integration and comment shortcuts
// @author       You
// @match        https://gitlab.com/*/boards/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// @downloadURL  https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// ==/UserScript==

(function () {
    'use strict';

    function setupGlobalReferences() {
        // Expose classes globally to ensure they're available
        window.LabelManager = LabelManager;
        window.AssigneeManager = AssigneeManager;
        window.SettingsManager = SettingsManager;
        window.CommandShortcut = CommandShortcut;
        window.Notification = Notification;

        // Ensure gitlabApi is globally available
        if (!window.gitlabApi && typeof GitLabAPI === 'function') {
            try {
                window.gitlabApi = new GitLabAPI();
            } catch (e) {
                console.error('Error creating global gitlabApi:', e);
            }
        }
    }

    setupGlobalReferences();
    /**
     * This file is the main entry point for the GitLab Sprint Helper userscript.
     * After refactoring, most of the actual code has been moved to modular files in the lib/ directory.
     * This file now just serves as the entry point that loads the library modules and exports the API.
     */

        // Reference to exported functions from our library
        // These will be populated by the build process
    const {
            gitlabApi,
            updateSummary,
            checkAndInit,
            waitForBoards,
            processBoards,
            renderHistory
        } = window; // When bundled, our library will expose these on window

    // Initial check for board page and initialize UI
    checkAndInit();

    // Expose functions globally for easier debugging
    window.gitlabHelper = {
        updateSummary,
        gitlabApi,
        processBoards,
        renderHistory
    };
})();
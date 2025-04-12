// ==UserScript==
// @name         GitLab Sprint Helper
// @namespace    http://tampermonkey.net/
// @version      1.3
// @description  Display a summary of assignees' time estimates on GitLab boards with API integration and comment shortcuts
// @author       Daniel Samer | Linkster
// @match        https://gitlab.com/*/boards/*
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-idle
// @updateURL    https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// @downloadURL  https://gitlab.com/daniel_linkster/gitlab-helper/-/raw/main/dist/gitlab-sprint-helper.js
// ==/UserScript==

(function () {
    'use strict';

    // Setup global class references to ensure they're available
    function setupGlobalReferences() {
        // These will be handled by the build process that combines all files
        // No need to duplicate declarations here
    }

    /**
     * This file is the main entry point for the GitLab Sprint Helper userscript.
     * Most of the code has been moved to modular files in the lib/ directory.
     * This file just ensures the initialization is done only once.
     */

    // No need to directly call functions here since lib/index.js
    // already handles initialization when bundled
})();
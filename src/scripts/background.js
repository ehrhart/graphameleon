/*
 * Copyright (c) 2022-2023 Orange. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 *     1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *     2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *     3. All advertising materials mentioning features or use of this software must display the following acknowledgement:
 *     This product includes software developed by Orange.
 *     4. Neither the name of Orange nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY Orange "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL Orange BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

console.log("Background script is running.")

/*
Background script:

- Running when the extension tab is active
- Communicates by message with the UI, content scripts
- Works as a communication hub to manage:
    1. User interactions with the extension
    2. Content scripts injected in all tabs
    3. Request collection
- Manage data gathering, semantical mapping and graph construction
*/

// IMPORTANT (cross-browser compatitbily)
const browser = require('webextension-polyfill') // Handle cross-browser API compatibility
import { current_browser } from './utils/settings' // Retrieve which browser is currently used

import {
    MESSAGE_TYPE_AUTOMATION,
    COMMANDS,
} from './constants';

var browser_action = (current_browser == "firefox")
    ? browser.browserAction
    : browser.action

// Collect manager module
import CollectManager from './modules/Manager'
const manager = new CollectManager()

/*
Allows the extension to handle the automation commands sent by the page via the automation content script.
The background script listens for MESSAGE_TYPE_AUTOMATION messages, executes the corresponding command on the
manager module, and sends back a response indicating success or failure, along with any relevant data.
*/
browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    console.log("Received runtime message:", message);

    if (message.type === MESSAGE_TYPE_AUTOMATION) {
        const command = message.command;
        const data = message.data || {};

        console.log("Automation command:", command, "Data:", data);

        try {
            switch (command) {
                case COMMANDS.SET_PARAMS:
                    manager.params = { ...manager.params, ...data };
                    if (data.mode === "semantize" && data.rules) {
                        manager.mapper.setRules(data.rules);
                    }
                    sendResponse({ success: true, params: manager.params });
                    break;
                case COMMANDS.START:
                    manager.is_running = true;
                    manager.activate();
                    sendResponse({ success: true });
                    break;
                case COMMANDS.STOP:
                    manager.is_running = false;
                    manager.desactivate();
                    sendResponse({ success: true });
                    break;
                case COMMANDS.EXPORT:
                    manager.export();
                    sendResponse({ success: true });
                    break;
                case COMMANDS.RESET:
                    manager.reset();
                    if (manager.uiid) {
                        manager.update();
                        manager.updateGraph();
                    }
                    sendResponse({ success: true });
                    break;
                case COMMANDS.GET_STATUS:
                    sendResponse({
                        success: true,
                        isRunning: manager.is_running,
                        params: manager.params,
                        counters: manager.counters
                    });
                    break;
                case COMMANDS.GET_DATA:
                    let exportData = null;
                    if (manager.params.mode === "semantize") {
                        if (manager.params.format === "ttl") {
                            exportData = manager.mapper.format(manager.mapped, "text/turtle");
                        } else {
                            exportData = manager.mapped;
                        }
                    } else {
                        if (manager.params.format === "json") {
                            exportData = manager.traces;
                        } else if (manager.params.format === "csv") {
                            exportData = Papa.unparse(manager.traces);
                        } else {
                            exportData = manager.traces;
                        }
                    }
                    sendResponse({
                        success: true,
                        data: exportData,
                        counters: manager.counters,
                        params: manager.params
                    });
                    break;
                default:
                    sendResponse({ success: false, error: "Unknown command: " + command });
            }
        } catch (error) {
            console.error("Automation command error:", error);
            sendResponse({ success: false, error: error.message });
        }
    }

    return true;
});

/*
Allows the extension to handle the browser action click event and either activate an existing extension tab,
or create a new one if none exists. It ensures that only one extension tab is active at a time.
*/
let extensionTabId = null;
browser_action.onClicked.addListener(async (tab) => {
    if (extensionTabId) {
        try {
            // Extension tab already exists, focus on it
            const extensionTab = await browser.tabs.get(extensionTabId);
            await browser.tabs.update(extensionTabId, { active: true });
            await browser.windows.update(extensionTab.windowId, { focused: true });
        } catch (error) {
            // Extension tab no longer exists, create a new one
            extensionTabId = null;
        }
    } else {
        // Create an extension tab
        const tab = await browser.tabs.create({
            url: browser.runtime.getURL("index.html"),
            active: true,
        });
        extensionTabId = tab.id;
    }
});

/*
IMPORTANT:

When launching the extension, content scripts need to be injected in already active tabs.
By default, injections are not triggered by chrome based browsers (chrome, edge, chromium...).
Thus, we manually need to inject those content scripts.
*/
if (current_browser == "chrome" || current_browser == "edge") {
    chrome.runtime.onInstalled.addListener(function() {
        // Get all tabs and inject content script into each tab
        chrome.tabs.query({}, function(tabs) {
            for (var i = 0; i < tabs.length; i++) {
                //Execute content script
                chrome.scripting.executeScript({
                    target: {tabId: tabs[i].id},
                    files: ["content.js"]
                });
            }
        });
    });
}
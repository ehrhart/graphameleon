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

// Lightweight bridge for automation; listens for commands from the page and
// forwards them to the background script, then returns the response back to
// the page via DOM attributes.

import { delay } from './utils/tools'
import { MESSAGE_TYPE_AUTOMATION } from './constants'

console.log("Automation content script is running.")

const observer = new MutationObserver(muts => {
    muts.forEach(m => {
        m.addedNodes.forEach(node => {
            if (node.nodeName === 'GRAPHAMELEON-COMMAND') {
                handleCommand(node);
            }
        });
    });
});

if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
} else {
    document.addEventListener('DOMContentLoaded', () => {
        observer.observe(document.body, { childList: true, subtree: true });
    });
}

async function handleCommand(el) {
    const command = el.getAttribute('data-command');
    const encoded = el.getAttribute('data-data');

    let data = {};
    if (encoded) {
        try {
            data = JSON.parse(atob(encoded));
        } catch (e) {
            el.setAttribute('data-error', 'Invalid JSON data');
            el.setAttribute('data-status', 'error');
            return;
        }
    }

    try {
        const result = await sendWithRetry(
            { type: MESSAGE_TYPE_AUTOMATION, command, data }
        );
        el.setAttribute('data-result', JSON.stringify(result));
        el.setAttribute('data-status', 'complete');
    } catch (e) {
        el.setAttribute('data-error', e.message || String(e));
        el.setAttribute('data-status', 'error');
    }
}

async function sendWithRetry(message, maxRetries = 5, delayMs = 500) {
    let lastErr;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const result = await new Promise((resolve, reject) => {
                const timer = setTimeout(() => reject(new Error('sendMessage timeout')), 10000);
                chrome.runtime.sendMessage(message, resp => {
                    clearTimeout(timer);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else if (resp === undefined) {
                        reject(new Error('No response from background script'));
                    } else {
                        resolve(resp);
                    }
                });
            });
            if (result && !result.success
                && result.error === 'Extension is still initializing, please retry') {
                await delay(delayMs);
                continue;
            }
            return result;
        } catch (e) {
            lastErr = e;
            if (attempt < maxRetries) await delay(delayMs);
        }
    }
    throw lastErr || new Error('Max retries exceeded');
}

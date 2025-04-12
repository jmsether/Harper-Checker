document.addEventListener('DOMContentLoaded', () => {
  const debugToggle = document.getElementById('toggleDebug');
  const autoCorrectToggle = document.getElementById('toggleAutoCorrect');
  const debugMessagesToggle = document.getElementById('toggleDebugMessages'); // Added

  // Load saved toggle states
  chrome.storage.local.get(['showDebugBorder', 'autoCorrectEnabled', 'showDebugMessages'], (data) => { // Added 'showDebugMessages'
    debugToggle.checked = data.showDebugBorder ?? false; // default OFF
    autoCorrectToggle.checked = data.autoCorrectEnabled ?? false; // default OFF
    debugMessagesToggle.checked = data.showDebugMessages ?? false; // Added, default OFF
  });

  // Debug border toggle handler
  debugToggle.addEventListener('change', () => {
    const enabled = debugToggle.checked;
    chrome.storage.local.set({ showDebugBorder: enabled });

    // Notify all tabs to update debug border visibility
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'toggle-debug-border',
          enabled: enabled
        }).catch((error) => {
          // Ignore errors if no content script is present in the tab
        });
      }
    });
  });

  // Auto-correct toggle handler
  autoCorrectToggle.addEventListener('change', () => {
    const enabled = autoCorrectToggle.checked;
    chrome.storage.local.set({ autoCorrectEnabled: enabled });

    // Notify all tabs about the auto-correct setting change
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'toggle-auto-correct',
          enabled: enabled
        }).catch((error) => {
          // Ignore errors if no content script is present in the tab
        });
      }
    });
  });

  // Debug messages toggle handler - Added
  debugMessagesToggle.addEventListener('change', () => {
    const enabled = debugMessagesToggle.checked;
    chrome.storage.local.set({ showDebugMessages: enabled });

    // Notify all tabs about the debug messages setting change
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'toggle-debug-messages',
          enabled: enabled
        }).catch((error) => {
          // Ignore errors if no content script is present in the tab
        });
      }
    });
  });
});

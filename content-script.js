// Import the WebAssembly glue module for Harper.
// This must be at the very top so that harperExports is defined.
import * as harperExports from './harper/harper_wasm.js';

// ============================================================================
// Global Variables & Initialization
// ============================================================================

// Global map to store error details for each element.
window._harperErrorMap = new Map();

// Auto-correction feature state
window._autoCorrectEnabled = false;
window._lastAutoCorrection = null; // Tracks the most recent auto-correction for potential reversion

// Debug message state
window._showDebugMessages = false; // Added, default OFF

// Asynchronously initialize the Harper module.
// Loads the WebAssembly module, runs any setup, and creates a linter instance.
window.harperReady = (async () => {
  try {
    // Load the Harper WebAssembly module.
    const harper = await harperExports.default();
    // Expose the module exports globally so that other functions can use them.
    window.harper = harperExports;
    // Perform any necessary setup (initialize internal state, etc.).
    harperExports.setup();
    // Create a new Linter instance; using American as the default dialect.
    window.harperLinter = harperExports.Linter.new(harperExports.Dialect.American);
  } catch (e) {
    console.error('Failed to initialize Harper:', e); // Keep this as console.error - essential error
  }
})();

// ============================================================================
// Debug Logging Helper Functions
// ============================================================================

function debugLog(...args) {
  if (window._showDebugMessages) {
    console.log(...args);
  }
}

function debugWarn(...args) {
  if (window._showDebugMessages) {
    console.warn(...args);
  }
}

function debugError(...args) {
  if (window._showDebugMessages) {
    console.error(...args);
  }
}


// ============================================================================
// Text Analysis & Error Handling Functions
// ============================================================================

/**
 * Analyze the provided text using the Harper linter.
 * @param {string} text - The text to analyze.
 * @returns {Promise<Array>} - A promise that resolves to an array of error objects.
 */
async function analyzeText(text) {
  await window.harperReady; // Wait for the initialization.
  if (!window.harperLinter || typeof window.harperLinter.lint !== 'function') {
    console.warn('Harper not loaded yet');
    return [];
  }
  if (text.trim().length === 0) return [];
  try {
    // Analyze the text in "plain" mode.
    return window.harperLinter.lint(text, window.harper.Language.Plain);
  } catch (e) {
    console.error('Harper lint failed:', e); // Keep this as console.error - essential error
    return [];
  }
}

/**
 * Get the underline color for an error, based on its type.
 * @param {string} kindRaw - The raw error type.
 * @returns {string} - The corresponding color string.
 */
function getErrorColor(kindRaw) {
  let color = 'gray';
  const kind = kindRaw.toLowerCase();
  if (kind.includes('spell')) color = 'red';
  else if (kind.includes('word')) color = 'green';
  else if (kind.includes('style')) color = 'orange';
  else if (kind.includes('repetition')) color = 'blue';
  return color;
}

/**
 * Render error highlights on the element using an overlay approach that doesn't affect cursor position.
 * For both contenteditable elements and inputs/textareas, we use an overlay div to show error highlights.
 *
 * @param {HTMLElement} element - The target element.
 * @param {string} text - The current text content of the element.
 * @param {Array} errors - An array of error objects returned by the linter.
 */
function renderErrors(element, text, errors) {
  // Ensure the element has an overlay
  ensureOverlay(element);
  
  if (!element._harperOverlay) {
    // Fallback: Use an outline if overlay creation failed
    element.style.outline = errors.length > 0 ? '2px solid red' : '';
    return;
  }
  
  // Sort errors from end to start to avoid position shifts
  errors.sort((a, b) => b.span().start - a.span().start);
  
  // Create HTML with error spans
  let html = text;
  errors.forEach(error => {
    const span = error.span();
    const color = getErrorColor(error.lint_kind());
    
    // Encode suggestions into a data attribute for later retrieval
    const suggestionsJson = encodeURIComponent(
      JSON.stringify(error.suggestions().map(s => s.get_replacement_text()))
    );
    
    // Construct a span tag that highlights the error
    const spanHtml = `<span class="harper-error"
      style="text-decoration: underline; text-decoration-color: ${color}; text-decoration-style: solid;"
      data-suggestions="${suggestionsJson}"
      data-start="${span.start}" data-end="${span.end}">` +
      text.slice(span.start, span.end) +
      `</span>`;
    
    html = html.slice(0, span.start) + spanHtml + html.slice(span.end);
  });
  
  // Update the overlay's content
  element._harperOverlay.innerHTML = html;
  
  // Synchronize the overlay with the element
  syncOverlay(element);
}

/**
 * Get the caret position (number of characters) in a contenteditable element.
 * @param {HTMLElement} element - The contenteditable element.
 * @returns {number} - The caret position.
 */
function getCaretPositionContentEditable(element) {
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const preRange = range.cloneRange();
    preRange.selectNodeContents(element);
    preRange.setEnd(range.endContainer, range.endOffset);
    return preRange.toString().length;
  }
  return 0;
}
// We no longer need cursor position management since our new approach doesn't affect cursor position

// ============================================================================
// Tooltip Creation & Display Functions
// ============================================================================

/**
 * Create or return an existing tooltip element used for displaying suggestions.
 * @returns {HTMLElement} - The tooltip element.
 */
/**
 * Create or return an existing tooltip element used for displaying suggestions.
 * This implementation ensures the tooltip is always visible and properly positioned.
 * @returns {HTMLElement} - The tooltip element.
 */
function getTooltip() {
  // Return existing tooltip if available
  if (window.harperTooltip) return window.harperTooltip;
  
  try {
    // Create tooltip element
    const tooltip = document.createElement('div');
    tooltip.classList.add('harper-tooltip');
    
    // Style the tooltip for maximum visibility
    tooltip.style.position = 'fixed';
    tooltip.style.background = '#333';
    tooltip.style.color = '#fff';
    tooltip.style.padding = '8px';
    tooltip.style.borderRadius = '4px';
    tooltip.style.fontSize = '14px';
    tooltip.style.zIndex = '2147483647'; // Maximum z-index
    tooltip.style.display = 'none';
    tooltip.style.flexDirection = 'column';
    tooltip.style.border = '1px solid #ccc';
    tooltip.style.maxWidth = '300px';
    tooltip.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    tooltip.style.cursor = 'default';
    tooltip.style.userSelect = 'none';
    tooltip.style.fontFamily = 'Arial, sans-serif';
    
    // Add to document in a way that ensures it's always on top
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.top = '0';
    container.style.left = '0';
    container.style.width = '0';
    container.style.height = '0';
    container.style.overflow = 'visible';
    container.style.zIndex = '2147483647';
    container.appendChild(tooltip);
    
    // Append to document body or create a new shadow DOM
    try {
      // Try to use shadow DOM for better isolation
      const host = document.createElement('div');
      host.style.all = 'initial';
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });
      shadowRoot.appendChild(container);
    } catch (e) {
      // Fallback to regular DOM
      document.body.appendChild(container);
    }
    
    window.harperTooltip = tooltip;
    
    // Hide the tooltip when clicking elsewhere
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.harper-tooltip')) {
        tooltip.style.display = 'none';
      }
    }, { capture: true, passive: false }); // Cannot be passive as it may need to prevent default behavior
    
    // When the mouse enters the tooltip, cancel any hide timeout
    tooltip.addEventListener('mouseenter', () => {
      if (window._harperTooltipHideTimeout) {
        clearTimeout(window._harperTooltipHideTimeout);
        window._harperTooltipHideTimeout = null;
      }
    });
    
    // When the mouse leaves the tooltip, hide it after a delay
    tooltip.addEventListener('mouseleave', (e) => {
      if (e.relatedTarget && e.relatedTarget.closest('.harper-tooltip, .harper-error')) {
        return;
      }
      window._harperTooltipHideTimeout = setTimeout(() => {
        tooltip.style.display = 'none';
      }, 500);
    });
    
    return tooltip;
  } catch (e) {
    console.error('Error creating tooltip:', e); // Keep this as console.error - essential error
    // Create a minimal fallback tooltip
    const fallbackTooltip = document.createElement('div');
    fallbackTooltip.style.display = 'none';
    document.body.appendChild(fallbackTooltip);
    window.harperTooltip = fallbackTooltip;
    return fallbackTooltip;
  }
}

/**
 * Show the tooltip at the mouseover position with correction suggestions.
 * @param {Event} e - The triggering mouse event.
 * @param {HTMLElement} element - The element containing the error.
 * @param {Object} error - The error object with properties start, end, and suggestions.
 */
/**
 * Show the tooltip with correction suggestions.
 * This implementation ensures proper positioning and visibility.
 * @param {Event} e - The triggering mouse event.
 * @param {HTMLElement} element - The element containing the error.
 * @param {Object} error - The error object with properties start, end, and suggestions.
 */
function showTooltip(e, element, error) {
  try {
    const tooltip = getTooltip();
    
    // Clear any existing hide timeout
    if (window._harperTooltipHideTimeout) {
      clearTimeout(window._harperTooltipHideTimeout);
      window._harperTooltipHideTimeout = null;
    }
    
    // Clear existing content
    tooltip.innerHTML = '';
    
    // Add a title to the tooltip
    const title = document.createElement('div');
    title.textContent = 'Suggestions:';
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '5px';
    title.style.borderBottom = '1px solid #555';
    title.style.paddingBottom = '3px';
    tooltip.appendChild(title);
    
    // Get the original text and word
    const originalText = element.matches('[contenteditable="true"]') ? element.innerText : element.value;
    const originalWord = originalText.slice(error.start, error.end);
    
    // If no suggestions, show a message
    if (!error.suggestions || error.suggestions.length === 0) {
      const noSuggestions = document.createElement('div');
      noSuggestions.textContent = 'No suggestions available';
      noSuggestions.style.padding = '4px 8px';
      noSuggestions.style.fontStyle = 'italic';
      tooltip.appendChild(noSuggestions);
    } else {
      // Add each suggestion as a button
      error.suggestions.forEach(suggestion => {
        let displayText = suggestion;
        let replacementText = suggestion;
        
        // If suggestion is punctuation, append to the original word
        if (/^[.,;:!?]+$/.test(suggestion)) {
          displayText = originalWord + suggestion;
          replacementText = originalWord + suggestion;
        }
        
        const btn = document.createElement('button');
        btn.textContent = displayText;
        btn.style.background = '#444';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '3px';
        btn.style.margin = '2px 0';
        btn.style.padding = '6px 10px';
        btn.style.cursor = 'pointer';
        btn.style.fontSize = '14px';
        btn.style.width = '100%';
        btn.style.textAlign = 'left';
        
        // Hover effect
        btn.addEventListener('mouseover', () => {
          btn.style.background = '#555';
        }, { passive: true });
        btn.addEventListener('mouseout', () => {
          btn.style.background = '#444';
        }, { passive: true });
        
        // Click handler
        btn.addEventListener('click', () => {
          applyTextReplacement(element, error.start, error.end, replacementText);
          tooltip.style.display = 'none';
          processElement(element);
        }, { passive: true }); // This can be passive as it doesn't prevent default
        
        tooltip.appendChild(btn);
      });
    }
    
    // Make tooltip visible
    tooltip.style.display = 'flex';
    tooltip.style.flexDirection = 'column';
    
    // Position the tooltip - ensure it's visible within viewport
    positionTooltip(tooltip, e);
  } catch (e) {
    console.error('Error showing tooltip:', e); // Keep this as console.error - essential error
  }
}

/**
 * Position the tooltip to ensure it's visible within the viewport.
 * @param {HTMLElement} tooltip - The tooltip element.
 * @param {Event} e - The triggering mouse event.
 */
function positionTooltip(tooltip, e) {
  // Default position at mouse pointer
  let left = e.clientX + 10;
  let top = e.clientY + 10;
  
  // Get tooltip dimensions after it's visible
  const rect = tooltip.getBoundingClientRect();
  
  // Check if tooltip would go off-screen
  if (left + rect.width > window.innerWidth) {
    left = window.innerWidth - rect.width - 10;
  }
  
  if (top + rect.height > window.innerHeight) {
    top = window.innerHeight - rect.height - 10;
  }
  
  // Ensure tooltip is not positioned off-screen
  left = Math.max(10, left);
  top = Math.max(10, top);
  
  // Apply position
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

/**
 * Apply a text replacement to an element.
 * @param {HTMLElement} element - The element to modify.
 * @param {number} start - The start index of the text to replace.
 * @param {number} end - The end index of the text to replace.
 * @param {string} replacementText - The text to insert.
 */
function applyTextReplacement(element, start, end, replacementText) {
  try {
    if (element.matches('[contenteditable="true"]')) {
      const oldText = element.innerText;
      if (isNaN(start) || isNaN(end)) {
         console.error("Invalid start/end indices for replacement:", start, end); // Keep this as console.error - essential error
         return; // Don't proceed if indices are invalid
      }
      
      const newText = oldText.slice(0, start) + replacementText + oldText.slice(end);
      element.innerText = newText;

      // --- Cursor Positioning for contenteditable ---
      // Place cursor reliably after the replacement
      if (document.activeElement === element) {
        const newPos = start + replacementText.length;
        const selection = window.getSelection();
        const range = document.createRange();
        
        // Find the text node and offset corresponding to newPos
        let charCount = 0;
        let targetNode = null;
        let targetOffset = 0;
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
        while(walker.nextNode()) {
          const node = walker.currentNode;
          const nextCharCount = charCount + node.nodeValue.length;
          if (newPos <= nextCharCount) {
            targetNode = node;
            targetOffset = newPos - charCount;
            break; // Found the node
          }
          charCount = nextCharCount;
        }

        // If we found a node, set the cursor
        if (targetNode) {
          try {
            range.setStart(targetNode, targetOffset);
            range.collapse(true); // Collapse the range to a single point
            selection.removeAllRanges(); // Remove existing selections
            selection.addRange(range); // Add the new cursor position
          } catch (err) {
             console.error("Error setting cursor position in contenteditable:", err); // Keep this as console.error - essential error
          }
        } else {
           console.warn("Could not find target node for cursor positioning in contenteditable."); // Keep this as console.warn - important warning
           // Fallback: try setting cursor at the end of the element
           try {
             range.selectNodeContents(element);
             range.collapse(false); // Collapse to the end
             selection.removeAllRanges();
             selection.addRange(range);
           } catch (fallbackErr) {
             console.error("Fallback cursor positioning failed:", fallbackErr); // Keep this as console.error - essential error
           }
        }
      }
    } else { // Input or Textarea
      const oldText = element.value;
      if (isNaN(start) || isNaN(end)) {
         console.error("Invalid start/end indices for replacement:", start, end); // Keep this as console.error - essential error
         return; // Don't proceed if indices are invalid
      }
      
      const newText = oldText.slice(0, start) + replacementText + oldText.slice(end);
      element.value = newText;
        
      // If element is focused, update selection
      if (document.activeElement === element) {
        const newPos = start + replacementText.length;
        // Use try-catch for robustness, though less likely to fail here
        try {
          element.selectionStart = newPos;
          element.selectionEnd = newPos;
        } catch (err) {
           console.error("Error setting cursor position in input/textarea:", err); // Keep this as console.error - essential error
        }
      }
    }
  } catch (e) {
    console.error('Error applying text replacement:', e); // Keep this as console.error - essential error
  }
}

// ============================================================================
// Element Processing and Overlay Functions
// ============================================================================

/**
 * Process an element by analyzing its text, rendering error highlights,
 * and saving error details for later use (e.g., for tooltips).
 * @param {HTMLElement} element - The element to process.
 * @param {boolean} fromSuggestion - Whether this processing is triggered from a suggestion click.
 */
async function processElement(element) {
  let text = element.matches('[contenteditable="true"]')
    ? (element.innerText || element.textContent || '')
    : (element.value || '');
  
  const errors = await analyzeText(text);
  
  // Store error details for later use (e.g., for tooltips)
  window._harperErrorMap.set(
    element,
    errors.map(e => ({
      start: e.span().start,
      end: e.span().end,
      suggestions: e.suggestions().map(s => s.get_replacement_text())
    }))
  );
  
  // Render errors using our new approach that doesn't affect cursor position
  renderErrors(element, text, errors);
}
/**
 * Ensure that an element has an overlay for rendering error highlights.
 * This works for both contenteditable elements and inputs/textareas.
 * @param {HTMLElement} element - The element to create an overlay for.
 */
function ensureOverlay(element) {
  // If overlay already exists, just return
  if (element._harperOverlay) return;
  
  try {
    const overlay = document.createElement('div');
    overlay.className = 'harper-overlay';
    overlay.style.position = 'absolute';
    overlay.style.pointerEvents = 'none'; // Don't interfere with user interaction
    overlay.style.whiteSpace = 'pre-wrap';
    overlay.style.wordWrap = 'break-word';
    overlay.style.zIndex = '9999';
    overlay.style.overflow = 'hidden';
    overlay.style.background = 'transparent';
    overlay.style.color = 'transparent'; // Text is transparent, only decorations are visible
    
    // Store reference to the overlay
    element._harperOverlay = overlay;
    
    // Ensure parent has relative positioning for proper overlay positioning
    const parent = element.parentNode;
    if (parent) {
      const parentPosition = window.getComputedStyle(parent).position;
      if (parentPosition === 'static') {
        parent.style.position = 'relative';
      }
      parent.appendChild(overlay);
    } else {
      // Fallback if no parent
      document.body.appendChild(overlay);
    }
    
    // Initial sync
    syncOverlay(element);
    // Set up event listeners for keeping the overlay in sync
    element.addEventListener('input', () => syncOverlay(element), { passive: true });
    element.addEventListener('scroll', () => syncOverlay(element), { passive: true });
    element.addEventListener('focus', () => syncOverlay(element), { passive: true });
    element.addEventListener('blur', () => syncOverlay(element), { passive: true });
    window.addEventListener('resize', () => syncOverlay(element), { passive: true });
    
    
    // For contenteditable elements, we need additional sync on selection change
    if (element.matches('[contenteditable="true"]')) {
      document.addEventListener('selectionchange', () => {
        if (document.activeElement === element) {
          syncOverlay(element);
        }
      }, { passive: true });
    }
  } catch (e) {
    console.error('Error creating overlay:', e); // Keep this as console.error - essential error
  }
}

/**
 * Synchronize the overlay with its target element.
 * @param {HTMLElement} element - The element with an overlay.
 */
function syncOverlay(element) {
  const overlay = element._harperOverlay;
  if (!overlay) return;
  
  try {
    const rect = element.getBoundingClientRect();
    const parentRect = element.parentNode.getBoundingClientRect();
    
    // Position relative to parent
    overlay.style.left = `${element.offsetLeft}px`;
    overlay.style.top = `${element.offsetTop}px`;
    overlay.style.width = `${element.offsetWidth}px`;
    overlay.style.height = `${element.offsetHeight}px`;
    
    // Copy relevant styles
    const computed = window.getComputedStyle(element);
    overlay.style.font = computed.font;
    overlay.style.padding = computed.padding;
    overlay.style.boxSizing = computed.boxSizing;
    overlay.style.lineHeight = computed.lineHeight;
    overlay.style.textAlign = computed.textAlign;
    overlay.style.direction = computed.direction;
    overlay.style.writingMode = computed.writingMode;
    
    // Handle scrolling
    overlay.scrollTop = element.scrollTop;
    overlay.scrollLeft = element.scrollLeft;
    
    // Debug border if enabled
    if (window._showDebugBorder === false) {
      overlay.style.border = 'none';
    } else {
      overlay.style.border = computed.border;
    }
  } catch (e) {
    console.error('Error syncing overlay:', e); // Keep this as console.error - essential error
  }
}

/**
 * Attach a contextmenu (right-click) event listener to the element.
 * If the caret is over an error, show the tooltip.
 * This implementation uses multiple approaches to ensure reliability.
 * @param {HTMLElement} element - The element to attach the listener to.
 */
function attachContextMenu(element) {
  // Store a reference to the element for use in the global handler
  if (!element._harperContextMenuAttached) {
    element._harperContextMenuAttached = true;
    
    // Add the element to a global registry for the document-level handler
    if (!window._harperElements) {
      window._harperElements = new Set();
    }
    window._harperElements.add(element);
    
    // Primary approach: Direct contextmenu listener with capture
    element.addEventListener(
      'contextmenu',
      function(e) {
        handleContextMenu(e, element);
      },
      { capture: true, passive: false } // Cannot be passive as handleContextMenu calls preventDefault
    );
    
    // Secondary approach: mouseup + keydown for when contextmenu is blocked
    element.addEventListener('mouseup', function(e) {
      // Right mouse button
      if (e.button === 2) {
        setTimeout(() => handleContextMenu(e, element), 10);
      }
    });
    
    // For mobile support
    let touchTimeout;
    // Note: touchstart cannot be passive because handleContextMenu may need to call preventDefault
    element.addEventListener('touchstart', function(e) {
      if (touchTimeout) clearTimeout(touchTimeout);
      touchTimeout = setTimeout(() => {
        handleContextMenu(e, element);
      }, 800); // Long press
    });
    
    element.addEventListener('touchend', function() {
      if (touchTimeout) clearTimeout(touchTimeout);
    }, { passive: true });
    
    element.addEventListener('touchmove', function() {
      if (touchTimeout) clearTimeout(touchTimeout);
    }, { passive: true });
  }
}

/**
 * Handle a context menu event on an element.
 * @param {Event} e - The triggering event.
 * @param {HTMLElement} element - The element to check for errors.
 */
function handleContextMenu(e, element) {
  try {
    let caretPos;
    
    if (element.matches('[contenteditable="true"]')) {
      caretPos = getCaretPositionContentEditable(element);
    } else {
      caretPos = element.selectionStart || 0;
    }
    
    const errors = window._harperErrorMap.get(element) || [];
    const error = errors.find(err => caretPos >= err.start && caretPos <= err.end);
    
    if (error) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showTooltip(e, element, error);
      return true;
    }
  } catch (err) {
    console.error('Error handling context menu:', err); // Keep this as console.error - essential error
  }
  return false;
}

/**
 * Find the start position of the current word in the text.
 * @param {string} text - The text to search in.
 * @param {number} position - The current cursor position.
 * @returns {number} - The start position of the current word.
 */
function findWordStart(text, position) {
  // Find the start of the current word
  let start = position;
  while (start > 0 && !/\s/.test(text[start - 1])) {
    start--;
  }
  return start;
}

/**
 * Try to auto-correct the word at the current cursor position.
 * @param {HTMLElement} element - The input element.
 */
function tryAutoCorrect(element) {
  debugLog("🔍 tryAutoCorrect called, autoCorrect enabled:", window._autoCorrectEnabled);

  // Skip if not enabled or no errors exist
  if (!window._autoCorrectEnabled) {
    debugLog("❌ Auto-correction disabled, skipping");
    return false;
  }

  if (!window._harperErrorMap.has(element)) {
    debugLog("❌ No errors map for element, skipping");
    return false;
  }
  
  let text, caretPos;
  if (element.matches('[contenteditable="true"]')) {
    text = element.innerText || element.textContent || '';
    caretPos = getCaretPositionContentEditable(element);
  } else {
    text = element.value || '';
    caretPos = element.selectionStart || 0;
  }

  debugLog(`📝 Text: "${text}", Caret position: ${caretPos}`);

  // When triggered by space, we need to look at the word BEFORE the space
  // Check if the character at caretPos-1 is space (this happens during keyup)
  if (caretPos > 0 && text.charAt(caretPos - 1) === ' ') {
    // We're right after a space, need to check the word before it
    debugLog("✓ Space detected, looking at previous word");
    caretPos = caretPos - 1; // Move back before the space
  }

  // Find the start of the word ending at the adjusted caret position
  const wordStart = findWordStart(text, caretPos);
  debugLog(`Word starts at: ${wordStart}, examining: "${text.substring(wordStart, caretPos)}"`);

  if (wordStart === caretPos) {
    debugLog("❌ No word to correct (empty word)");
    return false;
  }

  // Get the current word at the cursor position
  const currentWord = text.substring(wordStart, caretPos);
  debugLog(`🔤 Current word: "${currentWord}"`);

  if (!currentWord.trim()) {
    debugLog("❌ Empty word, nothing to correct");
    return false;
  }

  // Find if this word has an error - we need to check if the error overlaps with our word

  const errors = window._harperErrorMap.get(element) || [];
  debugLog(`🧰 Found ${errors.length} errors for element`);

  // Log all errors to help debug
  if (window._showDebugMessages && errors.length > 0) {
    errors.forEach((err, i) => {
      debugLog(`🔍 Error #${i}: start=${err.start}, end=${err.end}, word="${text.substring(err.start, err.end)}", suggestions=${err.suggestions?.length || 0}`);
    });
  }

  // Try different matching strategies in order of preference:
  let error = null;

  // 1. First try: exact match based on positions
  error = errors.find(err => {
    const exactMatch = err.start === wordStart && err.end === caretPos;
    if (exactMatch) debugLog(`✓ Found exact position match: ${err.start}-${err.end}`);
    return exactMatch;
  });

  // 2. Second try: error contains our word
  if (!error) {
    error = errors.find(err => {
      const containsWord = err.start <= wordStart && err.end >= caretPos;
      if (containsWord) debugLog(`✓ Found containing match: ${err.start}-${err.end}`);
      return containsWord;
    });
  }

  // 3. Third try: any overlap
  if (!error) {
    error = errors.find(err => {
      // Check if there's any overlap between the error and the current word
      const hasOverlap = (err.start <= caretPos && err.end > wordStart);
      if (hasOverlap) debugLog(`✓ Found overlapping match: ${err.start}-${err.end}`);
      return hasOverlap;
    });
  }

  if (!error) {
    debugLog("❌ No matching error found for current word");
    return false;
  }

  if (!error.suggestions || error.suggestions.length === 0) {
    debugLog("❌ No suggestions available for this error");
    return false;
  }

  debugLog(`✅ Found error with ${error.suggestions.length} suggestions: "${text.substring(error.start, error.end)}"`);

  // Get the most likely suggestion (first in the list)
  const suggestion = error.suggestions[0];
  debugLog(`🔧 Using suggestion: "${suggestion}"`);

  const originalWord = text.substring(error.start, error.end);
  debugLog(`🔄 Replacing "${originalWord}" with "${suggestion}"`);

  // Store information about this correction for potential reversion
  const replacementWithSpace = suggestion + ' '; // Add the space here
  window._lastAutoCorrection = {
    element: element,
    originalWord: originalWord,
    correctedWord: suggestion, // Store the original suggestion without space
    position: {
      start: error.start,
      // The end position should account for the added space
      end: error.start + replacementWithSpace.length 
    },
    timestamp: Date.now()
  };

  // Apply the correction immediately, adding a space after the suggestion
  applyTextReplacement(element, error.start, error.end, replacementWithSpace);
  debugLog("✓ Correction applied with space");

  // Apply and fade highlight effect - highlight should include the space
  applyHighlightEffect(element, error.start, error.start + replacementWithSpace.length);
  debugLog("✓ Highlight effect applied");

  // Process element asynchronously to update error highlighting
  setTimeout(() => {
    debugLog("🔄 Re-processing element after correction");
    processElement(element);
  }, 0);

  // Return true to indicate a correction was made
  debugLog("✅ Auto-correction successful");
  return true;
}

/**
 * Try to revert the most recent auto-correction.
 * @param {HTMLElement} element - The input element.
 * @returns {boolean} - Whether a reversion was performed
 */
function tryRevertCorrection(element) {
  // Check if we have an auto-correction to revert for this specific element
  const correction = window._lastAutoCorrection;
  
  // Remove the strict time limit, rely on element match and cursor position check below
  if (!correction || correction.element !== element) {
    debugLog("❌ No valid correction found for this element.");
    return false;
  }

  // Get current text and caret position
  let text, caretPos;
  if (element.matches('[contenteditable="true"]')) {
    text = element.innerText || element.textContent || '';
    caretPos = getCaretPositionContentEditable(element);
  } else {
    text = element.value || '';
    caretPos = element.selectionStart || 0;
  }
  
  // Expected position *after* backspace deletes the trailing space added during correction.
  // This is the start of the correction + the length of the corrected word (without the space).
  const expectedPosAfterBackspace = correction.position.start + correction.correctedWord.length; 

  // Check if the current caret position matches the expected position after the space was deleted by the backspace.
  if (caretPos !== expectedPosAfterBackspace) {
    debugLog(`❌ Revert skipped: caretPos (${caretPos}) !== expectedPosAfterBackspace (${expectedPosAfterBackspace})`);
    // Also clear the correction if the cursor moved away significantly, preventing accidental future reverts.
    if (Math.abs(caretPos - expectedPosAfterBackspace) > 2) { // Allow a small margin for timing issues
        window._lastAutoCorrection = null;
        debugLog("🧹 Cleared stale auto-correction record.");
    }
    return false;
  }

  // Revert the correction
  // The end position already includes the space
  debugLog(`⏪ Reverting: start=${correction.position.start}, end=${correction.position.end}, original="${correction.originalWord}"`);
  applyTextReplacement(
    element,
    correction.position.start,
    correction.position.end, // This end position includes the space
    correction.originalWord  // Replace the corrected word + space with the original
  );
  
  // Clear the correction record
  window._lastAutoCorrection = null;

  // Re-process element to update error highlighting
  setTimeout(() => {
      debugLog("🔄 Re-processing element after reversion");
      processElement(element);
  }, 0);

  // Return true to indicate a reversion was performed
  debugLog("✅ Reversion successful");
  return true;
}

/**
 * Apply a highlight effect to the corrected text that fades out.
 * @param {HTMLElement} element - The element containing the text.
 * @param {number} start - The start index of the text to highlight.
 * @param {number} end - The end index of the text to highlight.
 */
function applyHighlightEffect(element, start, end) {
  try {
    // Create temporary highlight overlay
    const highlightOverlay = document.createElement('div');
    highlightOverlay.className = 'harper-highlight-overlay';
    highlightOverlay.style.position = 'absolute';
    highlightOverlay.style.backgroundColor = 'rgba(255, 255, 0, 0.3)';
    highlightOverlay.style.pointerEvents = 'none';
    highlightOverlay.style.transition = 'opacity 1s ease-out';
    highlightOverlay.style.opacity = '1';
    highlightOverlay.style.zIndex = '9998'; // Below error overlay but above content
    
    // Position the highlight overlay
    if (element.matches('[contenteditable="true"]')) {
      // Position for contenteditable using Range API
      positionHighlightContentEditable(element, highlightOverlay, start, end);
    } else {
      // Position for input/textarea
      positionHighlightInput(element, highlightOverlay, start, end);
    }
    
    // Add to DOM - use same parent as the element's overlay
    const parent = element.parentNode || document.body;
    parent.appendChild(highlightOverlay);
    
    // Fade out and remove
    setTimeout(() => {
      highlightOverlay.style.opacity = '0';
      setTimeout(() => {
        if (highlightOverlay.parentNode) {
          highlightOverlay.parentNode.removeChild(highlightOverlay);
        }
      }, 1000); // Remove after fade completes
    }, 100); // Start fade after 100ms
  } catch (e) {
    console.error('Error applying highlight effect:', e); // Keep this as console.error - essential error
  }
}

/**
 * Position the highlight overlay for a contenteditable element.
 * @param {HTMLElement} element - The contenteditable element.
 * @param {HTMLElement} highlightOverlay - The highlight overlay element.
 * @param {number} start - The start index of the text to highlight.
 * @param {number} end - The end index of the text to highlight.
 */
function positionHighlightContentEditable(element, highlightOverlay, start, end) {
  try {
    // Create a range spanning the text to highlight
    const range = document.createRange();
    const textNodes = [];
    
    // Collect all text nodes in the element
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode);
    }
    
    // Find the nodes and offsets for the start and end positions
    let currentIndex = 0;
    let startNode = null, startOffset = 0;
    let endNode = null, endOffset = 0;
    
    for (const node of textNodes) {
      const nodeLength = node.nodeValue.length;
      
      if (!startNode && currentIndex + nodeLength > start) {
        startNode = node;
        startOffset = start - currentIndex;
      }
      
      if (!endNode && currentIndex + nodeLength >= end) {
        endNode = node;
        endOffset = end - currentIndex;
        break;
      }
      
      currentIndex += nodeLength;
    }
    
    if (startNode && endNode) {
      // Set the range boundaries
      range.setStart(startNode, startOffset);
      range.setEnd(endNode, endOffset);
      
      // Get the bounding client rect of the range
      const rect = range.getBoundingClientRect();
      const elementRect = element.getBoundingClientRect();
      
      // Position the highlight overlay relative to the element
      highlightOverlay.style.left = `${rect.left - elementRect.left}px`;
      highlightOverlay.style.top = `${rect.top - elementRect.top}px`;
      highlightOverlay.style.width = `${rect.width}px`;
      highlightOverlay.style.height = `${rect.height}px`;
    }
  } catch (e) {
    console.error('Error positioning highlight for contenteditable:', e); // Keep this as console.error - essential error
  }
}

/**
 * Position the highlight overlay for an input or textarea element.
 * This is more challenging since we don't have direct access to text positions.
 * @param {HTMLElement} element - The input or textarea element.
 * @param {HTMLElement} highlightOverlay - The highlight overlay element.
 * @param {number} start - The start index of the text to highlight.
 * @param {number} end - The end index of the text to highlight.
 */
function positionHighlightInput(element, highlightOverlay, start, end) {
  try {
    // For input/textarea, we'll use a simpler approach - highlight the entire element
    // and rely on the overlay system for positioning
    
    const rect = element.getBoundingClientRect();
    const computed = window.getComputedStyle(element);
    
    // Set base styles based on the element
    highlightOverlay.style.left = '0';
    highlightOverlay.style.top = '0';
    highlightOverlay.style.width = '100%';
    highlightOverlay.style.height = '100%';
    
    // Position it absolutely within the existing overlay's parent
    if (element._harperOverlay && element._harperOverlay.parentNode) {
      element._harperOverlay.parentNode.appendChild(highlightOverlay);
    } else {
      // Fallback if no parent
      document.body.appendChild(highlightOverlay);
    }
  } catch (e) {
    console.error('Error positioning highlight for input:', e); // Keep this as console.error - essential error
  }
}

// We'll keep a MutationObserver for new elements, but not for hover listeners
// This is now handled by the document-level contextmenu event

/**
 * Attach listeners to an element including input/blur processing and contextmenu handling.
 * @param {HTMLElement} element - The target element.
 */
function attachListeners(element) {
  element.setAttribute('spellcheck', 'false');
  if (!element.matches('[contenteditable="true"]')) {
    ensureOverlay(element);
  }
  debugLog(`⌨️ Attaching input event listener to ${element.tagName}`);

  // Debounce timer for general processing
  let processTimeout = null;
  const debounceTime = 300; // ms

  // Use the 'input' event for robust handling of corrections and reversions
  element.addEventListener('input', (e) => {
    // Clear any pending general processing
    if (processTimeout) clearTimeout(processTimeout);

    let correctionApplied = false;
    let reversionApplied = false;

    // --- Auto-Correction Logic (on space insertion) ---
    if (window._autoCorrectEnabled && e.inputType === 'insertText' && e.data === ' ') {
      debugLog("🚀 Input event: Space detected, attempting auto-correction");
      // Need to process *before* trying to correct, to ensure error map is up-to-date
      // Use a microtask to allow the input event to finish processing before analyzing
      queueMicrotask(() => {
        processElement(element).then(() => {
          correctionApplied = tryAutoCorrect(element); // Pass the element itself
          debugLog(`Result: ${correctionApplied ? 'correction applied' : 'no correction needed'}`);
          // If correction happened, processElement was already called inside tryAutoCorrect
          if (!correctionApplied) {
            // If no correction, schedule normal processing
            debugLog(`🔄 Scheduling general processing (post-correction attempt) in ${debounceTime}ms`);
            processTimeout = setTimeout(() => processElement(element), debounceTime);
          }
        });
      });
      // Don't schedule normal processing immediately, wait for async processElement/tryAutoCorrect
      return; 
    }
    // --- Reversion Logic (on backspace) ---
    else if (e.inputType === 'deleteContentBackward' && window._lastAutoCorrection) {
      debugLog("🔙 Input event: Backspace detected, attempting reversion");
      // Pass the element itself
      // Use microtask to ensure caret position is updated after backspace action
       queueMicrotask(() => {
        reversionApplied = tryRevertCorrection(element);
        if (reversionApplied) {
          debugLog("✓ Successfully reverted correction via input event");
          // Reversion already re-processes, no need to schedule again
        } else {
          debugLog("❌ Could not revert correction via input event");
          // If reversion failed, schedule normal processing
          debugLog(`🔄 Scheduling general processing (post-reversion attempt) in ${debounceTime}ms`);
          processTimeout = setTimeout(() => processElement(element), debounceTime);
        }
      });
      return; // Don't schedule normal processing immediately
    }

    // --- General Processing (debounced) ---
    // If no correction or specific reversion logic ran, schedule normal processing
     debugLog(`🔄 Scheduling general processing in ${debounceTime}ms`);
     processTimeout = setTimeout(() => {
       debugLog("🏃 Running scheduled general processing");
       processElement(element);
     }, debounceTime);
  }, { passive: true }); // Input events don't need to prevent default
  
  // Process on blur (ensure any pending debounced processing is cleared)
  element.addEventListener('blur', () => {
    // The processTimeout is defined within the 'input' listener's scope,
    // so we can't clear it here directly. However, the main purpose is
    // to ensure processing happens on blur, which the next line does.
    // If a debounced process was pending, it might run shortly after blur,
    // but processing again on blur ensures the latest state is checked.
    debugLog("🏃 Processing element on blur");
    processElement(element);
  }, { passive: true }); // Blur events don't need to prevent default

  // For contenteditable elements, also process on paste events
  if (element.matches('[contenteditable="true"]')) {
    element.addEventListener('paste', () => {
      // Short delay to allow paste to complete
      setTimeout(() => processElement(element), 10);
    }, { passive: true });
  }
  attachContextMenu(element);
  // No longer attaching mouseover listeners
}

/**
 * Initialize the spell-checker by attaching listeners to existing target elements
 * (inputs, textareas, contenteditable elements) and setting up a MutationObserver
 * to handle elements added dynamically.
 */
function scanDocument(doc) {
  const targetSelectors = 'input[type="text"], textarea, [contenteditable="true"]';
  window.harperReady.then(() => {
    try {
      doc.querySelectorAll(targetSelectors).forEach(element => {
        attachListeners(element);
        element.style.border = window._showDebugBorder ? '2px dashed orange' : 'none';
        processElement(element);
      });
    } catch (e) {
      // ignore
    }

    // Set up a MutationObserver to handle dynamically added elements
    const elementObserver = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (node.matches(targetSelectors)) {
              attachListeners(node);
              node.style.border = window._showDebugBorder ? '2px dashed orange' : 'none';
              processElement(node);
            }
            node.querySelectorAll?.(targetSelectors).forEach(el => {
              attachListeners(el);
              el.style.border = window._showDebugBorder ? '2px dashed orange' : 'none';
              processElement(el);
            });
          }
        }
      }
    });
    elementObserver.observe(doc.body, { childList: true, subtree: true });
  });

  // Recursively scan accessible iframes
  try {
    doc.querySelectorAll('iframe').forEach((iframe) => {
      try {
        const childDoc = iframe.contentDocument;
        if (childDoc) {
          scanDocument(childDoc);
        }
      } catch (e) {
        // ignore cross-origin
      }
    });
  } catch (e) {
    // ignore
  }
}

function init() {
  // Load all settings from storage
  chrome.storage?.local.get(['showDebugBorder', 'autoCorrectEnabled', 'showDebugMessages'], (data) => {
    window._showDebugBorder = data.showDebugBorder ?? false; // default OFF
    window._autoCorrectEnabled = data.autoCorrectEnabled ?? false; // default OFF
    window._showDebugMessages = data.showDebugMessages ?? false; // Added, default OFF

    debugLog("Initialized settings:", {
      showDebugBorder: window._showDebugBorder,
      autoCorrectEnabled: window._autoCorrectEnabled,
      showDebugMessages: window._showDebugMessages
    });

    scanDocument(document);
  });
}

// No need to expose functions globally - keep them private to avoid polluting global namespace

// ============================================================================

// Document-Level Contextmenu Handling to Bypass YouTube Blockers
// ============================================================================

// Global document-level context menu handler with multiple approaches for reliability
document.addEventListener(
  'contextmenu',
  (e) => {
    try {
      // First priority: Check if clicking on an error span in an overlay
      if (e.target.closest('.harper-error')) {
        e.preventDefault();
        e.stopImmediatePropagation();
        
        const span = e.target.closest('.harper-error');
        const error = {
          start: Number(span.getAttribute('data-start')),
          end: Number(span.getAttribute('data-end')),
          suggestions: JSON.parse(decodeURIComponent(span.getAttribute('data-suggestions')))
        };
        
        // Find the associated input element
        let container;
        
        // First check if we're in an overlay
        const overlay = span.closest('.harper-overlay');
        if (overlay) {
          // Find the element this overlay is for
          const parent = overlay.parentNode;
          container = parent.querySelector('input[type="text"], textarea, [contenteditable="true"]');
        }
        
        if (!container) {
          // Fallback to old method
          container = span.closest('[contenteditable="true"], textarea, input') || span.parentElement;
        }
        
        showTooltip(e, container, error);
        return;
      }
      
      // Second priority: Check registered elements for errors at cursor position
      if (window._harperElements) {
        // Find the element under the cursor
        const target = e.target.closest('input[type="text"], textarea, [contenteditable="true"]');
        if (target && window._harperElements.has(target)) {
          if (handleContextMenu(e, target)) {
            return;
          }
        }
      }
      
      // Allow normal right-click behavior on text inputs
      if (e.target.matches('input[type="text"], textarea, [contenteditable="true"]')) {
        return;
      }
    } catch (err) {
      console.error('Error in document contextmenu handler:', err); // Keep this as console.error - essential error
    }
  },
  { capture: true, passive: false } // Cannot be passive as it calls preventDefault()
);

// Additional mouseup handler for when contextmenu is blocked
document.addEventListener('mouseup', (e) => {
  if (e.button === 2 && window._harperElements) {
    const target = e.target.closest('input[type="text"], textarea, [contenteditable="true"]');
    if (target && window._harperElements.has(target)) {
      setTimeout(() => handleContextMenu(e, target), 10);
    }
  }
}, { capture: true, passive: false }); // Cannot be passive as we may need to preventDefault in handleContextMenu

// ============================================================================
// Start the Initialization
// ============================================================================

init();


// ============================================================================
// Message Listener for Settings Changes
// ============================================================================

// Listen for toggle messages from the popup
chrome.runtime?.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'toggle-debug-border') {
    window._showDebugBorder = message.enabled;
    debugLog('Debug border ' + (message.enabled ? 'enabled' : 'disabled'));

    // Update all overlays and original elements
    document.querySelectorAll('div').forEach(div => {
      if (div.style.position === 'absolute' && div.style.zIndex === '9999') {
        const parent = div.parentNode?.querySelector('[contenteditable], textarea, input[type="text"]');
        if (window._showDebugBorder === false) {
          div.style.border = 'none';
          if (parent) {
            parent.style.outline = 'none';
            parent.style.border = 'none';
          }
        } else {
          if (parent) {
            parent.style.outline = '';
            parent.style.border = '';
            const computed = window.getComputedStyle(parent);
            div.style.border = computed.border;
          } else {
            div.style.border = '';
          }
        }
      }
    });
  } else if (message.type === 'toggle-auto-correct') {
    // Update auto-correct state
    window._autoCorrectEnabled = message.enabled;
    debugLog('Auto-correct ' + (message.enabled ? 'enabled' : 'disabled'));
  } else if (message.type === 'toggle-debug-messages') { // Added
    // Update debug messages state
    window._showDebugMessages = message.enabled;
    // Log this change regardless of the new state, so we know it happened
    console.log('Debug messages ' + (message.enabled ? 'enabled' : 'disabled'));
  }
});

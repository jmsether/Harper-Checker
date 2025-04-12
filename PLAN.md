# Harper Grammar Checker - Project Notes

## Completed Features

- Integrated Harper WASM module
- Inline multi-color underlines for error types
- Right-click context menu with suggestions
- Hover tooltips (experimental)
- Overlay system for textareas and inputs
- Disable native spellcheck
- Global contextmenu override for reliability
- Auto-correction feature (on space, with backspace revert)
- Popup UI Improvements (Dark mode, custom toggles, branding)

## Auto-Correction Feature Overview

- **Goal:** Automatically correct errors when a user presses the space key, with the ability to revert corrections by pressing backspace immediately.
- **Requirements:**
    - Popup toggle to enable/disable.
    - Apply most likely suggestion on space after an error.
    - Subtle highlight effect on correction.
    - Revert via backspace immediately after correction.
    - Only revert before further typing.
- **Implementation Challenges (if still relevant):**
    - Text Position Mapping for highlights.
    - Performance in large documents.
    - Cursor positioning after correction.
    - Cross-browser consistency.

## Popup UI Improvements Overview

- **Goal:** Enhance the popup UI with a dark mode, minimalist design, and subtle branding.
- **Summary:**
    - Dark Mode Theme
    - Modern Toggle Switches
    - Improved Visual Hierarchy & Layout
    - Subtle Branding (Logo, Typography)
    - Polish & Interactions (Hover/Focus states, transitions)

## Next Steps

- Improve hover tooltip reliability
- Expand options/settings UI
- Support more languages (future)
- Performance optimizations

## Known Issues

- Hover tooltips unreliable on some sites
- Overlay may interfere with some page layouts
- Context menu may be blocked by some sites

# Harper Grammar Checker Extension

## Features

- Inline grammar and spell checking using **Harper** (WASM)
- **Multi-color underlines** for different error types (spelling, style, repetition, etc.)
- **Right-click context menu** with suggestions for corrections
- **Hover tooltips** with suggestions (experimental, may not work on all sites)
- Works on **inputs, textareas, and contenteditable** elements
- Overlay system for inline highlights in textareas/inputs
- **Auto-correction** of errors when typing (space key)
- **Backspace to revert** auto-corrections

## Setup Instructions

1. **Install Dependencies**
   - Run `npm install` to install `harper.js` and `esbuild`.

2. **Add Harper Module**

   - Build or download the Harper WASM + JS glue from [https://github.com/Automattic/harper](https://github.com/Automattic/harper)
   - Place the necessary files in the `harper/` directory:
     ```
     harper/
     ├── harper.js          # Main Harper logic
     ├── harper.wasm        # Main WASM module
     ├── harper_wasm.js     # Glue code for WASM
     ├── harper_wasm_bg.wasm # Background WASM module
     ```
     *(Note: Ensure these filenames match those referenced in `manifest.json`)*

3. **Build Extension**

   - Bundle `content-script.js` using the installed `esbuild`:
     ```bash
     npx esbuild content-script.js --bundle --outfile=dist/content-script.bundle.js --format=esm --target=es2020
     ```

4. **Load Extension**

   - Go to `chrome://extensions`
   - Enable Developer Mode
   - Load unpacked extension folder

4. **Usage**

   - Errors will be underlined in different colors
   - Right-click on an error to see suggestions
   - Hover tooltips may work on some sites

---

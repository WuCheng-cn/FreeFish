# Install and get started

## Install

1. Open the [latest Release](https://github.com/WuCheng-cn/FreeFish/releases/latest).
2. Download the package for your system: `.exe` on Windows, `.dmg` on macOS, or `.AppImage` / `.deb` on Linux.
3. Install and open **SysNotes**. FreeFish uses this name for its process and window disguise.

The app uses your system webview. Windows 10/11 normally includes WebView2; install Microsoft's WebView2 Runtime if the app reports that it is missing.

## Read your first book

1. Open the bookshelf and select **+ Add TXT**.
2. Choose a local TXT file. It is never copied or uploaded.
3. FreeFish detects the encoding and chapters automatically. Select the book to resume reading.
4. Press `Ctrl+Shift+H` to hide or restore the window.

## Stored data

Your bookshelf, progress, and settings are kept under `com.wu.freefish` in the system app-data directory. The original books stay where they are, so moved or deleted files need to be added again.

## Run from source

Install Node.js 18+, Rust, and the Tauri prerequisites for your platform, then run:

```bash
npm install
npm run dev
```

To create an installer:

```bash
npm run build
```

Bundles are written to `src-tauri/target/release/bundle/`.

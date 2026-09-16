# FreeFish Reader

English | [简体中文](./README.md)

[![Download latest release](https://img.shields.io/github/v/release/WuCheng-cn/FreeFish?label=download&color=4f9cf9)](https://github.com/WuCheng-cn/FreeFish/releases/latest)
[![Documentation](https://img.shields.io/badge/docs-FreeFish-4f9cf9)](https://wucheng-cn.github.io/FreeFish/en/)

A cross-platform floating TXT reader for Windows, macOS, and Linux. Built with Tauri 2, it stays small, uses little memory, and disguises its process and window as **SysNotes**.

> **Just want to read?** Download the latest installer for your platform from [GitHub Releases](https://github.com/WuCheng-cn/FreeFish/releases/latest). Node.js and Rust are not required. See the [online documentation](https://wucheng-cn.github.io/FreeFish/en/) for installation and usage.

## Features

- Borderless, translucent window that can stay above other windows
- Local TXT files with automatic encoding detection: UTF-8, GBK, GB18030, Big5, and UTF-16
- Automatic chapter parsing, custom regular expressions, and length-based fallback splitting
- Bookshelf, reading progress down to the position within a chapter, and remembered window size and position
- Customizable global shortcuts for hiding, paging, click-through mode, always-on-top mode, and single-line mode; shortcut conflicts are reported
- Filterable table of contents with direct chapter navigation
- Full-text search with highlighted results and direct navigation
- Single-line mode that resizes the window to one line and supports line-by-line navigation with arrow keys, the mouse wheel, or clicks
- Automatic hiding after inactivity, configurable or disabled in settings
- Click-through mode that leaves only the text visible while clicks pass to the window underneath
- Disguise mode that renders the text like source-code comments
- Process and window disguise as `SysNotes` / `SysNotes.exe`
- Configurable font, size, line height, text color, background color, and opacity

## Default shortcuts

| Action | Global shortcut | Notes |
|---|---|---|
| Boss key (show/hide) | `Ctrl+Shift+H` | Restores the window after it is hidden from the taskbar and Alt+Tab |
| Previous / next page | `Ctrl+Alt+←` / `Ctrl+Alt+→` | Works globally and can be disabled in settings |
| Click-through mode | `Ctrl+Shift+M` | Use the same shortcut to exit the mode |
| Toggle always on top | `Ctrl+Shift+T` | |
| Single-line mode | `Ctrl+Shift+L` | Restores the previous size when disabled |

When the window is focused, use `←/→`, `Page Up/Page Down`, or `Space` to turn pages; `↑/↓` to scroll; `Esc` to hide; and `Ctrl+F` to search. In single-line mode, arrow keys, the mouse wheel, and clicks move one line at a time.

Record a new global shortcut by clicking its field in **Settings** and pressing the desired combination. Press `Backspace` to disable it, then select **Apply shortcuts**. Conflicts with other applications are shown explicitly.

## Prerequisites

1. [Node.js 18+](https://nodejs.org)
2. [Rust](https://rustup.rs) (select the MSVC toolchain on Windows and install Visual Studio Build Tools when prompted)
3. Platform dependencies:
   - Windows 10/11: WebView2 is normally included
   - macOS: `xcode-select --install`
   - Debian/Ubuntu: `sudo apt install libwebkit2gtk-4.1-dev build-essential libssl-dev libayatana-appindicator3-dev librsvg2-dev`

## Run and package

```bash
npm install
npm run dev      # First compilation takes about 5–10 minutes
npm run build    # Bundles are written to src-tauri/target/release/bundle/
```

When a maintainer pushes a `v*` tag matching the application version, GitHub Actions creates a Release and uploads the Windows, macOS, and Linux installers.

## FAQ

- **The text is garbled:** Convert uncommon encodings to UTF-8 with Notepad or VS Code.
- **Chapters are detected incorrectly:** Change the chapter-title regular expression in Settings and select **Reparse current book**.
- **A global shortcut does not work:** Another application may already use it. Choose another combination; security software may also need to allow the shortcut hook.
- **The window disappeared:** Inactivity auto-hide probably ran. Press the boss key, or disable auto-hide in Settings.
- **The reader does not float above a game:** Exclusive fullscreen applications cannot be overlaid. Use borderless-windowed mode.
- **The window cannot be clicked:** Click-through mode is active. Press `Ctrl+Shift+M` by default to leave it.
- **Where is data stored?** The bookshelf, progress, and settings are kept in the system app-data directory under `com.wu.freefish`. Books are not copied; only their paths are stored.

## Project layout

```text
src/            Frontend (plain HTML, CSS, and JavaScript; no bundler)
src-tauri/      Rust backend for decoding, shortcuts, persistence, and file dialogs
docs/           VitePress documentation in Chinese and English
```

# Features and shortcuts

## Default global shortcuts

| Action | Shortcut | Notes |
|---|---|---|
| Show / hide | `Ctrl+Shift+H` | The boss key; press it again to restore the window |
| Previous / next page | `Ctrl+Alt+←` / `Ctrl+Alt+→` | Works while another window is focused |
| Click-through mode | `Ctrl+Shift+M` | Use the same shortcut to exit |
| Toggle always on top | `Ctrl+Shift+T` | Controls whether the reader stays in front |
| Single-line mode | `Ctrl+Shift+L` | Restores the previous window size when disabled |

While the reader is focused, use `←/→`, `Page Up/Page Down`, or `Space` to turn pages; `↑/↓` to scroll; `Esc` to hide; and `Ctrl+F` to search.

Every global shortcut can be recorded again in Settings. Select a field and press the new combination, press `Backspace` to disable it, then select **Apply shortcuts**.

## Reading modes

- **Single-line:** Shrinks the window to one line. Move by line with arrow keys, the mouse wheel, or clicks.
- **Click-through:** Hides the interface and leaves only text while clicks pass to the window underneath.
- **Disguise:** Renders the book as source-code comments with line numbers.
- **Auto-hide:** Hides after an idle period and waits for the boss key.

## Chapters and search

FreeFish recognizes common Chinese chapter headings and falls back to length-based splitting. If detection is wrong, change the chapter-title regular expression in Settings and select **Reparse current book**.

The table of contents filters by chapter name. Full-text search opens the matching passage and highlights it.

## Troubleshooting

### The text is garbled

Convert uncommon encodings to UTF-8 with Notepad or VS Code.

### A global shortcut does not work

Another application may already use it. Settings identifies failed registrations so you can choose another combination. Security software may also need to allow global shortcuts.

### The reader does not float above a game

Normal windows cannot overlay exclusive fullscreen applications. Switch the game to borderless-windowed mode.

### The window cannot be clicked

Click-through mode is active. Press `Ctrl+Shift+M` by default to leave it.

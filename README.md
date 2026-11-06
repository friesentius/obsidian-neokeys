# Neokeys

Neovim-inspired leader keys and sequential keybindings for Obsidian, loosely based on
[Spacekeys](https://github.com/jlumpe/obsidian-spacekeys). Press a leader key, then a short
sequence of keys, to walk a branching, which-key-style menu of commands and files instead of
hunting for a hotkey.

![Neokeys which-key popup, root menu, light theme](docs/screenshots/which-key-root-light.png)

This is **Phase 0**: a hotkey-triggered leader, a YAML/JSON keymap editor, and the which-key
popup. A settings-tab leader combo, a visual tree editor, and Spacekeys import are planned for
later phases.

## Installing (for testing)

Neokeys is not yet listed in Obsidian's community plugin directory. To try it:

**Manual copy**

1. Build the plugin (`npm install && npm run build`), or download `main.js`, `manifest.json`,
   and `styles.css` from a release.
2. Copy those three files into `<your-vault>/.obsidian/plugins/neokeys/`.
3. Reload Obsidian (or disable/re-enable the plugin) and turn on **Neokeys** under
   Settings → Community plugins.

**BRAT**

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin.
2. In BRAT's settings, add this repository (`friesentius/obsidian-neokeys`) as a beta plugin.
3. Enable Neokeys under Settings → Community plugins.

## Setting up the leader key

Neokeys ships with **no default hotkey** (this is deliberate, and is what Obsidian's plugin
guidelines expect). To assign one:

1. Open Settings → Hotkeys.
2. Search for **Neokeys: Leader**.
3. Click the `+` and press the key or combo you want as your leader (e.g. `Ctrl+B`).

Pressing the leader opens the which-key popup at the root of your keymap. Type further keys to
descend into a group, <kbd>Backspace</kbd> to go back up one level, and <kbd>Esc</kbd> to close
the popup at any point.

## The keymap

Open Settings → Neokeys to edit the keymap as YAML (JSON is also accepted, since JSON is valid
YAML). The schema is Spacekeys-compatible, with a `title` added to each group so the which-key
popup can show a heading for the section you're in.

Every entry under `items` is one of:

- **A group** - has nested `items`, plus an optional `title` and `description` shown as the
  popup's header when you're inside it.
- **A command** - `command: <command-id>`, or the short form `"<command-id> <description>"`.
  An optional `description` overrides the label shown in the popup.
- **A file** - `file: <vault-relative-path>`, opened with the same resolution as Obsidian's
  internal links. An optional `description` overrides the label.

```yaml
title: Neokeys
description: Root menu
items:
  f:
    title: File
    description: Create, open, and manage files
    items:
      n: file-explorer:new-file New file
      s: editor:save-file Save file
      d: app:delete-file
  w:
    title: Window
    description: Panes, tabs, and layout
    items:
      n: workspace:new-tab New tab
      v:
        title: View
        description: Switch how the note is displayed
        items:
          r: markdown:toggle-preview Toggle reading view
```

A key string is an optional run of modifier letters (`c`/`s`/`a`/`m` for ctrl/shift/alt/meta)
followed by a `-` and a base key, e.g. `c-enter` for Ctrl+Enter, or just a single character for
an unmodified key, e.g. `f`. Printable characters are case-sensitive: `F` is Shift+F, and `s-f`
or `cs-f` are equivalent to `F` and `c-F`. Any other shifted character must be written as the
character itself, e.g. `?` rather than `s-/` or `!` rather than `s-1`; those forms are rejected. A handful of named keys are recognized as
aliases: `space`, `up`/`down`/`left`/`right`, `enter`, `esc`, `tab`, `backspace`, `delete`,
`home`, `end`, `pageup`, `pagedown`, `insert`, and `f1`–`f12`.

Click **Save keymap** to apply changes; an invalid keymap is rejected with an error message that
points at the exact field (e.g. `items.f.items.d`) that needs fixing, and the previously saved
keymap keeps working until you fix it.

The **show delay** setting controls how long (in milliseconds) the popup waits before revealing
the key/label grid, so a sequence you already know by muscle memory never flashes it. There is no
forced abandon-timeout: a half-typed sequence waits indefinitely until it resolves, dead-ends, is
backspaced away, or you press Esc.

## Compatibility

Desktop only for now (`isDesktopOnly: true`); mobile support is a possible future stretch goal,
since there is no public API signal for "a hardware keyboard is attached."

## Development

- `npm install`
- `npm run dev` - esbuild in watch mode
- `npm run build` - typecheck + production build
- `npm test` - Jest unit tests (key parsing, keymap parsing/validation, tree resolution, delay
  logic)
- `npm run lint` - ESLint with `eslint-plugin-obsidianmd`'s recommended config
- `npm run validate` - mirrors the parts of Obsidian's community-plugin submission checks that
  don't require a live GitHub release (manifest/versions shape, `id`/`version` format)

## License

[MIT](LICENSE)

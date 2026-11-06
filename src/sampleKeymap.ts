/**
 * The default keymap a fresh install of Neokeys ships with. Spacekeys-compatible
 * group/command/file schema, extended with a `title` on each group.
 */
export const DEFAULT_KEYMAP_YAML = `title: Neokeys
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
  p:
    command: command-palette:open
    description: Open command palette
`;

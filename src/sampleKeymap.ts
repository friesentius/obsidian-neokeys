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
      d: app:delete-file Delete current file
      o: switcher:open Open file (quick switcher)
      r: workspace:edit-file-title Rename file
  t:
    title: Text
    description: Formatting for the current selection or line
    items:
      f:
        title: Formatting
        description: Inline text formatting
        items:
          b: editor:toggle-bold Bold
          i: editor:toggle-italics Italic
          s: editor:toggle-strikethrough Strikethrough
          c: editor:toggle-code Inline code
          m: editor:toggle-highlight Highlight
          q: editor:toggle-blockquote Blockquote
          r: editor:clear-formatting Clear formatting
      h:
        title: Heading
        description: Set or remove the current line's heading level
        items:
          '1': editor:set-heading-1 Heading 1
          '2': editor:set-heading-2 Heading 2
          '3': editor:set-heading-3 Heading 3
          '4': editor:set-heading-4 Heading 4
          '5': editor:set-heading-5 Heading 5
          '6': editor:set-heading-6 Heading 6
          '0': editor:set-heading-0 Remove heading
          t: editor:set-heading Toggle heading
          '+': neokeys:increase-heading-level Increase heading level
          '-': neokeys:decrease-heading-level Decrease heading level
      l:
        title: Link
        description: Insert a link, wikilink, or embed
        items:
          k: editor:insert-link Markdown link
          w: editor:insert-wikilink Internal link (wikilink)
          e: editor:insert-embed Embed
      '-':
        title: List
        description: Bullets, numbering, checkboxes, and indentation
        items:
          u: editor:toggle-bullet-list Bullet list
          o: editor:toggle-numbered-list Numbered list
          c: editor:cycle-list-checklist Cycle bullet/checkbox
          k: editor:toggle-checklist-status Toggle checkbox status
          i: editor:indent-list Indent
          I: editor:unindent-list Unindent
      a:
        title: Add
        description: Tables, code blocks, math, footnotes, and more
        items:
          t: editor:insert-table Table
          c: editor:insert-codeblock Code block
          m: editor:insert-mathblock Math block
          i: editor:toggle-inline-math Inline math
          f: editor:insert-footnote Footnote
          r: editor:insert-horizontal-rule Horizontal rule
          b: editor:insert-callout Callout
          '#': editor:insert-tag Tag
  w:
    title: Window
    description: Tabs, splits, and windows
    items:
      c: workspace:new-tab New tab
      x: workspace:close Close tab
      n: workspace:next-tab Next tab
      p: workspace:previous-tab Previous tab
      m: workspace:move-to-new-window Move tab to new window
      u: workspace:undo-close-pane Undo close tab
      g:
        title: Go to tab
        description: Jump directly to a tab by position
        items:
          '1': workspace:goto-tab-1 Tab 1
          '2': workspace:goto-tab-2 Tab 2
          '3': workspace:goto-tab-3 Tab 3
          '4': workspace:goto-tab-4 Tab 4
          '5': workspace:goto-tab-5 Tab 5
          '6': workspace:goto-tab-6 Tab 6
          '7': workspace:goto-tab-7 Tab 7
          '8': workspace:goto-tab-8 Tab 8
          l: workspace:goto-last-tab Last tab
      s:
        title: Split
        description: Split the current pane
        items:
          v: workspace:split-vertical Split right
          h: workspace:split-horizontal Split down
      f:
        title: Focus pane
        description: Move focus to an adjacent split
        items:
          h: editor:focus-left Focus left
          j: editor:focus-bottom Focus down
          k: editor:focus-top Focus up
          l: editor:focus-right Focus right
      w: workspace:new-window New window
      W: workspace:close-window Close window
  p:
    command: command-palette:open
    description: Open command palette
`;

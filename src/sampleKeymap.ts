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
    icon: files
    items:
      n:
        command: file-explorer:new-file
        description: New file
        icon: file-plus
      s:
        command: editor:save-file
        description: Save file
        icon: save
      d:
        command: app:delete-file
        description: Delete current file
        icon: trash-2
      o:
        command: switcher:open
        description: Open file (quick switcher)
        icon: file-search
      r:
        command: workspace:edit-file-title
        description: Rename file
        icon: file-edit
  t:
    title: Text
    description: Formatting for the current selection or line
    icon: type
    items:
      f:
        title: Formatting
        description: Inline text formatting
        icon: baseline
        items:
          b:
            command: editor:toggle-bold
            description: Bold
            icon: bold
          i:
            command: editor:toggle-italics
            description: Italic
            icon: italic
          s:
            command: editor:toggle-strikethrough
            description: Strikethrough
            icon: strikethrough
          c:
            command: editor:toggle-code
            description: Inline code
            icon: code
          m:
            command: editor:toggle-highlight
            description: Highlight
            icon: highlighter
          q:
            command: editor:toggle-blockquote
            description: Blockquote
            icon: quote
          r:
            command: editor:clear-formatting
            description: Clear formatting
            icon: remove-formatting
      h:
        title: Heading
        description: Set or remove the current line's heading level
        icon: heading
        items:
          '1':
            command: editor:set-heading-1
            description: Heading 1
            icon: heading-1
          '2':
            command: editor:set-heading-2
            description: Heading 2
            icon: heading-2
          '3':
            command: editor:set-heading-3
            description: Heading 3
            icon: heading-3
          '4':
            command: editor:set-heading-4
            description: Heading 4
            icon: heading-4
          '5':
            command: editor:set-heading-5
            description: Heading 5
            icon: heading-5
          '6':
            command: editor:set-heading-6
            description: Heading 6
            icon: heading-6
          '0':
            command: editor:set-heading-0
            description: Remove heading
            icon: pilcrow
          '+':
            command: neokeys:increase-heading-level
            description: Increase heading level
            icon: chevrons-up
          '-':
            command: neokeys:decrease-heading-level
            description: Decrease heading level
            icon: chevrons-down
      l:
        title: Link
        description: Insert a link, wikilink, or embed
        icon: link
        items:
          k:
            command: editor:insert-link
            description: Markdown link
            icon: external-link
          w:
            command: editor:insert-wikilink
            description: Internal link (wikilink)
            icon: file-symlink
          e:
            command: editor:insert-embed
            description: Embed
            icon: file-input
      '-':
        title: List
        description: Bullets, numbering, checkboxes, and indentation
        icon: list
        items:
          u:
            command: editor:toggle-bullet-list
            description: Bullet list
            icon: list
          o:
            command: editor:toggle-numbered-list
            description: Numbered list
            icon: list-ordered
          c:
            command: editor:cycle-list-checklist
            description: Cycle bullet/checkbox
            icon: list-checks
          k:
            command: editor:toggle-checklist-status
            description: Toggle checkbox status
            icon: check-square
          i:
            command: editor:indent-list
            description: Indent
            icon: indent
          I:
            command: editor:unindent-list
            description: Unindent
            icon: outdent
      a:
        title: Add
        description: Tables, code blocks, math, footnotes, and more
        icon: plus-square
        items:
          t:
            command: editor:insert-table
            description: Table
            icon: table
          c:
            command: editor:insert-codeblock
            description: Code block
            icon: code-2
          m:
            command: editor:insert-mathblock
            description: Math block
            icon: sigma
          i:
            command: editor:toggle-inline-math
            description: Inline math
            icon: function-square
          f:
            command: editor:insert-footnote
            description: Footnote
            icon: asterisk
          r:
            command: editor:insert-horizontal-rule
            description: Horizontal rule
            icon: separator-horizontal
          b:
            command: editor:insert-callout
            description: Callout
            icon: info
          '#':
            command: editor:insert-tag
            description: Tag
            icon: tag
  w:
    title: Window
    description: Tabs, splits, and windows
    icon: layout
    items:
      c:
        command: workspace:new-tab
        description: New tab
        icon: plus
      x:
        command: workspace:close
        description: Close tab
        icon: x
      n:
        command: workspace:next-tab
        description: Next tab
        icon: chevron-right
      p:
        command: workspace:previous-tab
        description: Previous tab
        icon: chevron-left
      m:
        command: workspace:move-to-new-window
        description: Move tab to new window
        icon: external-link
      u:
        command: workspace:undo-close-pane
        description: Undo close tab
        icon: undo-2
      v:
        command: workspace:split-vertical
        description: Split right
        icon: split-square-horizontal
      '-':
        command: workspace:split-horizontal
        description: Split down
        icon: split-square-vertical
      g:
        title: Go to tab
        description: Jump directly to a tab by position
        icon: hash
        items:
          '1':
            command: workspace:goto-tab-1
            description: Tab 1
          '2':
            command: workspace:goto-tab-2
            description: Tab 2
          '3':
            command: workspace:goto-tab-3
            description: Tab 3
          '4':
            command: workspace:goto-tab-4
            description: Tab 4
          '5':
            command: workspace:goto-tab-5
            description: Tab 5
          '6':
            command: workspace:goto-tab-6
            description: Tab 6
          '7':
            command: workspace:goto-tab-7
            description: Tab 7
          '8':
            command: workspace:goto-tab-8
            description: Tab 8
          l:
            command: workspace:goto-last-tab
            description: Last tab
            icon: chevrons-right
      f:
        title: Focus pane
        description: Move focus to an adjacent split
        icon: focus
        items:
          h:
            command: editor:focus-left
            description: Focus left
            icon: arrow-left
          j:
            command: editor:focus-bottom
            description: Focus down
            icon: arrow-down
          k:
            command: editor:focus-top
            description: Focus up
            icon: arrow-up
          l:
            command: editor:focus-right
            description: Focus right
            icon: arrow-right
      w:
        command: workspace:new-window
        description: New window
        icon: maximize
      W:
        command: workspace:close-window
        description: Close window
        icon: x-square
  p:
    command: command-palette:open
    description: Open command palette
    icon: command
`;

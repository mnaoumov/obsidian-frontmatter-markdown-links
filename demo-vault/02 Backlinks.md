---
obsidian-dev-utils:
  demo-vault-validation:
    allow-wikilinks: The related property is a wikilink on purpose: it is the natively-resolved backlink this note compares against.
related: "[[Target note]]"
reference: "[Second target](<Targets/Second target.md>)"
---
# Backlinks

A link only counts as a **backlink** if Obsidian can resolve it. Because this plugin turns frontmatter markdown links into resolvable links, those links now appear in the target note's **Backlinks** pane - exactly like a link written in the note body.

This note's frontmatter links to:

- [Target note](<./Targets/Target note.md>) through the `related` property (a wikilink), and
- [Second target](<./Targets/Second target.md>) through the `reference` property (a **markdown link**, resolved by the plugin).

## Try it

1. Open [Second target](<./Targets/Second target.md>) and open its **Backlinks** pane (the caret at the bottom of the note, or **Backlinks** in the right sidebar).
2. You will see this note listed - even though the link lives in **frontmatter** as a **markdown link** (`reference`), not in the body.
3. Disable the plugin under **Settings -> Community plugins** and reload. The backlink disappears, because Obsidian no longer resolves the frontmatter markdown link. Re-enable to bring it back.

The `related` wikilink also makes this note a backlink of [Target note](<./Targets/Target note.md>), but Obsidian shows that one even without the plugin - wikilinks in frontmatter are supported natively. The plugin's job is to give **markdown links** in frontmatter the same power.

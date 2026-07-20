---
related: "[[Target note]]"
reference: "[Second target](<Targets/Second target.md>)"
---
[Docs](https://github.com/mnaoumov/obsidian-frontmatter-markdown-links/)

# Backlinks

A link only counts as a **backlink** if Obsidian can resolve it. Because this plugin turns frontmatter markdown links into resolvable links, those links now appear in the target note's **Backlinks** pane - exactly like a link written in the note body.

This note's frontmatter links to:

- [[Target note]] through the `related` property (a wikilink), and
- [[Second target]] through the `reference` property (a **markdown link**, resolved by the plugin).

## Try it

1. Open [[Second target]] and open its **Backlinks** pane (the caret at the bottom of the note, or **Backlinks** in the right sidebar).
2. You will see this note listed - even though the link lives in **frontmatter** as a **markdown link** (`reference`), not in the body.
3. Disable the plugin under **Settings -> Community plugins** and reload. The backlink disappears, because Obsidian no longer resolves the frontmatter markdown link. Re-enable to bring it back.

The `related` wikilink also makes this note a backlink of [[Target note]], but Obsidian shows that one even without the plugin - wikilinks in frontmatter are supported natively. The plugin's job is to give **markdown links** in frontmatter the same power.

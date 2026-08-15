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

```code-button
---
caption: Open "Second target" and show its Backlinks pane
---
await require('/demoSetup.ts').showSecondTargetBacklinks(app);
```

Manual equivalent: open [Second target](<./Targets/Second target.md>) and open its **Backlinks** pane (the caret at the bottom of the note, or **Backlinks** in the right sidebar).

1. You will see this note listed - even though the link lives in **frontmatter** as a **markdown link** (`reference`), not in the body.
2. Turn the plugin off. The backlink disappears, because Obsidian no longer resolves the frontmatter markdown link:

   ```code-button
   ---
   caption: Turn the plugin off
   ---
   await require('/demoSetup.ts').disablePlugin(app);
   ```

3. Turn it back on and the backlink returns:

   ```code-button
   ---
   caption: Turn the plugin back on
   ---
   await require('/demoSetup.ts').enablePlugin(app);
   ```

Manual equivalent for both: toggle **Frontmatter Markdown Links** in **Settings -> Community plugins**.

The `related` wikilink also makes this note a backlink of [Target note](<./Targets/Target note.md>), but Obsidian shows that one even without the plugin - wikilinks in frontmatter are supported natively. The plugin's job is to give **markdown links** in frontmatter the same power.

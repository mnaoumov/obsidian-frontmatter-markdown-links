---
obsidian-dev-utils:
  demo-vault-validation:
    allow-wikilinks: "The related property is a wikilink on purpose: it is the natively-resolved backlink this note compares against."
related: "[[Target note]]"
reference: "[Target note](<Targets/Target note.md>)"
seeAlso: "[Third target](<Targets/Third target.md>) and [Obsidian Help](https://help.obsidian.md)"
---
# Backlinks

A link only counts as a **backlink** if Obsidian can resolve it. Current Obsidian already resolves a property whose whole value is ONE link, wiki or markdown, so those count on their own. What it does not resolve is a link inside a value holding **several** links: such a link is not a backlink of its target. This plugin resolves each of them, so they appear in the target note's **Backlinks** pane like a link written in the note body.

This note's frontmatter links to:

- [Target note](<./Targets/Target note.md>) through `related` (a wikilink) and through `reference` (a single markdown link). Obsidian counts both by itself.
- `Targets/Third target.md` through `seeAlso`, a value holding **two** markdown links: that note and an external one. Only the plugin makes this one count. The note is named here in code rather than linked, because a link in this body would make it a backlink by itself and hide the difference.

## Try it

```code-button
---
caption: Open "Third target" and show its Backlinks pane
---
await require('/demoSetup.ts').showThirdTargetBacklinks(app);
```

Manual equivalent: open `Targets/Third target.md` (the **Quick switcher**, or the file explorer) and open its **Backlinks** pane (**Backlinks** in the right sidebar).

**Step 1.** You will see this note listed - even though the only link to it lives in **frontmatter**, inside a value with **several** links (`seeAlso`), not in the body.

**Step 2.** Turn the plugin off. The backlink disappears, because Obsidian does not resolve a link inside a multi-link value:

```code-button
---
caption: Turn the plugin off
---
await require('/demoSetup.ts').disablePlugin(app);
```

**Step 3.** Turn it back on and the backlink returns:

```code-button
---
caption: Turn the plugin back on
---
await require('/demoSetup.ts').enablePlugin(app);
```

Manual equivalent for both: toggle `Frontmatter Markdown Links` in **Settings -> Community plugins**. The Backlinks pane does not redraw by itself on a toggle, so open another note and come back to `Targets/Third target.md` to see the change; the buttons redraw it for you.

Meanwhile [Target note](<./Targets/Target note.md>) lists this note the whole time, with the plugin on or off: `related` and `reference` each hold one link, which Obsidian counts natively. The plugin's job is the value that holds several.

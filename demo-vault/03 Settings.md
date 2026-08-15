# Settings

Open **Settings -> Community plugins -> Frontmatter Markdown Links** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Initialization

- `shouldShowInitializationNotice`
  - whether to show a notice when the plugin is being initialized. Turn it off for a quieter startup.

## Renames

- `shouldHandleRenames`
  - whether the plugin handles note renames itself. When enabled, it overrides Obsidian's default link-update mechanism; when disabled, it falls back to that default. The default mechanism can ruin some of your frontmatter links, which is why the plugin handles renames on its own by default.

### See a rename happen

Rename the note that [02 Backlinks](<./02 Backlinks.md>) points at through its `reference` property, then look at that property - the markdown link followed the rename:

```code-button
---
caption: Rename "Second target"
---
await require('/demoSetup.ts').renameSecondTarget(app);
```

```code-button
---
caption: Rename it back
---
await require('/demoSetup.ts').restoreSecondTargetName(app);
```

Manual equivalent: rename `Targets/Second target.md` in the File Explorer, and rename it back afterwards.

To compare against Obsidian's own mechanism, turn the setting off first, rename, and look at the property again:

```code-button
---
caption: Let Obsidian handle renames instead
---
await require('/demoSetup.ts').changeSettings(app, { shouldHandleRenames: false });
```

```code-button
---
caption: Back to the plugin handling renames (the default)
---
await require('/demoSetup.ts').changeSettings(app, { shouldHandleRenames: true });
```

Manual equivalent: toggle **Should handle renames** below.

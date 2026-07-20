[Docs](https://github.com/mnaoumov/obsidian-frontmatter-markdown-links/)

# Settings

Open **Settings -> Community plugins -> Frontmatter Markdown Links** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Initialization

- `shouldShowInitializationNotice` - whether to show a notice when the plugin is being initialized. Turn it off for a quieter startup.

## Renames

- `shouldHandleRenames` - whether the plugin handles note renames itself. When enabled, it overrides Obsidian's default link-update mechanism; when disabled, it falls back to that default. The default mechanism can ruin some of your frontmatter links, which is why the plugin handles renames on its own by default.

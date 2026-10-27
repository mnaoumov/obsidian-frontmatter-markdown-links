# Settings

Open **Settings -> Community plugins -> `Frontmatter Markdown Links`** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Initialization

- `shouldShowInitializationNotice`
  - whether to show a notice when the plugin is being initialized. Turn it off for a quieter startup.

## Cache sharing

1. `shouldShareCache`
   1. disabled by default. Enable it on each device to share optional frontmatter cache seeds, then reload the plugin. A device validates the parser version, payload and each local file's size, modification time and content hash before reuse. Missing, changed or incompatible files are rebuilt normally; sharing is never required for links to work.
2. `cacheSharingFolder`
   1. defaults to `Plugin data`. Choose a non-dot vault folder, then reload the plugin. Seeds are Markdown files, so Obsidian Sync carries them with its default file types. Publication runs once, one minute after startup, rather than on every edit. A later restart can refresh the seed.

Add the chosen folder to Obsidian's **Excluded files** if you want it hidden from search, graph and the quick switcher. Exclusion still permits metadata parsing. The plugin never changes vault-wide exclusions for you.

The working cache remains device-local in IndexedDB. Upgrading imports the old cache once; deleting notes later does not import them again. Seed files contain derived frontmatter links and original property text, so share them only with the same people who can read the vault. You can remove the shared seed folder at any time; the local rebuild path remains available.

## Renames moved to another plugin

On a rename, Obsidian itself updates a property whose whole value is one link, markdown or wiki, and each link of a list property. Inside a value holding several links its update cannot be relied on: it can leave a link pointing at the old name, or update the wrong one. Up to version 2, this plugin handled note renames itself. Since **3.0.0** it does not: rename and delete handling is owned by [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler), a separate plugin, so a vault has exactly one of them rather than one per plugin that happened to bundle a copy.

Nothing here replaces it. Install that plugin and its settings tab holds every rename and delete option, including the `shouldHandleRenames` toggle that used to live on this page. Decline, and this plugin keeps all of its other features while Obsidian's own link update runs on renames.

Two keys are left behind to make the handover work. Neither is a toggle you set - they are bookkeeping, shown here because they are in your `data.json`:

- `isAdvancedRenameAndDeleteHandlerSuggestionDeclined`
  - whether you have already answered "not now" to the suggestion notice. It silences the notice, not the banner at the top of this tab: opening these settings is a fresher signal than an answer you gave earlier.
- `proposedShouldHandleRenames`
  - the `shouldHandleRenames` value you had before the upgrade, held until it can be offered to `Advanced Rename and Delete Handler`. It is `null` once that offer has been accepted, and on a fresh install that never had the old setting. Cancelling the offer leaves it here, so it comes back next time.

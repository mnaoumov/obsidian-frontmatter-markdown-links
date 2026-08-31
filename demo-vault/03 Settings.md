# Settings

Open **Settings -> Community plugins -> Frontmatter Markdown Links** to configure the plugin. Each option below lists the setting key stored in the plugin's `data.json`.

## Initialization

- `shouldShowInitializationNotice`
  - whether to show a notice when the plugin is being initialized. Turn it off for a quieter startup.

## Renames moved to another plugin

Up to version 2, this plugin handled note renames itself, because Obsidian's own link update can ruin some of your frontmatter links. Since **3.0.0** it does not: rename and delete handling is owned by [Advanced Rename and Delete Handler](https://github.com/mnaoumov/obsidian-advanced-rename-and-delete-handler), a separate plugin, so a vault has exactly one of them rather than one per plugin that happened to bundle a copy.

Nothing here replaces it. Install that plugin and its settings tab holds every rename and delete option, including the `shouldHandleRenames` toggle that used to live on this page. Decline, and this plugin keeps all of its other features while Obsidian's own link update runs on renames.

Two keys are left behind to make the handover work. Neither is a toggle you set - they are bookkeeping, shown here because they are in your `data.json`:

- `isAdvancedRenameAndDeleteHandlerSuggestionDeclined`
  - whether you have already answered "not now" to the suggestion notice. It silences the notice, not the banner at the top of this tab: opening these settings is a fresher signal than an answer you gave earlier.
- `proposedShouldHandleRenames`
  - the `shouldHandleRenames` value you had before the upgrade, held until it can be offered to Advanced Rename and Delete Handler. It is `null` once that offer has been accepted, and on a fresh install that never had the old setting. Cancelling the offer leaves it here, so it comes back next time.

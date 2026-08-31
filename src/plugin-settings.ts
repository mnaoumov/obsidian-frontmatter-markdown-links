export class PluginSettings {
  public isAdvancedRenameAndDeleteHandlerSuggestionDeclined = false;

  // The legacy `shouldHandleRenames` value, waiting to be offered to Advanced Rename and Delete Handler.
  // Non-`null` means an offer is still pending; `null` means there is nothing to offer, which is also what a
  // Fresh install has. One property rather than a flag plus a value, so a fresh install can never be told it
  // Has a migration waiting.
  public proposedShouldHandleRenames: boolean | null = null;

  public shouldShowInitializationNotice = true;
}

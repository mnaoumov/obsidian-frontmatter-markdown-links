import { defineObsidianPluginVitestConfig } from 'obsidian-dev-utils/script-utils/test-runners/vitest-config';

export const config = defineObsidianPluginVitestConfig({
  editContext(context) {
    // The Bases suites drive a long single `Runtime.evaluate`, which outlives the transport's default
    // 30s per-command timeout.
    context.desktop.environmentOptions = {
      obsidianTransport: {
        commandTimeoutInMilliseconds: context.androidTimeoutInMilliseconds,
        type: 'obsidian-cdp'
      }
    };
  }
});

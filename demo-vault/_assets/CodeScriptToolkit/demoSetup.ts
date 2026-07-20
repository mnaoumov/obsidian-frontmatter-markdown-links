import type { App } from 'obsidian';

import { Notice } from 'obsidian';
import {
  enableCommunityPlugin,
  installCommunityPlugin
} from 'obsidian-dev-utils/obsidian/community-plugins';

// Frontmatter Markdown Links works automatically once enabled - it upgrades markdown links written
// Inside YAML frontmatter into real, clickable, resolvable links, so there is nothing for a
// Code-button to drive; the demo notes just show frontmatter you can click. The only helper the
// Vault needs is the shared CodeScript Toolkit installer used by the prerequisite note's button.
export async function installAndEnable(app: App, pluginId: string): Promise<void> {
  await installCommunityPlugin({ app, pluginId });
  await enableCommunityPlugin({ app, pluginId });
  new Notice(`Installed and enabled: ${pluginId}`);
}

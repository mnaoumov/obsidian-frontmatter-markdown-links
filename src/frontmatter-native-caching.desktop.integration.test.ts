import type {
  MarkdownView,
  TFile
} from 'obsidian';

import {
  ContextId,
  evalInObsidian
} from 'obsidian-integration-testing';
import { getTempVault } from 'obsidian-integration-testing/vitest-global-setup-plugin';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it
} from 'vitest';

// Regression coverage for what this plugin must get out of frontmatter, pinned against the reality
// That modern Obsidian (>= ~1.12; NOT 1.8.10) natively caches SINGLE-value internal links (wikilink
// AND markdown) plus array-element single links, but does NOT cache multiple links embedded in one
// String value. The plugin's remaining job is that last case; everything the plugin needs to end up
// In `cache.frontmatterLinks`, and every markdown frontmatter link rendering as a clickable link, is
// Asserted here so a future refactor (e.g. delegating to `parseFrontmatterLinks`) cannot silently
// Drop it. In 1.8.10 none of the markdown-link shapes below resolved/rendered without the plugin.

const vault = getTempVault();

interface CollectedLinkTexts {
  linkDataTexts: string[];
  metadataLinkTexts: string[];
}

interface Context {
  sourceFile: TFile;
}

interface FrontmatterLinkCacheOffsets {
  endOffset?: number;
  startOffset?: number;
}

interface FrontmatterLinkDump {
  displayText: string | undefined;
  endOffset: number | undefined;
  key: string;
  link: string;
  startOffset: number | undefined;
}

const contextId = new ContextId<Context>();

beforeAll(async () => {
  vault.populate({
    'source.md': `---
single: "[Single](target.md)"
multiInline: "text [A](target.md) and [B](target2.md)"
list:
  - "[ListItem](target.md)"
wiki: "[[target]]"
externalSingle: "https://example.com"
---
# Source
`,
    'target.md': '# Target\n',
    'target2.md': '# Target2\n'
  });

  await evalInObsidian({
    contextId,
    fn: async ({ app, context }) => {
      const sourceFile = app.vault.getFileByPath('source.md');
      if (!sourceFile) {
        throw new Error('source.md not found');
      }
      context.sourceFile = sourceFile;
      await app.workspace.getLeaf(true).openFile(sourceFile);
      // Live preview renders the property editor where the markdown-link pills live.
      const markdownView = app.workspace.getActiveFileView() as MarkdownView;
      await markdownView.setState({ mode: 'source', source: false }, { history: false });
      await sleep(2000);
    },
    vaultPath: vault.path
  });
});

afterAll(async () => {
  await contextId.dispose();
});

describe('frontmatter link data (what the plugin needs from frontmatter)', () => {
  it('populates cache.frontmatterLinks for every internal-link shape, with offsets for multi-link strings', async () => {
    const links = await evalInObsidian({
      contextId,
      fn: ({ app, context }): FrontmatterLinkDump[] => {
        const cache = app.metadataCache.getFileCache(context.sourceFile);
        return (cache?.frontmatterLinks ?? []).map((l) => ({
          displayText: l.displayText,
          endOffset: (l as FrontmatterLinkCacheOffsets).endOffset,
          key: l.key,
          link: l.link,
          startOffset: (l as FrontmatterLinkCacheOffsets).startOffset
        }));
      },
      vaultPath: vault.path
    });

    // Single-value markdown link: natively cached (whole value is one link), no offsets.
    const single = links.find((l) => l.key === 'single');
    expect(single).toMatchObject({ displayText: 'Single', link: 'target.md' });
    expect(single?.startOffset).toBeUndefined();

    // Multiple links in one string: NOT natively cached — the plugin contributes both, with offsets.
    const multiInline = links.filter((l) => l.key === 'multiInline');
    expect(multiInline).toHaveLength(2);
    expect(multiInline.every((l) => typeof l.startOffset === 'number' && typeof l.endOffset === 'number')).toBe(true);
    expect(multiInline.map((l) => l.link).sort()).toEqual(['target.md', 'target2.md']);

    // Array-element single link and single wikilink: natively cached.
    expect(links.some((l) => l.key === 'list.0' && l.link === 'target.md')).toBe(true);
    expect(links.some((l) => l.key === 'wiki' && l.link === 'target')).toBe(true);

    // External links are not internal frontmatter links — never in frontmatterLinks.
    expect(links.some((l) => l.link.includes('example.com'))).toBe(false);
  });
});

describe('frontmatter markdown links render as clickable links (regression vs Obsidian 1.8.10)', () => {
  it('renders every markdown-link shape as a resolved clickable link in the property editor', async () => {
    const result = await evalInObsidian({
      contextId,
      fn: async () => {
        function collect(): CollectedLinkTexts {
          const linkDataTexts = Array.from(activeDocument.querySelectorAll('[data-frontmatter-markdown-links-link-data]'))
            .map((el) => el.textContent);
          const metadataLinkTexts = Array.from(activeDocument.querySelectorAll('.metadata-property-value .internal-link, .metadata-link'))
            .map((el) => el.textContent);
          return { linkDataTexts, metadataLinkTexts };
        }

        let collected = collect();
        for (let attempt = 0; attempt < 20 && !collected.linkDataTexts.includes('ListItem'); attempt++) {
          await sleep(250);
          collected = collect();
        }

        return {
          linkDataTexts: [...new Set(collected.linkDataTexts)],
          metadataLinkTexts: [...new Set(collected.metadataLinkTexts)]
        };
      },
      vaultPath: vault.path
    });

    // The plugin uniquely renders list markdown links with its own click/hover link data.
    expect(result.linkDataTexts).toContain('ListItem');

    // Every markdown frontmatter link resolves and renders as a clickable internal link — the single
    // Value via native rendering, the multi-link string as per-segment link pills, the list item via
    // The plugin. None of these worked in Obsidian 1.8.10.
    for (const displayText of ['Single', 'A', 'B', 'ListItem']) {
      expect(result.metadataLinkTexts).toContain(displayText);
    }
  });
});

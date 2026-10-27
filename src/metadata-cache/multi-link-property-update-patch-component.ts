import type { FrontmatterLinkCacheWithOffsets } from '@mnaoumov/obsidian-lib/frontmatter-link-cache-with-offsets';
import type {
  CustomArrayDict,
  LinkChangeUpdate
} from '@obsidian-typings/obsidian-public-latest';

import { MonkeyAroundComponent } from '@mnaoumov/obsidian-lib/components/monkey-around-component';
import { isFrontmatterLinkCacheWithOffsets } from '@mnaoumov/obsidian-lib/frontmatter-link-cache-with-offsets';
import {
  castTo,
  getNestedPropertyValue,
  setNestedPropertyValue
} from '@mnaoumov/typescript-lib/object-utils';
import {
  App,
  TFile
} from 'obsidian';

interface SpanChange {
  readonly change: string;
  readonly link: FrontmatterLinkCacheWithOffsets;
  readonly linkChangeUpdate: LinkChangeUpdate;
}

/*
 * Obsidian's own link update knows a frontmatter link by its key alone. It rebuilds the link from the
 * entry's `original`, by an anchored regex, and writes the result back as the WHOLE value of that key.
 * The entries this plugin adds for a multi-link value carry that whole value as `original`, so the
 * markdown-link regex, whose lazy text group spans from the value's first `[`, reads every value as
 * its LAST markdown link and writes the renamed note's name into that link, whichever link was renamed.
 *
 * So each such entry goes into the update as a stand-in whose `original` is only its own span, which
 * Obsidian rewrites correctly. Its rewritten span is then spliced back into the value, together with
 * every other span of that value the same update renamed.
 */
export class MultiLinkPropertyUpdatePatchComponent extends MonkeyAroundComponent {
  private readonly linkByStandIn = new WeakMap<object, FrontmatterLinkCacheWithOffsets>();

  public constructor(private readonly app: App) {
    super();
  }

  public override onload(): void {
    this.registerMethodPatch({
      $object: this.app.fileManager,
      methodName: 'updateAllLinks',
      patchHandler: ({
        fallback,
        originalArguments: [linkUpdates]
      }) => {
        // In place, so the array keeps the identity another plugin's patch of this method may key on.
        for (const linkUpdate of linkUpdates) {
          linkUpdate.reference = castTo<typeof linkUpdate.reference>(this.toStandIn(linkUpdate.reference));
        }
        return fallback();
      }
    });

    this.registerMethodPatch({
      $object: this.app.metadataCache,
      methodName: 'updateInternalLinks',
      patchHandler: async ({
        originalArguments: [updates],
        originalMethodBound
      }) => {
        const linkChangeUpdates = castTo<CustomArrayDict<LinkChangeUpdate>>(updates);
        const spanChangesBySourcePath = new Map<string, SpanChange[]>();

        // A `Map` iteration survives `remove` deleting the entry it is on.
        for (const [sourcePath, sourceLinkChangeUpdates] of linkChangeUpdates.data) {
          const spanChanges: SpanChange[] = [];
          // Collected first, as `remove` edits this very array.
          for (const linkChangeUpdate of sourceLinkChangeUpdates) {
            const link = this.linkByStandIn.get(linkChangeUpdate.reference);
            if (link) {
              spanChanges.push({ change: linkChangeUpdate.change, link, linkChangeUpdate });
            }
          }
          for (const spanChange of spanChanges) {
            linkChangeUpdates.remove(sourcePath, spanChange.linkChangeUpdate);
          }
          if (spanChanges.length > 0) {
            spanChangesBySourcePath.set(sourcePath, spanChanges);
          }
        }

        await originalMethodBound(updates);

        for (const [sourcePath, spanChanges] of spanChangesBySourcePath) {
          await this.applySpanChanges(sourcePath, spanChanges);
        }
      }
    });
  }

  private async applySpanChanges(sourcePath: string, spanChanges: SpanChange[]): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      return;
    }

    const spanChangesByKey = new Map<string, SpanChange[]>();
    for (const spanChange of spanChanges) {
      let keySpanChanges = spanChangesByKey.get(spanChange.link.key);
      if (!keySpanChanges) {
        keySpanChanges = [];
        spanChangesByKey.set(spanChange.link.key, keySpanChanges);
      }
      keySpanChanges.push(spanChange);
    }

    await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
      for (const [key, keySpanChanges] of spanChangesByKey) {
        const cachedValue = getNestedPropertyValue(frontmatter, key);
        // The offsets index the value the entries were cached from. Anything else, and they may point
        // into a different link, the very misdirected rename this patch exists to prevent: leave it stale.
        if (typeof cachedValue !== 'string' || keySpanChanges.some((spanChange) => spanChange.link.original !== cachedValue)) {
          continue;
        }
        let value = cachedValue;
        // Right to left, so a splice never shifts the offsets of a span still to come.
        keySpanChanges.sort((a, b) => b.link.startOffset - a.link.startOffset);
        for (const { change, link } of keySpanChanges) {
          value = value.slice(0, link.startOffset) + change + value.slice(link.endOffset);
        }
        setNestedPropertyValue({ $object: frontmatter, path: key, value });
      }
    });
  }

  private toStandIn(reference: object): object {
    if (this.linkByStandIn.has(reference) || !isFrontmatterLinkCacheWithOffsets(castTo(reference))) {
      return reference;
    }
    const link = castTo<FrontmatterLinkCacheWithOffsets>(reference);
    const standIn = {
      ...link,
      original: link.original.slice(link.startOffset, link.endOffset)
    };
    this.linkByStandIn.set(standIn, link);
    return standIn;
  }
}

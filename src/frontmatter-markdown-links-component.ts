import type { AbortSignalComponent } from '@mnaoumov/obsidian-lib/components/abort-signal-component';
import type { PluginNoticeComponent } from '@mnaoumov/obsidian-lib/components/plugin-notice-component';
import type { EditorExtensionRegistrar } from '@mnaoumov/obsidian-lib/editor-extension-registrar';
import type { FrontmatterLinkCacheWithOffsets } from '@mnaoumov/obsidian-lib/frontmatter-link-cache-with-offsets';
import type {
  App,
  CachedMetadata,
  FrontmatterLinkCache
} from 'obsidian';

import { AllWindowsEventComponent } from '@mnaoumov/obsidian-lib/components/all-windows-event-component';
import { LayoutReadyComponent } from '@mnaoumov/obsidian-lib/components/layout-ready-component';
import { appendCodeBlock } from '@mnaoumov/obsidian-lib/html-element';
import { loop } from '@mnaoumov/obsidian-lib/loop';
import { getCacheSafe } from '@mnaoumov/obsidian-lib/metadata-cache';
import { parseFrontmatterLinks } from '@mnaoumov/obsidian-lib/parse-link';
import {
  getMarkdownFilesSorted,
  trashSafe
} from '@mnaoumov/obsidian-lib/vault';
import { filterInPlace } from '@mnaoumov/typescript-lib/array';
import {
  convertAsyncToSync,
  invokeAsyncSafely
} from '@mnaoumov/typescript-lib/async';
import {
  getNestedPropertyValue,
  normalizeOptionalProperties
} from '@mnaoumov/typescript-lib/object-utils';
import { getBasesContextConstructor } from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  Keymap,
  MarkdownView,
  parseYaml,
  TAbstractFile,
  TFile
} from 'obsidian';

import type { LinkFixer } from './link-fixer.ts';
import type { PatchedInputElementMap } from './patched-input-element-map.ts';
import type { PluginSettingsComponent } from './plugin-settings-component.ts';

import { FrontMatterLinksViewPlugin } from './frontmatter-links-editor-extension.ts';
import { FrontmatterMarkdownLinksCache } from './frontmatter-markdown-links-cache.ts';
import { getLinkData } from './link-data.ts';
import { AbstractInputSuggestGetValuePatchComponent } from './patches/abstract-input-suggest-get-value-patch-component.ts';
import { BasesNoteGetPatchComponent } from './patches/bases-note-get-patch-component.ts';
import { EditorGetClickableTokenAtPatchComponent } from './patches/editor-get-clickable-token-at-patch-component.ts';
import { MenuShowAtMouseEventPatchComponent } from './patches/menu-show-at-mouse-event-patch-component.ts';
import { MultitextPropertyWidgetRenderPatchComponent } from './patches/multitext-property-widget-render-patch-component.ts';
import { TextPropertyWidgetRenderPatchComponent } from './patches/text-property-widget-render-patch-component.ts';
import { isSourceMode } from './source-mode.ts';

interface FrontmatterMarkdownLinksComponentConstructorParams {
  readonly abortSignalComponent: AbortSignalComponent;
  readonly app: App;
  readonly editorExtensionRegistrar: EditorExtensionRegistrar;
  readonly linkFixer: LinkFixer;
  readonly patchedInputElementMap: PatchedInputElementMap;
  readonly pluginNoticeComponent: PluginNoticeComponent;
  readonly pluginSettingsComponent: PluginSettingsComponent;
}

interface FrontmatterMarkdownLinksComponentHandleMetadataCacheChangedParams {
  readonly cache: CachedMetadata;
  readonly data: string;
  readonly file: TFile;
}

interface FrontmatterMarkdownLinksComponentProcessFrontmatterLinksInFileParams {
  readonly cache: CachedMetadata;
  readonly data?: string;
  readonly file: TFile;
}

interface FrontmatterMarkdownLinksComponentProcessFrontmatterLinksParams {
  readonly cache: CachedMetadata;
  readonly file: TFile;
}

export class FrontmatterMarkdownLinksComponent extends LayoutReadyComponent {
  private readonly abortSignalComponent: AbortSignalComponent;
  private readonly currentlyProcessingFiles = new Set<string>();
  private readonly editorExtensionRegistrar: EditorExtensionRegistrar;
  private frontmatterMarkdownLinksCache = new FrontmatterMarkdownLinksCache();
  private isEditorPatched = false;
  private readonly linkFixer: LinkFixer;
  private readonly patchedInputElementMap: PatchedInputElementMap;
  private readonly pluginNoticeComponent: PluginNoticeComponent;
  private readonly pluginSettingsComponent: PluginSettingsComponent;

  public constructor(params: FrontmatterMarkdownLinksComponentConstructorParams) {
    super(params.app);
    this.abortSignalComponent = params.abortSignalComponent;
    this.editorExtensionRegistrar = params.editorExtensionRegistrar;
    this.linkFixer = params.linkFixer;
    this.patchedInputElementMap = params.patchedInputElementMap;
    this.pluginNoticeComponent = params.pluginNoticeComponent;
    this.pluginSettingsComponent = params.pluginSettingsComponent;
  }

  public override onload(): void {
    super.onload();

    const textPropertyWidget = this.app.metadataTypeManager.registeredTypeWidgets.text;

    this.addChild(
      new TextPropertyWidgetRenderPatchComponent({
        patchedInputElementMap: this.patchedInputElementMap,
        textPropertyWidget
      })
    );

    this.addChild(
      new AbstractInputSuggestGetValuePatchComponent({
        patchedInputElementMap: this.patchedInputElementMap
      })
    );

    const multitextPropertyWidget = this.app.metadataTypeManager.registeredTypeWidgets.multitext;

    this.addChild(
      new MultitextPropertyWidgetRenderPatchComponent({
        app: this.app,
        multitextPropertyWidget
      })
    );

    this.editorExtensionRegistrar.registerEditorExtension(FrontMatterLinksViewPlugin.createEditorExtension(this.app));

    this.register(convertAsyncToSync(this.clearMetadataCache.bind(this)));
    this.register(this.refreshMarkdownViews.bind(this));
    this.refreshMarkdownViews();
  }

  protected override async onLayoutReady(): Promise<void> {
    await this.processAllNotes();
    // The plugin can be turned off while the notes are still being processed. Whatever is registered on an
    // unloaded component is never unregistered, so a `changed` handler added now would outlive the plugin
    // and put its links straight back when the unload's own `changed` triggers reach it.
    if (!this._loaded) {
      return;
    }

    this.registerEvent(this.app.metadataCache.on('changed', convertAsyncToSync((file, data, cache) => this.handleMetadataCacheChanged({ cache, data, file }))));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleRename.bind(this)));
    this.registerEvent(this.app.workspace.on('file-open', this.handleFileOpen.bind(this)));
    this.handleFileOpen();

    this.addChild(new MenuShowAtMouseEventPatchComponent(this.app));

    const allWindowsEventComponent = this.addChild(new AllWindowsEventComponent(this.app));
    allWindowsEventComponent.registerAllDocumentsDomEvent({
      callback: this.handleMouseDown.bind(this),
      options: { capture: true },
      type: 'mousedown'
    });
    allWindowsEventComponent.registerAllDocumentsDomEvent({
      callback: this.handleMouseOver.bind(this),
      options: { capture: true },
      type: 'mouseover'
    });

    await this.patchBasesNote();
  }

  private async clearMetadataCache(): Promise<void> {
    for (const filePath of this.frontmatterMarkdownLinksCache.getFilePaths()) {
      const cache = this.app.metadataCache.getCache(filePath);
      if (!cache?.frontmatterLinks) {
        continue;
      }

      const keys = new Set(this.frontmatterMarkdownLinksCache.getKeys(filePath));
      cache.frontmatterLinks = cache.frontmatterLinks.filter((link) => !keys.has(link.key));
      if (cache.frontmatterLinks.length === 0) {
        delete cache.frontmatterLinks;
      }

      const file = this.app.vault.getFileByPath(filePath);
      if (!file) {
        continue;
      }
      this.resolveLinks(file);
      const data = await this.app.vault.read(file);
      this.app.metadataCache.trigger('changed', file, data, cache);
    }
  }

  /**
   * Brings the note's cache up to date and returns the object Obsidian holds for it. `getCacheSafe` returns
   * a shallow copy, so a `frontmatterLinks` array created on that copy (the note had none, as after the
   * plugin took its links back on unload) never reaches Obsidian, and `resolveLinks` would not count it.
   */
  private async getLiveCache(note: TFile): Promise<CachedMetadata | null> {
    const cacheCopy = await getCacheSafe(this.app, note);
    return cacheCopy ? this.app.metadataCache.getCache(note.path) : null;
  }

  private handleDelete(file: TAbstractFile): void {
    this.frontmatterMarkdownLinksCache.delete(file.path);
  }

  private handleFileOpen(): void {
    if (this.isEditorPatched || !this.app.workspace.activeEditor?.editor) {
      return;
    }

    this.isEditorPatched = true;

    this.addChild(
      new EditorGetClickableTokenAtPatchComponent({
        editor: this.app.workspace.activeEditor.editor
      })
    );
  }

  private async handleMetadataCacheChanged(params: FrontmatterMarkdownLinksComponentHandleMetadataCacheChangedParams): Promise<void> {
    const { cache, data, file } = params;
    await this.processFrontmatterLinksInFile({ cache, data, file });
  }

  private handleMouseDown($event: MouseEvent): void {
    const RIGHT_BUTTON = 2;
    if ($event.button === RIGHT_BUTTON) {
      return;
    }

    if (!Keymap.isModEvent($event) && isSourceMode(this.app)) {
      return;
    }

    const target = $event.target as HTMLElement | undefined;
    if (!target) {
      return;
    }

    const linkData = getLinkData(target);
    if (!linkData) {
      return;
    }

    $event.preventDefault();
    $event.stopImmediatePropagation();

    // The plugin opens the link itself on `mousedown`, so the browser's follow-up activation event must
    // be swallowed to stop Obsidian's native handler from opening the link a second time. A left-click
    // produces `click`, while a middle-click produces `auxclick` (no `click` fires for non-primary
    // buttons) - both must be blocked. Whichever fires removes both listeners so neither lingers.
    target.addEventListener('click', swallowFollowUpEvent, { capture: true });
    target.addEventListener('auxclick', swallowFollowUpEvent, { capture: true });

    if (linkData.isExternalUrl) {
      window.open(linkData.url, $event.button === 1 ? 'tab' : '');
    } else {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        return;
      }

      invokeAsyncSafely(() => this.app.workspace.openLinkText(linkData.url, activeFile.path, Keymap.isModEvent($event)));
    }

    function swallowFollowUpEvent(event2: Event): void {
      event2.preventDefault();
      event2.stopImmediatePropagation();
      target?.removeEventListener('click', swallowFollowUpEvent, { capture: true });
      target?.removeEventListener('auxclick', swallowFollowUpEvent, { capture: true });
    }
  }

  private handleMouseOver($event: MouseEvent): void {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

    const target = $event.target as HTMLElement;
    const linkData = getLinkData(target);
    if (!linkData || linkData.isExternalUrl) {
      return;
    }

    $event.preventDefault();

    this.app.workspace.trigger('hover-link', {
      event: $event,
      hoverParent: this,
      linktext: linkData.url,
      source: markdownView?.getHoverSource() ?? 'source',
      targetEl: target
    });
  }

  private handleRename(file: TAbstractFile, oldPath: string): void {
    if (!(file instanceof TFile)) {
      return;
    }

    this.frontmatterMarkdownLinksCache.rename(oldPath, file);
  }

  private async patchBasesNote(): Promise<void> {
    const basesContextCtor = getBasesContextConstructor(this.app);

    let mdFile = this.app.vault.getMarkdownFiles()[0];
    let shouldDeleteMdFile = false;
    if (!mdFile) {
      // eslint-disable-next-line n/no-unsupported-features/node-builtins -- window.crypto is the Web Crypto API, available in Obsidian's Electron renderer; the rule incorrectly flags it as a Node experimental builtin.
      mdFile = await this.app.vault.create(`__TEMP__${window.crypto.randomUUID()}.md`, '');
      shouldDeleteMdFile = true;
    }

    const context = new basesContextCtor(this.app, {}, {}, mdFile);

    this.addChild(
      new BasesNoteGetPatchComponent({
        app: this.app,
        basesNote: context._local.note,
        linkFixer: this.linkFixer
      })
    );

    if (shouldDeleteMdFile) {
      await trashSafe(this.app, mdFile);
    }
  }

  private async processAllNotes(): Promise<void> {
    this.frontmatterMarkdownLinksCache = new FrontmatterMarkdownLinksCache();
    await this.frontmatterMarkdownLinksCache.init(this.app);

    const cachedFilePaths = new Set(this.frontmatterMarkdownLinksCache.getTrackedFilePaths());

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationString }) => `Processing frontmatter links ${iterationString} - ${item.path}`,
      items: getMarkdownFilesSorted(this.app),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (note) => {
        cachedFilePaths.delete(note.path);
        if (this.frontmatterMarkdownLinksCache.isCacheValid(note)) {
          const frontmatterMarkdownLinksCacheLinks = this.frontmatterMarkdownLinksCache.getLinks(note);
          if (frontmatterMarkdownLinksCacheLinks.length === 0) {
            return;
          }
          const cache = await this.getLiveCache(note);
          if (!cache) {
            return;
          }
          cache.frontmatterLinks ??= [];

          const obsidianLinkMap = new Map<string, FrontmatterLinkCache>();

          for (const link of cache.frontmatterLinks) {
            obsidianLinkMap.set(link.key, link);
          }

          const frontmatterMarkdownLinksCacheKeys = new Set(frontmatterMarkdownLinksCacheLinks.map((link) => link.key));
          filterInPlace(cache.frontmatterLinks, (link) => !frontmatterMarkdownLinksCacheKeys.has(link.key));

          for (const link of frontmatterMarkdownLinksCacheLinks) {
            const value = getNestedPropertyValue((cache.frontmatter ?? {}) as Record<string, unknown>, link.key);
            // Legacy single-value link entries (no offsets) were persisted by versions predating
            // Obsidian's native caching of single frontmatter links. Drop them so the plugin stops
            // shadowing and double-counting the now-native entry; current contributions always carry
            // offsets. When such an entry is dropped, restore Obsidian's own entry for that key.
            const isLegacySingleValueLink = !('startOffset' in link);
            if (isLegacySingleValueLink || value !== link.original) {
              this.frontmatterMarkdownLinksCache.deleteKey({ filePath: note.path, key: link.key });
              const obsidianLink = obsidianLinkMap.get(link.key);
              if (obsidianLink) {
                cache.frontmatterLinks.push(obsidianLink);
                obsidianLinkMap.delete(link.key);
              }
              continue;
            }

            cache.frontmatterLinks.push(link);
          }

          this.resolveLinks(note);
          return;
        }

        const cache = await this.getLiveCache(note);
        if (!cache) {
          return;
        }
        await this.processFrontmatterLinksInFile({ cache, file: note });
      },
      progressBarTitle: createFragment((fragment) => {
        appendCodeBlock(fragment, 'Frontmatter Markdown Links');
        fragment.appendText(': Initializing...');
      }),
      shouldContinueOnError: true,
      shouldShowProgressBar: this.pluginSettingsComponent.settings.shouldShowInitializationNotice
    });

    // `loop` RETURNS when the abort signal fires, it does not throw, so an unload mid-index lands here
    // with every note it never reached still in the set. Those paths are unvisited, not orphaned.
    if (this.abortSignalComponent.abortSignal.aborted) {
      return;
    }

    // Whatever is left named no note in the vault - drop its links and its mtime row alike.
    for (const filePath of cachedFilePaths) {
      this.frontmatterMarkdownLinksCache.delete(filePath);
    }
  }

  private processFrontmatterLinks(params: FrontmatterMarkdownLinksComponentProcessFrontmatterLinksParams): boolean {
    const { cache, file } = params;
    const filePath = file.path;

    // Obsidian natively caches single-value internal frontmatter links (both wikilinks and markdown
    // links) as well as single links held as array elements, so the plugin only needs to contribute
    // links embedded within a multi-link string value - the one shape Obsidian does not cache. Those
    // are exactly the `multiValueFrontmatterLinks` from `parseFrontmatterLinks`, each carrying the
    // offsets into its frontmatter value.
    const { multiValueFrontmatterLinks } = parseFrontmatterLinks(cache.frontmatter);

    // Drop the plugin's previous contribution for this file before re-adding the current one.
    const staleKeys = new Set(this.frontmatterMarkdownLinksCache.getKeys(filePath));
    for (const staleKey of staleKeys) {
      this.frontmatterMarkdownLinksCache.deleteKey({ filePath, key: staleKey });
    }

    if (multiValueFrontmatterLinks.length === 0) {
      if (staleKeys.size > 0) {
        this.resolveLinks(file);
      }
      return false;
    }

    cache.frontmatterLinks ??= [];
    const contributedKeys = new Set(multiValueFrontmatterLinks.map((reference) => reference.key));
    filterInPlace(cache.frontmatterLinks, (link) => !contributedKeys.has(link.key));

    for (const reference of multiValueFrontmatterLinks) {
      const link = normalizeOptionalProperties<FrontmatterLinkCacheWithOffsets>({
        displayText: reference.displayText,
        endOffset: reference.endOffset,
        key: reference.key,
        link: reference.link,
        original: reference.original,
        startOffset: reference.startOffset
      });

      cache.frontmatterLinks.push(link);
      this.frontmatterMarkdownLinksCache.add(filePath, link);
    }

    this.resolveLinks(file);
    return true;
  }

  private async processFrontmatterLinksInFile(params: FrontmatterMarkdownLinksComponentProcessFrontmatterLinksInFileParams): Promise<void> {
    const { cache, file } = params;
    this.frontmatterMarkdownLinksCache.updateFile(file);

    if (this.currentlyProcessingFiles.has(file.path)) {
      return;
    }

    const hasFrontmatterLinks = this.processFrontmatterLinks({ cache, file });
    if (!hasFrontmatterLinks) {
      return;
    }

    this.currentlyProcessingFiles.add(file.path);
    const data = params.data ?? await this.app.vault.read(file);
    this.app.metadataCache.trigger('changed', file, data, cache);
    this.currentlyProcessingFiles.delete(file.path);
  }

  private refreshMarkdownViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType('markdown')) {
      if (!(leaf.view instanceof MarkdownView)) {
        continue;
      }

      const frontmatter = parseFrontmatter(leaf.view.rawFrontmatter);
      if (!frontmatter) {
        // Invalid YAML: Obsidian shows its own invalid-properties state, and a throw here would fail the plugin's load or unload.
        continue;
      }

      leaf.view.metadataEditor.synchronize({});
      leaf.view.metadataEditor.synchronize(frontmatter);
    }
  }

  /**
   * Rebuilds the note's `resolvedLinks` / `unresolvedLinks` rows from its cache as it stands now, then
   * announces it. Obsidian's own `resolveLinks` recounts every reference of the note, `frontmatterLinks`
   * included, and replaces the rows rather than adding to them, so the plugin's links are counted exactly
   * once however often a note is re-processed, and drop out of the counts when the plugin takes them back.
   * The `resolve` event is what an open Backlinks pane redraws on; `resolveLinks` does not fire it itself.
   */
  private resolveLinks(file: TFile): void {
    this.app.metadataCache.resolveLinks(file.path);
    this.app.metadataCache.trigger('resolve', file);
  }
}

function parseFrontmatter(rawFrontmatter: string): null | Record<string, unknown> {
  try {
    return parseYaml(rawFrontmatter) as Record<string, unknown>;
  } catch {
    return null;
  }
}

import type {
  App,
  CachedMetadata,
  FrontmatterLinkCache
} from 'obsidian';
import type { AbortSignalComponent } from 'obsidian-dev-utils/obsidian/components/abort-signal-component';
import type { PluginNoticeComponent } from 'obsidian-dev-utils/obsidian/components/plugin-notice-component';
import type { EditorExtensionRegistrar } from 'obsidian-dev-utils/obsidian/editor-extension-registrar';
import type { FrontmatterLinkCacheWithOffsets } from 'obsidian-dev-utils/obsidian/frontmatter-link-cache-with-offsets';

import { getBasesContextConstructor } from '@obsidian-typings/obsidian-public-latest/implementations';
import {
  Keymap,
  MarkdownView,
  parseYaml,
  TAbstractFile,
  TFile
} from 'obsidian';
import { filterInPlace } from 'obsidian-dev-utils/array';
import {
  convertAsyncToSync,
  invokeAsyncSafely
} from 'obsidian-dev-utils/async';
import {
  getNestedPropertyValue,
  normalizeOptionalProperties
} from 'obsidian-dev-utils/object-utils';
import { AllWindowsEventComponent } from 'obsidian-dev-utils/obsidian/components/all-windows-event-component';
import { LayoutReadyComponent } from 'obsidian-dev-utils/obsidian/components/layout-ready-component';
import { splitSubpath } from 'obsidian-dev-utils/obsidian/link';
import { loop } from 'obsidian-dev-utils/obsidian/loop';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/metadata-cache';
import { parseFrontmatterLinks } from 'obsidian-dev-utils/obsidian/parse-link';
import {
  getMarkdownFilesSorted,
  trashSafe
} from 'obsidian-dev-utils/obsidian/vault';

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
  readonly filePath: string;
}

interface FrontmatterMarkdownLinksComponentUpdateResolvedOrUnresolvedLinksCacheParams {
  readonly link: string;
  readonly notePath: string;
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
      const data = await this.app.vault.read(file);
      this.app.metadataCache.trigger('changed', file, data, cache);
    }
  }

  private handleDelete(file: TAbstractFile): void {
    this.frontmatterMarkdownLinksCache.delete(file.path);
  }

  private handleFileOpen(): void {
    if (this.isEditorPatched) {
      return;
    }

    if (!this.app.workspace.activeEditor?.editor) {
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

  private handleMouseDown(evt: MouseEvent): void {
    const RIGHT_BUTTON = 2;
    if (evt.button === RIGHT_BUTTON) {
      return;
    }

    if (!Keymap.isModEvent(evt) && isSourceMode(this.app)) {
      return;
    }

    const target = evt.target as HTMLElement | undefined;
    if (!target) {
      return;
    }

    const linkData = getLinkData(target);
    if (!linkData) {
      return;
    }

    evt.preventDefault();
    evt.stopImmediatePropagation();

    // The plugin opens the link itself on `mousedown`, so the browser's follow-up activation event must
    // Be swallowed to stop Obsidian's native handler from opening the link a second time. A left-click
    // Produces `click`, while a middle-click produces `auxclick` (no `click` fires for non-primary
    // Buttons) - both must be blocked. Whichever fires removes both listeners so neither lingers.
    target.addEventListener('click', swallowFollowUpEvent, { capture: true });
    target.addEventListener('auxclick', swallowFollowUpEvent, { capture: true });

    if (linkData.isExternalUrl) {
      window.open(linkData.url, evt.button === 1 ? 'tab' : '');
    } else {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        return;
      }

      invokeAsyncSafely(() => this.app.workspace.openLinkText(linkData.url, activeFile.path, Keymap.isModEvent(evt)));
    }

    function swallowFollowUpEvent(evt2: Event): void {
      evt2.preventDefault();
      evt2.stopImmediatePropagation();
      target?.removeEventListener('click', swallowFollowUpEvent, { capture: true });
      target?.removeEventListener('auxclick', swallowFollowUpEvent, { capture: true });
    }
  }

  private handleMouseOver(evt: MouseEvent): void {
    const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

    const target = evt.target as HTMLElement;
    const linkData = getLinkData(target);
    if (!linkData) {
      return;
    }

    if (linkData.isExternalUrl) {
      return;
    }

    evt.preventDefault();

    this.app.workspace.trigger('hover-link', {
      event: evt,
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

    const ctx = new basesContextCtor(this.app, {}, {}, mdFile);

    this.addChild(
      new BasesNoteGetPatchComponent({
        app: this.app,
        basesNote: ctx._local.note,
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

    const cachedFilePaths = new Set(this.frontmatterMarkdownLinksCache.getFilePaths());

    await loop({
      abortSignal: this.abortSignalComponent.abortSignal,
      buildNoticeMessage: ({ item, iterationStr }) => `Processing frontmatter links ${iterationStr} - ${item.path}`,
      items: getMarkdownFilesSorted(this.app),
      pluginNoticeComponent: this.pluginNoticeComponent,
      processItem: async (note) => {
        cachedFilePaths.delete(note.path);
        if (this.frontmatterMarkdownLinksCache.isCacheValid(note)) {
          const frontmatterMarkdownLinksCacheLinks = this.frontmatterMarkdownLinksCache.getLinks(note);
          if (frontmatterMarkdownLinksCacheLinks.length === 0) {
            return;
          }
          const cache = await getCacheSafe(this.app, note);
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

          const newLinks: FrontmatterLinkCache[] = [];

          for (const link of frontmatterMarkdownLinksCacheLinks) {
            const value = getNestedPropertyValue((cache.frontmatter ?? {}) as Record<string, unknown>, link.key);
            if (value !== link.original) {
              this.frontmatterMarkdownLinksCache.deleteKey({ filePath: note.path, key: link.key });
              const obsidianLink = obsidianLinkMap.get(link.key);
              if (obsidianLink) {
                cache.frontmatterLinks.push(obsidianLink);
                obsidianLinkMap.delete(link.key);
              }
              continue;
            }

            cache.frontmatterLinks.push(link);
            newLinks.push(link);
          }

          for (const link of newLinks) {
            this.updateResolvedOrUnresolvedLinksCache({ link: link.link, notePath: note.path });
          }
          return;
        }

        const cache = await getCacheSafe(this.app, note);
        if (!cache) {
          return;
        }
        await this.processFrontmatterLinksInFile({ cache, file: note });
      },
      progressBarTitle: 'Frontmatter Markdown Links: Initializing...',
      shouldContinueOnError: true,
      shouldShowProgressBar: this.pluginSettingsComponent.settings.shouldShowInitializationNotice
    });

    for (const filePath of cachedFilePaths) {
      this.frontmatterMarkdownLinksCache.delete(filePath);
    }
  }

  private processFrontmatterLinks(params: FrontmatterMarkdownLinksComponentProcessFrontmatterLinksParams): boolean {
    const { cache, filePath } = params;

    // Obsidian natively caches single-value internal frontmatter links (both wikilinks and markdown
    // Links) as well as single links held as array elements, so the plugin only needs to contribute
    // Links embedded within a multi-link string value - the one shape Obsidian does not cache. Those
    // Are exactly the `multiValueFrontmatterLinks` from `parseFrontmatterLinks`, each carrying the
    // Offsets into its frontmatter value.
    const { multiValueFrontmatterLinks } = parseFrontmatterLinks(cache.frontmatter);

    // Drop the plugin's previous contribution for this file before re-adding the current one.
    for (const staleKey of new Set(this.frontmatterMarkdownLinksCache.getKeys(filePath))) {
      this.frontmatterMarkdownLinksCache.deleteKey({ filePath, key: staleKey });
    }

    if (multiValueFrontmatterLinks.length === 0) {
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
      this.updateResolvedOrUnresolvedLinksCache({ link: link.link, notePath: filePath });
    }

    return true;
  }

  private async processFrontmatterLinksInFile(params: FrontmatterMarkdownLinksComponentProcessFrontmatterLinksInFileParams): Promise<void> {
    const { cache, file } = params;
    this.frontmatterMarkdownLinksCache.updateFile(file);

    if (this.currentlyProcessingFiles.has(file.path)) {
      return;
    }

    const hasFrontmatterLinks = this.processFrontmatterLinks({ cache, filePath: file.path });
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

      const frontmatter = parseYaml(leaf.view.rawFrontmatter) as Record<string, unknown>;
      leaf.view.metadataEditor.synchronize({});
      leaf.view.metadataEditor.synchronize(frontmatter);
    }
  }

  private updateResolvedOrUnresolvedLinksCache(params: FrontmatterMarkdownLinksComponentUpdateResolvedOrUnresolvedLinksCacheParams): void {
    const { link, notePath } = params;
    const { linkPath } = splitSubpath(link);
    const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, notePath);
    const linksCacheMap = resolvedFile ? this.app.metadataCache.resolvedLinks : this.app.metadataCache.unresolvedLinks;
    const linksCacheForNote = linksCacheMap[notePath] ?? {};
    linksCacheMap[notePath] = linksCacheForNote;

    const resolvedLinkPath = resolvedFile?.path ?? linkPath;
    linksCacheForNote[resolvedLinkPath] ??= 0;
    linksCacheForNote[resolvedLinkPath]++;
  }
}

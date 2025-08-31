import type {
  CachedMetadata,
  Editor,
  EditorPosition,
  FrontmatterLinkCache,
  MenuSeparator,
  TAbstractFile
} from 'obsidian';
import type { FrontmatterLinkCacheWithOffsets } from 'obsidian-dev-utils/obsidian/FrontmatterLinkCacheWithOffsets';
import type {
  BasesContextConstructor,
  BasesControl,
  BasesExternalLink,
  BasesNote,
  BasesView,
  ClickableToken,
  RenderContext
} from 'obsidian-typings';

import {
  Keymap,
  MarkdownView,
  Menu,
  MenuItem,
  parseYaml,
  TFile
} from 'obsidian';
import { filterInPlace } from 'obsidian-dev-utils/Array';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { getPrototypeOf } from 'obsidian-dev-utils/ObjectUtils';
import {
  parseLink,
  parseLinks,
  splitSubpath
} from 'obsidian-dev-utils/obsidian/Link';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { registerPatch } from 'obsidian-dev-utils/obsidian/MonkeyAround';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';
import {
  InternalPluginName,
  ViewType
} from 'obsidian-typings/implementations';

import type { PluginTypes } from './PluginTypes.ts';

import { registerFrontmatterLinksEditorExtension } from './FrontmatterLinksEditorExtension.ts';
import { FrontmatterMarkdownLinksCache } from './FrontmatterMarkdownLinksCache.ts';
import { getLinkData } from './LinkData.ts';
import { patchMultiTextPropertyWidgetComponent } from './MultiTextPropertyWidgetComponent.ts';
import { PluginSettingsManager } from './PluginSettingsManager.ts';
import { PluginSettingsTab } from './PluginSettingsTab.ts';
import { patchTextPropertyWidgetComponent } from './TextPropertyWidgetComponent.ts';
import { isSourceMode } from './Utils.ts';

type BasesNoteGetFn = BasesNote['get'];
type GetClickableTokenAtFn = Editor['getClickableTokenAt'];

type RenderToFn = BasesControl['renderTo'];
type ShowAtMouseEventFn = Menu['showAtMouseEvent'];

export class Plugin extends PluginBase<PluginTypes> {
  private basesExternalLinkPatched = false;
  private readonly currentlyProcessingFiles = new Set<string>();
  private readonly displayTexts = new WeakMap<BasesExternalLink, string>();
  private frontmatterMarkdownLinksCache!: FrontmatterMarkdownLinksCache;
  private isEditorPatched = false;

  protected override createSettingsManager(): PluginSettingsManager {
    return new PluginSettingsManager(this);
  }

  protected override createSettingsTab(): PluginSettingsTab {
    return new PluginSettingsTab(this);
  }

  protected override async onLayoutReady(): Promise<void> {
    await this.processAllNotes();
    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataCacheChanged.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleRename.bind(this)));
    this.registerEvent(this.app.workspace.on('file-open', this.handleFileOpen.bind(this)));
    this.handleFileOpen();

    const that = this;

    registerPatch(this, Menu.prototype, {
      showAtMouseEvent: (next: ShowAtMouseEventFn): ShowAtMouseEventFn => {
        return function showAtMouseEventPatched(this: Menu, evt: MouseEvent): Menu {
          return that.showAtMouseEvent(next, this, evt);
        };
      }
    });

    await this.patchBases();

    this.registerPopupDocumentDomEvent('mousedown', this.handleMouseDown.bind(this), { capture: true });
    this.registerPopupDocumentDomEvent('mouseover', this.handleMouseOver.bind(this), { capture: true });
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    patchTextPropertyWidgetComponent(this);
    patchMultiTextPropertyWidgetComponent(this);
    registerFrontmatterLinksEditorExtension(this);
    this.register(() => {
      invokeAsyncSafely(this.clearMetadataCache.bind(this));
    });
    this.register(this.refreshMarkdownViews.bind(this));
    this.refreshMarkdownViews();
  }

  private basesExternalLinkRenderTo(next: RenderToFn, basesExternalLink: BasesExternalLink, containerEl: HTMLElement, renderContext: RenderContext): void {
    next.call(basesExternalLink, containerEl, renderContext);
    const displayText = this.displayTexts.get(basesExternalLink);
    if (displayText !== undefined) {
      containerEl.find('a').setText(displayText);
    }
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

  private getClickableTokenAt(next: GetClickableTokenAtFn, editor: Editor, pos: EditorPosition): ClickableToken | null {
    let clickableToken = next.call(editor, pos);
    if (clickableToken) {
      return clickableToken;
    }

    const offset = editor.posToOffset(pos);
    const { node } = editor.cm.domAtPos(offset);

    const parentEl = node instanceof HTMLElement ? node : node.parentElement;
    const frontmatterEl = parentEl?.closest('.cm-hmd-frontmatter');

    if (!frontmatterEl) {
      return null;
    }

    const linkEl = frontmatterEl.find('[data-frontmatter-markdown-links-link-data]') as HTMLElement | undefined;

    if (!linkEl) {
      return null;
    }

    const linkData = getLinkData(linkEl);

    if (!linkData) {
      return null;
    }

    clickableToken = {
      end: pos,
      start: pos,
      text: linkData.url,
      type: linkData.isExternalUrl ? 'external-link' : 'internal-link'
    } as ClickableToken;
    return clickableToken;
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
    const that = this;

    registerPatch(this, this.app.workspace.activeEditor.editor.constructor.prototype, {
      getClickableTokenAt: (next: GetClickableTokenAtFn): GetClickableTokenAtFn => {
        return function getClickableTokenAtPatched(this: Editor, pos: EditorPosition): ClickableToken | null {
          return that.getClickableTokenAt(next, this, pos);
        };
      }
    });
  }

  private handleMetadataCacheChanged(file: TFile, data: string, cache: CachedMetadata): void {
    invokeAsyncSafely(async () => {
      await this.processFrontmatterLinksInFile(file, cache, data);
    });
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

    target.addEventListener('click', (evt2) => {
      evt2.preventDefault();
      evt2.stopImmediatePropagation();
    }, { capture: true, once: true });

    if (linkData.isExternalUrl) {
      window.open(linkData.url, evt.button === 1 ? 'tab' : '');
    } else {
      const activeFile = this.app.workspace.getActiveFile();
      if (!activeFile) {
        return;
      }

      invokeAsyncSafely(() => this.app.workspace.openLinkText(linkData.url, activeFile.path, Keymap.isModEvent(evt)));
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

  private noteGet(next: BasesNoteGetFn, note: BasesNote, key: string): BasesControl {
    const value = note.data[key];
    if (typeof value === 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink) {
        return next.call(note, key);
      }

      if (parseLinkResult.isExternal) {
        note.data[key] = parseLinkResult.url;
        const basesExternalLink = next.call(note, key) as BasesExternalLink;
        if (parseLinkResult.alias) {
          this.displayTexts.set(basesExternalLink, parseLinkResult.alias);
        }
        if (!this.basesExternalLinkPatched) {
          this.basesExternalLinkPatched = true;
          const that = this;
          registerPatch(this, getPrototypeOf(basesExternalLink), {
            renderTo: (nextRenderToFn: RenderToFn): RenderToFn => {
              return function renderToPatched(this: BasesExternalLink, containerEl: HTMLElement, renderContext: RenderContext): void {
                that.basesExternalLinkRenderTo(nextRenderToFn, this, containerEl, renderContext);
              };
            }
          });
        }
        return basesExternalLink;
      }

      const wikilink = parseLinkResult.alias ? `[[${parseLinkResult.url}|${parseLinkResult.alias}]]` : `[[${parseLinkResult.url}]]`;
      note.data[key] = wikilink;
      return next.call(note, key);
    }
    return next.call(note, key);
  }

  private async patchBases(): Promise<void> {
    const basesPlugin = this.app.internalPlugins.getEnabledPluginById(InternalPluginName.Bases);
    if (!basesPlugin) {
      return;
    }

    const tempName = `__TEMP__${window.crypto.randomUUID()}`;
    const tempMdFile = await this.app.vault.create(`${tempName}.md`, '');
    const tempBasesFile = await this.app.vault.create(`${tempName}.base`, '');

    const leaf = this.app.workspace.createLeafInTabGroup();
    await leaf.setViewState({
      state: {
        file: tempBasesFile.path
      },
      type: ViewType.Bases
    }, {});

    const basesView = leaf.view as BasesView;
    const basesContextCtor = basesView.controller.ctx.constructor as BasesContextConstructor;
    const ctx = new basesContextCtor(this.app, {}, {}, tempMdFile);
    const note = ctx._local.note;
    const that = this;

    registerPatch(this, getPrototypeOf(note), {
      get: (next: BasesNoteGetFn): BasesNoteGetFn => {
        return function getPatched(this: BasesNote, key: string): BasesControl {
          return that.noteGet(next, this, key);
        };
      }
    });

    await basesView.onUnloadFile(tempBasesFile);
    await this.app.vault.delete(tempBasesFile);
    await this.app.vault.delete(tempMdFile);
  }

  private async processAllNotes(): Promise<void> {
    this.frontmatterMarkdownLinksCache = new FrontmatterMarkdownLinksCache();
    await this.frontmatterMarkdownLinksCache.init(this.app);

    const cachedFilePaths = new Set(this.frontmatterMarkdownLinksCache.getFilePaths());

    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Processing frontmatter links ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        cachedFilePaths.delete(note.path);
        if (this.frontmatterMarkdownLinksCache.isCacheValid(note)) {
          const links = this.frontmatterMarkdownLinksCache.getLinks(note);
          if (links.length > 0) {
            const cache = await getCacheSafe(this.app, note);
            if (cache) {
              cache.frontmatterLinks ??= [];
              const linkKeys = new Set(links.map((link) => link.key));
              filterInPlace(cache.frontmatterLinks, (link) => !linkKeys.has(link.key));
              cache.frontmatterLinks.push(...links);

              for (const link of links) {
                this.updateResolvedOrUnresolvedLinksCache(link.link, note.path);
              }
            }
          }
          return;
        }

        const cache = await getCacheSafe(this.app, note);
        if (!cache) {
          return;
        }
        await this.processFrontmatterLinksInFile(note, cache);
      },
      progressBarTitle: 'Frontmatter Markdown Links: Initializing...',
      shouldContinueOnError: true,
      shouldShowProgressBar: this.settings.shouldShowInitializationNotice
    });

    for (const filePath of cachedFilePaths) {
      this.frontmatterMarkdownLinksCache.delete(filePath);
    }
  }

  private processFrontmatterLinks(value: unknown, key: string, cache: CachedMetadata, filePath: string): boolean {
    if (typeof value === 'string') {
      const parseLinkResults = parseLinks(value);
      const isSingleLink = parseLinkResults[0]?.raw === value;

      let hasFrontmatterLinks = false;

      filterInPlace(cache.frontmatterLinks ?? [], (link) => {
        return link.key !== key;
      });

      for (const parseLinkResult of parseLinkResults) {
        if (parseLinkResult.isExternal) {
          continue;
        }

        cache.frontmatterLinks ??= [];

        const link: FrontmatterLinkCache = isSingleLink
          ? {
            key,
            link: parseLinkResult.url,
            original: value
          } as FrontmatterLinkCache
          : {
            cleanKey: key,
            endOffset: parseLinkResult.endOffset,
            key,
            link: parseLinkResult.url,
            original: value,
            startOffset: parseLinkResult.startOffset
          } as FrontmatterLinkCacheWithOffsets;

        link.displayText = parseLinkResult.alias ?? parseLinkResult.url;

        cache.frontmatterLinks.push(link);

        if (!isSingleLink || !parseLinkResult.isWikilink) {
          hasFrontmatterLinks = true;
          this.frontmatterMarkdownLinksCache.add(filePath, link);
          this.updateResolvedOrUnresolvedLinksCache(link.link, filePath);
        }
      }

      return hasFrontmatterLinks;
    }

    if (typeof value !== 'object' || value === null) {
      return false;
    }

    let hasFrontmatterLinks = false;

    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const hasChildFrontmatterLinks = this.processFrontmatterLinks(childValue, key ? `${key}.${childKey}` : childKey, cache, filePath);
      hasFrontmatterLinks ||= hasChildFrontmatterLinks;
    }

    return hasFrontmatterLinks;
  }

  private async processFrontmatterLinksInFile(file: TFile, cache: CachedMetadata, data?: string): Promise<void> {
    this.frontmatterMarkdownLinksCache.updateFile(file);

    if (this.currentlyProcessingFiles.has(file.path)) {
      return;
    }

    const hasFrontmatterLinks = this.processFrontmatterLinks(cache.frontmatter, '', cache, file.path);
    if (!hasFrontmatterLinks) {
      return;
    }

    this.currentlyProcessingFiles.add(file.path);
    data ??= await this.app.vault.read(file);
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

  private showAtMouseEvent(next: ShowAtMouseEventFn, menu: Menu, evt: MouseEvent): Menu {
    const target = evt.target as HTMLElement | undefined;

    if (!target) {
      return fallback();
    }

    const linkData = getLinkData(target);
    if (!linkData) {
      return fallback();
    }

    if (menu.items.some((menuItem: MenuItem | MenuSeparator) => (menuItem instanceof MenuItem) && menuItem.section === 'open')) {
      return fallback();
    }
    if (linkData.isExternalUrl) {
      this.app.workspace.handleExternalLinkContextMenu(menu, linkData.url);
    } else {
      this.app.workspace.handleLinkContextMenu(menu, linkData.url, this.app.workspace.getActiveFile()?.path ?? '');
    }

    return fallback();

    function fallback(): Menu {
      return next.call(menu, evt);
    }
  }

  private updateResolvedOrUnresolvedLinksCache(link: string, notePath: string): void {
    const { linkPath } = splitSubpath(link);
    const resolvedFile = this.app.metadataCache.getFirstLinkpathDest(linkPath, notePath);
    const linksCacheMap = resolvedFile ? this.app.metadataCache.resolvedLinks : this.app.metadataCache.unresolvedLinks;
    linksCacheMap[notePath] ??= {};
    const linksCacheForNote = linksCacheMap[notePath] ?? {};

    const resolvedLinkPath = resolvedFile?.path ?? linkPath;
    linksCacheForNote[resolvedLinkPath] ??= 0;
    linksCacheForNote[resolvedLinkPath]++;
  }
}

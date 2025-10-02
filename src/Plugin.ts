import type {
  CachedMetadata,
  Editor,
  EditorPosition,
  FrontmatterLinkCache,
  MenuSeparator,
  TAbstractFile
} from 'obsidian';
import type { FrontmatterLinkCacheWithOffsets } from 'obsidian-dev-utils/obsidian/FrontmatterLinkCacheWithOffsets';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';
import type {
  BasesContextConstructor,
  BasesControl,
  BasesExternalLink,
  BasesList,
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
  TFile,
  WorkspaceLeaf
} from 'obsidian';
import { filterInPlace } from 'obsidian-dev-utils/Array';
import {
  convertAsyncToSync,
  invokeAsyncSafely,
  requestAnimationFrameAsync
} from 'obsidian-dev-utils/Async';
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

const EXTERNAL_LINK_PREFIX = 'https://EXTERNAL_LINK_PREFIX.com/';

export class Plugin extends PluginBase<PluginTypes> {
  private readonly currentlyProcessingFiles = new Set<string>();
  private externalLinkMaxId = 0;
  private readonly externalLinks = new Map<number, ParseLinkResult>();
  private frontmatterMarkdownLinksCache = new FrontmatterMarkdownLinksCache();
  private isBasesExternalLinkPatched = false;
  private isBasesViewPatched = false;
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

    this.registerPopupDocumentDomEvent('mousedown', this.handleMouseDown.bind(this), { capture: true });
    this.registerPopupDocumentDomEvent('mouseover', this.handleMouseOver.bind(this), { capture: true });

    await this.handleActiveLeafChange(this.app.workspace.getLeavesOfType(ViewType.Bases)[0] ?? null);

    if (!this.isBasesViewPatched) {
      this.registerEvent(this.app.workspace.on('active-leaf-change', convertAsyncToSync(this.handleActiveLeafChange.bind(this))));
    }
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
    this.fixExternalLinks(containerEl);
  }

  private basesListRenderTo(next: RenderToFn, basesExternalLink: BasesExternalLink, containerEl: HTMLElement, renderContext: RenderContext): void {
    next.call(basesExternalLink, containerEl, renderContext);
    this.fixExternalLinks(containerEl);
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

  private fixExternalLinks(containerEl: HTMLElement): void {
    const aEls = containerEl.querySelectorAll<HTMLAnchorElement>('a');

    for (const aEl of aEls) {
      if (!aEl.href.toLowerCase().startsWith(EXTERNAL_LINK_PREFIX.toLowerCase())) {
        continue;
      }

      const linkId = Number(aEl.href.slice(EXTERNAL_LINK_PREFIX.length));
      const parseLinkResult = this.externalLinks.get(linkId);
      if (!parseLinkResult) {
        return;
      }

      this.externalLinks.delete(linkId);

      aEl.href = parseLinkResult.url;
      aEl.setText(parseLinkResult.alias ?? parseLinkResult.url);
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

  private async handleActiveLeafChange(leaf: null | WorkspaceLeaf): Promise<void> {
    if (this.isBasesViewPatched) {
      return;
    }

    const basesPlugin = this.app.internalPlugins.getEnabledPluginById(InternalPluginName.Bases);
    if (!basesPlugin) {
      return;
    }

    if (!leaf) {
      return;
    }

    if (leaf.view.getViewType() !== ViewType.Bases) {
      return;
    }

    await leaf.loadIfDeferred();
    await requestAnimationFrameAsync();

    const basesView = leaf.view as BasesView;
    const basesContextCtor = basesView.controller.ctx.constructor as BasesContextConstructor;

    let mdFile = this.app.vault.getMarkdownFiles()[0];
    let shouldDeleteMdFile = false;
    if (!mdFile) {
      mdFile = await this.app.vault.create(`__TEMP__${window.crypto.randomUUID()}.md`, '');
      shouldDeleteMdFile = true;
    }

    const ctx = new basesContextCtor(this.app, {}, {}, mdFile);
    const that = this;

    registerPatch(this, getPrototypeOf(ctx._local.note), {
      get: (next: BasesNoteGetFn): BasesNoteGetFn => {
        return function getPatched(this: BasesNote, key: string): BasesControl {
          return that.noteGet(next, this, key);
        };
      }
    });

    if (shouldDeleteMdFile) {
      await this.app.vault.delete(mdFile);
    }

    this.isBasesViewPatched = true;
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

    if (!this.isBasesExternalLinkPatched) {
      this.isBasesExternalLinkPatched = true;
      const that = this;

      note.data[key] = EXTERNAL_LINK_PREFIX;
      const basesExternalLink = next.call(note, key) as BasesExternalLink;
      registerPatch(this, getPrototypeOf(basesExternalLink), {
        renderTo: (nextRenderToFn: RenderToFn): RenderToFn => {
          return function renderToPatched(this: BasesExternalLink, containerEl: HTMLElement, renderContext: RenderContext): void {
            that.basesExternalLinkRenderTo(nextRenderToFn, this, containerEl, renderContext);
          };
        }
      });

      note.data[key] = [EXTERNAL_LINK_PREFIX];
      const basesList = next.call(note, key) as BasesList;
      registerPatch(this, getPrototypeOf(basesList), {
        renderTo: (nextRenderToFn: RenderToFn): RenderToFn => {
          return function renderToPatched(this: BasesExternalLink, containerEl: HTMLElement, renderContext: RenderContext): void {
            that.basesListRenderTo(nextRenderToFn, this, containerEl, renderContext);
          };
        }
      });

      note.data[key] = value;
    }

    try {
      note.data[key] = this.patchLink(value);
      return next.call(note, key);
    } finally {
      note.data[key] = value;
    }
  }

  private patchLink(value: unknown): unknown {
    if (typeof value === 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink) {
        return value;
      }

      if (parseLinkResult.isExternal) {
        if (parseLinkResult.alias === undefined) {
          return parseLinkResult.url;
        }
        this.externalLinkMaxId++;
        this.externalLinks.set(this.externalLinkMaxId, parseLinkResult);
        return `${EXTERNAL_LINK_PREFIX}${String(this.externalLinkMaxId)}`;
      }

      return parseLinkResult.alias ? `[[${parseLinkResult.url}|${parseLinkResult.alias}]]` : `[[${parseLinkResult.url}]]`;
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.patchLink(item));
    }

    return value;
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

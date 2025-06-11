import type {
  CachedMetadata,
  TAbstractFile
} from 'obsidian';

import {
  Keymap,
  MarkdownView,
  Menu,
  parseYaml,
  TFile
} from 'obsidian';
import { filterInPlace } from 'obsidian-dev-utils/Array';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { ensureLoaded } from 'obsidian-dev-utils/HTMLElement';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';

import type { PluginTypes } from './PluginTypes.ts';

import { registerFrontmatterLinksEditorExtension } from './FrontmatterLinksEditorExtension.ts';
import { FrontmatterMarkdownLinksCache } from './FrontmatterMarkdownLinksCache.ts';
import { getLinkData } from './LinkData.ts';
import { patchMultiTextPropertyComponent } from './MultiTextPropertyComponent.ts';
import { patchTextPropertyComponent } from './TextPropertyComponent.ts';

export class Plugin extends PluginBase<PluginTypes> {
  private readonly currentlyProcessingFiles = new Set<string>();
  private frontmatterMarkdownLinksCache!: FrontmatterMarkdownLinksCache;

  protected override async onLayoutReady(): Promise<void> {
    await this.processAllNotes();
    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataCacheChanged.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleRename.bind(this)));
    this.registerDomEvents(document);
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();

    patchTextPropertyComponent(this);
    patchMultiTextPropertyComponent(this);
    registerFrontmatterLinksEditorExtension(this);
    this.register(() => {
      invokeAsyncSafely(this.clearMetadataCache.bind(this));
    });
    this.register(this.refreshMarkdownViews.bind(this));
    this.refreshMarkdownViews();
    this.registerIFrameEvents();
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

  private handleClick(evt: MouseEvent): void {
    const RIGHT_BUTTON = 2;
    if (evt.button === RIGHT_BUTTON) {
      return;
    }

    if (!Keymap.isModEvent(evt) && !this.isLivePreviewMode()) {
      return;
    }

    const target = evt.target as HTMLElement;
    const linkData = getLinkData(target);
    if (!linkData) {
      return;
    }

    if (linkData.isWikilink) {
      return;
    }

    evt.preventDefault();

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

  private handleContextMenu(evt: MouseEvent): void {
    const target = evt.target as HTMLElement;
    const linkData = getLinkData(target);
    if (!linkData) {
      return;
    }

    evt.preventDefault();

    const menu = new Menu();
    if (linkData.isExternalUrl) {
      this.app.workspace.handleExternalLinkContextMenu(menu, linkData.url);
    } else {
      this.app.workspace.handleLinkContextMenu(menu, linkData.url, this.app.workspace.getActiveFile()?.path ?? '');
    }
    menu.showAtMouseEvent(evt);
  }

  private handleDelete(file: TAbstractFile): void {
    this.frontmatterMarkdownLinksCache.delete(file.path);
  }

  private handleMetadataCacheChanged(file: TFile, data: string, cache: CachedMetadata): void {
    invokeAsyncSafely(async () => {
      await this.processFrontmatterLinksInFile(file, cache, data);
    });
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

  private isLivePreviewMode(): boolean {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      return false;
    }

    if (view.getMode() !== 'source') {
      return false;
    }

    const state = view.getState();
    return !state['source'];
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
      shouldShowProgressBar: true
    });

    for (const filePath of cachedFilePaths) {
      this.frontmatterMarkdownLinksCache.delete(filePath);
    }
  }

  private processFrontmatterLinks(value: unknown, key: string, cache: CachedMetadata, filePath: string): boolean {
    if (typeof value === 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink || parseLinkResult.isExternal) {
        return false;
      }

      cache.frontmatterLinks ??= [];
      let link = cache.frontmatterLinks.find((frontmatterLink) => frontmatterLink.key === key);

      if (!link) {
        link = {
          key,
          link: '',
          original: ''
        };
        cache.frontmatterLinks.push(link);
      }

      link.link = parseLinkResult.url;
      link.original = value;
      if (parseLinkResult.alias !== undefined) {
        link.displayText = parseLinkResult.alias;
      }

      this.frontmatterMarkdownLinksCache.add(filePath, link);
      return true;
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

  private registerDomEvents(document: Document): void {
    this.registerDomEvent(document, 'click', this.handleClick.bind(this));
    this.registerDomEvent(document, 'auxclick', this.handleClick.bind(this));
    this.registerDomEvent(document, 'contextmenu', this.handleContextMenu.bind(this), { capture: true });
    this.registerDomEvent(document, 'mouseover', this.handleMouseOver.bind(this), { capture: true });
  }

  private registerIFrameEvents(): void {
    const observer = new MutationObserver((mutationsList) => {
      for (const mutation of mutationsList) {
        if (mutation.type !== 'childList') {
          continue;
        }

        for (const node of Array.from(mutation.addedNodes)) {
          if (!(node instanceof HTMLIFrameElement)) {
            continue;
          }

          invokeAsyncSafely(async () => {
            await ensureLoaded(node);
            if (node.contentDocument) {
              this.registerDomEvents(node.contentDocument);
            }
          });
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    this.register(() => {
      observer.disconnect();
    });
  }
}

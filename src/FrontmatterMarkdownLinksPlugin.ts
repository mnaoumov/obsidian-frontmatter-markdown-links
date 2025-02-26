import type {
  CachedMetadata,
  TAbstractFile
} from 'obsidian';

import {
  Keymap,
  MarkdownView,
  Menu,
  parseYaml,
  PluginSettingTab,
  TFile
} from 'obsidian';
import { invokeAsyncSafely } from 'obsidian-dev-utils/Async';
import { ensureLoaded } from 'obsidian-dev-utils/HTMLElement';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';
import { loop } from 'obsidian-dev-utils/obsidian/Loop';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { EmptySettings } from 'obsidian-dev-utils/obsidian/Plugin/EmptySettings';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';

import { registerFrontmatterLinksEditorExtension } from './FrontmatterLinksEditorExtension.ts';
import { getLinkData } from './LinkData.ts';
import { patchMultiTextPropertyComponent } from './MultiTextPropertyComponent.ts';
import { patchTextPropertyComponent } from './TextPropertyComponent.ts';

export class FrontmatterMarkdownLinksPlugin extends PluginBase {
  private readonly addedFrontmatterMarkdownLinks = new Map<string, Set<string>>();
  private readonly currentlyProcessingFiles = new Set<string>();

  protected override createPluginSettings(): EmptySettings {
    return new EmptySettings();
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return null;
  }

  protected override async onLayoutReady(): Promise<void> {
    await this.processAllNotes();
  }

  protected override onloadComplete(): void {
    this.registerEvent(this.app.metadataCache.on('changed', this.handleMetadataCacheChanged.bind(this)));
    this.registerEvent(this.app.vault.on('delete', this.handleDelete.bind(this)));
    this.registerEvent(this.app.vault.on('rename', this.handleRename.bind(this)));
    this.registerDomEvents(document);

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
    for (const [filePath, keys] of this.addedFrontmatterMarkdownLinks.entries()) {
      const cache = this.app.metadataCache.getCache(filePath);
      if (!cache?.frontmatterLinks) {
        continue;
      }

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
    this.addedFrontmatterMarkdownLinks.delete(file.path);
  }

  private handleMetadataCacheChanged(file: TFile, data: string, cache: CachedMetadata): void {
    this.processFrontmatterLinksInFile(file, data, cache);
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
    const keys = this.addedFrontmatterMarkdownLinks.get(oldPath);
    if (keys) {
      this.addedFrontmatterMarkdownLinks.set(file.path, keys);
    }

    this.addedFrontmatterMarkdownLinks.delete(oldPath);
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
    await loop({
      abortSignal: this.abortSignal,
      buildNoticeMessage: (note, iterationStr) => `Processing frontmatter links ${iterationStr} - ${note.path}`,
      items: getMarkdownFilesSorted(this.app),
      processItem: async (note) => {
        const cache = await getCacheSafe(this.app, note);
        if (!cache) {
          return;
        }
        const data = await this.app.vault.read(note);
        this.processFrontmatterLinksInFile(note, data, cache);
      },
      shouldContinueOnError: true
    });
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

      let keys = this.addedFrontmatterMarkdownLinks.get(filePath);
      if (!keys) {
        keys = new Set<string>();
        this.addedFrontmatterMarkdownLinks.set(filePath, keys);
      }

      keys.add(key);
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

  private processFrontmatterLinksInFile(file: TFile, data: string, cache: CachedMetadata): void {
    if (this.currentlyProcessingFiles.has(file.path)) {
      return;
    }

    const hasFrontmatterLinks = this.processFrontmatterLinks(cache.frontmatter, '', cache, file.path);
    if (hasFrontmatterLinks) {
      this.currentlyProcessingFiles.add(file.path);
      this.app.metadataCache.trigger('changed', file, data, cache);
      this.currentlyProcessingFiles.delete(file.path);
    }
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

import type {
  CachedMetadata,
  Component,
  TAbstractFile
} from 'obsidian';
import type {
  PropertyEntryData,
  PropertyRenderContext,
  PropertyWidget
} from 'obsidian-typings';

import { around } from 'monkey-around';
import {

  PluginSettingTab,
  TFile
} from 'obsidian';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';

import type { LinkComponent } from './LinkComponent.ts';

import { patchLinkComponentProto } from './LinkComponent.ts';

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RenderTextPropertyWidgetFn = (el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext) => Component | void;

export class FrontmatterMarkdownLinksPlugin extends PluginBase<object> {
  private readonly addedFrontMatterMarkdownLinks = new Map<string, Set<string>>();
  private readonly currentlyProcessingFiles = new Set<string>();
  private isLinkComponentProtoPatched = false;

  protected override createDefaultPluginSettings(): object {
    return {};
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

    const textPropertyWidget = this.app.metadataTypeManager.registeredTypeWidgets['text'] as PropertyWidget<string>;

    this.register(around(textPropertyWidget, {
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      render: (next: RenderTextPropertyWidgetFn) => (el, data, ctx): Component | void => this.renderTextPropertyWidget(el, data, ctx, next)
    }));

    this.register(this.clearMetadataCache.bind(this));
  }

  private clearMetadataCache(): void {
    for (const [filePath, keys] of this.addedFrontMatterMarkdownLinks.entries()) {
      const cache = this.app.metadataCache.getCache(filePath);
      if (!cache?.frontmatterLinks) {
        continue;
      }

      cache.frontmatterLinks = cache.frontmatterLinks.filter((link) => !keys.has(link.key));
      if (cache.frontmatterLinks.length === 0) {
        delete cache.frontmatterLinks;
      }
    }
  }

  private handleDelete(file: TAbstractFile): void {
    this.addedFrontMatterMarkdownLinks.delete(file.path);
  }

  private handleMetadataCacheChanged(file: TFile, data: string, cache: CachedMetadata): void {
    this.processFrontMatterLinksInFile(file, data, cache);
  }

  private handleRename(file: TAbstractFile, oldPath: string): void {
    const keys = this.addedFrontMatterMarkdownLinks.get(oldPath);
    if (keys) {
      this.addedFrontMatterMarkdownLinks.set(file.path, keys);
    }

    this.addedFrontMatterMarkdownLinks.delete(oldPath);
  }

  private async processAllNotes(): Promise<void> {
    const noteFiles = getMarkdownFilesSorted(this.app);

    const notice = new Notice('', 0);
    let i = 0;
    for (const noteFile of noteFiles) {
      if (this.abortSignal.aborted) {
        break;
      }
      i++;
      const message = `Processing frontmatter links # ${i.toString()} / ${noteFiles.length.toString()} - ${noteFile.path}`;
      console.debug(message);
      notice.setMessage(message);

      const cache = await getCacheSafe(this.app, noteFile);

      if (!cache) {
        continue;
      }

      const data = await this.app.vault.read(noteFile);
      this.processFrontMatterLinksInFile(noteFile, data, cache);
    }
    notice.hide();
  }

  private processFrontMatterLinks(value: unknown, key: string, cache: CachedMetadata, filePath: string): boolean {
    if (typeof value == 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink || parseLinkResult.isExternal) {
        return false;
      }

      cache.frontmatterLinks ??= [];
      let link = cache.frontmatterLinks.find((link) => link.key === key);

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

      let keys = this.addedFrontMatterMarkdownLinks.get(filePath);
      if (!keys) {
        keys = new Set<string>();
        this.addedFrontMatterMarkdownLinks.set(filePath, keys);
      }

      keys.add(key);
      return true;
    }

    if (typeof value !== 'object' || value === null) {
      return false;
    }

    let hasFrontMatterLinks = false;

    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const hasChildFrontMatterLinks = this.processFrontMatterLinks(childValue, key ? `${key}.${childKey}` : childKey, cache, filePath);
      hasFrontMatterLinks ||= hasChildFrontMatterLinks;
    }

    return hasFrontMatterLinks;
  }

  private processFrontMatterLinksInFile(file: TFile, data: string, cache: CachedMetadata): void {
    if (this.currentlyProcessingFiles.has(file.path)) {
      return;
    }

    const hasFrontMatterLinks = this.processFrontMatterLinks(cache.frontmatter, '', cache, file.path);
    if (hasFrontMatterLinks) {
      this.currentlyProcessingFiles.add(file.path);
      this.app.metadataCache.trigger('changed', file, data, cache);
      this.currentlyProcessingFiles.delete(file.path);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private renderTextPropertyWidget(el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext, next: RenderTextPropertyWidgetFn): Component | void {
    const linkComponent = next(el, data, ctx) as LinkComponent | undefined;
    if (!linkComponent || this.isLinkComponentProtoPatched) {
      return linkComponent;
    }

    const linkComponentProto = getPrototypeOf(linkComponent);
    this.register(patchLinkComponentProto(linkComponentProto));
    this.isLinkComponentProtoPatched = true;
    return linkComponent;
  }
}

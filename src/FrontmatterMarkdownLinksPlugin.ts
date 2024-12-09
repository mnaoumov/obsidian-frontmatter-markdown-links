import type {
  CachedMetadata,
  Component
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
    this.registerEvent(this.app.metadataCache.on('changed', this.onMetadataCacheChanged.bind(this)));

    const textPropertyWidget = this.app.metadataTypeManager.registeredTypeWidgets['text'] as PropertyWidget<string>;

    this.register(around(textPropertyWidget, {
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      render: (next: RenderTextPropertyWidgetFn) => (el, data, ctx): Component | void => this.renderTextPropertyWidget(el, data, ctx, next)
    }));
  }

  private onMetadataCacheChanged(file: TFile, data: string, cache: CachedMetadata): void {
    this.processFrontMatterLinksInFile(file, data, cache);
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

  private processFrontMatterLinks(value: unknown, key: string, cache: CachedMetadata): boolean {
    if (typeof value == 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink || parseLinkResult.isExternal) {
        return false;
      }

      cache.frontmatterLinks ??= [];
      cache.frontmatterLinks.push({
        key,
        link: parseLinkResult.url,
        original: value
      });

      return true;
    }

    if (typeof value !== 'object' || value === null) {
      return false;
    }

    let hasFrontMatterLinks = false;

    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      const hasChildFrontMatterLinks = this.processFrontMatterLinks(childValue, key ? `${key}.${childKey}` : childKey, cache);
      hasFrontMatterLinks ||= hasChildFrontMatterLinks;
    }

    return hasFrontMatterLinks;
  }

  private processFrontMatterLinksInFile(file: TFile, data: string, cache: CachedMetadata): void {
    if (this.currentlyProcessingFiles.has(file.path)) {
      return;
    }

    const hasFrontMatterLinks = this.processFrontMatterLinks(cache.frontmatter, '', cache);
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

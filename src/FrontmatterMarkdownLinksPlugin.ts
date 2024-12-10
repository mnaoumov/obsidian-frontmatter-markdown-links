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

  MarkdownView,
  parseYaml,
  PluginSettingTab,
  TFile
} from 'obsidian';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';

import type { TextPropertyComponent } from './TextPropertyComponent.ts';
import type { MultiTextPropertyComponent } from './MultiTextPropertyComponent.ts';

import { patchTextPropertyComponentProto } from './TextPropertyComponent.ts';
import { patchMultiSelectComponentProto } from './MultiTextPropertyComponent.ts';

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RenderMultiTextPropertyWidgetFn = (el: HTMLElement, data: PropertyEntryData<string[]>, ctx: PropertyRenderContext) => Component | void;

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RenderTextPropertyWidgetFn = (el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext) => Component | void;

export class FrontmatterMarkdownLinksPlugin extends PluginBase<object> {
  private readonly addedFrontmatterMarkdownLinks = new Map<string, Set<string>>();
  private readonly currentlyProcessingFiles = new Set<string>();
  private isTextPropertyComponentProtoPatched = false;
  private isMultiSelectComponentProtoPatched = false;

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
    const multiTextPropertyWidget = this.app.metadataTypeManager.registeredTypeWidgets['multitext'] as PropertyWidget<string[]>;

    this.register(around(textPropertyWidget, {
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      render: (next: RenderTextPropertyWidgetFn) => (el, data, ctx): Component | void => this.renderTextPropertyWidget(el, data, ctx, next)
    }));

    this.register(around(multiTextPropertyWidget, {
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      render: (next: RenderMultiTextPropertyWidgetFn) => (el, data, ctx): Component | void => this.renderMultiTextPropertyWidget(el, data, ctx, next)
    }));

    this.register(this.clearMetadataCache.bind(this));
    this.register(this.refreshMarkdownViews.bind(this));
    this.refreshMarkdownViews();
  }

  private clearMetadataCache(): void {
    for (const [filePath, keys] of this.addedFrontmatterMarkdownLinks.entries()) {
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
    this.addedFrontmatterMarkdownLinks.delete(file.path);
  }

  private handleMetadataCacheChanged(file: TFile, data: string, cache: CachedMetadata): void {
    this.processFrontmatterLinksInFile(file, data, cache);
  }

  private handleRename(file: TAbstractFile, oldPath: string): void {
    const keys = this.addedFrontmatterMarkdownLinks.get(oldPath);
    if (keys) {
      this.addedFrontmatterMarkdownLinks.set(file.path, keys);
    }

    this.addedFrontmatterMarkdownLinks.delete(oldPath);
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
      this.processFrontmatterLinksInFile(noteFile, data, cache);
    }
    notice.hide();
  }

  private processFrontmatterLinks(value: unknown, key: string, cache: CachedMetadata, filePath: string): boolean {
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

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private renderMultiTextPropertyWidget(el: HTMLElement, data: PropertyEntryData<string[]>, ctx: PropertyRenderContext, next: RenderMultiTextPropertyWidgetFn): Component | void {
    const multiTextPropertyComponent = next(el, data, ctx) as MultiTextPropertyComponent | undefined;
    if (!multiTextPropertyComponent || this.isMultiSelectComponentProtoPatched) {
      return multiTextPropertyComponent;
    }

    const multiSelectComponentProto = getPrototypeOf(multiTextPropertyComponent.multiselect);
    this.register(patchMultiSelectComponentProto(multiSelectComponentProto));
    this.isMultiSelectComponentProtoPatched = true;

    multiTextPropertyComponent.multiselect.rootEl.remove();
    return this.renderMultiTextPropertyWidget(el, data, ctx, next);
  }

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private renderTextPropertyWidget(el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext, next: RenderTextPropertyWidgetFn): Component | void {
    const textPropertyComponent = next(el, data, ctx) as TextPropertyComponent | undefined;
    if (!textPropertyComponent || this.isTextPropertyComponentProtoPatched) {
      return textPropertyComponent;
    }

    const textPropertyComponentProto = getPrototypeOf(textPropertyComponent);
    this.register(patchTextPropertyComponentProto(textPropertyComponentProto));
    this.isTextPropertyComponentProtoPatched = true;

    textPropertyComponent.inputEl.remove();
    textPropertyComponent.linkEl.remove();
    return this.renderTextPropertyWidget(el, data, ctx, next);
  }
}

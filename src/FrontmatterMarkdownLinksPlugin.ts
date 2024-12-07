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

  Keymap,
  PluginSettingTab,
  TFile
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/Async';
import {
  extractLinkFile,
  parseLink
} from 'obsidian-dev-utils/obsidian/Link';
import { getCacheSafe } from 'obsidian-dev-utils/obsidian/MetadataCache';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';
import { getMarkdownFilesSorted } from 'obsidian-dev-utils/obsidian/Vault';
import { getPrototypeOf } from 'obsidian-dev-utils/Object';

interface LinkComponent extends Component {
  inputEl: HTMLElement;
  linkEl: HTMLElement;
  linkTextEl: HTMLElement;
  render(): void;
  ctx: PropertyRenderContext;
  value: string;
}

// eslint-disable-next-line @typescript-eslint/no-invalid-void-type
type RenderTextPropertyWidgetFn = (el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext) => Component | void;

export class FrontmatterMarkdownLinksPlugin extends PluginBase<object> {
  private isPropertyWidgetComponentProtoPatched = false;
  protected override createDefaultPluginSettings(): object {
    return {};
  }

  protected override createPluginSettingsTab(): null | PluginSettingTab {
    return null;
  }

  protected override async onLayoutReady(): Promise<void> {
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
      if (cache) {
        this.processFrontMatterLinks(cache.frontmatter, '', cache);
      }
    }
    notice.hide();
  }

  protected override onloadComplete(): void {
    this.registerEvent(this.app.metadataCache.on('changed', this.onMetadataCacheChanged.bind(this)));

    const textPropertyWidget = this.app.metadataTypeManager.registeredTypeWidgets['text'] as PropertyWidget<string>;

    this.register(around(textPropertyWidget, {
      // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
      render: (next: RenderTextPropertyWidgetFn) => (el, data, ctx): Component | void => this.renderTextPropertyWidget(el, data, ctx, next)
    }));
  }

  private onMetadataCacheChanged(_file: TFile, _data: string, cache: CachedMetadata): void {
    this.processFrontMatterLinks(cache.frontmatter, '', cache);
  }

  private processFrontMatterLinks(value: unknown, key: string, cache: CachedMetadata): void {
    if (typeof value == 'string') {
      const parseLinkResult = parseLink(value);
      if (!parseLinkResult || parseLinkResult.isWikilink || parseLinkResult.isExternal) {
        return;
      }

      cache.frontmatterLinks ??= [];
      cache.frontmatterLinks.push({
        key,
        link: parseLinkResult.url,
        original: value
      });

      return;
    }

    if (typeof value !== 'object' || value === null) {
      return;
    }

    for (const [childKey, childValue] of Object.entries(value as Record<string, unknown>)) {
      this.processFrontMatterLinks(childValue, key ? `${key}.${childKey}` : childKey, cache);
    }
  }

  private renderTextPropertyWidgetInternal(next: () => void, component: LinkComponent): void {
    next.call(component);

    const parseLinkResult = parseLink(component.value);
    if (!parseLinkResult || parseLinkResult.isWikilink) {
      return;
    }

    let isUnresolved = false;

    if (!parseLinkResult.isExternal) {
      const resolvedFile = extractLinkFile(this.app, {
        link: parseLinkResult.url,
        original: component.value
      }, component.ctx.sourcePath);
      isUnresolved = !resolvedFile;
    }

    component.inputEl.hide();
    component.linkEl.show();
    component.linkTextEl.textContent = parseLinkResult.alias ?? parseLinkResult.url;
    component.linkTextEl.toggleClass('internal-link', !parseLinkResult.isExternal);
    component.linkTextEl.toggleClass('external-link', parseLinkResult.isExternal ?? false);
    component.linkTextEl.toggleClass('is-unresolved', isUnresolved);

    component.linkTextEl.onClickEvent(convertAsyncToSync(async (e) => {
      if (!parseLinkResult.isExternal) {
        await this.app.workspace.openLinkText(parseLinkResult.url, component.ctx.sourcePath, Keymap.isModEvent(e));
      } else {
        window.open(parseLinkResult.url, '_blank');
      }
    }));
  }

  // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
  private renderTextPropertyWidget(el: HTMLElement, data: PropertyEntryData<string>, ctx: PropertyRenderContext, next: RenderTextPropertyWidgetFn): Component | void {
    const component = next(el, data, ctx) as LinkComponent | undefined;
    if (!component || this.isPropertyWidgetComponentProtoPatched) {
      return component;
    }

    const componentProto = getPrototypeOf(component);
    const self = this;
    this.register(around(componentProto, {
      render: (next) => {
        return function (this: LinkComponent): void {
          self.renderTextPropertyWidgetInternal(next, this);
        };
      }
    }));

    this.isPropertyWidgetComponentProtoPatched = true;
    return component;
  }
}

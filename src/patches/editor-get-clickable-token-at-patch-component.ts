import type { Editor } from 'obsidian';

import { getPrototypeOf } from 'obsidian-dev-utils/object-utils';
import { MonkeyAroundComponent } from 'obsidian-dev-utils/obsidian/components/monkey-around-component';

import { getLinkData } from '../link-data.ts';

interface EditorGetClickableTokenAtPatchComponentConstructorParams {
  readonly editor: Editor;
}

export class EditorGetClickableTokenAtPatchComponent extends MonkeyAroundComponent {
  private readonly editor: Editor;

  public constructor(params: EditorGetClickableTokenAtPatchComponentConstructorParams) {
    super();
    this.editor = params.editor;
  }

  public override onload(): void {
    this.registerMethodPatch({
      methodName: 'getClickableTokenAt',
      obj: getPrototypeOf(this.editor),
      patchHandler: ({
        fallback,
        originalArgs: [pos],
        originalThis
      }) => {
        let clickableToken = fallback();
        if (clickableToken) {
          return clickableToken;
        }

        const offset = originalThis.posToOffset(pos);
        const { node } = originalThis.cm.domAtPos(offset);

        const parentEl = node.instanceOf(HTMLElement) ? node : node.parentElement;
        const frontmatterEl = parentEl?.closest('.cm-hmd-frontmatter');

        if (!frontmatterEl) {
          return null;
        }

        const linkEl = frontmatterEl.find('[data-frontmatter-markdown-links-link-data]:is(.cm-hmd-internal-link, .cm-url)') as HTMLElement | undefined;

        if (!linkEl) {
          return null;
        }

        const linkData = getLinkData(linkEl);

        if (!linkData) {
          return null;
        }

        const startPos = originalThis.offsetToPos(originalThis.cm.posAtDOM(linkEl));
        let endPos = startPos;
        const endEl = frontmatterEl.find('.cm-formatting-link-end') ?? linkEl.nextElementSibling;
        if (endEl) {
          endPos = originalThis.offsetToPos(originalThis.cm.posAtDOM(endEl));
        }

        clickableToken = {
          end: endPos,
          start: startPos,
          text: linkData.url,
          type: linkData.isExternalUrl ? 'external-link' : 'internal-link'
        };
        return clickableToken;
      }
    });
  }
}

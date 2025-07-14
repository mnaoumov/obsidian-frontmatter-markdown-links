import type {
  DecorationSet,
  PluginValue
} from '@codemirror/view';
import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/Link';

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

import type { Plugin } from './Plugin.ts';

import { getDataAttributes } from './LinkData.ts';
import { isSourceMode } from './Utils.ts';

interface GroupDescription {
  cssClass: string;
  isClickable?: boolean;
  regExp: RegExp;
}

interface LinkStylingInfo {
  cssClass: string;
  from: number;
  isClickable?: boolean;
  to: number;
}

class FrontMatterLinksViewPlugin implements PluginValue {
  public get decorations(): DecorationSet {
    return this._decorations;
  }

  private _decorations: DecorationSet;
  private isSourceMode: boolean;

  public constructor(view: EditorView, private readonly app: App) {
    this.isSourceMode = isSourceMode(this.app);
    this._decorations = this.buildDecorations(view);
  }

  public update(update: ViewUpdate): void {
    const currentIsSourceMode = isSourceMode(this.app);
    if (!update.docChanged && !update.viewportChanged && !update.selectionSet && currentIsSourceMode === this.isSourceMode) {
      return;
    }

    this.isSourceMode = currentIsSourceMode;
    this._decorations = this.buildDecorations(update.view);
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    const NO_INDEX = -1;
    let previousLineNumber = NO_INDEX;
    let wasColonProcessed = false;
    let valueStartIndex = NO_INDEX;
    let valueEndIndex = NO_INDEX;
    let hasComment = false;
    const that = this;

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        // eslint-disable-next-line no-loop-func
        enter(node) {
          const lineNumber = view.state.doc.lineAt(node.from).number;
          if (lineNumber !== previousLineNumber) {
            handleValue(valueStartIndex, valueEndIndex, false);
            previousLineNumber = lineNumber;
            wasColonProcessed = false;
            valueStartIndex = NO_INDEX;
            valueEndIndex = NO_INDEX;
            hasComment = false;
          }

          if (node.name === 'comment_hmd-frontmatter') {
            hasComment = true;
            return;
          }

          if (node.name === 'hmd-frontmatter_meta' && !wasColonProcessed) {
            wasColonProcessed = true;
            return;
          }

          if (wasColonProcessed) {
            if (valueStartIndex === NO_INDEX) {
              valueStartIndex = node.from;
            }
            valueEndIndex = node.to;
          }

          if (node.name === 'hmd-frontmatter_string') {
            handleValue(node.from + 1, node.to - 1, true);
            valueStartIndex = NO_INDEX;
            valueEndIndex = NO_INDEX;
          }
        },
        from,
        to
      });

      handleValue(valueStartIndex, valueEndIndex, false);
    }

    return builder.finish();

    function handleValue(startIndex: number, endIndex: number, isInQuotes: boolean): void {
      if (startIndex === NO_INDEX) {
        return;
      }

      let value = view.state.doc.sliceString(startIndex, endIndex);

      if (hasComment) {
        value = value.trimEnd();
      }

      const parseLinkResult = parseLink(value);
      if (!parseLinkResult) {
        return;
      }

      const isInSelection = view.state.selection.ranges.some((r) => (r.from <= startIndex && startIndex <= r.to) || (r.from <= endIndex && endIndex <= r.to));

      if (isInSelection || that.isSourceMode) {
        for (const linkStylingInfo of getLinkStylingInfos(value)) {
          builder.add(
            startIndex + linkStylingInfo.from,
            startIndex + linkStylingInfo.to,
            Decoration.mark({
              attributes: getDataAttributes(
                linkStylingInfo.isClickable
                  ? {
                    isExternalUrl: parseLinkResult.isExternal,
                    isWikilink: parseLinkResult.isWikilink,
                    url: parseLinkResult.url
                  }
                  : null
              ),
              class: linkStylingInfo.cssClass
            })
          );
        }
      } else {
        builder.add(
          startIndex,
          endIndex,
          Decoration.replace({
            inclusive: true,
            widget: new LinkWidget(parseLinkResult, isInQuotes)
          })
        );
      }
    }
  }
}

class LinkWidget extends WidgetType {
  public constructor(private readonly parseLinkResult: ParseLinkResult, private readonly isInQuotes: boolean) {
    super();
  }

  public override toDOM(): HTMLElement {
    return createSpan({
      cls: this.isInQuotes ? '' : 'cm-hmd-frontmatter cm-string'
    }, (span) => {
      span.createSpan({
        cls: 'cm-hmd-internal-link'
      }, (span2) => {
        span2.createEl('a', {
          attr: getDataAttributes({
            isExternalUrl: this.parseLinkResult.isExternal,
            isWikilink: this.parseLinkResult.isWikilink,
            url: this.parseLinkResult.url
          }),
          cls: 'cm-underline',
          text: this.parseLinkResult.alias ?? this.parseLinkResult.url
        });
      });
    });
  }
}

export function registerFrontmatterLinksEditorExtension(plugin: Plugin): void {
  const viewPlugin = ViewPlugin.define((view) => new FrontMatterLinksViewPlugin(view, plugin.app), { decorations: (value) => value.decorations });
  plugin.registerEditorExtension(viewPlugin);
}

function getLinkStylingInfos(value: string): LinkStylingInfo[] {
  const parseLinkResult = parseLink(value);
  if (!parseLinkResult) {
    return [];
  }

  const groupDescriptionSets: GroupDescription[][] = [
    // [[A]] or ![[A]]
    [
      // [[ or ![[
      {
        cssClass: `cm-formatting-link cm-formatting-link-start${parseLinkResult.isEmbed ? ' cm-formatting-embed' : ''}`,
        regExp: /!?\[\[/
      },
      // A
      {
        cssClass: 'cm-hmd-embed cm-hmd-internal-link',
        isClickable: true,
        regExp: /[^|]+/
      },
      // ]]
      {
        cssClass: 'cm-formatting-link cm-formatting-link-end',
        regExp: /\]\]/
      }
    ],
    // [[A|B]] or ![[A|B]]
    [
      // [[ or ![[
      {
        cssClass: `cm-formatting-link cm-formatting-link-start${parseLinkResult.isEmbed ? ' cm-formatting-embed' : ''}`,
        regExp: /!?\[\[/
      },
      // A
      {
        cssClass: 'cm-hmd-internal-link cm-link-has-alias',
        isClickable: true,
        regExp: /[^|]+/
      },
      // |
      {
        cssClass: 'cm-hmd-internal-link cm-link-alias-pipe',
        regExp: /\|/
      },
      // B
      {
        cssClass: 'cm-hmd-internal-link cm-link-alias',
        isClickable: true,
        regExp: /[^|]+/
      },
      // ]]
      {
        cssClass: 'cm-formatting-link cm-formatting-link-end',
        regExp: /\]\]/
      }
    ],
    // ![A](B)
    [
      // !
      {
        cssClass: 'cm-formatting cm-formatting-image cm-image cm-image-marker',
        regExp: /!/
      },
      // [
      {
        cssClass: 'cm-formatting cm-formatting-image cm-image cm-image-alt-text cm-link',
        regExp: /\[/
      },
      // A
      {
        cssClass: 'cm-image cm-image-alt-text cm-link',
        isClickable: true,
        regExp: /.+/
      },
      // ]
      {
        cssClass: 'cm-formatting cm-formatting-image cm-image cm-image-alt-text cm-link',
        regExp: /\]/
      },
      // (
      {
        cssClass: 'cm-formatting cm-formatting-link-string cm-string cm-url',
        regExp: /\(/
      },
      // B
      {
        cssClass: 'cm-string cm-url',
        isClickable: true,
        regExp: /.+/
      },
      // )
      {
        cssClass: 'cm-formatting cm-formatting-link-string cm-string cm-url',
        regExp: /\)/
      }
    ],
    // [A](B)
    [
      // [
      {
        cssClass: 'cm-formatting cm-formatting-link cm-link',
        regExp: /\[/
      },
      // A
      {
        cssClass: 'cm-link',
        isClickable: true,
        regExp: /.+/
      },
      // ]
      {
        cssClass: 'cm-formatting cm-formatting-link cm-link',
        regExp: /\]/
      },
      // (
      {
        cssClass: 'cm-formatting cm-formatting-link-string cm-string cm-url',
        regExp: /\(/
      },
      // B
      {
        cssClass: 'cm-string cm-url',
        isClickable: true,
        regExp: /.+/
      },
      // )
      {
        cssClass: 'cm-formatting cm-formatting-link-string cm-string cm-url',
        regExp: /\)/
      }
    ],
    // <A>
    [
      // <
      {
        cssClass: 'cm-formatting cm-formatting-link cm-link',
        regExp: /</
      },
      // A
      {
        cssClass: 'cm-formatting cm-formatting-link cm-link cm-url',
        isClickable: true,
        regExp: /.+/
      },
      // >
      {
        cssClass: '',
        regExp: />/
      }
    ],
    // A
    [
      // A
      {
        cssClass: 'cm-url',
        isClickable: true,
        regExp: /.+/
      }
    ]
  ];

  for (const groupDescriptions of groupDescriptionSets) {
    const ans = tryGetLinkStylingInfos(value, groupDescriptions);
    if (ans) {
      return ans;
    }
  }

  return [];
}

function tryGetLinkStylingInfos(value: string, groupDescriptions: GroupDescription[]): LinkStylingInfo[] | null {
  const entireRegExpStr = `^${groupDescriptions.map((g) => `(${g.regExp.source})`).join('')}$`;
  const regExp = new RegExp(entireRegExpStr);

  const match = regExp.exec(value);

  if (!match) {
    return null;
  }

  const ans: LinkStylingInfo[] = [];

  let startingIndex = 0;
  let matchIndex = 0;

  for (const groupDescription of groupDescriptions) {
    matchIndex++;
    const endIndex = startingIndex + (match[matchIndex]?.length ?? 0);
    ans.push({
      cssClass: groupDescription.cssClass,
      from: startingIndex,
      isClickable: groupDescription.isClickable ?? false,
      to: endIndex
    });
    startingIndex = endIndex;
  }

  return ans;
}

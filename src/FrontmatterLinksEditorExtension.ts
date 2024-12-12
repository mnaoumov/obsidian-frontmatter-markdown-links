import type {
  DecorationSet,
  PluginValue
} from '@codemirror/view';

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {

  Decoration,
  EditorView
  ,
  ViewPlugin,
  ViewUpdate
} from '@codemirror/view';
import { parseLink } from 'obsidian-dev-utils/obsidian/Link';

import type { FrontmatterMarkdownLinksPlugin } from './FrontmatterMarkdownLinksPlugin.ts';

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

  public constructor(view: EditorView) {
    this._decorations = FrontMatterLinksViewPlugin.buildDecorations(view);
  }

  private static buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    const NO_INDEX = -1;
    let previousLineNumber = NO_INDEX;
    let wasColonProcessed = false;
    let valueStartIndex = NO_INDEX;
    let valueEndIndex = NO_INDEX;
    let hasComment = false;

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        enter: (node) => {
          const lineNumber = view.state.doc.lineAt(node.from).number;
          if (lineNumber !== previousLineNumber) {
            handleValue(valueStartIndex, valueEndIndex);
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
            handleValue(node.from + 1, node.to - 1);
            valueStartIndex = NO_INDEX;
            valueEndIndex = NO_INDEX;
          }
        },
        from,
        to
      });

      handleValue(valueStartIndex, valueEndIndex);
    }

    return builder.finish();

    function handleValue(startIndex: number, endIndex: number): void {
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

      for (const linkStylingInfo of getLinkStylingInfos(value)) {
        builder.add(startIndex + linkStylingInfo.from, startIndex + linkStylingInfo.to, Decoration.mark({
          attributes: linkStylingInfo.isClickable
            ? {
                'data-frontmatter-markdown-link-clickable': '',
                'data-is-external-url': parseLinkResult.isExternal ? 'true' : 'false',
                'data-url': parseLinkResult.url
              }
            : {},
          class: linkStylingInfo.cssClass
        }));
      }
    }
  }

  public update(update: ViewUpdate): void {
    if (!update.docChanged && !update.viewportChanged) {
      return;
    }

    this._decorations = FrontMatterLinksViewPlugin.buildDecorations(update.view);
  }
}

export function registerFrontmatterLinksEditorExtension(plugin: FrontmatterMarkdownLinksPlugin): void {
  const viewPlugin = ViewPlugin.fromClass(FrontMatterLinksViewPlugin, { decorations: (value) => value.decorations });
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
        cssClass: 'cm-formatting-link cm-formatting-link-start' + (parseLinkResult.isEmbed ? ' cm-formatting-embed' : ''),
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
        cssClass: 'cm-formatting-link cm-formatting-link-start' + (parseLinkResult.isEmbed ? ' cm-formatting-embed' : ''),
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
  const entireRegExpStr = `^${groupDescriptions.map((g) => '(' + g.regExp.source + ')').join('')}$`;
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

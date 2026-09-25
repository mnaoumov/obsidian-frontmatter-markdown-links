import type {
  Extension,
  Text
} from '@codemirror/state';
import type {
  DecorationSet,
  PluginValue
} from '@codemirror/view';
import type { App } from 'obsidian';
import type { ParseLinkResult } from 'obsidian-dev-utils/obsidian/parse-link';

import { syntaxTree } from '@codemirror/language';
import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType
} from '@codemirror/view';
import { parseYaml } from 'obsidian';
import {
  parseLink,
  parseLinks
} from 'obsidian-dev-utils/obsidian/parse-link';
import { ensureNonNullable } from 'obsidian-dev-utils/type-guards';
import { ValueWrapper } from 'obsidian-dev-utils/value-wrapper';

import { getDataAttributes } from './link-data.ts';
import { isSourceMode } from './source-mode.ts';

interface DecodeYamlScalarParams {
  readonly quoteCharacter: string;
  readonly value: string;
}

interface FindClosingQuoteIndexParams {
  readonly doc: Text;
  readonly openingQuoteIndex: number;
  readonly quoteCharacter: string;
}

interface GroupDescription {
  cssClass: string;
  isClickable?: boolean;
  regExp: RegExp;
}

interface HandleValueParams {
  readonly endIndex: number;
  readonly isInQuotes: boolean;
  /**
   * The quote the YAML scalar is wrapped in, or the empty string when the value is a plain scalar.
   */
  readonly quoteCharacter: string;
  readonly startIndex: number;
}

interface LinkStylingInfo {
  cssClass: string;
  from: number;
  isClickable?: boolean;
  to: number;
}

const BACKSLASH = '\\';
const DOUBLE_QUOTE = '"';
/**
 * Both of YAML's in-scalar escapes - `\<character>` inside double quotes and `''` inside single ones
 * - are two characters long.
 */
const ESCAPE_SEQUENCE_LENGTH = 2;
const NO_INDEX = -1;
const SINGLE_QUOTE = '\'';

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

export class FrontMatterLinksViewPlugin implements PluginValue {
  private _decorations: DecorationSet;

  private isSourceMode: boolean;

  private get decorations(): DecorationSet {
    return this._decorations;
  }

  public constructor(view: EditorView, private readonly app: App) {
    this.isSourceMode = isSourceMode(this.app);
    this._decorations = this.buildDecorations(view);
  }

  public static createEditorExtension(app: App): Extension {
    return ViewPlugin.define((view) => new FrontMatterLinksViewPlugin(view, app), { decorations: (value) => value.decorations });
  }

  public update(update: ViewUpdate): void {
    const isCurrentIsSourceMode = isSourceMode(this.app);
    if (!update.docChanged && !update.viewportChanged && !update.selectionSet && isCurrentIsSourceMode === this.isSourceMode) {
      return;
    }

    this.isSourceMode = isCurrentIsSourceMode;
    this._decorations = this.buildDecorations(update.view);
  }

  private buildDecorations(view: EditorView): DecorationSet {
    const builder = new RangeSetBuilder<Decoration>();

    let previousLineNumber = NO_INDEX;
    let wasColonProcessed = false;
    let valueStartIndex = NO_INDEX;
    let valueEndIndex = NO_INDEX;
    let quotedScalarEndIndex = NO_INDEX;
    let hasComment = false;
    const thisWrapper = ValueWrapper.of(this);

    for (const { from, to } of view.visibleRanges) {
      syntaxTree(view.state).iterate({
        // eslint-disable-next-line no-loop-func -- Intentionally capture outer variables.
        enter(node) {
          const lineNumber = view.state.doc.lineAt(node.from).number;
          if (lineNumber !== previousLineNumber) {
            handleValue({ endIndex: valueEndIndex, isInQuotes: false, quoteCharacter: '', startIndex: valueStartIndex });
            previousLineNumber = lineNumber;
            wasColonProcessed = false;
            valueStartIndex = NO_INDEX;
            valueEndIndex = NO_INDEX;
            quotedScalarEndIndex = NO_INDEX;
            hasComment = false;
          }

          // A node that falls inside a quoted scalar the first node of that scalar already handled as
          // a whole. CodeMirror's YAML tokenizer ends a double-quoted string at the first `"` it
          // meets, escaped or not, so `"[a \"b\"](c.md)"` arrives as three nodes; handling each on
          // its own found no link in any of them, which is what made an escaped value render as
          // plain text.
          if (node.from < quotedScalarEndIndex) {
            return;
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

          if (node.name !== 'hmd-frontmatter_string') {
            return;
          }

          const quoteCharacter = view.state.doc.sliceString(node.from, node.from + 1);
          const closingQuoteIndex = findClosingQuoteIndex({ doc: view.state.doc, openingQuoteIndex: node.from, quoteCharacter });
          // An unterminated scalar keeps the node's own end, which is what the extension used
          // before it scanned for the real one.
          const scalarEndIndex = closingQuoteIndex === NO_INDEX ? node.to - 1 : closingQuoteIndex;
          handleValue({ endIndex: scalarEndIndex, isInQuotes: true, quoteCharacter, startIndex: node.from + 1 });
          quotedScalarEndIndex = scalarEndIndex + 1;
          valueStartIndex = NO_INDEX;
          valueEndIndex = NO_INDEX;
        },
        from,
        to
      });

      handleValue({ endIndex: valueEndIndex, isInQuotes: false, quoteCharacter: '', startIndex: valueStartIndex });
    }

    return builder.finish();

    function handleValue(params: HandleValueParams): void {
      const { endIndex, isInQuotes, quoteCharacter, startIndex } = params;
      if (startIndex === NO_INDEX) {
        return;
      }

      let value = view.state.doc.sliceString(startIndex, endIndex);

      if (hasComment) {
        value = value.trimEnd();
      }

      const rawParseLinkResults = parseLinks(value);
      const decodedValue = decodeYamlScalar({ quoteCharacter, value });
      const decodedParseLinkResults = decodedValue === value ? rawParseLinkResults : parseLinks(decodedValue);

      for (const [index, rawParseLinkResult] of rawParseLinkResults.entries()) {
        // The raw result carries the offsets into the document, so it positions and styles the
        // decoration. The decoded one carries what the link MEANS once YAML's own escaping is undone,
        // so it supplies the display text and the target: `[a \"b\"](c.md)` must open the same note
        // and read the same as `[a "b"](c.md)`. The two are the same object unless the scalar is
        // escaped, and unescaping never adds or drops a link, so the lists line up.
        const parseLinkResult = decodedParseLinkResults[index] ?? rawParseLinkResult;
        const linkStartIndex = startIndex + rawParseLinkResult.startOffset;
        const linkEndIndex = startIndex + rawParseLinkResult.endOffset;
        const isInSelection = view.state.selection.ranges.some((r) => Math.max(r.from, linkStartIndex) <= Math.min(r.to, linkEndIndex));

        if (isInSelection || thisWrapper.value.isSourceMode) {
          for (const linkStylingInfo of getLinkStylingInfos(rawParseLinkResult.raw)) {
            builder.add(
              linkStartIndex + linkStylingInfo.from,
              linkStartIndex + linkStylingInfo.to,
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
            linkStartIndex,
            linkEndIndex,
            Decoration.replace({
              inclusive: true,
              widget: new LinkWidget(parseLinkResult, isInQuotes)
            })
          );
        }
      }
    }
  }
}

/**
 * Undoes YAML's own escaping inside a quoted scalar, so the link the reader sees matches the one the
 * frontmatter actually holds. A value with nothing to unescape is returned unchanged, which keeps the
 * common line off the YAML parser entirely.
 *
 * @param params - The quote the scalar is wrapped in, and its raw inner text.
 * @returns The unescaped value, or the raw value when it holds no escapes or does not parse.
 */
function decodeYamlScalar(params: DecodeYamlScalarParams): string {
  const { quoteCharacter, value } = params;

  const hasEscapes = quoteCharacter === DOUBLE_QUOTE
    ? value.includes(BACKSLASH)
    : quoteCharacter === SINGLE_QUOTE && value.includes(`${SINGLE_QUOTE}${SINGLE_QUOTE}`);
  if (!hasEscapes) {
    return value;
  }

  try {
    // The caller passes the inner text of a scalar that `findClosingQuoteIndex` delimited, so putting
    // its quotes back yields a whole quoted scalar and the parser always answers with a string.
    return parseYaml(`${quoteCharacter}${value}${quoteCharacter}`) as string;
  } catch {
    // An escape YAML does not define - `\q`, or a lone trailing backslash - makes the parser throw.
    // The raw text is then the best available reading of the value.
    return value;
  }
}

/**
 * Finds where a quoted YAML scalar really ends, applying YAML's own escaping rules rather than
 * trusting CodeMirror's tokenizer, which ends a double-quoted string at the first `"` it meets even
 * when that quote is escaped.
 *
 * @param params - The document, the index of the scalar's opening quote, and that quote character.
 * @returns The index of the closing quote, or `-1` when the scalar does not close on its own line.
 */
function findClosingQuoteIndex(params: FindClosingQuoteIndexParams): number {
  const { doc, openingQuoteIndex, quoteCharacter } = params;

  if (quoteCharacter !== DOUBLE_QUOTE && quoteCharacter !== SINGLE_QUOTE) {
    return NO_INDEX;
  }

  const line = doc.lineAt(openingQuoteIndex);
  const lineText = line.text;
  let index = openingQuoteIndex - line.from + 1;

  while (index < lineText.length) {
    const character = lineText[index];

    if (quoteCharacter === DOUBLE_QUOTE && character === BACKSLASH) {
      // A backslash escapes the next character, so `\"` is a literal quote, not the scalar's end.
      index += ESCAPE_SEQUENCE_LENGTH;
      continue;
    }

    if (character === quoteCharacter) {
      if (quoteCharacter === SINGLE_QUOTE && lineText[index + 1] === SINGLE_QUOTE) {
        // `''` is how a single-quoted scalar writes one literal quote.
        index += ESCAPE_SEQUENCE_LENGTH;
        continue;
      }

      return line.from + index;
    }

    index++;
  }

  return NO_INDEX;
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
  const entireRegExpString = `^${groupDescriptions.map((g) => `(${g.regExp.source})`).join('')}$`;
  const regExp = new RegExp(entireRegExpString);

  const match = regExp.exec(value);

  if (!match) {
    return null;
  }

  const ans: LinkStylingInfo[] = [];

  let startingIndex = 0;
  let matchIndex = 0;

  for (const groupDescription of groupDescriptions) {
    matchIndex++;
    const endIndex = startingIndex + ensureNonNullable(match[matchIndex]).length;
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

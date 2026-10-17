---
obsidian-dev-utils:
  demo-vault-validation:
    allow-wikilinks: The wikilink property value is what Obsidian resolves on its own, which this note contrasts the plugin against.
wikilink: "[[Target note]]"
markdownLink: "[Second target](<Targets/Second target.md>)"
externalUrl: "[Obsidian Help](https://help.obsidian.md)"
multipleLinks: "[[Target note]] and [Second target](<Targets/Second target.md>)"
quotedAlias: "[A \"quoted\" alias](<Targets/Second target.md>)"
---
# Frontmatter markdown links

`Frontmatter Markdown Links` makes **markdown-style links** written in frontmatter real, clickable, resolvable links - in every mode: `Source mode`, `Live Preview`, and `Reading`.

Current Obsidian already draws a property whose whole value is ONE link as a link, markdown or wiki. What it still does not do is the two things below, and they are what the plugin adds:

- **Several links inside one value.** Obsidian draws the whole value as a single link with mangled text; the plugin draws each link on its own, with the text between them kept as text.
- **Links in `Source mode`.** There the frontmatter is raw YAML, and Obsidian leaves every value in it as plain text; the plugin makes each link in it clickable.

Open this note's **properties** (the panel at the top) and look at each value:

- `wikilink`
  - `[[Target note]]`. Obsidian handles this one on its own.
- `markdownLink`
  - `[Second target](<Targets/Second target.md>)`. A single markdown link: a link you can click to open [Second target](<./Targets/Second target.md>), and in `Source mode` one only the plugin makes clickable.
- `externalUrl`
  - `[Obsidian Help](https://help.obsidian.md)`. A markdown link to an external site.
- `multipleLinks`
  - **several links inside a single property**, mixing wikilinks and markdown links. This is the value the properties panel needs the plugin for.
- `quotedAlias`
  - `[A \"quoted\" alias](<Targets/Second target.md>)`. The link text itself contains double quotes, escaped the way YAML requires inside a double-quoted value. It reads and resolves exactly like the unescaped one - see [Quoting, and lists](#quoting-and-lists) below.

## Try it

**Step 1.** Look at `multipleLinks` in the properties above: two links, `Target note` and `Second target`, with ` and ` between them as text. Turn the plugin off and watch the panel redraw it as ONE link reading `[Target note]] and [Second target`, while every single-link value stays a link:

```code-button
---
caption: Turn the plugin off
---
await require('/demoSetup.ts').disablePlugin(app, 'Plugin off. multipleLinks is one mangled link now; the single-link values are still links.');
```

Turn it back on and the two links return:

```code-button
---
caption: Turn the plugin back on
---
await require('/demoSetup.ts').enablePlugin(app, 'Plugin on. multipleLinks shows two links again.');
```

Manual equivalent for both: toggle `Frontmatter Markdown Links` in **Settings -> Community plugins**. The properties panel redraws by itself.

**Step 2.** Open this note again in `Source mode`, in a split beside this one, so its frontmatter shows as raw YAML. Every link value there is underlined:

```code-button
---
caption: Open this note in Source mode beside this one
---
await require('/demoSetup.ts').openFrontmatterLinksNoteInSourceMode(app);
```

In `Source mode` a link opens on a `Ctrl`-click (`Cmd`-click on macOS), as links in the note body do there. Do it on `[Second target]` in the `markdownLink:` line, or let the button do it - [Second target](<./Targets/Second target.md>) opens in a new tab:

```code-button
---
caption: Ctrl-click the markdownLink value in Source mode
---
await require('/demoSetup.ts').modifierClickMarkdownLinkInSourceMode(app);
```

With the plugin off, the same lines are plain text and the click does nothing. Close the `Source mode` copy when you are done:

```code-button
---
caption: Close the Source mode copy
---
require('/demoSetup.ts').closeFrontmatterLinksNoteSourceMode(app);
```

Manual equivalent: open this note in a new pane, switch it to `Source mode` (the **Toggle Live Preview/Source mode** command), `Ctrl`-click the link, then close the pane.

Every link above points at a real note, so they all resolve. Because they resolve, they also register as **backlinks** on their targets - see [02 Backlinks](<./02 Backlinks.md>).

## Every form the plugin understands

The four properties above are the short version. In full:

```yaml
---
# Obsidian supports these natively
wikilink: "[[Wikilink]]"
wikilinkWithAlias: "[[Wikilink|Alias]]"
externalUrl: "https://example.com"

# Markdown-style forms. Obsidian draws some of these as links by itself when one fills a whole value;
# the plugin makes every one a link in Source mode, and inside a value holding several links
markdownLink: "[Alias](MarkdownLink.md)"
markdownLinkWithSpace: "[Alias with space](MarkdownLink%20with%20space.md)"
markdownLinkWithAngleBrackets: "[Alias with space](<MarkdownLink with space.md>)"
externalUrlWithAlias: "[Alias](https://example.com)"
externalUrlWithAngleBrackets: "<https://example.com>"
embeddedWikilink: "![[EmbeddedWikilink]]"
embeddedMarkdownLink: "![Alias](EmbeddedMarkdownLink.md)"
embeddedExternalUrl: "![Alias](https://picsum.photos/600)"
---
```

A path containing spaces works either way — percent-encoded, or wrapped in angle brackets, which is the more readable of the two.

## Quoting, and lists

The one rule worth remembering: **a wikilink or markdown link must be inside quotes**, because `[` starts a list in YAML and the value would not parse. An external URL is fine either way.

```yaml
---
# Wikilinks and markdown links: quotes required
wikilink: "[[Wikilink]]"
markdownLink: "[Alias](MarkdownLink.md)"

# External urls: with or without
externalUrlWithQuotes: "https://example.com"
externalUrlWithoutQuotes: https://example.com
externalUrlWithAngleBrackets: <https://example.com>

# Lists work, in both YAML spellings
multilineList:
  - Non-clickable
  - "[[Wikilink]]"
  - "[Alias](MarkdownLink.md)"
  - https://example.com

inlineList: ["Non-clickable", "[[Wikilink]]", "[Alias](MarkdownLink.md)", "https://example.com"]
---
```

### Quotes inside the link text

If the link text contains a quote of the same kind as the one wrapping the value, YAML needs it escaped - `\"` inside double quotes, `''` inside single ones. Escaping it and wrapping the value in the other quote are two spellings of the same value, and the plugin renders both the same way:

```yaml
---
# Both render as: A "quoted" alias
escapedInDoubleQuotes: "[A \"quoted\" alias](MarkdownLink.md)"
wrappedInSingleQuotes: '[A "quoted" alias](MarkdownLink.md)'

# Renders as: A 'quoted' alias
escapedInSingleQuotes: '[A ''quoted'' alias](MarkdownLink.md)'
---
```

The escaping belongs to YAML, not to the link, so it is undone before the link is drawn - the text you read never shows the backslashes or the doubled quotes.

---
obsidian-dev-utils:
  demo-vault-validation:
    allow-wikilinks: The wikilink property value is what Obsidian resolves on its own, which this note contrasts the plugin against.
wikilink: "[[Target note]]"
markdownLink: "[Second target](<Targets/Second target.md>)"
externalUrl: "[Obsidian Help](https://help.obsidian.md)"
multipleLinks: "[[Target note]] and [Second target](<Targets/Second target.md>)"
---
# Frontmatter markdown links

Obsidian natively makes only `[[wikilinks]]` clickable inside YAML frontmatter (properties). **Frontmatter Markdown Links** extends that so **markdown-style links** written in frontmatter also become real, clickable, resolvable links - in every mode: `Source mode`, `Live Preview`, and `Reading`.

Open this note's **properties** (the panel at the top) and look at each value:

- `wikilink`
  - `[[Target note]]`. Obsidian handles this one on its own.
- `markdownLink`
  - `[Second target](<Targets/Second target.md>)`. **This is what the plugin adds.** Without it, the value is plain text; with it, it is a link you can click to open [Second target](<./Targets/Second target.md>).
- `externalUrl`
  - `[Obsidian Help](https://help.obsidian.md)`. A markdown link to an external site, also made clickable by the plugin.
- `multipleLinks`
  - the plugin resolves **several links inside a single property**, mixing wikilinks and markdown links.

## Try it

1. Click the `markdownLink` value in the properties above - it opens [Second target](<./Targets/Second target.md>).
2. Disable the plugin under **Settings -> Community plugins** and reload. The markdown links become plain text again, while `wikilink` still works. Re-enable the plugin to restore them.

Every link above points at a real note, so they all resolve. Because they resolve, they also register as **backlinks** on their targets - see [02 Backlinks](<./02 Backlinks.md>).

## Every form the plugin understands

The four properties above are the short version. In full:

```yaml
---
# Obsidian supports these natively
wikilink: "[[Wikilink]]"
wikilinkWithAlias: "[[Wikilink|Alias]]"
externalUrl: "https://example.com"

# These are what the plugin adds
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

A path containing spaces works either way — percent-encoded, or wrapped in angle brackets, which is
the more readable of the two.

## Quoting, and lists

The one rule worth remembering: **a wikilink or markdown link must be inside quotes**, because `[` starts
a list in YAML and the value would not parse. An external URL is fine either way.

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

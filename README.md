# Frontmatter Markdown Links

This is a plugin for [Obsidian](https://obsidian.md/) that adds support for markdown links in frontmatter.

## Features

### Markdown links in frontmatter

```yaml
---
# Obsidian supports natively
wikilink: "[[Wikilink]]"
wikilinkWithAlias: "[[Wikilink|Alias]]"
externalUrl: "https://example.com"

# Provided by this plugin
markdownLink: "[Alias](MarkdownLink.md)"
markdownLinkWithSpace: "[Alias with space](MarkdownLink%20with%20space.md)"
markdownLinkWithAngleBrackets: "[Alias with space](<MarkdownLink with space.md>)"
externalUrlWithAlias: "[Alias](https://example.com)"
externalUrlWithAngleBrackets: "<https://example.com>"
embeddedWikilink: "![[EmbeddedWikilink]]"
embeddedMarkdownLink: "![EmbeddedMarkdownLink](EmbeddedMarkdownLink.md)"
embeddedExternalUrl: "![EmbeddedExternalUrl](https://picsum.photos/600)"
---
```

The feature of this plugin is on high demand on Obsidian forum:

- [Properties: Support INTERNAL Markdown links](https://forum.obsidian.md/t/properties-support-external-markdown-links/76918)
- [Properties: Support EXTERNAL Markdown links](https://forum.obsidian.md/t/properties-support-internal-markdown-links/63825/)

### Backlinks

The backlinks are now working for the markdown links in frontmatter.

### Clickable frontmatter links

The links in frontmatter are now clickable in all modes: `Source mode`, `Live Preview`, and `Reading`.

```yaml
---
# Wikilinks and markdown links only inside quotes
wikilink: "[[Wikilink]]"
markdownLink: "[Alias](MarkdownLink.md)"
externalUrlWithAlias: "[Alias](https://example.com)"

# External urls work with and without quotes
externalUrlWithQuotes: "https://example.com"
externalUrlWithQuotesAndAngleBrackets: "<https://example.com>"
externalUrlWithoutQuotes: https://example.com
externalUrlWithoutQuotesAndWithAngleBrackets: <https://example.com>

# Multiline lists
multilineList:
  - Non-clickable
  - "[[Wikilink]]"
  - "[Alias](MarkdownLink.md)"
  - https://example.com

# Inline lists
inlineList: ["Non-clickable", "[[Wikilink]]", "[Alias](MarkdownLink.md)", "https://example.com"]

# Embeds
embeddedWikilink: "![[EmbeddedWikilink]]"
embeddedMarkdownLink: "![EmbeddedMarkdownLink](EmbeddedMarkdownLink.md)"
embeddedExternalUrl: "![EmbeddedExternalUrl](https://picsum.photos/600)"
---
```

## Installation

- `Frontmatter Markdown Links` is not available in [the official Community Plugins repository](https://obsidian.md/plugins) yet.
- Beta releases can be installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

© [Michael Naumov](https://github.com/mnaoumov/)

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
embeddedMarkdownLink: "![Alias](EmbeddedMarkdownLink.md)"
embeddedExternalUrl: "![Alias](https://picsum.photos/600)"
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
embeddedMarkdownLink: "![Alias](EmbeddedMarkdownLink.md)"
embeddedExternalUrl: "![Alias](https://picsum.photos/600)"
---
```

## Installation

The plugin is available in [the official Community Plugins repository](https://obsidian.md/plugins?id=frontmatter-markdown-links).

### Beta versions

To install the latest beta release of this plugin (regardless if it is available in [the official Community Plugins repository](https://obsidian.md/plugins) or not), follow these steps:

1. Ensure you have the [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat) installed and enabled.
2. Click [Install via BRAT](https://intradeus.github.io/http-protocol-redirector?r=obsidian://brat?plugin=https://github.com/mnaoumov/obsidian-frontmatter-markdown-links).
3. An Obsidian pop-up window should appear. In the window, click the `Add plugin` button once and wait a few seconds for the plugin to install.

## Debugging

By default, debug messages for this plugin are hidden.

To show them, run the following command:

```js
window.DEBUG.enable('frontmatter-markdown-links');
```

For more details, refer to the [documentation](https://github.com/mnaoumov/obsidian-dev-utils/blob/main/docs/debugging.md).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

© [Michael Naumov](https://github.com/mnaoumov/)

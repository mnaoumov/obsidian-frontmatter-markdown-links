# Frontmatter Markdown Links

This is a plugin for [Obsidian](https://obsidian.md/) that adds support for markdown links in frontmatter.

```yaml
---
# Obsidian supports natively
wikilink: "[[Note]]"
wikilinkWithAlias: "[[Note|Alias]]"
externalUrl: "https://example.com"

# Provided by this plugin
markdownLink: "[Note](Note.md)"
markdownLinkWithSpace: "[Note with space](Note%20with%20space.md)"
markdownLinkWithAngleBrackets: "[Note with space](<Note with space.md>)"
externalUrlWithAlias: "[Alias](https://example.com)"
externalUrlWithAngleBrackets: "<https://example.com>"
---
```

Also the backlinks are now working for the markdown links in frontmatter.

The feature of this plugin is on high demand on Obsidian forum:

- [Properties: Support INTERNAL Markdown links](https://forum.obsidian.md/t/properties-support-external-markdown-links/76918)
- [Properties: Support EXTERNAL Markdown links](https://forum.obsidian.md/t/properties-support-internal-markdown-links/63825/)

## Installation

- `Frontmatter Markdown Links` is not available in [the official Community Plugins repository](https://obsidian.md/plugins) yet.
- Beta releases can be installed through [BRAT](https://github.com/TfTHacker/obsidian42-brat).

## Support

<a href="https://www.buymeacoffee.com/mnaoumov" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" style="height: 60px !important;width: 217px !important;"></a>

## License

© [Michael Naumov](https://github.com/mnaoumov/)

---
wikilink: "[[Target note]]"
markdownLink: "[Second target](<Targets/Second target.md>)"
externalUrl: "[Obsidian Help](https://help.obsidian.md)"
multipleLinks: "[[Target note]] and [Second target](<Targets/Second target.md>)"
---
[Docs](https://github.com/mnaoumov/obsidian-frontmatter-markdown-links/)

# Frontmatter markdown links

Obsidian natively makes only `[[wikilinks]]` clickable inside YAML frontmatter (properties). **Frontmatter Markdown Links** extends that so **markdown-style links** written in frontmatter also become real, clickable, resolvable links - in every mode: `Source mode`, `Live Preview`, and `Reading`.

Open this note's **properties** (the panel at the top) and look at each value:

- `wikilink` - `[[Target note]]`. Obsidian handles this one on its own.
- `markdownLink` - `[Second target](<Targets/Second target.md>)`. **This is what the plugin adds.** Without it, the value is plain text; with it, it is a link you can click to open [[Second target]].
- `externalUrl` - `[Obsidian Help](https://help.obsidian.md)`. A markdown link to an external site, also made clickable by the plugin.
- `multipleLinks` - the plugin resolves **several links inside a single property**, mixing wikilinks and markdown links.

## Try it

1. Click the `markdownLink` value in the properties above - it opens [[Second target]].
2. Disable the plugin under **Settings -> Community plugins** and reload. The markdown links become plain text again, while `wikilink` still works. Re-enable the plugin to restore them.

Every link above points at a real note, so they all resolve. Because they resolve, they also register as **backlinks** on their targets - see [[02 Backlinks]].

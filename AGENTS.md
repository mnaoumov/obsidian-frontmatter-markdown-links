# AGENTS.md

## Cache persistence

The frontmatter cache uses `LocalDataStore`, scoped by `app.appId`, the manifest id and `frontmatter-links-v1`. Each `file:` record holds links and the processed mtime together. `legacy-import-v1` commits atomically with imported rows; the old IndexedDB stores remain intact. A malformed row rebuilds through the normal parser, and a failed import is retried on a later startup.

The cache owns debounced writes and connection disposal. Replacement and unload drain accepted writes before closing; initialization that completes after disposal closes its late connection. Failed writes remain queued until retry. Seed sharing is off by default, uses a versioned parser compatibility value and verifies local content before reuse. Any future setting that changes parsing must join that compatibility value.

## Desktop test setup

The desktop project uses `scripts/cache-integration-global-setup.ts` and `scripts/cache-integration-setup.ts` to install the toolkit's integration helper plugin and register its library resolver. The restart regression needs the real `LocalDataStore` through the serialized callback's `lib` bag. Other standard projects retain their shared setup.

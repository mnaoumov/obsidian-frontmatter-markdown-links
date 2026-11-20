# CHANGELOG

## 3.1.2

This release has 3 documentation changes. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- **readme:** switch to the plugin badge line
- **changelog:** rewrite the 2.6.18 release notes for readers
- **changelog:** regroup the published release notes for readers

## 3.1.1

This release has 1 fix and 2 documentation changes. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** stop the Third target button opening a second Backlinks pane

### Documentation

- make issue attachments optional and strongly encouraged
- link to the Obsidian resources page

## 3.1.0

This release has 2 new features and 4 documentation changes. 9 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### New

- add a Report a bug command
- **cache:** migrate to local records and validated shared seeds

### Documentation

- **readme:** point bug reports at the Report a bug command
- add issue-filing instructions for AI agents
- **readme:** combine related resources and plugin comparisons
- list similar plugins in the README

## 3.0.4

This release has 6 fixes and 7 documentation changes. 11 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **deps:** read a frontmatter link whose caption holds an unbalanced [ as one link
- drop the plugin name from notice text
- steer a rename into the renamed link of a multi-link property
- **cache:** count multi-link property links once, and drop them when the plugin is off
- **properties:** keep the plugin loadable with an invalid-frontmatter note open
- **ui:** merge rendering plugin names as code in the suggestion reason and progress title

### Documentation

- name `obsidian-lib` where comments said dev-utils
- shorten the debugging section
- **readme:** lead the Debugging section with `Advanced Debug Mode`
- state what Obsidian updates on a rename and pin it with a test
- show the multi-link and Source mode cases the plugin adds, not single links Obsidian draws itself
- **demo-vault:** give the frontmatter links note's Try it code buttons
- mark plugin names as code in markdown and comments

## 3.0.3

This release has 5 fixes and 3 documentation changes. 13 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **test:** merge the headless demo-vault toolkit install
- **deps:** restore the lockfile's missing resolved and integrity fields
- **cache:** delete the file-mtime row too, so the store stops growing
- **editor:** keep the link in a frontmatter value whose text escapes its quotes
- **deps:** float devalue to 5.9.4, clearing GHSA-9rgm-9g3h-6x36

### Documentation

- drop the rule-id citations from the pin table
- **changelog:** name `obsidian-dev-utils` by its package name
- replace the private tracker references with what they pointed at

## 3.0.2

This release has 2 fixes and 2 documentation changes. 5 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **deps:** move onto `obsidian-dev-utils` 101, and stop replacing the plugin registry
- **build:** wire build:compile to buildCompile and drop the duplicate leaf script

### Documentation

- say where the debug command is run
- name the unversioned demo-vault asset and the folder it unzips into

## 3.0.1

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- **deps:** move to `obsidian-integration-testing` 11 and drop the brace-expansion override

## 3.0.0

This release has 1 breaking change and 2 documentation changes.

### Breaking changes

- hand rename and delete handling to `Advanced Rename and Delete Handler`

### Documentation

- **screenshots:** capture the settings tab on both platforms
- point plugin-directory links at community.obsidian.md

## 2.8.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.8.4

This release has 1 fix and 4 documentation changes. 6 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- override deepmerge-ts to clear GHSA-ggr8-5vv4-36mx

### Documentation

- **demo-vault:** unwrap the notes so Obsidian stops rendering a break per line
- **readme:** render the same in Obsidian's plugin page as on `GitHub`
- **demo-vault:** give the demo vault its code buttons
- capture the community-store screenshot set

## 2.8.3

This release has 1 new feature and 1 documentation change.

### New

- **demo-vault:** migrate to `obsidian-dev-utils` 93.3.1 and adopt the authoring convention

### Documentation

- make the demo vault the documentation, in the standard layout

## 2.8.2

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.8.1

This release has 2 fixes. 4 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- re #38
- re #37

## 2.8.0

This release has 1 documentation change. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Documentation

- fix the demo vault download instructions

## 2.7.7

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.7.6

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.7.5

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.7.4

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- **demo-vault:** export invoke() from startup script; add Invocables folder

## 2.7.3

This release has 5 documentation changes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Documentation

- standardize demo-vault README
- drop per-plugin demo-vault setup notes (bootstrap covered by the `obsidian-dev-utils` harness)
- **demo-vault:** create the `Frontmatter Markdown Links` demo vault
- update
- migrate to AGENTS.md

## 2.7.2

This release has 1 fix. 7 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- drop legacy single-value cached links when restoring on startup

## 2.7.1

This release has 1 fix.

### Fixed

- \[BUG\] On installation the following error was (#36)

## 2.7.0

This release has 1 new feature.

### New

- re #33 render mixed-text wikilinks in Bases formula cells

## 2.6.37

This release has 1 fix.

### Fixed

- re #32 \[BUG\] An unhandled error occurred upon opening a base file

## 2.6.36

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- re #34 \[BUG\] When middle-clicking on a markdown link in a property of type "List", note opens twice instead of once.

## 2.6.35

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.34

This release has maintenance changes only. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.6.33

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.32

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.31

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.30

This release has 1 new feature.

### New

- safer trashing

## 2.6.29

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.28

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.27

This release has maintenance changes only. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.6.26

This release has 1 new feature. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### New

- enable rename handler re #27

## 2.6.25

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.24

This release has 1 fix.

### Fixed

- add different implementation for 1.11.0 re #26

## 2.6.23

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- accurately handle links with offsets

## 2.6.22

This release has 2 fixes.

### Fixed

- remove non-existing cache entries
- delete orphan cache entries

## 2.6.21

This release has 1 fix.

### Fixed

- cache invalidation

## 2.6.20

This release has 1 fix.

### Fixed

- missing text between links. re #25

## 2.6.19

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.18

This release has 1 fix. 2 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

### Fixed

- keep the spaces around links in Bases cells (#24)

## 2.6.17

This release has 2 fixes. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- deps versions
- clickable token positions

## 2.6.16

This release has maintenance changes only. 3 maintenance commits (tests, build, CI, refactoring, dependencies) are not listed.

## 2.6.15

This release has 1 fix. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

### Fixed

- build

## 2.6.14

This release has maintenance changes only. 1 maintenance commit (tests, build, CI, refactoring, dependencies) is not listed.

## 2.6.13

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.12

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.11

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.10

This release has 2 other changes.

### Other changes

- Preserve whitespace
- Don't add base class to combined list value (#23)

## 2.6.9

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.8

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.7

This release has 2 other changes.

### Other changes

- Don't transform raw external link (#22)
- Patch bases without temp files

## 2.6.6

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.5

This release has 1 other change.

### Other changes

- Fix external list links in bases

## 2.6.4

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.3

This release has 1 other change.

### Other changes

- Fix double icon for external-link (#21)

## 2.6.2

This release has 2 other changes.

### Other changes

- Wrap list links in span and add parent classes (#20)
- Handle clicks using parent element data

## 2.6.1

This release has 1 other change.

### Other changes

- Minor changes

## 2.6.0

This release has 2 other changes.

### Other changes

- Patch bases cards (#18)
- Transform subpath urls

## 2.5.8

Deploy

## 2.5.7

This release has 1 other change.

### Other changes

- Init displayText (#20)

## 2.5.6

This release has 1 other change.

### Other changes

- Remove previous implementation hooks

## 2.5.5

This release has 1 other change.

### Other changes

- Minor changes

## 2.5.4

This release has 1 other change.

### Other changes

- Minor changes

## 2.5.3

This release has 1 other change.

### Other changes

- Minor changes

## 2.5.2

This release has 1 other change.

### Other changes

- Fix styling of property row lines (#15)

## 2.5.1

This release has 1 other change.

### Other changes

- Don't nest high-level text prop (#16)

## 2.5.0

This release has 4 other changes.

### Other changes

- Fix multitext remove button
- Show suggestions for inner links
- Fix padding for first/last part
- Restore to big widget for editing

## 2.4.3

This release has 4 other changes.

### Other changes

- Hide link pencil
- Make multi text in one line
- Prevent click
- Make widget working for 1.8.10 and 1.9.6

## 2.4.2

This release has 1 other change.

### Other changes

- Process blur changes if they are not trimming previous value (#14)

## 2.4.1

This release has 1 other change.

### Other changes

- Minor changes

## 2.4.0

This release has 1 other change.

### Other changes

- \[FR] Support regular text and spaces? (#13)

## 2.3.3

This release has 1 other change.

### Other changes

- Fix selection check logic (#12)

## 2.3.2

This release has 1 other change.

### Other changes

- Check for missing target  (#11)

## 2.3.1

This release has 1 other change.

### Other changes

- Fix double open (#8)

## 2.3.0

This release has 3 other changes.

### Other changes

- Handle all context menus
- Fix middle click
- Wrap links in widget in live preview mode

## 2.2.0

This release has 1 other change.

### Other changes

- Fix source mode context menu

## 2.1.4

This release has 1 other change.

### Other changes

- Update libs (#9)

## 2.1.3

This release has 1 other change.

### Other changes

- Prevent double link open

## 2.1.2

This release has 1 other change.

### Other changes

- Fix click in preview mode

## 2.1.1

This release has 1 other change.

### Other changes

- Unify context menus

## 2.1.0

This release has 1 other change.

### Other changes

- shouldShowInitializationNotice

## 2.0.8

This release has 1 other change.

### Other changes

- Don't handle wikilink clicks

## 2.0.7

This release has 1 other change.

### Other changes

- Minor changes

## 2.0.6

This release has 1 other change.

### Other changes

- Minor changes

## 2.0.5

This release has 1 other change.

### Other changes

- Minor changes

## 2.0.4

This release has 1 other change.

### Other changes

- Prevent restoring duplicated links

## 2.0.3

This release has 1 other change.

### Other changes

- Avoid restoring duplicated entries

## 2.0.2

This release has 1 other change.

### Other changes

- Add support for urls with spaces

## 2.0.1

This release has 1 other change.

### Other changes

- Ensure events handled when data is ready

## 2.0.0

This release has 1 other change.

### Other changes

- Cache links in IndexedDB

## 1.10.6

This release has 1 other change.

### Other changes

- Read only when needed

## 1.10.5

This release has 1 other change.

### Other changes

- Improve performance

## 1.10.4

This release has 1 other change.

### Other changes

- Minor changes

## 1.10.3

This release has 1 other change.

### Other changes

- Minor changes

## 1.10.2

This release has 1 other change.

### Other changes

- Minor changes

## 1.10.1

This release has 1 other change.

### Other changes

- New template

## 1.10.0

This release has 1 other change.

### Other changes

- Show progress bar

## 1.9.0

This release has 2 other changes.

### Other changes

- Make links clickable in canvas iframes
- Trigger metadata change on unload

## 1.8.0

This release has 1 other change.

### Other changes

- Add hover preview

## 1.7.2

This release has 1 other change.

### Other changes

- Minor changes

## 1.7.1

This release has 1 other change.

### Other changes

- Update template

## 1.7.0

This release has 1 other change.

### Other changes

- Set displayText

## 1.6.0

This release has 4 other changes.

### Other changes

- Show url tooltip
- Format unresolved links
- Preserve value set in UI
- Make links clickable in Live Preview mode

## 1.5.5

This release has 1 other change.

### Other changes

- Lint

## 1.5.4

This release has 1 other change.

### Other changes

- Fix for mobile

## 1.5.3

This release has 1 other change.

### Other changes

- Format

## 1.5.2

This release has 1 other change.

### Other changes

- Minor changes

## 1.5.1

This release has 1 other change.

### Other changes

- Minor changes

## 1.5.0

This release has 1 other change.

### Other changes

- Fix context menu in source mode

## 1.4.2

This release has 1 other change.

### Other changes

- Minor changes

## 1.4.1

This release has 1 other change.

### Other changes

- Minor changes

## 1.4.0

This release has 1 other change.

### Other changes

- Make frontmatter links clickable in source mode

## 1.3.0

This release has 2 other changes.

### Other changes

- Refresh markdown views on load/unload
- Render lists

## 1.2.0

This release has 2 other changes.

### Other changes

- Clear on unload
- Trigger cache changed

## 1.1.0

This release has 1 other change.

### Other changes

- Add fundingUrl

## 1.0.0

This release has 1 other change.

### Other changes

- Initial version

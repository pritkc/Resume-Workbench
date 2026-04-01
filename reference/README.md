# Local Reference Repos

These directories are local upstream clones used for analysis and implementation reference.

Current references:

- `Resume-Matcher`
- `reactive-resume`
- `rendercv`
- `pretext`
- `jacks-resume`

They remain accessible in this workspace, but they are intentionally excluded from the root git repository:

- they are large
- they have their own nested git histories
- they are source references, not our primary project codebase

Current note:

- the active implementation repo is now the root `resume-workk` directory
- the folders under `reference/` are local source references and archival copies only
- git status, add, commit, and push for implementation work should be run from the root repo

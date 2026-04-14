# Local Reference Repos

These directories are local upstream clones used for analysis and implementation reference.

Current references:

- `Resume-Matcher`
- `reactive-resume`
- `rendercv`
- `pretext`
- `jacks-resume`
- `CLIProxyAPI` (sync via script)
- `Cli-Proxy-API-Management-Center` (sync via script)

They remain accessible in this workspace, but they are intentionally excluded from the root git repository:

- they are large
- they have their own nested git histories
- they are source references, not our primary project codebase

Current note:

- the active implementation repo is now the root `resume-workk` directory
- the folders under `reference/` are local source references and archival copies only
- git status, add, commit, and push for implementation work should be run from the root repo

## Upstream Sync Standard

For upstream dependencies we analyze frequently (for example CLIProxyAPI server and management UI), use local read-only clones under `reference/` instead of adding submodules to the main app repo.

Why this is the preferred standard here:

- keeps the main product repo clean and stable
- avoids nested git workflows and merge friction
- keeps source available locally for debugging, docs, and agent context
- easy to refresh on demand with one command

Sync command:

```bash
cd /Users/pritchakalasiya/Development/resume-workk
./scripts/sync-upstream-references.sh
```

This script clones or fast-forwards:

- `https://github.com/router-for-me/CLIProxyAPI.git`
- `https://github.com/router-for-me/Cli-Proxy-API-Management-Center.git`

# Open Source Sync Documentation

This document describes the process for syncing code from the private `in_browser_agent` repository to the public open source `browserx` repository.

## Overview

We maintain two repositories:

- **Private Repository**: `/home/rich/dev/airepublic/ai-republic-agents/in_browser_agent`
  - GitHub: `git@github.com:The-AI-Republic/ai-republic-agents.git`
  - Contains all development including sensitive configurations and internal notes

- **Open Source Repository**: `/home/rich/dev/airepublic/open_source/browserx`
  - GitHub: `git@github.com:The-AI-Republic/browserx.git`
  - Public-facing repository with sensitive data filtered out

## Prerequisites

### 1. Install git-filter-repo

The sync process uses `git-filter-repo` for filtering sensitive files during the sync.

```bash
# Download git-filter-repo
cd /tmp
curl -O https://raw.githubusercontent.com/newren/git-filter-repo/main/git-filter-repo
chmod +x git-filter-repo

# Install to ~/.local/bin
mkdir -p ~/.local/bin
cp git-filter-repo ~/.local/bin/

# Add to PATH (add to ~/.bashrc for persistence)
export PATH="$HOME/.local/bin:$PATH"

# Verify installation
git-filter-repo --version
```

### 2. Ensure Clean Repositories

Both repositories must have no uncommitted changes before syncing:

```bash
# Check private repo
cd /home/rich/dev/airepublic/ai-republic-agents/in_browser_agent
git status

# Check open source repo
cd /home/rich/dev/airepublic/open_source/browserx
git status
```

## Sync Process

### Quick Sync

For a standard sync from the current branch:

```bash
cd /home/rich/dev/airepublic/ai-republic-agents/in_browser_agent
./scripts/sync-to-open-source.sh
```

### Dry Run

To preview what would be synced without actually pushing:

```bash
./scripts/sync-to-open-source.sh --dry-run
```

## What Gets Filtered

The sync script automatically excludes the following paths:

- `.env` files (all variants: `.env`, `.env.local`, `.env.development`, `.env.production`)
- `.claude/` directory (Claude Code configuration)
- `.specify/` directory
- `.vscode/` directory (VSCode settings)
- `.idea/` directory (IntelliJ/WebStorm settings)

**Note**: `.env.example` is intentionally kept as it documents required environment variables without exposing secrets.

## How It Works

The sync script performs these steps:

1. **Prerequisites Check**: Verifies git-filter-repo is installed and both repos are clean
2. **Temporary Clone**: Creates a temporary clone of the private repo
3. **Filter Sensitive Files**: Uses git-filter-repo to remove sensitive paths from history
4. **Merge to Open Source**: Merges the filtered repo into the open source repo
5. **Push Changes**: Pushes the synced branch to the open source remote
6. **Cleanup**: Removes temporary files

## Branch Strategy

- The sync script syncs the **current branch** from the private repo to the open source repo
- If the branch doesn't exist in the open source repo, it will be created
- If the branch exists, changes will be merged

### Syncing a Specific Branch

```bash
# Switch to the branch you want to sync in the private repo
cd /home/rich/dev/airepublic/ai-republic-agents/in_browser_agent
git checkout feature-branch

# Run the sync
./scripts/sync-to-open-source.sh
```

## Workflow Recommendations

### 1. Regular Syncs

Sync regularly to keep the open source repo up to date:

```bash
# After merging a PR or completing a feature
git checkout main
git pull origin main
./scripts/sync-to-open-source.sh
```

### 2. Feature Branch Workflow

When working on a public feature:

```bash
# Develop in private repo
git checkout -b feature-xyz
# ... make changes ...
git commit -m "Add feature XYZ"
git push origin feature-xyz

# Sync to open source
./scripts/sync-to-open-source.sh

# Open source repo now has feature-xyz branch
cd /home/rich/dev/airepublic/open_source/browserx
git push origin feature-xyz
```

### 3. Selective Syncing

To sync only specific branches:

```bash
# Sync main branch
git checkout main
./scripts/sync-to-open-source.sh

# Sync release branches
git checkout release/v1.0
./scripts/sync-to-open-source.sh
```

## Troubleshooting

### "Repository has uncommitted changes"

**Solution**: Commit or stash changes before syncing:

```bash
git stash
./scripts/sync-to-open-source.sh
git stash pop
```

### "git-filter-repo not found"

**Solution**: Ensure git-filter-repo is installed and in PATH:

```bash
# Check installation
which git-filter-repo

# If not found, reinstall
cd /tmp
curl -O https://raw.githubusercontent.com/newren/git-filter-repo/main/git-filter-repo
chmod +x git-filter-repo
mkdir -p ~/.local/bin
cp git-filter-repo ~/.local/bin/
export PATH="$HOME/.local/bin:$PATH"
```

### "Merge conflicts during sync"

**Solution**: Resolve conflicts manually in the open source repo:

```bash
cd /home/rich/dev/airepublic/open_source/browserx
git status  # See conflicted files
# Edit files to resolve conflicts
git add .
git commit -m "Resolve merge conflicts from sync"
git push origin <branch-name>
```

### Accidentally Committed Sensitive Data

If sensitive data was accidentally committed to the private repo and synced:

1. **Remove from private repo history**:
   ```bash
   cd /home/rich/dev/airepublic/ai-republic-agents/in_browser_agent
   git-filter-repo --path-glob 'path/to/sensitive/file' --invert-paths --force
   git push origin --force --all
   ```

2. **Update the sync script** to exclude that path in the `EXCLUDE_PATHS` array

3. **Force sync to open source**:
   ```bash
   cd /home/rich/dev/airepublic/open_source/browserx
   git fetch origin
   git reset --hard origin/main  # WARNING: Destructive
   # Or manually filter the open source repo
   ```

4. **Rotate any exposed secrets** immediately

## Adding New Exclusions

To exclude additional paths from the open source repo:

1. Edit `scripts/sync-to-open-source.sh`
2. Add paths to the `EXCLUDE_PATHS` array:
   ```bash
   EXCLUDE_PATHS=(
     ".env"
     ".env.local"
     ".claude/"
     # ... existing paths ...
     "path/to/new/sensitive/file"  # Add your new path
   )
   ```
3. Test with dry-run:
   ```bash
   ./scripts/sync-to-open-source.sh --dry-run
   ```

## Security Considerations

### Never Commit These to Open Source

- API keys, tokens, credentials
- `.env` files with actual values
- Internal documentation with sensitive information
- Customer data or PII
- Private issue tracker links
- Internal deployment configurations

### Safe to Include

- `.env.example` (template without actual values)
- Public documentation
- Open source license files
- General configuration templates
- Test fixtures (with dummy data)

## Maintenance

### Periodic Review

Review excluded paths periodically:

```bash
# List currently excluded paths
grep "EXCLUDE_PATHS" scripts/sync-to-open-source.sh -A 20
```

### Update Documentation

When adding new sensitive paths or changing the sync process, update this document.

## Support

For issues or questions about the sync process:

1. Check this documentation
2. Review the sync script: `scripts/sync-to-open-source.sh`
3. Consult with the team lead

## References

- [git-filter-repo Documentation](https://github.com/newren/git-filter-repo)
- [GitHub: Managing Sensitive Data](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)

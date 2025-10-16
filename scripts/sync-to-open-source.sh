#!/bin/bash

##############################################################################
# Sync Private Repo to Open Source Repo
#
# This script syncs code from the private in_browser_agent repo to the
# open source browserx repo using git filter-repo.
#
# Usage:
#   ./scripts/sync-to-open-source.sh [--dry-run]
#
# Requirements:
#   - git-filter-repo installed (~/.local/bin/git-filter-repo)
#   - Both repositories must be clean (no uncommitted changes)
##############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PRIVATE_REPO_ROOT="/home/rich/dev/airepublic/ai-republic-agents"
PRIVATE_SUBDIR="in_browser_agent"
OPENSOURCE_REPO="/home/rich/dev/airepublic/open_source/browserx"
TEMP_REPO="/tmp/browserx-sync-$(date +%s)"
GIT_FILTER_REPO="$HOME/.local/bin/git-filter-repo"

# Files/directories to exclude from open source (sensitive or private-only)
EXCLUDE_PATHS=(
  ".env"
  ".env.local"
  ".env.development"
  ".env.production"
  ".claude/"
  ".specify/"
  ".vscode/"
  ".idea/"
)

# Check for dry-run flag
DRY_RUN=false
if [[ "$1" == "--dry-run" ]]; then
  DRY_RUN=true
  echo -e "${YELLOW}Running in DRY-RUN mode - no changes will be pushed${NC}"
fi

##############################################################################
# Helper Functions
##############################################################################

error() {
  echo -e "${RED}ERROR: $1${NC}" >&2
  exit 1
}

info() {
  echo -e "${GREEN}INFO: $1${NC}"
}

warning() {
  echo -e "${YELLOW}WARNING: $1${NC}"
}

check_prereqs() {
  info "Checking prerequisites..."

  # Check git-filter-repo
  if [[ ! -x "$GIT_FILTER_REPO" ]]; then
    error "git-filter-repo not found at $GIT_FILTER_REPO"
  fi

  # Check private repo exists
  if [[ ! -d "$PRIVATE_REPO_ROOT/.git" ]]; then
    error "Private repo not found at $PRIVATE_REPO_ROOT"
  fi

  # Check subdirectory exists
  if [[ ! -d "$PRIVATE_REPO_ROOT/$PRIVATE_SUBDIR" ]]; then
    error "Subdirectory $PRIVATE_SUBDIR not found in $PRIVATE_REPO_ROOT"
  fi

  # Check open source repo exists
  if [[ ! -d "$OPENSOURCE_REPO/.git" ]]; then
    error "Open source repo not found at $OPENSOURCE_REPO"
  fi

  # Check private repo is clean
  cd "$PRIVATE_REPO_ROOT"
  if [[ -n $(git status --porcelain) ]]; then
    warning "Private repo has uncommitted changes. Please commit or stash them first."
    git status --short
    error "Cannot proceed with uncommitted changes"
  fi

  # Check open source repo is clean
  cd "$OPENSOURCE_REPO"
  if [[ -n $(git status --porcelain) ]]; then
    warning "Open source repo has uncommitted changes. Please commit or stash them first."
    git status --short
    error "Cannot proceed with uncommitted changes"
  fi

  info "Prerequisites check passed"
}

create_temp_clone() {
  info "Creating temporary clone of private repo..."

  # Remove temp repo if it exists
  if [[ -d "$TEMP_REPO" ]]; then
    rm -rf "$TEMP_REPO"
  fi

  # Clone private repo
  git clone "$PRIVATE_REPO_ROOT" "$TEMP_REPO"
  cd "$TEMP_REPO"

  # Get current branch name from private repo
  CURRENT_BRANCH=$(cd "$PRIVATE_REPO_ROOT" && git branch --show-current)
  info "Syncing branch: $CURRENT_BRANCH"

  # Checkout the same branch in temp repo
  git checkout "$CURRENT_BRANCH" 2>/dev/null || git checkout -b "$CURRENT_BRANCH"
}

filter_sensitive_files() {
  info "Filtering to subdirectory and removing sensitive files..."

  cd "$TEMP_REPO"

  # First, filter to only keep the subdirectory we want
  info "Extracting $PRIVATE_SUBDIR subdirectory..."
  "$GIT_FILTER_REPO" --path "$PRIVATE_SUBDIR/" --path-rename "$PRIVATE_SUBDIR/:" --force

  # Build filter-repo command with path exclusions for sensitive files
  FILTER_ARGS=()
  for path in "${EXCLUDE_PATHS[@]}"; do
    FILTER_ARGS+=("--path-glob" "$path" "--invert-paths")
  done

  # Run git-filter-repo again to remove sensitive files
  if [[ ${#EXCLUDE_PATHS[@]} -gt 0 ]]; then
    info "Removing sensitive files..."
    "$GIT_FILTER_REPO" "${FILTER_ARGS[@]}" --force
  fi

  info "Filtering complete"
}

merge_to_opensource() {
  info "Merging filtered repo to open source repo..."

  cd "$OPENSOURCE_REPO"

  # Get current branch
  CURRENT_BRANCH=$(cd "$PRIVATE_REPO_ROOT" && git branch --show-current)

  # Add temp repo as remote
  git remote add temp-sync "$TEMP_REPO" 2>/dev/null || git remote set-url temp-sync "$TEMP_REPO"

  # Fetch from temp repo
  git fetch temp-sync

  # Check if branch exists in open source repo
  if git show-ref --verify --quiet "refs/heads/$CURRENT_BRANCH"; then
    # Branch exists, merge changes
    info "Branch $CURRENT_BRANCH exists, merging changes..."
    git checkout "$CURRENT_BRANCH"
    git merge temp-sync/"$CURRENT_BRANCH" --allow-unrelated-histories -m "Sync from private repo on $(date +%Y-%m-%d)"
  else
    # Branch doesn't exist, create it
    info "Creating new branch $CURRENT_BRANCH from temp repo..."
    git checkout -b "$CURRENT_BRANCH" temp-sync/"$CURRENT_BRANCH"
  fi

  # Remove temp remote
  git remote remove temp-sync

  info "Merge complete"
}

push_changes() {
  cd "$OPENSOURCE_REPO"

  CURRENT_BRANCH=$(git branch --show-current)

  if [[ "$DRY_RUN" == true ]]; then
    info "DRY-RUN: Would push branch $CURRENT_BRANCH to origin"
    info "Latest commits:"
    git log --oneline -5
  else
    info "Pushing changes to open source repo..."
    git push origin "$CURRENT_BRANCH"
    info "Push complete"
  fi
}

cleanup() {
  info "Cleaning up temporary files..."
  if [[ -d "$TEMP_REPO" ]]; then
    rm -rf "$TEMP_REPO"
  fi
  info "Cleanup complete"
}

show_summary() {
  cd "$OPENSOURCE_REPO"

  echo ""
  echo "=============================================="
  echo "Sync Summary"
  echo "=============================================="
  echo "Private repo: $PRIVATE_REPO_ROOT/$PRIVATE_SUBDIR"
  echo "Open source repo: $OPENSOURCE_REPO"
  echo "Branch: $(git branch --show-current)"
  echo ""
  echo "Latest commits in open source repo:"
  git log --oneline -5
  echo "=============================================="
}

##############################################################################
# Main Execution
##############################################################################

main() {
  info "Starting sync process..."

  # Run checks
  check_prereqs

  # Create temporary filtered clone
  create_temp_clone

  # Filter sensitive files
  filter_sensitive_files

  # Merge to open source repo
  merge_to_opensource

  # Push changes
  push_changes

  # Cleanup
  cleanup

  # Show summary
  show_summary

  info "Sync process complete!"

  if [[ "$DRY_RUN" == true ]]; then
    warning "This was a DRY-RUN. Run without --dry-run flag to push changes."
  fi
}

# Trap cleanup on exit
trap cleanup EXIT

# Run main function
main "$@"

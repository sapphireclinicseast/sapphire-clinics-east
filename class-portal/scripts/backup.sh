#!/usr/bin/env bash
# Weekly backup of the class-portal subtree to Google Drive.
#
# Run by /etc/cron.weekly on the VPS. Drops a date-stamped tarball into a
# Drive folder owned by main@sapphireclinicseast.org using rclone.
#
# One-time setup (done interactively, only once):
#   apt install rclone
#   rclone config            # name: scei_drive · type: drive · scope: drive
#                            # follow the URL, sign in as main@sapphireclinicseast.org,
#                            # paste the verifier code back.
#   rclone mkdir scei_drive:/SCEI-Backups/class-portal
#
# Once that is done this script runs unattended.

set -euo pipefail

REPO_ROOT="${REPO_ROOT:-/opt/sapphire}"
REMOTE="${RCLONE_REMOTE:-scei_drive:/SCEI-Backups/class-portal}"
STAGE="$(mktemp -d)"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ARCHIVE="$STAGE/class-portal-$STAMP.tar.gz"

cleanup() { rm -rf "$STAGE"; }
trap cleanup EXIT

cd "$REPO_ROOT"

# Tar the class-portal subtree from the live working copy. Exclude build
# output and node_modules so the archive stays small.
tar --exclude='class-portal/node_modules' \
    --exclude='class-portal/.next' \
    --exclude='class-portal/.turbo' \
    -czf "$ARCHIVE" \
    class-portal

# Sanity check the archive isn't suspiciously small.
if [ "$(stat -c%s "$ARCHIVE")" -lt 100000 ]; then
  echo "ERROR: archive is smaller than 100 KB — aborting upload." >&2
  exit 1
fi

# Push to Drive. --no-traverse is faster for write-only paths.
rclone copy "$ARCHIVE" "$REMOTE" --no-traverse

# Prune backups older than 60 days so the folder doesn't grow forever.
rclone delete "$REMOTE" --min-age 60d 2>/dev/null || true

echo "[$STAMP] Uploaded $(basename "$ARCHIVE") ($(stat -c%s "$ARCHIVE") bytes) to $REMOTE"

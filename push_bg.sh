#!/bin/bash
set -e

H_BG=$(git hash-object -w "src/components/dashboard/BadgesGallery.tsx")

HEAD=$(git rev-parse refs/heads/main)
ROOT=$(git cat-file -p "$HEAD" | grep "^tree" | awk '{print $2}')
SRC=$(git cat-file -p "$ROOT" | grep "	src$" | awk '{print $3}')

# Fix components
COMP=$(git cat-file -p "$SRC" | grep "	components$" | awk '{print $3}')
DASH=$(git cat-file -p "$COMP" | grep "	dashboard$" | awk '{print $3}')
OLD_BG=$(git cat-file -p "$DASH" | grep "BadgesGallery.tsx" | awk '{print $3}')

NEW_DASH=$(git cat-file -p "$DASH" | sed "s/$OLD_BG/$H_BG/" | git mktree --missing)
NEW_COMP=$(git cat-file -p "$COMP" | sed "s/$DASH/$NEW_DASH/" | git mktree --missing)

# Build src + root
NEW_SRC=$(git cat-file -p "$SRC" | sed "s/$COMP/$NEW_COMP/" | git mktree --missing)
NEW_ROOT=$(git cat-file -p "$ROOT" | sed "s/$SRC/$NEW_SRC/" | git mktree --missing)

MSG="feat: redesign Iron Rank card for premium UI and fix render lint"
COMMIT=$(git commit-tree "$NEW_ROOT" -p "$HEAD" -m "$MSG")
git update-ref refs/heads/main "$COMMIT"
git push origin main 2>&1
echo "=== PUSH DONE ✅ ==="

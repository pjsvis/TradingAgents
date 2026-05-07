#!/bin/bash
# Install a pre-push hook that regenerates GitNexus diagrams before every push.
#
# Usage:
#   bash scripts/install-pre-push-hook.sh
#   # or: just install-hooks

set -e

HOOK_DIR="$(git rev-parse --git-dir)/hooks"
HOOK_FILE="${HOOK_DIR}/pre-push"

cat > "${HOOK_FILE}" << 'HOOK'
#!/bin/bash
# Pre-push hook: regenerate GitNexus diagrams if code changed

# Check if any source files changed since last diagram generation
# (excluding docs/, *.svg, *.png, *.dot)
CHANGED=$(git diff --name-only HEAD | grep -v "^docs/diagrams/" | grep -v "\.svg$" | grep -v "\.png$" | grep -v "\.dot$" | grep -v "\.md$" || true)

if [ -z "$CHANGED" ]; then
    echo "[pre-push] No source changes detected. Skipping diagram regen."
    exit 0
fi

echo "[pre-push] Source files changed. Regenerating diagrams..."

# Run diagram regeneration (suppressing most output)
if command -v just >/dev/null 2>&1; then
    just regen-diagrams >/dev/null 2>&1 || true
else
    echo "[pre-push] Warning: 'just' not found. Install with: brew install just"
    exit 0
fi

# Check if any generated diagrams changed
NEW_DIAGRAMS=$(git status --short docs/diagrams/gn-* docs/diagrams/*.svg 2>/dev/null | grep -E "^\s*M|^\??" || true)

if [ -n "$NEW_DIAGRAMS" ]; then
    echo "[pre-push] Diagrams updated. Auto-committing..."
    git add docs/diagrams/gn-*.dot docs/diagrams/gn-*.svg docs/diagrams/gn-*.png 2>/dev/null || true
    git add docs/diagrams/*.svg 2>/dev/null || true
    git commit -m "chore(diagrams): auto-regenerate from pre-push hook" --no-verify || true
    echo "[pre-push] Diagrams committed. Push will now proceed."
else
    echo "[pre-push] Diagrams unchanged."
fi

exit 0
HOOK

chmod +x "${HOOK_FILE}"
echo "Installed pre-push hook to: ${HOOK_FILE}"
echo ""
echo "This hook will auto-regenerate GitNexus diagrams on every push"
echo "where source files have changed."

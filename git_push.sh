#!/bin/bash
# Simple script to push changes to the STF-12 branch

# Ensure we are in the project root
git rev-parse --show-toplevel >/dev/null 2>&1 || { echo "Not a git repository"; exit 1; }

# Check out existing STF-12 branch or create it from main
if git show-ref --verify --quiet refs/heads/STF-12; then
    git checkout STF-12
else
    git checkout -b STF-12 main
fi

# Add all changes
git add .

# Commit with a descriptive message
git commit -m "Add hashing & SMS fixes for STF-12"

# Push to remote (assumes origin is set)
git push -u origin STF-12

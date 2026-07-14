---
name: code-discipline
description: Apply this project's code-quality constraints when the user explicitly requests coding discipline, minimal dependencies, YAGNI, a refactoring-quality review, or a disciplined diff review. Do not trigger for routine implementation or bug fixes alone.
---

# Code discipline

Prefer the smallest correct change. Reuse existing patterns and standard-library capabilities before adding abstractions or dependencies. Keep responsibilities focused, preserve compatibility, and verify behavior proportionate to risk.

For a detailed decision ladder and prohibited patterns, read [references/full-guide.md](references/full-guide.md) only when the user requests a formal quality review or the implementation presents a meaningful design tradeoff.

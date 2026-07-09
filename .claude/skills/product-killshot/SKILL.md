---
name: product-killshot
description: >
  Use when the user says 产品杀手锏, 竞品分析, product analysis, competitive analysis,
  killshot, or wants a competitive product analysis with actionable optimization report.
  Also triggers on "product-killshot".
---

# Product Killshot — 产品杀手锏分析

## Overview

**One command, full analysis.** When invoked, you automatically:

1. Read and deeply understand the target project's code, features, and positioning
2. Web search for the top competing product on the market
3. Run two independent analyses from different user perspectives
4. Synthesize everything into a prioritized Markdown optimization report

**No questions asked.** The user runs `/product-killshot` and you execute the entire pipeline automatically.

## Execution Pipeline

```
Read code → Identify positioning → Web search competitor
  → Agent A (Competitor user) + Agent B (Your user) in parallel
  → Synthesize report → Save to docs/
```

### Phase 1: Project Intelligence (Auto)

**Do NOT ask the user anything.** Infer everything from the code.

1. **Scan the project** — Read README, package.json/pyproject.toml/Cargo.toml, main source files, config files
2. **Identify**:
   - Product name and one-line positioning
   - Target user persona (who uses this?)
   - Core features list
   - Tech stack and architecture patterns
   - Current UX flow (how does a user interact with it?)
   - Weaknesses visible from code (missing error handling, poor docs, etc.)
3. **Determine competitor search query** — Based on product type, formulate the web search query

### Phase 2: Market Research (Web Search)

1. **Search for the #1 competing product** — The dominant player in the same space
   - Use broad queries like "best [product type] tool 2025 2026"
   - Use specific queries like "[product category] alternatives comparison"
   - Find the market leader, NOT a niche competitor
2. **Deep dive the competitor**:
   - Core features and differentiators
   - Pricing model
   - User reviews and common praise/complaints
   - Recent updates and roadmap hints
   - What makes users loyal (lock-in factors)
3. **Identify 2-3 secondary competitors** if the space is fragmented

### Phase 3: Dual-Perspective Analysis (Two Agents)

**Run these as two independent agents in parallel.**

#### Agent A — Competitor Power User (竞品资深用户)

**Persona**: You are a power user of the competitor product. You've used it daily for 2+ years. You know every shortcut, every workaround, every edge case. You LOVE this tool but you're open to alternatives IF they're genuinely better.

**Your task**: Look at the user's project honestly and answer:

> "What would this project need to change/add so that I, a deeply entrenched user of [competitor], would switch to it AND NEVER GO BACK?"

Analyze from these angles:
- **Switching cost reduction** — What makes it painless to migrate from [competitor]?
- **10x moments** — Where could this product be dramatically better than [competitor]?
- **Missing killer features** — What does [competitor] have that this product MUST match?
- **Deal-breakers** — What current gaps would prevent you from even trying it?
- **Lock-in opportunity** — What features, once adopted, would make it impossible to go back to [competitor]?

Be brutally honest. Don't be polite. If nothing would make you switch, say so and explain exactly why.

#### Agent B — Your Product Power User (自家产品资深用户)

**Persona**: You are a power user of the user's product. You've used it daily for 6 months. You like it but you're hitting friction points. You want it to be your primary tool but it needs improvement.

**Your task**: Identify what would make your experience dramatically better:

- **Efficiency (speed)**:
  - What workflows are slower than they should be?
  - Where do you wait unnecessarily?
  - What requires too many steps?
  - What should be automated but isn't?

- **Efficiency (quality)**:
  - Where is the output quality inconsistent?
  - What errors or issues occur repeatedly?
  - What lacks intelligence/context awareness?
  - Where does the product make wrong assumptions?

- **UI / UX**:
  - What's confusing or hard to discover?
  - What visual feedback is missing?
  - Where does the interaction pattern feel dated or clunky?
  - What would make the product feel premium vs. amateur?

- **Stickiness factors**:
  - What would make you check this tool first every morning?
  - What social/collaboration features would lock you in?
  - What personalization would make it feel like YOUR tool?
  - What would make you recommend it to 5 colleagues?

### Phase 4: Synthesize & Report

Merge both agents' findings into a single structured report. Save to:

```
docs/product-killshot-YYYY-MM-DD.md
```

**Report structure** (match the conversation language — Chinese if user spoke Chinese, English otherwise):

```markdown
# Product Killshot Report — [Product Name]
> Generated: YYYY-MM-DD | Competitor analyzed: [Competitor Name]

## Executive Summary

## Product Snapshot

## Competitive Landscape
### Top Competitor: [Name]
### Secondary Competitors

---

## Part I: Competitive Killshot (竞品杀手锏)

### 🎯 Quick Wins (Low Effort, High Impact)
| # | Feature | Why It Kills | Effort | Impact |
|---|---------|-------------|--------|--------|
| 1 | ... | ... | Low | High |

### 🔥 Switching Triggers
### 💀 Deal-Breaker Gaps
### 🔒 Lock-In Opportunities

---

## Part II: User Experience Evolution (体验进化)

### 🎯 Quick Wins
| # | Improvement | Dimension | Effort | Impact |
|---|------------|-----------|--------|--------|
| 1 | ... | Speed/Quality/UI | Low | High |

### ⚡ Speed Optimizations
### ✨ Quality Enhancements
### 🎨 UI/UX Upgrades
### 💪 Stickiness Multipliers

---

## Part III: Unified Priority Matrix

| Priority | Count | Description |
|----------|-------|-------------|
| P0 (Do Now) | N | Quick wins from both analyses |
| P1 (Next Sprint) | N | High-impact competitive features |
| P2 (Roadmap) | N | Important but lower urgency |
| P3 (Nice-to-have) | N | Polish and differentiation |

#### Phase 1 — Quick Wins (Week 1)
- [ ] ...
#### Phase 2 — Competitive Parity (Weeks 2-4)
- [ ] ...
#### Phase 3 — Market Differentiation (Month 2)
- [ ] ...
#### Phase 4 — Lock-In & Growth (Month 3+)
- [ ] ...

---

## Appendix
### Raw Analysis: Competitor Power User Perspective
### Raw Analysis: Your Product Power User Perspective
```

## Hard Rules

1. **No fabrication** — All competitor data must come from real web search results. Never invent features, pricing, or reviews
2. **Brutal honesty** — If the product has fundamental issues, say so. Polite reports are useless reports
3. **Actionable specificity** — Every recommendation must be specific enough to create a GitHub issue from. No "improve UX" — say "add progress spinner with percentage during file generation"
4. **Priority is mandatory** — Every recommendation gets P0/P1/P2/P3 and effort level (Low/Med/High)
5. **Quick wins first** — Always lead with low-effort high-impact items
6. **Code-aware** — Reference specific files and patterns in the project where recommendations apply
7. **Deduplication** — If both agents suggest the same thing, merge into one item with combined justification
8. **Language follows context** — Chinese output if user spoke Chinese, English otherwise. Technical terms stay in English
9. **Save the file** — Always write the report to `docs/product-killshot-YYYY-MM-DD.md` and tell the user where it is
10. **Feed into Proposal** — After the report is saved, suggest creating a planning Issue using insights from this report's competitive analysis.

## When Not to Use This Skill

- Projects with no existing code or product definition (needs something to analyze)
- Pure design/branding reviews (needs different expertise)
- When user wants a single specific feature review (use brainstorming instead)

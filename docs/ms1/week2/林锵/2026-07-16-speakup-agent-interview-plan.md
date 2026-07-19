# SpeakUp Agent Interview Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a four-round single-interview plan created by SpeakUp and present it as a restrained mobile swipe-card plan page.

**Architecture:** Extend the existing mock plan data with round metadata and four independent interviewer session lists. Render the Agent completion summary from that plan, and replace the single interviewer panel with a scroll-snap list whose actions carry the target round index.

**Tech Stack:** Static HTML, CSS, browser JavaScript, Node.js built-in test runner.

## Global Constraints

- Keep the existing white, light-gray, black-button, pale-cyan visual language.
- Do not add dependencies, gradients, glow, glass effects, stars, or nested cards.
- A swipe card represents one interview round, not an interviewer pool.
- Single mode has four rounds; each round has one interviewer and independent sessions.
- Preserve the current panel interview flow.

---

### Task 1: Four-round mock plan and Agent result

**Files:**
- Modify: `prototype/speakup-premium/tests/agent-create-flow.test.mjs`
- Modify: `prototype/speakup-premium/assets/panel-extension.js`

**Interfaces:**
- Produces: `createAgentMockPlan()` returning a plan whose single mode has four interviewers with `roundTitle` and `roundDuration`.
- Produces: `agentCreateSummary(true)` containing the four-round plan overview.

- [ ] Add assertions that single mode creates four round presets, total duration is 70 minutes, and the created summary contains the four round names.
- [ ] Run `node --test prototype/speakup-premium/tests/agent-create-flow.test.mjs` and confirm the new assertions fail because only one interviewer is generated.
- [ ] Update the presets and created-summary markup with the minimum data and copy needed by the test.
- [ ] Run the same test and confirm it passes.

### Task 2: Swipeable round plan page

**Files:**
- Create: `prototype/speakup-premium/tests/interview-plan-carousel.test.mjs`
- Modify: `prototype/speakup-premium/assets/interview-alignment.js`
- Modify: `prototype/speakup-premium/assets/panel-extension.js`

**Interfaces:**
- Consumes: `plan.interviewers[index].roundTitle`, `roundDuration`, and `plan.sessions[index]`.
- Produces: `alignedRoundsV3()` markup with `data-plan-carousel`, `data-round-index`, and indexed `align-prepare` actions.

- [ ] Add source-level assertions for the plan summary, four-card loop, indexed entry actions, status-specific CTA copy, dots, and scroll synchronization.
- [ ] Run `node --test prototype/speakup-premium/tests/interview-plan-carousel.test.mjs` and confirm it fails because the swipe plan markup is absent.
- [ ] Replace the single-card renderer with a scroll-snap round-card track and update click/scroll handlers so the selected round is activated before preparation.
- [ ] Run the new test and the complete prototype test directory and confirm they pass.

### Task 3: Restrained mobile styling and visual verification

**Files:**
- Modify: `prototype/speakup-premium/assets/panel-extension.css`

**Interfaces:**
- Consumes: the semantic class names from Task 2.
- Produces: a single-layer swipe card with a visible next-card edge and no gradients or decorative borders.

- [ ] Add CSS assertions to `interview-plan-carousel.test.mjs` for scroll snap, flat card background, black primary action, and absent gradient on the new card.
- [ ] Run the carousel test and confirm the CSS assertions fail.
- [ ] Add the minimum responsive CSS for the plan overview, card track, card hierarchy, CTA and dots.
- [ ] Run all prototype tests.
- [ ] Open `prototype/speakup-premium/pages/prototype.html`, complete the mock Agent flow, open the plan, swipe through cards, enter a non-first round, and capture a mobile screenshot.
- [ ] Check that no page-level horizontal overflow, clipped CTA, duplicate border, gradient, or incorrect interviewer activation remains.

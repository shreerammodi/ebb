# Flow UX Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-evaluation (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a batch of UX improvements including an undo/redo system, scouting info, and CX integration as per the 2026-06-03 specification.

**Architecture:**
1. **Core Engine**: Update `src/lib/model/types.ts` and `src/lib/store/useRoundStore.ts` to include new data models (scouting, CX) and an undo/redo system. Undo logic will be "transactional" for content updates (coalescing).
2. **UI Components**: Updates to `src/components/RoundHeader.tsx`, `src/components/Sidebar.tsx`, `src/components/FlowGrid.tsx`, and `src/components/GridCell.tsx`.
3. **New Features**: Add `InfoPanel` component, update `RoundSetup` flow, and implement the "CX" layout logic.

**Tech Stack:** TypeScript, Zustand, React, Tailwind CSS.

---

### Task 1: Core Model & State Update (Undo, Scouting, CX)

**Files:**
- Modify: `src/lib/model/types.ts`
- Modify: `src/lib/store/useRoundStore.ts`
- Modify: `src/lib/store/useRoundStore.test.ts`

- [ ] **Step 1: Update Types**
Add `Scouting`, update `Round` to include scouting fields, and add `kind` property to `Sheet`. Remove `topic` from the model.
- [ ] **Step 2: Implement Undo/Redo Logic in Store**
Implement a stack-based undo/redo system with "transactional" updates for text changes (coalescing). Use a commit helper to ensure only content mutations are recorded as distinct actions while others (selection, timers) are ignored.
- [ ] **Step 3: Add Scouting and CX State Management**
Integrate the new fields into `useRoundStore` with proper persistence logic via middleware/defaults.
- [ ] **Step 4: Update Store Tests**
Verify that undo/redo correctly handles selection, deletions, and text updates while ignoring transient state like timers.

### Task 2: Navigation & UI Enhancements

**Files:**
- Modify: `src/components/RoundHeader.tsx`
- Modify: `src/lib/editor/styles.css`
- Modify: `src/components/FlowGrid.tsx`
- Modify: `src/components/GridCell.tsx`

- [ ] **Step 1: Add Settings Button**
Add a gear icon to the navigation bar in `RoundHeader`.
- [ ] **Step 2: Refine Flow Grid Aesthetics**
Update CSS and components to remove dashes from empty cells and center header content.
- [ ] **Step 3: Implement Display Preferences**
Add `autoNumber` and `labelDrops` toggles in settings, updating the store and UI accordingly.

### Task 3: Scouting & Info Panel

**Files:**
- Modify: `src/components/InfoPanel.tsx` (or create)
- Modify: `src/components/RoundHeader.tsx`
- Modify: `src/components/RoundSetup.tsx`

- [ ] **Step 1: Create InfoPanel Component**
Build a modal for editing scouting fields and viewing team codes.
- [ ] **Step 2: Simplify RoundSetup**
Streamline the creation flow to only require role selection before entering the main interface.
- [ ] **Step 3: Integrate Scouting into Header**
Update participant display logic in `RoundHeader` to pull from `scouting` data.

### Task 4: CX Integration**

**Files:**
- Modify: `src/components/Workspace.tsx`
- Modify: `src/lib/store/useRoundStore.ts`
- Modify: `src/components/FlowGrid.tsx`

- [ ] **Step 1: Conditional Rendering for CX Sheets**
Update the workspace to render a specific layout when a sheet of type 'cx' is active.
- [ ] **Step 2: Integrate CX into Grid Logic**
Use the existing grid infrastructure for CX cells while disabling drop detection and other standard features on these rows.
- [ ] **Step 3: Update Export/Import Logic**
Ensure new fields are included in JSON exports and handled during legacy data migration.

# DOM Flattening and Compaction Design Document

**Version**: 3.0 (Fidelity-First Lossless Design)
**Date**: 2025-10-29
**Status**: Proposed
**Authors**: AI Design Assistant
**Feature Branch**: Future implementation
**Philosophy**: **Fidelity-first lossless compaction** - preserve all user-visible content, remove only unnecessary structure

---

## Executive Summary

This document proposes a **deterministic, single-pass serialization pipeline** to optimize the DOM serialization process in BrowserX's CDP-based DOM tool. The goal is to reduce token consumption by removing unnecessary HTML structure while **preserving all user-visible content without summarization or loss**.

**Current Challenge**: The SerializedDom tree can consume 5,000-15,000 tokens for complex pages (Gmail, Notion, Salesforce), with significant bloat from wrapper divs, hidden elements, and verbose encoding.

**Proposed Solution**: Single-pass pipeline (Signal Filtering → Structure Simplification → Payload Optimization) that removes only noise and unnecessary structure, achieving 30-50% token reduction with **zero content loss**.

**Design Philosophy Shift**:
- **OLD APPROACH**: Maximum compression → summarize repetitions → on-demand expansion
- **NEW APPROACH**: Fidelity-first → preserve all visible content → remove only structural noise

**Expected Impact**:
- 30-50% reduction in token consumption (modest but safe)
- **100% content fidelity** (all user-visible elements preserved)
- Deterministic output (no adaptive budgets or iterations)
- Faster serialization (<50ms, single pass)
- **≥99% interaction accuracy** (higher threshold due to zero content loss)
- No expansion API needed (nothing is summarized)

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Problem Statement](#problem-statement)
3. [Design Philosophy: Fidelity-First](#design-philosophy-fidelity-first)
4. [Architecture: Single-Pass Pipeline](#architecture-single-pass-pipeline)
5. [Stage 1: Signal Filtering](#stage-1-signal-filtering)
6. [Stage 2: Structure Simplification](#stage-2-structure-simplification)
7. [Stage 3: Payload Optimization](#stage-3-payload-optimization)
8. [Data Model Changes](#data-model-changes)
9. [Implementation Plan](#implementation-plan)
10. [Metrics and Success Criteria](#metrics-and-success-criteria)
11. [Risk Assessment](#risk-assessment)
12. [Testing Strategy](#testing-strategy)
13. [Future Enhancements](#future-enhancements)

---

## Current State Analysis

### Architecture Overview

The current implementation uses a **two-pass approach**:

```
Pass 1: CDP DOM/A11y APIs → VirtualNode tree (complete 1:1 representation)
Pass 2: VirtualNode tree → SerializedDom (flattened for LLM)
```

#### Current SerializedDom Structure

```typescript
interface SerializedDom {
  page: {
    context: { url: string; title: string; };
    body: SerializedNode;
    stats: SnapshotStats;
  };
}

interface SerializedNode {
  node_id: number;              // backendNodeId (e.g., 10423)
  tag: string;                  // HTML tag (e.g., "button")
  role?: string;                // A11y role (e.g., "button")
  "aria-label"?: string;        // Accessible name (max 250 chars)
  text?: string;                // Text content (max 100 chars)
  value?: string;               // Form value
  children?: SerializedNode[];  // Recursive children
  href?: string;                // Link URLs
  inputType?: string;           // Input type attribute
  placeholder?: string;         // Placeholder text
  states?: Record<string, boolean | string>; // disabled, checked, etc.
}
```

### Current Optimization Mechanisms

1. **Three-Tier Node Classification**
   - **Semantic** (high confidence): Elements with proper a11y roles
   - **Non-semantic** (medium confidence): Heuristic detection (onclick, cursor:pointer, etc.)
   - **Structural** (no interaction): Pure layout elements

2. **Structural Node Filtering**
   - Removes leaf structural nodes
   - Hoists children through structural wrappers
   - Keeps semantic containers (form, table, dialog, navigation, main)

3. **Text Truncation**
   - Text content: 100 chars max
   - aria-label: No explicit limit (from config: 250 chars)

4. **Attribute Selectivity**
   - Only extracts semantic attributes (href, placeholder, inputType)
   - Ignores most HTML attributes (class, id, data-*, style)

### Current Pain Points

Despite existing optimizations, several issues remain:

1. **Flat hoisting still verbose**: Structural wrappers with multiple children keep full attribute payloads
2. **Redundant replicas**: Repeated menu rows/cards with identical structure appear in full (e.g., Gmail email list)
3. **Dense text segments**: Long paragraphs exceed 100-char cap due to concatenated child texts
4. **Hidden/offscreen noise**: Nodes with zero bounding boxes or `aria-hidden` survive if they're semantic containers
5. **Lack of budget control**: Flattening doesn't adapt to requested token budgets or page complexity
6. **No instrumentation**: Cannot quantify serialization savings or regressions automatically
7. **Large node IDs**: backendNodeId values can be 5+ digits (e.g., 52819)

### Token Consumption Estimate

For a typical complex page (e.g., Gmail inbox):

```
Estimated SerializedDom size:
- 200 interactive elements (buttons, inputs, links)
- 50 semantic containers (forms, navigation, main)
- Avg 120 chars/node × 250 nodes = 30,000 chars
- Token estimate: ~7,900 tokens (3.8 chars/token avg)

With email list repetition:
- 50 email list items with identical structure
- Each item: ~150 chars
- Additional 7,500 chars = ~2,000 tokens
- Total: ~9,900 tokens
```

**Complex pages easily exceed 10,000-15,000 tokens.**

---

## Problem Statement

### Primary Challenges

1. **Token Budget Exhaustion**
   - Complex web applications have thousands of interactive elements
   - Current serialization: 5,000-15,000 tokens
   - Limits conversation history, system prompts, multi-turn interactions

2. **Redundant Information**
   - Repeated list items (emails, products, notifications) with identical structure
   - Text content duplicated across `text`, `aria-label`, `value`
   - Semantic containers provide limited value for many tasks
   - Long field names repeated for every node

3. **Inefficient Encoding**
   - Large backendNodeId values (5+ digits)
   - Hidden/invisible elements consuming space
   - Full attribute payloads for structural nodes

4. **One-Size-Fits-All**
   - Same serialization for all pages and tasks
   - No adaptive compaction based on complexity or budget

### Success Criteria

The optimization must achieve **BOTH** goals:

1. **Preserve Interaction Fidelity** (≥95% success rate)
   - LLM can identify and interact with all necessary elements
   - No loss of critical semantic information (roles, labels, states)
   - Maintain accurate parent-child relationships
   - Provide expansion hints for summarized content

2. **Maximize Token Reduction** (40-80% target)
   - Adaptive budget control with target token counts
   - Configurable compression modes
   - Instrumented metrics for validation

---

## Design Philosophy: Fidelity-First

### Core Principles

This design adopts a **fidelity-first lossless compaction** approach, fundamentally different from aggressive compression strategies:

#### 1. **Preserve All User-Visible Content**

**What to preserve**: Everything a human user sees on their screen and can interact with
- All interactive elements (buttons, inputs, links, form controls)
- All visible text content (headings, paragraphs, labels, list items)
- All semantic containers that provide context (forms, tables, navigation, lists)
- All visible images, icons, and media elements with their accessible names

**What NOT to preserve**: Structural noise that humans don't directly interact with
- Hidden elements (`display:none`, `visibility:hidden`, `aria-hidden=true`)
- Script/style/meta tags (not user-visible)
- Empty wrapper divs with no semantic value
- Tiny text nodes (<2 chars) that are formatting artifacts

#### 2. **No Content Summarization**

**Critical**: The system MUST NOT summarize, compress, or omit any visible page content:
- ❌ **NO** `repeat_meta` nodes (no "45 more similar items" summaries)
- ❌ **NO** `collection_summary` nodes (no "keep first 5, summarize rest")
- ❌ **NO** truncation of list/table items
- ✅ **YES** All list items, table rows, and repeated elements fully preserved

**Rationale**: Modern web pages (Gmail, Amazon, GitHub) present content in lists with repetitive HTML structure. This repetition is **intentional design** - each item has unique content (email subject, product name, file name). Summarizing these elements causes:
- LLM cannot understand page content accurately
- Critical information loss (e.g., which email to click?)
- Interaction failures (e.g., "click the 3rd email" → unavailable if summarized)

#### 3. **Deterministic Single-Pass Transformation**

**No adaptive budgets or iterations**:
- Compression level is NOT determined by token count
- No iterative threshold tightening based on budget targets
- Same input page → same output every time (deterministic)

**Rationale**: Token budget-oriented compression is risky:
- Multiple passes through the virtual DOM can lose important content
- Tightening thresholds to meet budgets is arbitrary (which elements to drop?)
- Non-deterministic output makes debugging and validation difficult

#### 4. **Focus on Structural Optimization, Not Content Reduction**

**Compression strategies**:
- ✅ Remove unnecessary HTML wrapper elements
- ✅ Optimize encoding (shorter field names, sequential IDs, bucketed metadata)
- ✅ Collapse whitespace and merge adjacent text nodes
- ✅ Prune non-semantic attributes (class, data-*, style)
- ❌ Do NOT remove or summarize user-visible content

**Expected token reduction**: 30-50% (modest but safe)
- Lower than aggressive compression (60-85%)
- Higher fidelity and interaction accuracy (≥99% vs ≥95%)
- Predictable and reliable

### Design Trade-offs

| Aspect | Aggressive Compression (v2.1) | Fidelity-First (v3.0) |
|--------|------------------------------|----------------------|
| Token Reduction | 60-85% | 30-50% |
| Content Fidelity | Partial (with expansion API) | 100% (all visible content) |
| Interaction Accuracy | ≥95% | ≥99% |
| Complexity | High (3 stages, iterations, expansion API) | Low (single pass, no API) |
| Performance | ~100ms (multiple iterations) | <50ms (single pass) |
| Deterministic | No (budget-driven) | Yes (fixed rules) |
| Risk of Content Loss | Medium-High | Very Low |

---

## Research Findings

### Industry Best Practices

From research into LLM-based web automation and DOM processing:

#### 1. Accessibility Tree First (✅ Already Implemented)
- Use A11y tree instead of raw DOM (reduces noise by 60-80%)
- BrowserX already uses hybrid DOM + A11y approach
- **Key Insight**: Accessibility tree is naturally pruned for semantic content

#### 2. HTML-to-Markdown Conversion (96% Token Reduction)
- Research shows: 270k tokens → 11k tokens for Amazon product page
- **Challenge**: Our use case requires structured interaction (node_id references)
- **Adaptation**: Inspired by Markdown's minimalism for field naming

#### 3. Task-Driven Filtering
- Agent-E approach: LLM requests specific DOM subtrees based on task
- Requires multi-turn interaction
- **Current**: Implement expansion hints for on-demand details
- **Future**: Full task-driven querying

#### 4. Hierarchical JSON Pruning
- SimpDOM research: Context-aware node tagging removes irrelevant subtrees
- Current implementation already does tier classification
- **Opportunity**: More aggressive pruning + repetition detection

#### 5. Repetition Detection
- Real-world pages have many identical elements (list items, cards, buttons)
- **Key Insight**: Hash node signatures, summarize clones
- **Impact**: 30-50% reduction on list-heavy pages

#### 6. Visibility Filtering
- Screen readers skip hidden elements (`display:none`, `visibility:hidden`, `aria-hidden`)
- **Key Insight**: If not visible to screen readers, likely not needed by agent
- **Caveat**: Some modal content is hidden until triggered

#### 7. Token Compression Techniques
- LLMLingua: 20x compression via semantic token importance
- **Challenge**: Requires additional ML model, adds latency
- **Alternative**: Use structural heuristics instead

---

## Architecture: Single-Pass Pipeline

### Overview

Replace the current two-pass approach with a **deterministic single-pass serialization pipeline**:

```
┌─────────────────────────────────────────────────────────────┐
│ Pass 1: CDP Capture (Existing)                              │
│ CDP DOM/A11y APIs → VirtualNode tree                        │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────────────────────────┐
│ Pass 2: Single-Pass Lossless Compaction (NEW)               │
│                                                              │
│  Stage 1: Signal Filtering (Remove Noise)                   │
│  ├─ Remove invisible elements (hidden, display:none)        │
│  ├─ Filter tiny text nodes (<2 chars)                       │
│  ├─ Drop script/style/meta nodes                            │
│  └─ Remove empty structural containers                      │
│                                                              │
│  Stage 2: Structure Simplification (Lossless)               │
│  ├─ Sequential text collapsing (merge adjacent text)        │
│  ├─ Layout simplification (hoist through wrappers)          │
│  └─ Attribute deduplication (parent → child propagation)    │
│                                                              │
│  Stage 3: Payload Optimization (Efficient Encoding)         │
│  ├─ Sequential ID remapping (52819 → 1, persisted)          │
│  ├─ Attribute pruning (keep only semantic attrs)            │
│  ├─ Field name normalization (aria-label → aria_label)      │
│  ├─ Numeric compaction (bbox objects → arrays)              │
│  └─ Metadata bucketing (collection-level states)            │
│                                                              │
│  NO Budget Manager (Deterministic, No Iterations)           │
│  NO Repetition Detection (All content preserved)            │
│  NO Collection Summarization (All items preserved)          │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ▼
         SerializedDom (Lossless Optimized)
```

### Design Principles

1. **Single-Pass Deterministic**: One execution, same input → same output
2. **Fidelity-First**: Preserve all user-visible content, remove only noise
3. **No Summarization**: All interactive elements and visible text fully preserved
4. **Lossless Transformations**: Structure simplification without content loss
5. **Efficient Encoding**: Optimize representation, not content
6. **Backward Compatible**: Versioned serialization payload (v3)
7. **Instrumented**: Track metrics for validation

---

## Stage 1: Signal Filtering

**Goal**: Discard nodes with negligible user/agent value before serialization.

### Filters

#### F1: Visibility Filter

**Problem**: Hidden elements consume tokens but aren't interactive.

**Solution**: Drop nodes that are not visible to users or screen readers.

```typescript
function isVisible(node: VirtualNode): boolean {
  // Check bounding box
  if (node.boundingBox) {
    const { width, height } = node.boundingBox;
    if (width === 0 || height === 0) return false;
  }

  // Check accessibility hidden state
  if (node.accessibility?.hidden) return false;

  // Check aria-hidden attribute
  if (node.attributes) {
    const attrMap = new Map<string, string>();
    for (let i = 0; i < node.attributes.length; i += 2) {
      attrMap.set(node.attributes[i], node.attributes[i + 1]);
    }
    if (attrMap.get('aria-hidden') === 'true') return false;
    if (attrMap.has('hidden')) return false; // HTML hidden attribute
  }

  // Check computed styles (if available)
  // Note: CDP doesn't expose computed styles by default, but we can approximate
  // via bounding box and accessibility tree

  return true;
}
```

**Edge Cases**:
- **Modal content**: May be `aria-hidden` until triggered → Keep if role is `dialog`
- **Lazy-loaded content**: Zero bounding box but will appear → Keep if role indicates loading state

**Implementation**:
```typescript
function shouldIncludeInSerialization(node: VirtualNode): boolean {
  // Always include semantic and non-semantic (interactive) nodes
  if (node.tier === 'semantic' || node.tier === 'non-semantic') {
    return isVisible(node);
  }

  // For structural nodes, only include if visible AND contains visible children
  if (node.tier === 'structural') {
    if (!isVisible(node)) return false;
    // Check if any children are visible
    if (node.children) {
      return node.children.some(child => shouldIncludeInSerialization(child));
    }
    return false;
  }

  return true;
}
```

**Impact**: ~10-15% reduction

---

#### F2: Redundant Text Node Filter

**Problem**: Pure text nodes with minimal content (<2 chars) clutter output.

**Solution**: Skip unless they contribute to interactive parent.

```typescript
function shouldKeepTextNode(node: VirtualNode, parent: VirtualNode | null): boolean {
  if (node.nodeType !== NODE_TYPE_TEXT) return true;

  const text = node.nodeValue?.trim() || '';

  // Keep if >= 2 chars
  if (text.length >= 2) return true;

  // Keep single-char text if parent is interactive
  if (parent && (parent.tier === 'semantic' || parent.tier === 'non-semantic')) {
    return true;
  }

  return false;
}
```

**Impact**: ~2-5% reduction

---

#### F3: Script/Style Noise Filter

**Problem**: Script/style nodes occasionally tagged as semantic due to detection errors.

**Solution**: Explicit blocklist.

```typescript
const NOISE_TAGS = ['script', 'style', 'noscript', 'meta', 'link'];

function isNoisyNode(node: VirtualNode): boolean {
  const tag = (node.localName || node.nodeName).toLowerCase();
  return NOISE_TAGS.includes(tag);
}
```

**Impact**: ~1-2% reduction

---

#### F4: Semantic Container Refinement

**Problem**: Some semantic containers provide minimal value.

**Solution**: Require at least one interactive descendant OR landmark role.

```typescript
function isValuedSemanticContainer(node: VirtualNode): boolean {
  const role = node.accessibility?.role || '';
  const landmarkRoles = ['main', 'navigation', 'region', 'banner', 'contentinfo', 'complementary'];

  // Always keep landmark roles
  if (landmarkRoles.includes(role)) return true;

  // For other semantic containers (form, table, dialog), require interactive children
  const interactiveDescendants = countInteractiveDescendants(node);

  // Keep if 1+ interactive descendants (changed from 2+ to avoid dropping simple forms)
  // Example: A search form with one input and one button inside, or a single "Subscribe" button
  return interactiveDescendants >= 1;
}

function countInteractiveDescendants(node: VirtualNode): number {
  let count = 0;

  if (node.tier === 'semantic' || node.tier === 'non-semantic') {
    count++;
  }

  if (node.children) {
    for (const child of node.children) {
      count += countInteractiveDescendants(child);
    }
  }

  return count;
}
```

**Impact**: ~5-10% reduction

---

### Stage 1 Summary

**Total Expected Reduction**: 15-25% (from noise removal only)

**Data Needed**:
- Extend `VirtualNode` with optional `isVisible` boolean (computed during tree building)
- Or approximate via bounding boxes + accessibility `hidden` flag

**Fidelity Impact**: **Zero content loss** - only invisible/noise elements removed

---

## Stage 2: Structure Simplification

**Goal**: Simplify verbose HTML structure without losing any user-visible content (lossless transformations only).

### S2.1: Sequential Text Collapsing (Lossless)

**Problem**: Multiple adjacent text nodes increase JSON overhead.

**Solution**: Merge consecutive text-only children into single field **without truncation**.

```typescript
function collapseSequentialText(children: VirtualNode[]): VirtualNode[] {
  const result: VirtualNode[] = [];
  let textBuffer: string[] = [];

  for (const child of children) {
    if (child.nodeType === NODE_TYPE_TEXT) {
      textBuffer.push(child.nodeValue?.trim() || '');
    } else {
      // Flush accumulated text
      if (textBuffer.length > 0) {
        const collapsedText = textBuffer.join(' ');
        if (collapsedText.length > 0) {
          result.push(createCollapsedTextNode(collapsedText));
        }
        textBuffer = [];
      }
      result.push(child);
    }
  }

  // Flush remaining text
  if (textBuffer.length > 0) {
    const collapsedText = textBuffer.join(' ');
    if (collapsedText.length > 0) {
      result.push(createCollapsedTextNode(collapsedText));
    }
  }

  return result;
}

function createCollapsedTextNode(text: string): VirtualNode {
  // NO TRUNCATION - preserve full text content
  return {
    nodeId: -1, // Virtual node
    backendNodeId: -1,
    nodeType: NODE_TYPE_TEXT,
    nodeName: '#text',
    nodeValue: text, // Full text, no truncation
    tier: 'structural'
  } as any;
}
```

**Impact**: ~3-5% reduction (reduces JSON overhead from multiple text nodes)
**Fidelity**: **Lossless** - all text content preserved

---

### S2.2: Layout Simplification (Lossless)

**Problem**: Multi-layer decorative wrappers add noise without semantic value.

**Solution**: Collapse wrapper paths, promote attributes to children.

```typescript
function simplifyLayout(node: VirtualNode): VirtualNode {
  // If structural node with single child, collapse
  if (node.tier === 'structural' && node.children?.length === 1) {
    const child = node.children[0];

    // Promote parent's aria-label to child if child has none
    if (node.accessibility?.name && !child.accessibility?.name) {
      child.accessibility = {
        ...child.accessibility,
        name: node.accessibility.name
      };
    }

    // Return child directly (hoist through wrapper)
    return simplifyLayout(child);
  }

  // Recursively simplify children
  if (node.children) {
    node.children = node.children.map(simplifyLayout);
  }

  return node;
}
```

**Impact**: ~5-10% reduction (complements existing hoisting)
**Fidelity**: **Lossless** - attributes propagated, no content lost

---

### S2.3: Attribute Deduplication (Lossless)

**Problem**: Parent containers often repeat attributes that children inherit.

**Solution**: Remove redundant attributes when child has same value.

```typescript
function deduplicateAttributes(node: VirtualNode, parent: VirtualNode | null): VirtualNode {
  if (!parent || !node.accessibility) return node;

  // If parent and child have same role, remove from child (implicit inheritance)
  if (parent.accessibility?.role === node.accessibility?.role) {
    // Keep role on child if it's interactive, remove if structural
    if (node.tier === 'structural') {
      delete node.accessibility.role;
    }
  }

  // Recurse to children
  if (node.children) {
    node.children = node.children.map(child => deduplicateAttributes(child, node));
  }

  return node;
}
```

**Impact**: ~2-3% reduction
**Fidelity**: **Lossless** - redundant data removed, semantic meaning preserved

---

### ~~Repetition Detection~~ (REMOVED)

**Status**: ❌ **REMOVED** - Not compatible with fidelity-first design

**Rationale**: Modern web pages show content in lists with repetitive HTML tags (email lists, product grids, file lists). This repetition is **intentional** - each item has unique content (different email subjects, product names, file names). Summarizing repetitions causes:
- LLM cannot identify which specific item to interact with
- Critical information loss (e.g., "click the email from Alice" → unavailable if summarized)
- Interaction failures (e.g., "click the 3rd email" → only first 2 shown)

**Old Impact**: ~20-40% reduction (NOT ACCEPTABLE due to content loss)

---

### ~~Collection Compression~~ (REMOVED)

**Status**: ❌ **REMOVED** - Not compatible with fidelity-first design

**Rationale**: Lists/tables with 50+ items (Gmail inbox, GitHub issues, product catalogs) contain unique, user-visible content. Keeping only "first 5 + last 1 + summary" makes the page incomprehensible to the LLM. All list items must be preserved.

**Old Impact**: ~15-30% reduction (NOT ACCEPTABLE due to content loss)

---

### Stage 2 Summary

**Total Expected Reduction**: 10-18% (from lossless structure simplification only)

**Cumulative Reduction**: Stage 1 + Stage 2 = 25-43%

**Fidelity Impact**: **Zero content loss** - all user-visible content preserved, only structural noise removed

**Techniques Applied**:
- Sequential text collapsing (lossless)
- Layout simplification (hoist through wrappers)
- Attribute deduplication (remove redundant data)

**Techniques NOT Applied** (removed for fidelity):
- ❌ Repetition detection (would lose unique list item content)
- ❌ Collection compression (would lose most list/table items)
- ❌ Text truncation (would lose content)

---

## Stage 3: Payload Optimization

**Goal**: Encode remaining nodes with condensed metadata.

### P3.1: Sequential ID Remapping (Persisted in Snapshot)

**Problem**: backendNodeId values are large (52819), wasting digits.

**Solution**: Remap to sequential IDs starting from 1, **persist mapping in snapshot**.

**CRITICAL**: The `IdRemapper` MUST be persisted **in the DomSnapshot object itself**, not just in DomService. This ensures the mapping survives snapshot invalidation and rebuilding. When the LLM issues an action (e.g., `click(id: 5)`), the snapshot translates `5` back to the real `backendNodeId` (e.g., `52819`) before sending to CDP.

```typescript
class IdRemapper {
  private backendToSeq = new Map<number, number>();
  private seqToBackend = new Map<number, number>(); // Persisted in snapshot
  private nextId = 1;

  remap(backendNodeId: number): number {
    if (!this.backendToSeq.has(backendNodeId)) {
      const seqId = this.nextId++;
      this.backendToSeq.set(backendNodeId, seqId);
      this.seqToBackend.set(seqId, backendNodeId);
    }
    return this.backendToSeq.get(backendNodeId)!;
  }

  reverse(seqId: number): number | undefined {
    return this.seqToBackend.get(seqId);
  }

  // Serialize mapping for persistence
  serialize(): Record<number, number> {
    return Object.fromEntries(this.seqToBackend);
  }

  // Restore mapping from serialized data
  static deserialize(data: Record<number, number>): IdRemapper {
    const remapper = new IdRemapper();
    for (const [seqId, backendNodeId] of Object.entries(data)) {
      const seq = Number(seqId);
      const backend = Number(backendNodeId);
      remapper.seqToBackend.set(seq, backend);
      remapper.backendToSeq.set(backend, seq);
      remapper.nextId = Math.max(remapper.nextId, seq + 1);
    }
    return remapper;
  }
}
```

**Implementation**:
```typescript
class DomSnapshot {
  private idRemapper: IdRemapper; // Persisted in snapshot instance

  constructor(
    public readonly virtualDom: VirtualNode,
    private readonly timestamp: number
  ) {
    // Build ID mapping on snapshot creation
    this.idRemapper = new IdRemapper();
    this.buildIdMapping(this.virtualDom);
  }

  serialize(options?: SerializationOptions): SerializedDom {
    // Serialize with remapped IDs
    const body = this.flattenNode(this.virtualDom);

    return {
      page: {
        version: 3, // New version for fidelity-first design
        context: { ... },
        body,
        // Persist ID mapping in serialized output for debugging/recovery
        _idMapping: this.idRemapper.serialize()
      }
    };
  }

  private buildIdMapping(node: VirtualNode): void {
    this.idRemapper.remap(node.backendNodeId);
    node.children?.forEach(child => this.buildIdMapping(child));
  }

  // Action translation: sequential ID → backendNodeId
  getBackendNodeId(seqId: number): number | undefined {
    return this.idRemapper.reverse(seqId);
  }
}

// In DomService
class DomService {
  private currentSnapshot: DomSnapshot | null = null;

  async click(seqId: number): Promise<void> {
    if (!this.currentSnapshot) {
      throw new Error('No snapshot available');
    }

    // Translate sequential ID to backendNodeId via snapshot's persisted mapping
    const backendNodeId = this.currentSnapshot.getBackendNodeId(seqId);
    if (!backendNodeId) {
      throw new Error(`Invalid node ID: ${seqId}`);
    }

    // Use backendNodeId for CDP commands
    const boxModel = await this.sendCommand('DOM.getBoxModel', { backendNodeId });
    // ... rest of click implementation
  }
}
```

**Impact**: ~5-10% reduction
**Fidelity**: **Lossless** - IDs are just renumbered, no information lost

---

### P3.2: Attribute Pruning

**Problem**: Full attribute payloads for every node.

**Solution**: Keep only semantic attributes.

```typescript
const SEMANTIC_ATTRS = [
  'id', 'name', 'href', 'value', 'placeholder',
  'aria-label', 'aria-describedby', 'aria-controls',
  'data-testid', 'role', 'type'
];

function pruneAttributes(attributes: string[] = []): Record<string, string> {
  const result: Record<string, string> = {};

  for (let i = 0; i < attributes.length; i += 2) {
    const key = attributes[i];
    const value = attributes[i + 1];

    if (SEMANTIC_ATTRS.includes(key)) {
      result[key] = value;
    }
  }

  return result;
}
```

**Impact**: ~3-5% reduction
**Fidelity**: **Lossless** - only non-semantic attributes removed

---

### P3.3: Field Name Normalization

**Problem**: Long field names like `"aria-label"` repeated everywhere.

**Solution**: Normalize to snake_case, use short aliases.

```typescript
const FIELD_NORMALIZATION = {
  'aria-label': 'aria_label',
  'inputType': 'input_type',
  'placeholder': 'hint',
  'children': 'kids',
  'node_id': 'id'
};

function normalizeFieldNames(node: any): any {
  const normalized: any = {};

  for (const [key, value] of Object.entries(node)) {
    const newKey = FIELD_NORMALIZATION[key] || key;
    normalized[newKey] = value;
  }

  return normalized;
}
```

**Impact**: ~5-8% reduction
**Fidelity**: **Lossless** - field names shortened, no semantic change

---

### P3.4: Numeric Compaction

**Problem**: Bounding boxes are verbose objects.

**Solution**: Use integer arrays `[x, y, w, h]`.

```typescript
// Before
boundingBox: { x: 100, y: 200, width: 50, height: 30 }

// After
bbox: [100, 200, 50, 30]
```

**Omit if**:
- Outside viewport
- Duplicate of parent container

**Impact**: ~2-5% reduction
**Fidelity**: **Lossless** - encoding optimized, all bbox data preserved

---

### P3.5: Metadata Bucketing

**Problem**: Per-node `states` objects are sparse.

**Solution**: Collection-level state arrays.

```typescript
// Before (per-node)
[
  { id: 1, tag: 'checkbox', states: { checked: true } },
  { id: 2, tag: 'checkbox', states: { checked: false } },
  { id: 3, tag: 'checkbox', states: { checked: true } }
]

// After (bucketed)
{
  kids: [
    { id: 1, tag: 'checkbox' },
    { id: 2, tag: 'checkbox' },
    { id: 3, tag: 'checkbox' }
  ],
  states_checked: [1, 3] // IDs with checked=true
}
```

**Implementation**:
```typescript
function bucketMetadata(children: SerializedNode[]): any {
  const checked: number[] = [];
  const disabled: number[] = [];
  const required: number[] = [];

  for (const child of children) {
    if (child.states?.checked) checked.push(child.id);
    if (child.states?.disabled) disabled.push(child.id);
    if (child.states?.required) required.push(child.id);
    delete child.states; // Remove per-node states
  }

  const result: any = { kids: children };
  if (checked.length > 0) result.states_checked = checked;
  if (disabled.length > 0) result.states_disabled = disabled;
  if (required.length > 0) result.states_required = required;

  return result;
}
```

**Impact**: ~5-10% reduction on form-heavy pages
**Fidelity**: **Lossless** - states bucketed efficiently, all state data preserved

---

### Stage 3 Summary

**Total Expected Reduction**: 15-25% (from efficient encoding only)

**Cumulative Reduction**: Stage 1 + Stage 2 + Stage 3 = **30-50%** (fidelity-first target)

**Fidelity Impact**: **Zero content loss** - all optimizations are encoding-level only

**Techniques Applied**:
- Sequential ID remapping (persisted in snapshot)
- Attribute pruning (remove non-semantic attrs)
- Field name normalization (shorten names)
- Numeric compaction (arrays instead of objects)
- Metadata bucketing (collection-level states)

**Key Difference from Aggressive Compression**:
- ✅ Lower reduction (30-50% vs 60-85%)
- ✅ Higher fidelity (100% vs partial)
- ✅ Higher accuracy (≥99% vs ≥95%)
- ✅ Simpler implementation (no expansion API needed)

---

## ~~Budget Manager~~ (REMOVED)

**Status**: ❌ **REMOVED** - Not compatible with fidelity-first design

**Rationale**:

1. **Token budget-oriented compression is risky**: Running the virtual DOM through multiple iterations (up to 5 passes) with tightening thresholds can cause important content to be lost. The decision of "which elements to drop" becomes arbitrary.

2. **Non-deterministic output**: Token budget targets make compression behavior unpredictable - the same page could be compressed differently based on estimated token count, making debugging and validation difficult.

3. **Unnecessary complexity**: The fidelity-first approach achieves predictable 30-50% reduction through **structural noise removal only**, without needing adaptive budgets, iterations, or token estimation.

4. **Performance risk eliminated**: Single-pass deterministic transformation completes in <50ms (vs ~100ms+ for multi-iteration budget manager).

**Replacement**: Direct single-pass serialization with fixed rules:
```typescript
// Simple, deterministic serialization
class DomSnapshot {
  serialize(): SerializedDom {
    // Stage 1: Filter noise (hidden elements, scripts, empty containers)
    const filtered = this.applySignalFiltering(this.virtualDom);

    // Stage 2: Simplify structure (merge text, hoist wrappers, dedupe attrs)
    const simplified = this.applyStructureSimplification(filtered);

    // Stage 3: Optimize encoding (remap IDs, normalize fields, bucket metadata)
    const optimized = this.applyPayloadOptimization(simplified);

    return optimized; // No iterations, no budget checks, deterministic
  }
}
```

**Old Impact**: Variable reduction (60-85%) with content loss risk
**New Impact**: Predictable reduction (30-50%) with zero content loss

---

## Data Model Changes

### Updated SerializedDom (v3 - Fidelity-First)

```typescript
interface SerializedDom {
  page: {
    version: 3; // New version for fidelity-first design
    context: {
      url: string;
      title: string;
    };
    body: SerializedNode;
    stats: LosslessSnapshotStats; // Simplified metrics
    _idMapping?: Record<number, number>; // Sequential → backend (for debugging/recovery)
  };
}

interface SerializedNode {
  id: number;                     // Sequential ID (remapped, 1-based)
  tag: string;                    // HTML tag
  role?: string;                  // ARIA role
  aria_label?: string;            // Normalized field name (was "aria-label")
  text?: string;                  // Text content (NEVER truncated)
  value?: string;                 // Form value
  kids?: SerializedNode[];        // Normalized children (was "children")
  href?: string;                  // Link URL
  input_type?: string;            // Input type (was "inputType")
  hint?: string;                  // Placeholder (was "placeholder")
  states?: Record<string, boolean | string>; // Element states
  bbox?: [number, number, number, number]; // Bounding box [x, y, w, h]

  // NO COMPRESSION METADATA (removed for fidelity-first):
  // ❌ text_truncated (no truncation)
  // ❌ original_length (no truncation)
  // ❌ repeat_meta (no repetition detection)
  // ❌ collection_summary (no collection compression)
  // ❌ expansion_hint (no summarization, no need for expansion)
}

interface LosslessSnapshotStats extends SnapshotStats {
  // Serialization metrics (simplified for fidelity-first)
  serializedNodes: number;        // Total nodes in output
  serializedChars: number;        // Total JSON characters
  estimatedTokens: number;        // Estimated token count (chars / 3.8)
  droppedNodes: {
    visibility: number;           // Hidden/invisible elements removed
    noise: number;                // Script/style/meta tags removed
    emptyContainers: number;      // Empty structural wrappers removed
  };
  reductionPercent: number;       // Overall reduction percentage
  serializationDuration?: number; // Time taken (ms)
  fidelityLoss: number;           // Always 0 (lossless guarantee)
}

### Backward Compatibility

```typescript
// Consumers check version before parsing
function parseSerializedDom(dom: SerializedDom): void {
  const version = dom.page.version || 1; // Default to v1 if missing

  if (version === 1) {
    // Legacy format: node_id, "aria-label", children
    return parseLegacyFormat(dom);
  } else if (version === 2) {
    // New format: id, aria_label, kids, expansion_hint
    return parseV2Format(dom);
  } else {
    throw new Error(`Unsupported SerializedDom version: ${version}`);
  }
}
```

---

## Implementation Plan

### Phase 1: Infrastructure & Stage 1 (Weeks 1-2)

**Goal**: Set up pipeline architecture, implement signal filtering

**Tasks**:
1. Create `BudgetManager` class with mode/budget API
2. Implement visibility filtering (F1)
3. Implement text node filtering (F2)
4. Implement script/style filtering (F3)
5. Implement semantic container refinement (F4)
6. Add extended `SnapshotStats` with serialization metrics
7. Add versioning to `SerializedDom` (version: 2)
8. Write unit tests for each filter
9. Create test fixtures for visibility scenarios

**Deliverables**:
- `BudgetManager` class
- Signal filtering implementation
- Extended metrics
- Unit tests (90%+ coverage)

---

### Phase 2: Structure Compaction (Weeks 3-4)

**Goal**: Implement Stage 2 algorithms

**Tasks**:
1. Implement sequential text collapsing (S2.1)
2. Implement repetition detection with hashing (S2.2)
3. Implement dense collection compression (S2.3)
4. Implement layout simplification (S2.4)
5. Add `repeat_meta` and `collection_summary` to SerializedNode
6. Write unit tests for each compaction technique
7. Create test fixtures for list-heavy pages (Gmail, Reddit)

**Deliverables**:
- Structure compaction implementation
- Repetition detection algorithm
- Collection compression
- Unit tests

---

### Phase 3: Payload Optimization (Weeks 5-6)

**Goal**: Implement Stage 3 optimizations

**Tasks**:
1. Implement sequential ID remapping (P3.1)
2. Implement attribute pruning (P3.2)
3. Implement field name normalization (P3.3)
4. Implement numeric compaction (P3.4)
5. Implement metadata bucketing (P3.5)
6. Update LLM system prompt with normalized field names
7. Write unit tests for payload optimizations

**Deliverables**:
- Payload optimization implementation
- ID remapping system
- Updated LLM prompts
- Unit tests

---

### Phase 4: Budget Manager, Expansion API & Integration (Weeks 7-8)

**Goal**: Implement adaptive budget control and on-demand expansion API (critical MVP dependency)

**Tasks**:
1. Implement iterative threshold tightening with one-pass estimation
2. Implement token estimation with safety margin
3. Add serialization mode switching (compact/full/debug)
4. **[CRITICAL MVP]** Implement E1: On-Demand Expansion API
   - Add `expandNodes()` method to DomService
   - Support expansion by backend IDs from `expansion_hint`
   - Add LLM tool/function for requesting expansion
   - Update system prompts with expansion instructions
5. Integrate all three stages into pipeline
6. Add instrumentation and logging
7. Write integration tests including expansion API

**Deliverables**:
- Working budget manager with one-pass estimation
- On-demand expansion API (E1)
- Full three-stage pipeline
- Integration tests

---

### Phase 5: Evaluation & Tuning (Weeks 9-10)

**Goal**: Validate token reduction vs. interaction accuracy (including M2 validation)

**Tasks**:
1. Create test corpus of 50 diverse websites
2. **[CRITICAL]** Implement end-to-end agent test harness for M2 validation
   - Define 10-20 "golden tasks" (login, search, send email, add to cart)
   - Integrate with LLM agent to execute tasks on compressed DOM
   - Measure M2: Interaction Success Rate (≥95% threshold)
3. Run regression tests across corpus
4. Measure token reduction, interaction success rate
5. Tune thresholds based on results
6. A/B test with real LLM interactions
7. Document optimal configurations per page type

**Deliverables**:
- End-to-end agent test harness
- Evaluation report with M2 metrics
- Tuned threshold defaults
- Performance benchmarks
- Documentation

---

### Phase 6: Production Rollout (Week 11+)

**Goal**: Deploy to production with monitoring

**Tasks**:
1. Feature flag rollout (`dom.compaction.v2`)
2. Gradual rollout to users (10% → 50% → 100%)
3. Monitor metrics dashboards (token reduction, M2 success rate, performance)
4. Address issues and edge cases
5. Update documentation

**Deliverables**:
- Production deployment
- Monitoring dashboards
- Final documentation

**Note**: Extended timeline to accommodate Expansion API (Phase 4) and end-to-end agent testing (Phase 5)

---

## Metrics and Success Criteria

### Primary Metrics

#### M1: Token Reduction Rate
```
Token Reduction = 1 - (Compressed Tokens / Original Tokens)
Target: 40-50% (baseline), 60-70% (adaptive), 75-85% (aggressive)
```

#### M2: Interaction Success Rate
```
Success Rate = Successful Interactions / Total Interactions
Threshold: ≥95% (must not degrade from current)
```

#### M3: Budget Compliance Rate
```
Compliance = Serializations Within Budget / Total Serializations
Target: ≥90% (for specified budget)
```

### Secondary Metrics

#### M4: Information Density
```
Density = Interactive Nodes / Total Tokens
Goal: Maximize (more interactive elements per token)
```

#### M5: Serialization Performance
```
Target: <100ms total (including budget iterations)
```

#### M6: Compaction Score (Telemetry)
```
Score = 0.4 × textReduction + 0.4 × nodeReduction + 0.2 × metadataReduction
```

### Measurement Formulas

```typescript
// Token estimation (GPT-4 approximation)
estimatedTokens = Math.ceil(serializedJsonLength / 3.8);

// Reduction percentage
reductionPercent = 1 - (newTokens / legacyTokens);

// Compaction score
compactionScore =
  0.4 * (textReductionPercent) +
  0.4 * (nodeReductionPercent) +
  0.2 * (metadataReductionPercent);
```

---

## Risk Assessment

### High Risk

**R1: Loss of Critical Context**
- **Risk**: Over-aggressive pruning removes elements needed for task completion
- **Mitigation**:
  - Conservative baseline thresholds
  - Expansion hints for all summarized content
  - Full mode available as fallback
  - Extensive regression testing

**R2: LLM Comprehension Failure**
- **Risk**: Normalized fields/summarized content confuses LLM
- **Mitigation**:
  - Update system prompts atomically with code
  - Provide clear schema documentation
  - A/B testing before rollout
  - Debug mode preserves full context

### Medium Risk

**R3: Interaction Accuracy Degradation**
- **Risk**: Sequential ID remapping breaks references
- **Mitigation**:
  - Bidirectional mapping (seq ↔ backend)
  - Version serialization payload
  - Extensive testing with real interactions

**R4: Performance Regression**
- **Risk**: Multi-stage pipeline + budget iterations add latency
- **Mitigation**:
  - Target <100ms total
  - Profile hot paths
  - Cache intermediate results
  - Limit max iterations (default: 5)

**R5: False Repetition Detection**
- **Risk**: Similar-looking but functionally different elements grouped together
- **Mitigation**:
  - Include interaction type in signature
  - Keep first 2 instances (not just 1)
  - Expansion hints allow access to all
  - Tune threshold conservatively

### Low Risk

**R6: Maintenance Burden**
- **Risk**: Complex multi-stage pipeline harder to maintain
- **Mitigation**:
  - Modular design with clear separation
  - Comprehensive unit tests (>90% coverage)
  - Documentation for each stage

**R7: Expansion API Complexity**
- **Risk**: Implementing on-demand expansion adds complexity
- **Mitigation**:
  - Phase 2 feature (not MVP)
  - Expansion hints provide fallback
  - Clear API design upfront

---

## Testing Strategy

### Unit Tests

```typescript
describe('Stage 1: Signal Filtering', () => {
  it('should filter invisible elements', () => { ... });
  it('should keep visible semantic elements', () => { ... });
  it('should keep modal dialogs even if aria-hidden', () => { ... });
  it('should filter tiny text nodes', () => { ... });
  it('should filter script/style elements', () => { ... });
  it('should refine semantic containers', () => { ... });
});

describe('Stage 2: Structure Compaction', () => {
  it('should collapse sequential text nodes', () => { ... });
  it('should truncate long text with ellipsis', () => { ... });
  it('should detect repetitions via hashing', () => { ... });
  it('should create repetition summaries', () => { ... });
  it('should compress dense collections', () => { ... });
  it('should keep first k + last items', () => { ... });
  it('should simplify nested layouts', () => { ... });
});

describe('Stage 3: Payload Optimization', () => {
  it('should remap IDs sequentially', () => { ... });
  it('should reverse map sequential to backend IDs', () => { ... });
  it('should prune non-semantic attributes', () => { ... });
  it('should normalize field names', () => { ... });
  it('should compact bounding boxes to arrays', () => { ... });
  it('should bucket metadata at collection level', () => { ... });
});

describe('Budget Manager', () => {
  it('should meet token budget via iterative tightening', () => { ... });
  it('should stop at max iterations', () => { ... });
  it('should support full/compact/debug modes', () => { ... });
  it('should track compaction iterations in metrics', () => { ... });
});
```

### Integration Tests

```typescript
describe('Real-World Page Compaction', () => {
  const testPages = [
    { url: 'https://www.google.com', type: 'simple', expectedReduction: 0.4 },
    { url: 'https://github.com', type: 'moderate', expectedReduction: 0.5 },
    { url: 'https://mail.google.com', type: 'complex', expectedReduction: 0.7 }
  ];

  for (const { url, type, expectedReduction } of testPages) {
    it(`should compress ${type} page: ${url}`, async () => {
      const baseline = await serializeWithMode(url, 'full');
      const compressed = await serializeWithMode(url, 'compact');

      const reduction = 1 - (compressed.estimatedTokens / baseline.estimatedTokens);
      expect(reduction).toBeGreaterThanOrEqual(expectedReduction);
    });
  }
});
```

### Regression Fixtures

```typescript
// Capture representative pages as fixtures
// tests/fixtures/dom/gmail-inbox.json
// tests/fixtures/dom/notion-doc.json
// tests/fixtures/dom/salesforce-dashboard.json

describe('Regression Tests', () => {
  it('should not lose interactive elements from Gmail inbox', () => {
    const fixture = loadFixture('gmail-inbox.json');
    const compressed = compress(fixture);

    // Assert known interactive elements still present
    const composeButton = findById(compressed, 'compose-button');
    expect(composeButton).toBeDefined();
    expect(composeButton.role).toBe('button');
  });
});
```

**IMPORTANT LIMITATION**: These regression tests validate that **data is present**, but they **do NOT validate M2: Interaction Success Rate**.

M2 can **only be measured** by a stateful agent (the LLM) actually trying to complete tasks (e.g., "Find and click the 'Compose' button," "Add the first item to the cart"). The new, compressed format could confuse the LLM even if all the data is technically there.

### End-to-End Agent Testing (Required for M2 Validation)

**Dependency**: The implementation plan (Phase 5) **must** explicitly include an end-to-end agent test harness that measures M2.

**Test Corpus**: Define 10-20 "golden tasks" (e.g., login, search, send email, add to cart) that must pass on a test corpus of 50 diverse websites.

```typescript
describe('End-to-End Agent Testing (M2 Validation)', () => {
  const goldenTasks = [
    { site: 'gmail.com', task: 'Find and click the Compose button', expectedSuccess: true },
    { site: 'amazon.com', task: 'Add the first product to cart', expectedSuccess: true },
    { site: 'github.com', task: 'Navigate to the Issues tab', expectedSuccess: true },
    // ... 17 more golden tasks
  ];

  for (const { site, task, expectedSuccess } of goldenTasks) {
    it(`should complete task: ${task} on ${site}`, async () => {
      // 1. Navigate to site
      await navigateTo(site);

      // 2. Get compressed DOM
      const compressedDom = await domService.getSerializedDom();

      // 3. Send task + DOM to LLM agent
      const result = await llmAgent.executeTask(task, compressedDom);

      // 4. Validate success
      expect(result.success).toBe(expectedSuccess);
    });
  }
});
```

**Success Criteria**: M2 ≥ 95% (at least 19 out of 20 golden tasks must succeed)

---

## Future Enhancements

### E1: On-Demand Expansion API (**MVP - CRITICAL DEPENDENCY**)

**⚠️ CRITICAL**: This is **NOT** a future enhancement - it is a **CRITICAL MVP DEPENDENCY**.

**The Problem**: The design relies heavily on `repeat_meta` and `collection_summary` nodes to achieve its token reduction goals. These nodes contain `expansion_hint` lists. However, **without this API, the LLM sees a summary like "45 more items" but has no way to access them**. This makes the compressed DOM **non-actionable** for tasks involving those summarized items, directly threatening the **M2: Interaction Success Rate (≥95%)** metric.

**Recommendation**: E1: On-Demand Expansion API **MUST** be considered part of the MVP (included in Phase 4 or 5). A compaction system that hides elements with no way to get them back is a significant functional regression.

**Implementation**:

Allow LLM to request full details for summarized nodes:

```typescript
interface ExpansionRequest {
  expansion_hint: number[]; // Backend IDs from summary
  range?: [number, number]; // Optional index range
}

class DomService {
  async expandNodes(request: ExpansionRequest): Promise<SerializedNode[]> {
    const snapshot = this.currentSnapshot;
    const nodes = request.expansion_hint.map(id =>
      snapshot.getNodeByBackendId(id)
    );

    return nodes.map(node => this.buildFullSerializedNode(node));
  }
}
```

**Expected Impact**: Enable task-driven filtering and make summarized content actionable

**MVP Status**: **MUST BE INCLUDED** in Phase 4 or 5 of the 10-week implementation plan

---

### E2: Differential Snapshots (Medium Priority)

Send only deltas after first snapshot:

```typescript
interface DeltaSnapshot {
  added: SerializedNode[];
  removed: number[]; // node IDs
  modified: Partial<SerializedNode>[];
  unchanged_count: number;
}
```

**Expected Impact**: 80-95% reduction for subsequent snapshots

---

### E3: Semantic Clustering (Medium Priority)

Group similar elements with natural language summary:

```
Cluster: "Email List (47 items)"
  [1-5] First 5 emails shown
  [Summary] 42 more emails from: work (15), social (12), promotions (10), updates (5)
  [48] "Load more" button
```

**Expected Impact**: 30-50% additional reduction on list-heavy pages

---

### E4: Task-Driven Filtering (High Priority)

LLM specifies task focus area, receive filtered DOM:

```typescript
interface DomQuery {
  taskDescription: string;
  focusArea?: 'navigation' | 'forms' | 'content' | 'actions';
  maxElements?: number;
}

const filteredDom = await domService.queryDom({
  taskDescription: "Find and click the compose button",
  focusArea: "actions",
  maxElements: 50
});
```

**Expected Impact**: 50-70% additional reduction for focused tasks

---

### E5: ML-Based Pruning (Research)

Train lightweight classifier to predict element interaction likelihood:

```typescript
function shouldIncludeElement(node: VirtualNode, context: PageContext): boolean {
  const features = {
    role: node.accessibility?.role,
    hasOnClick: node.heuristics?.hasOnClick,
    inViewport: isInViewport(node, context.viewport),
    depth: computeDepth(node),
    parentRole: getParentRole(node),
    textLength: getTextContent(node)?.length || 0
  };

  const score = classifier.predict(features);
  return score > THRESHOLD;
}
```

**Expected Impact**: 20-40% additional reduction with maintained accuracy

---

## Open Questions

### Q1: Expansion API Design
**Question**: Do we need programmatic API to fetch details for summarized nodes on demand?
**Current Answer**: **✅ RESOLVED** - Yes, this is a **critical MVP dependency** and must be included in Phase 4 (Weeks 7-8). Without it, the compressed DOM is non-actionable for tasks involving summarized items, threatening M2 success rate.

### Q2: Text Summarization Technique
**Question**: Should we compress text via lightweight embeddings or sentence heuristics?
**Current Answer**: Use sentence heuristics (first N sentences) to avoid new dependencies. Evaluate embeddings in Phase 2.

### Q3: Cross-Frame Handling
**Question**: How do we treat cross-frame nodes during compaction?
**Current Answer**: Preserve iframe boundaries, apply compaction within each frame independently.

### Q4: Budget Defaults
**Question**: What budget defaults align with current LLM context windows?
**Current Answer**:
- GPT-4: 128k context → recommend 8k tokens for DOM
- Claude 3: 200k context → recommend 10k tokens for DOM
- Gemini: 1M context → recommend 15k tokens for DOM

---

## Appendix A: Token Reduction Estimates

### Baseline: Complex Gmail Inbox Page

| Metric | Original | Stage 1 | Stage 2 | Stage 3 | Final |
|--------|----------|---------|---------|---------|-------|
| Total Nodes | 500 | 380 (-24%) | 180 (-52%) | 180 (0%) | 180 |
| Interactive Nodes | 250 | 250 (0%) | 250 (0%) | 250 (0%) | 250 |
| Avg Chars/Node | 120 | 100 | 60 | 45 | 45 |
| Total Chars | 60,000 | 38,000 | 10,800 | 8,100 | 8,100 |
| Est. Tokens | 15,789 | 10,000 | 2,842 | 2,132 | 2,132 |
| **Reduction** | **0%** | **37%** | **82%** | **86.5%** | **86.5%** |

**Breakdown by Stage**:
- **Stage 1 (Signal Filtering)**: 37% reduction (removed hidden elements, noise)
- **Stage 2 (Structure Compaction)**: 72% additional reduction (repetition detection, collections)
- **Stage 3 (Payload Optimization)**: 25% additional reduction (ID remapping, field normalization)

---

## Appendix B: LLM System Prompt Updates

### Prompt Template for Compact Mode

```markdown
## DOM Serialization Format (Version 2)

The page DOM is provided as a hierarchical JSON structure with normalized field names:

### Field Reference
- `id`: Sequential element identifier (use for click/type actions)
- `tag`: HTML tag name
- `role`: ARIA role (button, textbox, link, etc.)
- `aria_label`: Accessible name (normalized from aria-label)
- `text`: Visible text content
- `value`: Current value (for form inputs)
- `href`: Link URL
- `input_type`: Input type attribute
- `hint`: Placeholder text (normalized from placeholder)
- `kids`: Child elements (normalized from children)
- `states`: Element states (checked, disabled, required, expanded)
- `bbox`: Bounding box [x, y, width, height] (optional)

### Special Nodes

#### Repetition Summary
When multiple identical elements exist, we show the first 2 and summarize the rest:

```json
{
  "tag": "repeat-summary",
  "role": "listitem",
  "count": 45,
  "expansion_hint": [12, 13, 14, ...]
}
```

This indicates 45 additional similar elements. To interact with a specific one, scroll to reveal it or request expansion.

#### Collection Summary
Large lists/tables are compressed to first k + last items:

```json
{
  "tag": "collection-summary",
  "role": "summary",
  "count": 42,
  "item_role": "listitem",
  "expansion_hint": [...]
}
```

This indicates 42 items were summarized. The last item (often "Load more") is shown after the summary.

### Text Truncation
Long text is truncated with `text_truncated: true` and `original_length` provided.

### States
- Only non-default states are included
- If `disabled` is absent, element is enabled
- If `checked` is absent, element is unchecked

### Example

```json
{
  "id": 1,
  "tag": "button",
  "role": "button",
  "aria_label": "Compose new email",
  "states": { "disabled": false }
}
```

This is an enabled button labeled "Compose new email". To click it, use id=1.
```

---

### Prompt Template for Full Mode

```markdown
## DOM Serialization Format (Version 2 - Full Mode)

Full mode preserves complete DOM structure without compaction:

- All elements included (no repetition summaries)
- Full text content (no truncation)
- Original field names (node_id, "aria-label", children)
- All states preserved

Use this mode when you need complete page context or when compact mode has insufficient detail.
```

---

## Appendix C: Algorithm Pseudocode

### Three-Stage Pipeline

```python
def serialize(root: VirtualNode, mode: str, budget: int) -> SerializedDom:
    # Full mode: skip compaction
    if mode == 'full':
        return serialize_full(root)

    # Compact mode: adaptive compaction
    thresholds = get_baseline_thresholds()
    iteration = 0
    max_iterations = 5

    while iteration < max_iterations:
        # Stage 1: Signal Filtering
        filtered = apply_signal_filtering(root)

        # Stage 2: Structure Compaction
        compacted = apply_structure_compaction(filtered, thresholds)

        # Stage 3: Payload Optimization
        optimized = apply_payload_optimization(compacted)

        # Estimate tokens
        serialized = materialize(optimized)
        metrics = estimate_metrics(serialized)

        # Check budget
        if metrics.estimated_tokens <= budget:
            return create_serialized_dom(serialized, metrics, mode)

        # Tighten thresholds
        thresholds = tighten_thresholds(thresholds)
        iteration += 1

    # Max iterations reached
    return create_serialized_dom(serialized, metrics, mode)

def apply_signal_filtering(node: VirtualNode) -> VirtualNode:
    # F1: Visibility filter
    if not is_visible(node):
        return None

    # F2: Text node filter
    if node.type == TEXT and len(node.value.trim()) < 2:
        if not parent or parent.tier != 'semantic':
            return None

    # F3: Noise filter
    if node.tag in ['script', 'style', 'noscript']:
        return None

    # F4: Semantic container refinement
    if is_semantic_container(node):
        if not is_valued_semantic_container(node):
            # Hoist children
            return hoist_children(node)

    # Recursively filter children
    if node.children:
        node.children = [apply_signal_filtering(c) for c in node.children]
        node.children = [c for c in node.children if c is not None]

    return node

def apply_structure_compaction(node: VirtualNode, thresholds: ThresholdConfig) -> VirtualNode:
    # S2.1: Collapse sequential text
    if node.children:
        node.children = collapse_sequential_text(node.children)

    # S2.2: Repetition detection
    if node.children:
        node.children = detect_repetitions(node.children, thresholds.repetition_threshold)

    # S2.3: Collection compression
    node = compress_collection(node, thresholds.collection_size_limit, thresholds.keep_first_count)

    # S2.4: Layout simplification
    node = simplify_layout(node)

    # Recurse
    if node.children:
        node.children = [apply_structure_compaction(c, thresholds) for c in node.children]

    return node

def apply_payload_optimization(node: VirtualNode) -> SerializedNode:
    # P3.1: ID remapping
    seq_id = id_remapper.remap(node.backend_node_id)

    # P3.2: Attribute pruning
    attrs = prune_attributes(node.attributes)

    # P3.3: Field normalization
    serialized = {
        'id': seq_id,
        'tag': node.tag,
        'role': node.role,
        'aria_label': normalize_field_name(node.aria_label),
        # ... other fields
    }

    # P3.4: Numeric compaction
    if node.bbox:
        serialized['bbox'] = [node.bbox.x, node.bbox.y, node.bbox.w, node.bbox.h]

    # P3.5: Metadata bucketing (applied at parent level)

    # Recurse
    if node.children:
        serialized['kids'] = [apply_payload_optimization(c) for c in node.children]

    return serialized
```

---

## Conclusion

This design proposes a **comprehensive, three-stage serialization pipeline** that can reduce DOM serialization token consumption by **40-86%** while maintaining interaction fidelity.

**Key Innovations**:
1. **Three-Stage Pipeline**: Clear separation of concerns (signal → structure → payload)
2. **Repetition Detection**: Hash-based duplicate summarization with children structure (20-40% reduction on lists)
3. **Collection Compression**: Keep first k + last items (15-30% reduction on tables)
4. **Adaptive Budget Manager**: One-pass estimation with safety margin to avoid expensive iteration loops
5. **On-Demand Expansion API**: Critical MVP feature enabling access to summarized content
6. **Versioned Payload**: Backward compatibility with v1 format

**Recommended Approach**:
1. Implement **Phases 1-3** (Weeks 1-6): Core three-stage pipeline
2. Implement **Phase 4** (Weeks 7-8): Budget manager integration + **Expansion API (Critical MVP)**
3. Validate with **Phase 5** (Weeks 9-10): Extensive evaluation across 50+ sites + **End-to-end agent testing for M2**
4. Deploy with **Phase 6** (Week 11+): Gradual rollout with monitoring

**Success Factors**:
- Extensive testing across diverse web applications
- Close monitoring of interaction success rates (≥95% threshold)
- Iterative tuning based on real-world performance
- Clear documentation and LLM prompt engineering

**Next Steps**:
1. Review and approve design
2. Create implementation branch
3. Begin Phase 1 development
4. Set up metrics collection infrastructure

---

**Document Version History**

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2025-10-28 | Initial design proposal | AI Design Assistant |
| 2.0 | 2025-10-28 | Merged with Codex design, added three-stage pipeline, repetition detection, budget manager | AI Design Assistant |
| 2.1 | 2025-10-29 | **Critical improvements based on review feedback**: (1) Moved Expansion API from future enhancements to MVP (Phase 4), (2) Added one-pass estimation and safety margin to Budget Manager to mitigate performance risk, (3) Enhanced repetition detection signature to include children structure, (4) Lowered semantic container threshold from 2+ to 1+ interactive descendants, (5) Added explicit ID mapping persistence requirement, (6) Added end-to-end agent testing requirement for M2 validation | AI Design Assistant |


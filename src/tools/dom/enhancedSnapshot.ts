/**
 * Enhanced snapshot processing for browser-use DOM tree extraction.
 *
 * This module provides stateless functions for parsing Chrome DevTools Protocol (CDP) DOMSnapshot data
 * to extract visibility, clickability, cursor styles, and other layout information.
 */

import type {
	DOMRect,
	EnhancedSnapshotNode,
	ContentScriptCaptureReturns
} from './views';

// CDP helpers removed; content-script format already provides computed values

/**
 * Build a lookup table of backend node ID to enhanced snapshot data with everything calculated upfront.
 * Only supports content-script ContentScriptCaptureReturns format.
 */
export function build_snapshot_lookup(
	snapshot: ContentScriptCaptureReturns,
	_device_pixel_ratio: number = 1.0
): Record<number, EnhancedSnapshotNode> {
	const snapshot_lookup: Record<number, EnhancedSnapshotNode> = {};

	if (!snapshot || !snapshot.documents || snapshot.documents.length === 0) {
		return snapshot_lookup;
	}

	// Content script snapshot format only
	for (const document of snapshot.documents) {
		for (const node of document.nodes as any[]) {
			const backendNodeId = (node && typeof node.backendNodeId === 'number') ? node.backendNodeId : null;
			if (!backendNodeId) continue;

			const snap = node.snapshot as any;
			if (!snap) continue;

			let bounding_box: DOMRect | null = null;
			if (snap.bounds && typeof snap.bounds.x === 'number') {
				bounding_box = {
					x: snap.bounds.x,
					y: snap.bounds.y,
					width: snap.bounds.width,
					height: snap.bounds.height
				};
			}

			const computed_styles: Record<string, string> | null = snap.computedStyles && Object.keys(snap.computedStyles).length > 0
				? snap.computedStyles
				: null;

			const cursor_style: string | null = computed_styles && typeof computed_styles.cursor === 'string'
				? computed_styles.cursor
				: null;

			const is_clickable: boolean | null = typeof snap.isClickable === 'boolean' ? snap.isClickable : null;

			snapshot_lookup[backendNodeId] = {
				is_clickable,
				cursor_style,
				bounds: bounding_box,
				clientRects: null,
				scrollRects: null,
				computed_styles,
				paint_order: null,
				stacking_contexts: null
			};
		}
	}

	return snapshot_lookup;
}
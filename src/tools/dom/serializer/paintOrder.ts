/**
 * Helper class for maintaining a union of rectangles (used for order of elements calculation)
 */

import { SimplifiedNode, DOMRect } from '../views';

/**
 * Closed axis-aligned rectangle with (x1,y1) bottom-left, (x2,y2) top-right.
 */
export class Rect {
	constructor(
		public readonly x1: number,
		public readonly y1: number,
		public readonly x2: number,
		public readonly y2: number
	) {
		if (!(x1 <= x2 && y1 <= y2)) {
			throw new Error('Invalid rectangle coordinates');
		}
	}

	area(): number {
		return (this.x2 - this.x1) * (this.y2 - this.y1);
	}

	intersects(other: Rect): boolean {
		return !(this.x2 <= other.x1 || other.x2 <= this.x1 || this.y2 <= other.y1 || other.y2 <= this.y1);
	}

	contains(other: Rect): boolean {
		return this.x1 <= other.x1 && this.y1 <= other.y1 && this.x2 >= other.x2 && this.y2 >= other.y2;
	}
}

/**
 * Maintains a *disjoint* set of rectangles.
 * No external dependencies - fine for a few thousand rectangles.
 */
export class RectUnionPure {
	private _rects: Rect[] = [];

	/**
	 * Return list of up to 4 rectangles = a \ b.
	 * Assumes a intersects b.
	 */
	private _split_diff(a: Rect, b: Rect): Rect[] {
		const parts: Rect[] = [];

		// Bottom slice
		if (a.y1 < b.y1) {
			parts.push(new Rect(a.x1, a.y1, a.x2, b.y1));
		}
		// Top slice
		if (b.y2 < a.y2) {
			parts.push(new Rect(a.x1, b.y2, a.x2, a.y2));
		}

		// Middle (vertical) strip: y overlap is [max(a.y1,b.y1), min(a.y2,b.y2)]
		const y_lo = Math.max(a.y1, b.y1);
		const y_hi = Math.min(a.y2, b.y2);

		// Left slice
		if (a.x1 < b.x1) {
			parts.push(new Rect(a.x1, y_lo, b.x1, y_hi));
		}
		// Right slice
		if (b.x2 < a.x2) {
			parts.push(new Rect(b.x2, y_lo, a.x2, y_hi));
		}

		return parts;
	}

	/**
	 * True iff r is fully covered by the current union.
	 */
	contains(r: Rect): boolean {
		if (!this._rects.length) {
			return false;
		}

		let stack = [r];
		for (const s of this._rects) {
			const new_stack: Rect[] = [];
			for (const piece of stack) {
				if (s.contains(piece)) {
					// piece completely gone
					continue;
				}
				if (piece.intersects(s)) {
					new_stack.push(...this._split_diff(piece, s));
				} else {
					new_stack.push(piece);
				}
			}
			if (!new_stack.length) {  // everything eaten – covered
				return true;
			}
			stack = new_stack;
		}
		return false;  // something survived
	}

	/**
	 * Insert r unless it is already covered.
	 * Returns True if the union grew.
	 */
	add(r: Rect): boolean {
		if (this.contains(r)) {
			return false;
		}

		let pending = [r];
		let i = 0;
		while (i < this._rects.length) {
			const s = this._rects[i];
			const new_pending: Rect[] = [];
			let changed = false;
			for (const piece of pending) {
				if (piece.intersects(s)) {
					new_pending.push(...this._split_diff(piece, s));
					changed = true;
				} else {
					new_pending.push(piece);
				}
			}
			pending = new_pending;
			if (changed) {
				// s unchanged; proceed with next existing rectangle
				i++;
			} else {
				i++;
			}
		}

		// Any left‑over pieces are new, non‑overlapping areas
		this._rects.push(...pending);
		return true;
	}
}

/**
 * Calculates which elements should be removed based on the paint order parameter.
 */
export class PaintOrderRemover {
	constructor(private root: SimplifiedNode) {}

	calculate_paint_order(): void {
		const all_simplified_nodes_with_paint_order: SimplifiedNode[] = [];

		const collect_paint_order = (node: SimplifiedNode): void => {
			if (
				node.original_node.snapshot_node &&
				node.original_node.snapshot_node.paint_order !== null &&
				node.original_node.snapshot_node.paint_order !== undefined &&
				node.original_node.snapshot_node.bounds !== null
			) {
				all_simplified_nodes_with_paint_order.push(node);
			}

			for (const child of node.children) {
				collect_paint_order(child);
			}
		};

		collect_paint_order(this.root);

		const grouped_by_paint_order: Map<number, SimplifiedNode[]> = new Map();

		for (const node of all_simplified_nodes_with_paint_order) {
			if (node.original_node.snapshot_node && node.original_node.snapshot_node.paint_order !== null && node.original_node.snapshot_node.paint_order !== undefined) {
				const paint_order = node.original_node.snapshot_node.paint_order;
				if (!grouped_by_paint_order.has(paint_order)) {
					grouped_by_paint_order.set(paint_order, []);
				}
				grouped_by_paint_order.get(paint_order)!.push(node);
			}
		}

		const rect_union = new RectUnionPure();

		// Sort by paint order in descending order
		const sorted_entries = Array.from(grouped_by_paint_order.entries()).sort((a, b) => b[0] - a[0]);

		for (const [paint_order, nodes] of sorted_entries) {
			const rects_to_add: Rect[] = [];

			for (const node of nodes) {
				if (!node.original_node.snapshot_node || !node.original_node.snapshot_node.bounds) {
					continue;  // shouldn't happen by how we filter them out in the first place
				}

				const rect = new Rect(
					node.original_node.snapshot_node.bounds.x,
					node.original_node.snapshot_node.bounds.y,
					node.original_node.snapshot_node.bounds.x + node.original_node.snapshot_node.bounds.width,
					node.original_node.snapshot_node.bounds.y + node.original_node.snapshot_node.bounds.height
				);

				if (rect_union.contains(rect)) {
					node.ignored_by_paint_order = true;
				}

				// don't add to the nodes if opacity is less then 0.95 or background-color is transparent
				const computed_styles = node.original_node.snapshot_node.computed_styles;
				if (computed_styles) {
					const bg_color = computed_styles['background-color'] || 'rgba(0, 0, 0, 0)';
					const opacity = parseFloat(computed_styles['opacity'] || '1');

					if (bg_color === 'rgba(0, 0, 0, 0)' || opacity < 0.8) {
						continue;
					}
				}

				rects_to_add.push(rect);
			}

			for (const rect of rects_to_add) {
				rect_union.add(rect);
			}
		}
	}
}
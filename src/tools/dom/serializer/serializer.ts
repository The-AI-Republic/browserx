/**
 * Serializes enhanced DOM trees to string format for LLM consumption
 */

import type {
	EnhancedDOMTreeNode,
	SerializedDOMState,
	SimplifiedNode,
	DOMSelectorMap,
	PropagatingBounds,
	DOMRect
} from '../views';
import { NodeType, DISABLED_ELEMENTS, PROPAGATING_ELEMENTS, DEFAULT_CONTAINMENT_THRESHOLD } from '../views';
import { ClickableElementDetector } from './clickableElements';
import { PaintOrderRemover } from './paintOrder';
import { cap_text_length } from '../utils';

export class DOMTreeSerializer {
	private root_node: EnhancedDOMTreeNode;
	private _interactive_counter: number = 1;
	private _selector_map: DOMSelectorMap = {};
	private _previous_cached_selector_map: DOMSelectorMap | null | undefined;
	private timing_info: Record<string, number> = {};
	private _clickable_cache: Record<number, boolean> = {};
	private enable_bbox_filtering: boolean;
	private containment_threshold: number;
	private paint_order_filtering: boolean;

	constructor(
		root_node: EnhancedDOMTreeNode,
		previous_cached_state: SerializedDOMState | null = null,
		enable_bbox_filtering: boolean = true,
		containment_threshold: number | null = null,
		paint_order_filtering: boolean = true
	) {
		if (!root_node) {
			throw new TypeError('DOMTreeSerializer requires a root_node parameter');
		}
		this.root_node = root_node;
		this._previous_cached_selector_map = previous_cached_state?.selector_map;
		this.enable_bbox_filtering = enable_bbox_filtering;
		this.containment_threshold = containment_threshold || DEFAULT_CONTAINMENT_THRESHOLD;
		this.paint_order_filtering = paint_order_filtering;
	}

	private _safe_parse_number(value_str: string, defaultValue: number): number {
		try {
			return parseFloat(value_str);
		} catch {
			return defaultValue;
		}
	}

	private _safe_parse_optional_number(value_str: string | null | undefined): number | null {
		if (!value_str) {
			return null;
		}
		try {
			return parseFloat(value_str);
		} catch {
			return null;
		}
	}

	serialize_accessible_elements(): [SerializedDOMState, Record<string, number>] {
		const start_total = Date.now();

		// Reset state
		this._interactive_counter = 1;
		this._selector_map = {};
		this._clickable_cache = {};

		// Step 1: Create simplified tree (includes clickable element detection)
		const start_step1 = Date.now();
		const simplified_tree = this._create_simplified_tree(this.root_node);
		this.timing_info['create_simplified_tree'] = Date.now() - start_step1;

		// Step 2: Remove elements based on paint order
		const start_step2 = Date.now();
		if (this.paint_order_filtering && simplified_tree) {
			new PaintOrderRemover(simplified_tree).calculate_paint_order();
		}
		this.timing_info['calculate_paint_order'] = Date.now() - start_step2;

		// Step 3: Optimize tree (remove unnecessary parents)
		const start_step3 = Date.now();
		const optimized_tree = this._optimize_tree(simplified_tree);
		this.timing_info['optimize_tree'] = Date.now() - start_step3;

		// Step 4: Apply bounding box filtering
		let filtered_tree: SimplifiedNode | null;
		if (this.enable_bbox_filtering && optimized_tree) {
			const start_step4 = Date.now();
			filtered_tree = this._apply_bounding_box_filtering(optimized_tree);
			this.timing_info['bbox_filtering'] = Date.now() - start_step4;
		} else {
			filtered_tree = optimized_tree;
		}

		// Step 5: Assign interactive indices to clickable elements
		const start_step5 = Date.now();
		this._assign_interactive_indices_and_mark_new_nodes(filtered_tree);
		this.timing_info['assign_interactive_indices'] = Date.now() - start_step5;

		this.timing_info['serialize_accessible_elements_total'] = Date.now() - start_total;

		return [
			{ _root: filtered_tree, selector_map: this._selector_map },
			this.timing_info
		];
	}

	private _add_compound_components(simplified: SimplifiedNode, node: EnhancedDOMTreeNode): void {
		// Only process elements that might have compound components
		if (!['input', 'select', 'details', 'audio', 'video'].includes(node.tag_name || '')) {
			return;
		}

		// For input elements, check for compound input types
		if (node.tag_name === 'input') {
			const type = node.attributes?.type;
			if (!type || !['date', 'time', 'datetime-local', 'month', 'week', 'range', 'number', 'color', 'file'].includes(type)) {
				return;
			}
		}
		// For other elements, check if they have AX child indicators
		else if (!node.ax_node?.child_ids) {
			return;
		}

		// Add compound component information based on element type
		const element_type = node.tag_name;
		const input_type = node.attributes?.type || '';

		if (element_type === 'input') {
			if (input_type === 'date') {
				node._compound_children.push(
					{ role: 'spinbutton', name: 'Day', valuemin: 1, valuemax: 31, valuenow: null },
					{ role: 'spinbutton', name: 'Month', valuemin: 1, valuemax: 12, valuenow: null },
					{ role: 'spinbutton', name: 'Year', valuemin: 1, valuemax: 275760, valuenow: null }
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'time') {
				node._compound_children.push(
					{ role: 'spinbutton', name: 'Hour', valuemin: 0, valuemax: 23, valuenow: null },
					{ role: 'spinbutton', name: 'Minute', valuemin: 0, valuemax: 59, valuenow: null }
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'datetime-local') {
				node._compound_children.push(
					{ role: 'spinbutton', name: 'Day', valuemin: 1, valuemax: 31, valuenow: null },
					{ role: 'spinbutton', name: 'Month', valuemin: 1, valuemax: 12, valuenow: null },
					{ role: 'spinbutton', name: 'Year', valuemin: 1, valuemax: 275760, valuenow: null },
					{ role: 'spinbutton', name: 'Hour', valuemin: 0, valuemax: 23, valuenow: null },
					{ role: 'spinbutton', name: 'Minute', valuemin: 0, valuemax: 59, valuenow: null }
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'month') {
				node._compound_children.push(
					{ role: 'spinbutton', name: 'Month', valuemin: 1, valuemax: 12, valuenow: null },
					{ role: 'spinbutton', name: 'Year', valuemin: 1, valuemax: 275760, valuenow: null }
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'week') {
				node._compound_children.push(
					{ role: 'spinbutton', name: 'Week', valuemin: 1, valuemax: 53, valuenow: null },
					{ role: 'spinbutton', name: 'Year', valuemin: 1, valuemax: 275760, valuenow: null }
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'range') {
				const min_val = node.attributes?.min || '0';
				const max_val = node.attributes?.max || '100';
				node._compound_children.push({
					role: 'slider',
					name: 'Value',
					valuemin: this._safe_parse_number(min_val, 0),
					valuemax: this._safe_parse_number(max_val, 100),
					valuenow: null
				});
				simplified.is_compound_component = true;
			} else if (input_type === 'number') {
				const min_val = node.attributes?.min;
				const max_val = node.attributes?.max;
				node._compound_children.push(
					{ role: 'button', name: 'Increment', valuemin: null, valuemax: null, valuenow: null },
					{ role: 'button', name: 'Decrement', valuemin: null, valuemax: null, valuenow: null },
					{
						role: 'textbox',
						name: 'Value',
						valuemin: this._safe_parse_optional_number(min_val),
						valuemax: this._safe_parse_optional_number(max_val),
						valuenow: null
					}
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'color') {
				node._compound_children.push(
					{ role: 'textbox', name: 'Hex Value', valuemin: null, valuemax: null, valuenow: null },
					{ role: 'button', name: 'Color Picker', valuemin: null, valuemax: null, valuenow: null }
				);
				simplified.is_compound_component = true;
			} else if (input_type === 'file') {
				const multiple = node.attributes?.multiple !== undefined;
				node._compound_children.push(
					{ role: 'button', name: 'Browse Files', valuemin: null, valuemax: null, valuenow: null },
					{
						role: 'textbox',
						name: multiple ? 'Files Selected' : 'File Selected',
						valuemin: null,
						valuemax: null,
						valuenow: null
					}
				);
				simplified.is_compound_component = true;
			}
		} else if (element_type === 'select') {
			const base_components = [
				{ role: 'button', name: 'Dropdown Toggle', valuemin: null, valuemax: null, valuenow: null }
			];

			// Extract option information from child nodes
			const options_info = this._extract_select_options(node);
			if (options_info) {
				const options_component: any = {
					role: 'listbox',
					name: 'Options',
					valuemin: null,
					valuemax: null,
					valuenow: null,
					options_count: options_info.count,
					first_options: options_info.first_options
				};
				if (options_info.format_hint) {
					options_component.format_hint = options_info.format_hint;
				}
				base_components.push(options_component);
			} else {
				base_components.push(
					{ role: 'listbox', name: 'Options', valuemin: null, valuemax: null, valuenow: null }
				);
			}

			node._compound_children.push(...base_components);
			simplified.is_compound_component = true;
		} else if (element_type === 'details') {
			node._compound_children.push(
				{ role: 'button', name: 'Toggle Disclosure', valuemin: null, valuemax: null, valuenow: null },
				{ role: 'region', name: 'Content Area', valuemin: null, valuemax: null, valuenow: null }
			);
			simplified.is_compound_component = true;
		} else if (element_type === 'audio') {
			node._compound_children.push(
				{ role: 'button', name: 'Play/Pause', valuemin: null, valuemax: null, valuenow: null },
				{ role: 'slider', name: 'Progress', valuemin: 0, valuemax: 100, valuenow: null },
				{ role: 'button', name: 'Mute', valuemin: null, valuemax: null, valuenow: null },
				{ role: 'slider', name: 'Volume', valuemin: 0, valuemax: 100, valuenow: null }
			);
			simplified.is_compound_component = true;
		} else if (element_type === 'video') {
			node._compound_children.push(
				{ role: 'button', name: 'Play/Pause', valuemin: null, valuemax: null, valuenow: null },
				{ role: 'slider', name: 'Progress', valuemin: 0, valuemax: 100, valuenow: null },
				{ role: 'button', name: 'Mute', valuemin: null, valuemax: null, valuenow: null },
				{ role: 'slider', name: 'Volume', valuemin: 0, valuemax: 100, valuenow: null },
				{ role: 'button', name: 'Fullscreen', valuemin: null, valuemax: null, valuenow: null }
			);
			simplified.is_compound_component = true;
		}
	}

	private _extract_select_options(select_node: EnhancedDOMTreeNode): any | null {
		if (!select_node.children) {
			return null;
		}

		const options: Array<{ text: string; value: string }> = [];
		const option_values: string[] = [];

		const extract_options_recursive = (node: EnhancedDOMTreeNode): void => {
			if (node.tag_name?.toLowerCase() === 'option') {
				let option_text = '';
				let option_value = '';

				// Get value attribute if present
				if (node.attributes?.value !== undefined) {
					option_value = String(node.attributes.value).trim();
				}

				// Get text content from direct child text nodes only to avoid duplication
				const get_direct_text_content = (n: EnhancedDOMTreeNode): string => {
					let text = '';
					for (const child of n.children) {
						if (child.node_type === NodeType.TEXT_NODE && child.node_value) {
							text += child.node_value.trim() + ' ';
						}
					}
					return text.trim();
				};

				option_text = get_direct_text_content(node);

				// Use text as value if no explicit value
				if (!option_value && option_text) {
					option_value = option_text;
				}

				if (option_text || option_value) {
					options.push({ text: option_text, value: option_value });
					option_values.push(option_value);
				}
			} else if (node.tag_name?.toLowerCase() === 'optgroup') {
				// Process optgroup children
				for (const child of node.children) {
					extract_options_recursive(child);
				}
			} else {
				// Process other children that might contain options
				for (const child of node.children) {
					extract_options_recursive(child);
				}
			}
		};

		// Extract all options from select children
		for (const child of select_node.children) {
			extract_options_recursive(child);
		}

		if (!options.length) {
			return null;
		}

		// Prepare first 4 options for display
		const first_options: string[] = [];
		for (const option of options.slice(0, 4)) {
			if (option.text && option.value && option.text !== option.value) {
				const text = option.text.length > 20 ? option.text.substring(0, 20) + '...' : option.text;
				const value = option.value.length > 10 ? option.value.substring(0, 10) + '...' : option.value;
				first_options.push(`${text} (${value})`);
			} else if (option.text) {
				const text = option.text.length > 25 ? option.text.substring(0, 25) + '...' : option.text;
				first_options.push(text);
			} else if (option.value) {
				const value = option.value.length > 25 ? option.value.substring(0, 25) + '...' : option.value;
				first_options.push(value);
			}
		}

		// Try to infer format hint from option values
		let format_hint: string | null = null;
		if (option_values.length >= 2) {
			// Check for common patterns
			const first_five = option_values.slice(0, 5).filter(val => val);
			if (first_five.every(val => /^\d+$/.test(val))) {
				format_hint = 'numeric';
			} else if (first_five.every(val => val.length === 2 && val === val.toUpperCase())) {
				format_hint = 'country/state codes';
			} else if (first_five.every(val => val.includes('/') || val.includes('-'))) {
				format_hint = 'date/path format';
			} else if (first_five.some(val => val.includes('@'))) {
				format_hint = 'email addresses';
			}
		}

		return { count: options.length, first_options, format_hint };
	}

	private _is_interactive_cached(node: EnhancedDOMTreeNode): boolean {
		if (!(node.node_id in this._clickable_cache)) {
			const start_time = Date.now();
			const result = ClickableElementDetector.is_interactive(node);
			const end_time = Date.now();

			if (!this.timing_info['clickable_detection_time']) {
				this.timing_info['clickable_detection_time'] = 0;
			}
			this.timing_info['clickable_detection_time'] += end_time - start_time;

			this._clickable_cache[node.node_id] = result;
		}

		return this._clickable_cache[node.node_id];
	}

	private _create_simplified_tree(node: EnhancedDOMTreeNode, depth: number = 0): SimplifiedNode | null {
		if (node.node_type === NodeType.DOCUMENT_NODE) {
			// for all children including shadow roots
			for (const child of node.children_and_shadow_roots) {
				const simplified_child = this._create_simplified_tree(child, depth + 1);
				if (simplified_child) {
					return simplified_child;
				}
			}
			return null;
		}

		if (node.node_type === NodeType.DOCUMENT_FRAGMENT_NODE) {
			// ENHANCED shadow DOM processing - always include shadow content
			const simplified: SimplifiedNode = {
				original_node: node,
				children: [],
				should_display: true,
				interactive_index: null,
				is_new: false,
				ignored_by_paint_order: false,
				excluded_by_parent: false,
				is_shadow_host: false,
				is_compound_component: false
			};
			for (const child of node.children_and_shadow_roots) {
				const simplified_child = this._create_simplified_tree(child, depth + 1);
				if (simplified_child) {
					simplified.children.push(simplified_child);
				}
			}

			// Always return shadow DOM fragments, even if children seem empty
			if (simplified.children.length > 0) {
				return simplified;
			}
			return {
				original_node: node,
				children: [],
				should_display: true,
				interactive_index: null,
				is_new: false,
				ignored_by_paint_order: false,
				excluded_by_parent: false,
				is_shadow_host: false,
				is_compound_component: false
			};
		} else if (node.node_type === NodeType.ELEMENT_NODE) {
			// Skip non-content elements
			if (DISABLED_ELEMENTS.includes(node.node_name.toLowerCase())) {
				return null;
			}

			if (node.node_name === 'IFRAME' || node.node_name === 'FRAME') {
				if (node.content_document) {
				const simplified: SimplifiedNode = {
					original_node: node,
					children: [],
					should_display: true,
					interactive_index: null,
					is_new: false,
					ignored_by_paint_order: false,
					excluded_by_parent: false,
					is_shadow_host: false,
					is_compound_component: false
				};
					for (const child of node.content_document.children_nodes || []) {
						const simplified_child = this._create_simplified_tree(child, depth + 1);
						if (simplified_child !== null) {
							simplified.children.push(simplified_child);
						}
					}
					return simplified;
				}
			}

			const is_visible = node.is_visible;
			const is_scrollable = node.is_actually_scrollable;
			const has_shadow_content = node.children_and_shadow_roots.length > 0;

			// ENHANCED SHADOW DOM DETECTION: Include shadow hosts even if not visible
			const is_shadow_host = node.children_and_shadow_roots.some(
				child => child.node_type === NodeType.DOCUMENT_FRAGMENT_NODE
			);

			// Override visibility for elements with validation attributes
			let is_visible_override = is_visible;
			if (!is_visible && node.attributes) {
				const has_validation_attrs = Object.keys(node.attributes).some(
					attr => attr.startsWith('aria-') || attr.startsWith('pseudo')
				);
				if (has_validation_attrs) {
					is_visible_override = true;
				}
			}

			// Include if visible, scrollable, has children, or is shadow host
			if (is_visible_override || is_scrollable || has_shadow_content || is_shadow_host) {
				const simplified: SimplifiedNode = {
					original_node: node,
					children: [],
					should_display: true,
					interactive_index: null,
					is_new: false,
					ignored_by_paint_order: false,
					excluded_by_parent: false,
					is_shadow_host,
					is_compound_component: false
				};

				// Process ALL children including shadow roots
				for (const child of node.children_and_shadow_roots) {
					const simplified_child = this._create_simplified_tree(child, depth + 1);
					if (simplified_child) {
						simplified.children.push(simplified_child);
					}
				}

				// COMPOUND CONTROL PROCESSING: Add virtual components for compound controls
				this._add_compound_components(simplified, node);

				// SHADOW DOM SPECIAL CASE: Always include shadow hosts even if not visible
				if (is_shadow_host && simplified.children.length > 0) {
					return simplified;
				}

				// Return if meaningful or has meaningful children
				if (is_visible_override || is_scrollable || simplified.children.length > 0) {
					return simplified;
				}
			}
		} else if (node.node_type === NodeType.TEXT_NODE) {
			// Include meaningful text nodes
			const is_visible = node.snapshot_node && node.is_visible;
			if (
				is_visible &&
				node.node_value &&
				node.node_value.trim() &&
				node.node_value.trim().length > 1
			) {
				return {
					original_node: node,
					children: [],
					should_display: true,
					interactive_index: null,
					is_new: false,
					ignored_by_paint_order: false,
					excluded_by_parent: false,
					is_shadow_host: false,
					is_compound_component: false
				};
			}
		}

		return null;
	}

	private _optimize_tree(node: SimplifiedNode | null): SimplifiedNode | null {
		if (!node) {
			return null;
		}

		// Optimize children first
		const optimized_children: SimplifiedNode[] = [];
		for (const child of node.children) {
			const optimized_child = this._optimize_tree(child);
			if (optimized_child) {
				optimized_children.push(optimized_child);
			}
		}

		// Check if this node should be kept
		const is_clickable = this._is_interactive_cached(node.original_node);
		const is_scrollable = node.original_node.is_actually_scrollable;
		const is_text = node.original_node.node_type === NodeType.TEXT_NODE;
		const is_shadow = node.original_node.node_type === NodeType.DOCUMENT_FRAGMENT_NODE;
		const is_iframe = node.original_node.tag_name === 'IFRAME' || node.original_node.tag_name === 'FRAME';

		// Keep if: clickable, scrollable, text, shadow, iframe, or has multiple children
		if (is_clickable || is_scrollable || is_text || is_shadow || is_iframe || optimized_children.length > 1) {
			node.children = optimized_children;
			return node;
		}

		// If single child and node is not special, bypass this node
		if (optimized_children.length === 1) {
			return optimized_children[0];
		}

		// No children and not special - remove
		if (optimized_children.length === 0) {
			return null;
		}

		node.children = optimized_children;
		return node;
	}

	private _collect_interactive_elements(node: SimplifiedNode, elements: SimplifiedNode[]): void {
		if (this._is_interactive_cached(node.original_node) && !node.ignored_by_paint_order) {
			elements.push(node);
		}
		for (const child of node.children) {
			this._collect_interactive_elements(child, elements);
		}
	}

	private _assign_interactive_indices_and_mark_new_nodes(node: SimplifiedNode | null): void {
		if (!node) {
			return;
		}

		// Collect all interactive elements
		const interactive_elements: SimplifiedNode[] = [];
		this._collect_interactive_elements(node, interactive_elements);

		// Assign indices and mark new nodes
		for (const element of interactive_elements) {
			const xpath = element.original_node.xpath;

			// Check if this element existed in previous state
			if (this._previous_cached_selector_map && xpath in this._previous_cached_selector_map) {
				// Existing element - use previous index
				element.interactive_index = this._previous_cached_selector_map[xpath];
				element.is_new = false;
			} else {
				// New element - assign new index
				element.interactive_index = this._interactive_counter++;
				element.is_new = true;
			}

			// Update selector map
			this._selector_map[xpath] = element.interactive_index;
		}
	}

	private _apply_bounding_box_filtering(node: SimplifiedNode | null): SimplifiedNode | null {
		if (!node) {
			return null;
		}

		// Start recursive filtering
		this._filter_tree_recursive(node);
		return node;
	}

	private _filter_tree_recursive(
		node: SimplifiedNode,
		active_bounds: PropagatingBounds | null = null,
		depth: number = 0
	): void {
		// Check if this is a propagating element
		let current_active_bounds = active_bounds;
		if (node.original_node.node_type === NodeType.ELEMENT_NODE) {
			if (this._is_propagating_element(node.original_node)) {
				// This element propagates its bounds to children
				if (node.original_node.snapshot_node?.bounds) {
					current_active_bounds = {
						tag: node.original_node.tag_name,
						bounds: node.original_node.snapshot_node.bounds,
						node_id: node.original_node.node_id,
						depth
					};
				}
			}
		}

		// Filter children
		const filtered_children: SimplifiedNode[] = [];
		for (const child of node.children) {
			// Check if child should be excluded
			if (current_active_bounds && this._should_exclude_child(child, current_active_bounds)) {
				continue;  // Skip this child
			}

			// Recursively filter child's subtree
			this._filter_tree_recursive(child, current_active_bounds, depth + 1);
			filtered_children.push(child);
		}

		// Update node's children with filtered list
		node.children = filtered_children;
	}

	private _should_exclude_child(node: SimplifiedNode, active_bounds: PropagatingBounds): boolean {
		// Only filter element nodes with bounds
		if (node.original_node.node_type !== NodeType.ELEMENT_NODE) {
			return false;
		}

		// Don't filter if node has no bounds
		if (!node.original_node.snapshot_node?.bounds) {
			return false;
		}

		// Don't filter interactive elements that aren't ignored by paint order
		if (node.interactive_index != null && !node.ignored_by_paint_order) {
			return false;
		}

		// Don't filter scrollable elements
		if (node.original_node.is_actually_scrollable) {
			return false;
		}

		// Check if node is contained within active bounds
		const child_bounds = node.original_node.snapshot_node.bounds;
		const parent_bounds = active_bounds.bounds;

		// If child is fully contained within parent bounds, exclude it
		if (this._is_contained(child_bounds, parent_bounds, this.containment_threshold)) {
			return true;
		}

		return false;
	}

	private _is_contained(child: DOMRect, parent: DOMRect, threshold: number): boolean {
		// Calculate child's area
		const child_area = child.width * child.height;
		if (child_area === 0) {
			return true;  // Zero-area elements are considered contained
		}

		// Calculate intersection
		const x_overlap = Math.max(0, Math.min(child.x + child.width, parent.x + parent.width) - Math.max(child.x, parent.x));
		const y_overlap = Math.max(0, Math.min(child.y + child.height, parent.y + parent.height) - Math.max(child.y, parent.y));
		const intersection_area = x_overlap * y_overlap;

		// Calculate containment ratio
		const containment_ratio = intersection_area / child_area;

		return containment_ratio >= threshold;
	}

	private _is_propagating_element(node: EnhancedDOMTreeNode): boolean {
		const tag = node.tag_name?.toLowerCase();
		const role = node.attributes?.role?.toLowerCase();

		for (const config of PROPAGATING_ELEMENTS) {
			if (config.tag === tag) {
				if (config.role === null || config.role === undefined || config.role === role) {
					return true;
				}
			}
		}
		return false;
	}

	static serialize_tree(node: SimplifiedNode | null, include_attributes: string[], depth: number = 0): string {
		if (!node) {
			return '';
		}

		const formatted_text: string[] = [];
		const depth_str = '\t'.repeat(depth);
		let next_depth = depth;

		// Build the element representation
		if (node.original_node.node_type === NodeType.ELEMENT_NODE) {
			// Determine if element is scrollable
			const should_show_scroll = node.original_node.is_actually_scrollable;

			// Get text content for the element
			let text = '';
			if (node.original_node.ax_node?.name) {
				text = node.original_node.ax_node.name;
			} else if (node.original_node.ax_node?.description) {
				text = node.original_node.ax_node.description;
			} else {
				text = node.original_node.get_all_children_text() || '';
			}
			text = cap_text_length(text.trim(), 80);

			// Build attributes string
			let attributes_html_str = DOMTreeSerializer._build_attributes_string(
				node.original_node,
				include_attributes,
				text
			);

			// Add compound component information
			if (node.is_compound_component && node.original_node._compound_children.length > 0) {
				const compound_info: string[] = [];
				for (const child of node.original_node._compound_children) {
					let info = `${child.role}:${child.name}`;
					if (child.valuemin !== null && child.valuemin !== undefined) {
						info += `:${child.valuemin}-${child.valuemax}`;
					}
					compound_info.push(info);
				}

				if (compound_info.length > 0) {
					const compound_attr = `compound_components=${compound_info.join(',')}`;
					if (attributes_html_str) {
						attributes_html_str += ` ${compound_attr}`;
					} else {
						attributes_html_str = compound_attr;
					}
				}
			}

			// Build the line with shadow host indicator
			let shadow_prefix = '';
			if (node.is_shadow_host) {
				// Check if any shadow children are closed
				const has_closed_shadow = node.children.some(
					child => child.original_node.node_type === NodeType.DOCUMENT_FRAGMENT_NODE &&
					child.original_node.shadow_root_type?.toLowerCase() === 'closed'
				);
				shadow_prefix = has_closed_shadow ? '|SHADOW(closed)|' : '|SHADOW(open)|';
			}

			let line: string;
			if (should_show_scroll && node.interactive_index === null) {
				// Scrollable container but not clickable
				line = `${depth_str}${shadow_prefix}|SCROLL|<${node.original_node.tag_name}`;
			} else if (node.interactive_index !== null && node.interactive_index !== undefined) {
				// Clickable (and possibly scrollable)
				const new_prefix = node.is_new ? '*' : '';
				const scroll_prefix = should_show_scroll ? '|SCROLL+' : '[';
				line = `${depth_str}${shadow_prefix}${new_prefix}${scroll_prefix}${node.interactive_index}]<${node.original_node.tag_name}`;
			} else if (node.original_node.tag_name?.toUpperCase() === 'IFRAME') {
				// Iframe element (not interactive)
				line = `${depth_str}${shadow_prefix}|IFRAME|<${node.original_node.tag_name}`;
			} else if (node.original_node.tag_name?.toUpperCase() === 'FRAME') {
				// Frame element (not interactive)
				line = `${depth_str}${shadow_prefix}|FRAME|<${node.original_node.tag_name}`;
			} else {
				line = `${depth_str}${shadow_prefix}<${node.original_node.tag_name}`;
			}

			if (attributes_html_str) {
				line += ` ${attributes_html_str}`;
			}

			line += ' />';

			// Add scroll information only when we should show it
			if (should_show_scroll) {
				const scroll_info_text = node.original_node.get_scroll_info_text?.();
				if (scroll_info_text) {
					line += ` (${scroll_info_text})`;
				}
			}

			formatted_text.push(line);
		} else if (node.original_node.node_type === NodeType.DOCUMENT_FRAGMENT_NODE) {
			// Shadow DOM representation
			if (node.original_node.shadow_root_type?.toLowerCase() === 'closed') {
				formatted_text.push(`${depth_str}▼ Shadow Content (Closed)`);
			} else {
				formatted_text.push(`${depth_str}▼ Shadow Content (Open)`);
			}

			next_depth += 1;

			// Process shadow DOM children
			for (const child of node.children) {
				const child_text = DOMTreeSerializer.serialize_tree(child, include_attributes, next_depth);
				if (child_text) {
					formatted_text.push(child_text);
				}
			}

			// Close shadow DOM indicator
			if (node.children.length > 0) {
				formatted_text.push(`${depth_str}▲ Shadow Content End`);
			}
		} else if (node.original_node.node_type === NodeType.TEXT_NODE) {
			// Include visible text
			const is_visible = node.original_node.snapshot_node && node.original_node.is_visible;
			if (
				is_visible &&
				node.original_node.node_value &&
				node.original_node.node_value.trim() &&
				node.original_node.node_value.trim().length > 1
			) {
				const clean_text = node.original_node.node_value.trim();
				formatted_text.push(`${depth_str}${clean_text}`);
			}
		}

		// Process children (for non-shadow elements)
		if (node.original_node.node_type !== NodeType.DOCUMENT_FRAGMENT_NODE) {
			for (const child of node.children) {
				const child_text = DOMTreeSerializer.serialize_tree(child, include_attributes, next_depth);
				if (child_text) {
					formatted_text.push(child_text);
				}
			}
		}

		return formatted_text.join('\n');
	}

	static _build_attributes_string(node: EnhancedDOMTreeNode, include_attributes: string[], text: string): string {
		const attributes_to_include: Record<string, string> = {};

		// Include HTML attributes
		if (node.attributes) {
			for (const [key, value] of Object.entries(node.attributes)) {
				if (include_attributes.includes(key) && value && String(value).trim() !== '') {
					attributes_to_include[key] = String(value).trim();
				}
			}
		}

		// Include accessibility properties
		if (node.ax_node?.properties) {
			for (const prop of node.ax_node.properties) {
				try {
					if (include_attributes.includes(prop.name) && prop.value !== null && prop.value !== undefined) {
						// Convert boolean to lowercase string, keep others as-is
						if (typeof prop.value === 'boolean') {
							attributes_to_include[prop.name] = String(prop.value).toLowerCase();
						} else {
							const prop_value_str = String(prop.value).trim();
							if (prop_value_str) {
								attributes_to_include[prop.name] = prop_value_str;
							}
						}
					}
				} catch {
					continue;
				}
			}
		}

		if (Object.keys(attributes_to_include).length === 0) {
			return '';
		}

		// Remove duplicate values
		const ordered_keys = include_attributes.filter(key => key in attributes_to_include);

		if (ordered_keys.length > 1) {
			const keys_to_remove = new Set<string>();
			const seen_values: Record<string, string> = {};

			for (const key of ordered_keys) {
				const value = attributes_to_include[key];
				if (value.length > 5) {
					if (value in seen_values) {
						keys_to_remove.add(key);
					} else {
						seen_values[value] = key;
					}
				}
			}

			for (const key of keys_to_remove) {
				delete attributes_to_include[key];
			}
		}

		// Remove attributes that duplicate accessibility data
		const role = node.ax_node?.role;
		if (role && node.node_name === role) {
			delete attributes_to_include['role'];
		}

		const attrs_to_remove_if_text_matches = ['aria-label', 'placeholder', 'title'];
		for (const attr of attrs_to_remove_if_text_matches) {
			if (attributes_to_include[attr] &&
				attributes_to_include[attr].trim().toLowerCase() === text.trim().toLowerCase()) {
				delete attributes_to_include[attr];
			}
		}

		if (Object.keys(attributes_to_include).length > 0) {
			return Object.entries(attributes_to_include)
				.map(([key, value]) => `${key}=${cap_text_length(value, 100)}`)
				.join(' ');
		}

		return '';
	}
}
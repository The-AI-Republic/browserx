import {
	EnhancedDOMTreeNode,
	NodeType,
	DOMRect,
	EnhancedAXNode,
	EnhancedSnapshotNode,
	DISABLED_ELEMENTS,
	ShadowRootType
} from './views';
import { cap_text_length } from './utils';

/**
 * Implementation of EnhancedDOMTreeNode with computed properties
 * This class provides all the computed properties and methods from the Python version
 */
export class EnhancedDOMTreeNodeImpl implements EnhancedDOMTreeNode {
	// Core properties
	node_id!: number;
	backend_node_id!: number;
	node_type!: NodeType;
	node_name!: string;
	node_value!: string;
	attributes!: { [key: string]: string };
	is_scrollable!: boolean | null;
	is_visible!: boolean | null;
	absolute_position!: DOMRect | null;

	// Frame properties
	target_id!: string;
	frame_id!: string | null;
	session_id!: string | null;
	content_document!: EnhancedDOMTreeNode | null;

	// Shadow DOM
	shadow_root_type!: ShadowRootType | null;
	shadow_roots!: EnhancedDOMTreeNode[] | null;

	// Navigation
	parent_node!: EnhancedDOMTreeNode | null;
	children_nodes!: EnhancedDOMTreeNode[] | null;

	// Enhanced data
	ax_node!: EnhancedAXNode | null;
	snapshot_node!: EnhancedSnapshotNode | null;
	element_index!: number | null;
	_compound_children!: any[];
	uuid!: string;

	constructor(data: EnhancedDOMTreeNode) {
		Object.assign(this, data);
	}

	/**
	 * Get parent node (computed property)
	 */
	get parent(): EnhancedDOMTreeNode | null {
		return this.parent_node;
	}

	/**
	 * Get children nodes (computed property)
	 */
	get children(): EnhancedDOMTreeNode[] {
		return this.children_nodes || [];
	}

	/**
	 * Get children and shadow roots combined
	 */
	get children_and_shadow_roots(): EnhancedDOMTreeNode[] {
		const result: EnhancedDOMTreeNode[] = [];

		if (this.children_nodes) {
			result.push(...this.children_nodes);
		}

		if (this.shadow_roots) {
			result.push(...this.shadow_roots);
		}

		return result;
	}

	/**
	 * Get tag name from node name
	 */
	get tag_name(): string {
		if (this.node_type === NodeType.ELEMENT_NODE) {
			return this.node_name.toLowerCase();
		}
		return this.node_name;
	}

	/**
	 * Generate XPath for this element
	 */
	get xpath(): string {
		const path_parts: string[] = [];
		let current: EnhancedDOMTreeNode | null = this as EnhancedDOMTreeNode;

		while (current && current.node_type === NodeType.ELEMENT_NODE) {
			const tag = current.node_name.toLowerCase();

			// Handle shadow root boundaries
			if (current.parent_node?.shadow_roots?.includes(current)) {
				path_parts.unshift('shadow-root');
				current = current.parent_node;
				continue;
			}

			// Calculate position among siblings with same tag
			let position = 1;
			if (current.parent_node) {
				const siblings = current.parent_node.children_nodes || [];
				for (const sibling of siblings) {
					if (sibling === current) {
						break;
					}
					if (sibling.node_name.toLowerCase() === tag) {
						position++;
					}
				}
			}

			// Add to path
			path_parts.unshift(`${tag}[${position}]`);
			current = current.parent_node;
		}

		return '//' + path_parts.join('/');
	}

	/**
	 * Check if element is actually scrollable
	 */
	get is_actually_scrollable(): boolean {
		// Step 1: Basic scrollability check
		if (!this.is_scrollable) {
			return false;
		}

		// Step 2: Check if element has actual scrollable content
		if (this.snapshot_node?.bounds) {
			const bounds = this.snapshot_node.bounds;
			const hasScrollableContent = bounds.width > 0 && bounds.height > 0;
			if (!hasScrollableContent) {
				return false;
			}
		}

		// Step 3: Check computed styles for overflow
		if (this.snapshot_node?.computed_styles) {
			const styles = this.snapshot_node.computed_styles;
			const overflow = styles['overflow'] || 'visible';
			const overflowX = styles['overflow-x'] || overflow;
			const overflowY = styles['overflow-y'] || overflow;

			const canScroll = (
				overflowX === 'auto' || overflowX === 'scroll' ||
				overflowY === 'auto' || overflowY === 'scroll'
			);

			if (!canScroll) {
				return false;
			}
		}

		// Step 4: Conservative approach for divs and sections
		const tag = this.tag_name;
		if (tag === 'div' || tag === 'section') {
			// Check if it has meaningful content
			const text = this.get_all_children_text(3);
			if (!text || text.length < 100) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Whether to show scroll info for this element
	 */
	get should_show_scroll_info(): boolean {
		return this.is_actually_scrollable && this.tag_name !== 'select';
	}

	/**
	 * Get scroll information
	 */
	get scroll_info(): { [key: string]: any } | null {
		if (!this.should_show_scroll_info) {
			return null;
		}

		// This would need actual scroll position data from runtime
		// For now, return placeholder
		return {
			scrollable: true,
			scrollTop: 0,
			scrollLeft: 0,
			scrollWidth: 0,
			scrollHeight: 0
		};
	}

	/**
	 * Generate element hash
	 */
	get element_hash(): number {
		let hash_value = 0;

		// Hash tag name
		const tag = this.tag_name;
		for (let i = 0; i < tag.length; i++) {
			hash_value = ((hash_value << 5) - hash_value) + tag.charCodeAt(i);
			hash_value |= 0; // Convert to 32bit integer
		}

		// Hash important attributes
		const important_attrs = ['id', 'class', 'name', 'type', 'role'];
		for (const attr of important_attrs) {
			if (this.attributes[attr]) {
				const value = this.attributes[attr];
				for (let i = 0; i < value.length; i++) {
					hash_value = ((hash_value << 5) - hash_value) + value.charCodeAt(i);
					hash_value |= 0;
				}
			}
		}

		// Include text content in hash
		const text = this.get_meaningful_text_for_llm();
		if (text) {
			for (let i = 0; i < Math.min(text.length, 50); i++) {
				hash_value = ((hash_value << 5) - hash_value) + text.charCodeAt(i);
				hash_value |= 0;
			}
		}

		return Math.abs(hash_value);
	}

	/**
	 * Get element position in parent's children
	 */
	_get_element_position(element: EnhancedDOMTreeNode): number {
		if (!this.children_nodes) {
			return -1;
		}

		for (let i = 0; i < this.children_nodes.length; i++) {
			if (this.children_nodes[i] === element) {
				return i;
			}
		}

		return -1;
	}

	/**
	 * Convert to JSON representation
	 */
	__json__(): object {
		const json: any = {
			node_id: this.node_id,
			backend_node_id: this.backend_node_id,
			node_type: this.node_type,
			node_name: this.node_name,
			node_value: this.node_value,
			attributes: this.attributes,
			tag_name: this.tag_name,
			xpath: this.xpath
		};

		if (this.is_scrollable !== null) {
			json.is_scrollable = this.is_scrollable;
		}

		if (this.is_visible !== null) {
			json.is_visible = this.is_visible;
		}

		if (this.absolute_position) {
			json.absolute_position = this.absolute_position;
		}

		if (this.element_index !== null) {
			json.element_index = this.element_index;
		}

		if (this.ax_node) {
			json.ax_node = this.ax_node;
		}

		if (this.snapshot_node) {
			json.snapshot_node = this.snapshot_node;
		}

		return json;
	}

	/**
	 * Get all text content from children
	 */
	get_all_children_text(max_depth: number = -1): string {
		if (max_depth === 0) {
			return '';
		}

		const text_parts: string[] = [];

		// Add text from this node
		if (this.node_type === NodeType.TEXT_NODE) {
			const text = this.node_value?.trim();
			if (text) {
				text_parts.push(text);
			}
		}

		// Add text from children
		if (this.children_nodes) {
			for (const child of this.children_nodes) {
				if (child instanceof EnhancedDOMTreeNodeImpl) {
					const child_text = child.get_all_children_text(max_depth - 1);
					if (child_text) {
						text_parts.push(child_text);
					}
				}
			}
		}

		// Add text from shadow roots
		if (this.shadow_roots) {
			for (const shadow of this.shadow_roots) {
				if (shadow instanceof EnhancedDOMTreeNodeImpl) {
					const shadow_text = shadow.get_all_children_text(max_depth - 1);
					if (shadow_text) {
						text_parts.push(shadow_text);
					}
				}
			}
		}

		return text_parts.join(' ').trim();
	}

	/**
	 * Get LLM-friendly representation of the element
	 */
	llm_representation(max_text_length: number = 100): string {
		const parts: string[] = [];

		// Add element index if available
		if (this.element_index !== null) {
			parts.push(`[${this.element_index}]`);
		}

		// Add tag name
		parts.push(`<${this.tag_name}`);

		// Add important attributes
		const important_attrs = ['id', 'class', 'role', 'type', 'name', 'placeholder', 'aria-label'];
		for (const attr of important_attrs) {
			if (this.attributes[attr]) {
				const value = cap_text_length(this.attributes[attr], 50);
				parts.push(`${attr}="${value}"`);
			}
		}

		// Close tag
		parts.push('>');

		// Add text content
		const text = this.get_meaningful_text_for_llm();
		if (text) {
			parts.push(cap_text_length(text, max_text_length));
		}

		// Add scroll info if applicable
		if (this.should_show_scroll_info) {
			parts.push('[scrollable]');
		}

		return parts.join(' ');
	}

	/**
	 * Get meaningful text content for LLM
	 */
	get_meaningful_text_for_llm(): string {
		// Check for value attribute (inputs)
		if (this.attributes['value']) {
			return this.attributes['value'];
		}

		// Check for aria-label
		if (this.attributes['aria-label']) {
			return this.attributes['aria-label'];
		}

		// Check for placeholder
		if (this.attributes['placeholder']) {
			return this.attributes['placeholder'];
		}

		// Get text from accessibility node
		if (this.ax_node?.name) {
			return this.ax_node.name;
		}

		// Get text content from children
		const text = this.get_all_children_text(2);
		if (text) {
			return text;
		}

		// Check for title attribute
		if (this.attributes['title']) {
			return this.attributes['title'];
		}

		return '';
	}

	/**
	 * Find HTML element in content document (for iframes)
	 */
	_find_html_in_content_document(): EnhancedDOMTreeNode | null {
		if (!this.content_document) {
			return null;
		}

		// Look for HTML element in content document
		if (this.content_document.node_name === 'HTML') {
			return this.content_document;
		}

		// Search in children
		if (this.content_document.children_nodes) {
			for (const child of this.content_document.children_nodes) {
				if (child.node_name === 'HTML') {
					return child;
				}
			}
		}

		return null;
	}

	/**
	 * Get scroll info as text
	 */
	get_scroll_info_text(): string {
		if (!this.scroll_info) {
			return '';
		}

		const parts: string[] = ['scrollable'];

		if (this.scroll_info.scrollTop > 0) {
			parts.push(`scrolled_down: ${this.scroll_info.scrollTop}px`);
		}

		if (this.scroll_info.scrollLeft > 0) {
			parts.push(`scrolled_right: ${this.scroll_info.scrollLeft}px`);
		}

		return `[${parts.join(', ')}]`;
	}

	/**
	 * Generate hash for parent branch
	 */
	parent_branch_hash(): number {
		const path = this._get_parent_branch_path();
		let hash_value = 0;

		for (const element of path) {
			for (let i = 0; i < element.length; i++) {
				hash_value = ((hash_value << 5) - hash_value) + element.charCodeAt(i);
				hash_value |= 0;
			}
		}

		return Math.abs(hash_value);
	}

	/**
	 * Get parent branch path
	 */
	_get_parent_branch_path(): string[] {
		const path: string[] = [];
		let current: EnhancedDOMTreeNode | null = this as EnhancedDOMTreeNode;

		while (current) {
			// Add tag name
			path.unshift(current.node_name.toLowerCase());

			// Add ID if present
			if (current.attributes && current.attributes['id']) {
				path[0] += `#${current.attributes['id']}`;
			}

			// Add class if present
			if (current.attributes && current.attributes['class']) {
				const classes = current.attributes['class'].split(' ').slice(0, 2);
				path[0] += `.${classes.join('.')}`;
			}

			current = current.parent_node;
		}

		return path;
	}

	/**
	 * Static method to create from plain object
	 */
	static from(data: EnhancedDOMTreeNode): EnhancedDOMTreeNodeImpl {
		const node = new EnhancedDOMTreeNodeImpl(data);

		// Recursively convert children (top-down traversal only)
		if (data.children_nodes) {
			node.children_nodes = data.children_nodes.map(child =>
				child instanceof EnhancedDOMTreeNodeImpl ? child : EnhancedDOMTreeNodeImpl.from(child)
			);
		}

		// Convert shadow roots
		if (data.shadow_roots) {
			node.shadow_roots = data.shadow_roots.map(shadow =>
				shadow instanceof EnhancedDOMTreeNodeImpl ? shadow : EnhancedDOMTreeNodeImpl.from(shadow)
			);
		}

		// Convert content document
		if (data.content_document) {
			node.content_document = data.content_document instanceof EnhancedDOMTreeNodeImpl
				? data.content_document
				: EnhancedDOMTreeNodeImpl.from(data.content_document);
		}

		// DON'T convert parent - this causes stack overflow with circular references!
		// Just keep the reference as-is from the original tree
		node.parent_node = data.parent_node;

		return node;
	}
}
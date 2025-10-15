import { describe, it, expect } from 'vitest';
import { DOMTreeSerializer } from '../../../../src/tools/dom/serializer/serializer';
import { NodeType } from '../../../../src/tools/dom/views';

describe('DOMTreeSerializer constructor', () => {
	const createMockNode = () => ({
		node_id: 1,
		backend_node_id: 1,
		node_type: NodeType.ELEMENT_NODE,
		node_name: 'DIV',
		node_value: '',
		attributes: {},
		is_scrollable: false,
		is_visible: true,
		absolute_position: { x: 0, y: 0, width: 100, height: 100 },
		target_id: 'main',
		frame_id: null,
		session_id: null,
		content_document: null,
		shadow_root_type: null,
		shadow_roots: null,
		parent_node: null,
		children_nodes: [],
		ax_node: null,
		snapshot_node: null,
		element_index: null,
		_compound_children: [],
		uuid: crypto.randomUUID(),
		// Add computed property required by serializer
		get children_and_shadow_roots() {
			const result: any[] = [];
			if (this.children_nodes) result.push(...this.children_nodes);
			if (this.shadow_roots) result.push(...this.shadow_roots);
			return result;
		}
	});

	it('should throw TypeError when root_node is missing', () => {
		expect(() => new DOMTreeSerializer(null as any)).toThrow(TypeError);
	});

	it('should accept all constructor parameters', () => {
		const node = createMockNode();
		const previousState = { _root: null, selector_map: {} };

		const serializer = new DOMTreeSerializer(
			node,
			previousState,
			false,
			0.95,
			false
		);

		expect(serializer).toBeDefined();
	});

	it('should use default parameters when omitted', () => {
		const node = createMockNode();
		const serializer = new DOMTreeSerializer(node);

		expect(serializer).toBeDefined();
		// Defaults are: enable_bbox_filtering=true, containment_threshold=null, paint_order_filtering=true
	});
});

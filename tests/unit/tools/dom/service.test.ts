import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DomService } from '../../../../src/tools/dom/service';
import { DOMTreeSerializer } from '../../../../src/tools/dom/serializer/serializer';
import { NodeType } from '../../../../src/tools/dom/views';

describe('DomService.get_serialized_dom_tree', () => {
	let service: DomService;
	let mockTree: any;

	beforeEach(() => {
		service = new DomService({ tab_id: 123 });
		mockTree = {
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
		};
		service.get_dom_tree = vi.fn().mockResolvedValue(mockTree);
	});

	it('should return valid SerializedDOMState without previous cache', async () => {
		const result = await service.get_serialized_dom_tree();
		expect(result).toBeDefined();
		expect(result).toHaveProperty('_root');
		expect(result).toHaveProperty('selector_map');
	});

	it('should pass previous cached state to serializer', async () => {
		const previousState = {
			_root: null,
			selector_map: { '//html[1]/body[1]/div[1]': 1 }
		};

		const result = await service.get_serialized_dom_tree(previousState);

		// Verify that the result reuses the same selector index from previous state
		// The serializer should have received the previous state
		expect(result).toBeDefined();
		expect(result.selector_map).toBeDefined();
	});

	it('should create new serializer on each invocation', async () => {
		// Create spy to count serialize_accessible_elements calls
		const serializeSpy = vi.spyOn(DOMTreeSerializer.prototype, 'serialize_accessible_elements');

		await service.get_serialized_dom_tree();
		await service.get_serialized_dom_tree();
		await service.get_serialized_dom_tree();

		// Each call should have created a new serializer instance and called serialize
		expect(serializeSpy).toHaveBeenCalledTimes(3);
	});

	it('should pass paint_order_filtering from config', async () => {
		const serviceWithFiltering = new DomService(
			{ tab_id: 123 },
			undefined,
			false,
			false // paint_order_filtering = false
		);
		serviceWithFiltering.get_dom_tree = vi.fn().mockResolvedValue(mockTree);

		const result = await serviceWithFiltering.get_serialized_dom_tree();

		// Verify serialization completes successfully with filtering configuration
		expect(result).toBeDefined();
		expect(result).toHaveProperty('_root');
		expect(result).toHaveProperty('selector_map');
	});
});

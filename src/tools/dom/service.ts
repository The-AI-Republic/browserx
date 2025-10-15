import type {
	CurrentPageTargets,
	TargetAllTrees,
	EnhancedAXNode,
	EnhancedDOMTreeNode,
	SerializedDOMState,
	TargetInfo,
	ContentScriptCaptureReturns,
	GetDocumentReturns,
	GetFullAXTreeReturns,
	AXNode,
	NodeType,
	DOMRect,
	EnhancedSnapshotNode,
	NodeTreeSnapshot,
	CapturedNode
} from './views';
import { DOMTreeSerializer } from './serializer/serializer';
import { build_snapshot_lookup } from './enhancedSnapshot';
import { MessageType } from '../../core/MessageRouter';
import { EnhancedDOMTreeNodeImpl } from './enhancedDOMTreeNode';
import type { CaptureRequest, PageModel } from './pageModel.js';

/**
 * DOM Service error codes
 */
export enum DOMServiceErrorCode {
	TAB_NOT_FOUND = 'TAB_NOT_FOUND',
	CONTENT_SCRIPT_NOT_LOADED = 'CONTENT_SCRIPT_NOT_LOADED',
	TIMEOUT = 'TIMEOUT',
	PERMISSION_DENIED = 'PERMISSION_DENIED',
	INVALID_RESPONSE = 'INVALID_RESPONSE',
	UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

/**
 * DOM Service error
 */
export class DOMServiceError extends Error {
	constructor(
		public code: DOMServiceErrorCode,
		message: string,
		public details?: any
	) {
		super(message);
		this.name = 'DOMServiceError';
	}
}

// Browser session interface - to be provided by host extension
interface BrowserSession {
	tab_id?: number;
	frame_id?: string;
	// Add other properties as needed
}

// Logger interface
interface Logger {
	log(message: string): void;
	error(message: string): void;
	warn(message: string): void;
}

export class DomService {
	private browser_session: BrowserSession;
	private logger?: Logger;
	private cross_origin_iframes: boolean;
	private paint_order_filtering: boolean;
	private max_iframes: number;
	private max_iframe_depth: number;

	constructor(
		browser_session: BrowserSession,
		logger?: Logger,
		cross_origin_iframes: boolean = false,
		paint_order_filtering: boolean = true,
		max_iframes: number = 15,
		max_iframe_depth: number = 3
	) {
		this.browser_session = browser_session;
		this.logger = logger;
		this.cross_origin_iframes = cross_origin_iframes;
		this.paint_order_filtering = paint_order_filtering;
		this.max_iframes = max_iframes;
		this.max_iframe_depth = max_iframe_depth;
	}

	/**
	 * Get targets for the current page - replaces CDP Target.getTargets()
	 * Uses chrome.tabs and chrome.webNavigation APIs
	 */
	async _get_targets_for_page(target_id: string): Promise<CurrentPageTargets> {
		// Get main tab info
		const tab_id = this.browser_session.tab_id;
		if (!tab_id) {
			throw new DOMServiceError(
				DOMServiceErrorCode.TAB_NOT_FOUND,
				'Tab ID is required to get targets',
				{ target_id }
			);
		}

		try {
			// Get main tab information
			const tab = await chrome.tabs.get(tab_id);

			const page_session: TargetInfo = {
				targetId: target_id,
				type: 'page',
				title: tab.title || '',
				url: tab.url || '',
				attached: true
			};

			// Get all frames in the tab
			const iframe_sessions: TargetInfo[] = [];

			try {
				const frames = await chrome.webNavigation.getAllFrames({ tabId: tab_id });

				if (frames) {
					// Filter out main frame (frameId === 0)
					const iframes = frames.filter(frame => frame.frameId !== 0);

					for (const frame of iframes) {
						iframe_sessions.push({
							targetId: `frame-${frame.frameId}`,
							type: 'iframe',
							title: '',
							url: frame.url,
							attached: true
						});
					}
				}
			} catch (frameError) {
				// webNavigation permission might not be available
				this.logger?.warn('Failed to get frames: ' + (frameError as Error).message);
			}

			return {
				page_session,
				iframe_sessions
			};
		} catch (error) {
			this.logger?.error('Failed to get targets for page: ' + (error as Error).message);

			// Check if it's a permission error
			if ((error as Error).message.includes('permission')) {
				throw new DOMServiceError(
					DOMServiceErrorCode.PERMISSION_DENIED,
					`Permission denied to access tab ${tab_id}`,
					{ tab_id, original_error: (error as Error).message }
				);
			}

			throw new DOMServiceError(
				DOMServiceErrorCode.TAB_NOT_FOUND,
				`Tab ${tab_id} not found or not accessible`,
				{ tab_id, original_error: (error as Error).message }
			);
		}
	}

	/**
	 * Build enhanced accessibility node from CDP AX node
	 */
	_build_enhanced_ax_node(ax_node: AXNode): EnhancedAXNode {
		const enhanced: EnhancedAXNode = {
			ax_node_id: ax_node.nodeId,
			ignored: ax_node.ignored || false,
			role: ax_node.role?.value || null,
			name: ax_node.name?.value || null,
			description: ax_node.description?.value || null,
			properties: null,
			child_ids: ax_node.childIds || null
		};

		// Process properties
		if (ax_node.properties && ax_node.properties.length > 0) {
			enhanced.properties = ax_node.properties.map(prop => ({
				name: prop.name,
				value: prop.value?.value || null
			}));
		}

		return enhanced;
	}

	/**
	 * Get viewport ratio
	 * Uses content script to get devicePixelRatio
	 */
	async _get_viewport_ratio(target_id: string): Promise<number> {
		const tab_id = this.browser_session.tab_id;
		if (!tab_id) {
			this.logger?.warn('No tab ID, returning default devicePixelRatio');
			return 1;
		}

		try {
			// Send message to content script to get viewport info
			const response = await chrome.tabs.sendMessage(tab_id, {
				type: 'GET_VIEWPORT_INFO'
			});

			if (response && response.devicePixelRatio) {
				return response.devicePixelRatio;
			}

			// Fallback to default
			return 1;
		} catch (error) {
			this.logger?.warn('Failed to get viewport ratio from content script: ' + (error as Error).message);
			// Return default value
			return 1;
		}
	}

	/**
	 * Check if element is visible according to all parent elements
	 */
	is_element_visible_according_to_all_parents(
		node: EnhancedDOMTreeNode,
		html_frames: Map<string, any>
	): boolean {
		// Check if element itself is visible
		if (node.is_visible === false) {
			return false;
		}

		// Check computed styles for visibility
		if (node.snapshot_node?.computed_styles) {
			const styles = node.snapshot_node.computed_styles;

			// Check display
			if (styles['display'] === 'none') {
				return false;
			}

			// Check visibility
			if (styles['visibility'] === 'hidden' || styles['visibility'] === 'collapse') {
				return false;
			}

			// Check opacity
			const opacity = parseFloat(styles['opacity'] || '1');
			if (opacity === 0) {
				return false;
			}
		}

		// Check parent visibility recursively
		if (node.parent_node) {
			return this.is_element_visible_according_to_all_parents(node.parent_node, html_frames);
		}

		// Check if in iframe that might be hidden
		if (node.frame_id && html_frames.has(node.frame_id)) {
			const frame_info = html_frames.get(node.frame_id);
			if (frame_info && frame_info.is_visible === false) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Get accessibility tree for all frames - replaces CDP Accessibility.getFullAXTree()
	 * Uses ARIA fallback since chrome.accessibility API not available for web content
	 */
	async _get_ax_tree_for_all_frames(target_id: string): Promise<Map<string, any>> {
		const ax_trees = new Map<string, any>();

		// Since we can't access the full Accessibility API in Chrome extensions,
		// we rely on ARIA attributes extracted during DOM capture
		// The ARIA information is already included in the snapshot from content script

		// Main frame - will be populated from snapshot data
		ax_trees.set(target_id, { nodes: [] });

		// Get iframe accessibility trees if enabled
		if (this.cross_origin_iframes) {
			// ARIA data for iframes will also come from snapshot
			// Cross-origin iframes won't have ARIA data due to security restrictions
			this.logger?.warn('Cross-origin iframe ARIA data may be incomplete');
		}

		// Note: Actual ARIA nodes will be attached during _convert_to_enhanced_tree
		// when we process the snapshot data from the content script

		return ax_trees;
	}

	/**
	 * Get all trees (DOM, AX, snapshot) for a target
	 * Delegates to content script for DOM traversal and snapshot capture
	 */
	async _get_all_trees(target_id: string): Promise<TargetAllTrees> {
		const start_time = Date.now();
		const dom_tool_timing: { [key: string]: number } = {};

		const tab_id = this.browser_session.tab_id;
		if (!tab_id) {
			throw new DOMServiceError(
				DOMServiceErrorCode.TAB_NOT_FOUND,
				'Tab ID is required to get DOM trees',
				{ target_id }
			);
		}

		// Get device pixel ratio
		const device_pixel_ratio = await this._get_viewport_ratio(target_id);
		dom_tool_timing['viewport_ratio'] = Date.now() - start_time;

		// Request DOM capture from content script
		const snapshot_start = Date.now();

		try {
			// Send message to content script to capture DOM using MessageRouter format
			// IMPORTANT: Send only to main frame (frameId: 0) to avoid multiple responses from iframes
			const requestId = `dom_capture_${tab_id}_${Date.now()}`;
			const response = await chrome.tabs.sendMessage(
				tab_id,
				{
					type: MessageType.DOM_CAPTURE_REQUEST,
					payload: {
						type: 'DOM_CAPTURE_REQUEST',
						request_id: requestId,
						tab_id: tab_id,
						options: {
							include_shadow_dom: true,
							include_iframes: true,
							max_iframe_depth: this.max_iframe_depth,
							max_iframe_count: this.max_iframes,
							bbox_filtering: true
						}
					},
					timestamp: Date.now()
				},
				{ frameId: 0 }  // Send only to main frame
			);

			// Response comes in MessageRouter format: { success: boolean, data: DOMCaptureResponseMessage }
			if (!response || !response.success || !response.data) {
				throw new DOMServiceError(
					DOMServiceErrorCode.INVALID_RESPONSE,
					'Invalid response from content script',
					{ tab_id, response }
				);
			}

			const captureResponse = response.data;

			if (!captureResponse.success || !captureResponse.snapshot) {
				throw new DOMServiceError(
					DOMServiceErrorCode.INVALID_RESPONSE,
					captureResponse.error?.message || 'Content script returned error',
					{ tab_id, error: captureResponse.error }
				);
			}

			const snapshot: ContentScriptCaptureReturns = captureResponse.snapshot;
			dom_tool_timing['snapshot'] = Date.now() - snapshot_start;

			// Build DOM tree from snapshot
			const dom_tree_start = Date.now();
			const dom_tree = this._build_dom_tree_from_snapshot(snapshot);
			dom_tool_timing['dom_tree'] = Date.now() - dom_tree_start;

			// Build AX tree from snapshot (ARIA data included)
			const ax_tree_start = Date.now();
			const ax_tree = this._build_ax_tree_from_snapshot(snapshot);
			dom_tool_timing['ax_tree'] = Date.now() - ax_tree_start;

			return {
				snapshot,
				dom_tree,
				ax_tree,
				device_pixel_ratio,
				dom_tool_timing
			};
		} catch (error) {
			this.logger?.error('Failed to get DOM trees: ' + (error as Error).message);

			const errorMessage = (error as Error).message.toLowerCase();

			// Check if error is due to content script not loaded
			if (errorMessage.includes('could not establish connection') ||
			    errorMessage.includes('receiving end does not exist')) {
				throw new DOMServiceError(
					DOMServiceErrorCode.CONTENT_SCRIPT_NOT_LOADED,
					'Content script not injected in tab',
					{ tab_id, original_error: (error as Error).message }
				);
			}

			// Check for timeout
			if (errorMessage.includes('timeout')) {
				throw new DOMServiceError(
					DOMServiceErrorCode.TIMEOUT,
					'DOM capture timed out',
					{ tab_id, original_error: (error as Error).message }
				);
			}

			// Check for permission errors
			if (errorMessage.includes('permission')) {
				throw new DOMServiceError(
					DOMServiceErrorCode.PERMISSION_DENIED,
					'Permission denied to access tab',
					{ tab_id, original_error: (error as Error).message }
				);
			}

			// Generic error
			throw new DOMServiceError(
				DOMServiceErrorCode.UNKNOWN_ERROR,
				'Failed to capture DOM',
				{ tab_id, original_error: (error as Error).message }
			);
		}
	}

	/**
	 * Build GetDocumentReturns from snapshot data
	 */
	private _build_dom_tree_from_snapshot(snapshot: ContentScriptCaptureReturns): GetDocumentReturns {
		// Get main document from snapshot
		const mainDoc = snapshot.documents[0];

		if (!mainDoc || !mainDoc.nodes) {
			// Return minimal document node
			return {
				root: {
					nodeId: 1,
					backendNodeId: 1,
					nodeType: NodeType.DOCUMENT_NODE,
					nodeName: '#document',
					nodeValue: ''
				}
			};
		}

		// Build DOM tree from snapshot nodes
		const root = this._build_node_tree(mainDoc.nodes, 0, snapshot.strings);

		return { root };
	}

	/**
	 * Build node tree from snapshot nodes
	 */
	private _build_node_tree(
		nodes: CapturedNode[],
		nodeIndex: number,
		strings: string[]
	): any {
		const node = nodes[nodeIndex];

		if (!node) {
			return {
				nodeId: 1,
				backendNodeId: 1,
				nodeType: NodeType.DOCUMENT_NODE,
				nodeName: '#document',
				nodeValue: ''
			};
		}

		// Restore string values from string pool
		const nodeName = typeof node.nodeName === 'number'
			? strings[node.nodeName]
			: node.nodeName;

		const builtNode: any = {
			nodeId: nodeIndex + 1,
			backendNodeId: node.backendNodeId || nodeIndex + 1,
			nodeType: node.nodeType,
			nodeName: nodeName,
			nodeValue: node.nodeValue || '',
			attributes: []
		};

		// Convert attributes object to array format
		if (node.attributes) {
			for (const [key, value] of Object.entries(node.attributes)) {
				// Restore string values
				const attrKey = typeof key === 'number' ? strings[key as any] : key;
				const attrValue = typeof value === 'number' ? strings[value as any] : value;
				builtNode.attributes.push(attrKey, attrValue);
			}
		}

		// Build children recursively
		if (node.childIndices && node.childIndices.length > 0) {
			builtNode.children = node.childIndices.map((childIndex: number) =>
				this._build_node_tree(nodes, childIndex, strings)
			);
		}

		return builtNode;
	}

	/**
	 * Build GetFullAXTreeReturns from snapshot data
	 */
	private _build_ax_tree_from_snapshot(snapshot: ContentScriptCaptureReturns): GetFullAXTreeReturns {
		const axNodes: AXNode[] = [];

		// Extract AX nodes from all documents in snapshot
		for (const doc of snapshot.documents) {
			if (!doc.nodes) continue;

			for (const node of doc.nodes) {
				// Only process nodes with ARIA data
				if (node.axNode) {
					axNodes.push({
						nodeId: node.axNode.ax_node_id,
						ignored: node.axNode.ignored,
						role: node.axNode.role ? { value: node.axNode.role } : undefined,
						name: node.axNode.name ? { value: node.axNode.name } : undefined,
						description: node.axNode.description ? { value: node.axNode.description } : undefined,
						properties: node.axNode.properties || undefined,
						childIds: node.axNode.child_ids || undefined,
						backendDOMNodeId: node.backendNodeId
					});
				}
			}
		}

		return { nodes: axNodes };
	}

	/**
	 * Get enhanced DOM tree with all metadata
	 */
	async get_dom_tree(
		target_id: string,
		initial_html_frames?: Map<string, any>,
		initial_total_frame_offset?: { x: number; y: number },
		iframe_depth: number = 0
	): Promise<EnhancedDOMTreeNode> {
		// Check iframe depth limit
		if (iframe_depth > this.max_iframe_depth) {
			this.logger?.warn(`Reached max iframe depth: ${this.max_iframe_depth}`);
			// Return minimal node
			return {
				node_id: -1,
				backend_node_id: -1,
				node_type: NodeType.ELEMENT_NODE,
				node_name: 'IFRAME_DEPTH_LIMIT',
				node_value: '',
				attributes: {},
				is_scrollable: null,
				is_visible: null,
				absolute_position: null,
				target_id: target_id,
				frame_id: null,
				session_id: null,
				content_document: null,
				shadow_root_type: null,
				shadow_roots: null,
				parent_node: null,
				children_nodes: null,
				ax_node: null,
				snapshot_node: null,
				element_index: null,
				_compound_children: [],
				uuid: crypto.randomUUID()
			};
		}

		// Get all trees for this target
		const all_trees = await this._get_all_trees(target_id);

		// Build snapshot lookup
		const snapshot_lookup = build_snapshot_lookup(
			all_trees.snapshot,
			all_trees.device_pixel_ratio
		);

		// Build AX tree lookup
		const ax_tree_map = new Map<number, EnhancedAXNode>();
		if (all_trees.ax_tree.nodes) {
			for (const ax_node of all_trees.ax_tree.nodes) {
				const enhanced = this._build_enhanced_ax_node(ax_node);
				if (ax_node.backendDOMNodeId) {
					ax_tree_map.set(ax_node.backendDOMNodeId, enhanced);
				}
			}
		}

		// Convert DOM tree to enhanced tree
		const enhanced_tree = this._convert_to_enhanced_tree(
			all_trees.dom_tree.root,
			null, // parent
			ax_tree_map,
			snapshot_lookup,
			target_id,
			initial_html_frames || new Map(),
			initial_total_frame_offset || { x: 0, y: 0 },
			iframe_depth
		);

		return enhanced_tree;
	}

	/**
	 * Get serialized DOM tree for LLM consumption
	 */
	async get_serialized_dom_tree(
		previous_cached_state?: SerializedDOMState
	): Promise<SerializedDOMState> {
		// Get the main page target ID
		// TODO: Get actual target ID from browser session
		const target_id = 'main';

		// Get the full DOM tree
		const dom_tree = await this.get_dom_tree(target_id);

		// Convert plain object to EnhancedDOMTreeNodeImpl to get computed properties
		const dom_tree_impl = EnhancedDOMTreeNodeImpl.from(dom_tree);

		// CORRECT: Create serializer with all required parameters
		const serializer = new DOMTreeSerializer(
			dom_tree_impl,                   // root_node (REQUIRED) - now with computed properties
			previous_cached_state || null,   // previous state for caching
			true,                            // enable_bbox_filtering
			null,                            // containment_threshold (use default)
			this.paint_order_filtering       // from service config
		);

		// Call instance method (returns tuple)
		const [serialized, timing] = serializer.serialize_accessible_elements();

		return serialized;
	}

	/**
	 * Capture interaction content from current page
	 *
	 * Feature: 038-implement-captureinteractioncontent-request
	 *
	 * @param options - Capture configuration options
	 * @returns PageModel with interactive elements
	 */
	async captureInteractionContent(options: CaptureRequest = {}): Promise<PageModel> {
		const tab_id = this.browser_session.tab_id;
		if (!tab_id) {
			throw new DOMServiceError(
				DOMServiceErrorCode.TAB_NOT_FOUND,
				'Tab ID is required to capture interaction content',
				{}
			);
		}

		try {
			// Get current URL as baseUrl if not provided
			const tab = await chrome.tabs.get(tab_id);
			const baseUrl = options.baseUrl || tab.url;

			// Call captureInteractionContent in the content script
			// This avoids DOMParser issues since content script has full DOM access
			const response = await chrome.tabs.sendMessage(
				tab_id,
				{
					type: MessageType.TAB_COMMAND,
					payload: {
						command: 'capture-interaction-content',
						args: {
							...options,
							baseUrl
						}
					},
					timestamp: Date.now()
				},
				{ frameId: 0 }
			);

			// Response comes in MessageRouter format: { success: boolean, data: PageModel }
			if (!response || !response.success || !response.data) {
				throw new DOMServiceError(
					DOMServiceErrorCode.INVALID_RESPONSE,
					'Failed to capture interaction content from content script',
					{ tab_id, response }
				);
			}

			return response.data;
		} catch (error) {
			this.logger?.error('Failed to capture interaction content: ' + (error as Error).message);

			// Re-throw DOMServiceError as-is
			if (error instanceof DOMServiceError) {
				throw error;
			}

			// Wrap other errors
			throw new DOMServiceError(
				DOMServiceErrorCode.UNKNOWN_ERROR,
				'Failed to capture interaction content',
				{ tab_id, original_error: (error as Error).message }
			);
		}
	}

	/**
	 * Helper method to convert CDP DOM node to enhanced tree node
	 */
	private _convert_to_enhanced_tree(
		node: any, // CDP Node type
		parent: EnhancedDOMTreeNode | null,
		ax_tree_map: Map<number, EnhancedAXNode>,
		snapshot_lookup: Record<number, EnhancedSnapshotNode>,
		target_id: string,
		html_frames: Map<string, any>,
		total_frame_offset: { x: number; y: number },
		iframe_depth: number
	): EnhancedDOMTreeNode {
		// Create base enhanced node
		const enhanced: EnhancedDOMTreeNode = {
			node_id: node.nodeId,
			backend_node_id: node.backendNodeId,
			node_type: node.nodeType,
			node_name: node.nodeName,
			node_value: node.nodeValue || '',
			attributes: {},
			is_scrollable: null,
			is_visible: null,
			absolute_position: null,
			target_id: target_id,
			frame_id: node.frameId || null,
			session_id: null,
			content_document: null,
			shadow_root_type: node.shadowRootType || null,
			shadow_roots: null,
			parent_node: parent,
			children_nodes: null,
			ax_node: ax_tree_map.get(node.backendNodeId) || null,
			snapshot_node: snapshot_lookup[node.backendNodeId] || null,
			element_index: null,
			_compound_children: [],
			uuid: crypto.randomUUID()
		};

		// Parse attributes
		if (node.attributes && Array.isArray(node.attributes)) {
			for (let i = 0; i < node.attributes.length; i += 2) {
				enhanced.attributes[node.attributes[i]] = node.attributes[i + 1];
			}
		}

		// Process snapshot data for position and scrollability
		if (enhanced.snapshot_node) {
			enhanced.is_scrollable = this._check_scrollability(enhanced);
			enhanced.absolute_position = this._calculate_absolute_position(
				enhanced.snapshot_node.bounds,
				total_frame_offset
			);
			enhanced.is_visible = this._check_visibility(enhanced);
		}

		// Process children
		if (node.children && node.children.length > 0) {
			enhanced.children_nodes = node.children.map((child: any) =>
				this._convert_to_enhanced_tree(
					child,
					enhanced,
					ax_tree_map,
					snapshot_lookup,
					target_id,
					html_frames,
					total_frame_offset,
					iframe_depth
				)
			);
		}

		// Process shadow roots
		if (node.shadowRoots && node.shadowRoots.length > 0) {
			enhanced.shadow_roots = node.shadowRoots.map((shadow: any) =>
				this._convert_to_enhanced_tree(
					shadow,
					enhanced,
					ax_tree_map,
					snapshot_lookup,
					target_id,
					html_frames,
					total_frame_offset,
					iframe_depth
				)
			);
		}

		// Process content document (iframe)
		if (node.contentDocument) {
			// Check iframe limit
			if (this._get_iframe_count(enhanced) < this.max_iframes) {
				enhanced.content_document = this._convert_to_enhanced_tree(
					node.contentDocument,
					enhanced,
					ax_tree_map,
					snapshot_lookup,
					target_id,
					html_frames,
					total_frame_offset,
					iframe_depth + 1
				);
			}
		}

		return enhanced;
	}

	/**
	 * Check if element is scrollable based on computed styles
	 */
	private _check_scrollability(node: EnhancedDOMTreeNode): boolean {
		if (!node.snapshot_node?.computed_styles) {
			return false;
		}

		const styles = node.snapshot_node.computed_styles;
		const overflow = styles['overflow'] || 'visible';
		const overflowX = styles['overflow-x'] || overflow;
		const overflowY = styles['overflow-y'] || overflow;

		// Element is scrollable if overflow is auto or scroll
		return (
			overflowX === 'auto' || overflowX === 'scroll' ||
			overflowY === 'auto' || overflowY === 'scroll'
		);
	}

	/**
	 * Calculate absolute position including frame offsets
	 */
	private _calculate_absolute_position(
		bounds: DOMRect | null,
		frame_offset: { x: number; y: number }
	): DOMRect | null {
		if (!bounds) {
			return null;
		}

		return {
			x: bounds.x + frame_offset.x,
			y: bounds.y + frame_offset.y,
			width: bounds.width,
			height: bounds.height
		};
	}

	/**
	 * Check if element is visible based on styles and bounds
	 */
	private _check_visibility(node: EnhancedDOMTreeNode): boolean {
		// Check bounds
		if (!node.snapshot_node?.bounds) {
			return false;
		}

		const bounds = node.snapshot_node.bounds;
		if (bounds.width <= 0 || bounds.height <= 0) {
			return false;
		}

		// Check computed styles
		if (node.snapshot_node.computed_styles) {
			const styles = node.snapshot_node.computed_styles;

			if (styles['display'] === 'none') {
				return false;
			}

			if (styles['visibility'] === 'hidden' || styles['visibility'] === 'collapse') {
				return false;
			}

			const opacity = parseFloat(styles['opacity'] || '1');
			if (opacity === 0) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Count total iframes in tree
	 */
	private _get_iframe_count(root: EnhancedDOMTreeNode): number {
		let count = 0;

		// Count this node if it's an iframe
		if (root.node_name === 'IFRAME') {
			count++;
		}

		// Count children
		if (root.children_nodes) {
			for (const child of root.children_nodes) {
				count += this._get_iframe_count(child);
			}
		}

		// Count shadow roots
		if (root.shadow_roots) {
			for (const shadow of root.shadow_roots) {
				count += this._get_iframe_count(shadow);
			}
		}

		// Count content document
		if (root.content_document) {
			count += this._get_iframe_count(root.content_document);
		}

		return count;
	}
}
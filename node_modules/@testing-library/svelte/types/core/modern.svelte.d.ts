/** Allowed options to the `mount` call. */
export const allowedOptions: string[];
/** Whether we're using Svelte >= 5. */
export const IS_MODERN_SVELTE: boolean;
/** Mount the component into the DOM. */
export function mount(Component: any, options: any): Record<string, any>;
/** Remove the component from the DOM. */
export function unmount(component: any): void;
/**
 * Update the component's props.
 *
 * Relies on the `$state` signal added in `mount`.
 */
export function updateProps(component: any, nextProps: any): void;
//# sourceMappingURL=modern.svelte.d.ts.map
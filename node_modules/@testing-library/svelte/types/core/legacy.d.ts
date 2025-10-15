/**
 * Legacy rendering core for svelte-testing-library.
 *
 * Supports Svelte <= 4.
 */
/** Allowed options for the component constructor. */
export const allowedOptions: string[];
/**
 * Mount the component into the DOM.
 *
 * The `onDestroy` callback is included for strict backwards compatibility
 * with previous versions of this library. It's mostly unnecessary logic.
 */
export function mount(Component: any, options: any, onDestroy: any): any;
/** Remove the component from the DOM. */
export function unmount(component: any): void;
/** Update the component's props. */
export function updateProps(component: any, nextProps: any): void;
//# sourceMappingURL=legacy.d.ts.map
/**
 * Customize how Svelte renders the component.
 */
export type SvelteComponentOptions<C extends import("./component-types.js").Component> = import("./component-types.js").Props<C> | Partial<import("./component-types.js").MountOptions<C>>;
/**
 * Customize how Testing Library sets up the document and binds queries.
 */
export type RenderOptions<Q extends import("@testing-library/dom").Queries = typeof import("@testing-library/dom/types/queries.js")> = {
    baseElement?: HTMLElement;
    queries?: Q;
};
/**
 * The rendered component and bound testing functions.
 */
export type RenderResult<C extends import("./component-types.js").Component, Q extends import("@testing-library/dom").Queries = typeof import("@testing-library/dom/types/queries.js")> = {
    container: HTMLElement;
    baseElement: HTMLElement;
    component: import("./component-types.js").Exports<C>;
    debug: (el?: HTMLElement | DocumentFragment) => void;
    rerender: (props: Partial<import("./component-types.js").Props<C>>) => Promise<void>;
    unmount: () => void;
} & { [P in keyof Q]: import("@testing-library/dom").BoundFunction<Q[P]>; };
export type FireFunction = (...args: Parameters<import("@testing-library/dom").FireFunction>) => Promise<ReturnType<import("@testing-library/dom").FireFunction>>;
export type FireObject = { [K in import("@testing-library/dom").EventType]: (...args: Parameters<import("@testing-library/dom").FireObject[K]>) => Promise<ReturnType<import("@testing-library/dom").FireObject[K]>>; };
/**
 * Call a function and wait for Svelte to flush pending changes.
 *
 * @template T
 * @param {(() => Promise<T>) | () => T} [fn] - A function, which may be `async`, to call before flushing updates.
 * @returns {Promise<T>}
 */
export function act<T>(fn?: (() => Promise<T>) | (() => T)): Promise<T>;
/** Unmount components, remove elements added to `<body>`, and reset `@testing-library/dom`. */
export function cleanup(): void;
/**
 * @typedef {(...args: Parameters<import('@testing-library/dom').FireFunction>) => Promise<ReturnType<import('@testing-library/dom').FireFunction>>} FireFunction
 */
/**
 * @typedef {{
 *   [K in import('@testing-library/dom').EventType]: (...args: Parameters<import('@testing-library/dom').FireObject[K]>) => Promise<ReturnType<import('@testing-library/dom').FireObject[K]>>
 * }} FireObject
 */
/**
 * Fire an event on an element.
 *
 * Consider using `@testing-library/user-event` instead, if possible.
 * @see https://testing-library.com/docs/user-event/intro/
 *
 * @type {FireFunction & FireObject}
 */
export const fireEvent: FireFunction & FireObject;
/**
 * Customize how Svelte renders the component.
 *
 * @template {import('./component-types.js').Component} C
 * @typedef {import('./component-types.js').Props<C> | Partial<import('./component-types.js').MountOptions<C>>} SvelteComponentOptions
 */
/**
 * Customize how Testing Library sets up the document and binds queries.
 *
 * @template {import('@testing-library/dom').Queries} [Q=typeof import('@testing-library/dom').queries]
 * @typedef {{
 *   baseElement?: HTMLElement
 *   queries?: Q
 * }} RenderOptions
 */
/**
 * The rendered component and bound testing functions.
 *
 * @template {import('./component-types.js').Component} C
 * @template {import('@testing-library/dom').Queries} [Q=typeof import('@testing-library/dom').queries]
 *
 * @typedef {{
 *   container: HTMLElement
 *   baseElement: HTMLElement
 *   component: import('./component-types.js').Exports<C>
 *   debug: (el?: HTMLElement | DocumentFragment) => void
 *   rerender: (props: Partial<import('./component-types.js').Props<C>>) => Promise<void>
 *   unmount: () => void
 * } & {
 *   [P in keyof Q]: import('@testing-library/dom').BoundFunction<Q[P]>
 * }} RenderResult
 */
/**
 * Render a component into the document.
 *
 * @template {import('./component-types.js').Component} C
 * @template {import('@testing-library/dom').Queries} [Q=typeof import('@testing-library/dom').queries]
 *
 * @param {import('./component-types.js').ComponentType<C>} Component - The component to render.
 * @param {SvelteComponentOptions<C>} options - Customize how Svelte renders the component.
 * @param {RenderOptions<Q>} renderOptions - Customize how Testing Library sets up the document and binds queries.
 * @returns {RenderResult<C, Q>} The rendered component and bound testing functions.
 */
export function render<C extends import("./component-types.js").Component, Q extends import("@testing-library/dom").Queries = typeof import("@testing-library/dom/types/queries.js")>(Component: import("./component-types.js").ComponentType<C>, options?: SvelteComponentOptions<C>, renderOptions?: RenderOptions<Q>): RenderResult<C, Q>;
/**
 * Configure `@testing-library/dom` for usage with Svelte.
 *
 * Ensures events fired from `@testing-library/dom`
 * and `@testing-library/user-event` wait for Svelte
 * to flush changes to the DOM before proceeding.
 */
export function setup(): void;
//# sourceMappingURL=pure.d.ts.map
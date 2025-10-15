/**
 * Side panel main entry point
 */

import './sidepanel.css';
import './styles.css';
import App from './App.svelte';

// Add terminal-mode class to body for terminal styling
document.body.classList.add('terminal-mode');

const app = new App({
  target: document.getElementById('app')!,
});

export default app;

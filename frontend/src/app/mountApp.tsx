import React from 'react';
import ReactDOM from 'react-dom/client';
import App from '../App.tsx';
import '../index.css';

// Module-level root storage for re-mount support
let currentRoot: ReactDOM.Root | null = null;

/**
 * Shared mount helper for both main entry and embed API.
 * Mounts the React application to the specified DOM element.
 * Handles re-mounting by unmounting any existing root first.
 * 
 * @param mountEl - DOM element to mount the application into
 * @returns ReactDOM root instance
 */
export function mountApp(mountEl: HTMLElement): ReactDOM.Root {
  // Unmount existing root if present
  if (currentRoot) {
    currentRoot.unmount();
    currentRoot = null;
  }

  // Create and mount new root
  const root = ReactDOM.createRoot(mountEl);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  
  currentRoot = root;
  return root;
}

/**
 * Unmounts the current React application if one is mounted.
 * Safe to call even if no app is mounted.
 */
export function unmountApp(): void {
  if (currentRoot) {
    currentRoot.unmount();
    currentRoot = null;
  }
}

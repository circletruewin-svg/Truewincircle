import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)

// Hide the inline splash that index.html paints first. We do it on
// the next animation frame so the React tree has had a chance to
// mount and start rendering — that way there's no white flash
// between the splash disappearing and the real UI showing up.
requestAnimationFrame(() => {
  const splash = document.getElementById('app-splash');
  if (!splash) return;
  splash.classList.add('hidden');
  setTimeout(() => splash.remove(), 250);
});

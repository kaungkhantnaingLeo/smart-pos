import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-500.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/noto-sans-myanmar/myanmar-400.css';
import '@fontsource/noto-sans-myanmar/myanmar-500.css';
import '@fontsource/noto-sans-myanmar/myanmar-600.css';
import './styles/app.css';
import { App } from './App';
import { startApp } from './state/app';

startApp();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

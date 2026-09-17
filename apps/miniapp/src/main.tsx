import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles.css';
import './table.css';
import './motion.css';
import './rules.css';
import './result.css';
import './hardening.css';
import './pr23.css';

const root = document.getElementById('root');

if (root === null) {
  throw new Error('CARAVAN Mini App root element was not found.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

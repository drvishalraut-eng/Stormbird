import React    from 'react';
import ReactDOM from 'react-dom/client';
import App      from './App';
import './styles/globals.css';

// Set initial theme before first render to avoid flash
document.documentElement.setAttribute('data-theme', 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter, useNavigate } from 'react-router-dom';
import App from './App';
import './styles/theme.css';

function DesktopNavigationBridge() {
  const navigate = useNavigate();
  useEffect(() => {
    if (!window.aicronDesktop?.onNavigate) return undefined;
    return window.aicronDesktop.onNavigate((targetPath) => {
      if (typeof targetPath === 'string' && targetPath.startsWith('/')) {
        navigate(targetPath);
      }
    });
  }, [navigate]);
  return null;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <DesktopNavigationBridge />
      <App />
    </HashRouter>
  </StrictMode>
);

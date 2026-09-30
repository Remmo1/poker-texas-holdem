import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

// StrictMode is left off on purpose: it mounts effects twice, which would boot and tear down the Phaser game.
createRoot(document.getElementById('root')!).render(<App />);

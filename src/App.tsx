import { Routes, Route, Navigate } from 'react-router-dom';
import Nav from './components/Nav';
import BoardEditorPage from './pages/BoardEditorPage';
import SimulationPage from './pages/SimulationPage';
import ReplayPage from './pages/ReplayPage';
import StrategyPage from './pages/StrategyPage';
import { SimulationProvider } from './contexts/SimulationContext';
import { StrategyProvider } from './contexts/StrategyContext';

export default function App() {
  return (
    <StrategyProvider>
    <SimulationProvider>
    <div id="app">
      <Nav />
      <main>
        <div className="main-content">
        <Routes>
        <Route path="/" element={<Navigate to="/simulation" replace />} />
        <Route path="/editor" element={<BoardEditorPage />} />
        <Route path="/play" element={<Navigate to="/simulation" replace />} />
        <Route path="/simulation" element={<SimulationPage />} />
        <Route path="/replay" element={<ReplayPage />} />
        <Route path="/strategy" element={<StrategyPage />} />
        </Routes>
        </div>
      </main>
    </div>
    </SimulationProvider>
    </StrategyProvider>
  );
}

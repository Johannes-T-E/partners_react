import { Routes, Route, Navigate } from 'react-router-dom';
import Nav from './components/Nav';
import BoardEditorPage from './pages/BoardEditorPage';
import SimulationPage from './pages/SimulationPage';
import ReplayPage from './pages/ReplayPage';
import { SimulationProvider } from './contexts/SimulationContext';

export default function App() {
  return (
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
        </Routes>
        </div>
      </main>
    </div>
    </SimulationProvider>
  );
}

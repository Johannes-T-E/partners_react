import { Link, useLocation } from 'react-router-dom';

const NAV_ITEMS = [
  { path: '/editor', label: 'Board Editor' },
  // Play disabled for now
  { path: '/simulation', label: 'Simulation' },
  { path: '/replay', label: 'Replay' },
] as const;

export default function Nav() {
  const location = useLocation();

  return (
    <nav className="game-nav">
      <div className="game-nav-inner">
        {NAV_ITEMS.map(({ path, label }) => (
          <Link
            key={path}
            to={path}
            className={`game-nav-link ${location.pathname === path ? 'active' : ''}`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

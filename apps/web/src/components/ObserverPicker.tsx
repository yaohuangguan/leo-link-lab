import { FormEvent, useMemo, useState } from 'react';

export type ObserverLocation = {
  label: string;
  latDeg: number;
  lonDeg: number;
};

type SearchResult = {
  label: string;
  latDeg: number;
  lonDeg: number;
};

type Props = {
  apiBase: string;
  location: ObserverLocation;
  onChange: (location: ObserverLocation) => void;
};

const presets: ObserverLocation[] = [
  { label: 'Auckland, New Zealand', latDeg: -36.8485, lonDeg: 174.7633 },
  { label: 'Sydney, Australia', latDeg: -33.8688, lonDeg: 151.2093 },
  { label: 'Singapore', latDeg: 1.3521, lonDeg: 103.8198 },
  { label: 'Tokyo, Japan', latDeg: 35.6762, lonDeg: 139.6503 },
  { label: 'London, United Kingdom', latDeg: 51.5072, lonDeg: -0.1276 },
  { label: 'New York, United States', latDeg: 40.7128, lonDeg: -74.0060 },
];

export default function ObserverPicker({ apiBase, location, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [latInput, setLatInput] = useState(String(location.latDeg));
  const [lonInput, setLonInput] = useState(String(location.lonDeg));

  const shortLabel = useMemo(() => location.label.split(',').slice(0, 2).join(', '), [location.label]);

  const apply = (next: ObserverLocation) => {
    onChange(next);
    setLatInput(next.latDeg.toFixed(5));
    setLonInput(next.lonDeg.toFixed(5));
    setResults([]);
    setMessage('');
  };

  const search = async (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return;

    setSearching(true);
    setMessage('');
    try {
      const response = await fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(q)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Search failed');
      setResults(body.results || []);
      if (!body.results?.length) setMessage('No matching place found.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setMessage('Geolocation is not available in this browser.');
      return;
    }
    setMessage('Requesting browser location…');
    navigator.geolocation.getCurrentPosition(
      position => {
        apply({
          label: 'Current device location',
          latDeg: position.coords.latitude,
          lonDeg: position.coords.longitude,
        });
      },
      error => setMessage(error.message || 'Location permission was not granted.'),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const applyCoordinates = (event: FormEvent) => {
    event.preventDefault();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setMessage('Latitude must be −90…90 and longitude −180…180.');
      return;
    }
    apply({ label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`, latDeg: lat, lonDeg: lon });
  };

  return (
    <section className="observer-picker">
      <div className="observer-current">
        <span>OBSERVER LOCATION</span>
        <strong>{shortLabel}</strong>
        <small>{location.latDeg.toFixed(4)}° · {location.lonDeg.toFixed(4)}°</small>
      </div>

      <form className="observer-search" onSubmit={search}>
        <label htmlFor="place-search">Search any city or place</label>
        <div>
          <input
            id="place-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="e.g. Queenstown, Paris, Shanghai…"
          />
          <button type="submit" disabled={searching || query.trim().length < 2}>
            {searching ? 'Searching…' : 'Search'}
          </button>
        </div>
        {results.length > 0 && (
          <div className="place-results">
            {results.map(result => (
              <button key={`${result.latDeg}-${result.lonDeg}`} type="button" onClick={() => apply(result)}>
                <strong>{result.label}</strong>
                <small>{result.latDeg.toFixed(4)}°, {result.lonDeg.toFixed(4)}°</small>
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="observer-actions">
        <button type="button" onClick={useDeviceLocation}>Use my location</button>
        <form onSubmit={applyCoordinates}>
          <input aria-label="Latitude" value={latInput} onChange={event => setLatInput(event.target.value)} />
          <input aria-label="Longitude" value={lonInput} onChange={event => setLonInput(event.target.value)} />
          <button type="submit">Apply coordinates</button>
        </form>
      </div>

      <div className="observer-presets">
        {presets.map(preset => (
          <button key={preset.label} type="button" onClick={() => apply(preset)}>{preset.label.split(',')[0]}</button>
        ))}
      </div>

      {message && <p className="observer-message">{message}</p>}
      <p className="geocode-credit">Place search © OpenStreetMap contributors · submit-only search, no autocomplete.</p>
    </section>
  );
}

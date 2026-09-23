import { FormEvent, useMemo, useState } from 'react';
import { useI18n } from '../i18n';

export type ObserverLocation = {
  label: string;
  latDeg: number;
  lonDeg: number;
  locale?: 'en' | 'zh' | 'neutral';
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

const presets = [
  { en: 'Auckland, New Zealand', zh: '奥克兰，新西兰', latDeg: -36.8485, lonDeg: 174.7633 },
  { en: 'Sydney, Australia', zh: '悉尼，澳大利亚', latDeg: -33.8688, lonDeg: 151.2093 },
  { en: 'Singapore', zh: '新加坡', latDeg: 1.3521, lonDeg: 103.8198 },
  { en: 'Tokyo, Japan', zh: '东京，日本', latDeg: 35.6762, lonDeg: 139.6503 },
  { en: 'London, United Kingdom', zh: '伦敦，英国', latDeg: 51.5072, lonDeg: -0.1276 },
  { en: 'New York, United States', zh: '纽约，美国', latDeg: 40.7128, lonDeg: -74.0060 },
];

export default function ObserverPicker({ apiBase, location, onChange }: Props) {
  const { t, language } = useI18n();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [latInput, setLatInput] = useState(String(location.latDeg));
  const [lonInput, setLonInput] = useState(String(location.lonDeg));

  const shortLabel = useMemo(() => {
    const parts = location.label.split(/[,，]/).map(part => part.trim()).filter(Boolean);
    return language === 'zh' ? (parts[0] || location.label) : parts.slice(0, 2).join(', ');
  }, [location.label, language]);

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
      const response = await fetch(`${apiBase}/api/geocode?q=${encodeURIComponent(q)}&lang=${language}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || t('Search failed'));
      setResults(body.results || []);
      if (!body.results?.length) setMessage(t('No matching place found.'));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Search failed'));
    } finally {
      setSearching(false);
    }
  };

  const useDeviceLocation = () => {
    if (!navigator.geolocation) {
      setMessage(t('Geolocation is not available in this browser.'));
      return;
    }
    setMessage(t('Requesting browser location…'));
    navigator.geolocation.getCurrentPosition(
      position => {
        apply({
          label: t('Current device location'),
          latDeg: position.coords.latitude,
          lonDeg: position.coords.longitude,
          locale: 'neutral',
        });
      },
      error => setMessage(error.message || t('Location permission was not granted.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const applyCoordinates = (event: FormEvent) => {
    event.preventDefault();
    const lat = Number(latInput);
    const lon = Number(lonInput);
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
      setMessage(t('Latitude must be −90…90 and longitude −180…180.'));
      return;
    }
    apply({ label: `${lat.toFixed(4)}°, ${lon.toFixed(4)}°`, latDeg: lat, lonDeg: lon, locale: 'neutral' });
  };

  return (
    <section className="observer-picker">
      <div className="observer-current">
        <span>{t('OBSERVER LOCATION')}</span>
        <strong>{shortLabel}</strong>
        <small>{location.latDeg.toFixed(4)}° · {location.lonDeg.toFixed(4)}°</small>
      </div>

      <form className="observer-search" onSubmit={search}>
        <label htmlFor="place-search">{t('Search any city or place')}</label>
        <div>
          <input
            id="place-search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder={t('e.g. Queenstown, Paris, Shanghai…')}
          />
          <button type="submit" disabled={searching || query.trim().length < 2}>
            {searching ? t('Searching…') : t('Search')}
          </button>
        </div>
        {results.length > 0 && (
          <div className="place-results">
            {results.map(result => (
              <button key={`${result.latDeg}-${result.lonDeg}`} type="button" onClick={() => apply({ ...result, locale: language })}>
                <strong>{result.label}</strong>
                <small>{result.latDeg.toFixed(4)}°, {result.lonDeg.toFixed(4)}°</small>
              </button>
            ))}
          </div>
        )}
      </form>

      <div className="observer-actions">
        <button type="button" onClick={useDeviceLocation}>{t('Use my location')}</button>
        <form onSubmit={applyCoordinates}>
          <input aria-label="Latitude" value={latInput} onChange={event => setLatInput(event.target.value)} />
          <input aria-label="Longitude" value={lonInput} onChange={event => setLonInput(event.target.value)} />
          <button type="submit">{t('Apply coordinates')}</button>
        </form>
      </div>

      <div className="observer-presets">
        {presets.map(preset => {
          const label = language === 'zh' ? preset.zh : preset.en;
          return (
            <button
              key={preset.en}
              type="button"
              onClick={() => apply({ label, latDeg: preset.latDeg, lonDeg: preset.lonDeg, locale: language })}
            >
              {(language === 'zh' ? preset.zh.split('，')[0] : preset.en.split(',')[0])}
            </button>
          );
        })}
      </div>

      {message && <p className="observer-message">{message}</p>}
      <p className="geocode-credit">{t('Place search © OpenStreetMap contributors · submit-only search, no autocomplete.')}</p>
    </section>
  );
}

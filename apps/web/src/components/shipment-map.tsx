'use client';

import { MapContainer, TileLayer, CircleMarker, Polyline, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const TILE = process.env.NEXT_PUBLIC_OSM_TILE_URL ?? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

export interface MapProps {
  origin: { name: string; lat: number; lng: number };
  dest: { name: string; lat: number; lng: number };
  current?: { lat: number; lng: number } | null;
}

export default function ShipmentMap({ origin, dest, current }: MapProps) {
  const points: [number, number][] = [
    [origin.lat, origin.lng],
    [dest.lat, dest.lng],
  ];
  const midLat = (origin.lat + dest.lat) / 2;
  const midLng = (origin.lng + dest.lng) / 2;

  return (
    <MapContainer
      center={[midLat, midLng]}
      zoom={4}
      scrollWheelZoom={false}
      style={{ height: '420px', width: '100%', borderRadius: '0.75rem' }}
    >
      <TileLayer
        url={TILE}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <Polyline positions={points} pathOptions={{ color: '#6366f1', weight: 3, dashArray: '6 8' }} />

      <CircleMarker center={[origin.lat, origin.lng]} radius={9} pathOptions={{ color: '#10b981', fillColor: '#10b981', fillOpacity: 0.8 }}>
        <Popup>Origin: {origin.name}</Popup>
      </CircleMarker>

      <CircleMarker center={[dest.lat, dest.lng]} radius={9} pathOptions={{ color: '#ef4444', fillColor: '#ef4444', fillOpacity: 0.8 }}>
        <Popup>Destination: {dest.name}</Popup>
      </CircleMarker>

      {current && (
        <CircleMarker center={[current.lat, current.lng]} radius={11} pathOptions={{ color: '#4f46e5', fillColor: '#818cf8', fillOpacity: 0.9 }}>
          <Popup>Current position</Popup>
        </CircleMarker>
      )}
    </MapContainer>
  );
}

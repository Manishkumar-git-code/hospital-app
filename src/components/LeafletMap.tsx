'use client';

import { MapContainer, TileLayer, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import { useEffect } from 'react';
import L from 'leaflet';

const MapContainerAny = MapContainer as any;
const TileLayerAny = TileLayer as any;
const CircleMarkerAny = CircleMarker as any;
const PolylineAny = Polyline as any;

type LatLng = { lat: number; lng: number };

type MapMarker = {
  position: LatLng;
  label: string;
  color?: string;
};

function Controller({
  center,
  followCenter,
  fitBoundsOnRoute,
  route,
  markers,
}: {
  center: LatLng;
  followCenter: boolean;
  fitBoundsOnRoute: boolean;
  route: LatLng[];
  markers: MapMarker[];
}) {
  const map = useMap();

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(id);
  }, [map]);

  useEffect(() => {
    if (!followCenter) return;
    map.setView([center.lat, center.lng]);
  }, [center, followCenter, map]);

  useEffect(() => {
    if (!fitBoundsOnRoute) return;

    const points: LatLng[] = [];
    if (Array.isArray(route) && route.length >= 2) {
      points.push(...route);
    } else if (Array.isArray(markers) && markers.length > 0) {
      points.push(...markers.map((m) => m.position));
    }

    if (points.length < 2) return;
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [30, 30] });
  }, [fitBoundsOnRoute, route, markers, map]);

  useEffect(() => {
    const id = setTimeout(() => {
      try {
        map.invalidateSize();
      } catch {
        // ignore
      }
    }, 0);
    return () => clearTimeout(id);
  }, [route, markers, map]);

  return null;
}

export default function LeafletMap({
  center,
  zoom = 13,
  markers = [],
  route = [],
  followCenter = true,
  fitBoundsOnRoute = false,
  className,
}: {
  center: LatLng;
  zoom?: number;
  markers?: MapMarker[];
  route?: LatLng[];
  followCenter?: boolean;
  fitBoundsOnRoute?: boolean;
  className?: string;
}) {
  return (
    <MapContainerAny
      center={[center.lat, center.lng]}
      zoom={zoom}
      scrollWheelZoom
      className={className}
      style={{ width: '100%', height: '100%' }}
    >
      <Controller
        center={center}
        followCenter={followCenter}
        fitBoundsOnRoute={fitBoundsOnRoute}
        route={route}
        markers={markers}
      />
      <TileLayerAny
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />

      {route.length >= 2 ? (
        <>
          <PolylineAny
            positions={route.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: '#ffffff', weight: 9, opacity: 0.65, lineJoin: 'round', lineCap: 'round' }}
          />
          <PolylineAny
            positions={route.map((p) => [p.lat, p.lng])}
            pathOptions={{ color: '#2563eb', weight: 6, opacity: 0.95, lineJoin: 'round', lineCap: 'round' }}
          />
        </>
      ) : null}

      {markers.map((m, idx) => (
        <CircleMarkerAny
          key={idx}
          center={[m.position.lat, m.position.lng]}
          radius={10}
          pathOptions={{
            color: m.color || '#ef4444',
            fillColor: m.color || '#ef4444',
            fillOpacity: 0.9,
          }}
        >
          <Popup>{m.label}</Popup>
        </CircleMarkerAny>
      ))}
    </MapContainerAny>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

import { MapCanvas } from "@/components/MapCanvas";
import { MapErrorBoundary } from "@/components/MapErrorBoundary";
import { useURLSync } from "@/hooks/useURLSync";
import { usePlaces } from "@/hooks/usePlaces";
import { ThemeTransitionLayer } from "@/components/ThemeTransitionLayer";
import { SearchBox } from "@/components/ui/SearchBox";
import { LocationList } from "@/components/ui/LocationList";
import { TimeScroll } from "@/components/ui/TimeScroll";
import { MapControlPanel } from "@/components/ui/MapControlPanel";
import { AIChatPill } from "@/components/ui/AIChatPill";
import { SettingButton } from "@/components/ui/SettingButton";
import { LocateButton } from "@/components/ui/LocateButton";
import { ResetAreaButton } from "@/components/ui/ResetAreaButton";
import { ViewModeButton } from "@/components/ui/ViewModeButton";
import { MOCK_PLACES, PROVIDENCE_CENTER } from "@/data/mockPlaces";
import { useAppStore } from "@/store/useAppStore";
import { resolveThemeByHour } from "@/shared/time-theme";

// ── Page ─────────────────────────────────────────────────────────────────

export default function HomePage() {
  const timeValue = useAppStore((s) => s.timeValue);
  const selectedPlaceId = useAppStore((s) => s.selectedPlaceId);
  const hoveredPlaceId = useAppStore((s) => s.hoveredPlaceId);
  const setSelectedPlaceId = useAppStore((s) => s.setSelectedPlaceId);

  const { urlCenter, handleViewportChange } = useURLSync();

  const hour = ((timeValue % 24) + 24) % 24;
  const theme = resolveThemeByHour(hour);

  // ── Unified data source (API or local MOCK_PLACES) ──
  const places = usePlaces();

  // ── Map-specific state ──
  const [userLocation, setUserLocation] = useState<{
    lng: number;
    lat: number;
  } | null>(null);
  const [recenterCount, setRecenterCount] = useState(0);

  // Resolve initial user location (fallback to Providence)
  useEffect(() => {
    if (!navigator.geolocation) {
      setUserLocation(PROVIDENCE_CENTER);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        setUserLocation({
          lng: pos.coords.longitude,
          lat: pos.coords.latitude,
        }),
      () => setUserLocation(PROVIDENCE_CENTER),
      { timeout: 8000, maximumAge: 300000 },
    );
  }, []);

  // ── Derived props for MapCanvas ──
  // Look up from ALL places (not filtered) so closed-place selection still has coordinates
  const selectedPlaceCoords = selectedPlaceId
    ? MOCK_PLACES.find((p) => p.id === selectedPlaceId)?.coordinates ?? null
    : null;

  // urlCenter only applies on initial deep-link load (recenterCount === 0).
  // After user clicks Locate / Reset, userLocation takes priority.
  const focusCoordinates =
    selectedPlaceCoords ??
    (recenterCount === 0 ? urlCenter : null) ??
    userLocation ??
    PROVIDENCE_CENTER;

  const viewportKey = selectedPlaceId
    ? "selected:" + selectedPlaceId
    : "center:" +
      focusCoordinates.lng.toFixed(3) +
      ":" +
      focusCoordinates.lat.toFixed(3) +
      ":" +
      recenterCount;

  const handleRecenter = useCallback(() => {
    setSelectedPlaceId(null);
    setRecenterCount((c) => c + 1);
  }, [userLocation, setSelectedPlaceId]);

  const handleDeselect = useCallback(
    () => setSelectedPlaceId(null),
    [setSelectedPlaceId],
  );

  const handleResetArea = useCallback(() => {
    useAppStore.getState().resetArea();
    setRecenterCount((c) => c + 1);
  }, []);

  // ── Esc to close panels ──
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        const store = useAppStore.getState();
        if (store.settingsOpen) {
          store.toggleSettings();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return (
    <main className="relative h-screen w-full overflow-hidden bg-slate-950 font-body">
      {/* ── Map ── z-0 */}
      <MapErrorBoundary>
        <MapCanvas
          theme={theme}
          timeValue={timeValue}
          places={places}
          hoveredPlaceId={hoveredPlaceId}
          selectedPlaceId={selectedPlaceId}
          focusCoordinates={focusCoordinates}
          userLocation={userLocation}
          viewportKey={viewportKey}
          onSelectPlace={setSelectedPlaceId}
          onDeselectPlace={handleDeselect}
          onRecenter={handleRecenter}
          onViewportChange={handleViewportChange}
        />
      </MapErrorBoundary>
      <ThemeTransitionLayer timeValue={timeValue} />

      {/* ── UI Layer ── */}
      <div className="pointer-events-none absolute inset-0 z-20">
        {/* ── Top row ── */}
        <div className="absolute top-4 right-4 left-4 flex items-start justify-between">
          {/* Top-left: Search */}
          <SearchBox />

          {/* Top-right: Time + Controls stack */}
          <div className="flex flex-col items-end gap-1.5">
            <div className="flex items-center gap-1.5">
              <ViewModeButton />
              <TimeScroll />
            </div>
            <MapControlPanel />
          </div>
        </div>

        {/* ── Left: LocationList ── */}
        <div className="absolute inset-y-0 left-0" style={{ top: 72 }}>
          <LocationList />
        </div>

        {/* ── Bottom row ── */}
        <div className="absolute right-4 bottom-4 left-4 flex items-end justify-between">
          {/* Bottom-left: Settings */}
          <SettingButton />

          {/* Bottom-center: AI Chat */}
          <AIChatPill />

          {/* Bottom-right: Reset + Locate stack */}
          <div className="flex flex-col items-center gap-2">
            <ResetAreaButton onReset={handleResetArea} />
            <LocateButton onLocate={handleRecenter} />
          </div>
        </div>
      </div>
    </main>
  );
}

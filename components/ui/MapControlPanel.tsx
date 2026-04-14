"use client";

import { SlidersHorizontal, ChevronDown, ChevronUp, Compass } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useAppStore } from "@/store/useAppStore";
import { useThemeMode } from "@/hooks/useThemeMode";

export function MapControlPanel() {
  const open = useAppStore((s) => s.mapControlOpen);
  const toggle = useAppStore((s) => s.toggleMapControl);
  const mapStyle = useAppStore((s) => s.mapStyle);
  const setMapStyle = useAppStore((s) => s.setMapStyle);
  const buildings3d = useAppStore((s) => s.buildings3d);
  const toggleBuildings = useAppStore((s) => s.toggleBuildings3d);
  const showHouseNumbers = useAppStore((s) => s.showHouseNumbers);
  const toggleHouseNumbers = useAppStore((s) => s.toggleHouseNumbers);
  const displayMode = useAppStore((s) => s.displayMode);
  const setDisplayMode = useAppStore((s) => s.setDisplayMode);
  const mapPitch = useAppStore((s) => s.mapPitch);
  const setMapPitch = useAppStore((s) => s.setMapPitch);
  const resetNorth = useAppStore((s) => s.resetNorth);
  const walkingCircles = useAppStore((s) => s.walkingCircles);
  const toggleWalkingCircles = useAppStore((s) => s.toggleWalkingCircles);
  const isLight = useThemeMode();

  return (
    <div className="pointer-events-auto flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={toggle}
        className={`flex items-center gap-2 rounded-2xl border px-3 py-2.5 shadow-lg backdrop-blur-xl transition-colors duration-500 ${
          isLight
            ? "border-black/[0.06] bg-white/70 hover:border-black/[0.10]"
            : "border-white/10 bg-slate-900/60 hover:border-white/20"
        }`}
      >
        <SlidersHorizontal className={`h-4 w-4 ${isLight ? "text-slate-500" : "text-white/60"}`} />
        <span className={`text-xs font-medium ${isLight ? "text-slate-600" : "text-white/70"}`}>
          Controls
        </span>
        {open ? (
          <ChevronUp className={`h-3 w-3 ${isLight ? "text-slate-400" : "text-white/40"}`} />
        ) : (
          <ChevronDown className={`h-3 w-3 ${isLight ? "text-slate-400" : "text-white/40"}`} />
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, scale: 0.95 }}
            animate={{ opacity: 1, height: "auto", scale: 1 }}
            exit={{ opacity: 0, height: 0, scale: 0.95 }}
            transition={{ duration: 0.25, ease: [0.22, 0.68, 0, 1] }}
            className={`w-[240px] origin-top overflow-hidden rounded-2xl border shadow-xl backdrop-blur-xl transition-colors duration-500 ${
              isLight
                ? "border-black/[0.06] bg-white/80"
                : "border-white/10 bg-slate-900/70"
            }`}
          >
            <div className="space-y-3 p-3">
              {/* Camera controls */}
              <div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-widest ${
                    isLight ? "text-slate-400" : "text-white/30"
                  }`}
                >
                  Camera
                </span>
                <div className="mt-2 space-y-2.5">
                  {/* Pitch slider */}
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-white/60"}`}>
                        Tilt
                      </span>
                      <span
                        className={`text-[10px] tabular-nums ${isLight ? "text-slate-400" : "text-white/30"}`}
                      >
                        {mapPitch}°
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={78}
                      step={1}
                      value={mapPitch}
                      onChange={(e) => setMapPitch(Number(e.target.value))}
                      className={`h-1 w-full cursor-pointer appearance-none rounded-full accent-sky-400 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-sky-400 [&::-webkit-slider-thumb]:shadow-md ${
                        isLight ? "bg-black/10" : "bg-white/10"
                      }`}
                    />
                    <div
                      className={`flex justify-between text-[9px] ${isLight ? "text-slate-300" : "text-white/20"}`}
                    >
                      <span>Top-down</span>
                      <span>Street</span>
                    </div>
                  </div>

                  {/* Reset North */}
                  <button
                    type="button"
                    onClick={resetNorth}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] transition ${
                      isLight
                        ? "text-slate-500 hover:bg-black/[0.04] hover:text-slate-700"
                        : "text-white/60 hover:bg-white/[0.06] hover:text-white/80"
                    }`}
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>Reset North</span>
                  </button>
                </div>

                {/* Gesture hint */}
                <p
                  className={`mt-1.5 text-[9px] leading-relaxed ${isLight ? "text-slate-300" : "text-white/20"}`}
                >
                  Right-drag to rotate · Two-finger drag to tilt
                </p>
              </div>

              {/* Map style */}
              <div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-widest ${
                    isLight ? "text-slate-400" : "text-white/30"
                  }`}
                >
                  Map Style
                </span>
                <div className="mt-1.5 flex gap-1">
                  {(
                    [
                      ["afterdark", "Afterdark"],
                      ["satellite", "Satellite"],
                      ["minimal", "Minimal"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setMapStyle(key)}
                      className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium transition ${
                        mapStyle === key
                          ? isLight ? "bg-sky-500/15 text-sky-600" : "bg-sky-400/15 text-sky-300"
                          : isLight
                            ? "text-slate-400 hover:bg-black/[0.04] hover:text-slate-600"
                            : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Toggles */}
              <div className="space-y-2">
                <Toggle
                  label="3D Buildings"
                  checked={buildings3d}
                  onChange={toggleBuildings}
                  isLight={isLight}
                />
                <Toggle
                  label="House Numbers"
                  checked={showHouseNumbers}
                  onChange={toggleHouseNumbers}
                  isLight={isLight}
                />
                <Toggle
                  label="Walking Circles"
                  checked={walkingCircles}
                  onChange={toggleWalkingCircles}
                  isLight={isLight}
                />
              </div>
              {walkingCircles && (
                <div className="flex items-center gap-3 px-1">
                  <span className="flex items-center gap-1.5 text-[9px] text-sky-300/70">
                    <span className="inline-block h-2 w-2 rounded-full bg-sky-400/40 ring-1 ring-sky-400/60" />
                    5 min
                  </span>
                  <span className="flex items-center gap-1.5 text-[9px] text-indigo-300/70">
                    <span className="inline-block h-2 w-2 rounded-full bg-indigo-400/40 ring-1 ring-indigo-400/60" />
                    10 min
                  </span>
                  <span className="flex items-center gap-1.5 text-[9px] text-purple-300/70">
                    <span className="inline-block h-2 w-2 rounded-full bg-purple-400/40 ring-1 ring-purple-400/60" />
                    15 min
                  </span>
                </div>
              )}

              {/* Display mode */}
              <div>
                <span
                  className={`text-[10px] font-medium uppercase tracking-widest ${
                    isLight ? "text-slate-400" : "text-white/30"
                  }`}
                >
                  Display
                </span>
                <div className="mt-1.5 flex gap-1">
                  {(
                    [
                      ["markers", "Markers"],
                      ["heatmap", "Heatmap"],
                    ] as const
                  ).map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setDisplayMode(key)}
                      className={`flex-1 rounded-lg py-1.5 text-[10px] font-medium transition ${
                        displayMode === key
                          ? isLight ? "bg-sky-500/15 text-sky-600" : "bg-sky-400/15 text-sky-300"
                          : isLight
                            ? "text-slate-400 hover:bg-black/[0.04] hover:text-slate-600"
                            : "text-white/40 hover:bg-white/[0.06] hover:text-white/70"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
  isLight,
}: {
  label: string;
  checked: boolean;
  onChange: () => void;
  isLight: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between">
      <span className={`text-[11px] ${isLight ? "text-slate-500" : "text-white/60"}`}>
        {label}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onChange}
        className={`relative h-5 w-9 rounded-full transition-colors ${
          checked
            ? isLight ? "bg-sky-500/40" : "bg-sky-400/40"
            : isLight ? "bg-black/10" : "bg-white/10"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-4" : ""
          }`}
        />
      </button>
    </label>
  );
}

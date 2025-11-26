"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

/* ======================= TYPES ======================= */

type SensorRow = {
  id: number;
  timestamp: string;
  suhu: number | null;
  kelembapan: number | null;
  cahaya: number | null;
  suara: number | null;
  timestamp_wib?: string;
};

type SetpointRow = {
  id: number;
  suhu_target: number | null;
  kelembapan_target: number | null;
  cahaya_target: number | null;
  suara_target: number | null;
};

type MetricKey = "suhu" | "kelembapan" | "cahaya" | "suara";

/* ======================= CONSTANTS ======================= */

const METRICS = [
  { key: "suhu" as MetricKey, label: "Suhu", unit: "°C" },
  { key: "kelembapan" as MetricKey, label: "Kelembapan", unit: "%" },
  { key: "cahaya" as MetricKey, label: "Cahaya", unit: "lux" },
  { key: "suara" as MetricKey, label: "Suara", unit: "dB" },
];

const toWIB = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

/* ======================= PAGE ======================= */

export default function DashboardPage() {
  const [data, setData] = useState<SensorRow[]>([]);
  const [loadingData, setLoadingData] = useState(true);

  const [setpoint, setSetpoint] = useState({
    suhu: 25,
    kelembapan: 60,
    cahaya: 300,
    suara: 50,
  });

  const [savingSetpoint, setSavingSetpoint] = useState(false);
  const [activeMetric, setActiveMetric] = useState<MetricKey>("suhu");

  /* ------------ FETCH SENSOR TANPA REALTIME ------------ */
  useEffect(() => {
    async function load() {
      setLoadingData(true);

      const { data, error } = await supabase
        .from("sensor_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(300);

      if (!error && data) {
        const sorted = [...data].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        setData(
          sorted.map((row) => ({
            ...row,
            timestamp_wib: toWIB(row.timestamp),
          }))
        );
      }

      setLoadingData(false);
    }

    load();
  }, []);

  /* ------------ FETCH SETPOINT ------------ */
  useEffect(() => {
    async function loadSetpoint() {
      const { data } = await supabase
        .from("setpoint")
        .select("*")
        .eq("id", 1)
        .maybeSingle<SetpointRow>();

      if (data) {
        setSetpoint({
          suhu: data.suhu_target ?? 25,
          kelembapan: data.kelembapan_target ?? 60,
          cahaya: data.cahaya_target ?? 300,
          suara: data.suara_target ?? 50,
        });
      }
    }

    loadSetpoint();
  }, []);

  /* ------------ SAVE SETPOINT ------------ */
  const handleSaveSetpoint = async () => {
    setSavingSetpoint(true);

    await supabase.from("setpoint").upsert({
      id: 1,
      suhu_target: setpoint.suhu,
      kelembapan_target: setpoint.kelembapan,
      cahaya_target: setpoint.cahaya,
      suara_target: setpoint.suara,
      updated_at: new Date().toISOString(),
    });

    setSavingSetpoint(false);
  };

  const latest = data[data.length - 1] ?? null;
  const activeMeta = METRICS.find((m) => m.key === activeMetric)!;

  /* ======================= RENDER ======================= */

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <h1 className="text-xl font-bold">Ruang Iklim — Monitoring & Control</h1>

        {/* CARDS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {METRICS.map((m) => (
            <MetricCard
              key={m.key}
              label={m.label}
              unit={m.unit}
              value={latest ? (latest[m.key] as number | null) : null}
              active={activeMetric === m.key}
              onClick={() => setActiveMetric(m.key)}
            />
          ))}
        </div>

        {/* CHART */}
        <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
          <h3 className="font-semibold mb-2">
            Grafik {activeMeta.label} (WIB)
          </h3>

          {!loadingData && data.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp_wib" />
                  <YAxis />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey={activeMetric}
                    dot={false}
                    stroke="#22c55e"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-zinc-400 text-sm">Belum ada data.</p>
          )}
        </div>

        {/* SETPOINT */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Control Setpoint</h2>

          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
            <ControlRow
              label="Suhu (°C)"
              min={10}
              max={40}
              step={0.5}
              value={setpoint.suhu}
              onChange={(v) => setSetpoint((s) => ({ ...s, suhu: v }))}
            />

            <ControlRow
              label="Kelembapan (%)"
              min={20}
              max={100}
              step={1}
              value={setpoint.kelembapan}
              onChange={(v) => setSetpoint((s) => ({ ...s, kelembapan: v }))}
            />

            <ControlRow
              label="Cahaya (lux)"
              min={0}
              max={1000}
              step={10}
              value={setpoint.cahaya}
              onChange={(v) => setSetpoint((s) => ({ ...s, cahaya: v }))}
            />

            <ControlRow
              label="Suara (dB)"
              min={0}
              max={120}
              step={1}
              value={setpoint.suara}
              onChange={(v) => setSetpoint((s) => ({ ...s, suara: v }))}
            />

            <button
              onClick={handleSaveSetpoint}
              disabled={savingSetpoint}
              className="bg-emerald-500 text-black px-4 py-2 rounded-lg"
            >
              {savingSetpoint ? "Menyimpan..." : "Simpan Setpoint"}
            </button>
          </div>
        </section>
      </div>
    </main>
  );
}

/* ======================= COMPONENTS ======================= */

function MetricCard({
  label,
  unit,
  value,
  active,
  onClick,
}: {
  label: string;
  unit: string;
  value: number | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`p-4 bg-zinc-900 rounded-xl border ${
        active ? "border-emerald-400" : "border-zinc-800"
      }`}
    >
      <p className="text-xs text-zinc-400">{label}</p>
      <p className="text-2xl font-bold">
        {value != null ? value.toFixed(1) : "--"}
        <span className="text-sm ml-1">{unit}</span>
      </p>
    </button>
  );
}

function ControlRow({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (v: number) => void;
}) {
  const id = label.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm">
        <label htmlFor={id}>{label}</label>
        <span>{value}</span>
      </div>

      <input
        id={id + "-slider"}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />

      <input
        id={id + "-number"}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-32 px-2 py-1 bg-black border border-zinc-700 rounded-lg text-sm"
      />
    </div>
  );
}

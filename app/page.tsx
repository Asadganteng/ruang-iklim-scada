"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
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

/* ======================= DEMO MODE ======================= */

// true  = pakai data simulasi (grafik hidup, mendekati setpoint)
// false = pakai data asli dari Supabase (sensor_logs)
const DEMO_MODE = false;


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

const METRICS: { key: MetricKey; label: string; unit: string }[] = [
  { key: "suhu", label: "Suhu", unit: "°C" },
  { key: "kelembapan", label: "Kelembapan", unit: "%" },
  { key: "cahaya", label: "Cahaya", unit: "lux" },
  { key: "suara", label: "Suara", unit: "dB" },
];

const toWIB = (iso: string) =>
  new Date(iso).toLocaleTimeString("id-ID", {
    timeZone: "Asia/Jakarta",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

function generateDemoData(
  base: { suhu: number; kelembapan: number; cahaya: number; suara: number },
  last?: SensorRow
): SensorRow {
  const noise = (range: number) => Math.random() * range * 2 - range;

  return {
    id: (last?.id || 0) + 1,
    timestamp: new Date().toISOString(),
    timestamp_wib: toWIB(new Date().toISOString()),
    suhu: base.suhu + noise(0.3), // sangat stabil di sekitar setpoint
    kelembapan: base.kelembapan + noise(1),
    cahaya: base.cahaya + noise(5),
    suara: base.suara + noise(2),
  };
}

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

  const [demoBase, setDemoBase] = useState({
    suhu: 25,
    kelembapan: 60,
    cahaya: 300,
    suara: 50,
  });

  const [activeMetric, setActiveMetric] = useState<MetricKey>("suhu");

  /* ------------ FETCH SENSOR / DEMO DATA ------------ */

  useEffect(() => {
    if (DEMO_MODE) {
      setLoadingData(false);
      const interval = setInterval(() => {
        setData((prev) => {
          const last = prev.length > 0 ? prev[prev.length - 1] : undefined;
          const next = generateDemoData(demoBase, last);
          const trimmed =
            prev.length >= 500 ? prev.slice(prev.length - 499) : prev;
          return [...trimmed, next];
        });
      }, 1000); // update tiap 1 detik

      return () => clearInterval(interval);
    }

    // MODE NORMAL (ambil dari Supabase)
    const fetchInitial = async () => {
      setLoadingData(true);

      const { data, error } = await supabase
        .from("sensor_logs")
        .select("*")
        .order("timestamp", { ascending: false })
        .limit(500);

      if (!error && data) {
        const sorted = [...data].sort(
          (a, b) =>
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        const withWIB = sorted.map((row) => ({
          ...row,
          timestamp_wib: toWIB(row.timestamp),
        }));

        setData(withWIB);
      }

      setLoadingData(false);
    };

    fetchInitial();

    const channel = supabase
      .channel("realtime:sensor_logs")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "sensor_logs" },
        (payload: any) => {
          const r: SensorRow = payload.new;
          r.timestamp_wib = toWIB(r.timestamp);

          setData((prev) => {
            const updated = [...prev, r];
            if (updated.length > 1000) updated.shift();
            return updated;
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [demoBase]);

  /* ------------ FETCH SETPOINT ------------ */

  useEffect(() => {
    const load = async () => {
      const { data, error } = await supabase
        .from("setpoint")
        .select("*")
        .eq("id", 1)
        .maybeSingle<SetpointRow>();

      if (error || !data) return;

      const s = {
        suhu: data.suhu_target ?? 25,
        kelembapan: data.kelembapan_target ?? 60,
        cahaya: data.cahaya_target ?? 300,
        suara: data.suara_target ?? 50,
      };

      setSetpoint(s);

      if (DEMO_MODE) {
        setDemoBase(s);
      }
    };

    load();
  }, []);

  /* ------------ UPDATE DEMO BASE KALAU SETPOINT BERUBAH ------------ */

  useEffect(() => {
    if (!DEMO_MODE) return;
    setDemoBase(setpoint);
  }, [setpoint.suhu, setpoint.kelembapan, setpoint.cahaya, setpoint.suara]);

  /* ------------ SAVE SETPOINT ------------ */

  const handleSaveSetpoint = async () => {
    setSavingSetpoint(true);

    const { error } = await supabase.from("setpoint").upsert({
      id: 1,
      suhu_target: setpoint.suhu,
      kelembapan_target: setpoint.kelembapan,
      cahaya_target: setpoint.cahaya,
      suara_target: setpoint.suara,
      updated_at: new Date().toISOString(),
    });

    if (error) {
      alert("Gagal menyimpan setpoint!");
    } else if (DEMO_MODE) {
      setDemoBase(setpoint);
    }

    setSavingSetpoint(false);
  };

  const latest = data.length > 0 ? data[data.length - 1] : null;
  const activeMeta = METRICS.find((m) => m.key === activeMetric)!;

  /* ======================= RENDER ======================= */

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">
              Ruang Iklim — Monitoring & Control
            </h1>
            <p className="text-xs text-zinc-400">
              {DEMO_MODE
                ? "MODE DEMO AKTIF — grafik simulasi mendekati setpoint."
                : "MODE REALTIME — data diambil dari Supabase sensor_logs."}
            </p>
          </div>
        </header>

        {/* CARDS */}
        <section className="space-y-4">
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

          {/* CHART DINAMIS */}
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <h3 className="font-semibold mb-2">
              Trend {activeMeta.label} (WIB)
            </h3>

            {!loadingData && data.length > 0 ? (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp_wib" />
                    <YAxis />
                    <Tooltip labelFormatter={(l) => l} />
                    <Line
                      type="monotone"
                      dataKey={activeMetric}
                      dot={false}
                      stroke="#4ade80"
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-zinc-400 text-sm">Belum ada data.</p>
            )}
          </div>

          {/* CHART MULTI-LINE */}
          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800">
            <h3 className="font-semibold mb-2">
              Analytics Multi-Line (WIB)
            </h3>

            {!loadingData && data.length > 0 ? (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="timestamp_wib" />
                    <YAxis />
                    <Tooltip labelFormatter={(l) => l} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="suhu"
                      name="Suhu (°C)"
                      stroke="#22c55e"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="kelembapan"
                      name="Kelembapan (%)"
                      stroke="#3b82f6"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="cahaya"
                      name="Cahaya (lux)"
                      stroke="#eab308"
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="suara"
                      name="Suara (dB)"
                      stroke="#f97316"
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="text-zinc-400 text-sm">Belum ada data.</p>
            )}
          </div>
        </section>

        {/* CONTROL SETPOINT */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Control Setpoint</h2>

          <div className="bg-zinc-900 rounded-xl p-4 border border-zinc-800 space-y-4">
            <ControlRow
              label="Suhu Target (°C)"
              min={15}
              max={40}
              step={0.5}
              value={setpoint.suhu}
              onChange={(v) => setSetpoint((s) => ({ ...s, suhu: v }))}
            />
            <ControlRow
              label="Kelembapan Target (%)"
              min={20}
              max={100}
              step={1}
              value={setpoint.kelembapan}
              onChange={(v) => setSetpoint((s) => ({ ...s, kelembapan: v }))}
            />
            <ControlRow
              label="Cahaya Target (lux)"
              min={0}
              max={1000}
              step={10}
              value={setpoint.cahaya}
              onChange={(v) => setSetpoint((s) => ({ ...s, cahaya: v }))}
            />
            <ControlRow
              label="Suara Target (dB)"
              min={0}
              max={120}
              step={1}
              value={setpoint.suara}
              onChange={(v) => setSetpoint((s) => ({ ...s, suara: v }))}
            />

            <button
              onClick={handleSaveSetpoint}
              className="px-4 py-2 bg-emerald-500 text-black rounded-lg font-semibold"
              disabled={savingSetpoint}
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
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />

      <label htmlFor={id + "-number"} className="text-xs text-zinc-400">
        Masukkan nilai {label}
      </label>
      <input
        id={id + "-number"}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-1 w-32 px-2 py-1 bg-black border border-zinc-700 rounded-lg text-sm"
      />
    </div>
  );
}

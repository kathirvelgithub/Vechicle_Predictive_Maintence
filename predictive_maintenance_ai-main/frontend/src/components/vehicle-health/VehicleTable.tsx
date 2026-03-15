import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
  ColumnDef,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table';

// UI Components
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Search, Filter, Download, ArrowUpDown, ChevronLeft, ChevronRight, Thermometer, Droplet, Zap } from 'lucide-react';

// API & Data
import { api, VehicleSummary } from '../../services/api';
import { stream } from '../../services/stream';

// =========================================================
// 🖼️ SMART IMAGE SELECTOR
// =========================================================
const getVehicleImage = (model: string) => {
  if (model.includes('Thar')) return 'https://i.pinimg.com/736x/e6/60/40/e660403a381aad173d1badfef26f4940.jpg';
  if (model.includes('Scorpio N')) return 'https://i.pinimg.com/1200x/c6/8c/93/c68c93824a95b83b4dbe91427aac8d1a.jpg';
  if (model.includes('Scorpio Classic')) return 'https://i.pinimg.com/736x/f2/cf/5e/f2cf5ef4e4b51d29e3420fc32105c3ca.jpg';
  if (model.includes('XUV 3XO')) return 'https://i.pinimg.com/736x/ef/63/1a/ef631aa7b136ab89aa3b9032ca948ca9.jpg';
  if (model.includes('XUV700')) return 'https://i.pinimg.com/736x/8e/17/c3/8e17c39f9b780e88a10c2044b838f61e.jpg'; 
  if (model.includes('City')) return 'https://i.pinimg.com/1200x/4c/87/2c/4c872ce00a4f8356cefb005088f3b8bf.jpg'; 
  if (model.includes('Elevate')) return 'https://i.pinimg.com/1200x/a6/42/c4/a642c4eaf195c46ef3adbc1e13dac0e4.jpg'; 
  if (model.includes('HeavyHaul')) return 'https://i.pinimg.com/736x/f2/cf/5e/f2cf5ef4e4b51d29e3420fc32105c3ca.jpg';
  if (model.includes('Mahindra BE 6 Batman Edition')) return 'https://i.pinimg.com/736x/dc/5d/d1/dc5dd16571c1d804e9a4ef969e115112.jpg';
  if (model.includes('Mahindra BE 6')) return 'https://imgd.aeplcdn.com/664x374/n/cw/ec/131825/be-6-exterior-right-front-three-quarter-6.png?isig=0&q=80';
  if (model.includes('Mahindra XEV 9S')) return 'https://imgd.aeplcdn.com/642x361/n/cw/ec/212003/xev9s-exterior-right-front-three-quarter-11.png?isig=0&q=75';
  if (model.includes('MG Windsor EV')) return 'https://i.pinimg.com/1200x/2d/ae/65/2dae657c7e74c1cd01784dad041799a7.jpg';
  if(model.includes('BMW I7')) return 'https://i.pinimg.com/736x/c7/dd/87/c7dd874870c2da409fb6bf4bfb90e94d.jpg';
  if (model.includes('Audi e-tron GT')) return 'https://i.pinimg.com/736x/f8/35/a3/f835a3db74f463fc1d221028f6de05d3.jpg';
  if(model.includes('Volvo EC40')) return 'https://i.pinimg.com/1200x/dc/81/00/dc81008bc6afb0a656d508aad5103ff6.jpg';
  if(model.includes('Porsche Taycan')) return 'https://imgd.aeplcdn.com/664x374/n/cw/ec/45063/taycan-exterior-right-front-three-quarter-6.png?isig=0&q=80';
  
};

const STREAM_CONNECTED_POLL_MS = 15000;
const STREAM_FALLBACK_POLL_MS = 2500;
const STREAM_STALE_AFTER_MS = 7000;

const normalizeVehicleId = (value: unknown): string => {
  if (typeof value !== 'string') {
    return '';
  }
  return value.trim().toUpperCase();
};

const toFiniteNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeMetric = (value: unknown, fallback: number, digits = 1): number => {
  const parsed = toFiniteNumber(value, fallback);
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

const formatMetric = (value: number, digits = 1): string => {
  if (!Number.isFinite(value)) {
    return '--';
  }

  const normalized = normalizeMetric(value, value, digits);
  return Number.isInteger(normalized) ? `${normalized}` : normalized.toFixed(digits);
};

const normalizeVehicleSummary = (vehicle: VehicleSummary): VehicleSummary => {
  return {
    ...vehicle,
    vin: normalizeVehicleId(vehicle.vin),
    engine_temp: normalizeMetric(vehicle.engine_temp, 0),
    oil_pressure: normalizeMetric(vehicle.oil_pressure, 0),
    battery_voltage: normalizeMetric(vehicle.battery_voltage, 24.0),
    probability: vehicle.probability > 0 ? vehicle.probability : 15,
    predictedFailure: vehicle.probability > 0 ? vehicle.predictedFailure : "System Healthy",
  };
};

interface VehicleTableProps {
  onSelectVehicle: (vin: string) => void;
  selectedVehicle: string | null;
}

export function VehicleTable({ onSelectVehicle, selectedVehicle }: VehicleTableProps) {
  const [data, setData] = useState<VehicleSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasFreshStream, setHasFreshStream] = useState(false);
  const staleStreamTimerRef = useRef<number | null>(null);
  
  // Table State
  const [sorting, setSorting] = useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([]);
  const [globalFilter, setGlobalFilter] = useState('');

  const clearStaleStreamTimer = useCallback(() => {
    if (staleStreamTimerRef.current !== null) {
      window.clearTimeout(staleStreamTimerRef.current);
      staleStreamTimerRef.current = null;
    }
  }, []);

  const markStreamHeartbeat = useCallback(() => {
    setHasFreshStream(true);
    clearStaleStreamTimer();
    staleStreamTimerRef.current = window.setTimeout(() => {
      setHasFreshStream(false);
      staleStreamTimerRef.current = null;
    }, STREAM_STALE_AFTER_MS);
  }, [clearStaleStreamTimer]);

  const loadFleet = useCallback(async () => {
    try {
      const result = await api.getFleetStatus();
      setData(result.map(normalizeVehicleSummary));
    } catch (err) {
      console.error("Failed to load fleet", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  useEffect(() => {
    stream.start();

    const unsubscribeConnection = stream.subscribeConnection((connected) => {
      if (!connected) {
        clearStaleStreamTimer();
        setHasFreshStream(false);
      }
    });

    const unsubscribeEvents = stream.subscribe((event) => {
      const payload = event.payload ?? {};
      const vehicleId = normalizeVehicleId(payload.vehicle_id);
      if (!vehicleId) {
        return;
      }

      if (event.topic === "telemetry.latest") {
        markStreamHeartbeat();
        setData((previous) =>
          previous.map((vehicle) => {
            if (normalizeVehicleId(vehicle.vin) !== vehicleId) {
              return vehicle;
            }

            const riskLevel = String(payload.risk_level ?? "").toUpperCase();
            const anomalyDetected = Boolean(payload.anomaly_detected);
            const anomalyLevel = String(payload.anomaly_level ?? "").toUpperCase();
            const nextRisk = Math.round(
              Math.max(0, Math.min(100, toFiniteNumber(payload.risk_score, vehicle.probability)))
            );

            let nextAction = vehicle.action;
            if (!vehicle.action.includes("Booked")) {
              if (riskLevel === "CRITICAL") {
                nextAction = "Critical Alert";
              } else if (riskLevel === "HIGH" || anomalyDetected) {
                nextAction = "Watch Alert";
              } else {
                nextAction = "Monitoring";
              }
            }

            const nextFailure =
              anomalyDetected && anomalyLevel
                ? `Anomaly ${anomalyLevel}`
                : vehicle.predictedFailure || "System Healthy";

            return {
              ...vehicle,
              telematics: "Live",
              engine_temp: normalizeMetric(payload.engine_temp_c, vehicle.engine_temp || 0),
              oil_pressure: normalizeMetric(payload.oil_pressure_psi, vehicle.oil_pressure || 0),
              battery_voltage: normalizeMetric(payload.battery_voltage, vehicle.battery_voltage || 24),
              probability: nextRisk,
              action: nextAction,
              predictedFailure: nextFailure,
            };
          })
        );
        return;
      }

      if (event.topic === "anomaly.event") {
        const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
        const firstReason = reasons.length > 0 ? String(reasons[0]) : "";

        setData((previous) =>
          previous.map((vehicle) => {
            if (normalizeVehicleId(vehicle.vin) !== vehicleId) {
              return vehicle;
            }

            const riskLevel = String(payload.risk_level ?? "HIGH").toUpperCase();
            const nextRisk = Math.round(
              Math.max(0, Math.min(100, toFiniteNumber(payload.risk_score, vehicle.probability)))
            );

            return {
              ...vehicle,
              probability: nextRisk,
              predictedFailure: firstReason || `Anomaly ${String(payload.anomaly_level ?? "WATCH")}`,
              action: riskLevel === "CRITICAL" ? "Critical Alert" : "Watch Alert",
            };
          })
        );
        return;
      }

      if (event.topic === "analysis.completed") {
        const bookingId = typeof payload.booking_id === "string" ? payload.booking_id : "";

        setData((previous) =>
          previous.map((vehicle) => {
            if (normalizeVehicleId(vehicle.vin) !== vehicleId) {
              return vehicle;
            }

            const riskLevel = String(payload.risk_level ?? "LOW").toUpperCase();
            const nextRisk = Math.round(
              Math.max(0, Math.min(100, toFiniteNumber(payload.risk_score, vehicle.probability)))
            );

            return {
              ...vehicle,
              probability: nextRisk,
              action:
                bookingId || vehicle.action.includes("Booked")
                  ? "Service Booked"
                  : riskLevel === "CRITICAL"
                    ? "Critical Alert"
                    : riskLevel === "HIGH"
                      ? "Watch Alert"
                      : "Monitoring",
            };
          })
        );
      }
    });

    return () => {
      clearStaleStreamTimer();
      unsubscribeConnection();
      unsubscribeEvents();
    };
  }, [clearStaleStreamTimer, markStreamHeartbeat]);

  useEffect(() => {
    const intervalMs = hasFreshStream ? STREAM_CONNECTED_POLL_MS : STREAM_FALLBACK_POLL_MS;
    const intervalId = window.setInterval(() => {
      void loadFleet();
    }, intervalMs);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [hasFreshStream, loadFleet]);

  // 2. DEFINE COLUMNS
  const columns = useMemo<ColumnDef<VehicleSummary>[]>(() => [
    {
      accessorKey: "image",
      header: "Image",
      cell: ({ row }) => (
        <div className="w-16 h-10 rounded overflow-hidden border border-slate-200 bg-slate-100 flex-shrink-0">
          <img 
            src={getVehicleImage(row.original.model)} 
            alt="Vehicle" 
            className="w-full h-full object-cover" 
          />
        </div>
      ),
    },
    {
      accessorKey: "vin",
      header: ({ column }) => (
        <Button variant="ghost" className="pl-0 hover:bg-transparent" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
          VIN <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ getValue }) => <span className="font-mono font-medium">{getValue() as string}</span>,
    },
    {
      accessorKey: "model",
      header: "Model",
      cell: ({ getValue }) => <span className="font-semibold text-slate-700">{getValue() as string}</span>,
    },
    
    // ✅ NEW COLUMN: Engine Temp
    {
      accessorKey: "engine_temp",
      header: "Temp",
      cell: ({ row }) => {
        const temp = normalizeMetric(row.original.engine_temp, 0);
        const isHot = temp > 105;
        return (
          <div className={`flex items-center gap-1 font-mono font-medium ${isHot ? "text-red-600 animate-pulse font-bold" : "text-slate-600"}`}>
             <Thermometer size={14} /> {formatMetric(temp)}°C
          </div>
        );
      },
    },

    // ✅ NEW COLUMN: Oil Pressure
    {
      accessorKey: "oil_pressure",
      header: "Oil (PSI)",
      cell: ({ row }) => {
        const oil = normalizeMetric(row.original.oil_pressure, 0);
        const isLow = oil < 20;
        return (
          <div className={`flex items-center gap-1 font-mono font-medium ${isLow ? "text-amber-600 font-bold" : "text-slate-600"}`}>
             <Droplet size={14} /> {formatMetric(oil)}
          </div>
        );
      },
    },

    // ✅ NEW COLUMN: Battery
    {
      accessorKey: "battery_voltage",
      header: "Batt (V)",
      cell: ({ row }) => {
        const battery = normalizeMetric(row.original.battery_voltage, 24);
        return (
          <div className="flex items-center gap-1 font-mono text-slate-600">
             <Zap size={14} className="text-yellow-500 fill-yellow-500" /> {formatMetric(battery)}V
          </div>
        );
      },
    },

    {
      accessorKey: "predictedFailure",
      header: "Diagnosis",
      cell: ({ row }) => {
        const prob = row.original.probability;
        return (
          <span className={`text-xs font-bold px-2 py-1 rounded ${
            prob >= 80 ? 'bg-red-100 text-red-700' : 
            prob >= 50 ? 'bg-amber-100 text-amber-700' : 
            'bg-slate-100 text-slate-600'
          }`}>
            {row.original.predictedFailure}
          </span>
        );
      },
    },
    {
      accessorKey: "action",
      header: "Status",
      cell: ({ getValue }) => {
        const status = getValue() as string;
        let style = 'border-slate-200 bg-slate-50 text-slate-600';
        if (status.includes('Booked')) style = 'border-green-200 bg-green-50 text-green-700';
        if (status.includes('Critical')) style = 'border-red-200 bg-red-50 text-red-700 animate-pulse';
        
        return <Badge variant="outline" className={`text-xs font-normal border ${style}`}>{status}</Badge>;
      }
    }
  ], []);

  // 3. INITIALIZE TABLE ENGINE
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: (row, columnId, filterValue) => {
      const safeValue = String(row.getValue(columnId) || "");
      return safeValue.toLowerCase().includes(filterValue.toLowerCase());
    }
  });

  // 4. HANDLE EXPORT
  const handleExport = () => {
    const rows = table.getFilteredRowModel().rows;
    if (!rows || rows.length === 0) {
        alert("No data available to export.");
        return;
    }

    const headers = [
        "VIN", "Model", "Temp (C)", "Oil (PSI)", "Batt (V)", "Diagnosis", "Risk %", "Status"
    ];

    const escapeCsv = (str: any) => {
        if (str === null || str === undefined) return "";
        const stringValue = String(str);
        if (stringValue.includes(",")) return `"${stringValue}"`;
        return stringValue;
    };

    const csvRows = rows.map(row => {
        const r = row.original;
        return [
            escapeCsv(r.vin),
            escapeCsv(r.model),
            escapeCsv(r.engine_temp),
            escapeCsv(r.oil_pressure),
            escapeCsv(r.battery_voltage),
            escapeCsv(r.predictedFailure),
            escapeCsv(r.probability),
            escapeCsv(r.action)
        ].join(",");
    });

    const csvContent = [headers.join(","), ...csvRows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `Fleet_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <Card className="shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Vehicle Fleet Overview</CardTitle>
          <div className="flex items-center space-x-2">
            <Badge
              variant="outline"
              className={hasFreshStream ? "border-green-200 bg-green-50 text-green-700" : "border-amber-200 bg-amber-50 text-amber-700"}
            >
              {hasFreshStream ? "Stream Live" : "Polling Fallback"}
            </Badge>
            
            {/* 🔍 SEARCH BAR */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input 
                placeholder="Search VIN, Model..." 
                value={globalFilter ?? ''}
                onChange={(event) => setGlobalFilter(event.target.value)}
                className="pl-9 w-64 h-9" 
              />
            </div>
            
            {/* ⚡ EXPORT BUTTON */}
            <Button 
                variant="outline" 
                size="sm" 
                className="h-9" 
                onClick={handleExport}
                title="Download as CSV"
            >
                <Download className="w-4 h-4 mr-2" /> 
                Export
            </Button>

          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader className="bg-slate-50">
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id} className="text-slate-500 font-medium">
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow
                    key={row.id}
                    data-state={row.getIsSelected() && "selected"}
                    onClick={() => onSelectVehicle(row.original.vin)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${selectedVehicle === row.original.vin ? 'bg-blue-50 border-l-4 border-blue-500' : ''}`}
                  >
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id} className="py-3 align-middle">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center text-slate-500">
                    {loading ? "Loading Fleet Data..." : "No results found."}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* PAGINATION */}
        <div className="flex items-center justify-end space-x-2 py-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
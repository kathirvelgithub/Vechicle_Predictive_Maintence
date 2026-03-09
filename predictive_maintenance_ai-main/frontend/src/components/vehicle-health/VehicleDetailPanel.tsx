import { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowLeft, Play, AlertTriangle, Activity, 
  Thermometer, Droplets, Gauge, Download, Zap, User, MapPin, Calendar, Phone, FileText, CheckCircle2, Car, Settings
} from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import ReactMarkdown from 'react-markdown'; 

import { api, TelematicsData, AnalysisResult } from '../../services/api';
import { ServiceBookingModal } from './ServiceBookingModal';

// --- IMAGE HELPER ---
const getVehicleImage = (model: string) => {
  if (!model) return 'https://via.placeholder.com/800x400?text=Vehicle+Image';
  if (model.includes('Thar')) return 'https://i.pinimg.com/736x/e6/60/40/e660403a381aad173d1badfef26f4940.jpg';
  if (model.includes('Scorpio N')) return 'https://i.pinimg.com/1200x/c6/8c/93/c68c93824a95b83b4dbe91427aac8d1a.jpg';
  if (model.includes('Scorpio Classic')) return 'https://i.pinimg.com/736x/f2/cf/5e/f2cf5ef4e4b51d29e3420fc32105c3ca.jpg';
  if (model.includes('XUV 3XO')) return 'https://i.pinimg.com/736x/ef/63/1a/ef631aa7b136ab89aa3b9032ca948ca9.jpg';
  if (model.includes('XUV700')) return 'https://i.pinimg.com/736x/8e/17/c3/8e17c39f9b780e88a10c2044b838f61e.jpg'; 
  if (model.includes('City')) return 'https://i.pinimg.com/1200x/4c/87/2c/4c872ce00a4f8356cefb005088f3b8bf.jpg'; 
  if (model.includes('Elevate')) return 'https://i.pinimg.com/1200x/a6/42/c4/a642c4eaf195c46ef3adbc1e13dac0e4.jpg'; 
  if (model.includes('Mahindra BE 6 Batman Edition')) return 'https://i.pinimg.com/736x/dc/5d/d1/dc5dd16571c1d804e9a4ef969e115112.jpg';
  if (model.includes('Mahindra BE 6')) return 'https://imgd.aeplcdn.com/664x374/n/cw/ec/131825/be-6-exterior-right-front-three-quarter-6.png?isig=0&q=80';
  if (model.includes('Mahindra XEV 9S')) return 'https://imgd.aeplcdn.com/642x361/n/cw/ec/212003/xev9s-exterior-right-front-three-quarter-11.png?isig=0&q=75';
  if (model.includes('MG Windsor EV')) return 'https://i.pinimg.com/1200x/2d/ae/65/2dae657c7e74c1cd01784dad041799a7.jpg';
  if(model.includes('BMW I7')) return 'https://i.pinimg.com/736x/c7/dd/87/c7dd874870c2da409fb6bf4bfb90e94d.jpg';
  if (model.includes('Audi e-tron GT')) return 'https://i.pinimg.com/736x/f8/35/a3/f835a3db74f463fc1d221028f6de05d3.jpg';
  if(model.includes('Volvo EC40')) return 'https://i.pinimg.com/1200x/dc/81/00/dc81008bc6afb0a656d508aad5103ff6.jpg';
  if(model.includes('Porsche Taycan')) return 'https://imgd.aeplcdn.com/664x374/n/cw/ec/45063/taycan-exterior-right-front-three-quarter-6.png?isig=0&q=80';
  return 'https://via.placeholder.com/800x400?text=Vehicle+Image';
};

interface VehicleDetailPanelProps {
  vehicleId: string;
  onClose: () => void;
}

export function VehicleDetailPanel({ vehicleId, onClose }: VehicleDetailPanelProps) {
  const [telematics, setTelematics] = useState<TelematicsData | null>(null);
  const [metadata, setMetadata] = useState<any>(null); 
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]); 
  const [showBooking, setShowBooking] = useState(false);
  
  const hasAutoRun = useRef(false);

  // --- AI RUNNER ---
  const handleRunAI = useCallback(async (auto = false) => {
    if (loading) return; 
    setLoading(true);
    try {
        const result = await api.runPrediction(vehicleId);
        setAnalysis(result);
        if (auto) hasAutoRun.current = true;
    } catch (e) {
        console.error("AI Error", e);
    }
    setLoading(false);
  }, [vehicleId, loading]);

  // --- FETCH LOOP (WITH ABORT CONTROLLER) ---
  useEffect(() => {
    const controller = new AbortController();
    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    console.log(`🚀 SWITCHING TO: ${vehicleId}`);

    // Initial Reset for Loader
    setMetadata(null);
    setTelematics(null);
    setChartData([]);
    setAnalysis(null);

    // 1. Fetch Metadata (Car & Owner)
    const fetchMetadata = async () => {
        if (!isMounted) return;
        try {
            const fleet = await api.getFleetStatus();
            const car: any = fleet.find((v: any) => v.vin === vehicleId);
            
            if (isMounted) {
                if (car) {
                    setMetadata(car);
                } else {
                    setMetadata({
                        vin: vehicleId,
                        model: "Unknown Model",
                        registration_no: "N/A",
                        status: "Active",
                        owners: { full_name: "Unknown", phone_number: "", address: "" }
                    });
                }
            }
        } catch (err) { 
            console.error("Meta fetch error", err); 
        }
    };

    // 2. Fetch Live Telematics
    const fetchLive = async () => {
      if (!isMounted) return;
      try {
        const data = await api.getTelematics(vehicleId);
        if (isMounted && data) {
            setTelematics(data);
            setChartData(prev => {
                const newPoint = {
                    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    engineTemp: data.engine_temp_c,
                    oilPressure: data.oil_pressure_psi,
                    battery: data.battery_voltage || 24.0,
                };
                return [...prev, newPoint].slice(-20); 
            });
        }
      } catch (err) {
          // Silent error
      }
    };

    fetchMetadata();
    fetchLive(); 
    intervalId = setInterval(fetchLive, 2000); 
    
    return () => {
        isMounted = false;
        clearInterval(intervalId);
        controller.abort(); 
    };
  }, [vehicleId]);

  // --- AUTO TRIGGER AI ---
  useEffect(() => {
    if (!telematics) return;
    const isCritical = telematics.engine_temp_c > 105 || telematics.oil_pressure_psi < 20;
    if (isCritical && !analysis && !loading && !hasAutoRun.current) {
        hasAutoRun.current = true;
        handleRunAI(true);
    }
  }, [telematics, analysis, loading, handleRunAI]); 

  // Helper: Status Colors
  const getRiskColor = (level?: string) => {
      if (level === 'CRITICAL') return 'bg-red-50 border-red-200 text-red-900';
      if (level === 'HIGH') return 'bg-orange-50 border-orange-200 text-orange-900';
      return 'bg-green-50 border-green-200 text-green-900';
  };

  // --- 🆕 LOADER ANIMATION ---
  if (!metadata) {
    return (
        <div className="fixed inset-0 bg-slate-50 z-50 flex items-center justify-center">
            <div className="loader"></div>
        </div>
    );
  }

  // --- MAIN RENDER ---
  return (
    <div className="fixed inset-0 bg-slate-50 z-50 overflow-y-auto animate-in slide-in-from-bottom duration-300">
      
      {/* TOP NAVBAR */}
      <div className="bg-white border-b sticky top-0 z-20 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-slate-100">
                <ArrowLeft className="w-6 h-6 text-slate-700" />
            </Button>
            <div>
                <h1 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                    {metadata?.model || "Vehicle Details"} 
                    <Badge variant="outline" className="text-xs font-normal bg-slate-100">
                        {metadata?.registration_no || metadata?.vin}
                    </Badge>
                </h1>
                <p className="text-xs text-slate-500">Fleet Management / {vehicleId}</p>
            </div>
        </div>
        <div className="flex gap-2">
            <Badge variant="outline" className="px-3 py-1 bg-slate-100">
                {telematics ? <span className="text-green-600 flex items-center gap-1">● Live Stream</span> : "Connecting..."}
            </Badge>
            <Button onClick={onClose} variant="secondary">Close</Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

        {/* --- 1. HERO SECTION (Combined Info) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT: CAR IMAGE & STATS */}
            <Card className="lg:col-span-2 overflow-hidden shadow-md border-0">
                <div className="relative h-64 bg-slate-100 group">
                    <img 
                        src={getVehicleImage(metadata?.model)} 
                        alt="Vehicle" 
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-6 pt-20">
                        <h2 className="text-3xl font-bold text-white mb-1">{metadata?.model || "Loading..."}</h2>
                        <div className="flex gap-3 text-white/90 text-sm">
                            <span className="flex items-center gap-1"><Car className="w-4 h-4"/> Fleet ID: {metadata?.fleet_id || "FL-GEN-01"}</span>
                            <span className="opacity-50">|</span>
                            <span className="flex items-center gap-1"><MapPin className="w-4 h-4"/> {metadata?.location || "Tracking..."}</span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-4 divide-x border-t bg-white">
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold">Mileage</p>
                        <p className="text-lg font-semibold text-slate-900">12,450 km</p>
                    </div>
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold">Fuel</p>
                        <p className="text-lg font-semibold text-slate-900">Electric</p>
                    </div>
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold">Service Due</p>
                        <p className="text-lg font-semibold text-slate-900">{metadata?.last_service_date || "Oct 2025"}</p>
                    </div>
                    <div className="p-4 text-center">
                        <p className="text-xs text-slate-500 uppercase font-bold">Status</p>
                        <p className="text-lg font-semibold text-green-600">Active</p>
                    </div>
                </div>
            </Card>

            {/* RIGHT: OWNER INFO & VEHICLE PROFILE (Larger Fonts) */}
            <div className="space-y-6 flex flex-col h-full">
                
                {/* 1. Owner Card */}
                <Card className="shadow-sm border-0">
                    <CardHeader className="pb-3 bg-slate-50/50">
                        <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
                            <User className="w-5 h-5 text-blue-600"/> Owner Details
                        </CardTitle>
                    </CardHeader>
                    <Separator />
                    <CardContent className="pt-4 space-y-4">
                        <div>
                            <p className="font-bold text-slate-900 text-xl">{/* INCREASED SIZE */}
                                {metadata?.owners?.full_name || "Enterprise Fleet"}
                            </p>
                            <p className="text-base text-slate-500">{/* INCREASED SIZE */}
                                {metadata?.owners?.organization_name || "Logistics Partner"}
                            </p>
                            <div className="flex gap-2 mt-2">
                                <Badge variant="secondary" className="font-normal text-sm px-3 py-1">{/* INCREASED SIZE */}
                                    {metadata?.owners?.phone_number || "No Phone"}
                                </Badge>
                                <Badge variant="secondary" className="font-normal text-sm px-3 py-1">{/* INCREASED SIZE */}
                                    {metadata?.owners?.address || "TN"}
                                </Badge>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 pt-2">
                            <Button size="sm" variant="outline" className="flex-1 gap-2 border-blue-200 text-blue-700 hover:bg-blue-50">
                                <Phone className="w-4 h-4"/> Call
                            </Button>
                            <Button size="sm" variant="outline" className="flex-1 gap-2">
                                <MapPin className="w-4 h-4"/> Locate
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                {/* 2. Vehicle Profile (Mixed Static + Telematics Fields) */}
                <Card className="shadow-sm border-0 flex-1">
                    <CardHeader className="pb-3 border-b bg-slate-50/50">
                        <CardTitle className="text-lg flex items-center gap-2 text-slate-800">
                            <Settings className="w-5 h-5 text-blue-600"/> Vehicle Profile
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 space-y-0 text-base"> {/* Base Text Size Increased */}
                        {/* Static Rows */}
                        <div className="flex justify-between py-3 border-b border-slate-100">
                            <span className="text-slate-500 text-sm font-medium">Registration</span>
                            <span className="font-mono font-bold text-slate-900 text-lg">
                                {metadata?.registration_no || "N/A"}
                            </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                            <span className="text-slate-500 text-sm font-medium">VIN</span>
                            <span className="font-mono font-medium text-slate-700 text-base">{metadata?.vin}</span>
                        </div>
                        
                        {/* Telematics Fields (Previously Cards) - FIXED TYPESCRIPT */}
                        <div className="flex justify-between py-3 border-b border-slate-100 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Thermometer className="w-4 h-4 text-red-500"/> Engine Temp
                            </span>
                            <span className={`font-mono font-bold text-lg ${(telematics?.engine_temp_c ?? 0) > 105 ? "text-red-600 animate-pulse" : "text-slate-900"}`}>
                                {telematics?.engine_temp_c ?? "--"}°C
                            </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Droplets className="w-4 h-4 text-amber-500"/> Oil Pressure
                            </span>
                            <span className={`font-mono font-bold text-lg ${(telematics?.oil_pressure_psi ?? 0) < 20 ? "text-red-600" : "text-slate-900"}`}>
                                {telematics?.oil_pressure_psi ?? "--"} PSI
                            </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Zap className="w-4 h-4 text-yellow-500"/> Battery
                            </span>
                            <span className="font-mono font-bold text-slate-900 text-lg">
                                {telematics?.battery_voltage ?? "--"} V
                            </span>
                        </div>
                        <div className="flex justify-between py-3 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Gauge className="w-4 h-4 text-blue-500"/> RPM
                            </span>
                            <span className="font-mono font-bold text-slate-900 text-lg">
                                {telematics?.rpm ?? "--"}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>

        {/* --- 2. LIVE CHART --- */}
        <Card className="shadow-sm border-0">
            <CardHeader>
                <CardTitle className="text-sm text-slate-500 uppercase tracking-wider font-semibold">Live Telemetry History</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="time" hide />
                        <YAxis yAxisId="left" domain={['auto', 'auto']} hide />
                        <YAxis yAxisId="right" orientation="right" domain={[20, 30]} hide />
                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                        <Legend />
                        <Line yAxisId="left" type="monotone" dataKey="engineTemp" stroke="#ef4444" name="Temp" strokeWidth={2} dot={false} />
                        <Line yAxisId="left" type="monotone" dataKey="oilPressure" stroke="#f59e0b" name="Oil" strokeWidth={2} dot={false} />
                        <Line yAxisId="right" type="monotone" dataKey="battery" stroke="#eab308" name="Batt" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                    </LineChart>
                </ResponsiveContainer>
            </CardContent>
        </Card>

        {/* --- 3. AI REPORT SECTION (Fixed Visibility) --- */}
        <div className="pt-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600"/> Diagnostics Report
                </h3>
                {!analysis && (
                    <Button onClick={() => handleRunAI(false)} disabled={loading} size="sm">
                        {loading ? "Running Analysis..." : "Run Manual Diagnosis"}
                        {!loading && <Play className="w-3 h-3 ml-2"/>}
                    </Button>
                )}
            </div>

            {analysis ? (
                <Card className="shadow-lg border-0 overflow-hidden ring-1 ring-slate-200">
                    <div className="bg-slate-900 text-white p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-500/20 p-2 rounded-lg backdrop-blur-sm">
                                <Activity className="w-6 h-6 text-blue-400" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg">AI Analysis Complete</h3>
                                <p className="text-slate-400 text-xs">Generated via Google Gemini & CrewAI</p>
                            </div>
                        </div>
                        <Button variant="outline" size="sm" className="text-black bg-white hover:bg-slate-200 border-0">
                            <Download className="w-4 h-4 mr-2"/> PDF
                        </Button>
                    </div>
                    
                    <CardContent className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
                        {/* Diagnosis Text */}
                        <div className="lg:col-span-2 prose prose-slate max-w-none">
                            <ReactMarkdown 
                                components={{
                                    h3: ({children}) => <h3 className="text-lg font-bold text-blue-900 mt-4 mb-2 flex items-center gap-2">{children}</h3>,
                                    li: ({children}) => <li className="ml-4 list-disc marker:text-blue-500 mb-1">{children}</li>,
                                    strong: ({children}) => <span className="font-semibold text-slate-900 bg-yellow-50 px-1 rounded border border-yellow-200">{children}</span>,
                                }}
                            >
                                {analysis.diagnosis}
                            </ReactMarkdown>
                        </div>

                        {/* Action Panel */}
                        <div className="bg-slate-50 p-6 rounded-xl border border-slate-200 space-y-4 h-fit">
                            <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500 fill-amber-500"/> Recommended Actions
                            </h4>
                            
                            {analysis.ueba_alerts && analysis.ueba_alerts.length > 0 && (
                                <div className="bg-red-100 border border-red-200 text-red-800 p-3 rounded text-sm flex gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
                                    {analysis.ueba_alerts[0]?.message}
                                </div>
                            )}

                            <div className="text-sm text-slate-600 bg-white p-3 rounded border border-slate-100 italic">
                                "Immediate service recommended based on sensor anomalies."
                            </div>

                            <Button 
                                className={`w-full h-12 text-base shadow-lg ${analysis.booking_id ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                                onClick={() => !analysis.booking_id && setShowBooking(true)}
                                disabled={!!analysis.booking_id}
                            >
                                {analysis.booking_id ? "Service Scheduled ✅" : "Book Service Appointment"}
                            </Button>
                            
                            {analysis.booking_id && (
                                <div className="text-center text-xs text-slate-500 bg-slate-100 py-1 rounded">
                                    Ref ID: <span className="font-mono font-medium text-slate-700">{analysis.booking_id}</span>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="border-2 border-dashed border-slate-200 rounded-xl p-12 text-center bg-slate-50/50">
                    <p className="text-slate-500">No active diagnosis report. Click "Run Manual Diagnosis" or wait for auto-trigger.</p>
                </div>
            )}
        </div>

      </div>

      {/* --- MODAL --- */}
      {showBooking && (
        <ServiceBookingModal 
            vehicleId={vehicleId} 
            onClose={() => setShowBooking(false)} 
            onSuccess={() => handleRunAI(false)} 
        />
      )}
    </div>
  );
}
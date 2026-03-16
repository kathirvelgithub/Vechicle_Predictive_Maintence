import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import { stream } from '../../services/stream';
import { ServiceBookingModal } from './ServiceBookingModal';

// --- IMAGE HELPER ---
const getVehicleImage = (model: unknown) => {
    const safeModel = typeof model === 'string' ? model : '';
    if (!safeModel.trim()) return 'https://via.placeholder.com/800x400?text=Vehicle+Image';
    if (safeModel.includes('Thar')) return 'https://i.pinimg.com/736x/e6/60/40/e660403a381aad173d1badfef26f4940.jpg';
    if (safeModel.includes('Scorpio N')) return 'https://i.pinimg.com/1200x/c6/8c/93/c68c93824a95b83b4dbe91427aac8d1a.jpg';
    if (safeModel.includes('Scorpio Classic')) return 'https://i.pinimg.com/736x/f2/cf/5e/f2cf5ef4e4b51d29e3420fc32105c3ca.jpg';
    if (safeModel.includes('XUV 3XO')) return 'https://i.pinimg.com/736x/ef/63/1a/ef631aa7b136ab89aa3b9032ca948ca9.jpg';
    if (safeModel.includes('XUV700')) return 'https://i.pinimg.com/736x/8e/17/c3/8e17c39f9b780e88a10c2044b838f61e.jpg';
    if (safeModel.includes('City')) return 'https://i.pinimg.com/1200x/4c/87/2c/4c872ce00a4f8356cefb005088f3b8bf.jpg';
    if (safeModel.includes('Elevate')) return 'https://i.pinimg.com/1200x/a6/42/c4/a642c4eaf195c46ef3adbc1e13dac0e4.jpg';
    if (safeModel.includes('Mahindra BE 6 Batman Edition')) return 'https://i.pinimg.com/736x/dc/5d/d1/dc5dd16571c1d804e9a4ef969e115112.jpg';
    if (safeModel.includes('Mahindra BE 6')) return 'https://imgd.aeplcdn.com/664x374/n/cw/ec/131825/be-6-exterior-right-front-three-quarter-6.png?isig=0&q=80';
    if (safeModel.includes('Mahindra XEV 9S')) return 'https://imgd.aeplcdn.com/642x361/n/cw/ec/212003/xev9s-exterior-right-front-three-quarter-11.png?isig=0&q=75';
    if (safeModel.includes('MG Windsor EV')) return 'https://i.pinimg.com/1200x/2d/ae/65/2dae657c7e74c1cd01784dad041799a7.jpg';
    if (safeModel.includes('BMW I7')) return 'https://i.pinimg.com/736x/c7/dd/87/c7dd874870c2da409fb6bf4bfb90e94d.jpg';
    if (safeModel.includes('Audi e-tron GT')) return 'https://i.pinimg.com/736x/f8/35/a3/f835a3db74f463fc1d221028f6de05d3.jpg';
    if (safeModel.includes('Volvo EC40')) return 'https://i.pinimg.com/1200x/dc/81/00/dc81008bc6afb0a656d508aad5103ff6.jpg';
    if (safeModel.includes('Porsche Taycan')) return 'https://imgd.aeplcdn.com/664x374/n/cw/ec/45063/taycan-exterior-right-front-three-quarter-6.png?isig=0&q=80';
  return 'https://via.placeholder.com/800x400?text=Vehicle+Image';
};

interface VehicleDetailPanelProps {
  vehicleId: string;
  onClose: () => void;
}

interface ManualOverrideInfo {
    active: boolean;
    keys: string[];
}

type DiagnosisSourceKey = 'llm' | 'rules_fallback' | 'local_fallback' | 'unknown';

const STREAM_CONNECTED_POLL_MS = 15000;
const STREAM_FALLBACK_POLL_MS = 5000;
const STREAM_STALE_AFTER_MS = 7000;
const ANALYSIS_CONNECTED_REFRESH_MS = 30000;
const ANALYSIS_FALLBACK_REFRESH_MS = 7000;
const METADATA_FETCH_TIMEOUT_MS = 8000;

const createFallbackMetadata = (vehicleId: string) => ({
    vin: vehicleId,
    model: 'Unknown Model',
    registration_no: 'N/A',
    status: 'Active',
    owners: {
        full_name: 'Unknown',
        organization_name: 'Fleet Team',
        phone_number: '',
        address: '',
    },
});

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

const formatMetric = (value: unknown, digits = 1): string => {
    const normalized = normalizeMetric(value, 0, digits);
    return Number.isInteger(normalized) ? `${normalized}` : normalized.toFixed(digits);
};

const toDisplayText = (value: unknown, fallback: string): string => {
    if (typeof value === 'string') {
        const trimmed = value.trim();
        return trimmed ? trimmed : fallback;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value);
    }

    return fallback;
};

const normalizeTelematicsSnapshot = (data: TelematicsData): TelematicsData => {
    return {
        ...data,
        engine_temp_c: normalizeMetric(data.engine_temp_c, 0),
        oil_pressure_psi: normalizeMetric(data.oil_pressure_psi, 0),
        battery_voltage: normalizeMetric(data.battery_voltage, 24),
        rpm: Math.round(toFiniteNumber(data.rpm, 0)),
    };
};

const normalizeOverrideKeys = (value: unknown): string[] => {
    if (!Array.isArray(value)) {
        return [];
    }

    const cleaned = value
        .map((entry) => (typeof entry === 'string' ? entry.trim() : String(entry).trim()))
        .filter(Boolean);
    return Array.from(new Set(cleaned));
};

const parseManualOverrideInfo = (source: Record<string, unknown> | null | undefined): ManualOverrideInfo => {
    if (!source) {
        return { active: false, keys: [] };
    }

    const keys = normalizeOverrideKeys(source.manual_override_keys);
    const active = Boolean(source.manual_override_active || keys.length > 0);
    return {
        active,
        keys: active ? keys : [],
    };
};

const deriveLocalRisk = (snapshot: TelematicsData | null): { riskScore: number; riskLevel: string; issues: string[] } => {
    if (!snapshot) {
        return { riskScore: 0, riskLevel: 'LOW', issues: ['Telemetry unavailable'] };
    }

    const issues: string[] = [];
    let score = 0;

    const temp = toFiniteNumber(snapshot.engine_temp_c, 0);
    const oil = toFiniteNumber(snapshot.oil_pressure_psi, 0);
    const battery = toFiniteNumber(snapshot.battery_voltage, 24);
    const rpm = Math.round(toFiniteNumber(snapshot.rpm, 0));

    if (temp >= 112) {
        score += 45;
        issues.push(`Critical overheating (${temp.toFixed(1)}C)`);
    } else if (temp >= 102) {
        score += 20;
        issues.push(`High engine temperature (${temp.toFixed(1)}C)`);
    }

    if (oil <= 16) {
        score += 45;
        issues.push(`Critical low oil pressure (${oil.toFixed(1)} PSI)`);
    } else if (oil <= 24) {
        score += 25;
        issues.push(`Low oil pressure (${oil.toFixed(1)} PSI)`);
    }

    if (battery <= 11.6) {
        score += 25;
        issues.push(`Battery critically low (${battery.toFixed(1)} V)`);
    } else if (battery <= 12.1) {
        score += 10;
        issues.push(`Battery below normal (${battery.toFixed(1)} V)`);
    }

    if (rpm >= 4600) {
        score += 10;
        issues.push(`Sustained high RPM (${rpm})`);
    }

    const normalizedScore = Math.max(0, Math.min(100, score));
    const riskLevel = normalizedScore >= 75 ? 'CRITICAL' : normalizedScore >= 45 ? 'HIGH' : normalizedScore >= 20 ? 'MEDIUM' : 'LOW';

    return {
        riskScore: normalizedScore,
        riskLevel,
        issues: issues.length > 0 ? issues : ['No critical anomaly detected in latest telemetry'],
    };
};

const buildLocalFallbackAnalysis = (vehicleId: string, snapshot: TelematicsData | null, reason?: string): AnalysisResult => {
    const risk = deriveLocalRisk(snapshot);
    const topIssue = risk.issues[0];
    const fallbackReason = reason ? `frontend_local_fallback: ${reason}` : 'frontend_local_fallback';

    const diagnosis = [
        '### Issue Summary',
        `- Vehicle: ${vehicleId}`,
        `- Findings: ${risk.issues.join('; ')}`,
        '',
        '### Root Cause Analysis',
        `- Primary Cause: ${topIssue}`,
        '',
        '### Immediate Action Plan',
        `1. ${risk.riskLevel === 'CRITICAL' ? 'Stop vehicle operations and dispatch emergency support.' : risk.riskLevel === 'HIGH' ? 'Schedule same-day workshop inspection and restrict load.' : risk.riskLevel === 'MEDIUM' ? 'Book preventive service within 24-48 hours.' : 'Continue routine monitoring and maintenance.'}`,
        '2. Recheck telemetry trend after 10 minutes to confirm direction of change.',
        '',
        '### Risk Assessment',
        `- Severity: ${risk.riskLevel}`,
        `- Risk Score: ${risk.riskScore}`,
    ];

    if (reason) {
        diagnosis.push('', `> Fallback used: ${reason}`);
    }

    return {
        vehicle_id: vehicleId,
        risk_score: risk.riskScore,
        risk_level: risk.riskLevel,
        diagnosis: diagnosis.join('\n'),
        detected_issues: risk.issues,
        diagnosis_source: 'local_fallback',
        fallback_reason: fallbackReason,
    };
};

const resolveDiagnosisSource = (analysis: AnalysisResult | null): DiagnosisSourceKey => {
    if (!analysis) {
        return 'unknown';
    }

    const sourceRaw = String(analysis.diagnosis_source || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (sourceRaw === 'llm') {
        return 'llm';
    }
    if (sourceRaw === 'rules_fallback' || sourceRaw === 'fallback_rules' || sourceRaw === 'rule_fallback') {
        return 'rules_fallback';
    }
    if (sourceRaw.includes('local')) {
        return 'local_fallback';
    }

    const fallbackReason = String(analysis.fallback_reason || '').toLowerCase();
    if (fallbackReason.includes('frontend_local_fallback')) {
        return 'local_fallback';
    }
    if (fallbackReason) {
        return 'rules_fallback';
    }
    return 'unknown';
};

const getDiagnosisSourceMeta = (source: DiagnosisSourceKey) => {
    if (source === 'llm') {
        return {
            label: 'LLM Diagnosis',
            subtitle: 'Generated by model-assisted agent reasoning.',
            className: '!border-emerald-300 !bg-emerald-100 !text-emerald-900',
        };
    }
    if (source === 'rules_fallback') {
        return {
            label: 'Rules Fallback',
            subtitle: 'Generated by deterministic backend fallback logic.',
            className: '!border-amber-300 !bg-amber-100 !text-amber-900',
        };
    }
    if (source === 'local_fallback') {
        return {
            label: 'Local Fallback',
            subtitle: 'Generated in browser due to backend response failure.',
            className: '!border-sky-300 !bg-sky-100 !text-sky-900',
        };
    }
    return {
        label: 'Source Pending',
        subtitle: 'Diagnosis source metadata not available yet.',
        className: '!border-slate-300 !bg-slate-100 !text-slate-900',
    };
};

const formatFallbackReason = (reason: unknown): string | null => {
    const rawReason =
        typeof reason === 'string'
            ? reason
            : typeof reason === 'number' || typeof reason === 'boolean'
                ? String(reason)
                : '';

    if (!rawReason.trim()) {
        return null;
    }

    return rawReason
        .replace(/\|+/g, ' ')
        .replace(/_/g, ' ')
        .replace(/:+/g, ': ')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

const getRiskMeta = (riskLevel?: string) => {
    const normalized = String(riskLevel || 'LOW').toUpperCase();
    if (normalized === 'CRITICAL') {
        return {
            label: 'CRITICAL',
            badgeClass: '!border-rose-300 !bg-rose-100 !text-rose-900',
            panelClass: 'border-rose-200 bg-rose-50 text-rose-900',
            progressClass: 'bg-rose-500',
            guidance: 'Immediate stop and emergency support required.',
        };
    }
    if (normalized === 'HIGH') {
        return {
            label: 'HIGH',
            badgeClass: '!border-orange-300 !bg-orange-100 !text-orange-900',
            panelClass: 'border-orange-200 bg-orange-50 text-orange-900',
            progressClass: 'bg-orange-500',
            guidance: 'Urgent workshop check recommended today.',
        };
    }
    if (normalized === 'MEDIUM') {
        return {
            label: 'MEDIUM',
            badgeClass: '!border-amber-300 !bg-amber-100 !text-amber-900',
            panelClass: 'border-amber-200 bg-amber-50 text-amber-900',
            progressClass: 'bg-amber-500',
            guidance: 'Schedule preventive service in 24-48 hours.',
        };
    }

    return {
        label: 'LOW',
        badgeClass: '!border-emerald-300 !bg-emerald-100 !text-emerald-900',
        panelClass: 'border-emerald-200 bg-emerald-50 text-emerald-900',
        progressClass: 'bg-emerald-500',
        guidance: 'Continue monitoring under normal operations.',
    };
};

interface SectionErrorBoundaryProps {
    sectionName: string;
    fallback: React.ReactNode;
    children: React.ReactNode;
}

interface SectionErrorBoundaryState {
    hasError: boolean;
}

class SectionErrorBoundary extends React.Component<SectionErrorBoundaryProps, SectionErrorBoundaryState> {
    constructor(props: SectionErrorBoundaryProps) {
        super(props);
        this.state = {
            hasError: false,
        };
    }

    static getDerivedStateFromError(): SectionErrorBoundaryState {
        return {
            hasError: true,
        };
    }

    componentDidCatch(error: unknown): void {
        console.error(`[VehicleDetailPanel] ${this.props.sectionName} render failed:`, error);
    }

    render() {
        if (this.state.hasError) {
            return this.props.fallback;
        }

        return this.props.children;
    }
}

export function VehicleDetailPanel({ vehicleId, onClose }: VehicleDetailPanelProps) {
  const [telematics, setTelematics] = useState<TelematicsData | null>(null);
  const [metadata, setMetadata] = useState<any>(null); 
    const [metadataLoadError, setMetadataLoadError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]); 
  const [showBooking, setShowBooking] = useState(false);
    const [manualOverrideInfo, setManualOverrideInfo] = useState<ManualOverrideInfo>({ active: false, keys: [] });
    const [isStreamConnected, setIsStreamConnected] = useState(false);
    const [hasFreshStream, setHasFreshStream] = useState(false);
    const staleStreamTimerRef = useRef<number | null>(null);
  
  const hasAutoRun = useRef(false);

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

  // --- AI RUNNER ---
  const handleRunAI = useCallback(async (auto = false) => {
    if (loading) return; 
    setLoading(true);
    try {
        const result = await api.runPrediction(vehicleId, telematics ?? undefined);
        if (result && typeof result.diagnosis === 'string' && result.diagnosis.trim()) {
            setAnalysis(result);
        } else {
            setAnalysis(buildLocalFallbackAnalysis(vehicleId, telematics, 'Backend returned no diagnosis payload'));
        }
        if (auto) hasAutoRun.current = true;
    } catch (e) {
        console.error("AI Error", e);
        const errorMessage = e instanceof Error ? e.message : 'Prediction request failed';
        setAnalysis(buildLocalFallbackAnalysis(vehicleId, telematics, errorMessage));
    } finally {
        setLoading(false);
    }
  }, [vehicleId, loading, telematics]);

    const appendChartPoint = useCallback((data: TelematicsData) => {
        setChartData(prev => {
            const newPoint = {
                time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                engineTemp: normalizeMetric(data.engine_temp_c, 0),
                oilPressure: normalizeMetric(data.oil_pressure_psi, 0),
                battery: normalizeMetric(data.battery_voltage, 24),
            };
            return [...prev, newPoint].slice(-20);
        });
    }, []);

    const fetchMetadata = useCallback(async () => {
        try {
            setMetadataLoadError(null);
            const fleet = await Promise.race<ReturnType<typeof api.getFleetStatus>>([
                api.getFleetStatus(),
                new Promise<never>((_, reject) => {
                    window.setTimeout(() => reject(new Error('metadata_fetch_timeout')), METADATA_FETCH_TIMEOUT_MS);
                }),
            ]);
            const car: any = fleet.find((v: any) => v.vin === vehicleId);

            if (car) {
                setMetadata(car);
            } else {
                setMetadata(createFallbackMetadata(vehicleId));
            }
        } catch (err) {
            console.error('Meta fetch error', err);
            setMetadata(createFallbackMetadata(vehicleId));
            setMetadataLoadError('Unable to load live vehicle metadata. Showing fallback details.');
        }
    }, [vehicleId]);

    const fetchLiveTelematics = useCallback(async () => {
        try {
            const data = await api.getTelematics(vehicleId);
            if (!data) {
                return;
            }

            const normalizedData = normalizeTelematicsSnapshot(data);
            setTelematics(normalizedData);
            setManualOverrideInfo(parseManualOverrideInfo(normalizedData as unknown as Record<string, unknown>));
            appendChartPoint(normalizedData);
        } catch {
            // Silent error for polling fallback
        }
    }, [appendChartPoint, vehicleId]);

    const fetchLatestAnalysis = useCallback(async () => {
        try {
            const interaction = await api.getInteractionLog(vehicleId);
            if (!interaction) {
                return;
            }

            setAnalysis((previous) => {
                if (!previous) {
                    return interaction;
                }

                const previousSource = resolveDiagnosisSource(previous);
                const incomingSource = resolveDiagnosisSource(interaction);
                const shouldPromoteIncoming =
                    previousSource === 'local_fallback' && incomingSource !== 'local_fallback';

                if (!shouldPromoteIncoming) {
                    return previous;
                }

                return {
                    ...previous,
                    ...interaction,
                };
            });
        } catch {
            // Silent error for analysis reconciliation fallback
        }
    }, [vehicleId]);

    // --- RESET + INITIAL LOAD ---
  useEffect(() => {
    console.log(`🚀 SWITCHING TO: ${vehicleId}`);

        hasAutoRun.current = false;
    setMetadata(null);
    setMetadataLoadError(null);
    setTelematics(null);
    setChartData([]);
    setAnalysis(null);
    setManualOverrideInfo({ active: false, keys: [] });
    setIsStreamConnected(false);
    setHasFreshStream(false);
    clearStaleStreamTimer();

        void fetchMetadata();
        void fetchLiveTelematics();
        void fetchLatestAnalysis();
    }, [clearStaleStreamTimer, fetchLiveTelematics, fetchMetadata, vehicleId]);

    // --- STREAM SUBSCRIPTION ---
    useEffect(() => {
        stream.start();
        let isActive = true;
        const selectedVehicleId = normalizeVehicleId(vehicleId);

        const unsubscribeConnection = stream.subscribeConnection((connected) => {
            if (!isActive) {
                return;
            }
            setIsStreamConnected(connected);
            if (!connected) {
                clearStaleStreamTimer();
                setHasFreshStream(false);
            }
        });

        const unsubscribeEvents = stream.subscribe((event) => {
            const payload = event.payload ?? {};
            const eventVehicleId = normalizeVehicleId(payload.vehicle_id);

            if (!eventVehicleId || eventVehicleId !== selectedVehicleId) {
                return;
            }

            if (event.topic === 'telemetry.latest') {
                markStreamHeartbeat();
                setManualOverrideInfo(parseManualOverrideInfo(payload));
                setTelematics((previous) => {
                    const nextSnapshot = normalizeTelematicsSnapshot({
                        vehicle_id: eventVehicleId,
                        engine_temp_c: toFiniteNumber(payload.engine_temp_c, previous?.engine_temp_c ?? 0),
                        oil_pressure_psi: toFiniteNumber(payload.oil_pressure_psi, previous?.oil_pressure_psi ?? 0),
                        rpm: toFiniteNumber(payload.rpm, previous?.rpm ?? 0),
                        battery_voltage: toFiniteNumber(payload.battery_voltage, previous?.battery_voltage ?? 24),
                        active_dtc_codes: previous?.active_dtc_codes,
                    });

                    appendChartPoint(nextSnapshot);
                    return nextSnapshot;
                });
                return;
            }

            if (event.topic === 'anomaly.event') {
                setAnalysis((previous) => {
                    if (!previous) {
                        return previous;
                    }

                    return {
                        ...previous,
                        risk_score: toFiniteNumber(payload.risk_score, previous.risk_score),
                        risk_level: String(payload.risk_level ?? previous.risk_level),
                    };
                });
                return;
            }

            if (event.topic === 'analysis.completed') {
                const diagnosisText = typeof payload.diagnosis === 'string' ? payload.diagnosis.trim() : '';
                const eventDiagnosisSource = typeof payload.diagnosis_source === 'string' ? payload.diagnosis_source : undefined;
                const eventFallbackReason = typeof payload.fallback_reason === 'string' ? payload.fallback_reason : undefined;
                if (diagnosisText) {
                    setAnalysis((previous) => ({
                        ...(previous || {
                            vehicle_id: eventVehicleId,
                            risk_score: 0,
                            risk_level: 'LOW',
                            diagnosis: diagnosisText,
                        }),
                        vehicle_id: eventVehicleId,
                        risk_score: toFiniteNumber(payload.risk_score, previous?.risk_score ?? 0),
                        risk_level: String(payload.risk_level ?? previous?.risk_level ?? 'LOW'),
                        diagnosis: diagnosisText,
                        booking_id: typeof payload.booking_id === 'string' ? payload.booking_id : previous?.booking_id,
                        diagnosis_source: eventDiagnosisSource || previous?.diagnosis_source,
                        fallback_reason: eventFallbackReason || previous?.fallback_reason,
                    }));
                    return;
                }

                void api.getInteractionLog(vehicleId).then((interaction) => {
                    if (!isActive || !interaction) {
                        return;
                    }

                    const bookingId = typeof payload.booking_id === 'string' ? payload.booking_id : interaction.booking_id;

                    setAnalysis((previous) => ({
                        ...(previous || interaction),
                        ...interaction,
                        booking_id: bookingId,
                        diagnosis_source: eventDiagnosisSource || interaction.diagnosis_source || previous?.diagnosis_source,
                        fallback_reason: eventFallbackReason || interaction.fallback_reason || previous?.fallback_reason,
                    }));
                });
            }
        });

        return () => {
            isActive = false;
            clearStaleStreamTimer();
            unsubscribeConnection();
            unsubscribeEvents();
        };
    }, [appendChartPoint, clearStaleStreamTimer, markStreamHeartbeat, vehicleId]);

    // --- POLLING FALLBACK / PERIODIC RECONCILIATION ---
    useEffect(() => {
        const intervalMs = isStreamConnected ? STREAM_CONNECTED_POLL_MS : STREAM_FALLBACK_POLL_MS;

        const intervalId = window.setInterval(() => {
            void fetchLiveTelematics();
        }, intervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [fetchLiveTelematics, isStreamConnected]);

    useEffect(() => {
        const intervalMs = isStreamConnected ? ANALYSIS_CONNECTED_REFRESH_MS : ANALYSIS_FALLBACK_REFRESH_MS;

        const intervalId = window.setInterval(() => {
            void fetchLatestAnalysis();
        }, intervalMs);

        return () => {
            window.clearInterval(intervalId);
        };
    }, [fetchLatestAnalysis, isStreamConnected]);

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

    const manualOverrideLabel = manualOverrideInfo.keys.length > 0
        ? `${manualOverrideInfo.keys.slice(0, 2).join(', ')}${manualOverrideInfo.keys.length > 2 ? ` +${manualOverrideInfo.keys.length - 2}` : ''}`
        : 'Manual Override Active';
    const diagnosisSourceKey = resolveDiagnosisSource(analysis);
    const diagnosisSourceMeta = getDiagnosisSourceMeta(diagnosisSourceKey);
    const fallbackReasonLabel = formatFallbackReason(analysis?.fallback_reason);
    const riskMeta = getRiskMeta(analysis?.risk_level);
    const riskScoreLabel = analysis ? Math.max(0, Math.min(100, Math.round(toFiniteNumber(analysis.risk_score, 0)))) : 0;
    const diagnosisMarkdown = analysis ? toDisplayText(analysis.diagnosis, 'Diagnosis details are unavailable.') : '';
    const metadataModel = toDisplayText(metadata?.model, 'Unknown Model');
    const metadataRegistration = toDisplayText(metadata?.registration_no ?? metadata?.vin, 'N/A');
    const metadataVin = toDisplayText(metadata?.vin, vehicleId);
    const metadataFleetId = toDisplayText(metadata?.fleet_id, 'FL-GEN-01');
    const metadataLocation = toDisplayText(metadata?.location, 'Tracking...');
    const metadataLastServiceDate = toDisplayText(metadata?.last_service_date, 'Oct 2025');
    const ownerName = toDisplayText(metadata?.owners?.full_name, 'Enterprise Fleet');
    const ownerOrganization = toDisplayText(metadata?.owners?.organization_name, 'Logistics Partner');
    const ownerPhone = toDisplayText(metadata?.owners?.phone_number, 'No Phone');
    const ownerAddress = toDisplayText(metadata?.owners?.address, 'TN');
    const bookingIdLabel = analysis ? toDisplayText(analysis.booking_id, '') : '';
    const uebaMessage = analysis?.ueba_alerts?.[0]?.message
        ? toDisplayText(analysis.ueba_alerts[0].message, '')
        : '';

  // --- 🆕 LOADER ANIMATION ---
  if (!metadata) {
    return (
        <div className="fixed inset-0 bg-slate-50 z-50 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center px-4">
                <div className="loader"></div>
                <p className="text-sm text-slate-600">Loading vehicle details...</p>
                <Button onClick={onClose} variant="outline" size="sm">Back</Button>
            </div>
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
                    {metadataModel || "Vehicle Details"}
                    <Badge variant="outline" className="text-xs font-normal bg-slate-100">
                        {metadataRegistration}
                    </Badge>
                </h1>
                <p className="text-xs text-slate-500">Fleet Management / {vehicleId}</p>
            </div>
        </div>
        <div className="flex gap-2">
            <Badge
                variant="outline"
                className={`px-3 py-1 font-medium ${
                    isStreamConnected
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                        : telematics
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : 'border-slate-200 bg-slate-100 text-slate-600'
                }`}
            >
                                {isStreamConnected ? (
                                    <span className="text-green-600 flex items-center gap-1">● Stream Connected</span>
                                ) : telematics ? (
                                    <span className="text-amber-600 flex items-center gap-1">● Polling Fallback</span>
                                ) : (
                                    'Connecting...'
                                )}
            </Badge>
            {manualOverrideInfo.active && (
                <Badge variant="outline" className="px-3 py-1 border-amber-200 bg-amber-50 text-amber-700" title={manualOverrideInfo.keys.join(', ')}>
                    Override: {manualOverrideLabel}
                </Badge>
            )}
            <Button onClick={onClose} variant="secondary">Close</Button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">

                {metadataLoadError && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                {metadataLoadError}
                        </div>
                )}

        {/* --- 1. HERO SECTION (Combined Info) --- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* LEFT: CAR IMAGE & STATS */}
            <Card className="lg:col-span-2 overflow-hidden shadow-md border-0">
                <div className="relative h-64 bg-slate-100 group">
                    <img 
                        src={getVehicleImage(metadataModel)}
                        alt="Vehicle" 
                        className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/80 to-transparent p-6 pt-20">
                        <h2 className="text-3xl font-bold text-white mb-1">{metadataModel}</h2>
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/55 px-3 py-1 text-white shadow-sm">
                                <Car className="w-4 h-4"/> Fleet ID: {metadataFleetId}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-black/45 px-3 py-1 text-white shadow-sm">
                                <MapPin className="w-4 h-4"/> {metadataLocation}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 border-t bg-white divide-y md:divide-y-0 md:divide-x">
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
                        <p className="text-lg font-semibold text-slate-900">{metadataLastServiceDate}</p>
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
                                {ownerName}
                            </p>
                            <p className="text-base text-slate-500">{/* INCREASED SIZE */}
                                {ownerOrganization}
                            </p>
                            <div className="flex gap-2 mt-2">
                                <Badge variant="secondary" className="font-normal text-sm px-3 py-1">{/* INCREASED SIZE */}
                                    {ownerPhone}
                                </Badge>
                                <Badge variant="secondary" className="font-normal text-sm px-3 py-1">{/* INCREASED SIZE */}
                                    {ownerAddress}
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
                                {metadataRegistration}
                            </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100">
                            <span className="text-slate-500 text-sm font-medium">VIN</span>
                            <span className="font-mono font-medium text-slate-700 text-base">{metadataVin}</span>
                        </div>
                        
                        {/* Telematics Fields (Previously Cards) - FIXED TYPESCRIPT */}
                        <div className="flex justify-between py-3 border-b border-slate-100 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Thermometer className="w-4 h-4 text-red-500"/> Engine Temp
                            </span>
                            <span className={`font-mono font-bold text-lg ${(telematics?.engine_temp_c ?? 0) > 105 ? "text-red-600 animate-pulse" : "text-slate-900"}`}>
                                {telematics ? `${formatMetric(telematics.engine_temp_c)}°C` : "--"}
                            </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Droplets className="w-4 h-4 text-amber-500"/> Oil Pressure
                            </span>
                            <span className={`font-mono font-bold text-lg ${(telematics?.oil_pressure_psi ?? 0) < 20 ? "text-red-600" : "text-slate-900"}`}>
                                {telematics ? `${formatMetric(telematics.oil_pressure_psi)} PSI` : "--"}
                            </span>
                        </div>
                        <div className="flex justify-between py-3 border-b border-slate-100 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Zap className="w-4 h-4 text-yellow-500"/> Battery
                            </span>
                            <span className="font-mono font-bold text-slate-900 text-lg">
                                {telematics ? `${formatMetric(telematics.battery_voltage)} V` : "--"}
                            </span>
                        </div>
                        <div className="flex justify-between py-3 items-center">
                            <span className="text-slate-500 flex items-center gap-2 text-sm font-medium">
                                <Gauge className="w-4 h-4 text-blue-500"/> RPM
                            </span>
                            <span className="font-mono font-bold text-slate-900 text-lg">
                                {telematics ? formatMetric(telematics.rpm, 0) : "--"}
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
            <CardContent className="h-[220px] relative">
                {chartData.length === 0 && (
                    <div className="absolute inset-0 z-10 flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 text-sm text-slate-500">
                        Waiting for telemetry points to render trend lines...
                    </div>
                )}
                <SectionErrorBoundary
                    sectionName="telemetry-chart"
                    fallback={
                        <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 text-center text-sm text-slate-500">
                            Chart rendering is temporarily unavailable for this vehicle, but telemetry values are still shown above.
                        </div>
                    }
                >
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
                </SectionErrorBoundary>
            </CardContent>
        </Card>

        {/* --- 3. AI REPORT SECTION (Fixed Visibility) --- */}
        <div className="pt-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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
                    <div className="bg-slate-900 px-6 py-5 text-white">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 rounded-lg bg-blue-500/20 p-2 backdrop-blur-sm">
                                <Activity className="w-6 h-6 text-blue-400" />
                            </div>
                                <div className="space-y-1.5">
                                    <h3 className="text-lg font-bold">AI Analysis Complete</h3>
                                    <p className="text-sm text-slate-200">{diagnosisSourceMeta.subtitle}</p>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                        <Badge variant="outline" className={`text-[11px] font-semibold tracking-wide ${diagnosisSourceMeta.className}`}>
                                            {diagnosisSourceMeta.label}
                                        </Badge>
                                        {fallbackReasonLabel && (
                                            <Badge variant="outline" className="text-[11px] font-semibold tracking-wide !border-amber-300 !bg-amber-100 !text-amber-900">
                                                Fallback Triggered
                                            </Badge>
                                        )}
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                                <Badge variant="outline" className={`text-[11px] font-semibold tracking-wide ${riskMeta.badgeClass}`}>
                                    Risk {riskMeta.label}
                                </Badge>
                                <Badge variant="outline" className="text-[11px] font-semibold tracking-wide !border-slate-300 !bg-slate-100 !text-slate-900">
                                    Score {riskScoreLabel}/100
                                </Badge>
                                <Button variant="outline" size="sm" className="h-9 !border-slate-300 !bg-white !text-slate-900 hover:!bg-slate-100">
                                    <Download className="mr-2 h-4 w-4"/> Export Report
                                </Button>
                            </div>
                        </div>
                    </div>
                    
                    <CardContent className="grid grid-cols-1 gap-6 p-6 text-slate-700 lg:grid-cols-3 lg:items-start">
                        <div className={`lg:col-span-3 rounded-xl border px-4 py-3 ${riskMeta.panelClass}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-current">Current Risk Snapshot</p>
                                <p className="text-sm font-semibold text-current">{riskMeta.label} ({riskScoreLabel}/100)</p>
                            </div>
                            <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/80">
                                <div
                                    className={`h-full rounded-full ${riskMeta.progressClass}`}
                                    style={{ width: `${Math.max(8, riskScoreLabel)}%` }}
                                />
                            </div>
                            <p className="mt-2 text-xs font-medium text-current/90">{riskMeta.guidance}</p>
                        </div>

                        <div className="lg:col-span-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Diagnosis Source</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{diagnosisSourceMeta.label}</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Risk Score</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{riskScoreLabel}/100</p>
                            </div>
                            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pipeline Status</p>
                                <p className="mt-1 text-sm font-semibold text-slate-900">{fallbackReasonLabel ? 'Fallback Active' : 'Primary Path Healthy'}</p>
                            </div>
                        </div>

                        {fallbackReasonLabel && (
                            <div className="lg:col-span-3 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                <AlertTriangle className="w-4 h-4 mt-0.5 text-amber-700 shrink-0" />
                                <div>
                                    <p className="font-semibold text-amber-900">Fallback Reason</p>
                                    <p className="mt-1 leading-relaxed text-amber-900">{fallbackReasonLabel}</p>
                                </div>
                            </div>
                        )}

                        {/* Diagnosis Text */}
                        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white p-5">
                            <SectionErrorBoundary
                                sectionName="diagnosis-markdown"
                                fallback={
                                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                                        {diagnosisMarkdown || 'Diagnosis details are unavailable.'}
                                    </div>
                                }
                            >
                                <ReactMarkdown 
                                    className="prose prose-slate max-w-none prose-headings:text-slate-900 prose-p:text-slate-700 prose-li:text-slate-700"
                                    components={{
                                        h3: ({children}) => <h3 className="mb-2 mt-4 flex items-center gap-2 text-lg font-bold text-blue-900">{children}</h3>,
                                        li: ({children}) => <li className="mb-1 ml-4 list-disc marker:text-blue-500">{children}</li>,
                                        strong: ({children}) => <span className="rounded border border-yellow-200 bg-yellow-50 px-1 font-semibold text-slate-900">{children}</span>,
                                    }}
                                >
                                    {diagnosisMarkdown}
                                </ReactMarkdown>
                            </SectionErrorBoundary>
                        </div>

                        {/* Action Panel */}
                        <div className="h-fit space-y-4 self-start rounded-xl border border-slate-200 bg-slate-50 p-5">
                            <h4 className="font-bold text-slate-900 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-amber-500 fill-amber-500"/> Recommended Actions
                            </h4>
                            
                            {uebaMessage && (
                                <div className="bg-red-100 border border-red-200 text-red-800 p-3 rounded text-sm flex gap-2">
                                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
                                    {uebaMessage}
                                </div>
                            )}

                            <div className="rounded border border-slate-200 bg-white p-3 text-sm italic text-slate-700">
                                "Immediate service recommended based on sensor anomalies."
                            </div>

                            <Button 
                                className={`w-full h-12 text-base shadow-lg ${bookingIdLabel ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-blue-600 hover:bg-blue-700 text-white"}`}
                                onClick={() => !bookingIdLabel && setShowBooking(true)}
                                disabled={!!bookingIdLabel}
                            >
                                {bookingIdLabel ? "Service Scheduled ✅" : "Request Service Recommendation"}
                            </Button>
                            
                            {bookingIdLabel && (
                                <div className="text-center text-xs text-slate-500 bg-slate-100 py-1 rounded">
                                    Ref ID: <span className="font-mono font-medium text-slate-700">{bookingIdLabel}</span>
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
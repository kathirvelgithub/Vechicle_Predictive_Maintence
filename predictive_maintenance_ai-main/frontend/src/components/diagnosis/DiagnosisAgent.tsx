import { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { FileText, Calendar, AlertTriangle, Activity } from 'lucide-react';
import { Button } from '../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Input } from '../ui/input';
import { api, AnalysisResult, TelematicsData, VehicleSummary } from '../../services/api';

interface DiagnosisAgentProps {
  vehicleId: string | null;
}

const toNumber = (value: unknown): number | null => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatDate = (value?: string): string => {
  if (!value) {
    return 'Not available';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString();
};

const proposedScheduleDate = (analysis: AnalysisResult | null): string => {
  if (analysis?.scheduled_date) {
    return formatDate(analysis.scheduled_date);
  }

  const score = toNumber(analysis?.risk_score) ?? 50;
  const date = new Date();
  const days = score >= 85 ? 1 : score >= 70 ? 3 : score >= 50 ? 7 : 14;
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString();
};

const inferRootCause = (analysis: AnalysisResult | null, telematics: TelematicsData | null): string => {
  const diagnosis = String(analysis?.diagnosis || '').toLowerCase();

  if (diagnosis.includes('oil') || (toNumber(telematics?.oil_pressure_psi) ?? 99) < 22) {
    return 'Oil pressure behavior suggests lubrication risk and potential accelerated engine wear.';
  }
  if (diagnosis.includes('temperature') || diagnosis.includes('overheat') || (toNumber(telematics?.engine_temp_c) ?? 0) > 106) {
    return 'Temperature pattern indicates overheating risk, likely around coolant or thermal management performance.';
  }
  if (diagnosis.includes('battery') || (toNumber(telematics?.battery_voltage) ?? 99) < 12.1) {
    return 'Battery voltage instability indicates electrical-system reliability risk under load.';
  }
  if ((toNumber(telematics?.rpm) ?? 0) > 3200) {
    return 'Sustained high RPM trend indicates drivetrain stress and increased maintenance urgency.';
  }

  return 'Combined telemetry and diagnosis indicate anomalous behavior requiring proactive workshop inspection.';
};

const formatDiagnosisSource = (value?: string): string => {
  const raw = String(value || '').trim().toLowerCase().replace(/[_-]+/g, ' ');
  if (!raw) {
    return 'Source Pending';
  }
  return raw
    .split(' ')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

export function DiagnosisAgent({ vehicleId }: DiagnosisAgentProps) {
  const [fleet, setFleet] = useState<VehicleSummary[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(vehicleId);
  const [telematics, setTelematics] = useState<TelematicsData | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [analysisByVehicle, setAnalysisByVehicle] = useState<Record<string, AnalysisResult | null>>({});
  const [telematicsByVehicle, setTelematicsByVehicle] = useState<Record<string, TelematicsData | null>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [isFleetLoading, setIsFleetLoading] = useState(false);
  const detailsPanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (vehicleId && vehicleId !== selectedVehicleId) {
      setSelectedVehicleId(vehicleId);
    }
  }, [selectedVehicleId, vehicleId]);

  useEffect(() => {
    let mounted = true;

    const loadFleet = async () => {
      setIsFleetLoading(true);
      try {
        const rows = await api.getFleetStatus();
        if (!mounted) {
          return;
        }

        setFleet(rows);

        if (!selectedVehicleId && rows.length > 0) {
          setSelectedVehicleId(rows[0].vin);
        }
      } finally {
        if (mounted) {
          setIsFleetLoading(false);
        }
      }
    };

    void loadFleet();

    return () => {
      mounted = false;
    };
  }, [vehicleId]);

  useEffect(() => {
    if (!selectedVehicleId) {
      setAnalysis(null);
      setTelematics(null);
      return;
    }

    setAnalysis(analysisByVehicle[selectedVehicleId] ?? null);
    setTelematics(telematicsByVehicle[selectedVehicleId] ?? null);
  }, [analysisByVehicle, selectedVehicleId, telematicsByVehicle]);

  useEffect(() => {
    if (!selectedVehicleId) {
      return;
    }

    const panel = detailsPanelRef.current;
    if (!panel) {
      return;
    }

    const isNarrowLayout = window.matchMedia('(max-width: 1023px)').matches;
    if (!isNarrowLayout) {
      return;
    }

    panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [selectedVehicleId]);

  const rootCause = useMemo(() => inferRootCause(analysis, telematics), [analysis, telematics]);
  const scheduleDate = useMemo(() => proposedScheduleDate(analysis), [analysis]);
  const riskScore = toNumber(analysis?.risk_score) ?? 0;
  const riskLevel = String(analysis?.risk_level || 'LOW').toUpperCase();
  const diagnosisSource = useMemo(() => formatDiagnosisSource(analysis?.diagnosis_source), [analysis?.diagnosis_source]);
  const diagnosisGeneratedAt = useMemo(() => {
    const raw = telematics?.timestamp_utc;
    if (!raw) {
      return new Date().toLocaleString();
    }
    const parsed = new Date(raw);
    return Number.isNaN(parsed.getTime()) ? raw : parsed.toLocaleString();
  }, [telematics?.timestamp_utc]);
  const issueList = useMemo(
    () => (analysis?.detected_issues && analysis.detected_issues.length > 0 ? analysis.detected_issues.slice(0, 6) : ['No explicit issue extracted yet.']),
    [analysis?.detected_issues],
  );
  const selectedVehicle = useMemo(
    () => fleet.find((entry) => entry.vin === selectedVehicleId) || null,
    [fleet, selectedVehicleId],
  );

  const runDiagnosis = async () => {
    if (!selectedVehicleId) {
      return;
    }

    setIsLoading(true);
    try {
      const telemetry = await api.getTelematics(selectedVehicleId);
      const prediction = await api.runPrediction(selectedVehicleId, telemetry || undefined);
      setTelematics(telemetry);
      setAnalysis(prediction);
      setTelematicsByVehicle((previous) => ({
        ...previous,
        [selectedVehicleId]: telemetry,
      }));
      setAnalysisByVehicle((previous) => ({
        ...previous,
        [selectedVehicleId]: prediction,
      }));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!selectedVehicleId || analysisByVehicle[selectedVehicleId] !== undefined || isLoading) {
      return;
    }

    void runDiagnosis();
  }, [analysisByVehicle, isLoading, selectedVehicleId]);

  const filteredFleet = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    if (!term) {
      return fleet;
    }

    return fleet.filter((entry) => {
      const vin = String(entry.vin || '').toLowerCase();
      const model = String(entry.model || '').toLowerCase();
      const location = String(entry.location || '').toLowerCase();
      return vin.includes(term) || model.includes(term) || location.includes(term);
    });
  }, [fleet, searchQuery]);

  const handleDownload = () => {
    if (!selectedVehicleId) {
      return;
    }

    const markdown = [
      '# Diagnosis Agent Report',
      `Vehicle: ${selectedVehicleId}`,
      `Generated: ${new Date().toISOString()}`,
      `Risk: ${riskLevel} (${riskScore}/100)`,
      `Proposed Schedule Date: ${scheduleDate}`,
      '',
      '## Why Alert Was Created',
      rootCause,
      '',
      '## Diagnosis Narrative',
      analysis?.diagnosis || 'Diagnosis was not available from the backend at this time.',
      '',
      '## Telematics Snapshot',
      '```json',
      JSON.stringify(telematics || {}, null, 2),
      '```',
    ].join('\n');

    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${selectedVehicleId}-diagnosis-agent-${Date.now()}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto w-full max-w-[1400px] space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Diagnosis Agent</h1>
          <p className="text-slate-600">Select any vehicle card below to generate and review full diagnosis</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 md:w-auto md:justify-end">
          <Button onClick={() => void runDiagnosis()} disabled={!selectedVehicleId || isLoading}>
            <Activity className="mr-2 h-4 w-4" /> {isLoading ? 'Running Diagnosis...' : 'Analyze Selected Vehicle'}
          </Button>
          <Button onClick={handleDownload} disabled={!selectedVehicleId || isLoading}>
            <FileText className="mr-2 h-4 w-4" /> Download Full Report
          </Button>
        </div>
      </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="border-slate-200 lg:col-span-5">
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <CardTitle>Fleet Vehicles</CardTitle>
              <Badge variant="outline">{filteredFleet.length}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by VIN, model, or location"
            />

            {isFleetLoading && <p className="text-sm text-slate-500">Loading fleet vehicles...</p>}

            {!isFleetLoading && filteredFleet.length === 0 && (
              <p className="text-sm text-slate-500">No vehicles available for diagnosis.</p>
            )}

            <div className="max-h-[62vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {filteredFleet.map((entry) => {
              const isSelected = entry.vin === selectedVehicleId;
              const probability = Math.round(Number(entry.probability || 0));
              return (
                <button
                  key={entry.vin}
                  type="button"
                  onClick={() => {
                    setSelectedVehicleId(entry.vin);
                  }}
                  className={`w-full rounded-xl border p-3 text-left transition-all ${
                    isSelected
                      ? 'border-blue-300 bg-blue-50 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{entry.vin}</p>
                      <p className="text-xs text-slate-600">{entry.model || 'Unknown Model'}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{probability}%</Badge>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{entry.location || 'Unknown location'}</p>
                </button>
              );
            })}
            </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-200 lg:col-span-7" ref={detailsPanelRef}>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>
                {selectedVehicleId ? `Vehicle ${selectedVehicleId}` : 'Select a vehicle to start diagnosis'}
              </CardTitle>
              <div className="flex gap-2">
                <Badge variant="outline">Risk {riskLevel}</Badge>
                <Badge variant="secondary">Score {riskScore}/100</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {!selectedVehicleId && (
              <p className="text-sm text-slate-500">Select any vehicle from the left panel and click Analyze Selected Vehicle.</p>
            )}

            {selectedVehicle && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
                <p>
                  <span className="font-semibold text-slate-900">Model:</span> {selectedVehicle.model || 'Unknown'}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Predicted Failure:</span> {selectedVehicle.predictedFailure || 'N/A'}
                </p>
                <p>
                  <span className="font-semibold text-slate-900">Action:</span> {selectedVehicle.action || 'Monitoring'}
                </p>
              </div>
            )}

            {isLoading && <p className="text-sm text-slate-500">Generating diagnosis summary...</p>}

            {selectedVehicleId && (
              <>
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-amber-900">Current Risk Snapshot</p>
                    <p className="text-sm font-semibold text-amber-900">{riskLevel} ({riskScore}/100)</p>
                  </div>
                  <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-white/80">
                    <div className="h-full rounded-full bg-amber-500" style={{ width: `${Math.max(8, riskScore)}%` }} />
                  </div>
                  <p className="mt-2 text-xs text-amber-900">{riskScore >= 75 ? 'Immediate service action required.' : riskScore >= 45 ? 'Schedule urgent preventive service.' : 'Continue monitoring and preventive service window.'}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Key Findings</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {issueList.map((issue, index) => (
                      <Badge key={`${issue}-${index}`} variant="outline" className="border-blue-200 bg-blue-50 text-blue-900">
                        {issue}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-900">
                    <AlertTriangle className="h-4 w-4" /> Why This Alert Was Created
                  </p>
                  <p className="text-sm text-amber-900">{rootCause}</p>
                </div>

                <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                  <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-indigo-900">
                    <Calendar className="h-4 w-4" /> Proposed Schedule Date
                  </p>
                  <p className="text-base font-semibold text-indigo-900">{scheduleDate}</p>
                </div>

                <div className="rounded-lg border border-slate-200 bg-white p-5">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2">
                    <p className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <Activity className="h-4 w-4" /> Diagnosis Narrative
                    </p>
                    <span className="text-xs text-slate-500">Generated {diagnosisGeneratedAt}</span>
                  </div>
                  <div className="prose prose-slate max-w-none text-sm leading-7">
                    <ReactMarkdown>
                      {analysis?.diagnosis || 'Diagnosis is not available yet. Click Analyze Selected Vehicle to generate a full diagnosis.'}
                    </ReactMarkdown>
                  </div>
                </div>

                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h4 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Calendar className="h-4 w-4 text-indigo-600" /> Operations Summary
                  </h4>
                  <div className="mt-3 space-y-2 text-sm">
                    <div className="grid grid-cols-1 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 md:grid-cols-[160px_minmax(0,1fr)] md:gap-3">
                      <span className="text-slate-500">Diagnosis Source</span>
                      <span className="break-words font-semibold text-slate-900 md:text-right">{diagnosisSource}</span>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 md:grid-cols-[160px_minmax(0,1fr)] md:gap-3">
                      <span className="text-slate-500">Generated</span>
                      <span className="break-words font-medium text-slate-900 md:text-right">{diagnosisGeneratedAt}</span>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 md:grid-cols-[160px_minmax(0,1fr)] md:gap-3">
                      <span className="text-slate-500">Issues Count</span>
                      <span className="font-semibold text-slate-900 md:text-right">{analysis?.detected_issues?.length || 0}</span>
                    </div>
                    <div className="grid grid-cols-1 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 py-2 md:grid-cols-[160px_minmax(0,1fr)] md:gap-3">
                      <span className="text-slate-500">Pipeline</span>
                      <span className="font-medium text-slate-900 md:text-right">{analysis?.fallback_reason ? 'Fallback Active' : 'Primary Healthy'}</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

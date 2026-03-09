import { DefectHeatmap } from './DefectHeatmap';
import { CAPAInsights } from './CAPAInsights';

export function Manufacturing() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-3xl mb-2">Manufacturing Quality Insights (RCA/CAPA)</h1>
        <p className="text-slate-600">Field failure analysis correlated with production data</p>
      </div>

      {/* Defect Heatmap */}
      <DefectHeatmap />

      {/* CAPA Insights Table */}
      <CAPAInsights />
    </div>
  );
}

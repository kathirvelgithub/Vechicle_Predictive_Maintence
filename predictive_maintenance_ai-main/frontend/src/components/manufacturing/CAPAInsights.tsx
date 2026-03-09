import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../ui/table';
import { Download, FileText, TrendingUp } from 'lucide-react';

const capaInsights = [
  {
    id: '1',
    component: 'Fuel Pump Type B',
    issue: 'Premature wear in Tier-2 city climates',
    aiInsight: 'Correlated to batch #455 production anomaly. Supplier QA deviation detected in temperature testing protocol.',
    affectedVehicles: 67,
    batch: 'Batch #455',
    suggestedAction: 'Review supplier QA process for Batch #455. Implement enhanced temperature stress testing.',
    priority: 'high',
    status: 'investigation',
  },
  {
    id: '2',
    component: 'Transmission Clutch Plates',
    issue: 'Accelerated degradation under heavy load',
    aiInsight: 'Pattern detected in vehicles with high-temperature operation (>40°C ambient). Material specification variance found.',
    affectedVehicles: 78,
    batch: 'Batch #445',
    suggestedAction: 'Evaluate material composition. Consider heat-resistant coating for high-temp regions.',
    priority: 'critical',
    status: 'action-required',
  },
  {
    id: '3',
    component: 'Battery Management System',
    issue: 'Voltage fluctuation events',
    aiInsight: 'Software version 2.3.1 correlation. Firmware update resolves 92% of cases in test environment.',
    affectedVehicles: 52,
    batch: 'Software v2.3.1',
    suggestedAction: 'Deploy OTA firmware update v2.4.0 to affected vehicles. Monitor post-update metrics.',
    priority: 'high',
    status: 'solution-identified',
  },
  {
    id: '4',
    component: 'Suspension Bushings (Front)',
    issue: 'Premature bushing degradation',
    aiInsight: 'Concentrated in rough-road environments. Rubber compound hardness variance detected in supplier lot #R-8821.',
    affectedVehicles: 44,
    batch: 'Lot #R-8821',
    suggestedAction: 'Recall supplier lot. Implement incoming material hardness testing.',
    priority: 'medium',
    status: 'investigation',
  },
  {
    id: '5',
    component: 'Coolant System Sensors',
    issue: 'False temperature readings',
    aiInsight: 'Sensor calibration drift after 20K km. Manufacturing calibration process timing reduced by 15% in Q3.',
    affectedVehicles: 34,
    batch: 'Q3 2023 Production',
    suggestedAction: 'Restore original calibration duration. Issue service bulletin for sensor recalibration.',
    priority: 'medium',
    status: 'solution-identified',
  },
  {
    id: '6',
    component: 'Engine Vibration Dampers',
    issue: 'Increased vibration at idle',
    aiInsight: 'New damper supplier (Supplier C) introduced in Week 32. Design tolerance mismatch identified.',
    affectedVehicles: 29,
    batch: 'Week 32-36',
    suggestedAction: 'Revert to Supplier A for critical dampers. Update supplier specification document.',
    priority: 'low',
    status: 'investigation',
  },
];

export function CAPAInsights() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>CAPA Insights - AI-Generated Root Cause Analysis</CardTitle>
            <p className="text-sm text-slate-600 mt-1">
              Field failures automatically correlated with production data, supplier quality metrics, and manufacturing process logs
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              Generate Report
            </Button>
            <Button variant="outline" size="sm">
              <Download className="w-4 h-4 mr-2" />
              Export Data
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Component</TableHead>
                <TableHead>Issue Description</TableHead>
                <TableHead>AI Insight</TableHead>
                <TableHead>Affected</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {capaInsights.map((insight) => (
                <TableRow key={insight.id} className="hover:bg-slate-50">
                  <TableCell>
                    <div>
                      <p>{insight.component}</p>
                      <p className="text-xs text-slate-600 mt-1">{insight.batch}</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm max-w-xs">{insight.issue}</p>
                  </TableCell>
                  <TableCell>
                    <div className="max-w-md">
                      <div className="bg-blue-50 border border-blue-200 rounded p-2 mb-2">
                        <p className="text-xs text-blue-900 mb-1">
                          <TrendingUp className="w-3 h-3 inline mr-1" />
                          AI Analysis:
                        </p>
                        <p className="text-xs text-blue-800">{insight.aiInsight}</p>
                      </div>
                      <div className="bg-green-50 border border-green-200 rounded p-2">
                        <p className="text-xs text-green-900 mb-1">Suggested Action:</p>
                        <p className="text-xs text-green-800">{insight.suggestedAction}</p>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="text-center">
                      <p className="text-lg">{insight.affectedVehicles}</p>
                      <p className="text-xs text-slate-600">vehicles</p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        insight.priority === 'critical'
                          ? 'bg-red-100 text-red-700'
                          : insight.priority === 'high'
                          ? 'bg-orange-100 text-orange-700'
                          : insight.priority === 'medium'
                          ? 'bg-amber-100 text-amber-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }
                    >
                      {insight.priority.toUpperCase()}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={
                        insight.status === 'action-required'
                          ? 'bg-red-100 text-red-700'
                          : insight.status === 'solution-identified'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }
                    >
                      {insight.status.replace('-', ' ')}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Critical Priority</p>
            <p className="text-2xl text-red-600">1</p>
            <p className="text-xs text-red-600 mt-1">Immediate action needed</p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">High Priority</p>
            <p className="text-2xl text-orange-600">2</p>
            <p className="text-xs text-orange-600 mt-1">Action within 7 days</p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Solutions Identified</p>
            <p className="text-2xl text-green-600">2</p>
            <p className="text-xs text-green-600 mt-1">Ready for deployment</p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <p className="text-xs text-slate-600">Total Affected Vehicles</p>
            <p className="text-2xl text-blue-600">304</p>
            <p className="text-xs text-blue-600 mt-1">Across all issues</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

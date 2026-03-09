import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Badge } from '../ui/badge';
import { Brain, Eye, Calendar, ShieldCheck, MessageSquare, Wrench } from 'lucide-react';


const agents = [
  { name: 'Master Agent', status: 'active', icon: Brain, color: 'text-purple-600', bgColor: 'bg-purple-100' },
  { name: 'Monitoring Agent', status: 'scanning', icon: Eye, color: 'text-blue-600', bgColor: 'bg-blue-100', activity: 'Scanning Live Data' },
  { name: 'Diagnosis Agent', status: 'active', icon: Wrench, color: 'text-green-600', bgColor: 'bg-green-100', activity: 'Analyzing Vehicle Health' },
  { name: 'Scheduling Agent', status: 'optimizing', icon: Calendar, color: 'text-orange-600', bgColor: 'bg-orange-100', activity: 'Optimizing Slots' },
  { name: 'Customer Engagement Agent', status: 'active', icon: MessageSquare, color: 'text-pink-600', bgColor: 'bg-pink-100', activity: 'Managing Interactions' },
  { name: 'Security Agent (UEBA)', status: 'monitoring', icon: ShieldCheck, color: 'text-red-600', bgColor: 'bg-red-100', activity: 'Monitoring Behavior' },
];

export function AgentStatusWidget() {
  return (
    <Card className="bg-white border border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse shadow-lg shadow-green-500/50" />
            <span className="text-slate-900">AI Agent Orchestration Status</span>
          </div>
          <Badge variant="secondary" className="bg-green-50 text-green-700 border border-green-200 font-medium">
            All Systems Operational
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {agents.map((agent) => {
            const Icon = agent.icon;
            return (
              <div
                key={agent.name}
                className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-lg p-4 hover:shadow-md hover:border-slate-300 transition-all duration-200 hover:scale-[1.02]"
              >
                <div className="flex items-start space-x-3">
                  <div className={`${agent.bgColor} ${agent.color} w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 mb-1">{agent.name}</h3>
                    {agent.activity && (
                      <p className="text-xs text-slate-600">{agent.activity}</p>
                    )}
                    <div className="mt-2 flex items-center space-x-2">
                      <div className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse" />
                      <span className="text-xs text-green-600 capitalize font-medium">{agent.status}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

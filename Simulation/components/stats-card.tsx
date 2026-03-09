import { Card, CardContent } from '@/components/ui/card';
import React from 'react';

interface StatsCardProps {
  title: string;
  value: number;
  icon: React.ReactNode;
  variant?: 'default' | 'healthy' | 'warning' | 'critical';
  change?: {
    value: number;
    direction: 'up' | 'down';
  };
}

export function StatsCard({
  title,
  value,
  icon,
  variant = 'default',
  change,
}: StatsCardProps) {
  const variantStyles = {
    default: 'border-card-foreground/10',
    healthy: 'border-status-healthy/20 bg-status-healthy/5',
    warning: 'border-status-warning/20 bg-status-warning/5',
    critical: 'border-status-critical/20 bg-status-critical/5',
  };

  const variantAccents = {
    default: 'text-primary',
    healthy: 'text-status-healthy',
    warning: 'text-status-warning',
    critical: 'text-status-critical',
  };

  return (
    <Card className={`${variantStyles[variant]} border-2`}>
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <p className="text-sm text-muted-foreground mb-2">{title}</p>
            <div className="flex items-end gap-2">
              <h3 className="text-3xl font-bold">{value}</h3>
              {change && (
                <span className={`text-xs font-semibold ${
                  change.direction === 'up' ? 'text-status-critical' : 'text-status-healthy'
                }`}>
                  {change.direction === 'up' ? '↑' : '↓'} {Math.abs(change.value)}%
                </span>
              )}
            </div>
          </div>
          <div className={`${variantAccents[variant]} text-3xl`}>
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

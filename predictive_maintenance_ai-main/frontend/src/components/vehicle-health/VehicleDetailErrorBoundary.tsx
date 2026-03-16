import React from 'react';
import { Button } from '../ui/button';

interface VehicleDetailErrorBoundaryProps {
  vehicleId: string;
  onClose: () => void;
  children: React.ReactNode;
}

interface VehicleDetailErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
  componentStack: string;
}

export class VehicleDetailErrorBoundary extends React.Component<
  VehicleDetailErrorBoundaryProps,
  VehicleDetailErrorBoundaryState
> {
  constructor(props: VehicleDetailErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
      componentStack: '',
    };
  }

  static getDerivedStateFromError(): VehicleDetailErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: 'Unknown runtime error',
      componentStack: '',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo): void {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[VehicleDetailErrorBoundary] Vehicle detail panel crashed:', error);
    this.setState({
      hasError: true,
      errorMessage,
      componentStack: info.componentStack || '',
    });
  }

  componentDidUpdate(prevProps: VehicleDetailErrorBoundaryProps): void {
    if (prevProps.vehicleId !== this.props.vehicleId && this.state.hasError) {
      this.setState({ hasError: false, errorMessage: '', componentStack: '' });
    }
  }

  private handleRetry = (): void => {
    this.setState({ hasError: false, errorMessage: '', componentStack: '' });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-50 px-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-slate-900">Vehicle details temporarily unavailable</h2>
            <p className="mt-2 text-sm text-slate-600">
              The details panel hit a runtime error for {this.props.vehicleId}. You can retry opening this panel
              or go back to the vehicle table.
            </p>
            {this.state.errorMessage && (
              <div className="mt-3 rounded border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                <p className="font-semibold">Error</p>
                <p className="mt-1 break-words">{this.state.errorMessage}</p>
              </div>
            )}
            {this.state.componentStack && (
              <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                <summary className="cursor-pointer font-semibold">Component stack</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-[11px] leading-relaxed">
                  {this.state.componentStack}
                </pre>
              </details>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button onClick={this.handleRetry}>Retry Panel</Button>
              <Button variant="outline" onClick={this.props.onClose}>
                Back to Vehicle List
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

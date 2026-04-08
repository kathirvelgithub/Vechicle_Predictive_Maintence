import React from 'react';
import { Button } from '../ui/button';

interface DiagnosisErrorBoundaryProps {
  children: React.ReactNode;
  onBack: () => void;
}

interface DiagnosisErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class DiagnosisErrorBoundary extends React.Component<
  DiagnosisErrorBoundaryProps,
  DiagnosisErrorBoundaryState
> {
  constructor(props: DiagnosisErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: unknown): DiagnosisErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unknown diagnosis page error',
    };
  }

  componentDidCatch(error: unknown): void {
    console.error('[DiagnosisErrorBoundary] Diagnosis page crashed:', error);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, errorMessage: '' });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-rose-900">
        <h2 className="text-lg font-semibold">Diagnosis page temporarily unavailable</h2>
        <p className="mt-2 text-sm">A runtime error occurred while opening the Diagnosis Agent page.</p>
        {this.state.errorMessage && (
          <p className="mt-2 rounded border border-rose-300 bg-white px-3 py-2 text-xs text-rose-800">
            {this.state.errorMessage}
          </p>
        )}
        <div className="mt-4 flex gap-2">
          <Button onClick={this.handleRetry}>Retry</Button>
          <Button variant="outline" onClick={this.props.onBack}>Back to Vehicle Health</Button>
        </div>
      </div>
    );
  }
}

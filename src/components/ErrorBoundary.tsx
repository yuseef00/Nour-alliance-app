import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'Unexpected error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#f7f3ea] dark:bg-[#0b1411] text-[#17211d] dark:text-[#ede7da]">
          <div className="max-w-md w-full rounded-3xl border border-[#0f6b4f]/20 bg-[#fdfaf3] dark:bg-[#121f1a] p-6 text-center space-y-4">
            <h2 className="text-xl font-bold">حدث خطأ غير متوقع</h2>
            <p className="text-sm text-[#5c6862] dark:text-[#98a69f] break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 rounded-xl bg-[#0f6b4f] text-white text-sm font-semibold hover:bg-[#0a4e39] transition-colors"
            >
              إعادة تحميل التطبيق
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

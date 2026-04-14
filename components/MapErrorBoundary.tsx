"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class MapErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("[MapErrorBoundary]", error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
          <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-900/80 p-6 text-center backdrop-blur-xl">
            <p className="text-xs font-medium uppercase tracking-widest text-white/40">
              MapCanvas
            </p>
            <p className="mt-3 text-sm leading-relaxed text-white/70">
              Map failed to load. Please check your connection and reload the
              page.
            </p>
            <button
              type="button"
              onClick={() => {
                this.setState({ hasError: false });
                window.location.reload();
              }}
              className="mt-4 rounded-full border border-white/10 bg-white/5 px-5 py-2 text-xs text-white/80 transition hover:bg-white/10"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

// 顶层错误边界：捕获子组件渲染期间未处理的同步异常
// React 18 仍需类组件实现 componentDidCatch / getDerivedStateFromError
// 设计目标：白屏前给出可读错误 + 重试入口（重置 state 让 React 重新挂载子树）
// 不捕获：异步错误（Promise rejection）/ event handler 内错误 —— 那些应由对应模块的 try/catch 处理

interface State {
  hasError: boolean;
  error?: Error;
}

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // dev 模式下控制台留痕,便于排查;prod 也保留(只是字符串,无敏感数据)
    // eslint-disable-next-line no-console
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: undefined });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const msg = this.state.error?.message ?? "Unknown error";
    const stack = this.state.error?.stack ?? "";
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-6">
        <div className="w-full max-w-xl bg-white rounded-lg border border-slate-200 shadow-sm p-6">
          <div className="flex items-start gap-3 mb-4">
            <AlertTriangle className="w-6 h-6 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold text-slate-900 mb-1">页面发生错误</h1>
              <p className="text-sm text-slate-600 break-all">{msg}</p>
            </div>
          </div>
          {stack && (
            <details className="mb-4">
              <summary className="text-xs text-slate-500 cursor-pointer select-none">
                查看堆栈
              </summary>
              <pre className="mt-2 text-[11px] text-slate-500 bg-slate-50 rounded p-2 overflow-auto max-h-60 whitespace-pre-wrap break-all">
                {stack}
              </pre>
            </details>
          )}
          <div className="flex items-center gap-2">
            <button
              onClick={this.handleReset}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-900 text-white text-sm font-medium hover:bg-slate-800 transition-colors"
            >
              <RefreshCw size={14} />
              重试
            </button>
            <button
              onClick={this.handleReload}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-slate-200 text-slate-700 text-sm font-medium hover:bg-slate-50 transition-colors"
            >
              刷新页面
            </button>
          </div>
        </div>
      </div>
    );
  }
}

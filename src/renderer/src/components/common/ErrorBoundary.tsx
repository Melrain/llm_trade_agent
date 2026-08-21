import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ui] render failed', error, info.componentStack)
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          style={{
            boxSizing: 'border-box',
            height: '100%',
            overflow: 'auto',
            padding: 24,
            color: '#f87171',
            fontFamily: 'ui-monospace, Consolas, monospace',
            fontSize: 13,
            whiteSpace: 'pre-wrap'
          }}
        >
          界面渲染失败。把这段报错发我即可继续修。
          {'\n\n'}
          {this.state.error.stack ?? this.state.error.message}
        </div>
      )
    }
    return this.props.children
  }
}

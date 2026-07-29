import React from 'react';

export default class BlockErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("Block rendering error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          padding: '24px',
          background: '#ffebee',
          border: '1px solid #f44336',
          borderRadius: '8px',
          color: '#b71c1c',
          textAlign: 'center',
          fontFamily: 'system-ui, sans-serif'
        }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: '14px' }}>This block couldn't be displayed</h4>
          <p style={{ margin: 0, fontSize: '13px', opacity: 0.8 }}>
            The block data might be corrupted. You can delete it or try fixing its settings.
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}

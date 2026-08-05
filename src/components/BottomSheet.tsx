import React, { ReactNode } from 'react';

interface Props {
  onClose: () => void;
  children: ReactNode;
  title?: string;
}

export function BottomSheet({ onClose, children, title }: Props) {
  return (
    <div className="fx-overlay" onClick={onClose}>
      <div className="fx-sheet" onClick={(e) => e.stopPropagation()}>
        {title && (
          <div style={{
            padding: '20px 26px 16px',
            flexShrink: 0,
            borderBottom: '1px solid var(--fx-divider)',
          }}>
            <span style={{
              fontSize: 16,
              fontWeight: 700,
              color: 'var(--fx-text-1)',
              letterSpacing: '0.3px',
            }}>
              {title}
            </span>
          </div>
        )}
        <div className="fx-sheet-scroll">
          {children}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import type { ReactNode } from 'react';
import './CustomPanel.css';

export interface CustomPanelProps {
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
  children: ReactNode;
  title?: string;
  accent?: 'blue' | 'green' | 'yellow' | 'purple' | 'pink';
  closable?: boolean;
  onClose?: () => void;
  animate?: boolean;
  width?: string;
}

export const CustomPanel: React.FC<CustomPanelProps> = ({ 
  position = 'top-left',
  className = '',
  children,
  title,
  accent,
  closable = false,
  onClose,
  animate = true,
  width = 'auto'
}) => {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    if (onClose) onClose();
  };

  if (!isVisible) return null;

  const accentClass = accent ? `has-accent accent-${accent}` : '';
  const animationClass = animate ? 'with-animation' : '';
  
  return (
    <div 
      className={`custom-panel ${position} ${accentClass} ${animationClass} ${className}`}
      style={{ width }}
    >
      {(title || closable) && (
        <div className="custom-panel-header">
          {title && <h3 className="custom-panel-title">{title}</h3>}
          <div className="custom-panel-controls">
            {closable && (
              <button className="custom-panel-close" onClick={handleClose}>
                ×
              </button>
            )}
          </div>
        </div>
      )}
      <div className="custom-panel-content">
        {children}
      </div>
    </div>
  );
};

// Composants utilitaires pour faciliter l'utilisation du panel
export const PanelSection: React.FC<{ title: string; children: ReactNode }> = ({ title, children }) => (
  <div className="custom-panel-section">
    <h4 className="custom-panel-section-title">{title}</h4>
    {children}
  </div>
);

export const PanelList: React.FC<{ children: ReactNode }> = ({ children }) => (
  <ul className="custom-panel-list">
    {children}
  </ul>
);

export const PanelListItem: React.FC<{ icon?: ReactNode; children: ReactNode }> = ({ icon, children }) => (
  <li className="custom-panel-list-item">
    {icon && <span className="custom-panel-list-item-icon">{icon}</span>}
    {children}
  </li>
);

export const PanelGrid: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="custom-panel-grid">
    {children}
  </div>
);

export const PanelCard: React.FC<{ children: ReactNode }> = ({ children }) => (
  <div className="custom-panel-card">
    {children}
  </div>
);

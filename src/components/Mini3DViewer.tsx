import React from 'react';
import './Mini3DViewer.css';

interface Mini3DViewerProps {
  objectType: 'VM' | 'Datastore' | 'Network' | 'Host' | 'Cluster';
}

export const Mini3DViewer: React.FC<Mini3DViewerProps> = ({ objectType }) => {
  const getIconClass = () => {
    switch (objectType) {
      case 'VM':
        return 'mini-3d-vm';
      case 'Datastore':
        return 'mini-3d-datastore';
      case 'Network':
        return 'mini-3d-network';
      case 'Host':
        return 'mini-3d-host';
      case 'Cluster':
        return 'mini-3d-cluster';
      default:
        return 'mini-3d-default';
    }
  };

  return (
    <div className={`mini-3d-viewer ${getIconClass()}`} title={`${objectType} Visualization`}>
      <span className="mini-3d-icon">🔍</span>
    </div>
  );
};

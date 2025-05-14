// src/components/DetailNode.tsx
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { CustomNodeDataForFlow } from '../types/visualization';
import './DetailNode.css';
import {
  FiInfo, FiCpu, FiHardDrive, FiTool, FiPackage, FiDatabase, FiTag
} from 'react-icons/fi';
import { FaNetworkWired, FaQuestion } from 'react-icons/fa';

interface DetailNodeProps extends NodeProps<CustomNodeDataForFlow> {
  isSelected?: boolean;
  sourcePosition?: Position;
  targetPosition?: Position;
  data: CustomNodeDataForFlow;
}

const DetailNode: React.FC<DetailNodeProps> = ({ data, sourcePosition, targetPosition, isSelected }) => {
  // Find connection count - this would need to be passed or calculated
  const connectedNodes = data.connectedNodes || [];
  
  let borderColor = '#777';
  let TypeIcon: React.ElementType = FaQuestion;

  // Set styling based on node type
  switch (data.type) {
    case 'Info':
      borderColor = '#4aaeff';
      TypeIcon = FiInfo;
      break;
    case 'Compute':
      borderColor = '#4ade80';
      TypeIcon = FiCpu;
      break;
    case 'Disk':
      borderColor = '#eab308';
      TypeIcon = FiHardDrive;
      break;
    case 'NetworkAdapter':
      borderColor = '#7dd3fc';
      TypeIcon = FaNetworkWired;
      break;
    case 'Hardware':
      borderColor = '#60a5fa';
      TypeIcon = FiTool;
      break;
    case 'Software':
      borderColor = '#a855f7';
      TypeIcon = FiPackage;
      break;
    case 'Storage':
      borderColor = '#eab308';
      TypeIcon = FiDatabase;
      break;
    case 'Attributes':
      borderColor = '#f472b6';
      TypeIcon = FiTag;
      break;
    default:
      borderColor = '#777';
      TypeIcon = FaQuestion;
      break;
  }
  
  return (
    <div 
      className={`detail-node ${isSelected ? 'selected' : ''}`}
      style={{ borderColor }}
      title={`${data.type}: ${data.label}\nClick for details`}
      data-connections={connectedNodes?.length || 0}
    >
      <Handle type="target" position={targetPosition || Position.Top} className="react-flow__handle" />
      
      <div className="detail-node-header">
        <div className="detail-node-icon"><TypeIcon /></div>
        <div className="detail-node-title">{data.label}</div>
      </div>
      
      <div className="detail-node-content">
        {data.apiData && Object.entries(data.apiData).slice(0, 3).map(([key, value]) => (
          <div key={key} className="detail-node-property">
            <span className="property-key">{key}:</span>
            <span className="property-value">
              {typeof value === 'object' ? '[Object]' : 
               Array.isArray(value) ? '[Array]' : 
               String(value).length > 15 ? `${String(value).substring(0, 15)}...` : String(value)}
            </span>
          </div>
        ))}
        {data.apiData && Object.keys(data.apiData).length > 3 && (
          <div className="detail-node-more">+{Object.keys(data.apiData).length - 3} more properties</div>
        )}
      </div>
      
      {connectedNodes?.length > 0 && (
        <div className="node-connections-count">
          {connectedNodes.length}
        </div>
      )}
      
      <Handle type="source" position={sourcePosition || Position.Bottom} className="react-flow__handle" />
    </div>
  );
};

export default memo(DetailNode);

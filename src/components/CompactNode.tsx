// src/components/CompactNode.tsx
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { CustomNodeDataForFlow } from '../types/visualization';
import './CompactNode.css';
import {
  FiServer, FiHardDrive, FiCloud, FiGitBranch, FiInfo, FiCpu,
  FiTag, FiDatabase
} from 'react-icons/fi';
import { FaDesktop, FaNetworkWired, FaBoxes, FaHdd, FaQuestion } from "react-icons/fa";

interface CompactNodeProps extends NodeProps<CustomNodeDataForFlow> {
  isSelected?: boolean;
  sourcePosition?: Position;
  targetPosition?: Position;
  data: CustomNodeDataForFlow;
}

const CompactNode: React.FC<CompactNodeProps> = ({ data, sourcePosition, targetPosition, isSelected }) => {
  const connectedNodes = data.connectedNodes || [];
  
  let borderColor = '#777';
  let statusClass = '';
  let nodeClass = '';
  let HeaderIcon: React.ElementType = FiInfo;

  // Set colors based on node type
  switch (data.type) {
    case 'VM':
      HeaderIcon = FaDesktop;
      borderColor = data.status === 'poweredOn' ? '#4ade80' : '#f87171';
      nodeClass += data.status === 'poweredOn' ? ' node-vm-on' : ' node-vm-off';
      break;
    case 'Host': 
      HeaderIcon = FiServer; 
      borderColor = '#60a5fa'; 
      nodeClass += ' node-host'; 
      break;
    case 'Cluster': 
      HeaderIcon = FiCloud; 
      borderColor = '#a855f7'; 
      nodeClass += ' node-cluster'; 
      break;
    case 'Datastore': 
      HeaderIcon = FiHardDrive; 
      borderColor = '#eab308'; 
      nodeClass += ' node-datastore'; 
      break;
    case 'Network': 
      HeaderIcon = FiGitBranch; 
      borderColor = '#7dd3fc'; 
      nodeClass += ' node-network'; 
      break;
    case 'Info':
      HeaderIcon = FiInfo;
      borderColor = '#4aaeff';
      break;
    case 'Compute':
      HeaderIcon = FiCpu;
      borderColor = '#4ade80';
      break;
    case 'Disk':
      HeaderIcon = FaHdd;
      borderColor = '#eab308';
      break;
    case 'NetworkAdapter':
      HeaderIcon = FaNetworkWired;
      borderColor = '#7dd3fc';
      break;
    case 'Hardware':
      HeaderIcon = FiInfo;
      borderColor = '#60a5fa';
      break;
    case 'Software':
      HeaderIcon = FaBoxes;
      borderColor = '#a855f7';
      break;
    case 'Storage':
      HeaderIcon = FiDatabase;
      borderColor = '#eab308';
      break;
    case 'Capacity':
      HeaderIcon = FiDatabase;
      borderColor = '#eab308';
      break;
    case 'Attributes':
      HeaderIcon = FiTag;
      borderColor = '#f472b6';
      break;
    default: 
      HeaderIcon = FaQuestion;
      borderColor = '#9ca3af';
  }
  
  return (
    <div 
      className={`compact-node ${statusClass} ${nodeClass} ${isSelected ? 'selected' : ''}`}
      style={{ borderColor }}
      title={`${data.type}: ${data.label}\nClick for details`}
      data-connections={connectedNodes?.length || 0}
    >
      <Handle type="target" position={targetPosition || Position.Top} className="react-flow__handle" />
      
      <div className="compact-node-content">
        <div className="compact-node-header">
          <div className="compact-node-icon"><HeaderIcon /></div>
          <div className="compact-node-title">{data.label}</div>
        </div>
        <div className="compact-node-type">{data.type}{data.status ? ` (${data.status})` : ''}</div>
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

export default memo(CompactNode);

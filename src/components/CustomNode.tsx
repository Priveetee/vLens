// src/components/CustomNode.tsx
import React, { memo } from 'react';
import { Handle, Position } from 'reactflow';
import type { NodeProps } from 'reactflow';
import type { CustomNodeDataForFlow, VisualizationNodeData, DAT_VM_Disk, DAT_VM_Nic, DATDisplayOptions } from '../types/visualization';

import {
  FiServer, FiHardDrive, FiCloud, FiGitBranch, FiInfo, FiCpu, FiSettings, FiLayers, FiTag
} from 'react-icons/fi';
import { FaDesktop, FaMemory, FaNetworkWired } from "react-icons/fa";
import './CustomNode.css';

interface CustomNodePropsExtended extends NodeProps<CustomNodeDataForFlow> {
  isSelected?: boolean;
  displayOptions?: DATDisplayOptions;
  sourcePosition?: Position;
  targetPosition?: Position;
  data: CustomNodeDataForFlow;
}

// Helper pour une ligne d'info avec icône optionnelle
const NodeInfoLine: React.FC<{ icon?: React.ReactNode; label?: string; value: React.ReactNode; valueClass?: string; fullWidth?: boolean; isCode?: boolean; unit?: string; fullWidthValue?: boolean }> =
({ icon, label, value, valueClass, fullWidth, isCode, unit, fullWidthValue }) => {
  let displayValue = "";
  if (typeof value === 'boolean') displayValue = value ? 'Oui' : 'Non';
  else if (value === null || typeof value === 'undefined' || String(value).trim() === "") displayValue = "N/A";
  else displayValue = String(value);

  // Ne pas afficher si la valeur est N/A et que le label n'est pas "Notes" (ou un autre champ où N/A est significatif)
  if (displayValue === "N/A" && label && !label.toLowerCase().includes("notes") && !label.toLowerCase().includes("uuid")) return null;

  const className = `custom-node-info-line ${fullWidth ? 'full-width' : ''} ${fullWidthValue ? 'full-width-value' : ''}`;

  return (
    <div className={className}>
      {icon && <span className="custom-node-info-line-icon">{icon}</span>}
      {label && <span className="custom-node-info-key">{label}:</span>}
      <span className={`custom-node-info-value ${valueClass || ''}`}>
        {isCode ? <code>{displayValue}</code> : displayValue}
        {unit && displayValue !== "N/A" && ` ${unit}`}
      </span>
    </div>
  );
};

const CustomNode: React.FC<CustomNodePropsExtended> = ({ data, sourcePosition, targetPosition, isSelected, displayOptions = { showFullDetailsOnVMNodes: true } }) => {
  let borderColor = '#777';
  let HeaderIcon: React.ElementType = FiInfo;
  let nodeClass = `node-type-${data.type.toLowerCase()}`;

  // Définir le style et l'icône en fonction du type
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
    default: 
      borderColor = '#9ca3af';
  }

  // Appliquer le style du nœud
  const nodeStyleApplied: React.CSSProperties = {
    '--border-color-dynamic': borderColor,
    borderColor: borderColor,
    boxShadow: isSelected ? `0 0 12px 4px ${borderColor}` : `0 5px 15px rgba(0,0,0,0.35)`,
    transform: isSelected ? 'scale(1.02)' : 'scale(1)',
  } as React.CSSProperties;

  const api = data.apiData as VisualizationNodeData;
  const formatLimit = (limit: any) => (limit === -1 || limit === "-1" || limit === null || typeof limit === 'undefined' ? "Illimitée" : String(limit));

  // Détecter si le nœud a des enfants (pour les afficher différemment)
  const hasChildren = data.childrenIds && data.childrenIds.length > 0;

  return (
    <div style={nodeStyleApplied} className={`custom-node-dat-shell ${nodeClass} ${isSelected ? 'selected' : ''} ${hasChildren ? 'has-children' : ''}`}>
      <Handle type="target" position={targetPosition || Position.Top} className="react-flow__handle" />
      <div className="custom-node-dat-header">
        <HeaderIcon style={{ color: borderColor, marginRight: '10px', fontSize: '1.7em', flexShrink: 0 }} />
        <div className="custom-node-dat-title-block">
          <strong className="custom-node-dat-title-text" title={data.label}>{data.label}</strong>
          <span className="custom-node-dat-type-text">({data.type}{data.status ? ` / ${data.status}` : ''})</span>
        </div>
      </div>

      <div className={`custom-node-dat-body-scrollable ${!displayOptions.showFullDetailsOnVMNodes ? 'summary-view' : ''}`}>
        {/* --- Section 1: Identification (VM) --- */}
        {data.type === 'VM' && api && displayOptions.showFullDetailsOnVMNodes && (
          <details className="custom-node-dat-section identification" open>
            <summary><FiInfo /> Identification</summary>
            <div className="custom-node-section-grid">
              <NodeInfoLine label="Instance UUID" value={api.instance_uuid} isCode fullWidthValue />
              <NodeInfoLine label="Guest OS" value={api.guest_os_full} fullWidthValue />
              <NodeInfoLine label="Tools Status" value={api.tools_status} />
              <NodeInfoLine label="HW Version" value={api.vm_version} />
            </div>
          </details>
        )}

        {/* --- Section 2: Ressources Calcul (VM) --- */}
        {data.type === 'VM' && api && displayOptions.showFullDetailsOnVMNodes && (
          <details className="custom-node-dat-section compute" open>
            <summary><FiCpu /> Ressources Calcul</summary>
            <div className="custom-node-section-grid">
              <NodeInfoLine label="vCPUs" value={`${api.vcpus || '?'} (${api.vcpus && api.cores_per_socket ? Math.floor(api.vcpus / api.cores_per_socket) : 'N/A'} skt x ${api.cores_per_socket || '?'}c)`} />
              <NodeInfoLine label="RAM" value={api.ram_mb ? (api.ram_mb / 1024).toFixed(1) : '?'} unit="GB" />
              <div className="info-subsection-title-node">Allocations CPU</div>
              <NodeInfoLine label="Réservation" value={formatLimit(api.cpu_reservation_mhz)} unit="MHz" />
              <NodeInfoLine label="Limite" value={formatLimit(api.cpu_limit_mhz)} unit="MHz" />
              <div className="info-subsection-title-node">Allocations Mémoire</div>
              <NodeInfoLine label="Réservation" value={formatLimit(api.mem_reservation_mb)} unit="MB" />
              <NodeInfoLine label="Limite" value={formatLimit(api.mem_limit_mb)} unit="MB" />
            </div>
          </details>
        )}

        {/* --- Section 3: Stockage (VM) --- */}
        {data.type === 'VM' && api && api.disks && (api.disks as DAT_VM_Disk[]).length > 0 && displayOptions.showFullDetailsOnVMNodes && (
          <details className="custom-node-dat-section storage" open>
            <summary><FiHardDrive /> Stockage ({(api.disks as DAT_VM_Disk[]).length})</summary>
            <div className="custom-node-section-grid">
              {(api.disks as DAT_VM_Disk[]).slice(0, 2).map((disk, index) => (
                <div key={`disk-${index}`} className="custom-node-item-group">
                  <strong>{disk.label || `Disque ${index + 1}`} ({disk.capacity_gb?.toFixed(0)} GB)</strong>
                  <NodeInfoLine label="Datastore" value={disk.datastore_info?.name || disk.datastore_name} />
                  <NodeInfoLine label="Provisioning" value={disk.provisioning_type || (disk.thin_provisioned ? "Thin" : "Thick")} />
                </div>
              ))}
              {(api.disks as DAT_VM_Disk[]).length > 2 && (
                <div className="custom-node-more-indicator">+ {(api.disks as DAT_VM_Disk[]).length - 2} disque(s) supplémentaire(s)</div>
              )}
            </div>
          </details>
        )}

        {/* --- Section 4: Réseau (VM) --- */}
        {data.type === 'VM' && api && api.network_adapters && (api.network_adapters as DAT_VM_Nic[]).length > 0 && displayOptions.showFullDetailsOnVMNodes && (
          <details className="custom-node-dat-section network" open>
            <summary><FaNetworkWired /> Réseau ({(api.network_adapters as DAT_VM_Nic[]).length})</summary>
            <div className="custom-node-section-grid">
              {(api.network_adapters as DAT_VM_Nic[]).slice(0, 1).map((nic, index) => (
                <div key={`nic-${index}`} className="custom-node-item-group">
                  <strong>{nic.label || `NIC ${index + 1}`} ({nic.adapter_type})</strong>
                  <NodeInfoLine label="Connecté à" value={nic.connected_network_info?.configured_name || nic.network_name} />
                  <NodeInfoLine label="MAC" value={nic.mac_address} isCode />
                  {nic.guest_ips && nic.guest_ips.length > 0 &&
                    <NodeInfoLine label="IPs" value={nic.guest_ips.map(ip => ip.split(' (')[0]).join(', ')} isCode fullWidthValue />
                  }
                </div>
              ))}
              {(api.network_adapters as DAT_VM_Nic[]).length > 1 && (
                <div className="custom-node-more-indicator">+ {(api.network_adapters as DAT_VM_Nic[]).length - 1} interface(s) supplémentaire(s)</div>
              )}
            </div>
          </details>
        )}

        {/* --- Section 5: Hébergement (VM) --- */}
        {data.type === 'VM' && api && displayOptions.showFullDetailsOnVMNodes && (
          <details className="custom-node-dat-section hosting" open>
            <summary><FiLayers /> Hébergement</summary>
            <div className="custom-node-section-grid">
              <NodeInfoLine label="Hôte ESXi" value={api.host_name} fullWidthValue />
              {api.cluster_name && <NodeInfoLine label="Cluster" value={api.cluster_name} fullWidthValue />}
              {api.datacenter_name && <NodeInfoLine label="Datacenter" value={api.datacenter_name} fullWidthValue />}
            </div>
          </details>
        )}

        {/* --- Section 6: Attributs Personnalisés (VM) --- */}
        {data.type === 'VM' && api && api.custom_attributes && Object.keys(api.custom_attributes).length > 0 && displayOptions.showFullDetailsOnVMNodes && (
          <details className="custom-node-dat-section attributes" open>
            <summary><FiTag /> Attributs ({Object.keys(api.custom_attributes).length})</summary>
            <div className="custom-node-section-grid">
              {Object.entries(api.custom_attributes).map(([key, value]) => (
                <NodeInfoLine key={`attr-${key}`} label={key} value={value as string} fullWidthValue />
              ))}
            </div>
          </details>
        )}

        {/* --- Affichage condensé pour les VM quand showFullDetailsOnVMNodes est false --- */}
        {data.type === 'VM' && api && !displayOptions.showFullDetailsOnVMNodes && (
          <div className="custom-node-v2-section single-section condensed-info">
            <NodeInfoLine icon={<FiInfo />} label="OS" value={String(api.guest_os_full || 'N/A').split('(')[0].trim()} />
            <NodeInfoLine icon={<FiCpu />} label="CPU/RAM" value={`${api.vcpus || '?'}vCPU / ${api.ram_mb ? (api.ram_mb/1024).toFixed(0) : '?'}GB`} />
            <NodeInfoLine icon={<FiLayers />} label="Hôte" value={api.host_name} />
            <NodeInfoLine icon={<FiHardDrive />} label="Disques" value={`${api.disks ? (api.disks as any[]).length : 0} (${api.disks ? (api.disks as any[]).reduce((acc, disk) => acc + (disk.capacity_gb || 0), 0).toFixed(0) : 0} GB)`} />
            <NodeInfoLine icon={<FaNetworkWired />} label="Réseaux" value={`${api.network_adapters ? (api.network_adapters as any[]).length : 0}`} />
          </div>
        )}

        {/* --- Affichage pour les hôtes ESXi --- */}
        {data.type === 'Host' && api && (
          <div className="custom-node-v2-section single-section">
            <NodeInfoLine icon={<FiServer />} label="Modèle" value={api.model} fullWidthValue />
            <NodeInfoLine icon={<FiCpu />} label="CPU" value={`${api.cpu_total_cores || '?'}c / ${api.cpu_sockets || '?'} skt`} />
            <NodeInfoLine icon={<FaMemory />} label="RAM" value={`${api.memory_gb?.toFixed(0) || '?'} GB`} />
            <NodeInfoLine icon={<FiInfo />} label="Version" value={String(api.version_full || api.version || 'N/A').split(' ')[0]} />
            <NodeInfoLine icon={<FiTag />} label="État" value={api.status || api.power_state} />
            {api.cluster_name && <NodeInfoLine icon={<FiCloud />} label="Cluster" value={api.cluster_name} fullWidthValue />}
            {api.datacenter_name && <NodeInfoLine icon={<FiLayers />} label="Datacenter" value={api.datacenter_name} fullWidthValue />}
          </div>
        )}

        {/* --- Affichage pour les clusters --- */}
        {data.type === 'Cluster' && api && (
          <div className="custom-node-v2-section single-section">
            <NodeInfoLine icon={<FiCloud />} label="Statut" value={api.overallStatus} />
            <NodeInfoLine icon={<FiSettings />} label="HA" value={api.ha_enabled} />
            <NodeInfoLine icon={<FiSettings />} label="DRS" value={api.drs_enabled} />
            {api.drs_enabled && <NodeInfoLine icon={<FiSettings />} label="DRS Mode" value={api.drs_behavior} />}
            <NodeInfoLine icon={<FiServer />} label="Hôtes" value={api.host_count || '?'} />
            <NodeInfoLine icon={<FiLayers />} label="Datacenter" value={api.datacenter_name} fullWidthValue />
          </div>
        )}

        {/* --- Affichage pour les datastores --- */}
        {data.type === 'Datastore' && api && (
          <div className="custom-node-v2-section single-section">
            <NodeInfoLine icon={<FiHardDrive />} label="Type" value={api.type} />
            <NodeInfoLine icon={<FiHardDrive />} label="Capacité" value={`${api.capacity_gb?.toFixed(0) || '?'} GB`} />
            <NodeInfoLine icon={<FiHardDrive />} label="Libre" value={`${api.free_space_gb?.toFixed(0) || '?'} GB`} />
            <NodeInfoLine icon={<FiHardDrive />} label="Utilisé" value={api.capacity_gb && api.free_space_gb ? `${((api.capacity_gb - api.free_space_gb) / api.capacity_gb * 100).toFixed(1)}%` : 'N/A'} />
            <NodeInfoLine icon={<FiServer />} label="Hôtes" value={api.host_count || api.host_accessible_count || '?'} />
            <NodeInfoLine icon={<FiTag />} label="Accessible" value={api.accessible === undefined ? 'N/A' : (api.accessible ? 'Oui' : 'Non')} />
          </div>
        )}

        {/* --- Affichage pour les réseaux --- */}
        {data.type === 'Network' && api && (
          <div className="custom-node-v2-section single-section">
            <NodeInfoLine icon={<FiGitBranch />} label="Type" value={api.type} />
            {api.vlan_id_info && <NodeInfoLine icon={<FiTag />} label="VLAN" value={api.vlan_id_info} />}
            {api.dvswitch_name && <NodeInfoLine icon={<FiGitBranch />} label="DVSwitch" value={api.dvswitch_name} fullWidthValue />}
            <NodeInfoLine icon={<FaDesktop />} label="VMs" value={api.vm_count || '?'} />
          </div>
        )}
      </div>
      <Handle type="source" position={sourcePosition || Position.Bottom} className="react-flow__handle" />
    </div>
  );
};

export default memo(CustomNode);

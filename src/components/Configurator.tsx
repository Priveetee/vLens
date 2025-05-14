// ok the name is pretty shity "configurator" but for my defense
// i have 0 inspiration so i just inspired from dexter's lab

import React, { useState } from 'react';
import type {
  VMDependencyInclusionConfig,
  HostDepth2InclusionConfig,
  DATDisplayOptions
} from '../types/visualization';
import './Configurator.css';

interface ConfiguratorProps {
  onSubmit: (payload: {
    vmIdentifier: string;
    topologyVmInclusions: VMDependencyInclusionConfig;
    topologyHostDepth2Inclusions: HostDepth2InclusionConfig;
    depth: number;
    datDisplayOptions: DATDisplayOptions;
    explodeNodes: boolean;
  }) => void;
  isLoading: boolean;
}

const initialTopologyVmInclusions: VMDependencyInclusionConfig = {
  include_host: true,
  include_cluster_of_host: true,
  include_datastores: true,
  include_networks: true,
};
const initialTopologyHostDepth2Inclusions: HostDepth2InclusionConfig = {
  include_vms_on_host: true,
};
const initialDatDisplayOptions: DATDisplayOptions = {
  showIdentification: true,
  showComputeResources: true,
  showStorageConfig: true,
  showNetworkConfig: true,
  showHostingContext: true,
  showCustomAttributes: true,
  showTableOfContents: true,
  showFullDetailsOnVMNodes: true,
};

const topologyVmInclusionLabels: Record<keyof VMDependencyInclusionConfig, string> = {
  include_host: "Hôte de la VM",
  include_cluster_of_host: "Cluster de l'Hôte",
  include_datastores: "Datastores de la VM",
  include_networks: "Réseaux de la VM",
};
const topologyHostDepth2InclusionLabels: Record<keyof HostDepth2InclusionConfig, string> = {
  include_vms_on_host: "Autres VMs sur l'Hôte",
};
const datSectionLabels: Record<keyof DATDisplayOptions, string> = {
  showIdentification: "1. Identification",
  showComputeResources: "2. Ressources Calcul",
  showStorageConfig: "3. Stockage",
  showNetworkConfig: "4. Réseau",
  showHostingContext: "5. Hébergement",
  showCustomAttributes: "6. Attributs Personnalisés",
  showTableOfContents: "Afficher table des matières",
  showFullDetailsOnVMNodes: "Afficher détails sur nœuds VM",
};

export function Configurator({ onSubmit, isLoading }: ConfiguratorProps) {
  const [vmIdentifier, setVmIdentifier] = useState<string>("");
  const [topologyVmInclusions, setTopologyVmInclusions] = useState<VMDependencyInclusionConfig>(initialTopologyVmInclusions);
  const [topologyHostDepth2Inclusions, setTopologyHostDepth2Inclusions] = useState<HostDepth2InclusionConfig>(initialTopologyHostDepth2Inclusions);
  const [depth, setDepth] = useState<number>(1);
  const [datDisplayOptions, setDatDisplayOptions] = useState<DATDisplayOptions>(initialDatDisplayOptions);
  const [explodeNodes, setExplodeNodes] = useState<boolean>(false);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => setVmIdentifier(event.target.value);
  const handleDepthChange = (event: React.ChangeEvent<HTMLSelectElement>) => setDepth(parseInt(event.target.value, 10));
  const handleTopologyVmInclusionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setTopologyVmInclusions(prev => ({ ...prev, [name as keyof VMDependencyInclusionConfig]: checked }));
  };
  const handleTopologyHostDepth2InclusionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setTopologyHostDepth2Inclusions(prev => ({ ...prev, [name as keyof HostDepth2InclusionConfig]: checked }));
  };
  const handleDatDisplayOptionChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, checked } = event.target;
    setDatDisplayOptions(prev => ({ ...prev, [name as keyof DATDisplayOptions]: checked }));
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (vmIdentifier.trim() !== "") {
      onSubmit({ 
        vmIdentifier: vmIdentifier.trim(), 
        topologyVmInclusions, 
        topologyHostDepth2Inclusions, 
        depth, 
        datDisplayOptions,
        explodeNodes,
      });
    } else { 
      alert("Veuillez entrer un nom ou UUID de VM."); 
    }
  };

  const applySimpleView = () => {
    setDepth(1);
    setTopologyVmInclusions({
      include_host: true,
      include_datastores: true,
      include_networks: true,
      include_cluster_of_host: false,
    });
    setTopologyHostDepth2Inclusions({
      include_vms_on_host: false,
    });
    setExplodeNodes(false);
  };

  const applyDetailedView = () => {
    setDepth(2);
    setTopologyVmInclusions({
      include_host: true,
      include_datastores: true,
      include_networks: true,
      include_cluster_of_host: true,
    });
    setTopologyHostDepth2Inclusions({
      include_vms_on_host: true,
    });
    setExplodeNodes(true);
  };

  return (
    <form onSubmit={handleSubmit} className="configurator-form">
      {isLoading && (
        <div className="loading-overlay">
          <div className="loading-spinner"></div>
          <div>Traitement en cours...</div>
        </div>
      )}
      
      <div className="config-header">
        <h3>Configuration</h3>
        <div className="preset-buttons">
          <button type="button" onClick={applySimpleView} className="preset-button" disabled={isLoading}>
            Vue Simple
          </button>
          <button type="button" onClick={applyDetailedView} className="preset-button" disabled={isLoading}>
            Vue Détaillée
          </button>
        </div>
      </div>

      <div className="form-section primary-section">
        <label htmlFor="vmIdentifier">VM de départ :</label>
        <input 
          id="vmIdentifier" 
          type="text" 
          value={vmIdentifier} 
          onChange={handleInputChange} 
          placeholder="Nom ou Instance UUID" 
          required 
          disabled={isLoading} 
        />
      </div>

      <div className="form-section">
        <div className="section-header">
          <h4>Options de topologie</h4>
        </div>
        
        <div className="form-row">
          <label htmlFor="depthSelect">Profondeur d'exploration :</label>
          <select 
            id="depthSelect" 
            value={depth} 
            onChange={handleDepthChange} 
            disabled={isLoading}
          >
            <option value={1}>1 - Dépendances directes</option>
            <option value={2}>2 - Dépendances de niveau 2</option>
          </select>
        </div>

        <div className="form-row">
          <label className="checkbox-container">
            <input 
              type="checkbox" 
              checked={explodeNodes} 
              onChange={(e) => setExplodeNodes(e.target.checked)} 
              disabled={isLoading} 
            />
            <span className="checkmark"></span>
            <span>Vue éclatée (tous les éléments séparés)</span>
          </label>
        </div>
        
        <div className="checkbox-group">
          <div className="checkbox-column">
            <h5>Inclusions pour VM de départ</h5>
            {(Object.keys(topologyVmInclusions) as Array<keyof VMDependencyInclusionConfig>).map((key) => (
              <label key={`topo-vm-${key}`} className="checkbox-container">
                <input 
                  type="checkbox" 
                  name={key} 
                  checked={topologyVmInclusions[key]} 
                  onChange={handleTopologyVmInclusionChange} 
                  disabled={isLoading} 
                />
                <span className="checkmark"></span>
                <span>{topologyVmInclusionLabels[key]}</span>
              </label>
            ))}
          </div>
          
          {depth === 2 && (
            <div className="checkbox-column">
              <h5>Inclusions pour niveau 2</h5>
              {(Object.keys(topologyHostDepth2Inclusions) as Array<keyof HostDepth2InclusionConfig>).map((key) => (
                <label key={`topo-host-${key}`} className="checkbox-container">
                  <input 
                    type="checkbox" 
                    name={key} 
                    checked={topologyHostDepth2Inclusions[key]} 
                    onChange={handleTopologyHostDepth2InclusionChange} 
                    disabled={isLoading} 
                  />
                  <span className="checkmark"></span>
                  <span>{topologyHostDepth2InclusionLabels[key]}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="form-section">
        <div className="section-header">
          <h4>Options du document (DAT)</h4>
          <label className="checkbox-container all-sections">
            <input 
              type="checkbox" 
              checked={Object.values(datDisplayOptions).every(val => val === true)}
              onChange={(e) => {
                const allChecked = e.target.checked;
                const newOptions = {} as DATDisplayOptions;
                for (const key in datDisplayOptions) {
                  newOptions[key as keyof DATDisplayOptions] = allChecked;
                }
                setDatDisplayOptions(newOptions);
              }}
              disabled={isLoading} 
            />
            <span className="checkmark"></span>
            <span>Toutes les sections</span>
          </label>
        </div>
        
        <div className="dat-sections-grid">
          {(Object.keys(datDisplayOptions) as Array<keyof DATDisplayOptions>).map((key) => (
            <label key={`dat-opt-${key}`} className="checkbox-container">
              <input 
                type="checkbox" 
                name={key} 
                checked={datDisplayOptions[key]} 
                onChange={handleDatDisplayOptionChange} 
                disabled={isLoading} 
              />
              <span className="checkmark"></span>
              <span>{datSectionLabels[key]}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="button-container">
        <button type="submit" className="submit-button" disabled={isLoading || !vmIdentifier.trim()}>
          {isLoading ? (
            <span className="loading-indicator">
              <span className="spinner"></span> Chargement...
            </span>
          ) : "Visualiser / Générer DAT"}
        </button>
      </div>
    </form>
  );
}

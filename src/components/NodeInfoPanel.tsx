// src/components/NodeInfoPanel.tsx
import React, { useState } from 'react';
import type { VisualizationNode, VMDATResponse, DATGenerationRequestPayload } from '../types/visualization';
import './NodeInfoPanel.css';

// Get API base URL from environment or use default
const API_BASE_URL = process.env.REACT_APP_API_URL || 
                    (window.location.hostname === 'localhost' ? 
                     "http://localhost:8001" : 
                     `http://${window.location.hostname}:8001`);

interface NodeInfoPanelProps {
  node: Pick<VisualizationNode, 'id' | 'label' | 'type' | 'status' | 'data'>; // Données pour l'aperçu et l'appel DAT
  onClose: () => void;
  onDatGenerated: (datData: VMDATResponse | null, errorMsg?: string | null) => void; // Callback pour remonter les données/erreur à App.tsx
  isGeneratingDat: boolean; // Reçu depuis App.tsx
  datError?: string | null; // Reçu depuis App.tsx
  onDatGenerationStart: () => void; // Callback pour informer App.tsx du début
}

// Helper DataRow (peut être externalisé si utilisé ailleurs)
const DataRow: React.FC<{ label: string; value: any; isCode?: boolean }> = ({ label, value, isCode }) => {
  let displayValue = "";
  if (typeof value === 'boolean') displayValue = value ? 'Oui' : 'Non';
  else if (value === null || typeof value === 'undefined') displayValue = "N/A";
  else displayValue = String(value);
  if (displayValue.trim() === "" && label.toLowerCase() !== 'notes' && value !== "N/A") return null;
  return (
    <div className="data-entry">
      <span className="data-key">{label.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}:</span>
      <span className="data-value">{isCode ? <code>{displayValue}</code> : displayValue}</span>
    </div>
  );
};


export function NodeInfoPanel({
  node,
  onClose,
  onDatGenerated,
  isGeneratingDat,
  onDatGenerationStart
}: NodeInfoPanelProps) {
  const [userNotes, setUserNotes] = useState<string>('');
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);

  const handleGenerateDat = async () => {
    if (!node || node.type !== "VM") {
      alert("La génération de DAT n'est actuellement supportée que pour les VMs.");
      return;
    }
    
    onDatGenerationStart(); // Informer App que la génération commence

    try {
      const payload: DATGenerationRequestPayload = {
        // Utiliser l'identifiant le plus fiable depuis node.data (qui sont les données brutes de l'API pour ce nœud)
        vm_identifier: node.data.instance_uuid || node.data.name || node.label,
      };
      const response = await fetch(`${API_BASE_URL}/api/v1/dat/generate/vm`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let errorDetail = `Erreur API ${response.status}`;
        try { const errorData = await response.json(); errorDetail = `${errorDetail} - ${errorData.detail || response.statusText}`; }
        catch (e) { /* ignore parsing error */ }
        throw new Error(errorDetail);
      }
      const datData: VMDATResponse = await response.json();
      onDatGenerated(datData, null); // Transmettre les données au parent (App.tsx)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Erreur inconnue.";
      onDatGenerated(null, errorMessage); // Transmettre l'erreur au parent
      console.error("Erreur génération DAT:", err);
    }
  };

  if (!node) return null;

  return (
    <div className="node-info-panel">
      <div className="panel-header">
        <h3>Details: {node.label} ({node.type})</h3>
        <button onClick={onClose} className="close-button" title="Close">×</button>
      </div>
      <div className="panel-content">
        <h4>Quick Overview:</h4>
        <DataRow label="ID (Graphe)" value={node.id} isCode />
        <DataRow label="Label" value={node.label} />
        <DataRow label="Type" value={node.type} />
        {node.status && <DataRow label="Statut (Graphe)" value={node.status} />}
        {/* Afficher quelques données brutes pour le contexte */}
        {node.data && Object.keys(node.data).length > 0 && <hr className="section-hr" />}
        {node.data && Object.entries(node.data).slice(0,3).map(([key, value]) => (
             <DataRow key={`preview-${key}`} label={`data.${key}`} value={typeof value === 'object' ? '[Objet]' : String(value)} />
        ))}
         {node.data && Object.keys(node.data).length > 3 && <div className="data-entry"><span className="data-key">...</span></div>}


        {node.type === "VM" && (
          <div className="dat-section">
            <hr className="section-hr" />
            <button onClick={handleGenerateDat} disabled={isGeneratingDat} className="dat-button">
              {isGeneratingDat ? (
                <span className="loading-indicator">
                  Génération DAT... <span className="spinner"></span>
                </span>
              ) : "Afficher DAT Complet"}
            </button>
          </div>
        )}
        {/* L'erreur DAT est maintenant gérée et affichée par App.tsx via DatDisplay */}
        {/* {datError && <div className="dat-error-message">Erreur DAT: {datError}</div>} */}
        
        <div className="user-notes-section">
          <h4>Notes personnelles</h4>
          {isEditingNotes ? (
            <div className="notes-editor">
              <textarea
                value={userNotes}
                onChange={(e) => setUserNotes(e.target.value)}
                placeholder="Ajoutez vos notes ici..."
                rows={4}
                className="notes-textarea"
              />
              <div className="notes-editor-buttons">
                <button 
                  onClick={() => setIsEditingNotes(false)} 
                  className="notes-save-button"
                >
                  Enregistrer
                </button>
                <button 
                  onClick={() => {
                    setIsEditingNotes(false);
                    setUserNotes(''); // Effacer les notes
                  }} 
                  className="notes-cancel-button"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <div className="notes-display">
              {userNotes ? (
                <div className="notes-content">{userNotes}</div>
              ) : (
                <div className="notes-empty">Aucune note pour cet élément.</div>
              )}
              <button 
                onClick={() => setIsEditingNotes(true)} 
                className="notes-edit-button"
              >
                {userNotes ? "Modifier" : "Ajouter une note"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

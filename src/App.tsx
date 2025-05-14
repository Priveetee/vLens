// src/App.tsx
import React, { useState, useCallback } from "react";
import { Routes, Route, useNavigate } from 'react-router-dom';
import "./App.css"; 
import { Configurator } from "./components/Configurator";
import { VisualizationPage } from "./pages/VisualizationPage";
import type {
  VisualizationConfigPayload,
  VMDependencyInclusionConfig,
  HostDepth2InclusionConfig,
  DATDisplayOptions,
} from "./types/visualization";

function App() {
  const navigate = useNavigate();
  const [isLoadingApp, setIsLoadingApp] = useState(false); 

  const handleConfigSubmit = useCallback((configFromConfigurator: {
    vmIdentifier: string;
    topologyVmInclusions: VMDependencyInclusionConfig;
    topologyHostDepth2Inclusions: HostDepth2InclusionConfig;
    depth: number;
    datDisplayOptions: DATDisplayOptions;
    explodeNodes: boolean; 
  }) => {
    const payloadForApi: VisualizationConfigPayload = {
      start_object_identifier: configFromConfigurator.vmIdentifier,
      start_object_type: "VM", 
      vm_inclusions: configFromConfigurator.topologyVmInclusions,
      host_depth2_inclusions: configFromConfigurator.topologyHostDepth2Inclusions,
      depth: configFromConfigurator.depth,
    };
    console.log("App.tsx: Configuration pour topologie API:", payloadForApi);
    console.log("App.tsx: Options d'affichage DAT pour la page de visualisation:", configFromConfigurator.datDisplayOptions);
    console.log("App.tsx: Vue éclatée activée:", configFromConfigurator.explodeNodes);

    setIsLoadingApp(true); // Indiquer le chargement global pendant la navigation et le fetch initial

    navigate("/visualize", {
      state: { 
        vizConfigPayload: payloadForApi,
        datDisplayOptions: configFromConfigurator.datDisplayOptions,
        explodeNodes: configFromConfigurator.explodeNodes 
      }
    });
  }, [navigate]);

  return (
    <div className="App">
      <Routes>
        <Route 
          path="/" 
          element={
            <ConfiguratorPage 
              onSubmit={handleConfigSubmit} 
              isLoading={isLoadingApp} 
            />
          } 
        />
        <Route 
          path="/visualize" 
          element={
            <VisualizationPage 
              setIsLoadingGlobal={setIsLoadingApp} 
            />
          } 
        />
      </Routes>
    </div>
  );
}

// Interface pour les props de ConfiguratorPage
interface ConfiguratorPageProps {
  onSubmit: (config: {
    vmIdentifier: string;
    topologyVmInclusions: VMDependencyInclusionConfig;
    topologyHostDepth2Inclusions: HostDepth2InclusionConfig;
    depth: number;
    datDisplayOptions: DATDisplayOptions;
    explodeNodes: boolean; // Nouvelle propriété
  }) => void;
  isLoading: boolean;
}

const ConfiguratorPage: React.FC<ConfiguratorPageProps> = ({ onSubmit, isLoading }) => {
  return (
    <div className="configurator-page-container">
      <Configurator onSubmit={onSubmit} isLoading={isLoading} />
    </div>
  );
};

export default App;

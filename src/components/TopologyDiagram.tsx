// src/components/TopologyDiagram.tsx
import React, { useCallback, useEffect, useState, useRef } from 'react';
import ReactFlow, {
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  ReactFlowProvider,
  useReactFlow,
} from 'reactflow';
import type {
  Node,
  Edge,
  Connection,
  NodeTypes,
  OnNodeClick
} from 'reactflow';

import 'reactflow/dist/style.css'; 
import './TopologyDiagram.css';   
import './HideControls.css'; 

import type { CustomNodeDataForFlow } from '../types/visualization';
import { FiMaximize, FiLayout, FiLock, FiUnlock, FiCameraOff, FiCamera } from 'react-icons/fi';

interface TopologyDiagramProps {
  apiNodes?: Node<CustomNodeDataForFlow>[];
  apiEdges?: Edge[];
  customNodeTypes?: NodeTypes;
  onNodeClick?: (nodeData: CustomNodeDataForFlow) => void;
  layoutDirection?: 'TB' | 'LR';
  onLayoutDirectionChange?: (direction: 'TB' | 'LR') => void;
}

// Composant interne qui utilise les hooks React Flow
const FlowContent = ({
  apiNodes = [],
  apiEdges = [],
  customNodeTypes,
  onNodeClick,
  layoutDirection = 'TB',
  onLayoutDirectionChange
}: {
  apiNodes: Node<CustomNodeDataForFlow>[];
  apiEdges: Edge[];
  customNodeTypes: NodeTypes;
  onNodeClick: (nodeData: CustomNodeDataForFlow) => void;
  layoutDirection?: 'TB' | 'LR';
  onLayoutDirectionChange?: (direction: 'TB' | 'LR') => void;
}) => {
  // Style du fond est appliqué directement
  const [nodes, setNodes, onNodesChange] = useNodesState(apiNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(apiEdges);
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [isLayouting, setIsLayouting] = useState(false);
  const [nodesLocked, setNodesLocked] = useState(false);
  const [autoCenterEnabled, setAutoCenterEnabled] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Info panel visibility is controlled elsewhere
  const autoCenterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowInstance = useReactFlow();

  // Use the custom node types directly as they are already memoized in the parent component
  // This avoids re-memoizing already memoized values which can cause React Flow warnings
  const memoizedNodeTypes: NodeTypes = customNodeTypes || {};

  // Mettre à jour les nœuds et arêtes si les props de l'API changent
  useEffect(() => {
    // Using type assertion to handle the 'never' type issue
    const typedNodes = apiNodes as Node<CustomNodeDataForFlow>[];
    setNodes(typedNodes.map(node => ({
      id: node.id,
      type: node.type,
      data: node.data,
      position: node.position,
      // Make nodes draggable by default
      draggable: !nodesLocked,
    })));
    setEdges(apiEdges);
  }, [apiNodes, apiEdges, setNodes, setEdges, nodesLocked]);

  const onConnect = useCallback(
    (params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );

  // Gestionnaire de clic sur un nœud
  const handleNodeClick: OnNodeClick = useCallback((_event, node) => {
    setSelectedNodeId(node.id);
    
    // Centrer sur le nœud sélectionné avec animation
    reactFlowInstance.setCenter(
      node.position.x + (node.width || 200) / 2,
      node.position.y + (node.height || 100) / 2,
      { duration: 800, zoom: 1.2 }
    );
    
    if (onNodeClick && node.data) {
      onNodeClick(node.data);
    }
  }, [onNodeClick, reactFlowInstance]);

  // Function to center all nodes in view with animation
  const zoomToFit = useCallback(() => {
    // Si un nœud est sélectionné, zoomer dessus
    if (selectedNodeId) {
      const node = nodes.find(n => n.id === selectedNodeId);
      if (node) {
        reactFlowInstance.setCenter(
          node.position.x + (node.width || 200) / 2,
          node.position.y + (node.height || 100) / 2,
          { duration: 1200, zoom: 1.1 }
        );
        return;
      }
    }
    
    // Sinon faire un fit view classique avec paramètres ajustés
    reactFlowInstance.fitView({
      duration: 1200,
      padding: 0.3
    });
  }, [reactFlowInstance, nodes, selectedNodeId]);

  // Reset the auto-center timer when user interacts with the diagram
  const resetAutoCenterTimer = useCallback(() => {
    if (autoCenterTimerRef.current) {
      clearTimeout(autoCenterTimerRef.current);
    }
    
    // Don't restart the timer - auto centering is disabled by default
    // User can still use manual controls if needed
    if (autoCenterEnabled) {
      autoCenterTimerRef.current = setTimeout(() => {
        zoomToFit();
      }, 10000); 
    }
  }, [autoCenterEnabled, zoomToFit]);

  // Setup the interaction listeners
  useEffect(() => {
    const wrapper = reactFlowWrapper.current;
    if (!wrapper) return;
    
    const handleInteraction = resetAutoCenterTimer;
    
    wrapper.addEventListener('mousedown', handleInteraction);
    wrapper.addEventListener('wheel', handleInteraction);
    wrapper.addEventListener('touchstart', handleInteraction);
    
    // Initial zoom to fit after loading
    if (nodes.length > 0 && !isLayouting) {
      setTimeout(zoomToFit, 300);
    }
    
    return () => {
      wrapper.removeEventListener('mousedown', handleInteraction);
      wrapper.removeEventListener('wheel', handleInteraction);
      wrapper.removeEventListener('touchstart', handleInteraction);
      if (autoCenterTimerRef.current) {
        clearTimeout(autoCenterTimerRef.current);
      }
    };
  }, [nodes, zoomToFit, isLayouting, resetAutoCenterTimer]);

  // Handle node drag to reset auto-center timer
  const onNodeDragStart = useCallback(() => {
    resetAutoCenterTimer();
  }, [resetAutoCenterTimer]);

  // Toggle node dragging ability
  const toggleNodeLock = useCallback(() => {
    setNodesLocked(prev => {
      const newLockState = !prev;
      // Update all nodes with new draggable state
      setNodes(nodes => nodes.map(node => ({
        ...node,
        draggable: !newLockState,
      })));
      return newLockState;
    });
  }, [setNodes]);

  // Toggle auto-centering
  const toggleAutoCenter = useCallback(() => {
    setAutoCenterEnabled(prev => !prev);
    if (autoCenterTimerRef.current) {
      clearTimeout(autoCenterTimerRef.current);
    }
  }, []);

  // Changer la direction du layout
  const changeLayout = useCallback((direction: 'TB' | 'LR') => {
    if (onLayoutDirectionChange) {
      setIsLayouting(true);
      onLayoutDirectionChange(direction);
      setTimeout(() => {
        setIsLayouting(false);
        zoomToFit();
      }, 500);
    }
  }, [onLayoutDirectionChange, zoomToFit]);

  return (
    <div ref={reactFlowWrapper} style={{ width: '100%', height: '100%' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={handleNodeClick}
        onNodeDragStart={onNodeDragStart}
        nodeTypes={memoizedNodeTypes} 
        defaultViewport={{ x: 0, y: 0, zoom: 0.8 }}
        minZoom={0.1}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        attributionPosition="bottom-left"
        proOptions={{ hideAttribution: true }}
        nodesDraggable={!nodesLocked}
        // Performance optimizations
        nodeExtent={[[-5000, -5000], [5000, 5000]]} 
        elevateNodesOnSelect={true}
        elementsSelectable={true}
        multiSelectionKeyCode="Shift" 
        panOnScroll={false}      
        zoomOnScroll={true}      
        zoomOnPinch={true}       
        zoomActivationKeyCode={null} 
        // Désactiver les contrôles en bas
        defaultEdgeOptions={{ style: { stroke: '#fff' } }}
        showControls={false} 
      >
        {/* Contrôles supprimés */}
        <MiniMap 
          nodeStrokeWidth={3} 
          zoomable 
          pannable 
          nodeColor={(node: Node<CustomNodeDataForFlow>) => {
            const type = node.data?.type?.toLowerCase() || '';
            const status = node.data?.status?.toLowerCase() || '';
            
            if (type === 'vm') {
              return status === 'poweredon' ? '#4ade80' : '#f87171';
            }
            if (type === 'host') return '#60a5fa';
            if (type === 'cluster') return '#a855f7';
            if (type === 'datastore') return '#eab308';
            if (type === 'network') return '#7dd3fc';
            return '#9ca3af';
          }}
        />
        <Background 
          variant="dots" 
          gap={12} 
          size={1} 
          color="rgba(0, 0, 0, 0.1)"
        />
        
        <Panel position="top-right" className="topology-control-panel">
          <div className="topology-controls">
            <button onClick={zoomToFit} className="topology-control-button" title="Fit view">
              <FiMaximize />
            </button>
            <button 
              onClick={() => changeLayout(layoutDirection === 'TB' ? 'LR' : 'TB')} 
              className="topology-control-button"
              title={`Change orientation (current: ${layoutDirection === 'TB' ? 'Top-Bottom' : 'Left-Right'})`}
            >
              <FiLayout />
              <span className="button-text">{layoutDirection === 'TB' ? 'LR' : 'TB'}</span>
            </button>
            <button 
              onClick={toggleNodeLock} 
              className="topology-control-button"
              title={nodesLocked ? 'Unlock nodes' : 'Lock nodes'}
            >
              {nodesLocked ? <FiLock /> : <FiUnlock />}
            </button>
            <button 
              onClick={toggleAutoCenter} 
              className="topology-control-button"
              title={autoCenterEnabled ? 'Disable auto-center' : 'Enable auto-center'}
            >
              {autoCenterEnabled ? <FiCamera /> : <FiCameraOff />}
            </button>
          </div>
        </Panel>
      </ReactFlow>
    </div>
  );
};

// Composant principal qui fournit le provider React Flow
const TopologyDiagram: React.FC<TopologyDiagramProps> = (props) => {
  if (!props.apiNodes || props.apiNodes.length === 0) {
    return <div className="diagram-placeholder">No topology to display. Configure and start a visualization.</div>;
  }

  // Create default values to match the required props of FlowContent
  const flowContentProps = {
    apiNodes: props.apiNodes || [],
    apiEdges: props.apiEdges || [],
    customNodeTypes: props.customNodeTypes || {} as NodeTypes,
    onNodeClick: props.onNodeClick || (() => {}),
    layoutDirection: props.layoutDirection,
    onLayoutDirectionChange: props.onLayoutDirectionChange,
  };

  return (
    <ReactFlowProvider>
      <FlowContent {...flowContentProps} />
    </ReactFlowProvider>
  );
};

export default TopologyDiagram;

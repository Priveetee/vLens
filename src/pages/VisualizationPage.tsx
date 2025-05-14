// src/pages/VisualizationPage.tsx
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import TopologyDiagram from '../components/TopologyDiagram';
import { NodeInfoPanel } from '../components/NodeInfoPanel';
import { DatDisplay } from '../components/DatDisplay';
import CustomNode from '../components/CustomNode';
import CompactNode from '../components/CompactNode'; // Nouveau import
import DetailNode from '../components/DetailNode'; // Nouveau import
import type {
  VisualizationConfigPayload,
  SceneGraphResponse,
  VisualizationNode as ApiVisualizationNode,
  VMDATResponse,
  DATDisplayOptions,
  CustomNodeDataForFlow,
  DAT_VM_Disk
} from '../types/visualization';
import { Position, MarkerType } from 'reactflow';
import type { Node, Edge, NodeProps } from 'reactflow';
import dagre from 'dagre';
import './VisualizationPage.css';
import { CustomPanel } from '../components/CustomPanel';

// Get API base URL from environment or use default
const API_BASE_URL = process.env.REACT_APP_API_URL || 
                    (window.location.hostname === 'localhost' ? 
                     "http://localhost:8001" : 
                     `http://${window.location.hostname}:8001`);

// --- Dagre Layout Helper --- (OK car c'est une constante, pas un hook)
const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

// Dimensions des nœuds
const NODE_WIDTH = 320;
const NODE_HEIGHT = 400;
const COMPACT_NODE_WIDTH = 220;
const COMPACT_NODE_HEIGHT = 50;
const DETAIL_NODE_WIDTH = 200;
const DETAIL_NODE_HEIGHT = 120;

// Cette fonction est définie en dehors du composant, donc sans hook
const getLayoutedElements = (
  nodes: Node<CustomNodeDataForFlow>[],
  edges: Edge[],
  direction = 'TB',
  explodeNodes = false
): { layoutedNodes: Node<CustomNodeDataForFlow>[]; layoutedEdges: Edge[] } => {
  dagreGraph.setGraph({
    rankdir: direction,
    nodesep: explodeNodes ? 120 : 80,  
    ranksep: explodeNodes ? 160 : 120, 
    align: 'UL',
    marginx: 30,
    marginy: 30,
    ranker: 'tight-tree',
    acyclicer: 'greedy'
  });

  nodes.forEach((node) => {
    if (node.type === 'compact') {
      dagreGraph.setNode(node.id, { width: COMPACT_NODE_WIDTH, height: COMPACT_NODE_HEIGHT });
    } else if (node.type === 'detail') {
      dagreGraph.setNode(node.id, { width: DETAIL_NODE_WIDTH, height: DETAIL_NODE_HEIGHT });
    } else {
      dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    }
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) {
      console.warn(`Dagre: Node not found in layout: ${node.id}`);
      return { ...node, position: { x: Math.random() * 400, y: Math.random() * 400 }}; // Fallback
    }
    
    const width = node.type === 'compact' ? COMPACT_NODE_WIDTH 
                : node.type === 'detail' ? DETAIL_NODE_WIDTH 
                : NODE_WIDTH;
                
    const height = node.type === 'compact' ? COMPACT_NODE_HEIGHT 
                 : node.type === 'detail' ? DETAIL_NODE_HEIGHT 
                 : NODE_HEIGHT;
    
    return {
      ...node,
      targetPosition: direction === 'LR' ? Position.Left : Position.Top,
      sourcePosition: direction === 'LR' ? Position.Right : Position.Bottom,
      position: {
        x: nodeWithPosition.x - width / 2,
        y: nodeWithPosition.y - height / 2,
      },
    };
  });

  return { layoutedNodes, layoutedEdges: edges };
};

// Helper to create edge style with type safety
const createEdgeStyle = (isHostingRelation: boolean, isStorageRelation: boolean, isNetworkRelation: boolean): { [key: string]: string | number | undefined } => {
  // The returned object is compatible with React Flow's EdgeStyle type
  return {
    strokeWidth: isHostingRelation ? 2.5 : 2,
    stroke: isHostingRelation ? '#60a5fa' : (isStorageRelation ? '#eab308' : (isNetworkRelation ? '#7dd3fc' : '#b1b1b7'))
    // Removed curvature property which is causing typing issues
  };
};

// Add GraphLegend component
const GraphLegend = () => (
  <div className="graph-legend">
    <h4>Connection Types</h4>
    <div className="legend-item">
      <span className="legend-color" style={{backgroundColor: '#60a5fa'}}></span> 
      <span>Host Relationships</span>
    </div>
    <div className="legend-item">
      <span className="legend-color" style={{backgroundColor: '#eab308'}}></span> 
      <span>Storage Relationships</span>
    </div>
    <div className="legend-item">
      <span className="legend-color" style={{backgroundColor: '#7dd3fc'}}></span> 
      <span>Network Relationships</span>
    </div>
    <div className="legend-item">
      <span className="legend-color" style={{backgroundColor: '#4aaeff'}}></span> 
      <span>Identity Information</span>
    </div>
    <div className="legend-item">
      <span className="legend-color" style={{backgroundColor: '#4ade80'}}></span> 
      <span>Compute Resources</span>
    </div>
  </div>
);

export function VisualizationPage({ setIsLoadingGlobal }: { setIsLoadingGlobal: (loading: boolean) => void }) {
  const location = useLocation();
  const navigate = useNavigate();

  const { vizConfigPayload, datDisplayOptions: initialDatDisplayOptions, explodeNodes = false } = (location.state || {}) as {
    vizConfigPayload?: VisualizationConfigPayload;
    datDisplayOptions?: DATDisplayOptions;
    explodeNodes?: boolean;
  };

  const [flowNodes, setFlowNodes] = useState<Node<CustomNodeDataForFlow>[]>([]);
  const [flowEdges, setFlowEdges] = useState<Edge[]>([]);
  const [isLoadingTopology, setIsLoadingTopology] = useState(true);
  const [errorTopology, setErrorTopology] = useState<string | null>(null);
  const [layoutDirection, setLayoutDirection] = useState<'TB' | 'LR'>('TB');
  const [needsRelayout, setNeedsRelayout] = useState(true);
  const [isLayouting, setIsLayouting] = useState(false);
  const [apiResponse, setApiResponse] = useState<SceneGraphResponse | null>(null);
  
  const [selectedNodeForPanel, setSelectedNodeForPanel] = useState<ApiVisualizationNode | null>(null);
  const [datToDisplay, setDatToDisplay] = useState<VMDATResponse | null>(null);
  const [isGeneratingDat, setIsGeneratingDat] = useState(false);
  const [datGenerationError, setDatGenerationError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [showInfoPanel, setShowInfoPanel] = useState(true);

  const datDisplayOptions = useMemo(() => initialDatDisplayOptions || {
    showIdentification: true, showComputeResources: true, showStorageConfig: true,
    showNetworkConfig: true, showHostingContext: true, showCustomAttributes: true,
    showTableOfContents: true, enableExportOptions: true, 
    showFullDetailsOnVMNodes: true,
  }, [initialDatDisplayOptions]);

  // Define node render functions with useCallback and stable references
  // This avoids the React Flow warning about nodeTypes changing on every render
  const renderCustomNode = useCallback((props: NodeProps<CustomNodeDataForFlow>) => (
    <CustomNode 
      {...props} 
      isSelected={selectedNodeForPanel?.id === props.id}
      displayOptions={datDisplayOptions} 
    />
  ), [datDisplayOptions, selectedNodeForPanel]);

  const renderCompactNode = useCallback((props: NodeProps<CustomNodeDataForFlow>) => (
    <CompactNode 
      {...props} 
      isSelected={selectedNodeForPanel?.id === props.id}
    />
  ), [selectedNodeForPanel]);

  const renderDetailNode = useCallback((props: NodeProps<CustomNodeDataForFlow>) => (
    <DetailNode 
      {...props} 
      isSelected={selectedNodeForPanel?.id === props.id}
    />
  ), [selectedNodeForPanel]);
  
  // Create a stable reference to nodeTypes object that only changes
  // when the render functions change - this fixes the React Flow warning
  const memoizedNodeTypes = useMemo(() => ({
    custom: renderCustomNode,
    compact: renderCompactNode,
    detail: renderDetailNode
  }), [renderCustomNode, renderCompactNode, renderDetailNode]);

  // Component for the tips
  const PerformanceTips = () => (
    <div className="performance-tips">
      <div className="tips-header">
        <h4>Astuces d'interaction</h4>
        <button className="close-tips-button" onClick={() => setShowInfoPanel(false)}>×</button>
      </div>
      <ul>
        <li>⚡ Faites glisser les nœuds pour les repositionner</li>
        <li>🔍 Molette pour zoomer directement</li>
        <li>👆 Clic sur un nœud pour y zoomer automatiquement</li>
        <li>🔒 Utilisez le bouton de verrouillage pour figer les positions</li>
      </ul>
    </div>
  );

  const transformApiDataToFlow = useCallback((apiResponse: SceneGraphResponse): { nodesForFlow: Node<CustomNodeDataForFlow>[], edgesForFlow: Edge[] } => {
    if (!apiResponse || !apiResponse.nodes || !apiResponse.edges) {
      console.error("transformApiDataToFlow a reçu des données API invalides:", apiResponse);
      return { nodesForFlow: [], edgesForFlow: [] };
    }
    
    const nodesForFlow: Node<CustomNodeDataForFlow>[] = apiResponse.nodes.map((apiNode) => ({
      id: apiNode.id,
      type: 'custom',
      data: {
        id: apiNode.id,
        label: apiNode.label,
        type: apiNode.type,
        status: apiNode.status,
        apiData: apiNode.data,
      },
      position: { x: 0, y: 0 },
    }));
    
    const edgesForFlow: Edge[] = apiResponse.edges.map(apiEdge => {
      const label = apiEdge.label;
      const isHostingRelation = label.includes("Hébergée par") || label.includes("Membre de");
      const isStorageRelation = label.includes("Stockée sur");
      const isNetworkRelation = label.includes("Connectée à");
      
      return {
        id: apiEdge.id, 
        source: apiEdge.source, 
        target: apiEdge.target, 
        label: apiEdge.label,
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          width: 20, 
          height: 20, 
          color: isHostingRelation ? '#60a5fa' : (isStorageRelation ? '#eab308' : (isNetworkRelation ? '#7dd3fc' : '#b1b1b7'))
        },
        style: createEdgeStyle(isHostingRelation, isStorageRelation, isNetworkRelation),
        animated: isHostingRelation,
        labelStyle: { 
          fill: '#e0e0e0', 
          fontWeight: 'bold',
          fontSize: 12
        },
        labelBgPadding: [8, 4],
        labelBgBorderRadius: 4,
        labelBgStyle: { fill: 'rgba(40, 44, 52, 0.8)' },
      };
    });
    
    return { nodesForFlow, edgesForFlow };
  }, []);

  const explodeApiDataToDetailedNodes = useCallback((apiResponse: SceneGraphResponse): { nodesForFlow: Node<CustomNodeDataForFlow>[], edgesForFlow: Edge[] } => {
    if (!apiResponse || !apiResponse.nodes || !apiResponse.edges) {
      console.error("explodeApiDataToDetailedNodes a reçu des données API invalides:", apiResponse);
      return { nodesForFlow: [], edgesForFlow: [] };
    }
    
    const nodesForFlow: Node<CustomNodeDataForFlow>[] = [];
    const edgesForFlow: Edge[] = [];
    let edgeCounter = 0;
    
    // Première passe: Créer tous les nœuds principaux
    apiResponse.nodes.forEach((mainNode) => {
      // Créer une version compacte de l'objet principal (VM, Host, etc.)
      nodesForFlow.push({
        id: mainNode.id,
        type: 'compact',
        data: {
          id: mainNode.id,
          label: mainNode.label,
          type: mainNode.type,
          status: mainNode.status,
          apiData: mainNode.data,
          isMainNode: true
        },
        position: { x: 0, y: 0 },
      });
    });
    
    // Seconde passe: Créer des nœuds détaillés et connecter tout
    apiResponse.nodes.forEach((mainNode) => {
      const mainNodeId = mainNode.id;
      const apiData = mainNode.data;
      
      // Pour les VMs, créer des nœuds séparés pour chaque type de composant
      if (mainNode.type === 'VM') {
        // Infos de base VM (identification) comme nœud
        const vmInfoNodeId = `${mainNodeId}-info`;
        nodesForFlow.push({
          id: vmInfoNodeId,
          type: 'detail',
          data: {
            id: vmInfoNodeId,
            label: "VM Info",
            type: "Info",
            parentNodeId: mainNodeId,
            apiData: {
              instance_uuid: apiData.instance_uuid,
              bios_uuid: apiData.bios_uuid,
              guest_os_full: apiData.guest_os_full,
              tools_status: apiData.tools_status,
              vm_version: apiData.vm_version
            }
          },
          position: { x: 0, y: 0 },
        });
        
        // Connecter VM à son nœud Info
        edgeCounter++;
        edgesForFlow.push({
          id: `edge-${edgeCounter}`,
          source: mainNodeId,
          target: vmInfoNodeId,
          label: "Identity",
          style: { stroke: '#4aaeff' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#4aaeff' },
        });
        
        // Ressources de calcul comme nœud
        const computeNodeId = `${mainNodeId}-compute`;
        nodesForFlow.push({
          id: computeNodeId,
          type: 'detail',
          data: {
            id: computeNodeId,
            label: "Compute Resources",
            type: "Compute",
            parentNodeId: mainNodeId,
            apiData: {
              vcpus: apiData.vcpus || apiData.total_vcpus,
              cores_per_socket: apiData.cores_per_socket,
              ram_mb: apiData.ram_mb || apiData.configured_ram_mb,
              cpu_reservation_mhz: apiData.cpu_reservation_mhz,
              cpu_limit_mhz: apiData.cpu_limit_mhz
            }
          },
          position: { x: 0, y: 0 },
        });
        
        // Connecter VM à son nœud Compute
        edgeCounter++;
        edgesForFlow.push({
          id: `edge-${edgeCounter}`,
          source: mainNodeId,
          target: computeNodeId,
          label: "Resources",
          style: { stroke: '#4ade80' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#4ade80' },
        });
        
        // Créer un nœud séparé pour CHAQUE disque
        if (apiData.disks && apiData.disks.length > 0) {
          apiData.disks.forEach((disk: DAT_VM_Disk, diskIndex: number) => {
            const diskNodeId = `${mainNodeId}-disk-${diskIndex}`;
            nodesForFlow.push({
              id: diskNodeId,
              type: 'detail',
              data: {
                id: diskNodeId,
                label: disk.label || `Hard disk ${diskIndex + 1}`,
                type: "Disk",
                parentNodeId: mainNodeId,
                apiData: {
                  capacity_gb: disk.capacity_gb,
                  provisioning_type: disk.provisioning_type || "Unknown",
                  datastore_name: disk.datastore_info ? disk.datastore_info.name : null,
                  vmdk_path: disk.vmdk_path,
                  controller_key: disk.controller_key,
                  disk_mode: disk.disk_mode,
                  key: disk.key
                }
              },
              position: { x: 0, y: 0 },
            });
            
            // Connecter VM directement à chaque disque
            edgeCounter++;
            edgesForFlow.push({
              id: `edge-${edgeCounter}`,
              source: mainNodeId,
              target: diskNodeId,
              label: "Stockée sur",
              style: { stroke: '#eab308' },
              markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#eab308' },
            });
          });
        }
        
        // Créer un nœud séparé pour CHAQUE interface réseau
        if (apiData.network_adapters && apiData.network_adapters.length > 0) {
          apiData.network_adapters.forEach((nic: { 
            label?: string; 
            adapter_type?: string; 
            mac_address?: string;
            network_name?: string;
            connected_network_info?: { configured_name?: string };
            guest_ips?: string[];
          }, nicIndex: number) => {
            const nicNodeId = `${mainNodeId}-nic-${nicIndex}`;
            nodesForFlow.push({
              id: nicNodeId,
              type: 'detail',
              data: {
                id: nicNodeId,
                label: nic.label || `Network adapter ${nicIndex + 1}`,
                type: "NetworkAdapter",
                parentNodeId: mainNodeId,
                apiData: {
                  adapter_type: nic.adapter_type,
                  mac_address: nic.mac_address,
                  network_name: nic.network_name || (nic.connected_network_info ? nic.connected_network_info.configured_name : null),
                  guest_ips: nic.guest_ips
                }
              },
              position: { x: 0, y: 0 },
            });
            
            // Connecter VM directement à chaque adaptateur réseau
            edgeCounter++;
            edgesForFlow.push({
              id: `edge-${edgeCounter}`,
              source: mainNodeId,
              target: nicNodeId,
              label: "Connectée à",
              style: { stroke: '#7dd3fc' },
              markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#7dd3fc' },
            });
          });
        }
      }
      
      // Pour les hôtes, créer des nœuds de détail
      else if (mainNode.type === 'Host') {
        // Détails matériels comme nœud
        const hwNodeId = `${mainNodeId}-hardware`;
        nodesForFlow.push({
          id: hwNodeId,
          type: 'detail',
          data: {
            id: hwNodeId,
            label: "Hardware",
            type: "Hardware",
            parentNodeId: mainNodeId,
            apiData: {
              model: apiData.model,
              cpu_model: apiData.cpu_model,
              cpu_sockets: apiData.cpu_sockets,
              cpu_total_cores: apiData.cpu_total_cores,
              memory_gb: apiData.memory_gb
            }
          },
          position: { x: 0, y: 0 },
        });
        
        // Connecter Host au Hardware
        edgeCounter++;
        edgesForFlow.push({
          id: `edge-${edgeCounter}`,
          source: mainNodeId,
          target: hwNodeId,
          label: "Runs on",
          style: { stroke: '#60a5fa' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#60a5fa' },
        });
        
        // ESXi software comme nœud séparé
        const esxiNodeId = `${mainNodeId}-esxi`;
        nodesForFlow.push({
          id: esxiNodeId,
          type: 'detail',
          data: {
            id: esxiNodeId,
            label: "ESXi",
            type: "Software",
            parentNodeId: mainNodeId,
            apiData: {
              version: apiData.version || apiData.esxi_version || apiData.version_full,
              build: apiData.build,
              status: apiData.status
            }
          },
          position: { x: 0, y: 0 },
        });
        
        // Connecter Host à ESXi
        edgeCounter++;
        edgesForFlow.push({
          id: `edge-${edgeCounter}`,
          source: mainNodeId,
          target: esxiNodeId,
          label: "Membre de",
          style: { stroke: '#60a5fa' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#60a5fa' },
        });
      }
      
      // Pour les Datastores, créer un nœud de détails de capacité
      else if (mainNode.type === 'Datastore') {
        const capacityNodeId = `${mainNodeId}-capacity`;
        nodesForFlow.push({
          id: capacityNodeId,
          type: 'detail',
          data: {
            id: capacityNodeId,
            label: "Capacity",
            type: "Storage",
            parentNodeId: mainNodeId,
            apiData: {
              capacity_gb: apiData.capacity_gb,
              free_space_gb: apiData.free_space_gb,
              utilization: apiData.capacity_gb && apiData.free_space_gb ? 
                ((apiData.capacity_gb - apiData.free_space_gb) / apiData.capacity_gb * 100).toFixed(1) + '%' : 'N/A'
            }
          },
          position: { x: 0, y: 0 },
        });
        
        // Connecter Datastore à son nœud Capacity
        edgeCounter++;
        edgesForFlow.push({
          id: `edge-${edgeCounter}`,
          source: mainNodeId,
          target: capacityNodeId,
          label: "Storage Capacity",
          style: { stroke: '#eab308' },
          markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: '#eab308' },
        });
      }
    });
    
    // Ajouter les arêtes originales entre les nœuds principaux (VM-Host, Host-Cluster, VM-Datastore, etc.)
    apiResponse.edges.forEach(apiEdge => {
      edgeCounter++;
      const label = apiEdge.label;
      const isHostingRelation = label.includes("Hébergée par") || label.includes("Membre de");
      const isStorageRelation = label.includes("Stockée sur");
      const isNetworkRelation = label.includes("Connectée à");
      
      edgesForFlow.push({
        id: `original-${edgeCounter}`,
        source: apiEdge.source,
        target: apiEdge.target,
        label: apiEdge.label,
        markerEnd: { 
          type: MarkerType.ArrowClosed, 
          width: 20, 
          height: 20, 
          color: isHostingRelation ? '#60a5fa' : (isStorageRelation ? '#eab308' : (isNetworkRelation ? '#7dd3fc' : '#b1b1b7'))
        },
        style: createEdgeStyle(isHostingRelation, isStorageRelation, isNetworkRelation),
        animated: isHostingRelation,
      });
    });
    
    return { nodesForFlow, edgesForFlow };
  }, []);

  // Fonction pour décider quel transformateur utiliser
  const transformApiDataBasedOnMode = useCallback((apiResponse: SceneGraphResponse): { nodesForFlow: Node<CustomNodeDataForFlow>[], edgesForFlow: Edge[] } => {
    // Si mode éclaté activé, utiliser la transformation détaillée
    if (explodeNodes) {
      return explodeApiDataToDetailedNodes(apiResponse);
    } else {
      // Sinon utiliser la transformation simple
      return transformApiDataToFlow(apiResponse);
    }
  }, [explodeNodes, explodeApiDataToDetailedNodes, transformApiDataToFlow]);

  const applyLayout = useCallback((nodes: Node<CustomNodeDataForFlow>[], edges: Edge[], direction: 'TB' | 'LR') => {
    // Apply the Dagre layout
    setIsLayouting(true);
    const { layoutedNodes, layoutedEdges } = getLayoutedElements(nodes, edges, direction, explodeNodes);
    setFlowNodes(layoutedNodes);
    setFlowEdges(layoutedEdges);
    setIsLayouting(false);
  }, [explodeNodes]);

  const changeLayoutDirection = useCallback((newDirection: 'TB' | 'LR') => {
    setLayoutDirection(newDirection);
    setNeedsRelayout(true); // Trigger relayout when direction changes
  }, []);

  // Only recalculate layout when needed
  useEffect(() => {
    if (needsRelayout && flowNodes.length > 0 && !isLayouting) {
      applyLayout(flowNodes, flowEdges, layoutDirection);
      setNeedsRelayout(false);
    }
  }, [flowNodes, flowEdges, needsRelayout, isLayouting, layoutDirection, applyLayout]);

  // Effet pour relancer la transformation lorsque explodeNodes change
  useEffect(() => {
    if (apiResponse && apiResponse.nodes && apiResponse.nodes.length > 0) {
      const { nodesForFlow, edgesForFlow } = transformApiDataBasedOnMode(apiResponse);
      setFlowNodes(nodesForFlow);
      setFlowEdges(edgesForFlow);
      setNeedsRelayout(true);
    }
  }, [explodeNodes, transformApiDataBasedOnMode, apiResponse]);

  useEffect(() => {
    if (!vizConfigPayload) {
      console.warn("Aucune configuration de visualisation trouvée, redirection vers la configuration.");
      navigate('/');
      setIsLoadingGlobal(false);
      return;
    }

    const fetchDataAndLayout = async () => {
      setIsLoadingTopology(true); 
      setIsLoadingGlobal(true);
      setErrorTopology(null); 
      setFlowNodes([]); 
      setFlowEdges([]);
      setSelectedNodeForPanel(null); 
      setDatToDisplay(null);

      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/visualization/scene-graph`, {
          method: "POST", 
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(vizConfigPayload),
        });
        
        if (!response.ok) {
          let errorDetail = `Erreur API ${response.status}`;
          try { 
            const errorData = await response.json(); 
            errorDetail = `${errorDetail} - ${errorData.detail || response.statusText}`; 
          } catch {
            // Ignore JSON parsing error and use status text
            errorDetail = `API Error: ${response.status} - ${response.statusText}`; 
          }
          throw new Error(errorDetail);
        }
        
        const apiData: SceneGraphResponse = await response.json();
        setApiResponse(apiData);  // Stocker pour pouvoir retransformer quand explodeNodes change
        console.log("Données reçues de l'API scene-graph:", apiData);

        if (!apiData.nodes || apiData.nodes.length === 0) {
          console.log("Aucun nœud retourné par l'API pour cette configuration.");
          setFlowNodes([]); 
          setFlowEdges([]);
          setIsLoadingTopology(false); 
          setIsLoadingGlobal(false);
          return;
        }

        // Utiliser le transformateur qui dépend du mode éclaté
        const { nodesForFlow, edgesForFlow } = transformApiDataBasedOnMode(apiData);
        
        console.log(`TRANSFORMED: ${nodesForFlow.length} nodes and ${edgesForFlow.length}`);
        
        // IMPORTANT: Set the nodes directly here
        setFlowNodes(nodesForFlow);
        setFlowEdges(edgesForFlow);
        
        // Don't rely on needsRelayout, directly apply layout
        const bestDirection = nodesForFlow.length > 10 ? 'LR' : 'TB';
        setLayoutDirection(bestDirection);
        
        // Apply layout immediately after a short delay
        setTimeout(() => {
          console.log("Applying layout to", nodesForFlow.length, "nodes");
          const { layoutedNodes, layoutedEdges } = getLayoutedElements(nodesForFlow, edgesForFlow, bestDirection, explodeNodes);
          
          // Set the laid-out nodes directly
          setFlowNodes(layoutedNodes);
          setFlowEdges(layoutedEdges);
          
          setIsLoadingTopology(false);
          setIsLoadingGlobal(false);
        }, 150);

      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Erreur inconnue lors du chargement de la topologie.";
        setErrorTopology(errorMessage);
        console.error("Erreur lors de la récupération/layout des données de topologie:", err);
        setIsLoadingTopology(false);
        setIsLoadingGlobal(false);
      }
    };
    
    fetchDataAndLayout();
  }, [vizConfigPayload, navigate, setIsLoadingGlobal, transformApiDataBasedOnMode, explodeNodes]);

  const handleNodeClickInDiagram = useCallback((nodeFlowData: CustomNodeDataForFlow) => {
    const apiNodeEquivalent: ApiVisualizationNode = {
      id: nodeFlowData.id || nodeFlowData.label, 
      label: nodeFlowData.label,
      type: nodeFlowData.type,
      status: nodeFlowData.status,
      data: nodeFlowData.apiData,
    };
    setSelectedNodeForPanel(apiNodeEquivalent);
    setDatToDisplay(null);
    setDatGenerationError(null);
  }, []);

  const handleCloseNodeInfoPanel = useCallback(() => {
    setSelectedNodeForPanel(null);
    setDatToDisplay(null);
    setDatGenerationError(null);
  }, []);

  const handleDatGenerationStart = useCallback(() => {
    setIsGeneratingDat(true);
    setDatGenerationError(null);
    setDatToDisplay(null);
  }, []);
  
  const handleDatGenerated = useCallback((dat: VMDATResponse | null, errorMsg?: string | null) => {
    setDatToDisplay(dat);
    setDatGenerationError(errorMsg || null);
    setIsGeneratingDat(false);
  }, []);
  
  const closeDatDisplay = useCallback(() => {
    setDatToDisplay(null);
    setDatGenerationError(null);
  }, []);

  const handleLayoutDirectionChange = useCallback((direction: 'TB' | 'LR' | 'BT' | 'RL') => {
    if (direction === 'TB' || direction === 'LR') {
      changeLayoutDirection(direction);
    }
  }, [changeLayoutDirection]);

  // Add filtered nodes based on search
  const filteredNodes = useMemo(() => {
    if (!searchTerm) return flowNodes;
    return flowNodes.filter(node => 
      node.data.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      node.data.type.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [flowNodes, searchTerm]);



  if (!vizConfigPayload && !isLoadingTopology) {
    return <div className="page-placeholder">Configuration non trouvée. Veuillez retourner à la page de configuration.</div>;
  }

  return (
    <div className={`visualization-page ${selectedNodeForPanel ? 'with-info-panel' : ''} ${datToDisplay ? 'with-dat-display' : ''}`}>
      <button onClick={() => navigate('/')} className="back-to-config-button" title="Retour à la Configuration">
        &larr; Retour à la Configuration
      </button>
      
      <div className="visualization-controls">
        <div className="control-group">
          <label>Direction du layout:</label>
          <select 
            value={layoutDirection} 
            onChange={(e) => handleLayoutDirectionChange(e.target.value as 'TB' | 'LR')}
            disabled={isLoadingTopology}
          >
            <option value="TB">Haut-Bas</option>
            <option value="LR">Gauche-Droite</option>
          </select>
        </div>
        
        <div className="control-group">
          <label>Search:</label>
          <div className="search-container">
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Find nodes..."
              className="search-input"
              disabled={isLoadingTopology}
            />
            {searchTerm && (
              <button 
                className="clear-search" 
                onClick={() => setSearchTerm('')}
                title="Clear search"
              >×</button>
            )}
          </div>
        </div>
      </div>
      
      <div className="diagram-area">
        {isLoadingTopology && <div className="loading-message-page">Chargement de la topologie...</div>}
        {errorTopology && <div className="error-message-page">Erreur Topologie: {errorTopology}</div>}
        
        {!isLoadingTopology && !errorTopology && flowNodes.length === 0 && vizConfigPayload && (
          <div className="diagram-placeholder-page">Aucune donnée de topologie à afficher pour les critères sélectionnés.</div>
        )}
        
        {!isLoadingTopology && !errorTopology && flowNodes.length > 0 && (
          <>
            {explodeNodes && showInfoPanel && (

            <CustomPanel position="top-left" className="topology-info-panel">
              <div className="exploded-view-indicator">
                <span>Vue éclatée active</span>
                <GraphLegend />
                <PerformanceTips />
              </div>
            </CustomPanel>
            )}
            <TopologyDiagram 
              apiNodes={filteredNodes} // Use filtered nodes
              apiEdges={flowEdges} 
              customNodeTypes={memoizedNodeTypes}
              onNodeClick={handleNodeClickInDiagram}
              layoutDirection={layoutDirection}
              onLayoutDirectionChange={handleLayoutDirectionChange}
            />
          </>
        )}
      </div>

      {selectedNodeForPanel && (
        <NodeInfoPanel
          node={selectedNodeForPanel}
          onClose={handleCloseNodeInfoPanel}
          onDatGenerated={handleDatGenerated}
          isGeneratingDat={isGeneratingDat}
          datError={datGenerationError}
          onDatGenerationStart={handleDatGenerationStart}
        />
      )}

      {datToDisplay && datDisplayOptions && (
        <DatDisplay 
          datData={datToDisplay} 
          displayOptions={datDisplayOptions}
          onClose={closeDatDisplay} 
        />
      )}
    </div>
  );
}

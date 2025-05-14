export interface VisualizationNodeData {
  [key: string]: any;
  name?: string;
  instance_uuid?: string;
}

export interface VisualizationNode { 
  id: string;
  type: string;
  label: string;
  status?: string | null;
  data: VisualizationNodeData; 
  position?: [number, number, number]; 
  parentId?: string; 
  childrenIds?: string[]; 
  relationTypes?: Record<string, string>; 
  isLocked?: boolean; 
}

export interface VisualizationEdge { 
  id: string;
  source: string;
  target: string;
  label: string;
  relationType?: string; 
  isHidden?: boolean;
  style?: Record<string, any>; 
}

export interface SceneGraphResponse { 
  nodes: VisualizationNode[];
  edges: VisualizationEdge[];
}

export interface VMDependencyInclusionConfig {
  include_host: boolean;
  include_cluster_of_host: boolean;
  include_datastores: boolean;
  include_networks: boolean;
}

export interface HostDepth2InclusionConfig {
  include_vms_on_host: boolean;
}

export interface DATDisplayOptions {
  showIdentification: boolean;
  showComputeResources: boolean;
  showStorageConfig: boolean;
  showNetworkConfig: boolean;
  showHostingContext: boolean;
  showCustomAttributes: boolean;
  showTableOfContents: boolean; 
  showFullDetailsOnVMNodes: boolean; 
}

export interface VisualizationConfigPayload {
  start_object_identifier: string;
  start_object_type: "VM";
  vm_inclusions: VMDependencyInclusionConfig;
  host_depth2_inclusions: HostDepth2InclusionConfig;
  depth: number;
  advanced_options?: {
    show_all_relationships?: boolean; 
    unlock_all_nodes?: boolean; 
    custom_layout?: string; 
  };
}

export interface DAT_VM_Identification {
  vm_name?: string | null; instance_uuid?: string | null; bios_uuid?: string | null; vmx_path?: string | null;
  guest_os_full?: string | null; guest_os_id?: string | null; power_state?: string | null;
  tools_status?: string | null; tools_version?: string | null; tools_running?: string | null;
  vm_version?: string | null; boot_time?: string | null;
}
export interface DAT_VM_ComputeResources {
  total_vcpus?: number | null; virtual_sockets?: number | null; cores_per_socket?: number | null;
  configured_ram_mb?: number | null; cpu_reservation_mhz?: number | string | null;
  cpu_limit_mhz?: number | string | null; cpu_shares?: string | null;
  mem_reservation_mb?: number | string | null; mem_limit_mb?: number | string | null; mem_shares?: string | null;
}
export interface DAT_Disk_DatastoreInfo { name?: string | null; uuid?: string | null; type?: string | null; }
export interface DAT_VM_Disk {
  label?: string | null; key?: string | null; controller_key?: string | null; capacity_gb?: number | null;
  provisioning_type?: string | null; disk_mode?: string | null; write_through?: boolean | null;
  datastore_info?: DAT_Disk_DatastoreInfo | null; vmdk_path?: string | null;
  sioc_shares?: string | null; sioc_limit_iops?: number | string | null;
  datastore_name?: string | null;
  thin_provisioned?: boolean | null;
}
export interface DAT_VM_Network_ConnectedNetwork {
  configured_name?: string | null; deduced_type?: string | null; dpg_key?: string | null; dvs_uuid?: string | null;
  cached_portgroup_name?: string | null; cached_dvs_name?: string | null; cached_vlan_info?: string | null;
}
export interface DAT_VM_Nic {
  label?: string | null; key?: string | null; adapter_type?: string | null; mac_address?: string | null;
  mac_address_type?: string | null; connected_at_poweron?: boolean | null;
  guest_net_connected_status?: boolean | null; connected_network_info?: DAT_VM_Network_ConnectedNetwork | null;
  guest_ips: string[];
  network_name?: string | null;
}
export interface DAT_Hosting_Host { name?: string | null; model?: string | null; esxi_version?: string | null; status?: string | null; bios_uuid?: string | null; }
export interface DAT_Hosting_Cluster { name?: string | null; overall_status?: string | null; ha_enabled?: boolean | null; drs_enabled?: boolean | null; drs_behavior?: string | null; }
export interface DAT_VM_HostingContext { host?: DAT_Hosting_Host | null; cluster?: DAT_Hosting_Cluster | null; datacenter_name?: string | null; resource_pool_name?: string | null; }
export interface DAT_VM_CustomAttribute { name: string; value: string; }

export interface VMDATResponse {
  generated_at_utc: string; generated_by: string;
  vm_identification: DAT_VM_Identification;
  compute_resources: DAT_VM_ComputeResources;
  storage_configuration: DAT_VM_Disk[];
  network_configuration: DAT_VM_Nic[];
  hosting_context: DAT_VM_HostingContext;
  custom_attributes: DAT_VM_CustomAttribute[];
}

export interface DATGenerationRequestPayload {
    vm_identifier: string;
}

export interface CustomNodeDataForFlow {
  id: string;
  type: string;
  label: string;
  status?: string | null;
  apiData: VisualizationNodeData; 
  isLocked?: boolean; 
  parentId?: string; 
  parentNodeId?: string; 
  isMainNode?: boolean; 
  canExpand?: boolean; 
  isExpanded?: boolean; 
  relationCounts?: Record<string, number>; 
  connectedNodes?: string[]; 
  childrenIds?: string[]; 
}

export interface RelationshipDefinition {
  sourceType: string;
  targetType: string;
  relationType: string;
  displayName: string;
  isVisible: boolean;
  style?: {
    strokeColor?: string;
    strokeWidth?: number;
    animated?: boolean;
    dashed?: boolean;
  };
}

export interface VisualizationOptions {
  layout: 'dagre' | 'elk' | 'force' | 'manual';
  layoutOptions?: Record<string, any>;
  relationshipVisibility?: Record<string, boolean>;
  nodeTypes?: string[];
  autoExpandNodes?: boolean;
  showAllNodeDetails?: boolean;
  unlockAllNodes?: boolean;
}

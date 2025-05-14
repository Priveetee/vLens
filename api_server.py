import asyncio
from fastapi import FastAPI, HTTPException, status, Path, Query
from contextlib import asynccontextmanager
from datetime import datetime, timezone
import logging
from typing import List, Dict, Any, Optional, Union, Literal, Set
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import vsphere_collector 

# --- Logging Configuration ---
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# --- Application State ---
app_state = {
    "cached_data": None,
    "last_collection_timestamp_utc": None,
    "last_collection_status": "Not yet run",
    "last_collection_message": "",
    "is_collecting": False,
}

# --- Data Collection Logic ---
async def collect_and_cache_data():
    if app_state["is_collecting"]:
        logger.warning("Data collection attempt while another is in progress.")
        return False, "Data collection is already in progress."
    app_state["is_collecting"] = True
    logger.info("Starting data collection from vSphere...")
    start_time = datetime.now(timezone.utc)
    try:
        _, collected_data = await asyncio.to_thread(vsphere_collector.main)
        end_time = datetime.now(timezone.utc)
        duration = end_time - start_time
        logger.info(
            f"Data collection attempt finished in {duration.total_seconds():.2f} seconds."
        )
        if collected_data:
            app_state["cached_data"] = collected_data
            app_state["last_collection_timestamp_utc"] = end_time
            app_state["last_collection_status"] = "Success"
            app_state[
                "last_collection_message"
            ] = f"Data collected successfully at {end_time.isoformat()} (took {duration.total_seconds():.2f}s)"
            logger.info(app_state["last_collection_message"])
            return True, app_state["last_collection_message"]
        else:
            app_state["last_collection_status"] = "Failed"
            app_state[
                "last_collection_message"
            ] = f"Collector returned no data at {end_time.isoformat()}. Check collector logs."
            logger.error(app_state["last_collection_message"])
            return False, app_state["last_collection_message"]
    except Exception as e:
        end_time = datetime.now(timezone.utc)
        duration = end_time - start_time
        error_message = f"Exception during data collection: {str(e)} (took {duration.total_seconds():.2f}s)"
        app_state["last_collection_status"] = "Failed (Exception)"
        app_state["last_collection_message"] = error_message
        logger.error(error_message, exc_info=True)
        return False, error_message
    finally:
        app_state["is_collecting"] = False

# --- Application Lifespan ---
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("API Server starting up, initiating first data collection...")
    await collect_and_cache_data()
    yield
    logger.info("API Server shutting down...")

# --- FastAPI Application Setup ---
app = FastAPI(
    title="vSphere Data API",
    description="API pour récupérer des données d'une infrastructure VMware vSphere.",
    version="1.5.0", 
    lifespan=lifespan,
)

# --- CORS Middleware ---
origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:9120",  # Add Docker frontend port
    "http://127.0.0.1:9120",  # Add Docker frontend port
    "http://frontend-vsphere-visualizer:9120"  # Add Docker service name
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Pydantic Models for Visualization ---
class VisualizationNode(BaseModel):
    id: str
    type: str
    label: str
    status: Optional[str] = None
    data: Dict[str, Any]

class VisualizationEdge(BaseModel):
    id: str
    source: str
    target: str
    label: str

class SceneGraphResponse(BaseModel):
    nodes: List[VisualizationNode]
    edges: List[VisualizationEdge]

class VMDependencyInclusionConfig(BaseModel):
    include_host: bool = Field(True, description="Include the host the VM is running on.")
    include_cluster_of_host: bool = Field(True, description="Include the cluster the VM's host belongs to. Requires include_host.")
    include_datastores: bool = Field(True, description="Include datastores used by the VM.")
    include_networks: bool = Field(True, description="Include networks the VM is connected to.")

class HostDepth2InclusionConfig(BaseModel):
    include_vms_on_host: bool = Field(True, description="If exploring a host at depth 2, include other VMs on this host.")

class VisualizationConfig(BaseModel):
    start_object_identifier: str = Field(
        ...,
        description="Identifier (e.g., name or Instance UUID) of the starting object for the graph."
    )
    start_object_type: Literal["VM"] = Field(
        default="VM",
        description="Type of the starting object. Currently, only 'VM' is fully supported as a start type."
    )
    vm_inclusions: VMDependencyInclusionConfig = Field(
        default_factory=VMDependencyInclusionConfig,
        description="Configuration for including dependencies if the starting object is a VM."
    )
    host_depth2_inclusions: HostDepth2InclusionConfig = Field(
        default_factory=HostDepth2InclusionConfig,
        description="Configuration for inclusions when a Host is explored at depth 2."
    )
    depth: int = Field(
        default=1,
        ge=1,
        le=2,
        description="Exploration depth: 1 for direct dependencies, 2 for dependencies of direct dependencies."
    )

# --- Pydantic Models for DAT (Document d'Architecture Technique) ---
class DAT_VM_Identification(BaseModel):
    vm_name: Optional[str] = None
    instance_uuid: Optional[str] = None
    bios_uuid: Optional[str] = None
    vmx_path: Optional[str] = None
    guest_os_full: Optional[str] = None
    guest_os_id: Optional[str] = None
    power_state: Optional[str] = None
    tools_status: Optional[str] = None
    tools_version: Optional[str] = None
    tools_running: Optional[str] = None
    vm_version: Optional[str] = None
    boot_time: Optional[str] = None

class DAT_VM_ComputeResources(BaseModel):
    total_vcpus: Optional[int] = None
    virtual_sockets: Optional[int] = None
    cores_per_socket: Optional[int] = None
    configured_ram_mb: Optional[int] = None
    cpu_reservation_mhz: Optional[Union[int, str]] = None
    cpu_limit_mhz: Optional[Union[int, str]] = None
    cpu_shares: Optional[str] = None
    mem_reservation_mb: Optional[Union[int, str]] = None
    mem_limit_mb: Optional[Union[int, str]] = None
    mem_shares: Optional[str] = None

class DAT_Disk_DatastoreInfo(BaseModel):
    name: Optional[str] = None
    uuid: Optional[str] = None
    type: Optional[str] = None

class DAT_VM_Disk(BaseModel):
    label: Optional[str] = None
    key: Optional[str] = None
    controller_key: Optional[str] = None
    capacity_gb: Optional[float] = None
    provisioning_type: Optional[str] = None
    disk_mode: Optional[str] = None
    write_through: Optional[bool] = None
    datastore_info: Optional[DAT_Disk_DatastoreInfo] = None
    vmdk_path: Optional[str] = None
    sioc_shares: Optional[str] = None
    sioc_limit_iops: Optional[Union[int, str]] = None

class DAT_VM_Network_ConnectedNetwork(BaseModel):
    configured_name: Optional[str] = None
    deduced_type: Optional[str] = None
    dpg_key: Optional[str] = None
    dvs_uuid: Optional[str] = None
    cached_portgroup_name: Optional[str] = None
    cached_dvs_name: Optional[str] = None
    cached_vlan_info: Optional[str] = None

class DAT_VM_Nic(BaseModel):
    label: Optional[str] = None
    key: Optional[str] = None
    adapter_type: Optional[str] = None
    mac_address: Optional[str] = None
    mac_address_type: Optional[str] = None
    connected_at_poweron: Optional[bool] = None
    guest_net_connected_status: Optional[bool] = None
    connected_network_info: Optional[DAT_VM_Network_ConnectedNetwork] = None
    guest_ips: List[str] = Field(default_factory=list)

class DAT_Hosting_Host(BaseModel):
    name: Optional[str] = None
    model: Optional[str] = None
    esxi_version: Optional[str] = None
    status: Optional[str] = None
    bios_uuid: Optional[str] = None

class DAT_Hosting_Cluster(BaseModel):
    name: Optional[str] = None
    overall_status: Optional[str] = None
    ha_enabled: Optional[bool] = None
    drs_enabled: Optional[bool] = None
    drs_behavior: Optional[str] = None

class DAT_VM_HostingContext(BaseModel):
    host: Optional[DAT_Hosting_Host] = None
    cluster: Optional[DAT_Hosting_Cluster] = None
    datacenter_name: Optional[str] = None
    resource_pool_name: Optional[str] = Field(default="N/A (Information non collectée pour ce DAT)")

class DAT_VM_CustomAttribute(BaseModel):
    name: str
    value: str

class VMDATResponse(BaseModel):
    generated_at_utc: str
    generated_by: str = "Visualiseur d'Infrastructure vSphere 3D"
    vm_identification: DAT_VM_Identification
    compute_resources: DAT_VM_ComputeResources
    storage_configuration: List[DAT_VM_Disk] = Field(default_factory=list)
    network_configuration: List[DAT_VM_Nic] = Field(default_factory=list)
    hosting_context: DAT_VM_HostingContext
    custom_attributes: List[DAT_VM_CustomAttribute] = Field(default_factory=list)

class DATGenerationRequest(BaseModel):
    vm_identifier: str = Field(..., description="Nom ou Instance UUID de la VM pour laquelle générer le DAT.")

# --- Helper Functions ---
def get_data_from_cache(key: str) -> Optional[Any]:
    if not app_state["cached_data"]:
        logger.warning("Attempted to access cache, but it's not initialized.")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Data cache not initialized. Please try refreshing data.",
        )
    data = app_state["cached_data"].get(key)
    if data is None:
        logger.warning(f"Key '{key}' not found in cached data.")
    return data

def filter_and_paginate(
    items: List[Dict[str, Any]],
    skip: int = 0,
    limit: int = 100,
    filters: Optional[Dict[str, Any]] = None,
    fields: Optional[str] = None,
) -> List[Dict[str, Any]]:
    if not items: return []
    filtered_items = items
    if filters:
        for key, value in filters.items():
            if value is None: continue
            if key.endswith("_contains"):
                actual_key = key.replace("_contains", "")
                filtered_items = [
                    item for item in filtered_items
                    if value.lower() in str(item.get(actual_key, "")).lower()
                ]
            else:
                filtered_items = [
                    item for item in filtered_items
                    if str(item.get(key, "")).lower() == str(value).lower()
                ]
    paginated_items = filtered_items[skip : skip + limit]
    if fields:
        selected_fields = [field.strip() for field in fields.split(",")]
        return [
            {field: item.get(field) for field in selected_fields if field in item}
            for item in paginated_items
        ]
    return paginated_items

def project_fields(item: Dict[str, Any], fields: Optional[str] = None) -> Dict[str, Any]:
    if not fields or not item: return item
    selected_fields = [field.strip() for field in fields.split(",")]
    return {field: item.get(field) for field in selected_fields if field in item}

def find_vm_by_identifier(vm_identifier: str) -> Optional[Dict[str, Any]]:
    vms = get_data_from_cache("vms")
    if vms:
        for vm in vms:
            if vm.get("name") == vm_identifier or vm.get("instance_uuid") == vm_identifier:
                return vm
    logger.warning(f"VM with identifier '{vm_identifier}' not found in cache.")
    return None

def find_host_by_name(host_name: str) -> Optional[Dict[str, Any]]:
    infra = get_data_from_cache("infrastructure")
    if infra and infra.get("datacenters"):
        for dc in infra["datacenters"]:
            for cluster in dc.get("clusters", []):
                for host in cluster.get("hosts", []):
                    if host.get("name") == host_name: return host
            for host in dc.get("standalone_hosts", []):
                if host.get("name") == host_name: return host
    logger.warning(f"Host with name '{host_name}' not found in cache.")
    return None

def find_datastore_by_name(datastore_name: str) -> Optional[Dict[str, Any]]:
    datastores = get_data_from_cache("datastores")
    if datastores:
        for ds in datastores:
            if ds.get("name") == datastore_name: return ds
    logger.warning(f"Datastore with name '{datastore_name}' not found in cache.")
    return None

def find_network_by_name_or_key(network_identifier: str) -> Optional[Dict[str, Any]]:
    networks = get_data_from_cache("global_networks")
    if networks:
        for pg_type_key in ["standard_port_groups_summary", "distributed_port_groups"]:
            for net in networks.get(pg_type_key, []):
                if net.get("name") == network_identifier or net.get("key") == network_identifier:
                    return net
    logger.warning(f"Network with identifier '{network_identifier}' not found in cache.")
    return None

def create_graph_node_id(obj_type: str, identifier: Union[str, int]) -> str:
    safe_identifier = str(identifier).replace(" ", "_").replace(":", "-").replace(".", "_").replace("/", "_")
    return f"{obj_type.lower()}-{safe_identifier}"

# --- API Endpoints (Non-Visualization) ---
@app.get("/api/v1/status", summary="Statut de la collecte de données vSphere", tags=["Status"])
async def get_collection_status():
    timestamp_iso = (
        app_state["last_collection_timestamp_utc"].isoformat()
        if app_state["last_collection_timestamp_utc"]
        else None
    )
    return {
        "last_collection_timestamp_utc": timestamp_iso,
        "last_collection_status": app_state["last_collection_status"],
        "last_collection_message": app_state["last_collection_message"],
        "is_currently_collecting": app_state["is_collecting"],
    }

@app.post(
    "/api/v1/vsphere/refresh",
    summary="Déclencher une nouvelle collecte de données vSphere",
    status_code=status.HTTP_202_ACCEPTED,
    tags=["Admin"],
)
async def refresh_vsphere_data_endpoint():
    if app_state["is_collecting"]:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Data collection is already in progress.",
        )
    asyncio.create_task(collect_and_cache_data())
    return {
        "message": "Data refresh process initiated. Check /api/v1/status for updates."
    }

# --- Endpoint for 3D Visualization (Depth-Aware) ---
@app.post(
    "/api/v1/visualization/scene-graph",
    response_model=SceneGraphResponse,
    summary="Générer un graphe de scène pour la visualisation 3D basé sur la configuration et la profondeur",
    tags=["Visualization"],
)
async def generate_scene_graph_endpoint(config: VisualizationConfig):
    if not app_state["cached_data"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cache de données non initialisé.")

    nodes_map: Dict[str, VisualizationNode] = {}
    edges_list: List[VisualizationEdge] = []
    edge_counter = 0
    processed_for_depth_expansion: Set[str] = set()

    def add_node_to_graph(obj_data: Dict[str, Any], obj_type: str) -> Optional[VisualizationNode]:
        nonlocal nodes_map
        primary_id_val = None
        display_label = obj_data.get("name", "N/A")
        node_status_val = None

        if obj_type == "VM":
            primary_id_val = obj_data.get("instance_uuid") or obj_data.get("name")
            display_label = obj_data.get("name", str(primary_id_val))
            node_status_val = obj_data.get("power_state")
        elif obj_type == "Host":
            primary_id_val = obj_data.get("uuid_bios") or obj_data.get("name")
            display_label = obj_data.get("name", str(primary_id_val))
            node_status_val = obj_data.get("status") or obj_data.get("power_state")
        elif obj_type == "Datastore":
            primary_id_val = obj_data.get("uuid") or obj_data.get("name")
            display_label = obj_data.get("name", str(primary_id_val))
            node_status_val = "accessible" if obj_data.get("accessible") else "inaccessible"
        elif obj_type == "Network":
            primary_id_val = obj_data.get("key") or obj_data.get("name")
            display_label = obj_data.get("name", str(primary_id_val))
        elif obj_type == "Cluster":
            primary_id_val = obj_data.get("name")
            display_label = obj_data.get("name", str(primary_id_val))
            node_status_val = obj_data.get("overallStatus")

        if not primary_id_val or primary_id_val == "N/A":
            logger.warning(f"Unique ID not found for {obj_type} with name: {obj_data.get('name', 'Unknown')}. Data: {obj_data}")
            return None

        node_id = create_graph_node_id(obj_type, primary_id_val)
        if node_id not in nodes_map:
            node = VisualizationNode(
                id=node_id, type=obj_type, label=str(display_label), status=node_status_val, data=obj_data
            )
            nodes_map[node_id] = node
            logger.debug(f"Added node: {node_id} ({obj_type}: {display_label})")
            return node
        logger.debug(f"Node already exists: {node_id} ({obj_type}: {display_label})")
        return nodes_map[node_id]

    def add_edge_to_graph(source_node: Optional[VisualizationNode], target_node: Optional[VisualizationNode], label: str):
        nonlocal edges_list, edge_counter
        if not source_node or not target_node:
            logger.debug(f"Skipping edge creation due to missing source/target. Source: {source_node}, Target: {target_node}")
            return

        for edge in edges_list:
            if edge.source == source_node.id and edge.target == target_node.id and edge.label == label:
                logger.debug(f"Duplicate edge skipped: {source_node.id} -> {target_node.id} ({label})")
                return

        edge_counter += 1
        safe_label_for_id = "".join(c if c.isalnum() else "_" for c in label)
        edge_id = f"edge-{source_node.id}-to-{target_node.id}-{safe_label_for_id}-{edge_counter}"
        edge = VisualizationEdge(id=edge_id, source=source_node.id, target=target_node.id, label=label)
        edges_list.append(edge)
        logger.debug(f"Added edge: {edge_id} ({source_node.label} -{label}-> {target_node.label})")

    def explore_dependencies(current_obj_data: Dict[str, Any], current_obj_type: str, current_depth: int):
        nonlocal processed_for_depth_expansion

        current_node = add_node_to_graph(current_obj_data, current_obj_type)
        if not current_node:
            logger.warning(f"Could not create/retrieve node for {current_obj_type} data: {current_obj_data.get('name', 'N/A')}")
            return

        if current_node.id in processed_for_depth_expansion:
            logger.debug(f"Node {current_node.id} ({current_obj_type}) already processed for depth expansion. Skipping further exploration from here.")
            return
        processed_for_depth_expansion.add(current_node.id)

        if current_obj_type == "VM" and current_depth <= config.depth:
            vm_data = current_obj_data
            vm_node = current_node
            inclusions = config.vm_inclusions
            logger.debug(f"Exploring VM '{vm_node.label}' at depth {current_depth}")

            host_node_for_vm: Optional[VisualizationNode] = None
            if inclusions.include_host:
                host_name_vm = vm_data.get("host_name")
                if host_name_vm and host_name_vm != "N/A":
                    host_data = find_host_by_name(host_name_vm)
                    if host_data:
                        host_node_for_vm = add_node_to_graph(host_data, "Host")
                        if host_node_for_vm:
                            add_edge_to_graph(vm_node, host_node_for_vm, "Hébergée par")
                            if current_depth < config.depth:
                                explore_dependencies(host_data, "Host", current_depth + 1)
            
            if inclusions.include_cluster_of_host and host_node_for_vm:
                host_data_for_cluster_search = host_node_for_vm.data
                infra_cache = get_data_from_cache("infrastructure")
                cluster_data_found = None
                if infra_cache and infra_cache.get("datacenters"):
                    for dc_item in infra_cache["datacenters"]:
                        for cluster_item in dc_item.get("clusters", []):
                            for h_in_cluster in cluster_item.get("hosts", []):
                                if (host_data_for_cluster_search.get("uuid_bios") and \
                                    h_in_cluster.get("uuid_bios") == host_data_for_cluster_search.get("uuid_bios")) or \
                                   (h_in_cluster.get("name") == host_data_for_cluster_search.get("name")):
                                    cluster_data_found = cluster_item; break
                            if cluster_data_found: break
                        if cluster_data_found: break
                if cluster_data_found:
                    cluster_node = add_node_to_graph(cluster_data_found, "Cluster")
                    if cluster_node:
                        add_edge_to_graph(host_node_for_vm, cluster_node, "Membre de")
            
            if inclusions.include_datastores:
                for disk in vm_data.get("disks", []):
                    ds_name = disk.get("datastore_name")
                    if ds_name and ds_name != "N/A":
                        datastore_data = find_datastore_by_name(ds_name)
                        if datastore_data:
                            ds_node = add_node_to_graph(datastore_data, "Datastore")
                            if ds_node: add_edge_to_graph(vm_node, ds_node, "Stockée sur")

            if inclusions.include_networks:
                for nic in vm_data.get("network_adapters", []):
                    network_identifier_to_search = nic.get("network_name")
                    portgroup_key = nic.get("portgroup_key_if_dvs")
                    if portgroup_key and portgroup_key != "N/A":
                        network_identifier_to_search = portgroup_key
                    
                    if network_identifier_to_search and network_identifier_to_search != "N/A":
                        network_data = find_network_by_name_or_key(network_identifier_to_search)
                        if not network_data and portgroup_key and portgroup_key != "N/A" and nic.get("network_name") != portgroup_key:
                            network_data = find_network_by_name_or_key(nic.get("network_name"))
                        
                        if network_data:
                            network_node = add_node_to_graph(network_data, "Network")
                            if network_node:
                                add_edge_to_graph(vm_node, network_node, "Connectée à")
                                vlan_info = network_data.get("vlan_id_info")
                                if vlan_info and vlan_info != "N/A" and str(vlan_info) not in network_node.label:
                                    network_node.label += f" (VLAN: {vlan_info})"
                                    nodes_map[network_node.id] = network_node

        elif current_obj_type == "Host" and current_depth <= config.depth:
            host_data = current_obj_data
            host_node = current_node
            logger.debug(f"Exploring Host '{host_node.label}' at depth {current_depth}")

            if config.host_depth2_inclusions.include_vms_on_host:
                all_vms_cache = get_data_from_cache("vms")
                if all_vms_cache:
                    for vm_on_host_data in all_vms_cache:
                        is_not_start_vm = True
                        if config.start_object_type == "VM":
                             is_not_start_vm = not (
                                 (vm_on_host_data.get("instance_uuid") and vm_on_host_data.get("instance_uuid") == config.start_object_identifier) or \
                                 (vm_on_host_data.get("name") == config.start_object_identifier)
                             )
                        
                        if vm_on_host_data.get("host_name") == host_data.get("name") and is_not_start_vm:
                            other_vm_node = add_node_to_graph(vm_on_host_data, "VM")
                            if other_vm_node:
                                add_edge_to_graph(host_node, other_vm_node, "Héberge aussi")
        
    if config.start_object_type == "VM":
        start_vm_data = find_vm_by_identifier(config.start_object_identifier)
        if not start_vm_data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VM de départ '{config.start_object_identifier}' non trouvée.")
        explore_dependencies(start_vm_data, "VM", 1)
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Type d'objet de départ '{config.start_object_type}' non supporté pour l'instant.")

    logger.info(f"Graphe généré avec {len(nodes_map)} nœuds et {len(edges_list)} arêtes pour '{config.start_object_identifier}' (depth {config.depth}).")
    return SceneGraphResponse(nodes=list(nodes_map.values()), edges=edges_list)

# --- Endpoint for DAT Generation ---
@app.post(
    "/api/v1/dat/generate/vm",
    response_model=VMDATResponse,
    summary="Générer un Document d'Architecture Technique (DAT) pour une VM en format JSON structuré.",
    tags=["Documentation"],
)
async def generate_vm_dat_endpoint(request: DATGenerationRequest):
    logger.info(f"Requête de génération de DAT JSON reçue pour la VM: {request.vm_identifier}")

    if not app_state["cached_data"]:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Cache de données non initialisé.")

    vm_data = find_vm_by_identifier(request.vm_identifier)
    if not vm_data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"VM '{request.vm_identifier}' non trouvée.")

    vm_identification = DAT_VM_Identification(
        vm_name=vm_data.get('name'),
        instance_uuid=vm_data.get('instance_uuid'),
        bios_uuid=vm_data.get('bios_uuid'),
        vmx_path=vm_data.get('vmx_path'),
        guest_os_full=vm_data.get('guest_os_full'),
        guest_os_id=vm_data.get('guest_os_id'),
        power_state=vm_data.get('power_state'),
        tools_status=vm_data.get('tools_status'),
        tools_version=vm_data.get('tools_version'),
        tools_running=vm_data.get('tools_running'),
        vm_version=vm_data.get('vm_version'),
        boot_time=vm_data.get('boot_time'),
    )

    cores_per_socket_val = vm_data.get('cores_per_socket', 0)
    num_vcpus_val = vm_data.get('vcpus', 0)
    num_sockets_val = num_vcpus_val // cores_per_socket_val if cores_per_socket_val > 0 else num_vcpus_val
    cpu_limit_val = vm_data.get('cpu_limit_mhz', -1)
    mem_limit_val = vm_data.get('mem_limit_mb', -1)
    compute_resources = DAT_VM_ComputeResources(
        total_vcpus=num_vcpus_val,
        virtual_sockets=num_sockets_val,
        cores_per_socket=cores_per_socket_val,
        configured_ram_mb=vm_data.get('ram_mb'),
        cpu_reservation_mhz=vm_data.get('cpu_reservation_mhz', "N/A"),
        cpu_limit_mhz="Illimitée" if cpu_limit_val == -1 else cpu_limit_val,
        cpu_shares=f"{vm_data.get('cpu_shares', 'N/A')} (Niveau: {vm_data.get('cpu_shares_level', 'N/A')})",
        mem_reservation_mb=vm_data.get('mem_reservation_mb', "N/A"),
        mem_limit_mb="Illimitée" if mem_limit_val == -1 else mem_limit_val,
        mem_shares=f"{vm_data.get('mem_shares', 'N/A')} (Niveau: {vm_data.get('mem_shares_level', 'N/A')})",
    )

    storage_config_list: List[DAT_VM_Disk] = []
    for disk_raw in vm_data.get("disks", []):
        ds_info_obj = None
        ds_name = disk_raw.get('datastore_name')
        
        ds_name_for_info = "N/A"
        ds_uuid_for_info = None
        ds_type_for_info = "N/A"

        if ds_name and ds_name != "N/A":
            datastore_details_cache = find_datastore_by_name(ds_name)
            if datastore_details_cache:
                ds_name_for_info = datastore_details_cache.get('name', "N/A")
                ds_type_for_info = datastore_details_cache.get('type', "N/A")
                
                raw_uuid = datastore_details_cache.get('uuid')
                if isinstance(raw_uuid, str):
                    ds_uuid_for_info = raw_uuid
                elif raw_uuid is not None: 
                    logger.warning(
                        f"DAT_GEN: UUID de datastore inattendu pour '{ds_name}'. "
                        f"Type: {type(raw_uuid)}, Valeur: {raw_uuid}. UUID sera omis."
                    )

                ds_info_obj = DAT_Disk_DatastoreInfo(
                    name=ds_name_for_info,
                    uuid=ds_uuid_for_info,
                    type=ds_type_for_info
                )
        
        thin_prov_raw = disk_raw.get('thin_provisioned')
        provisioning_type_str = "Thin Provisioned" if thin_prov_raw else ("Thick Provisioned" if thin_prov_raw is False else "N/A")
        sioc_limit_iops_raw = disk_raw.get('sioc_limit_iops', -1)
        
        disk_key_val = disk_raw.get('key')
        disk_controller_key_val = disk_raw.get('controller_key')

        disk_obj = DAT_VM_Disk(
            label=disk_raw.get('label'),
            key=str(disk_key_val) if disk_key_val is not None else None,
            controller_key=str(disk_controller_key_val) if disk_controller_key_val is not None else None,
            capacity_gb=disk_raw.get('capacity_gb'),
            provisioning_type=provisioning_type_str,
            disk_mode=disk_raw.get('disk_mode'),
            write_through=disk_raw.get('write_through'),
            datastore_info=ds_info_obj,
            vmdk_path=disk_raw.get('vmdk_path'),
            sioc_shares=f"{disk_raw.get('sioc_shares', 'N/A')} (Niveau: {disk_raw.get('sioc_shares_level', 'N/A')})",
            sioc_limit_iops="Illimitée" if sioc_limit_iops_raw == -1 else sioc_limit_iops_raw,
        )
        storage_config_list.append(disk_obj)

    network_config_list: List[DAT_VM_Nic] = []
    for nic_raw in vm_data.get("network_adapters", []):
        connected_net_info = None; nic_network_name_raw = nic_raw.get('network_name', 'N/A'); portgroup_key_dvs_raw = nic_raw.get('portgroup_key_if_dvs')
        network_type_deduced = "Distribué" if portgroup_key_dvs_raw and portgroup_key_dvs_raw != "N/A" else "Standard"
        cached_pg_name, cached_dvs_name_val, cached_vlan_val = None, None, None
        network_id_to_search = portgroup_key_dvs_raw if portgroup_key_dvs_raw and portgroup_key_dvs_raw != "N/A" else nic_network_name_raw
        if network_id_to_search and network_id_to_search != "N/A":
            network_details_from_cache = find_network_by_name_or_key(network_id_to_search)
            if network_details_from_cache:
                cached_pg_name = network_details_from_cache.get('name'); cached_dvs_name_val = network_details_from_cache.get('dvswitch_name'); cached_vlan_val = network_details_from_cache.get('vlan_id_info')
        connected_net_info = DAT_VM_Network_ConnectedNetwork(
            configured_name=nic_network_name_raw, deduced_type=network_type_deduced, dpg_key=portgroup_key_dvs_raw, dvs_uuid=nic_raw.get('switch_uuid_if_dvs'),
            cached_portgroup_name=cached_pg_name, cached_dvs_name=cached_dvs_name_val, cached_vlan_info=cached_vlan_val,
        )
        
        nic_key_val = nic_raw.get('key')
        nic_obj = DAT_VM_Nic(
            label=nic_raw.get('label'), 
            key=str(nic_key_val) if nic_key_val is not None else None,
            adapter_type=nic_raw.get('adapter_type'), mac_address=nic_raw.get('mac_address'),
            mac_address_type=nic_raw.get('mac_address_type'), connected_at_poweron=nic_raw.get('connected_at_poweron'),
            guest_net_connected_status=nic_raw.get('guest_net_connected'), connected_network_info=connected_net_info, guest_ips=nic_raw.get('guest_ips', []),
        )
        network_config_list.append(nic_obj)

    dat_host_info, dat_cluster_info = None, None; datacenter_name_val: Optional[str] = None; host_name_from_vm = vm_data.get("host_name")
    if host_name_from_vm and host_name_from_vm != "N/A":
        host_data_cache = find_host_by_name(host_name_from_vm)
        if host_data_cache:
            dat_host_info = DAT_Hosting_Host(name=host_data_cache.get('name'), model=host_data_cache.get('model'), esxi_version=host_data_cache.get('version_full'), status=host_data_cache.get('status') or host_data_cache.get('power_state'), bios_uuid=host_data_cache.get('uuid_bios'))
            infra_cache_val = get_data_from_cache("infrastructure")
            if infra_cache_val and infra_cache_val.get("datacenters"):
                for dc_item_val in infra_cache_val["datacenters"]:
                    found_in_dc_val = False
                    for cluster_item_val in dc_item_val.get("clusters", []):
                        for h_in_cluster_val in cluster_item_val.get("hosts", []):
                            if (host_data_cache.get("uuid_bios") and h_in_cluster_val.get("uuid_bios") == host_data_cache.get("uuid_bios")) or (h_in_cluster_val.get("name") == host_data_cache.get("name")):
                                dat_cluster_info = DAT_Hosting_Cluster(name=cluster_item_val.get('name'), overall_status=cluster_item_val.get('overallStatus'), ha_enabled=cluster_item_val.get('ha_enabled'), drs_enabled=cluster_item_val.get('drs_enabled'), drs_behavior=cluster_item_val.get('drs_behavior')); datacenter_name_val = dc_item_val.get("name"); found_in_dc_val = True; break
                        if found_in_dc_val: break
                    if not found_in_dc_val:
                        for standalone_h_item in dc_item_val.get("standalone_hosts", []):
                            if (host_data_cache.get("uuid_bios") and standalone_h_item.get("uuid_bios") == host_data_cache.get("uuid_bios")) or (standalone_h_item.get("name") == host_data_cache.get("name")):
                                datacenter_name_val = dc_item_val.get("name"); found_in_dc_val = True; break
                    if found_in_dc_val: break
    hosting_context = DAT_VM_HostingContext(host=dat_host_info, cluster=dat_cluster_info, datacenter_name=datacenter_name_val)

    custom_attributes_list: List[DAT_VM_CustomAttribute] = []
    custom_attrs_raw = vm_data.get("custom_attributes", {})
    for attr_name, attr_value in custom_attrs_raw.items():
        custom_attributes_list.append(DAT_VM_CustomAttribute(name=attr_name, value=str(attr_value)))

    dat_response = VMDATResponse(
        generated_at_utc=datetime.now(timezone.utc).isoformat(),
        vm_identification=vm_identification,
        compute_resources=compute_resources,
        storage_configuration=storage_config_list,
        network_configuration=network_config_list,
        hosting_context=hosting_context,
        custom_attributes=custom_attributes_list,
    )

    logger.info(f"DAT JSON structuré généré pour la VM: {request.vm_identifier}")
    return dat_response

# --- Uvicorn Command (for reference) ---
# uvicorn api_server:app --reload --host 0.0.0.0 --port 8000


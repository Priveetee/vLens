import getpass
import ssl
import os
from dotenv import load_dotenv
from pyVim import connect
from pyVmomi import vim, vmodl
import traceback
from datetime import datetime
import json
import socket 

# Helper function to safely get attributes
def safe_get(obj, attr_path, default='N/A'):
    """Safely get a nested attribute from an object."""
    try:
        attrs = attr_path.split('.')
        current = obj
        for attr in attrs:
            if current is None:
                return default
            current = getattr(current, attr)
        return current if current is not None else default
    except AttributeError:
        return default
    except Exception:
        return default

def get_vcenter_details(content):
    """Collects basic vCenter details."""
    about = content.about
    return {
        "fullName": safe_get(about, 'fullName'),
        "version": safe_get(about, 'version'),
        "build": safe_get(about, 'build'),
        "apiType": safe_get(about, 'apiType'),
        "apiVersion": safe_get(about, 'apiVersion'),
        "osType": safe_get(about, 'osType'),
        "instanceUuid": safe_get(about, 'instanceUuid')
    }

def _get_custom_attributes_for_object(obj_mor, custom_field_defs_map):
    attributes = {}
    custom_values_list = None
    if hasattr(obj_mor, 'summary') and hasattr(obj_mor.summary, 'customValue') and obj_mor.summary.customValue is not None:
        custom_values_list = obj_mor.summary.customValue
    elif hasattr(obj_mor, 'customValue') and obj_mor.customValue is not None:
        custom_values_list = obj_mor.customValue
    if custom_values_list:
        for cv in custom_values_list:
            field_key = cv.key
            if field_key in custom_field_defs_map:
                field_name = custom_field_defs_map[field_key].get("name", f"unknown_field_{field_key}")
                attributes[field_name] = cv.value
            else:
                attributes[f"field_key_{field_key}"] = cv.value
    return attributes

def _get_host_network_details(host_mor):
    network_details = {"physical_nics": [], "vswitches_standard": [], "vmkernel_adapters": [], "proxy_switches": []}
    if not (host_mor and host_mor.configManager and host_mor.configManager.networkSystem): return network_details
    network_system = host_mor.configManager.networkSystem
    pnic_map_by_key = {}
    if network_system.networkInfo and network_system.networkInfo.pnic:
        for pnic in network_system.networkInfo.pnic:
            pnic_detail = {"key": safe_get(pnic, 'key'), "device": safe_get(pnic, 'device'), "mac": safe_get(pnic, 'mac'),
                           "driver": safe_get(pnic, 'driver'), "link_speed_mb": safe_get(pnic, 'linkSpeed.speedMb', 'N/A') if safe_get(pnic, 'linkSpeed') else 'N/A',
                           "link_duplex": safe_get(pnic, 'linkSpeed.duplex', 'N/A') if safe_get(pnic, 'linkSpeed') else 'N/A',
                           "pci": safe_get(pnic, 'pci'), "wake_on_lan_supported": safe_get(pnic, 'wakeOnLanSupported')}
            network_details["physical_nics"].append(pnic_detail)
            if pnic.key: pnic_map_by_key[pnic.key] = pnic.device
    host_portgroups_specs = {}
    if network_system.networkInfo and network_system.networkInfo.portgroup:
        for pg_spec in network_system.networkInfo.portgroup:
            host_portgroups_specs[pg_spec.key] = {"name": safe_get(pg_spec, 'name'), "vlan_id": safe_get(pg_spec, 'vlanId'),
                                                  "vswitch_name": safe_get(pg_spec, 'vswitchName'),
                                                  "policy_security_allow_promiscuous": safe_get(pg_spec, 'policy.security.allowPromiscuous', None),
                                                  "policy_security_mac_changes": safe_get(pg_spec, 'policy.security.macChanges', None),
                                                  "policy_security_forged_transmits": safe_get(pg_spec, 'policy.security.forgedTransmits', None)}
    if network_system.networkInfo and network_system.networkInfo.vswitch:
        for vswitch in network_system.networkInfo.vswitch:
            policy, sec_policy, team_policy = safe_get(vswitch, 'spec.policy'), safe_get(vswitch, 'spec.policy.security'), safe_get(vswitch, 'spec.policy.nicTeaming')
            vswitch_detail = {"name": safe_get(vswitch, 'name'), "key": safe_get(vswitch, 'key'), "num_ports": safe_get(vswitch, 'numPorts'),
                              "mtu": safe_get(vswitch, 'spec.mtu'), "uplink_devices": [pnic_map_by_key.get(p_key, p_key) for p_key in safe_get(vswitch, 'pnic', [])],
                              "portgroup_keys_on_vswitch": [pg_key for pg_key in safe_get(vswitch, 'portgroup', [])], "portgroup_details_on_vswitch": [],
                              "security_allow_promiscuous": safe_get(sec_policy, 'allowPromiscuous', None), "security_mac_changes": safe_get(sec_policy, 'macChanges', None),
                              "security_forged_transmits": safe_get(sec_policy, 'forgedTransmits', None), "teaming_policy": safe_get(team_policy, 'policy'),
                              "teaming_reverse_policy": safe_get(team_policy, 'reversePolicy', None), "teaming_notify_switches": safe_get(team_policy, 'notifySwitches', None),
                              "teaming_rolling_order": safe_get(team_policy, 'rollingOrder', None),
                              "teaming_failure_criteria_check_speed": safe_get(team_policy, 'failureCriteria.checkSpeed', 'N/A') if safe_get(team_policy, 'failureCriteria') else 'N/A',
                              "teaming_active_nics": [nic for nic in safe_get(team_policy, 'nicOrder.activeNic', [])] if safe_get(team_policy, 'nicOrder') else [],
                              "teaming_standby_nics": [nic for nic in safe_get(team_policy, 'nicOrder.standbyNic', [])] if safe_get(team_policy, 'nicOrder') else []}
            for pg_key in vswitch_detail["portgroup_keys_on_vswitch"]:
                pg_data = host_portgroups_specs.get(pg_key)
                if pg_data: vswitch_detail["portgroup_details_on_vswitch"].append(pg_data)
                else: vswitch_detail["portgroup_details_on_vswitch"].append({"key": pg_key, "name": "N/A (details not found)"})
            network_details["vswitches_standard"].append(vswitch_detail)
    if network_system.networkInfo and network_system.networkInfo.vnic:
        for vnic in network_system.networkInfo.vnic:
            ip_config = safe_get(vnic, 'spec.ip', None)
            services = [s_type for s_type, enabled_attr in [("Management", 'managementTrafficEnabled'), ("vMotion", 'vmotionEnabled'),
                        ("FaultToleranceLogging", 'faultToleranceLoggingEnabled'), ("vSAN", 'vsanTrafficEnabled'),
                        ("vSphereReplication", 'vSphereReplicationEnabled'), ("vSphereReplicationNFC", 'vSphereReplicationNFCEnabled')]
                        if safe_get(vnic, f'spec.{enabled_attr}', None) is True]
            network_details["vmkernel_adapters"].append({"device": safe_get(vnic, 'device'), "key": safe_get(vnic, 'key'), "portgroup_name": safe_get(vnic, 'portgroup'),
                                                       "dvs_name": safe_get(vnic, 'distributedVirtualSwitch.name') if safe_get(vnic, 'distributedVirtualSwitch') else 'N/A',
                                                       "dvs_port_key": safe_get(vnic, 'distributedVirtualSwitch.portKey') if safe_get(vnic, 'distributedVirtualSwitch') else 'N/A',
                                                       "mac": safe_get(vnic, 'spec.mac'), "mtu": safe_get(vnic, 'spec.mtu'), "ip_address": safe_get(ip_config, 'ipAddress'),
                                                       "subnet_mask": safe_get(ip_config, 'subnetMask'), "dhcp_enabled": safe_get(ip_config, 'dhcp', False), "services_enabled": services})
    if network_system.networkInfo and network_system.networkInfo.proxySwitch:
        for proxy in network_system.networkInfo.proxySwitch:
            network_details["proxy_switches"].append({"dvs_uuid": safe_get(proxy, 'dvsUuid'), "dvs_name": safe_get(proxy, 'dvsName'),
                                                      "num_uplinks_on_host": safe_get(proxy, 'numUplink'),
                                                      "uplink_port_devices_on_host": [safe_get(p_spec, 'pnicDevice') for p_spec in safe_get(proxy, 'uplinkPort', [])],
                                                      "host_proxy_key": safe_get(proxy, 'key')})
    return network_details

def _get_host_storage_details(host_mor):
    host_storage_info = {"storage_adapters": [], "logical_units_multipath": [], "iscsi_port_bindings": []}
    if not (host_mor and hasattr(host_mor, 'configManager') and host_mor.configManager and host_mor.configManager.storageSystem): return host_storage_info
    storage_system = host_mor.configManager.storageSystem
    storage_device_info = safe_get(storage_system, 'storageDeviceInfo', None)
    if not storage_device_info: return host_storage_info
    hba_map_by_key = {}
    if hasattr(storage_device_info, 'hostBusAdapter') and storage_device_info.hostBusAdapter:
        for hba in storage_device_info.hostBusAdapter:
            adapter_details = {"key": safe_get(hba, 'key'), "device": safe_get(hba, 'device'), "bus": safe_get(hba, 'bus'), "status": safe_get(hba, 'status'),
                               "model": safe_get(hba, 'model'), "driver": safe_get(hba, 'driver'), "pci": safe_get(hba, 'pci'), "type": hba.__class__.__name__}
            if isinstance(hba, vim.HostFibreChannelHba):
                adapter_details["node_wwn"] = "{:x}".format(safe_get(hba, 'nodeWorldWideName', 0)) if safe_get(hba, 'nodeWorldWideName', 0) != 0 else 'N/A'
                adapter_details["port_wwn"] = "{:x}".format(safe_get(hba, 'portWorldWideName', 0)) if safe_get(hba, 'portWorldWideName', 0) != 0 else 'N/A'
                adapter_details["speed_gbps"] = safe_get(hba, 'speed', 0) / 1000 if safe_get(hba, 'speed', 0) !=0 else 'N/A'
            elif isinstance(hba, vim.HostInternetScsiHba):
                adapter_details["iscsi_name"] = safe_get(hba, 'iScsiName'); adapter_details["iscsi_alias"] = safe_get(hba, 'iScsiAlias')
            if hasattr(hba, 'nvmeQualifiedName'): adapter_details["nvme_qualified_name"] = safe_get(hba, 'nvmeQualifiedName')
            host_storage_info["storage_adapters"].append(adapter_details)
            if adapter_details["key"] != 'N/A': hba_map_by_key[adapter_details["key"]] = adapter_details
    scsi_lun_details_map = {}
    if hasattr(storage_device_info, 'scsiLun') and storage_device_info.scsiLun:
        for scsi_lun in storage_device_info.scsiLun:
            scsi_lun_details_map[scsi_lun.key] = {"device_name": safe_get(scsi_lun, 'deviceName'), "canonical_name": safe_get(scsi_lun, 'canonicalName'),
                                                  "vendor": safe_get(scsi_lun, 'vendor'), "model": safe_get(scsi_lun, 'model'), "lun_type": safe_get(scsi_lun, 'lunType'),
                                                  "queue_depth": safe_get(scsi_lun, 'queueDepth'), "is_ssd": safe_get(scsi_lun, 'ssd', False),
                                                  "is_local": safe_get(scsi_lun, 'localDisk', False), "operational_state": list(safe_get(scsi_lun, 'operationalState', [])),
                                                  "capabilities_unmap": safe_get(scsi_lun, 'capabilities.unmap', None),
                                                  "capabilities_zero_blocks": safe_get(scsi_lun, 'capabilities.zeroBlocks', None)}
    if hasattr(storage_device_info, 'multipathInfo') and storage_device_info.multipathInfo and hasattr(storage_device_info.multipathInfo, 'lun') and storage_device_info.multipathInfo.lun:
        for lun_mp in storage_device_info.multipathInfo.lun:
            lun_details = {"key": safe_get(lun_mp, 'key'), "id": safe_get(lun_mp, 'id'), "lun_type_mp": safe_get(lun_mp, 'lunType'), "paths": [],
                           "policy": {"name": safe_get(lun_mp, 'policy.policy'), "preferred_path_key": safe_get(lun_mp, 'policy.preferredPath')},
                           "satp": safe_get(lun_mp, 'policy.storageArrayTypePolicy.policy', 'N/A')}
            scsi_lun_key = safe_get(lun_mp, 'lun')
            if scsi_lun_key in scsi_lun_details_map: lun_details.update(scsi_lun_details_map[scsi_lun_key])
            if hasattr(lun_mp, 'path') and lun_mp.path:
                for path in lun_mp.path:
                    adapter_dev_name = hba_map_by_key.get(safe_get(path, 'adapter'), {}).get('device', 'N/A')
                    path_details = {"key": safe_get(path, 'key'), "name": safe_get(path, 'name'), "path_state": safe_get(path, 'pathState'),
                                   "state": safe_get(path, 'state'), "adapter_key": safe_get(path, 'adapter'),
                                   "adapter_device_name": adapter_dev_name, "lun_target_key": safe_get(path, 'lun'), "transport_type": "N/A"}
                    transport = safe_get(path, 'transport', None)
                    if transport:
                        path_details["transport_type"] = transport.__class__.__name__
                        if hasattr(transport, 'portWorldWideName') and hasattr(transport, 'nodeWorldWideName'):
                            path_details["fc_transport_wwnn"] = "{:x}".format(safe_get(transport, 'nodeWorldWideName', 0)) if safe_get(transport, 'nodeWorldWideName', 0) != 0 else 'N/A'
                            path_details["fc_transport_wwpn"] = "{:x}".format(safe_get(transport, 'portWorldWideName', 0)) if safe_get(transport, 'portWorldWideName', 0) != 0 else 'N/A'
                        elif hasattr(transport, 'iScsiName'):
                            path_details["iscsi_transport_name"] = safe_get(transport, 'iScsiName'); path_details["iscsi_transport_alias"] = safe_get(transport, 'iScsiAlias')
                    if lun_details["policy"]["preferred_path_key"] == path_details["key"]: lun_details["policy"]["preferred_path_name"] = path_details["name"]
                    lun_details["paths"].append(path_details)
            host_storage_info["logical_units_multipath"].append(lun_details)
    if hasattr(storage_system, 'QueryBoundVnics'):
        sw_iscsi_hba_dev = next((h["device"] for h in host_storage_info.get("storage_adapters", []) if h.get("type") == "vim.host.InternetScsiHba" and
                                 ("software" in h.get("model", "").lower() or h.get("pci") == "N/A" or not h.get("pci")) and h.get("device") != 'N/A'), None)
        if sw_iscsi_hba_dev:
            try:
                bindings = storage_system.QueryBoundVnics(iScsiHbaName=sw_iscsi_hba_dev)
                if bindings:
                    for b in bindings: host_storage_info["iscsi_port_bindings"].append({"iscsi_hba_device": sw_iscsi_hba_dev, "vmkernel_nic_device": safe_get(b, 'vnicDevice'), "vnic_key": safe_get(b, 'vnic')})
            except (vim.fault.NotFound, vmodl.fault.InvalidArgument): pass
            except Exception as e: print(f"Warning: iSCSI binding query error for {sw_iscsi_hba_dev} on {host_mor.name}: {type(e).__name__}")
    return host_storage_info

def get_infrastructure_overview(content, custom_field_defs_map):
    infra_data = {"datacenters": []}
    dc_view = None
    try:
        dc_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.Datacenter], False)
        for dc_mor in dc_view.view:
            dc_data = {"name": safe_get(dc_mor, 'name'), "overallStatus": safe_get(dc_mor, 'overallStatus'), "clusters": [], "standalone_hosts": []}
            cluster_view = None
            try:
                cluster_view = content.viewManager.CreateContainerView(dc_mor.hostFolder, [vim.ClusterComputeResource], False)
                cluster_mors = list(cluster_view.view)
            finally:
                if cluster_view: cluster_view.Destroy()
            for cluster_mor in cluster_mors:
                cluster_details = {"name": safe_get(cluster_mor, 'name'), "overallStatus": safe_get(cluster_mor, 'overallStatus'), "hosts": []}
                ha_cfg, drs_cfg = safe_get(cluster_mor, 'configurationEx.dasConfig'), safe_get(cluster_mor, 'configurationEx.drsConfig')
                cluster_details["ha_enabled"] = safe_get(ha_cfg, 'enabled', False) if ha_cfg else 'N/A'
                cluster_details["ha_admission_control"] = safe_get(ha_cfg, 'admissionControlEnabled', 'N/A') if ha_cfg and cluster_details["ha_enabled"] else 'N/A'
                cluster_details["ha_vm_restart_priority"] = safe_get(ha_cfg, 'defaultVmSettings.restartPriority', 'N/A') if ha_cfg and cluster_details["ha_enabled"] else 'N/A'
                cluster_details["drs_enabled"] = safe_get(drs_cfg, 'enabled', False) if drs_cfg else 'N/A'
                cluster_details["drs_behavior"] = safe_get(drs_cfg, 'defaultVmBehavior', 'N/A') if drs_cfg and cluster_details["drs_enabled"] else 'N/A'
                if cluster_mor.host:
                    for host_mor in cluster_mor.host:
                        summary, hardware, config, runtime = safe_get(host_mor, 'summary'), safe_get(host_mor, 'summary.hardware'), safe_get(host_mor, 'summary.config'), safe_get(host_mor, 'summary.runtime')
                        boot_time_obj = safe_get(runtime, 'bootTime', None)
                        host_details = {"name": safe_get(config, 'name'), "status": safe_get(summary, 'overallStatus'), "power_state": safe_get(runtime, 'powerState'),
                                        "connection_state": safe_get(runtime, 'connectionState'), "maintenance_mode": safe_get(runtime, 'inMaintenanceMode', False),
                                        "boot_time": boot_time_obj.strftime("%Y-%m-%d %H:%M:%S %Z") if isinstance(boot_time_obj, datetime) else 'N/A',
                                        "version_full": safe_get(config, 'product.fullName'), "version_build": safe_get(config, 'product.build'),
                                        "api_version": safe_get(config, 'product.apiVersion'), "vendor": safe_get(hardware, 'vendor'), "model": safe_get(hardware, 'model'),
                                        "uuid_bios": safe_get(hardware, 'uuid'), "cpu_model": safe_get(hardware, 'cpuModel'), "cpu_sockets": safe_get(hardware, 'numCpuPkgs', 0),
                                        "cpu_total_cores": safe_get(hardware, 'numCpuCores', 0), "cpu_threads": safe_get(hardware, 'numCpuThreads', 0),
                                        "cpu_mhz": safe_get(hardware, 'cpuMhz', 0), "memory_gb": round(safe_get(hardware, 'memorySize', 0) / (1024**3), 2)}
                        host_details["cpu_cores_per_socket"] = host_details["cpu_total_cores"] // host_details["cpu_sockets"] if host_details["cpu_sockets"] > 0 else 0
                        host_details.update(_get_host_network_details(host_mor))
                        host_details["storage_configuration"] = _get_host_storage_details(host_mor)
                        host_details["custom_attributes"] = _get_custom_attributes_for_object(host_mor, custom_field_defs_map)
                        cluster_details["hosts"].append(host_details)
                dc_data["clusters"].append(cluster_details)
            standalone_host_view = None
            try:
                standalone_host_view = content.viewManager.CreateContainerView(dc_mor.hostFolder, [vim.HostSystem], True)
                cluster_host_mors = {h for c in cluster_mors for h in (c.host or [])}
                for host_mor in standalone_host_view.view:
                    if host_mor not in cluster_host_mors:
                        summary, hardware, config, runtime = safe_get(host_mor, 'summary'), safe_get(host_mor, 'summary.hardware'), safe_get(host_mor, 'summary.config'), safe_get(host_mor, 'summary.runtime')
                        boot_time_obj = safe_get(runtime, 'bootTime', None)
                        host_details = {"name": safe_get(config, 'name'), "status": safe_get(summary, 'overallStatus'), "power_state": safe_get(runtime, 'powerState'),
                                        "connection_state": safe_get(runtime, 'connectionState'), "maintenance_mode": safe_get(runtime, 'inMaintenanceMode', False),
                                        "boot_time": boot_time_obj.strftime("%Y-%m-%d %H:%M:%S %Z") if isinstance(boot_time_obj, datetime) else 'N/A',
                                        "version_full": safe_get(config, 'product.fullName'), "version_build": safe_get(config, 'product.build'),
                                        "api_version": safe_get(config, 'product.apiVersion'), "vendor": safe_get(hardware, 'vendor'), "model": safe_get(hardware, 'model'),
                                        "uuid_bios": safe_get(hardware, 'uuid'), "cpu_model": safe_get(hardware, 'cpuModel'), "cpu_sockets": safe_get(hardware, 'numCpuPkgs', 0),
                                        "cpu_total_cores": safe_get(hardware, 'numCpuCores', 0), "cpu_threads": safe_get(hardware, 'numCpuThreads', 0),
                                        "cpu_mhz": safe_get(hardware, 'cpuMhz', 0), "memory_gb": round(safe_get(hardware, 'memorySize', 0) / (1024**3), 2)}
                        host_details["cpu_cores_per_socket"] = host_details["cpu_total_cores"] // host_details["cpu_sockets"] if host_details["cpu_sockets"] > 0 else 0
                        host_details.update(_get_host_network_details(host_mor))
                        host_details["storage_configuration"] = _get_host_storage_details(host_mor)
                        host_details["custom_attributes"] = _get_custom_attributes_for_object(host_mor, custom_field_defs_map)
                        dc_data["standalone_hosts"].append(host_details)
            finally:
                if standalone_host_view: standalone_host_view.Destroy()
            infra_data["datacenters"].append(dc_data)
    finally:
        if dc_view: dc_view.Destroy()
    return infra_data

def get_datastore_info(content):
    datastores_data = []
    ds_view = None
    try:
        ds_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.Datastore], True)
        for ds_mor in ds_view.view:
            summary = ds_mor.summary
            ds_details = {"name": safe_get(summary, 'name'), "uuid": safe_get(summary, 'datastore.value') if safe_get(summary, 'datastore') else 'N/A',
                          "type": safe_get(summary, 'type'), "capacity_gb": round(safe_get(summary, 'capacity', 0) / (1024**3), 2),
                          "free_space_gb": round(safe_get(summary, 'freeSpace', 0) / (1024**3), 2),
                          "accessible": safe_get(summary, 'accessible', False), "url": safe_get(summary, 'url'),
                          "maintenance_mode": safe_get(summary, 'maintenanceMode'), "mounted_on_hosts": []}
            uncommitted = safe_get(summary, 'uncommitted', None)
            if uncommitted is not None:
                uncommitted_gb = round(uncommitted / (1024**3), 2)
                ds_details["uncommitted_gb"] = uncommitted_gb
                ds_details["provisioned_gb"] = round(ds_details["capacity_gb"] - ds_details["free_space_gb"] + uncommitted_gb, 2)
            else: ds_details["used_space_gb"] = round(ds_details["capacity_gb"] - ds_details["free_space_gb"], 2)
            capability = safe_get(ds_mor, 'capability', None)
            if capability: ds_details["storage_io_control"] = 'Enabled' if getattr(capability, 'storageIORMEnabled', None) else ('Disabled' if getattr(capability, 'storageIORMEnabled', None) is False else 'N/A')
            if ds_mor.host:
                for mount_info in ds_mor.host:
                    host_mor = mount_info.key
                    ds_details["mounted_on_hosts"].append({
                        "host_name": safe_get(host_mor, 'name', 'N/A (MOR only)'), "host_mor_id": str(host_mor),
                        "mount_path": safe_get(mount_info, 'mountInfo.path'), "access_mode": "readWrite" if safe_get(mount_info, 'mountInfo.accessMode') == "readWrite" else "readOnly",
                        "accessible_on_host": safe_get(mount_info, 'mountInfo.accessible', False), "mounted_on_host": safe_get(mount_info, 'mountInfo.mounted', False)})
            datastores_data.append(ds_details)
    except Exception as e: print(f"Collector Error (Datastores): {e.__class__.__name__} - {e}")
    finally:
        if ds_view: ds_view.Destroy()
    return datastores_data

def get_network_info(content):
    network_data = {"standard_port_groups_summary": [], "distributed_port_groups": []}
    std_pg_view = None
    dv_pg_view = None
    try:
        std_pg_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.Network], True)
        unique_std_pg_names = set()
        for pg_mor in std_pg_view.view:
            if isinstance(pg_mor, vim.dvs.DistributedVirtualPortgroup): continue
            pg_name = safe_get(pg_mor, 'name')
            if pg_name not in unique_std_pg_names and pg_name != 'N/A':
                network_data["standard_port_groups_summary"].append({"name": pg_name, "type": "Standard Port Group (Summary)"})
                unique_std_pg_names.add(pg_name)

        dv_pg_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.dvs.DistributedVirtualPortgroup], True)
        for dv_pg_mor in dv_pg_view.view:
            config, port_config = safe_get(dv_pg_mor, 'config'), safe_get(dv_pg_mor, 'config.defaultPortConfig')
            vlan_setting = safe_get(port_config, 'vlan')
            vlan_info = "N/A"
            if isinstance(vlan_setting, vim.dvs.VmwareDistributedVirtualSwitch.VlanIdSpec): vlan_info = str(safe_get(vlan_setting, 'vlanId', 'N/A'))
            elif isinstance(vlan_setting, vim.dvs.VmwareDistributedVirtualSwitch.TrunkVlanSpec):
                ranges = [f"{item.start}-{item.end}" for item in safe_get(vlan_setting, 'vlanId', []) if hasattr(item, 'start')]
                vlan_info = f"Trunk ({', '.join(ranges)})"
            elif isinstance(vlan_setting, vim.dvs.VmwareDistributedVirtualSwitch.PvlanSpec): vlan_info = f"Private VLAN (Primary: {safe_get(vlan_setting, 'pvlanId', 'N/A')})"

            dvs_mor_from_dpg_config = safe_get(config, 'distributedVirtualSwitch')
            dvs_name, dvs_uuid, dvs_mor_id_str = "N/A", "N/A", "N/A"
            if dvs_mor_from_dpg_config != 'N/A' and not isinstance(dvs_mor_from_dpg_config, str):
                dvs_name = safe_get(dvs_mor_from_dpg_config, 'name', f"DVS MOR ID: {dvs_mor_from_dpg_config.value if hasattr(dvs_mor_from_dpg_config, 'value') else 'Unknown'}")
                dvs_uuid = safe_get(dvs_mor_from_dpg_config, 'uuid', 'N/A')
                dvs_mor_id_str = str(dvs_mor_from_dpg_config)

            network_data["distributed_port_groups"].append({
                "name": safe_get(dv_pg_mor, 'name'), "key": safe_get(dv_pg_mor, 'key'), "type": "Distributed Port Group",
                "dvswitch_name": dvs_name, "dvswitch_uuid": dvs_uuid, "dvswitch_mor_id": dvs_mor_id_str,
                "vlan_id_info": vlan_info, "ports_configured": safe_get(config, 'numPorts', 'N/A'), "description": safe_get(config, 'description')})
    except Exception as e: print(f"Collector Error (Networks - get_network_info): {e.__class__.__name__} - {e}") # Clarified error source
    finally:
        if std_pg_view: std_pg_view.Destroy()
        if dv_pg_view: dv_pg_view.Destroy()
    return network_data

def get_vm_info(content, custom_field_defs_map):
    vms_data = []
    vm_view = None
    try:
        vm_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.VirtualMachine], True)
        for vm_mor in vm_view.view:
            config = safe_get(vm_mor, 'config', None)
            if safe_get(config, 'template', False): continue
            summary, guest, runtime, hardware, files = safe_get(vm_mor, 'summary'), safe_get(vm_mor, 'guest'), safe_get(vm_mor, 'runtime'), safe_get(config, 'hardware'), safe_get(config, 'files')
            cpu_alloc, mem_alloc = safe_get(config, 'cpuAllocation'), safe_get(config, 'memoryAllocation')
            boot_time_obj = safe_get(runtime, 'bootTime', None)
            vm_details = {
                "name": safe_get(config, 'name'), "instance_uuid": safe_get(config, 'instanceUuid'),
                "bios_uuid": safe_get(config, 'uuid'), "vmx_path": safe_get(files, 'vmPathName'),
                "guest_os_full": safe_get(config, 'guestFullName'), "guest_os_id": safe_get(config, 'guestId'),
                "vm_version": safe_get(config, 'version'), "tools_status": safe_get(guest, 'toolsStatus'),
                "tools_version": safe_get(guest, 'toolsVersion'), "tools_running": safe_get(guest, 'toolsRunningStatus'),
                "power_state": safe_get(runtime, 'powerState'),
                "boot_time": boot_time_obj.strftime("%Y-%m-%d %H:%M:%S %Z") if isinstance(boot_time_obj, datetime) else 'N/A',
                "host_name": safe_get(runtime, 'host.name') if safe_get(runtime, 'host') else 'N/A',
                "host_mor_id": str(safe_get(runtime, 'host')) if safe_get(runtime, 'host') else 'N/A',
                "vcpus": safe_get(hardware, 'numCPU', 0), "cores_per_socket": safe_get(hardware, 'numCoresPerSocket', 0),
                "ram_mb": safe_get(hardware, 'memoryMB', 0),
                "cpu_reservation_mhz": safe_get(cpu_alloc, 'reservation', 0) if cpu_alloc else 0,
                "cpu_limit_mhz": safe_get(cpu_alloc, 'limit', -1) if cpu_alloc else -1,
                "cpu_shares": safe_get(cpu_alloc, 'shares.shares', 'N/A') if safe_get(cpu_alloc, 'shares') else 'N/A',
                "cpu_shares_level": safe_get(cpu_alloc, 'shares.level', 'N/A') if safe_get(cpu_alloc, 'shares') else 'N/A',
                "mem_reservation_mb": safe_get(mem_alloc, 'reservation', 0) if mem_alloc else 0,
                "mem_limit_mb": safe_get(mem_alloc, 'limit', -1) if mem_alloc else -1,
                "mem_shares": safe_get(mem_alloc, 'shares.shares', 'N/A') if safe_get(mem_alloc, 'shares') else 'N/A',
                "mem_shares_level": safe_get(mem_alloc, 'shares.level', 'N/A') if safe_get(mem_alloc, 'shares') else 'N/A',
                "disks": [], "network_adapters": [],
                "custom_attributes": _get_custom_attributes_for_object(vm_mor, custom_field_defs_map)
            }
            if hardware and hardware.device:
                for dev in hardware.device:
                    if isinstance(dev, vim.vm.device.VirtualDisk):
                        backing, ds_mor, sio = safe_get(dev, 'backing'), safe_get(dev, 'backing.datastore'), safe_get(dev, 'storageIOAllocation')
                        vm_details["disks"].append({"key": safe_get(dev, 'key'), "controller_key": safe_get(dev, 'controllerKey'),
                                                    "label": safe_get(dev, 'deviceInfo.label'), "summary": safe_get(dev, 'deviceInfo.summary'),
                                                    "capacity_gb": round(safe_get(dev, 'capacityInKB', 0) / (1024*1024), 2),
                                                    "datastore_name": safe_get(ds_mor, 'name', 'N/A') if ds_mor else 'N/A', "datastore_mor_id": str(ds_mor) if ds_mor else 'N/A',
                                                    "vmdk_path": safe_get(backing, 'fileName'), "disk_mode": safe_get(backing, 'diskMode'),
                                                    "thin_provisioned": safe_get(backing, 'thinProvisioned', None), "write_through": safe_get(backing, 'writeThrough', None),
                                                    "sioc_shares": safe_get(sio, 'shares.shares', 'N/A') if safe_get(sio, 'shares') else 'N/A',
                                                    "sioc_shares_level": safe_get(sio, 'shares.level', 'N/A') if safe_get(sio, 'shares') else 'N/A',
                                                    "sioc_limit_iops": safe_get(sio, 'limit', -1) if sio else -1})
                    elif isinstance(dev, vim.vm.device.VirtualEthernetCard):
                        backing, connectable = safe_get(dev, 'backing'), safe_get(dev, 'connectable')
                        nic = {"key": safe_get(dev, 'key'), "controller_key": safe_get(dev, 'controllerKey'), "label": safe_get(dev, 'deviceInfo.label'),
                               "adapter_type": dev.__class__.__name__, "mac_address": safe_get(dev, 'macAddress'), "mac_address_type": safe_get(dev, 'addressType'),
                               "connected": safe_get(connectable, 'connected', False), "connected_at_poweron": safe_get(connectable, 'startConnected', False),
                               "network_name": "N/A", "portgroup_key_if_dvs": "N/A", "switch_uuid_if_dvs": "N/A", "guest_ips": []}
                        if isinstance(backing, vim.vm.device.VirtualEthernetCard.NetworkBackingInfo): nic["network_name"] = safe_get(backing, 'deviceName')
                        elif isinstance(backing, vim.vm.device.VirtualEthernetCard.DistributedVirtualPortBackingInfo):
                            port = safe_get(backing, 'port')
                            nic["network_name"] = f"DVPort: {safe_get(port, 'portKey')}"
                            nic["portgroup_key_if_dvs"], nic["switch_uuid_if_dvs"] = safe_get(port, 'portgroupKey'), safe_get(port, 'switchUuid')
                        if guest and guest.net:
                            for guest_nic in guest.net:
                                if safe_get(guest_nic, 'macAddress') == nic["mac_address"]:
                                    nic["guest_net_connected"] = safe_get(guest_nic, 'connected', False)
                                    if safe_get(guest_nic, 'ipConfig.ipAddress'):
                                        for ip_addr in guest_nic.ipConfig.ipAddress: nic["guest_ips"].append(f"{safe_get(ip_addr, 'ipAddress')} (Prefix: {safe_get(ip_addr, 'prefixLength')}, State: {safe_get(ip_addr, 'state')})")
                                    break
                        vm_details["network_adapters"].append(nic)
            vms_data.append(vm_details)
    except Exception as e: print(f"Collector Error (VMs): {e.__class__.__name__} - {e}")
    finally:
        if vm_view: vm_view.Destroy()
    return vms_data

def get_resource_pool_details(content):
    resource_pools_data = []
    rp_view = None
    try:
        container = content.rootFolder
        view_type = [vim.ResourcePool]
        recursive = True
        rp_view = content.viewManager.CreateContainerView(container, view_type, recursive)
        for rp_mor in rp_view.view:
            config_info = safe_get(rp_mor, 'config', None)
            cpu_alloc = safe_get(config_info, 'cpuAllocation', None)
            mem_alloc = safe_get(config_info, 'memoryAllocation', None)
            parent_name = "N/A"; parent_type = "N/A"
            if rp_mor.parent: parent_name, parent_type = safe_get(rp_mor.parent, 'name', str(rp_mor.parent)), rp_mor.parent.__class__.__name__
            rp_details = {
                "name": safe_get(rp_mor, 'name'), "mor_id": str(rp_mor), "overall_status": safe_get(rp_mor, 'overallStatus'),
                "parent_name": parent_name, "parent_type": parent_type, "parent_mor_id": str(rp_mor.parent) if rp_mor.parent else "N/A",
                "config_name": safe_get(config_info, 'name'), "config_entity": str(safe_get(config_info, 'entity')) if safe_get(config_info, 'entity') else "N/A",
                "cpu_reservation_mhz": safe_get(cpu_alloc, 'reservation', 0) if cpu_alloc else 0,
                "cpu_expandable_reservation": safe_get(cpu_alloc, 'expandableReservation', False) if cpu_alloc else False,
                "cpu_limit_mhz": safe_get(cpu_alloc, 'limit', -1) if cpu_alloc else -1,
                "cpu_shares_level": safe_get(cpu_alloc, 'shares.level', 'N/A') if safe_get(cpu_alloc, 'shares') else 'N/A',
                "cpu_shares_value": safe_get(cpu_alloc, 'shares.shares', 0) if safe_get(cpu_alloc, 'shares') else 0,
                "mem_reservation_mb": safe_get(mem_alloc, 'reservation', 0) if mem_alloc else 0,
                "mem_expandable_reservation": safe_get(mem_alloc, 'expandableReservation', False) if mem_alloc else False,
                "mem_limit_mb": safe_get(mem_alloc, 'limit', -1) if mem_alloc else -1,
                "mem_shares_level": safe_get(mem_alloc, 'shares.level', 'N/A') if safe_get(mem_alloc, 'shares') else 'N/A',
                "mem_shares_value": safe_get(mem_alloc, 'shares.shares', 0) if safe_get(mem_alloc, 'shares') else 0,
                "vms_in_pool": [vm.name for vm in safe_get(rp_mor, 'vm', []) if hasattr(vm, 'name')],
                "child_resource_pools": [crp.name for crp in safe_get(rp_mor, 'resourcePool', []) if hasattr(crp, 'name')]}
            resource_pools_data.append(rp_details)
    except Exception as e: print(f"Collector Error (Resource Pools): {e.__class__.__name__} - {e}")
    finally:
        if rp_view: rp_view.Destroy()
    return resource_pools_data

def get_custom_attribute_definitions(content):
    defs_map = {}
    definitions_list = []
    if content.customFieldsManager and content.customFieldsManager.field:
        for field_def in content.customFieldsManager.field:
            definition = {"key": field_def.key, "name": field_def.name, "type": str(field_def.type),
                          "managed_object_type": str(field_def.managedObjectType)}
            definitions_list.append(definition)
            defs_map[field_def.key] = definition
    return definitions_list, defs_map

def get_dvs_details(content):
    dvs_data = []
    dvs_view = None
    try:
        dvs_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.DistributedVirtualSwitch], True)
        for dvs_mor in dvs_view.view:
            config, summary, capability = safe_get(dvs_mor, 'config'), safe_get(dvs_mor, 'summary'), safe_get(dvs_mor, 'capability')
            net_res_mgmt, pvlan_cfg, lacp_grps = safe_get(config, 'networkResourceManagementConfig'), safe_get(config, 'pvlanConfig', []), safe_get(config, 'lacpGroupConfig', [])
            dvs_detail = {
                "name": safe_get(summary, 'name'), "uuid": safe_get(summary, 'uuid'), "mor_id": str(dvs_mor),
                "version": safe_get(config, 'productInfo.version'), "description": safe_get(config, 'description'),
                "mtu": safe_get(summary, 'maxMtu', safe_get(config, 'maxMtu')), "num_ports": safe_get(summary, 'numPorts'),
                "num_hosts": len(safe_get(config, 'host', [])), "uplink_port_policy": {},
                "default_port_config": {"security_policy": {}, "vlan_info": "N/A"},
                "contact_name": safe_get(config, 'contact.name'), "contact_info": safe_get(config, 'contact.contact'),
                "link_discovery_protocol": "N/A", "link_discovery_operation": "N/A",
                "health_check_supported": safe_get(capability, 'healthCheckSupported', False), "health_check_config": [],
                "nioc_enabled": safe_get(net_res_mgmt, 'enabled', False) if net_res_mgmt else False,
                "nioc_version": safe_get(net_res_mgmt, 'networkResourceManagementCapability.version') if safe_get(net_res_mgmt, 'networkResourceManagementCapability') else 'N/A',
                "nioc_resource_pools": [],
                "private_vlans": [{"primary_vlan": pv.primaryVlanId, "secondary_vlan": pv.secondaryVlanId, "type": pv.pvlanType} for pv in pvlan_cfg if hasattr(pv, 'primaryVlanId')],
                "lacp_groups": [], "port_groups": []}
            uplink_policy = safe_get(config, 'uplinkPortPolicy')
            if uplink_policy != 'N/A':
                teaming = safe_get(uplink_policy, 'policy')
                if teaming != 'N/A': dvs_detail["uplink_port_policy"]["teaming_policy"] = safe_get(teaming, 'value')
                dvs_detail["uplink_port_policy"]["reverse_policy"] = safe_get(uplink_policy, 'reversePolicy', None)
                dvs_detail["uplink_port_policy"]["notify_switches"] = safe_get(uplink_policy, 'notifySwitches', None)
            default_port_cfg = safe_get(config, 'defaultPortConfig')
            if default_port_cfg != 'N/A':
                vlan_set = safe_get(default_port_cfg, 'vlan')
                if isinstance(vlan_set, vim.dvs.VmwareDistributedVirtualSwitch.VlanIdSpec): dvs_detail["default_port_config"]["vlan_info"] = str(safe_get(vlan_set, 'vlanId', 'N/A'))
                elif isinstance(vlan_set, vim.dvs.VmwareDistributedVirtualSwitch.TrunkVlanSpec):
                    ranges = [f"{i.start}-{i.end}" for i in safe_get(vlan_set, 'vlanId', []) if hasattr(i, 'start')]
                    dvs_detail["default_port_config"]["vlan_info"] = f"Trunk ({', '.join(ranges)})"
                else: dvs_detail["default_port_config"]["vlan_info"] = str(vlan_set)
                sec_pol = safe_get(default_port_cfg, 'securityPolicy')
                if sec_pol != 'N/A':
                    dvs_detail["default_port_config"]["security_policy"]["allow_promiscuous"] = safe_get(sec_pol, 'allowPromiscuous.value') if safe_get(sec_pol, 'allowPromiscuous') != 'N/A' else None
                    dvs_detail["default_port_config"]["security_policy"]["mac_changes"] = safe_get(sec_pol, 'macChanges.value') if safe_get(sec_pol, 'macChanges') != 'N/A' else None
                    dvs_detail["default_port_config"]["security_policy"]["forged_transmits"] = safe_get(sec_pol, 'forgedTransmits.value') if safe_get(sec_pol, 'forgedTransmits') != 'N/A' else None
            ldp_cfg = safe_get(config, 'linkDiscoveryProtocolConfig')
            if ldp_cfg != 'N/A': dvs_detail["link_discovery_protocol"], dvs_detail["link_discovery_operation"] = safe_get(ldp_cfg, 'protocol'), safe_get(ldp_cfg, 'operation')
            if dvs_detail["health_check_supported"]:
                hc_list = safe_get(config, 'healthCheckConfig', [])
                if isinstance(hc_list, list):
                    for hc in hc_list:
                        dvs_detail["health_check_config"].append({
                            "vlan_enabled": safe_get(hc, 'enable'), "mtu_enabled": safe_get(hc, 'enableMtu'),
                            "teaming_enabled": safe_get(hc, 'enableTeaming'), "interval": safe_get(hc, 'interval')})
            if net_res_mgmt and dvs_detail["nioc_enabled"] and hasattr(net_res_mgmt, 'networkResourcePool'):
                for pool in net_res_mgmt.networkResourcePool:
                    dvs_detail["nioc_resource_pools"].append({"key": pool.key, "name": safe_get(pool, 'name', 'SystemDefined'), "description": safe_get(pool, 'description'),
                                                              "allocation_shares": safe_get(pool, 'allocationInfo.shares.shares'), "allocation_limit_mhz": safe_get(pool, 'allocationInfo.limit'),
                                                              "priority_tag": safe_get(pool, 'allocationInfo.priorityTag')})
            for lacp in lacp_grps:
                dvs_detail["lacp_groups"].append({"key": safe_get(lacp, 'key'), "name": safe_get(lacp, 'name'), "mode": safe_get(lacp, 'mode'),
                                                 "uplink_ports": [up.uplinkPortKey for up in safe_get(lacp, 'uplinkPort', []) if hasattr(up, 'uplinkPortKey')],
                                                 "load_balance_algorithm": safe_get(lacp, 'loadBalanceAlgorithm')})
            dpg_view = None
            try:
                dpg_view = content.viewManager.CreateContainerView(content.rootFolder, [vim.dvs.DistributedVirtualPortgroup], True)
                for dpg_mor_local in dpg_view.view: # Renamed to avoid conflict
                    dpg_config_local = safe_get(dpg_mor_local, 'config')
                    if dpg_config_local != 'N/A':
                        dvs_ref_from_dpg = safe_get(dpg_config_local, 'distributedVirtualSwitch')
                        # Correction: Ensure dvs_ref_from_dpg is an object before comparing with dvs_mor
                        if dvs_ref_from_dpg != 'N/A' and not isinstance(dvs_ref_from_dpg, str) and dvs_ref_from_dpg == dvs_mor:
                            vlan_s = safe_get(dpg_config_local, 'defaultPortConfig.vlan')
                            v_info = "N/A"
                            if isinstance(vlan_s, vim.dvs.VmwareDistributedVirtualSwitch.VlanIdSpec): v_info = str(safe_get(vlan_s, 'vlanId', 'N/A'))
                            elif isinstance(vlan_s, vim.dvs.VmwareDistributedVirtualSwitch.TrunkVlanSpec):
                                r = [f"{i.start}-{i.end}" for i in safe_get(vlan_s, 'vlanId', []) if hasattr(i, 'start')]
                                v_info = f"Trunk ({', '.join(r)})"
                            dvs_detail["port_groups"].append({"name": safe_get(dpg_mor_local, 'name'), "key": safe_get(dpg_mor_local, 'key'),
                                                              "num_ports": safe_get(dpg_config_local, 'numPorts'),
                                                              "type": safe_get(dpg_config_local, 'type'), "vlan_info": v_info,
                                                              "description": safe_get(dpg_config_local, 'description')})
            finally:
                if dpg_view: dpg_view.Destroy()
            dvs_data.append(dvs_detail)
    except Exception as e: print(f"Collector Error (DVS): {e.__class__.__name__} - {e}")
    finally:
        if dvs_view: dvs_view.Destroy()
    return dvs_data

def main():
    load_dotenv()
    vcenter_host = os.getenv("VCENTER_HOST")
    vcenter_user = os.getenv("VCENTER_USER")
    vcenter_password = os.getenv("VCENTER_PASSWORD")

    if not all([vcenter_host, vcenter_user, vcenter_password]):
        print("Error: VCENTER_HOST, VCENTER_USER, or VCENTER_PASSWORD not found in .env")
        return None, None

    # --- START OF DIAGNOSTIC BLOCK ---
    print(f"--- DIAGNOSTIC ---")
    print(f"Attempting to resolve hostname: '{vcenter_host}' directly using socket.gethostbyname")
    try:
        ip_address = socket.gethostbyname(vcenter_host)
        print(f"Successfully resolved '{vcenter_host}' to IP: {ip_address}")
    except socket.gaierror as e:
        print(f"Failed to resolve '{vcenter_host}' using socket.gethostbyname: {e}")
    except Exception as e:
        print(f"An unexpected error occurred during socket.gethostbyname for '{vcenter_host}': {e}")
    print(f"--- END OF DIAGNOSTIC ---")
    # --- END OF DIAGNOSTIC BLOCK ---

    context = None
    if hasattr(ssl, "_create_unverified_context"):
        context = ssl._create_unverified_context()

    si = None
    all_collected_data = {}
    try:
        print(f"\nConnecting to {vcenter_host} as {vcenter_user}...")
        si = connect.SmartConnect(host=vcenter_host, user=vcenter_user, pwd=vcenter_password, port=443, sslContext=context)
        print("Successfully connected!")
        content = si.content

        print("Collecting vCenter details...")
        all_collected_data["vcenter_details"] = get_vcenter_details(content)

        print("Collecting Custom Attribute Definitions...")
        custom_attr_defs_list, custom_attr_defs_map = get_custom_attribute_definitions(content)
        all_collected_data["custom_attribute_definitions"] = custom_attr_defs_list

        print("Collecting infrastructure overview (DCs, Clusters, Hosts with Network, Storage & Custom Attributes)...")
        all_collected_data["infrastructure"] = get_infrastructure_overview(content, custom_attr_defs_map)

        print("Collecting datastore information...")
        all_collected_data["datastores"] = get_datastore_info(content)

        print("Collecting global network information (DPGs, SPG summary)...")
        all_collected_data["global_networks"] = get_network_info(content)

        print("Collecting virtual machine information (with Custom Attributes)...")
        all_collected_data["vms"] = get_vm_info(content, custom_attr_defs_map)

        print("Collecting Resource Pool details...")
        all_collected_data["resource_pools"] = get_resource_pool_details(content)

        print("Collecting Distributed Virtual Switch details...")
        all_collected_data["distributed_virtual_switches"] = get_dvs_details(content)

        print("\nWARNING: Tag collection requires vSphere Automation SDK or REST calls, not fully implemented with pyVmomi alone.")

        return content, all_collected_data

    except vim.fault.InvalidLogin as e:
        print(f"Collector Error: Invalid login credentials. Details: {e.msg}")
    except ConnectionRefusedError:
        print(f"Collector Error: Connection refused to {vcenter_host}.")
    except vmodl.fault.HostCommunication as e:
        print(f"Collector Host Communication Error: {e.msg}")
    except socket.gaierror as e: # Catch gaierror specifically if it happens in SmartConnect
        print(f"Collector socket.gaierror during SmartConnect or other socket operation: {e}")
        traceback.print_exc()
    except Exception as e:
        print(f"Collector Unexpected Error: {e.__class__.__name__} - {e}")
        traceback.print_exc()
    finally:
        if si:
            print("\nDisconnecting from vCenter Server...")
            connect.Disconnect(si)
            print("Successfully disconnected.")
    return None, None

if __name__ == "__main__":
    print("Running vsphere_collector.py directly for data export...")
    # --- START OF DIAGNOSTIC BLOCK (for direct run) ---
    vcenter_host_direct = os.getenv("VCENTER_HOST")
    if vcenter_host_direct: # Check if the env var is loaded
        print(f"--- DIAGNOSTIC (direct run) ---")
        print(f"Attempting to resolve hostname: '{vcenter_host_direct}' directly using socket.gethostbyname")
        try:
            ip_address_direct = socket.gethostbyname(vcenter_host_direct)
            print(f"Successfully resolved '{vcenter_host_direct}' to IP: {ip_address_direct}")
        except socket.gaierror as e:
            print(f"Failed to resolve '{vcenter_host_direct}' using socket.gethostbyname: {e}")
        except Exception as e:
            print(f"An unexpected error occurred during socket.gethostbyname for '{vcenter_host_direct}': {e}")
        print(f"--- END OF DIAGNOSTIC (direct run) ---")
    # --- END OF DIAGNOSTIC BLOCK (for direct run) ---
    start_time = datetime.now()
    _, collected_data_export = main()
    end_time = datetime.now()
    print(f"Data collection took: {end_time - start_time}")

    if collected_data_export:
        print("\nData collection successful.")
        output_filename = "vsphere_data_export.json"
        try:
            with open(output_filename, "w", encoding="utf-8") as f:
                json.dump(collected_data_export, f, indent=2, ensure_ascii=False, default=str)
            print(f"All collected data has been exported to: {output_filename}")
        except Exception as e:
            print(f"Error exporting data to JSON: {e}")
            traceback.print_exc()
    else:
        print("\nData collection failed. No data to export.")



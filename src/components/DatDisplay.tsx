// src/components/DatDisplay.tsx
import { useState, useRef } from 'react';
import type { VMDATResponse, DATDisplayOptions } from '../types/visualization';
import { Mini3DViewer } from './Mini3DViewer';
import './DatDisplay.css';
import { FiHardDrive, FiCloud, FiGitBranch, FiInfo, FiCpu, FiSettings, FiBookmark } from 'react-icons/fi';
import { FaDesktop } from 'react-icons/fa';

// Mappage des clés brutes vers des labels conviviaux
// Unused but kept for reference
/* Labels for DAT sections - disabled to fix TS error
const datKeyLabels: Record<string, string> = {
  // VM Identification
  vm_name: "Nom de la VM",
  instance_uuid: "Instance UUID",
  bios_uuid: "BIOS UUID",
  vmx_path: "Chemin Fichier VMX",
  guest_os_full: "OS Invité (Complet)",
  guest_os_id: "ID OS Invité",
  power_state: "État d'Alimentation",
  tools_status: "Statut VMware Tools",
  tools_version: "Version VMware Tools",
  tools_running: "VMware Tools Actif",
  vm_version: "Version Matériel Virtuel",
  boot_time: "Dernier Démarrage",
  // Compute Resources
  total_vcpus: "Total vCPUs",
  virtual_sockets: "Sockets Virtuels",
  cores_per_socket: "Cœurs par Socket",
  configured_ram_mb: "RAM Configurée (MB)",
  cpu_reservation_mhz: "Réservation CPU (MHz)",
  cpu_limit_mhz: "Limite CPU (MHz)",
  cpu_shares: "Partages CPU",
  mem_reservation_mb: "Réservation Mémoire (MB)",
  mem_limit_mb: "Limite Mémoire (MB)",
  mem_shares: "Partages Mémoire",
  // Disk
  label: "Label",
  key: "Clé",
  controller_key: "Clé Contrôleur",
  capacity_gb: "Capacité (GB)",
  provisioning_type: "Type de Provisionnement",
  disk_mode: "Mode du Disque",
  write_through: "Écriture Directe",
  vmdk_path: "Chemin VMDK",
  sioc_shares: "Partages SIOC",
  sioc_limit_iops: "Limite IOPS (SIOC)",
  // Datastore Info
  name: "Nom", // Contexte dépendant
  uuid: "UUID",
  type: "Type",
  // NIC
  adapter_type: "Type d'Adaptateur",
  mac_address: "Adresse MAC",
  mac_address_type: "Type d'Adresse MAC",
  connected_at_poweron: "Connecté au Démarrage",
  guest_net_connected_status: "Statut Connexion (Guest)",
  // Connected Network Info
  configured_name: "Nom Configuré (Portgroup/DVPort)",
  deduced_type: "Type de Réseau (Déduit)",
  dpg_key: "Clé DPG",
  dvs_uuid: "UUID DVS",
  cached_portgroup_name: "Nom Portgroup (Cache)",
  cached_dvs_name: "Nom DVS (Cache)",
  cached_vlan_info: "Info VLAN (Cache)",
  // Hosting Context - Host
  esxi_version: "Version ESXi",
  status: "Statut",
  // Hosting Context - Cluster
  overall_status: "Statut Général",
  ha_enabled: "HA Activé",
  drs_enabled: "DRS Activé",
  drs_behavior: "Comportement DRS",
  // Hosting Context - General
  datacenter_name: "Datacenter",
  resource_pool_name: "Resource Pool",
};
*/

// Format helper functions
const formatValue = (value: any): string => {
  if (typeof value === 'boolean') return value ? 'Oui' : 'Non';
  if (value === null || value === undefined || value === '') return 'N/A';
  if (value === -1 || value === "-1") return "Illimitée";
  return String(value);
};

interface DatDisplayProps {
  datData: VMDATResponse | null;
  displayOptions: DATDisplayOptions;
  onClose: () => void;
}

export function DatDisplay({ datData, displayOptions, onClose }: DatDisplayProps) {
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  if (!datData) return null;

  const scrollToSection = (sectionId: string) => {
    setActiveSection(sectionId);
    const element = document.getElementById(sectionId);
    if (element && contentRef.current) {
      contentRef.current.scrollTo({
        top: element.offsetTop - 20,
        behavior: 'smooth'
      });
    }
  };

  // Section visibility flags based on displayOptions
  const showIdentification = displayOptions.showIdentification;
  const showCompute = displayOptions.showComputeResources;
  const showStorage = displayOptions.showStorageConfig;
  const showNetwork = displayOptions.showNetworkConfig;
  const showHosting = displayOptions.showHostingContext;
  const showAttributes = displayOptions.showCustomAttributes;

  return (
    <div className="dat-display-overlay">
      {displayOptions.showTableOfContents && (
        <div className="dat-table-of-contents">
          <div className="toc-header">
            <h3><FiBookmark /> Table des Matières</h3>
          </div>
          <ul className="toc-list">
            {showIdentification && <li onClick={() => scrollToSection('identification')} className={activeSection === 'identification' ? 'active' : ''}>
              <FiInfo className="toc-icon" /> 1. Identification
            </li>}
            {showCompute && <li onClick={() => scrollToSection('compute')} className={activeSection === 'compute' ? 'active' : ''}>
              <FiCpu className="toc-icon" /> 2. Ressources Calcul
            </li>}
            {showStorage && <li onClick={() => scrollToSection('storage')} className={activeSection === 'storage' ? 'active' : ''}>
              <FiHardDrive className="toc-icon" /> 3. Configuration Stockage
            </li>}
            {showNetwork && <li onClick={() => scrollToSection('network')} className={activeSection === 'network' ? 'active' : ''}>
              <FiGitBranch className="toc-icon" /> 4. Configuration Réseau
            </li>}
            {showHosting && <li onClick={() => scrollToSection('hosting')} className={activeSection === 'hosting' ? 'active' : ''}>
              <FiCloud className="toc-icon" /> 5. Contexte d'Hébergement
            </li>}
            {showAttributes && <li onClick={() => scrollToSection('attributes')} className={activeSection === 'attributes' ? 'active' : ''}>
              <FiSettings className="toc-icon" /> 6. Attributs Personnalisés
            </li>}
          </ul>
        </div>
      )}
      
      <div 
        ref={contentRef}
        className={`dat-display-content ${displayOptions.showTableOfContents ? 'with-toc' : ''}`}
      >
        <div className="dat-display-header">
          <div className="dat-title-container">
            <FaDesktop className="dat-title-icon" /> 
            <div className="dat-title-text">
              <h2>Document d'Architecture Technique (DAT)</h2>
              <h3>{datData.vm_identification.vm_name || "VM"}</h3>
            </div>
          </div>
          <button onClick={onClose} className="dat-close-button" title="Fermer">×</button>
        </div>

        <div className="dat-meta-info">
          <span className="dat-generation-date">
            Généré le: {new Date(datData.generated_at_utc).toLocaleString()}
          </span>
          <span className="dat-generated-by">
            Par: {datData.generated_by}
          </span>
        </div>

        {/* 1. IDENTIFICATION */}
        {showIdentification && (
          <section id="identification" className="dat-section">
            <div className="dat-section-header">
              <FiInfo className="section-icon" />
              <h2>1. Identification</h2>
              <Mini3DViewer objectType="VM" />
            </div>
            
            <div className="dat-card">
              <div className="dat-card-grid">
                <div className="dat-card-item">
                  <h4>Identifiant Unique</h4>
                  <p className="code-value">{formatValue(datData.vm_identification.instance_uuid)}</p>
                </div>
                <div className="dat-card-item">
                  <h4>UUID du BIOS</h4>
                  <p className="code-value">{formatValue(datData.vm_identification.bios_uuid)}</p>
                </div>
                <div className="dat-card-item full-width">
                  <h4>Chemin du Fichier VMX</h4>
                  <p className="code-value">{formatValue(datData.vm_identification.vmx_path)}</p>
                </div>
                <div className="dat-card-item">
                  <h4>Système d'Exploitation Invité</h4>
                  <p>{formatValue(datData.vm_identification.guest_os_full)}</p>
                </div>
                <div className="dat-card-item">
                  <h4>ID du Système d'Exploitation</h4>
                  <p>{formatValue(datData.vm_identification.guest_os_id)}</p>
                </div>
                <div className="dat-card-item">
                  <h4>État Actuel</h4>
                  <p className={`status ${datData.vm_identification.power_state === 'poweredOn' ? 'on' : 'off'}`}>
                    {formatValue(datData.vm_identification.power_state)}
                  </p>
                </div>
              </div>

              <div className="dat-subsection">
                <h3>VMware Tools</h3>
                <div className="dat-card-grid">
                  <div className="dat-card-item">
                    <h4>Statut</h4>
                    <p>{formatValue(datData.vm_identification.tools_status)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Version</h4>
                    <p>{formatValue(datData.vm_identification.tools_version)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>En cours d'exécution</h4>
                    <p>{formatValue(datData.vm_identification.tools_running)}</p>
                  </div>
                </div>
              </div>

              <div className="dat-card-grid">
                <div className="dat-card-item">
                  <h4>Version du Matériel Virtuel</h4>
                  <p>{formatValue(datData.vm_identification.vm_version)}</p>
                </div>
                <div className="dat-card-item">
                  <h4>Dernier Démarrage</h4>
                  <p>{formatValue(datData.vm_identification.boot_time)}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 2. RESSOURCES DE CALCUL */}
        {showCompute && (
          <section id="compute" className="dat-section">
            <div className="dat-section-header">
              <FiCpu className="section-icon" />
              <h2>2. Configuration des Ressources de Calcul</h2>
            </div>
            
            <div className="dat-card">
              <div className="dat-subsection">
                <h3>vCPUs</h3>
                <div className="dat-card-grid">
                  <div className="dat-card-item">
                    <h4>Nombre total de vCPUs</h4>
                    <p>{formatValue(datData.compute_resources.total_vcpus)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Nombre de Sockets Virtuels</h4>
                    <p>{formatValue(datData.compute_resources.virtual_sockets)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Cœurs par Socket</h4>
                    <p>{formatValue(datData.compute_resources.cores_per_socket)}</p>
                  </div>
                </div>
              </div>
              
              <div className="dat-subsection">
                <h3>Mémoire (RAM)</h3>
                <div className="dat-card-grid">
                  <div className="dat-card-item">
                    <h4>Configurée</h4>
                    <p>{formatValue(datData.compute_resources.configured_ram_mb)} MB</p>
                  </div>
                </div>
              </div>

              <div className="dat-subsection">
                <h3>Allocations CPU</h3>
                <div className="dat-card-grid">
                  <div className="dat-card-item">
                    <h4>Réservation</h4>
                    <p>{formatValue(datData.compute_resources.cpu_reservation_mhz)} MHz</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Limite</h4>
                    <p>{formatValue(datData.compute_resources.cpu_limit_mhz)} MHz</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Partages (Shares)</h4>
                    <p>{formatValue(datData.compute_resources.cpu_shares)}</p>
                  </div>
                </div>
              </div>

              <div className="dat-subsection">
                <h3>Allocations Mémoire</h3>
                <div className="dat-card-grid">
                  <div className="dat-card-item">
                    <h4>Réservation</h4>
                    <p>{formatValue(datData.compute_resources.mem_reservation_mb)} MB</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Limite</h4>
                    <p>{formatValue(datData.compute_resources.mem_limit_mb)} MB</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Partages (Shares)</h4>
                    <p>{formatValue(datData.compute_resources.mem_shares)}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 3. CONFIGURATION DU STOCKAGE */}
        {showStorage && (
          <section id="storage" className="dat-section">
            <div className="dat-section-header">
              <FiHardDrive className="section-icon" />
              <h2>3. Configuration du Stockage</h2>
            </div>
            
            {datData.storage_configuration.length > 0 ? (
              datData.storage_configuration.map((disk, index) => (
                <div key={`disk-${index}`} className="dat-card disk-card">
                  <div className="dat-card-header">
                    <FiHardDrive className="card-header-icon" />
                    <h3>Disque Virtuel: {disk.label || `Disque ${index + 1}`} (Clé: {disk.key || 'N/A'})</h3>
                  </div>
                  
                  <div className="dat-card-grid">
                    <div className="dat-card-item">
                      <h4>Contrôleur</h4>
                      <p>{formatValue(disk.controller_key)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Capacité</h4>
                      <p>{disk.capacity_gb?.toFixed(1) || 'N/A'} GB</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Provisionnement</h4>
                      <p>{disk.thin_provisioned ? "Thin Provisioned" : "Thick Provisioned"}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Mode du Disque</h4>
                      <p>{formatValue(disk.disk_mode)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Écriture Directe</h4>
                      <p>{formatValue(disk.write_through)}</p>
                    </div>
                  </div>
                  
                  <div className="dat-subsection">
                    <h3>Datastore Associé</h3>
                    <div className="dat-card-grid">
                      <div className="dat-card-item">
                        <h4>Nom</h4>
                        <p>{formatValue(disk.datastore_info?.name)}</p>
                      </div>
                      <div className="dat-card-item">
                        <h4>UUID</h4>
                        <p className="code-value">{formatValue(disk.datastore_info?.uuid)}</p>
                      </div>
                      <div className="dat-card-item">
                        <h4>Type</h4>
                        <p>{formatValue(disk.datastore_info?.type)}</p>
                      </div>
                      <div className="dat-card-item full-width">
                        <h4>Chemin VMDK</h4>
                        <p className="code-value">{formatValue(disk.vmdk_path)}</p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="dat-subsection">
                    <h3>Storage I/O Control (SIOC)</h3>
                    <div className="dat-card-grid">
                      <div className="dat-card-item">
                        <h4>Partages</h4>
                        <p>{formatValue(disk.sioc_shares)}</p>
                      </div>
                      <div className="dat-card-item">
                        <h4>Limite IOPS</h4>
                        <p>{formatValue(disk.sioc_limit_iops)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="dat-card">
                <p className="no-data-message">Aucun disque configuré.</p>
              </div>
            )}
          </section>
        )}

        {/* 4. CONFIGURATION RÉSEAU */}
        {showNetwork && (
          <section id="network" className="dat-section">
            <div className="dat-section-header">
              <FiGitBranch className="section-icon" />
              <h2>4. Configuration Réseau</h2>
            </div>
            
            {datData.network_configuration.length > 0 ? (
              datData.network_configuration.map((nic, index) => (
                <div key={`nic-${index}`} className="dat-card network-card">
                  <div className="dat-card-header">
                    <FiGitBranch className="card-header-icon" />
                    <h3>Adaptateur Réseau: {nic.label || `NIC ${index + 1}`} (Clé: {nic.key || 'N/A'})</h3>
                  </div>
                  
                  <div className="dat-card-grid">
                    <div className="dat-card-item">
                      <h4>Type d'Adaptateur</h4>
                      <p>{formatValue(nic.adapter_type)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Adresse MAC</h4>
                      <p className="code-value">{formatValue(nic.mac_address)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Type d'Adresse MAC</h4>
                      <p>{formatValue(nic.mac_address_type)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Connecté au Démarrage</h4>
                      <p>{formatValue(nic.connected_at_poweron)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>État Actuel de Connexion</h4>
                      <p>{formatValue(nic.guest_net_connected_status)}</p>
                    </div>
                  </div>
                  
                  <div className="dat-subsection">
                    <h3>Réseau Connecté</h3>
                    <div className="dat-card-grid">
                      <div className="dat-card-item">
                        <h4>Nom du Réseau</h4>
                        <p>{formatValue(nic.connected_network_info?.configured_name || nic.connected_network_info?.cached_portgroup_name)}</p>
                      </div>
                      <div className="dat-card-item">
                        <h4>Type de Réseau</h4>
                        <p>{formatValue(nic.connected_network_info?.deduced_type)}</p>
                      </div>
                      <div className="dat-card-item">
                        <h4>Information VLAN</h4>
                        <p>{formatValue(nic.connected_network_info?.cached_vlan_info)}</p>
                      </div>
                      <div className="dat-card-item">
                        <h4>Nom DVS</h4>
                        <p>{formatValue(nic.connected_network_info?.cached_dvs_name)}</p>
                      </div>
                    </div>
                  </div>

                  {nic.guest_ips && nic.guest_ips.length > 0 && (
                    <div className="dat-subsection">
                      <h3>Adresses IP (VMware Tools)</h3>
                      <div className="dat-card-grid">
                        {nic.guest_ips.map((ip, ipIndex) => (
                          <div key={`ip-${index}-${ipIndex}`} className="dat-card-item">
                            <h4>Adresse IP {ipIndex + 1}</h4>
                            <p className="code-value">{ip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="dat-card">
                <p className="no-data-message">Aucune interface réseau configurée.</p>
              </div>
            )}
          </section>
        )}

        {/* 5. CONTEXTE D'HÉBERGEMENT */}
        {showHosting && (
          <section id="hosting" className="dat-section">
            <div className="dat-section-header">
              <FiCloud className="section-icon" />
              <h2>5. Contexte d'Hébergement</h2>
            </div>
            
            <div className="dat-card">
              <div className="dat-subsection">
                <h3>Hôte ESXi Actuel</h3>
                <div className="dat-card-grid">
                  <div className="dat-card-item">
                    <h4>Nom</h4>
                    <p>{formatValue(datData.hosting_context.host?.name)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Modèle</h4>
                    <p>{formatValue(datData.hosting_context.host?.model)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Version ESXi</h4>
                    <p>{formatValue(datData.hosting_context.host?.esxi_version)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>Statut</h4>
                    <p>{formatValue(datData.hosting_context.host?.status)}</p>
                  </div>
                  <div className="dat-card-item">
                    <h4>UUID du BIOS</h4>
                    <p className="code-value">{formatValue(datData.hosting_context.host?.bios_uuid)}</p>
                  </div>
                </div>
              </div>
              
              {datData.hosting_context.cluster && (
                <div className="dat-subsection">
                  <h3>Cluster</h3>
                  <div className="dat-card-grid">
                    <div className="dat-card-item">
                      <h4>Nom</h4>
                      <p>{formatValue(datData.hosting_context.cluster?.name)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Statut Général</h4>
                      <p>{formatValue(datData.hosting_context.cluster?.overall_status)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>HA Activé</h4>
                      <p>{formatValue(datData.hosting_context.cluster?.ha_enabled)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>DRS Activé</h4>
                      <p>{formatValue(datData.hosting_context.cluster?.drs_enabled)}</p>
                    </div>
                    <div className="dat-card-item">
                      <h4>Comportement DRS</h4>
                      <p>{formatValue(datData.hosting_context.cluster?.drs_behavior)}</p>
                    </div>
                  </div>
                </div>
              )}

              <div className="dat-card-grid">
                <div className="dat-card-item">
                  <h4>Datacenter</h4>
                  <p>{formatValue(datData.hosting_context.datacenter_name)}</p>
                </div>
                <div className="dat-card-item">
                  <h4>Resource Pool</h4>
                  <p>{formatValue(datData.hosting_context.resource_pool_name)}</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* 6. ATTRIBUTS PERSONNALISÉS */}
        {showAttributes && datData.custom_attributes && datData.custom_attributes.length > 0 && (
          <section id="attributes" className="dat-section">
            <div className="dat-section-header">
              <FiSettings className="section-icon" />
              <h2>6. Attributs Personnalisés de la VM</h2>
            </div>
            
            <div className="dat-card">
              <div className="dat-attributes-grid">
                {datData.custom_attributes.map((attr, index) => (
                  <div key={`attr-${index}`} className="dat-card-item">
                    <h4>{attr.name}</h4>
                    <p>{formatValue(attr.value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* No Attributes Message */}
        {showAttributes && (!datData.custom_attributes || datData.custom_attributes.length === 0) && (
          <section id="attributes" className="dat-section">
            <div className="dat-section-header">
              <FiSettings className="section-icon" />
              <h2>6. Attributs Personnalisés de la VM</h2>
            </div>
            
            <div className="dat-card">
              <p className="no-data-message">Aucun attribut personnalisé configuré.</p>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

# vLens

A React-based frontend application for visualizing VMware vSphere infrastructure components and their relationships with advanced display options and detailed component information.

This project is the frontend component of a complete VMware vSphere visualization solution that works in conjunction with the [api-vsphere](https://github.com/Priveetee/api-vsphere) backend, which connects to vCenter to collect and process infrastructure data.

## Features

- **Interactive Topology Visualization**: Navigate through VMs, hosts, clusters, datastores, and networks
- **Relationship Mapping**: See how vSphere objects connect to each other, including hosting, storage, and network relationships
- **Multiple Node Types**: Compact, detailed, and custom node formats for different visualization needs
- **Detailed Architecture Documents**: View comprehensive DAT documents for VMs
- **Advanced Theming**: Light and dark theme support with customizable background patterns
- **Export Options**: Export visualizations in PNG, PDF, and JSON formats
- **Customizable Layouts**: Choose between different layout directions and control node positioning
- **Performance Optimizations**: Fine-tuned rendering and interaction for complex infrastructure maps
- **Search Functionality**: Find specific nodes within large infrastructure maps
- **Notification System**: Customizable notifications with various styles and animations

## Technologies

- React 19 with TypeScript
- Vite for development and building
- ReactFlow for interactive diagrams
- Dagre for graph layout
- Zustand for state management
- React-Bootstrap and React-Icons for UI components
- HTML2Canvas and jsPDF for export capabilities

## Components

### Main Components

- **Configurator**: Set up visualization parameters and advanced options
- **TopologyDiagram**: Interactive graph of vSphere objects with custom controls
- **NodeInfoPanel**: Details about selected infrastructure components
- **DatDisplay**: Detailed architecture document viewer with export options
- **Mini3DViewer**: Visual representations of different object types
- **CustomNode**, **CompactNode**, **DetailNode**: Different node types for visualizing components
- **CustomPanel**: Configurable panels for displaying information and controls
- **NotificationSystem**: Customizable notifications with various styles and animations

### Pages

- **VisualizationPage**: Main visualization interface integrating all components with theme controls

## Visualization Options

- **Node Display Types**: Choose between compact, detailed, or custom node displays
- **Exploded View**: View relationships with detailed breakdowns of component connections
- **Background Styles**: Choose from dots, lines, cross, or solid backgrounds with adjustable opacity
- **Layout Direction**: Toggle between top-to-bottom and left-to-right layouts
- **Auto-center**: Enable automatic view centering for easier navigation
- **Node Locking**: Lock node positions to prevent accidental movement

## System Requirements

To run the complete vLens visualization solution, you'll need:

### Frontend Requirements
- Web browser with modern JavaScript support (Chromium fully tested not gecko)
- Node.js 22+ (for development only)

### Backend Requirements
- Docker and Docker Compose
- Access to a VMware vCenter Server (6.5+)
- vCenter credentials with at least read-only permissions
- Network connectivity from your Docker host to vCenter

## Development

### Prerequisites

- Node.js 22+
- npm or yarn

### Setup

#### Option 1: Using Docker (Recommended for Production)

1. Clone the repository
2. Configure your vCenter connection in `.env` as described in the [Running the Complete Solution](#running-the-complete-solution-with-docker-compose) section
3. Start the services:
   ```
   docker compose up -d
   ```
4. The application will be available at http://localhost:9120

#### Option 2: Local Development

1. Clone the repository
2. Install dependencies:
   ```
   npm install
   ```
3. Start the development server:
   ```
   npm run dev
   ```
4. The application will be available at http://localhost:5173

### Build

For local development build:
```
npm run build
```

For Docker build:
```
docker compose build
```

## API Integration

The application connects to the [api-vsphere](https://github.com/Priveetee/api-vsphere) backend (default: http://localhost:8001) to fetch:
- vSphere infrastructure topology data through `/api/v1/visualization/scene-graph`
- Detailed VM architecture information for DAT displays through `/api/v1/dat/generate/vm`
- Relationship data between infrastructure components

### Running the Complete Solution with Docker Compose

This repository includes a `docker-compose.yml` file that sets up both the frontend and backend services together:

1. Configure your vCenter connection by creating an `.env` file in the project root:
   ```
   cp .env.example .env
   ```
   Then edit the `.env` file with your vCenter server details:
   ```
   VCENTER_HOST=your-vcenter.yourdomain.com
   VCENTER_USER=your_user@vsphere.local
   VCENTER_PASSWORD=your_secret_password
   ```

2. Add your vCenter server to the `extra_hosts` section in the `docker-compose.yml` file:
   ```yaml
   extra_hosts:
     - "hostname-of-ur-vcenter:ip-address"
   ```

3. Start both the frontend and backend services with a single command:
   ```
   docker compose up -d
   ```

4. Access the services:
   - Frontend: http://localhost:9120
   - Backend API: http://localhost:8001
   - API Documentation: http://localhost:8001/docs

### Manual Backend Setup (Alternative)

If you prefer to set up the backend separately:

1. Clone the api-vsphere repository:
   ```
   git clone https://github.com/Priveetee/api-vsphere.git
   cd api-vsphere
   ```

2. Configure your vCenter connection as described above.

3. Start the backend using Docker Compose:
   ```
   docker compose up -d --build
   ```

See the [api-vsphere README](https://github.com/Priveetee/api-vsphere) for more detailed setup instructions and troubleshooting information.

## Usage Flow

1. Configure visualization parameters (VM identifier, topology depth, and relationship types)
2. Select display options (node types, theme, background)
3. Navigate the interactive topology graph with zoom, pan, and search capabilities
4. Select nodes to view detailed information in the Node Info Panel
5. For VMs, generate comprehensive architecture documents through the DAT Display
6. Export visualizations in various formats for documentation or sharing

## Visualization Performance

The application includes several performance optimizations for handling large infrastructure maps:
- Virtualized rendering for complex node relationships
- Selective node detail display options
- Search filtering for efficient navigation
- Optimized layout calculations with Dagre
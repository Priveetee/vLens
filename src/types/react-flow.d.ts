declare module 'reactflow' {
  export type NodeTypes = Record<string, React.ComponentType<NodeProps>>;

  export interface XYPosition {
    x: number;
    y: number;
  }

  export interface Node<T = any> {
    id: string;
    position: XYPosition;
    data: T;
    type?: string;
    style?: React.CSSProperties;
    className?: string;
    targetPosition?: Position;
    sourcePosition?: Position;
    hidden?: boolean;
    selected?: boolean;
    dragging?: boolean;
    draggable?: boolean;
    selectable?: boolean;
    connectable?: boolean;
    deletable?: boolean;
    dragHandle?: string;
    width?: number | null;
    height?: number | null;
    parentNode?: string;
    zIndex?: number;
    extent?: 'parent' | CoordinateExtent;
    expandParent?: boolean;
    positionAbsolute?: XYPosition;
    ariaLabel?: string;
    focusable?: boolean;
    resizing?: boolean;
  }

  export enum Position {
    Left = 'left',
    Top = 'top',
    Right = 'right',
    Bottom = 'bottom'
  }

  export interface NodeProps<T = any> {
    id: string;
    data: T;
    type?: string;
    selected?: boolean;
    isConnectable?: boolean;
    xPos: number;
    yPos: number;
    dragHandle?: string;
    sourcePosition?: Position;
    targetPosition?: Position;
    dragging?: boolean;
    zIndex?: number;
    style?: React.CSSProperties;
    className?: string;
  }

  export interface HandleProps {
    type: 'source' | 'target';
    position: Position;
    isConnectable?: boolean;
    isConnectableStart?: boolean;
    isConnectableEnd?: boolean;
    onConnect?: (params: Connection) => void;
    isValidConnection?: (connection: Connection) => boolean;
    id?: string;
    style?: React.CSSProperties;
    className?: string;
  }

  export interface Connection {
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
  }

  export interface Edge<T = any> {
    id: string;
    type?: string;
    source: string;
    target: string;
    sourceHandle?: string | null;
    targetHandle?: string | null;
    label?: string | React.ReactNode;
    labelStyle?: React.CSSProperties;
    labelShowBg?: boolean;
    labelBgStyle?: React.CSSProperties;
    labelBgPadding?: [number, number];
    labelBgBorderRadius?: number;
    style?: {
      curvature?: number;
      [key: string]: string | number | undefined;
    };
    animated?: boolean;
    hidden?: boolean;
    deletable?: boolean;
    data?: T;
    className?: string;
    selected?: boolean;
    markerEnd?: string | {
      type: MarkerType;
      width?: number;
      height?: number;
      color?: string;
    };
    markerStart?: string;
    zIndex?: number;
    ariaLabel?: string;
    interactionWidth?: number;
    focusable?: boolean;
  }

  export enum MarkerType {
    Arrow = 'arrow',
    ArrowClosed = 'arrowclosed'
  }

  export type OnNodeClick = (event: React.MouseEvent, node: Node) => void;

  export type CoordinateExtent = [[number, number], [number, number]];

  export interface ReactFlowProps {
    nodes?: Node[];
    edges?: Edge[];
    defaultNodes?: Node[];
    defaultEdges?: Edge[];
    onNodesChange?: (changes: NodeChange[]) => void;
    onEdgesChange?: (changes: EdgeChange[]) => void;
    onConnect?: (connection: Connection) => void;
    onNodeClick?: OnNodeClick;
    // Add more properties as needed
  }

  export interface NodeChange {}
  export interface EdgeChange {}

  export interface ReactFlowInstance {
    setCenter: (x: number, y: number, options?: { zoom?: number; duration?: number }) => void;
    fitView: (options?: { padding?: number; includeHiddenNodes?: boolean; duration?: number }) => void;
    zoomTo: (zoomLevel: number, options?: { duration?: number }) => void;
    getNodes: () => Node[];
    getEdges: () => Edge[];
    // Add other methods as needed
  }

  export interface UseReactFlowReturn extends ReactFlowInstance {}

  export const Handle: React.FC<HandleProps>;
  export const Background: React.FC<any>;
  export const MiniMap: React.FC<any>;
  export const Panel: React.FC<any>;
  export const ReactFlowProvider: React.FC<any>;
export default ReactFlow;

export interface ReactFlowComponentProps extends ReactFlowProps {
  children?: React.ReactNode;
}

  export function useNodesState(initialNodes: Node[]): [Node[], React.Dispatch<React.SetStateAction<Node[]>>, (changes: NodeChange[]) => void];
  export function useEdgesState(initialEdges: Edge[]): [Edge[], React.Dispatch<React.SetStateAction<Edge[]>>, (changes: EdgeChange[]) => void];
  export function addEdge(params: Connection | Edge, edges: Edge[]): Edge[];
  export function useReactFlow(): UseReactFlowReturn;
}

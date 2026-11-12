// Layout fields used by Toolbox and its personal tab bar.
export interface LayoutNode {
  id?: string;
  type?: string;
  children?: LayoutNode[];
  content?: { mod?: string; tab?: string; pane?: { gap?: number } };
  size?: { px?: number; weight?: number };
  hidden?: boolean;
  active?: string;
  traffic_lights?: [number, number];
  [key: string]: unknown;
}

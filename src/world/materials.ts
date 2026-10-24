export type WallMaterial = 'stone' | 'wood' | 'sacks';
export type FloorMaterial = 'stone' | 'wood' | 'water';

export interface WallProps {
  reflectivity: number;
  cutoff: number; // Hz low-pass for echoes off this material
  color: string;  // replay/debug rendering
}

export const WALL_PROPS: Record<WallMaterial, WallProps> = {
  stone: { reflectivity: 0.95, cutoff: 9000, color: '#8d99ae' },
  wood:  { reflectivity: 0.65, cutoff: 3500, color: '#9c6644' },
  sacks: { reflectivity: 0.25, cutoff: 1500, color: '#b08968' },
};

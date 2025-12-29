export interface CodeSpecterConfig {
  review?: {
    enabled?: boolean;
    tone?: 'professional' | 'friendly' | 'critical' | 'instructional';
    rules?: string[];
    ignore?: string[];
    guidelines?: string[]; 
  };
  chat?: {
    enabled?: boolean;
    persona?: string;
    instructions?: string[];
  };
}

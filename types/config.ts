export interface CodeSpecterConfig {
  review?: {
    enabled?: boolean;
    tone?: 'professional' | 'friendly' | 'critical' | 'instructional';
    rules?: string[];
    ignore?: string[];
  };
  chat?: {
    enabled?: boolean;
    persona?: string;
    instructions?: string[];
  };
}

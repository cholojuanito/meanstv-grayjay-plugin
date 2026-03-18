// Ambient declarations for Grayjay runtime globals not already declared in plugin.d.ts.
// `source` is declared there as `const source: Source` — do not redeclare it here.

interface GrayjayHttpResponse {
  isOk: boolean;
  code: number;
  body: string;
  statusMessage: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare var http: {
  GET(url: string, headers: Record<string, string>, authenticated: boolean): GrayjayHttpResponse;
};

declare var bridge: {
  isLoggedIn(): boolean;
  supportedFeatures: string[] | null;
};

declare function log(msg: unknown): void;

declare var plugin: {
  config: { id: string };
};

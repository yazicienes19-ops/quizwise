/** PostgREST meldet eine (noch) nicht angelegte Funktion mit PGRST202. */
export const isMissingRpc = (error: { code?: string } | null): boolean =>
  error?.code === 'PGRST202';

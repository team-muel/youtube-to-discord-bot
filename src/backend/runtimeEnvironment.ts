export type RuntimeEnvironment = {
  nodeEnv: string;
  isProduction: boolean;
  isDevelopment: boolean;
  isTest: boolean;
  isRender: boolean;
  isCI: boolean;
};

export const detectRuntimeEnvironment = (env: NodeJS.ProcessEnv = process.env): RuntimeEnvironment => {
  const nodeEnv = String(env.NODE_ENV || 'development').trim().toLowerCase();

  return {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    isDevelopment: nodeEnv === 'development',
    isTest: nodeEnv === 'test',
    isRender: Boolean(env.RENDER || env.RENDER_SERVICE_ID || env.RENDER_INSTANCE_ID),
    isCI: String(env.CI || '').toLowerCase() === 'true',
  };
};

export const getCookieSecurity = (runtime: RuntimeEnvironment) => ({
  secure: runtime.isProduction,
  sameSite: runtime.isProduction ? ('none' as const) : ('lax' as const),
});

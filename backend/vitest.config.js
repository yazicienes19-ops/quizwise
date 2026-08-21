const { defineConfig } = require('vitest/config');
const path = require('path');

// Eigenes Config, damit vitest im Backend NICHT die vite.config.ts des
// Frontends aus dem Repo-Root lädt (dort ist jsdom + TS-Test-Include gesetzt).
// Alias statt vi.mock: CommonJS-require in den Quellmodulen bekommt den Stub
// so ebenfalls zuverlässig (Mock-Fabriken greifen bei require() nicht).
module.exports = defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.js'],
    // supabase-js durch die Transform-Pipeline zwingen (statt als externes
    // node_modules-Modul an Node durchzureichen) — nur dann greift der Alias.
    server: { deps: { inline: ['@supabase/supabase-js'] } },
  },
  resolve: {
    alias: {
      '@supabase/supabase-js': path.resolve(__dirname, 'src/__tests__/supabaseStub.js'),
    },
  },
});

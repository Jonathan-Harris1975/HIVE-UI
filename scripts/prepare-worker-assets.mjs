import { rm, access } from 'node:fs/promises';

const staleRedirects = new URL('../dist/_redirects', import.meta.url);

try {
  await access(staleRedirects);
  await rm(staleRedirects, { force: true });
  console.log('Removed stale Pages _redirects file from Worker assets.');
} catch {
  // Expected for the Worker-native build: no legacy _redirects asset exists.
}

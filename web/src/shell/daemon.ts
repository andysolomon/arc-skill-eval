/**
 * The local daemon behind localhost mode (`npm run dev` starts it on port
 * 7357). Set VITE_DAEMON_URL at build time to point the app at another port;
 * the end-to-end tests build against a daemon of their own.
 */
export const DAEMON_URL: string = import.meta.env.VITE_DAEMON_URL ?? 'http://localhost:7357';

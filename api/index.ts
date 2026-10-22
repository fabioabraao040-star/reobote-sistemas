// Entrypoint da função serverless da Vercel.
// Reutiliza o MESMO backend de server.ts (fonte única, com toda a segurança aplicada).
import app from '../server';

export default app;

import dotenv from 'dotenv';
import { sendIntegrationTestEvent } from '../integration.js';

dotenv.config();

const baseUrl = (process.env.REOBOTE_SUPORTE_INTEGRATION_URL || '').trim();
const secret = process.env.REOBOTE_SISTEMAS_INTEGRATION_SECRET || '';

async function main() {
  if (!baseUrl || !secret) {
    console.error(
      'Faltam variáveis de ambiente: REOBOTE_SUPORTE_INTEGRATION_URL e REOBOTE_SISTEMAS_INTEGRATION_SECRET.'
    );
    process.exit(1);
  }

  const result = await sendIntegrationTestEvent(baseUrl, secret);

  // Saída sanitizada: nunca imprime corpo bruto de resposta, cabeçalhos,
  // URL completa, segredo ou detalhes internos do receptor.
  console.log(
    JSON.stringify(
      {
        ok: result.ok,
        status: result.status,
        received: result.received,
        recorded: result.recorded,
        telegramSent: result.telegramSent,
        telegramStatus: result.telegramStatus,
        testId: result.testId,
        duplicate: result.duplicate,
        error: result.error
      },
      null,
      2
    )
  );

  process.exit(result.ok ? 0 : 1);
}

main();

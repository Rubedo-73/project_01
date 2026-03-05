/**
 * Telegram‑бот‑прокси с использованием native fetch (Node ≥ 18).
 */

import dotenv from 'dotenv'
let envPath = './conf/.env.dev'
dotenv.config({ path: envPath })

import { Telegraf, Markup } from 'telegraf';
/* Если Node < 18:
   import fetch from 'node-fetch';
*/

const botToken = process.env.TELEGRAM_TOKEN;
console.log({ botToken, envPath });

if (!botToken) {
  console.error('[ERROR] TELEGRAM_TOKEN не задан в .env');
  process.exit(1);
}
const bot = new Telegraf(botToken);

const apiBaseUrl = process.env.MICROSERVICE_URL || '';
const apiHeaders = {
  'Content-Type': 'application/json',
  ...(process.env.MICROSERVICE_API_KEY && {
    Authorization: `Bearer ${process.env.MICROSERVICE_API_KEY}`,
  }),
};

/**
 * Универсальная обёртка над fetch.
 *
 * @param {string} endpoint   Путь микросервиса, например '/data'
 * @param {'GET'|'POST'|'PUT'|'DELETE'} method
 * @param {?object} payload   Для POST/PUT (JSON‑объект)
 * @returns {Promise<object>}  Ответ в виде JSON
 */
async function callMicroservice(endpoint, method = 'GET', payload = null) {
  try {
    const url = `${apiBaseUrl}${endpoint}`;
    const options = {
      method,
      headers: apiHeaders,
    };

    if (payload && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(payload);
    }

    const res = await fetch(url, options);

    // Если статус 4xx/5xx – бросаем ошибку
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status}: ${text}`);
    }

    return await res.json();          // Предполагаем JSON‑ответ
  } catch (err) {
    console.error(`[MICROSERVICE ERROR] ${endpoint}`, err.message);
    return { error: 'Внутренняя ошибка сервера' };
  }
}

/* ==================== Бот ==================== */

bot.start((ctx) => {
  ctx.reply(
    `Привет, ${ctx.from.first_name}! Я бот‑прокси.\n` +
      'Выберите действие:',
    Markup.keyboard([['📄 Получить данные'], ['🔧 Отправить запрос']])
      .resize()
      .oneTime()
  );
});

bot.help((ctx) => ctx.reply('Список команд:\n/start - начало\n/help - помощь'));

bot.hears('📄 Получить данные', async (ctx) => {
  const data = await callMicroservice('/data');   // GET /data

  if (data.error) {
    ctx.reply(`❌ Ошибка: ${data.error}`);
  } else {
    ctx.reply(
      `📊 Данные:\n` +
        `• Имя: ${data.name}\n` +
        `• Кол-во: ${data.count}`
    );
  }
});

bot.hears('🔧 Отправить запрос', async (ctx) => {
  ctx.reply(
    'Введите JSON, который нужно отправить в микросервис:\n' +
      'Пример: {"action":"start"}'
  );

  // Ожидаем следующий текст от пользователя
  bot.on('text', async (innerCtx) => {
    try {
      const payload = JSON.parse(innerCtx.message.text);
      const res = await callMicroservice('/process', 'POST', payload);

      if (res.error) {
        innerCtx.reply(`❌ Ошибка: ${res.error}`);
      } else {
        innerCtx.reply(
          `✅ Успешно! Ответ от сервера:\n${JSON.stringify(res, null, 2)}`
        );
      }
    } catch (_) {
      innerCtx.reply('⚠️ Невалидный JSON. Попробуйте ещё раз.');
    }
    // Останавливаем прослушку дальнейших текстов
    bot.off('text');
  });
});

bot.action(/details_(\d+)/, async (ctx) => {
  const id = ctx.match[1];
  const info = await callMicroservice(`/info/${id}`);

  if (info.error) {
    ctx.reply(`❌ Ошибка: ${info.error}`);
  } else {
    ctx.reply(
      `📄 Информация о ${id}:\n` +
        `• Название: ${info.title}\n` +
        `• Описание: ${info.description}`
    );
  }
  await ctx.answerCbQuery();   // скрываем «loading…» у кнопки
});

bot.launch().then(() => console.log('🚀 Telegram‑бот запущен!'));

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { pool } = require('../apps/api/src/db');

async function telegram(method, payload) {
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) {
    if (data.error_code === 400 && /message to delete not found/i.test(data.description || '')) return;
    throw new Error(`Telegram ${method} failed (${data.error_code || response.status}).`);
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const channel = process.env.TELEGRAM_CHANNEL_ID;
  if (!token || !channel) throw new Error('TELEGRAM_BOT_TOKEN and TELEGRAM_CHANNEL_ID are required.');
  const { rows } = await pool.query(`
    SELECT cp.id,cp.channel_id,cp.message_ids,cp.status,l.source_lot_number
    FROM channel_publications cp JOIN auction_lots l ON l.id=cp.listing_id
    WHERE cp.listing_kind='auction' AND l.source_lot_number IS NOT NULL
      AND cp.channel_id=$1 AND cp.status='sent'
    ORDER BY cp.created_at
  `, [String(channel)]);
  let removed = 0;
  for (const post of rows) {
    for (const messageId of post.message_ids || []) {
      await telegram('deleteMessage', { chat_id: post.channel_id, message_id: Number(messageId) });
      removed++;
    }
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const post of rows) {
      await client.query('DELETE FROM channel_publication_messages WHERE publication_id=$1', [post.id]);
      await client.query(`UPDATE channel_publications SET status='queued',content_sent=false,buttons_sent=false,
        message_ids='{}',sent_at=NULL,lease_until=NULL,last_error=NULL,updated_at=now() WHERE id=$1`, [post.id]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  console.log(`Cleared ${removed} old e-auksion channel message(s); ${rows.length} official lot post(s) are queued for corrected photo posts.`);
}

main().catch(error => {
  console.error(`e-auksion post refresh failed: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());

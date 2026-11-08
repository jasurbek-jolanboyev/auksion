'use strict';

const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const { pool } = require('../apps/api/src/db');

const SOURCE = 'https://e-auksion.uz/api/front/lots';
const PAGE_SIZE = 50;
const CATEGORIES = [
  { id: 2, propertyType: 'house' },
  { id: 3, propertyType: 'apartment' }
];

function parseTashkentDate(value) {
  const match = String(value || '').match(/^(\d{2})\.(\d{2})\.(\d{4})\s+(\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, day, month, year, hour, minute] = match;
  const date = new Date(`${year}-${month}-${day}T${hour}:${minute}:00+05:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function mapLot(source, propertyType) {
  if (Number(source.lot_statuses_id) !== 2) return null;
  const parts = String(source.full_address || '').split(',').map(part => part.trim()).filter(Boolean);
  const deadline = parseTashkentDate(source.order_end_time_str);
  const startsAt = parseTashkentDate(source.auction_date_str);
  const lotNumber = String(source.lot_number || source.id || '').trim();
  const price = Number(source.start_price);
  const deposit = Number(source.zaklad_summa);
  if (!lotNumber || !source.name || !Number.isFinite(price) || price < 0 || !deadline || !startsAt) return null;
  return {
    sourceLotNumber: lotNumber,
    title: Array.from(String(source.name).trim()).slice(0, 180).join(''),
    // The public list API does not expose the long-form lot description. Keep
    // the exact official category label here instead of inventing a description.
    description: String(source.description || source.lot_description || source.confiscant_categories_name || '').trim().slice(0, 10000),
    region: (parts[0] || 'O‘zbekiston').slice(0, 100),
    district: (parts[1] || '').slice(0, 100),
    address: parts.slice(2).join(', ').slice(0, 250),
    startingPrice: Math.round(price),
    deposit: Number.isFinite(deposit) && deposit >= 0 ? Math.round(deposit) : null,
    startsAt,
    deadline,
    propertyType,
    sourceUrl: `https://e-auksion.uz/lot-view?lot_number=${encodeURIComponent(lotNumber)}`,
    imageUrl: /^https:\/\/media\.e-auksion\.uz\//i.test(String(source.media_url || '')) ? source.media_url : '',
    sourcePayload: source
  };
}

async function getCategoryLots(category) {
  const first = await fetchPage(category.id, 1);
  const pages = Math.min(Number(first.totalPages) || 1, 200);
  const result = first.rows.map(row => mapLot(row, category.propertyType)).filter(Boolean);
  for (let page = 2; page <= pages; page++) {
    const data = await fetchPage(category.id, page);
    result.push(...data.rows.map(row => mapLot(row, category.propertyType)).filter(Boolean));
    await new Promise(resolve => setTimeout(resolve, 150));
  }
  return result;
}

async function fetchPage(categoryId, page) {
  const response = await fetch(SOURCE, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({
      sort_type: 1,
      confiscant_groups_id: 1,
      confiscant_categories_id: categoryId,
      current_page: page,
      per_page: PAGE_SIZE
    }),
    signal: AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error(`e-auksion API returned HTTP ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data.rows)) throw new Error('e-auksion API response did not contain a lot list.');
  return data;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
  const seen = new Map();
  for (const category of CATEGORIES) {
    const rows = await getCategoryLots(category);
    for (const lot of rows) {
      if (lot.deadline > new Date()) seen.set(lot.sourceLotNumber, lot);
    }
  }

  const eligible = [...seen.values()].sort((a,b) => a.deadline - b.deadline);
  const requestedLimit = Number(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || 20);
  const limit = Number.isInteger(requestedLimit) ? Math.max(1, Math.min(200, requestedLimit)) : 20;
  const lots = eligible.slice(0, limit);
  console.log(`e-auksion: ${eligible.length} residential lots have an open application period; importing the ${lots.length} soonest deadlines.`);
  if (!process.argv.includes('--apply')) {
    for (const lot of lots.slice(0, 10)) console.log(`№${lot.sourceLotNumber} · ${lot.title} · ${lot.deadline.toLocaleString('uz-UZ')}`);
    console.log('Preview only. Run with --apply to save lots and queue Telegram channel posts. Set --limit=N to change the maximum (1–200).');
    return;
  }

  const client = await pool.connect();
  let inserted = 0;
  let updated = 0;
  try {
    await client.query('BEGIN');
    for (const lot of lots) {
      const result = await client.query(`
        INSERT INTO auction_lots
          (source_lot_number,title,description,region,district,address,starting_price,deposit,currency,
           starts_at,deadline,property_type,source_url,image_url,source_payload,status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'UZS',$9,$10,$11,$12,$13,$14::jsonb,'active')
        ON CONFLICT (source_lot_number) DO UPDATE SET
          title=excluded.title, description=excluded.description, region=excluded.region,
          district=excluded.district, address=excluded.address, starting_price=excluded.starting_price,
          deposit=excluded.deposit, currency=excluded.currency, starts_at=excluded.starts_at,
          deadline=excluded.deadline, property_type=excluded.property_type,
          source_url=excluded.source_url, image_url=excluded.image_url,
          source_payload=excluded.source_payload, status='active'
        RETURNING id, (xmax = 0) AS inserted
      `, [lot.sourceLotNumber,lot.title,lot.description,lot.region,lot.district,lot.address,
        lot.startingPrice,lot.deposit,lot.startsAt.toISOString(),lot.deadline.toISOString(),
        lot.propertyType,lot.sourceUrl,lot.imageUrl,JSON.stringify(lot.sourcePayload)]);
      const saved = result.rows[0];
      if (saved.inserted) inserted++;
      else updated++;
      await client.query("INSERT INTO outbox(event_type,aggregate_id,payload) VALUES('auction.approved',$1,$2)",
        [saved.id, JSON.stringify({ auctionId: saved.id, source: 'e-auksion', sourceLotNumber: lot.sourceLotNumber })]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  console.log(`Saved ${inserted} new lots and refreshed ${updated} existing lots.`);
  console.log('Telegram channel posts are queued; the bot worker sends them.');
}

main().catch(error => {
  console.error(`e-auksion import failed: ${error.code || error.name}: ${error.message}`);
  process.exitCode = 1;
}).finally(() => pool.end());

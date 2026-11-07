'use strict';

const SEARCH_FIELDS = alias => [
  `${alias}.title`, `${alias}.description`, `${alias}.region`, `${alias}.district`,
  `${alias}.address`, `${alias}.landmark`, `${alias}.amenities::text`, `${alias}.condition`,
  `${alias}.documents_info`, `${alias}.type`, `${alias}.deal`
];

function tokenize(value) {
  return [...new Set(String(value || '').normalize('NFKC').toLocaleLowerCase()
    .split(/[^\p{L}\p{N}]+/u).map(word => word.trim()).filter(word => word.length > 1))].slice(0, 12);
}

function likePattern(value) {
  return `%${value.replace(/[\\%_]/g, char => `\\${char}`)}%`;
}

function buildPropertySearch(value, { alias = 'p', startIndex = 0 } = {}) {
  const words = tokenize(value);
  if (!words.length) return { words, values: [], condition: '', rank: '0' };
  const fields = SEARCH_FIELDS(alias);
  const values = [];
  const wordMatches = words.map(word => {
    values.push(likePattern(word));
    const placeholder = `$${startIndex + values.length}`;
    return `(${fields.map(field => `COALESCE(${field}, '') ILIKE ${placeholder} ESCAPE E'\\\\'`).join(' OR ')})`;
  });
  return {
    words,
    values,
    condition: `(${wordMatches.join(' OR ')})`,
    rank: `(${wordMatches.map(match => `CASE WHEN ${match} THEN 1 ELSE 0 END`).join(' + ')})`
  };
}

function extractPlaceQuery(value) {
  const words = String(value || '').normalize('NFKC').trim().split(/\s+/);
  for (const word of words) {
    const match = word.match(/^([\p{L}\p{N}'’-]{3,}?)(?:dan|den|tan|ten|ga|ka|qa|da|ta|dagi|gacha)$/iu);
    const candidate=match?.[1].replace(/[.,!?]+$/g,'');
    if(candidate&&!['men','sen','biz','siz','ular','menga','senga','bizga','sizga'].includes(candidate.toLocaleLowerCase()))return candidate;
  }
  return '';
}

module.exports = { tokenize, buildPropertySearch, extractPlaceQuery };

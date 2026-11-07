'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {tokenize,buildPropertySearch,extractPlaceQuery}=require('./property-search');

test('multiword searches match every word independently across public listing fields',()=>{
  const query=buildPropertySearch('arzon uy');
  assert.deepEqual(tokenize('arzon uy'),['arzon','uy']);
  assert.match(query.condition,/OR/);
  assert.equal(query.values[0],'%arzon%');
  assert.equal(query.values[1],'%uy%');
  assert.match(query.condition,/p\.landmark/);
  assert.match(query.condition,/p\.amenities/);
});

test('location phrases extract Uzbek case endings without treating pronouns as places',()=>{
  assert.equal(extractPlaceQuery('menga Krasnagorskdan uy kerak'),'Krasnagorsk');
  assert.equal(extractPlaceQuery('Chirchiqqa yaqin uy'),'Chirchiq');
  assert.equal(extractPlaceQuery('menga arzon uy kerak'),'');
});

test('search punctuation is discarded before creating SQL parameters',()=>{
  const query=buildPropertySearch('uy_%');
  assert.deepEqual(query.words,['uy']);
  assert.equal(query.values[0],'%uy%');
});

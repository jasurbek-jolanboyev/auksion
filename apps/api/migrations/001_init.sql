CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text UNIQUE,
  telegram_id bigint UNIQUE,
  name text NOT NULL DEFAULT '',
  email text,
  role text NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
  region text NOT NULL DEFAULT 'Toshkent',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_runtime_secrets (
  name text PRIMARY KEY,
  value text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otp_phone_created_idx ON otp_challenges(phone, created_at DESC);

CREATE TABLE IF NOT EXISTS properties (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  type text NOT NULL CHECK (type IN ('apartment','house','land','commercial')),
  deal text NOT NULL CHECK (deal IN ('sale','rent')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('draft','pending','active','rejected','archived')),
  price bigint NOT NULL CHECK (price >= 0),
  currency char(3) NOT NULL DEFAULT 'UZS',
  area numeric(12,2) NOT NULL CHECK (area > 0),
  area_unit text NOT NULL DEFAULT 'm2' CHECK (area_unit IN ('m2','sotix')),
  rooms smallint,
  region text NOT NULL,
  district text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  landmark text NOT NULL DEFAULT '',
  latitude numeric(10,7),
  longitude numeric(10,7),
  amenities jsonb NOT NULL DEFAULT '[]'::jsonb,
  seller_telegram text,
  rejection_reason text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180))
);
ALTER TABLE properties ADD COLUMN IF NOT EXISTS floor_number smallint;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS total_floors smallint;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS condition text NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS documents_info text NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS electricity_available boolean;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS water_available boolean;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS gas_available boolean;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS publish_phone boolean NOT NULL DEFAULT false;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS price_negotiable boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS properties_public_idx ON properties(status, published_at DESC);
CREATE INDEX IF NOT EXISTS properties_public_coordinates_idx ON properties(latitude, longitude) WHERE status='active' AND latitude IS NOT NULL AND longitude IS NOT NULL;
CREATE INDEX IF NOT EXISTS properties_owner_idx ON properties(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS properties_search_idx ON properties USING gin (to_tsvector('simple', title || ' ' || description || ' ' || region || ' ' || district));
CREATE TABLE IF NOT EXISTS property_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  url text NOT NULL,
  position smallint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_images_order_idx ON property_images(property_id, position);

CREATE TABLE IF NOT EXISTS favorites (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, property_id)
);
CREATE TABLE IF NOT EXISTS saved_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  filters jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  buyer_id uuid NOT NULL REFERENCES users(id),
  seller_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(property_id, buyer_id)
);
CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz
);
CREATE TABLE IF NOT EXISTS viewing_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  requester_id uuid NOT NULL REFERENCES users(id),
  requested_at timestamptz NOT NULL,
  note text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id),
  reporter_id uuid NOT NULL REFERENCES users(id),
  reason text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  region text NOT NULL,
  developer text NOT NULL DEFAULT '',
  price_from bigint,
  handover_date date,
  image_url text,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','inactive')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS auction_lots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  region text NOT NULL,
  address text NOT NULL DEFAULT '',
  starting_price bigint NOT NULL CHECK(starting_price >= 0),
  area numeric(12,2),
  area_unit text NOT NULL DEFAULT 'm2',
  deadline timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK(status IN ('draft','active','closed','archived')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS property_type text NOT NULL DEFAULT '';
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS deposit bigint;
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS starts_at timestamptz;
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS source_url text NOT NULL DEFAULT '';
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS currency char(3) NOT NULL DEFAULT 'UZS';
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS rooms smallint;
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '';
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS source_lot_number text UNIQUE;
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS image_url text NOT NULL DEFAULT '';
ALTER TABLE auction_lots ADD COLUMN IF NOT EXISTS source_payload jsonb NOT NULL DEFAULT '{}'::jsonb;
CREATE TABLE IF NOT EXISTS auction_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES auction_lots(id),
  user_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','reviewing','accepted','rejected')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(lot_id, user_id)
);
CREATE TABLE IF NOT EXISTS lot_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id uuid NOT NULL REFERENCES auction_lots(id) ON DELETE CASCADE,
  title text NOT NULL,
  storage_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS contact_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text,
  phone text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'general' CHECK(request_type IN ('general','suggestion','partnership'));
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS telegram_user_id bigint;
ALTER TABLE contact_requests ADD COLUMN IF NOT EXISTS telegram_username text;
CREATE TABLE IF NOT EXISTS support_messages (
  id bigserial PRIMARY KEY,
  request_id uuid NOT NULL REFERENCES contact_requests(id) ON DELETE CASCADE,
  sender_role text NOT NULL CHECK(sender_role IN ('user','admin')),
  telegram_id bigint NOT NULL,
  body text NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS support_messages_request_created_idx ON support_messages(request_id,created_at);
CREATE TABLE IF NOT EXISTS admin_audit (
  id bigserial PRIMARY KEY,
  admin_id uuid NOT NULL REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS outbox (
  id bigserial PRIMARY KEY,
  event_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS property_channel_posts (
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  message_id bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(property_id, channel_id)
);
CREATE TABLE IF NOT EXISTS channel_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_kind text NOT NULL CHECK(listing_kind IN ('property','auction')),
  listing_id uuid NOT NULL,
  channel_id text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','sending','sent','failed','unknown','archived')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  content_sent boolean NOT NULL DEFAULT false,
  buttons_sent boolean NOT NULL DEFAULT false,
  message_ids bigint[] NOT NULL DEFAULT '{}',
  lease_until timestamptz,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(listing_kind,listing_id,channel_id)
);
ALTER TABLE channel_publications ADD COLUMN IF NOT EXISTS content_sent boolean NOT NULL DEFAULT false;
ALTER TABLE channel_publications ADD COLUMN IF NOT EXISTS buttons_sent boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS channel_publication_messages (
  publication_id uuid NOT NULL REFERENCES channel_publications(id) ON DELETE CASCADE,
  channel_id text NOT NULL,
  message_id bigint NOT NULL,
  sequence integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(channel_id,message_id),
  UNIQUE(publication_id,sequence)
);
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE outbox ADD COLUMN IF NOT EXISTS failed_at timestamptz;
CREATE INDEX IF NOT EXISTS channel_publications_status_idx ON channel_publications(status,updated_at DESC);
INSERT INTO channel_publications(listing_kind,listing_id,channel_id,status,message_ids,sent_at,created_at,updated_at)
SELECT 'property',property_id,channel_id,'sent',ARRAY[message_id],created_at,created_at,created_at
FROM property_channel_posts ON CONFLICT(listing_kind,listing_id,channel_id) DO NOTHING;
INSERT INTO channel_publication_messages(publication_id,channel_id,message_id,sequence,created_at)
SELECT cp.id,cp.channel_id,p.message_id,0,p.created_at
FROM property_channel_posts p JOIN channel_publications cp ON cp.listing_kind='property' AND cp.listing_id=p.property_id AND cp.channel_id=p.channel_id
ON CONFLICT(channel_id,message_id) DO NOTHING;
CREATE INDEX IF NOT EXISTS outbox_ready_idx ON outbox(next_attempt_at) WHERE delivered_at IS NULL;
CREATE TABLE IF NOT EXISTS bot_states (
  telegram_id bigint PRIMARY KEY,
  state jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bot_preferences (
  telegram_id bigint PRIMARY KEY,
  language text NOT NULL DEFAULT 'uz' CHECK(language IN ('uz','ru','en','hi','zh','tr','ko')),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS service_heartbeats (
  service text PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  status_details jsonb NOT NULL DEFAULT '{}'::jsonb
);
ALTER TABLE service_heartbeats ADD COLUMN IF NOT EXISTS status_details jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Admin account controls and privacy-aware administrative access logs.
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_at timestamptz;
ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked_reason text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS district text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS residential_address text NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_phone text NOT NULL DEFAULT '';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS viewing_available boolean NOT NULL DEFAULT true;
CREATE INDEX IF NOT EXISTS users_admin_search_idx ON users(created_at DESC);
CREATE INDEX IF NOT EXISTS conversations_admin_recent_idx ON conversations(created_at DESC);

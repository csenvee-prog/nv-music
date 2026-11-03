-- NV Music Database Migration
-- Created: 2026-11-03
-- Purpose: Initial schema for NV Music - a music streaming React Native app with Spotify integration
-- Supports: streaming tracks (via providers), local tracks, and demo tracks

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- CORE TABLES
-- ============================================================================

-- User profiles - one per authenticated user
-- Linked to auth.users.id via auth.uid() in RLS policies
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    email TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Music tracks from various providers (streaming only)
-- Local tracks are stored client-side in AsyncStorage, not here
-- Demo tracks are also client-side only
CREATE TABLE public.cloud_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('spotify', 'apple_music', 'youtube_music')),
    provider_track_id TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    album TEXT,
    duration_seconds INTEGER CHECK (duration_seconds > 0),
    album_cover_url TEXT,
    preview_url TEXT,
    external_urls JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(provider, provider_track_id)
);

-- User-created playlists
CREATE TABLE public.playlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    cover_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Tracks within playlists (ordered)
-- References cloud_tracks for streaming tracks only
-- Local/demo tracks are NOT stored in cloud_tracks; they should not appear in playlists server-side
CREATE TABLE public.playlist_tracks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playlist_id UUID NOT NULL REFERENCES public.playlists(id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES public.cloud_tracks(id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(playlist_id, position)
);

-- Liked songs - supports streaming, local, and demo tracks
CREATE TABLE public.liked_songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('streaming', 'local', 'demo')),
    -- For streaming tracks: provider is required
    provider TEXT CHECK (provider IN ('spotify', 'apple_music', 'youtube_music')),
    -- Identifier depends on source_type:
    -- streaming: provider_track_id (e.g., "spotify:track:abc123")
    -- local: local_track_id (UUID stored in AsyncStorage, reference here for sync purposes)
    -- demo: demo_track_id (predefined demo content identifier)
    track_identifier TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, source_type, track_identifier),
    -- Streaming tracks require a provider; local/demo tracks have NULL provider
    CHECK (
        (source_type = 'streaming' AND provider IS NOT NULL) OR
        (source_type IN ('local', 'demo') AND provider IS NULL)
    )
);

-- Recently played tracks by user - supports streaming, local, and demo tracks
CREATE TABLE public.recent_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    source_type TEXT NOT NULL CHECK (source_type IN ('streaming', 'local', 'demo')),
    provider TEXT CHECK (provider IN ('spotify', 'apple_music', 'youtube_music')),
    track_identifier TEXT NOT NULL,
    played_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    -- Streaming tracks require a provider; local/demo tracks have NULL provider
    CHECK (
        (source_type = 'streaming' AND provider IS NOT NULL) OR
        (source_type IN ('local', 'demo') AND provider IS NULL)
    )
);

-- Play session tracking - for active streaming sessions only
-- Idle playback does NOT create a cloud session (client-side handles local/demo)
CREATE TABLE public.play_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    track_id UUID NOT NULL REFERENCES public.cloud_tracks(id) ON DELETE CASCADE,
    started_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    ended_at TIMESTAMP WITH TIME ZONE,
    queue JSONB NOT NULL CHECK (jsonb_typeof(queue) = 'array'),
    queue_index INTEGER NOT NULL DEFAULT 0 CHECK (queue_index >= 0),
    -- Reject empty queues entirely - idle playback must not create sessions
    CHECK (jsonb_array_length(queue) > 0),
    -- Queue index must be valid for the queue
    CHECK (queue_index < jsonb_array_length(queue)),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW())
);

-- Provider connections (OAuth tokens - server-side only, encrypted)
-- CRITICAL: These tokens are encrypted with AES-256-GCM and require the encryption helper
CREATE TABLE public.provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('spotify')), -- Streaming providers - rejects NULL
    provider_user_id TEXT NOT NULL,
    -- Encrypted OAuth tokens (store Base64-encoded ciphertext, nonce, and auth tag separately)
    -- NO plaintext OAuth tokens stored - all tokens encrypted with AES-256-GCM
    access_token_encrypted TEXT NOT NULL,
    access_token_nonce TEXT NOT NULL,
    access_token_tag TEXT NOT NULL,
    refresh_token_encrypted TEXT NOT NULL,
    refresh_token_nonce TEXT NOT NULL,
    refresh_token_tag TEXT NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version > 0),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(user_id, provider)
);

-- Public provider catalog cache (artist/track metadata for all providers)
-- Write access restricted to service_role; readable by all authenticated users
CREATE TABLE public.provider_catalog (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL CHECK (provider IN ('spotify', 'apple_music', 'youtube_music')),
    entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'track', 'album', 'playlist')),
    entity_id TEXT NOT NULL,
    name TEXT NOT NULL,
    artist_names TEXT[],
    album_name TEXT,
    duration_seconds INTEGER,
    preview_url TEXT,
    external_urls JSONB,
    last_synced TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc', NOW()),
    UNIQUE(provider, entity_type, entity_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Cloud tracks: Fast provider-track lookups
-- Note: UNIQUE(provider, provider_track_id) already creates an index on this column combination
CREATE INDEX idx_cloud_tracks_search ON public.cloud_tracks(LOWER(title), LOWER(artist));
CREATE INDEX idx_cloud_tracks_provider ON public.cloud_tracks(provider);
CREATE INDEX idx_cloud_tracks_duration ON public.cloud_tracks(duration_seconds);

-- Playlists: Fast user playlist lookups (user_id is not unique, needs explicit index)
CREATE INDEX idx_playlists_user ON public.playlists(user_id);
CREATE INDEX idx_playlists_created_at ON public.playlists(created_at DESC);

-- Liked songs: Fast user liked-song lookups (user_id is not unique, needs explicit index)
CREATE INDEX idx_liked_songs_user ON public.liked_songs(user_id);
CREATE INDEX idx_liked_songs_created_at ON public.liked_songs(created_at DESC);
CREATE INDEX idx_liked_songs_source_type ON public.liked_songs(source_type);

-- Playlist tracks: Fast lookups by track_id
-- Note: track_id is FK but not unique, needs explicit index
CREATE INDEX idx_playlist_tracks_track_id ON public.playlist_tracks(track_id);
CREATE INDEX idx_playlist_tracks_playlist_id ON public.playlist_tracks(playlist_id);

-- Recent history: Fast recent track lookups
-- Note: user_id is FK but not unique, needs explicit index
CREATE INDEX idx_recent_history_user ON public.recent_history(user_id);
CREATE INDEX idx_recent_history_played_at ON public.recent_history(played_at DESC);
CREATE INDEX idx_recent_history_source_type ON public.recent_history(source_type);
CREATE INDEX idx_recent_history_identifier ON public.recent_history(track_identifier);

-- Play sessions: Fast user session lookups (user_id is FK but not unique, needs explicit index)
CREATE INDEX idx_play_sessions_user ON public.play_sessions(user_id);
CREATE INDEX idx_play_sessions_active ON public.play_sessions(ended_at) WHERE ended_at IS NULL;
CREATE INDEX idx_play_sessions_started_at ON public.play_sessions(started_at DESC);

-- Provider connections: Unique constraint on (user_id, provider) already creates index on user_id
-- We need provider index for lookups by provider type
CREATE INDEX idx_provider_connections_provider ON public.provider_connections(provider);
CREATE INDEX idx_provider_connections_expires_at ON public.provider_connections(expires_at);
CREATE INDEX idx_provider_connections_provider_user ON public.provider_connections(provider_user_id);

-- Provider catalog: Fast search lookups
-- Note: UNIQUE(provider, entity_type, entity_id) already creates an index on this column combination
CREATE INDEX idx_provider_catalog_search ON public.provider_catalog(LOWER(name), provider);
CREATE INDEX idx_provider_catalog_entity_type ON public.provider_catalog(entity_type);
CREATE INDEX idx_provider_catalog_entity_id ON public.provider_catalog(entity_id);
CREATE INDEX idx_provider_catalog_last_synced ON public.provider_catalog(last_synced DESC);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Auto-update timestamps on row modification
CREATE OR REPLACE FUNCTION public.update_timestamp_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = TIMEZONE('utc', NOW());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_timestamp BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_cloud_tracks_timestamp BEFORE UPDATE ON public.cloud_tracks
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_playlists_timestamp BEFORE UPDATE ON public.playlists
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_playlist_tracks_timestamp BEFORE UPDATE ON public.playlist_tracks
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_liked_songs_timestamp BEFORE UPDATE ON public.liked_songs
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_provider_connections_timestamp BEFORE UPDATE ON public.provider_connections
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_play_sessions_timestamp BEFORE UPDATE ON public.play_sessions
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

CREATE TRIGGER update_provider_catalog_timestamp BEFORE UPDATE ON public.provider_catalog
    FOR EACH ROW EXECUTE FUNCTION public.update_timestamp_column();

-- ============================================================================
-- AUTH PROFILE TRIGGER
-- ============================================================================

-- Automatically create profile when user is inserted into auth.users
-- Uses SECURITY DEFINER with explicit search_path for security
CREATE OR REPLACE FUNCTION public.create_profile_for_user()
RETURNS TRIGGER AS $$
BEGIN
    -- Use INSERT ... ON CONFLICT to handle concurrent inserts safely
    -- Set display_name from NEW.raw_user_meta_data->>'display_name', then full_name, then NEW.email as fallback
    INSERT INTO public.profiles (user_id, display_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- Restrict function access - revoke from everyone, grant only to service_role
REVOKE ALL ON FUNCTION public.create_profile_for_user() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_profile_for_user() FROM anon;
REVOKE ALL ON FUNCTION public.create_profile_for_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_profile_for_user() TO service_role;

-- Attach trigger to auth.users table
-- This is a special Supabase pattern - auth.users is managed by Supabase
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.create_profile_for_user();

-- ============================================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cloud_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.playlist_tracks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.liked_songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recent_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.play_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.provider_catalog ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- POLICIES: profiles
-- ============================================================================

-- Users can only read their own profile
CREATE POLICY "Profiles select own" ON public.profiles
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Profiles insert own" ON public.profiles
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own profile with both USING and WITH CHECK
CREATE POLICY "Profiles update own" ON public.profiles
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Profiles delete own" ON public.profiles
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- POLICIES: cloud_tracks
-- ============================================================================

CREATE POLICY "Cloud tracks readable by authenticated" ON public.cloud_tracks
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage cloud tracks" ON public.cloud_tracks
    FOR ALL USING (auth.role() = 'service_role');

-- ============================================================================
-- POLICIES: playlists
-- ============================================================================

-- Owner has full access
CREATE POLICY "Playlists select for owner" ON public.playlists
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Playlists insert for owner" ON public.playlists
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Playlists update for owner" ON public.playlists
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Playlists delete for owner" ON public.playlists
    FOR DELETE USING (auth.uid() = user_id);

-- Public playlists readable by any authenticated user
CREATE POLICY "Public playlists readable by authenticated" ON public.playlists
    FOR SELECT USING (is_public = true);

-- ============================================================================
-- POLICIES: playlist_tracks
-- ============================================================================

-- Tracks visible when parent playlist is accessible (owned or public)
CREATE POLICY "Playlist tracks select for accessible playlists" ON public.playlist_tracks
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_id AND (p.user_id = auth.uid() OR p.is_public = true)
        )
    );

-- Only owner can add to their own playlists
CREATE POLICY "Users can add tracks to their playlists" ON public.playlist_tracks
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_id AND p.user_id = auth.uid()
        )
    );

-- Only owner can update tracks in their own playlists
CREATE POLICY "Users can update tracks in their playlists" ON public.playlist_tracks
    FOR UPDATE USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_id AND p.user_id = auth.uid()
        )
    );

-- Only owner can delete tracks from their own playlists
CREATE POLICY "Users can delete tracks from their playlists" ON public.playlist_tracks
    FOR DELETE USING (
        EXISTS (
            SELECT 1 FROM public.playlists p
            WHERE p.id = playlist_id AND p.user_id = auth.uid()
        )
    );

-- ============================================================================
-- POLICIES: liked_songs
-- ============================================================================

CREATE POLICY "Users can view their liked songs" ON public.liked_songs
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can like songs" ON public.liked_songs
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unlike songs" ON public.liked_songs
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- POLICIES: recent_history
-- ============================================================================

CREATE POLICY "Users can view their recent history" ON public.recent_history
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their history" ON public.recent_history
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their history" ON public.recent_history
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their history" ON public.recent_history
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- POLICIES: play_sessions
-- ============================================================================

-- Only owner can access their own play sessions
CREATE POLICY "Users can view their play sessions" ON public.play_sessions
    FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create play sessions" ON public.play_sessions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their play sessions" ON public.play_sessions
    FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their play sessions" ON public.play_sessions
    FOR DELETE USING (auth.uid() = user_id);

-- ============================================================================
-- POLICIES: provider_connections
-- ============================================================================

-- Server-side only - no direct client access
-- These tables store encrypted OAuth tokens and must be accessed via Edge Functions
-- NEVER grant select/insert/update/delete to authenticated or anon roles
CREATE POLICY "Provider connections not accessible to clients" ON public.provider_connections
    FOR ALL USING (false);

-- ============================================================================
-- POLICIES: provider_catalog
-- ============================================================================

-- Public read access for metadata
CREATE POLICY "Authenticated users can read provider catalog" ON public.provider_catalog
    FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can write provider catalog" ON public.provider_catalog
    FOR INSERT WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update provider catalog" ON public.provider_catalog
    FOR UPDATE USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete provider catalog" ON public.provider_catalog
    FOR DELETE USING (auth.role() = 'service_role');

-- ============================================================================
-- GRANTS
-- ============================================================================

-- Service role gets full access
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;

-- Explicitly revoke all privileges from anon and authenticated on the NV Music tables
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.cloud_tracks FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.playlists FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.playlist_tracks FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.liked_songs FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.recent_history FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.play_sessions FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.provider_connections FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.provider_catalog FROM anon;

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.cloud_tracks FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.playlists FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.playlist_tracks FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.liked_songs FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.recent_history FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.play_sessions FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.provider_connections FROM authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.provider_catalog FROM authenticated;

-- Then restore only the required authenticated grants
-- profiles - select for own (insert handled by trigger), update specific columns for own
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (display_name, avatar_url) ON public.profiles TO authenticated;

-- cloud_tracks - read only for authenticated
GRANT SELECT ON public.cloud_tracks TO authenticated;

-- playlists
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlists TO authenticated;

-- playlist_tracks
GRANT SELECT, INSERT, UPDATE, DELETE ON public.playlist_tracks TO authenticated;

-- liked_songs
GRANT SELECT, INSERT, DELETE ON public.liked_songs TO authenticated;

-- recent_history
GRANT SELECT, INSERT, UPDATE, DELETE ON public.recent_history TO authenticated;

-- play_sessions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.play_sessions TO authenticated;

-- provider_catalog - read only for authenticated
GRANT SELECT ON public.provider_catalog TO authenticated;

-- provider_connections stays inaccessible to anon and authenticated
-- Access is exclusively via service_role key in Edge Functions

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE public.profiles IS 'User profile information linked to auth.users. Stores display name, email, and avatar URL.';
COMMENT ON TABLE public.cloud_tracks IS 'Streaming tracks from Spotify, Apple Music, and YouTube Music. Local and demo tracks are client-side only.';
COMMENT ON TABLE public.playlists IS 'User-created playlists with optional public visibility.';
COMMENT ON TABLE public.playlist_tracks IS 'Ordered tracks within playlists. References cloud_tracks for streaming content.';
COMMENT ON TABLE public.liked_songs IS 'User-liked songs with support for streaming, local, and demo tracks.';
COMMENT ON TABLE public.recent_history IS 'Recently played tracks history for the user.';
COMMENT ON TABLE public.play_sessions IS 'Play sessions for active streaming only. Empty queues are rejected. Queue index must match queue bounds. Local/demo playback handled client-side.';
COMMENT ON TABLE public.provider_connections IS 'Stores encrypted OAuth tokens for streaming providers. Access controlled via service_role only - used by Edge Functions for token refresh.';
COMMENT ON TABLE public.provider_catalog IS 'Cached metadata for tracks, artists, albums, and playlists from streaming providers.';

COMMENT ON COLUMN provider_connections.access_token_encrypted IS 'AES-256-GCM ciphertext of the access token (Base64 encoded). NEVER stores plaintext tokens.';
COMMENT ON COLUMN provider_connections.access_token_nonce IS '12-byte nonce for AES-GCM decryption (Base64 encoded)';
COMMENT ON COLUMN provider_connections.access_token_tag IS '16-byte authentication tag for AES-GCM (Base64 encoded)';
COMMENT ON COLUMN provider_connections.refresh_token_encrypted IS 'AES-256-GCM ciphertext of the refresh token (Base64 encoded). NEVER stores plaintext tokens.';
COMMENT ON COLUMN provider_connections.refresh_token_nonce IS '12-byte nonce for AES-GCM decryption (Base64 encoded)';
COMMENT ON COLUMN provider_connections.refresh_token_tag IS '16-byte authentication tag for AES-GCM (Base64 encoded)';
COMMENT ON COLUMN provider_connections.key_version IS 'Encryption key version (ENCRYPTION_KEY_V{n}). Use connection.key_version for all token operations.';
COMMENT ON COLUMN liked_songs.source_type IS 'Source type: streaming, local, or demo. Local/demo tracks are synced via AsyncStorage.';
COMMENT ON COLUMN liked_songs.track_identifier IS 'For streaming: provider_track_id; for local/demo: local or demo track ID for sync purposes.';
COMMENT ON COLUMN recent_history.source_type IS 'Source type: streaming, local, or demo. Local/demo tracks are synced via AsyncStorage.';
COMMENT ON COLUMN recent_history.track_identifier IS 'For streaming: provider_track_id; for local/demo: local or demo track ID for sync purposes.';
COMMENT ON COLUMN recent_history.played_at IS 'Timestamp when the track was played';
COMMENT ON COLUMN play_sessions.queue IS 'JSONB array of track IDs - must be non-empty';
COMMENT ON COLUMN play_sessions.queue_index IS 'Current position in queue - must be >= 0 and < array length';
COMMENT ON COLUMN provider_catalog.entity_type IS 'Type of catalog entity: artist, track, album, or playlist';
COMMENT ON COLUMN provider_catalog.entity_id IS 'External provider ID for the entity';
COMMENT ON COLUMN provider_catalog.name IS 'Name of the entity';
COMMENT ON COLUMN provider_catalog.artist_names IS 'Array of artist names for tracks and albums';
COMMENT ON COLUMN provider_catalog.last_synced IS 'When this catalog entry was last updated from the provider';
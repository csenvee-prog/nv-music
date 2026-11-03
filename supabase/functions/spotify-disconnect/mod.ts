/// <reference lib="deno.ns" />
// supabase/functions/spotify-disconnect/mod.ts
//
// Disconnects the user's Spotify connection.
// Deletes only the user's own Spotify provider connection.
// Does NOT delete playlists, liked songs, or other user data.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface DisconnectResponse {
  success: boolean;
  message: string;
}

function jsonResponse(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      },
    });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Extract and validate Authorization header
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401);
  }

  const accessToken = authHeader.split(' ')[1];

  // Verify the user session with Supabase
  const { data: { user }, error: authError } = await supabase.auth.getUser(accessToken);

  if (authError || !user) {
    return jsonResponse({ error: 'Invalid or expired authentication token' }, 401);
  }

  // Delete Spotify connection for this user only
  const { error: deleteError } = await supabase
    .from('provider_connections')
    .delete()
    .eq('user_id', user.id)
    .eq('provider', 'spotify');

  if (deleteError) {
    console.error('[spotify-disconnect] Delete failed:', deleteError.message);
    return jsonResponse({ error: 'Failed to disconnect' }, 500);
  }

  const response: DisconnectResponse = {
    success: true,
    message: 'Spotify connection removed',
  };

  return jsonResponse(response, 200);
});
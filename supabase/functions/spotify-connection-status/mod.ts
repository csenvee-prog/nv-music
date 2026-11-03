/// <reference lib="deno.ns" />
// supabase/functions/spotify-connection-status/mod.ts
//
// Returns whether the authenticated user has a Spotify connection.
// This is a read-only status check - does NOT return any tokens or credentials.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface ConnectionStatusResponse {
  connected: boolean;
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
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, content-type, x-client-info, apikey',
      },
    });
  }

  // Only allow GET requests
  if (req.method !== 'GET') {
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

  // Check if user has a Spotify connection
  const { data: connection, error: dbError } = await supabase
    .from('provider_connections')
    .select('id')
    .eq('user_id', user.id)
    .eq('provider', 'spotify')
    .single();

  // Return connection status (does not expose any token data)
  const response: ConnectionStatusResponse = {
    connected: !dbError && !!connection,
  };

  return jsonResponse(response, 200);
});
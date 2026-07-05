import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.text();
    const { tableId, name, email } = body ? JSON.parse(body) : {};

    if (!tableId || !name || !email) {
      return new Response(JSON.stringify({ success: false, error: 'Missing tableId, name or email' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const supabaseUrl = Deno.env.get('URL');
    const serviceRoleKey = Deno.env.get('SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return new Response(JSON.stringify({ success: false, error: 'Missing Supabase environment variables' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const normalizedName = String(name).trim().toLowerCase();
    const normalizedEmail = String(email).trim().toLowerCase();

    const response = await fetch(`${supabaseUrl}/rest/v1/signups?select=*`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ success: false, error: errorText || 'Could not load signups' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const rows = await response.json();
    const matchingRows = Array.isArray(rows)
      ? rows.filter((row) => {
          const rowTableId = row.table_id || row.event_id || row.boardgame_table_id;
          return (
            String(rowTableId || '') === String(tableId) &&
            String(row.name || '').trim().toLowerCase() === normalizedName &&
            String(row.email || '').trim().toLowerCase() === normalizedEmail
          );
        })
      : [];

    if (matchingRows.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No matching signup found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    for (const row of matchingRows) {
      await fetch(`${supabaseUrl}/rest/v1/signups?id=eq.${encodeURIComponent(row.id)}`, {
        method: 'DELETE',
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          'Content-Type': 'application/json',
        },
      });
    }

    return new Response(JSON.stringify({ success: true, deleted: matchingRows.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Unsubscribe function error', error);
    return new Response(JSON.stringify({ success: false, error: 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

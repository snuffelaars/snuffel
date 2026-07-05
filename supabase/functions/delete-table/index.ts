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
    const { eventId, deleteCode } = body ? JSON.parse(body) : {};

    if (!eventId) {
      return new Response(JSON.stringify({ success: false, error: 'Missing eventId' }), {
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

    const existingResponse = await fetch(`${supabaseUrl}/rest/v1/boardgame_tables?id=eq.${encodeURIComponent(eventId)}&select=id,delete_code`, {
      method: 'GET',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!existingResponse.ok) {
      const errorText = await existingResponse.text();
      return new Response(JSON.stringify({ success: false, error: errorText || 'Could not read table' }), {
        status: existingResponse.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const existingRows = await existingResponse.json();
    const existingRow = Array.isArray(existingRows) ? existingRows[0] : null;

    if (!existingRow) {
      return new Response(JSON.stringify({ success: false, error: 'Table not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    if (String(existingRow.delete_code || '').trim().toUpperCase() !== String(deleteCode || '').trim().toUpperCase()) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid delete code' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const response = await fetch(`${supabaseUrl}/rest/v1/boardgame_tables?id=eq.${encodeURIComponent(eventId)}`, {
      method: 'DELETE',
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return new Response(JSON.stringify({ success: false, error: errorText || 'Delete failed' }), {
        status: response.status,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error) {
    console.error('Delete table function error', error);
    return new Response(JSON.stringify({ success: false, error: 'Unexpected error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});

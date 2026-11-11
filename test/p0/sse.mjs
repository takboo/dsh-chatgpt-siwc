export const usage = {
  input_tokens: 12,
  input_tokens_details: { cached_tokens: 5 },
  output_tokens: 8,
  output_tokens_details: { reasoning_tokens: 3 },
  total_tokens: 20,
}

export function sse(...events) {
  return new Response(events.map(event => 'data: ' + JSON.stringify(event) + '\n\n').join(''), {
    headers: { 'content-type': 'text/event-stream' },
  })
}

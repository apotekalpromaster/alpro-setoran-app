async function run() {
    const res = await fetch('https://wbboykllebhnoyaugtpg.supabase.co/functions/v1/groq-ai-service', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'chat', prompt: 'hello' })
    });
    const text = await res.text();
    console.log(res.status, text);
}
run();

fetch('https://wbboykllebhnoyaugtpg.supabase.co/functions/v1/send-reminder-emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
}).then(res => res.json().then(data => ({ status: res.status, data })))
    .then(console.log)
    .catch(console.error);

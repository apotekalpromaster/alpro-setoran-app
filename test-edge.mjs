const testPayload = {
    cabang: "Alpro Sudirman",
    pelaporEmail: "tokocabang@apotekalpro.id",
    tanggal: new Date().toISOString(),
    masalah: "Deposit Card Terblokir (Salah Input PIN 3x)"
};

fetch('https://wbboykllebhnoyaugtpg.supabase.co/functions/v1/send-critical-alert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
}).then(res => res.json().then(data => ({ status: res.status, data })))
    .then(console.log)
    .catch(console.error);

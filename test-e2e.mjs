import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error("Missing Supabase credentials in .env");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runTests() {
    console.log("=== Memulai Uji Coba Integrasi Menyeluruh (E2E Testing) ===");

    // 1. Test Groq AI
    console.log("\n[1/3] Menguji groq-ai-service...");
    try {
        const { data: groqData, error: groqError } = await supabase.functions.invoke('groq-ai-service', {
            body: { action: 'chat', prompt: 'Halo asisten, konfirmasi tes 123.', username: 'Tester' }
        });
        if (groqError) throw groqError;
        console.log("✅ Groq AI Response:", groqData.reply);
    } catch (e) {
        console.error("❌ Groq AI Error:", e.message || e);
    }

    // 2. Test send-critical-alert
    console.log("\n[2/3] Menguji send-critical-alert (Gmail SMTP)...");
    try {
        const { data: alertData, error: alertError } = await supabase.functions.invoke('send-critical-alert', {
            body: {
                formData: {
                    jenis_pelaporan: 'Deposit Card Terblokir (Salah Input PIN 3x)',
                    tanggal_setor: '2026-03-03',
                    kcp_terdekat: 'Cabang Utama',
                    penjelasan: 'Test E2E Integrasi dari Node.js'
                },
                username: 'Apotek Alpro Tester'
            }
        });
        if (alertError) throw alertError;
        console.log("✅ Alert Response:", alertData);
    } catch (e) {
        console.error("❌ Alert Error:", e.message || e);
    }

    // 3. Test upload-to-drive
    console.log("\n[3/3] Menguji upload-to-drive...");
    try {
        // Create a dummy text file to act as a file upload
        const testContent = "Hello from E2E integration test at " + new Date().toISOString();
        const blob = new Blob([testContent], { type: 'text/plain' });

        const formData = new FormData();
        formData.append('file', blob, 'test-integration.txt');

        const uploadRes = await fetch(`${SUPABASE_URL}/functions/v1/upload-to-drive`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            },
            body: formData
        });

        if (!uploadRes.ok) {
            const text = await uploadRes.text();
            throw new Error(`Upload Failed (${uploadRes.status}): ${text}`);
        }

        const driveData = await uploadRes.json();
        console.log("✅ Drive Upload Response:", driveData);
    } catch (e) {
        console.error("❌ Drive Upload Error:", e.message || e);
    }

    console.log("\n=== Pengujian Selesai ===");
}

runTests();

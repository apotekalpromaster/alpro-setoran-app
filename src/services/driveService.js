/**
 * Service to handle Google Drive integrations by calling an Edge Function.
 */
import { supabase } from './supabaseClient'

export async function uploadToDrive(file) {
    try {
        const formData = new FormData()
        formData.append('file', file)

        // Call the edge function handles Google Drive Auth and Upload
        const { data, error } = await supabase.functions.invoke('upload-to-drive', {
            body: formData,
        });

        if (error) throw error;
        return data.url;
    } catch (error) {
        console.error('Upload Error:', error);
        throw new Error('Gagal mengunggah file. ' + error.message);
    }
}

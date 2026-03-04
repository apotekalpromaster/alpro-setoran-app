import { createContext, useContext, useState, useCallback } from 'react';

/**
 * FormWizardContext
 * Pengganti saveTemporaryState / CacheService dari FormHandler.gs.
 * State persists selama session browser (sessionStorage) agar tidak hilang saat back/forward.
 */

const STORAGE_KEY = 'alpro_wizard_state';

const defaultState = {
    // Step 1 fields
    jenisPelaporan: '',
    tanggalPenjualan: '',
    tanggalSetoran: '',
    metodeSetoran: '',
    metodeLain: '',
    tanggalPenjualanTambahan: [],
    // Step 2 fields
    nominalPenjualan: [],    // array, support multi-tanggal
    potonganPenjualan: '',
    nominalSetoran: '',
    penjelasan: '',
    nomorDepositCard: '',
    nomorMesinAtm: '',
    lokasiMesinAtm: '',
    waktuKejadian: '',
    kcpTerdekat: '',
    buktiFiles: [],          // [{file: File, name: string}] - belum diupload
    buktiUrls: [],           // [string] - URL Google Drive setelah upload
};

const loadFromSession = () => {
    try {
        const saved = sessionStorage.getItem(STORAGE_KEY);
        return saved ? { ...defaultState, ...JSON.parse(saved) } : { ...defaultState };
    } catch {
        return { ...defaultState };
    }
};

const FormWizardContext = createContext();

export function FormWizardProvider({ children }) {
    const [formData, setFormData] = useState(loadFromSession);

    /**
     * Update satu atau beberapa field sekaligus.
     * State persists ke sessionStorage secara otomatis.
     */
    const updateField = useCallback((updates) => {
        setFormData((prev) => {
            const next = { ...prev, ...updates };
            try {
                // Simpan semua kecuali buktiFiles (File objects tidak bisa di-serialize)
                const { buktiFiles, ...serializable } = next;
                sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serializable));
            } catch { /* ignore */ }
            return next;
        });
    }, []);

    /** Reset semua ke default (dipanggil setelah submit berhasil) */
    const resetForm = useCallback(() => {
        sessionStorage.removeItem(STORAGE_KEY);
        setFormData({ ...defaultState });
    }, []);

    return (
        <FormWizardContext.Provider value={{ formData, updateField, resetForm }}>
            {children}
        </FormWizardContext.Provider>
    );
}

export const useFormWizard = () => useContext(FormWizardContext);

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';

const NotificationContext = createContext();

export function NotificationProvider({ children }) {
    const { user, profile } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [unreadKoreksiCount, setUnreadKoreksiCount] = useState(0);
    const [unreadTroubleshootingCount, setUnreadTroubleshootingCount] = useState(0);
    const [loading, setLoading] = useState(false);

    const storeCode = profile?.kode_toko || profile?.username || '';
    const userId = user?.id;

    const fetchNotifications = useCallback(async () => {
        if (!userId && !storeCode) return;
        try {
            setLoading(true);
            let query = supabase
                .from('user_notifications')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(50);

            if (userId && storeCode) {
                query = query.or(`user_id.eq.${userId},kode_toko.eq.${storeCode}`);
            } else if (userId) {
                query = query.eq('user_id', userId);
            } else {
                query = query.eq('kode_toko', storeCode);
            }

            const { data, error } = await query;
            if (error) {
                console.warn('Gagal memuat notifikasi:', error.message);
                return;
            }

            const list = data || [];
            setNotifications(list);

            const unread = list.filter(n => !n.is_read);
            setUnreadCount(unread.length);
            setUnreadKoreksiCount(unread.filter(n => n.category === 'koreksi').length);
            setUnreadTroubleshootingCount(unread.filter(n => n.category === 'troubleshooting').length);
        } catch (err) {
            console.error('Error fetching notifications:', err);
        } finally {
            setLoading(false);
        }
    }, [userId, storeCode]);

    // Initial fetch & Real-time subscription
    useEffect(() => {
        if (!userId && !storeCode) return;

        fetchNotifications();

        const channel = supabase
            .channel('public:user_notifications')
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_notifications',
                },
                () => {
                    fetchNotifications();
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [userId, storeCode, fetchNotifications]);

    // Mark single notification as read
    const markAsRead = async (notifId) => {
        try {
            setNotifications(prev =>
                prev.map(n => (n.id === notifId ? { ...n, is_read: true } : n))
            );

            // Recalculate local counts
            setUnreadCount(prev => Math.max(0, prev - 1));

            await supabase
                .from('user_notifications')
                .update({ is_read: true })
                .eq('id', notifId);

            fetchNotifications();
        } catch (err) {
            console.error('Gagal memperbarui status notifikasi:', err);
        }
    };

    // Mark all notifications as read
    const markAllAsRead = async () => {
        try {
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
            setUnreadCount(0);
            setUnreadKoreksiCount(0);
            setUnreadTroubleshootingCount(0);

            let query = supabase.from('user_notifications').update({ is_read: true }).eq('is_read', false);
            if (userId && storeCode) {
                query = query.or(`user_id.eq.${userId},kode_toko.eq.${storeCode}`);
            } else if (userId) {
                query = query.eq('user_id', userId);
            } else {
                query = query.eq('kode_toko', storeCode);
            }

            await query;
            fetchNotifications();
        } catch (err) {
            console.error('Gagal memperbarui semua notifikasi:', err);
        }
    };

    return (
        <NotificationContext.Provider
            value={{
                notifications,
                unreadCount,
                unreadKoreksiCount,
                unreadTroubleshootingCount,
                loading,
                fetchNotifications,
                markAsRead,
                markAllAsRead,
            }}
        >
            {children}
        </NotificationContext.Provider>
    );
}

export function useNotification() {
    return useContext(NotificationContext);
}

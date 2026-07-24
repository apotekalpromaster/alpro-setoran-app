import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useNotification } from '../context/NotificationContext';

export default function NotificationDrawer() {
    const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotification();
    const [isOpen, setIsOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('all'); // 'all', 'koreksi', 'troubleshooting'
    const popoverRef = useRef(null);
    const navigate = useNavigate();

    // Close on click outside
    useEffect(() => {
        function handleClickOutside(event) {
            if (popoverRef.current && !popoverRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        }
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen]);

    const filteredNotifications = notifications.filter(item => {
        if (activeTab === 'koreksi') return item.category === 'koreksi';
        if (activeTab === 'troubleshooting') return item.category === 'troubleshooting';
        return true;
    });

    const formatRelativeTime = (dateStr) => {
        if (!dateStr) return '';
        const now = new Date();
        const past = new Date(dateStr);
        const diffMs = now.getTime() - past.getTime();
        const diffSecs = Math.floor(diffMs / 1000);
        const diffMins = Math.floor(diffSecs / 60);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffSecs < 60) return 'Baru saja';
        if (diffMins < 60) return `${diffMins} menit lalu`;
        if (diffHours < 24) return `${diffHours} jam lalu`;
        if (diffDays === 1) return 'Kemarin';
        return past.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    };

    const handleItemClick = async (item) => {
        if (!item.is_read) {
            await markAsRead(item.id);
        }
        setIsOpen(false);
        if (item.link) {
            navigate(item.link);
        }
    };

    return (
        <div className="relative" ref={popoverRef}>
            {/* Bell Icon Button */}
            <button
                type="button"
                onClick={() => setIsOpen(p => !p)}
                className="relative p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors focus:outline-none cursor-pointer"
                title="Notifikasi"
            >
                <span className="material-symbols-outlined text-2xl">notifications</span>

                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 flex h-4 w-4">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-4 w-4 bg-red-500 text-white text-[9px] font-extrabold items-center justify-center">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    </span>
                )}
            </button>

            {/* Popover Drawer */}
            {isOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    {/* Header */}
                    <div className="p-4 bg-gray-50/80 border-b border-gray-100 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h3 className="font-bold text-gray-800 text-sm">Notifikasi</h3>
                            {unreadCount > 0 && (
                                <span className="bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                    {unreadCount} baru
                                </span>
                            )}
                        </div>

                        {unreadCount > 0 && (
                            <button
                                type="button"
                                onClick={markAllAsRead}
                                className="text-[11px] font-semibold text-primary-600 hover:text-primary-700 hover:underline cursor-pointer"
                            >
                                Tandai semua dibaca
                            </button>
                        )}
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex border-b border-gray-100 bg-white text-xs font-semibold text-gray-500 px-3 pt-2 gap-2">
                        <button
                            type="button"
                            onClick={() => setActiveTab('all')}
                            className={`pb-2 px-2 border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'all'
                                    ? 'border-primary-500 text-primary-600 font-bold'
                                    : 'border-transparent hover:text-gray-700'
                            }`}
                        >
                            Semua ({notifications.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('koreksi')}
                            className={`pb-2 px-2 border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'koreksi'
                                    ? 'border-primary-500 text-primary-600 font-bold'
                                    : 'border-transparent hover:text-gray-700'
                            }`}
                        >
                            Koreksi
                        </button>
                        <button
                            type="button"
                            onClick={() => setActiveTab('troubleshooting')}
                            className={`pb-2 px-2 border-b-2 transition-colors cursor-pointer ${
                                activeTab === 'troubleshooting'
                                    ? 'border-primary-500 text-primary-600 font-bold'
                                    : 'border-transparent hover:text-gray-700'
                            }`}
                        >
                            Troubleshooting
                        </button>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-50 custom-scrollbar">
                        {filteredNotifications.length === 0 ? (
                            <div className="py-8 text-center px-4">
                                <span className="material-symbols-outlined text-3xl text-gray-300 mb-1">
                                    notifications_off
                                </span>
                                <p className="text-xs text-gray-500 font-medium">Tidak ada notifikasi saat ini.</p>
                            </div>
                        ) : (
                            filteredNotifications.map((item) => {
                                const isKoreksi = item.category === 'koreksi';
                                return (
                                    <div
                                        key={item.id}
                                        onClick={() => handleItemClick(item)}
                                        className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer hover:bg-gray-50 ${
                                            !item.is_read ? 'bg-orange-50/40' : 'bg-white'
                                        }`}
                                    >
                                        <div
                                            className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                                                isKoreksi
                                                    ? 'bg-blue-100 text-blue-600'
                                                    : 'bg-amber-100 text-amber-600'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-base">
                                                {isKoreksi ? 'edit_note' : 'troubleshoot'}
                                            </span>
                                        </div>

                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center justify-between gap-1 mb-0.5">
                                                <span className="font-bold text-xs text-gray-800 truncate">
                                                    {item.title}
                                                </span>
                                                <span className="text-[10px] text-gray-400 whitespace-nowrap">
                                                    {formatRelativeTime(item.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-xs text-gray-600 line-clamp-2 leading-relaxed">
                                                {item.message}
                                            </p>
                                        </div>

                                        {!item.is_read && (
                                            <span className="h-2 w-2 rounded-full bg-primary-500 flex-shrink-0 mt-2" />
                                        )}
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

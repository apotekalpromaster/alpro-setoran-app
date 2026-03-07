import { useState, useRef, useEffect } from 'react';
import { sendChatMessages } from '../services/groqService';

export default function AIChatFAB({ role = 'user' }) {
    const [open, setOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);

    // Initial greeting based on role
    useEffect(() => {
        if (messages.length === 0) {
            const greeting = role === 'admin'
                ? 'Halo Admin! Berikan saya data yang ingin dianalisis, atau tanyakan apa saja seputar pelaporan apotek.'
                : 'Halo! Saya Asisten AI Apotek Alpro. Ada yang bisa saya bantu hari ini?';
            setMessages([{ role: 'assistant', content: greeting }]);
        }
    }, [role, messages.length]);

    // Auto-scroll to bottom of chat
    useEffect(() => {
        if (open) {
            messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [messages, open]);

    const handleSend = async (e) => {
        e?.preventDefault();
        if (!input.trim() || loading) return;

        const userMsg = { role: 'user', content: input.trim() };
        const newMessages = [...messages, userMsg];

        setMessages(newMessages);
        setInput('');
        setLoading(true);

        try {
            // Only send the last 10 messages to save context limits
            // System prompt is rigidly handled in the backend edge function
            const contextToSend = [...newMessages.slice(-10)];
            const reply = await sendChatMessages(contextToSend);

            setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
        } catch (err) {
            setMessages((prev) => [...prev, { role: 'assistant', content: '⚠️ ' + err.message }]);
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            {/* Chat window */}
            {open && (
                <div
                    className="fixed bottom-24 right-5 z-50 w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col overflow-hidden animate-slide-in"
                    style={{ height: '480px', maxHeight: '80vh' }}
                >
                    {/* Header */}
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-3 flex items-center justify-between flex-shrink-0 shadow-sm">
                        <div className="flex items-center gap-2">
                            <span className="material-symbols-outlined text-white text-xl">smart_toy</span>
                            <div className="flex flex-col">
                                <span className="text-white font-bold text-sm leading-tight">Asisten AI Alpro</span>
                                <span className="text-purple-100 text-[10px] leading-tight">Powered by Groq</span>
                            </div>
                        </div>
                        <button
                            onClick={() => setOpen(false)}
                            className="text-white/80 hover:text-white transition-colors"
                            aria-label="Tutup chat"
                        >
                            <span className="material-symbols-outlined text-lg">close</span>
                        </button>
                    </div>

                    {/* Messages area */}
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50 custom-scrollbar">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`flex items-start gap-2 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                                {/* Avatar */}
                                <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${msg.role === 'user' ? 'bg-orange-100' : 'bg-purple-100'}`}>
                                    <span className={`material-symbols-outlined text-sm ${msg.role === 'user' ? 'text-orange-600' : 'text-purple-600'}`}>
                                        {msg.role === 'user' ? 'person' : 'smart_toy'}
                                    </span>
                                </div>
                                {/* Bubble */}
                                <div className={`px-3 py-2 text-sm shadow-sm max-w-[80%] whitespace-pre-wrap ${msg.role === 'user'
                                    ? 'bg-primary-500 text-white rounded-2xl rounded-tr-sm'
                                    : 'bg-white border border-gray-200 text-gray-700 rounded-2xl rounded-tl-sm'
                                    }`}>
                                    {msg.content}
                                </div>
                            </div>
                        ))}
                        {loading && (
                            <div className="flex items-start gap-2">
                                <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                                    <span className="material-symbols-outlined text-purple-600 text-sm">smart_toy</span>
                                </div>
                                <div className="bg-white border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm flex items-center gap-1.5 h-10">
                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                                    <div className="w-1.5 h-1.5 bg-purple-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    {/* Input bar */}
                    <form onSubmit={handleSend} className="border-t border-gray-200 p-3 bg-white flex items-center gap-2 flex-shrink-0">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            placeholder="Ketik pesan..."
                            disabled={loading}
                            className="flex-1 text-sm border border-gray-200 rounded-full px-4 py-2 focus:outline-none focus:border-purple-300 focus:ring-2 focus:ring-purple-100 transition-all disabled:opacity-50"
                        />
                        <button
                            type="submit"
                            disabled={!input.trim() || loading}
                            className="h-10 w-10 rounded-full bg-gradient-to-r from-purple-600 to-indigo-600 flex items-center justify-center disabled:opacity-50 hover:shadow-md transition-all flex-shrink-0"
                        >
                            <span className="material-symbols-outlined text-white text-sm" style={{ transform: 'translate(1px, -1px)' }}>send</span>
                        </button>
                    </form>
                </div>
            )}

            {/* FAB button */}
            <button
                onClick={() => setOpen((o) => !o)}
                aria-label="Buka asisten chat"
                className={`
                    fixed bottom-5 right-5 z-50
                    h-14 w-14 rounded-full shadow-lg shadow-purple-500/40
                    bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700
                    flex items-center justify-center
                    transition-all duration-300
                    ${open ? 'rotate-12 scale-95' : 'hover:scale-110'}
                `}
            >
                <span className="material-symbols-outlined text-white text-2xl">
                    {open ? 'close' : 'smart_toy'}
                </span>
            </button>
        </>
    );
}

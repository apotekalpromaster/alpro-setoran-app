import { useState, useRef, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';

/**
 * AutocompleteInput
 * 
 * A reusable search input with Supabase-backed autocomplete dropdown.
 * - Queries fire ONLY when the user has typed >= `minChars` characters (default: 2).
 * - Uses `.ilike()` for case-insensitive partial matching.
 * - Debounced to avoid hammering the database on every keystroke.
 * - Closes the dropdown on outside click.
 *
 * Props:
 *   value        {string}   Controlled value
 *   onChange     {fn}       Called with the new string value
 *   onSelect     {fn}       Called with the selected item object when user clicks a suggestion
 *   table        {string}   Supabase table to query (e.g. 'profiles')
 *   column       {string}   Column to search against (e.g. 'username')
 *   extraFilters {fn}       Optional: fn(query) => query — add extra .eq/.neq/etc. filters
 *   selectColumns{string}   Columns to select, default matches `column`
 *   label        {string}   Input label
 *   placeholder  {string}   Input placeholder
 *   icon         {string}   Material Symbol icon name (default: 'search')
 *   minChars     {number}   Min characters before querying (default: 2)
 *   maxResults   {number}   Max suggestions displayed (default: 6)
 *   renderItem   {fn}       Optional: fn(item) => React node for custom rendering
 *   className    {string}   Extra CSS classes for the wrapper
 *   disabled     {boolean}
 */
export default function AutocompleteInput({
    value = '',
    onChange,
    onSelect,
    table,
    column,
    extraFilters,
    selectColumns,
    label,
    placeholder = 'Ketik untuk mencari...',
    icon = 'search',
    minChars = 2,
    maxResults = 6,
    renderItem,
    className = '',
    disabled = false,
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [activeIdx, setActiveIdx] = useState(-1);
    const wrapperRef = useRef(null);
    const debounceRef = useRef(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handler = (e) => {
            if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
                setSuggestions([]);
                setActiveIdx(-1);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const search = useCallback(async (term) => {
        if (!term || term.length < minChars) {
            setSuggestions([]);
            return;
        }

        setIsLoading(true);
        try {
            let query = supabase
                .from(table)
                .select(selectColumns || column)
                .ilike(column, `%${term}%`)
                .limit(maxResults);

            if (typeof extraFilters === 'function') {
                query = extraFilters(query);
            }

            const { data, error } = await query;
            if (error) throw error;
            setSuggestions(data || []);
        } catch (err) {
            console.error('[AutocompleteInput] Search error:', err.message);
            setSuggestions([]);
        } finally {
            setIsLoading(false);
        }
    }, [table, column, selectColumns, extraFilters, minChars, maxResults]);

    const handleChange = (e) => {
        const val = e.target.value;
        onChange?.(val);
        setActiveIdx(-1);

        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            search(val);
        }, 300);
    };

    const handleSelect = (item) => {
        const displayValue = typeof item === 'object' ? item[column] : item;
        onChange?.(displayValue);
        onSelect?.(item);
        setSuggestions([]);
        setActiveIdx(-1);
    };

    const handleKeyDown = (e) => {
        if (!suggestions.length) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActiveIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActiveIdx((prev) => Math.max(prev - 1, -1));
        } else if (e.key === 'Enter') {
            if (activeIdx >= 0 && suggestions[activeIdx]) {
                e.preventDefault();
                handleSelect(suggestions[activeIdx]);
            }
        } else if (e.key === 'Escape') {
            setSuggestions([]);
            setActiveIdx(-1);
        }
    };

    const handleClear = () => {
        onChange?.('');
        onSelect?.(null);
        setSuggestions([]);
        setActiveIdx(-1);
    };

    const showDropdown = suggestions.length > 0;

    return (
        <div className={`relative ${className}`} ref={wrapperRef}>
            {label && (
                <label className="block text-xs font-medium text-gray-500 mb-1">
                    {label}
                </label>
            )}
            <div className="relative">
                {/* Leading icon */}
                <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none z-10">
                    {isLoading ? (
                        <span className="material-symbols-outlined text-primary-500 text-lg animate-spin">sync</span>
                    ) : (
                        <span className="material-symbols-outlined text-gray-400 text-lg">{icon}</span>
                    )}
                </span>

                <input
                    type="text"
                    value={value}
                    onChange={handleChange}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholder}
                    disabled={disabled}
                    autoComplete="off"
                    className={`form-input pl-10 ${value ? 'pr-9' : ''} ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                />

                {/* Clear button */}
                {value && !disabled && (
                    <button
                        type="button"
                        onClick={handleClear}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
                        tabIndex={-1}
                        aria-label="Hapus pencarian"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                )}
            </div>

            {/* Min chars hint */}
            {value.length > 0 && value.length < minChars && (
                <p className="text-xs text-gray-400 mt-1">
                    Ketik minimal {minChars} huruf untuk memulai pencarian...
                </p>
            )}

            {/* Dropdown */}
            {showDropdown && (
                <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden animate-slide-in">
                    <ul className="max-h-56 overflow-y-auto" role="listbox">
                        {suggestions.map((item, idx) => {
                            const displayValue = typeof item === 'object' ? item[column] : item;
                            return (
                                <li
                                    key={idx}
                                    role="option"
                                    aria-selected={idx === activeIdx}
                                    className={`flex items-center gap-3 px-4 py-2.5 text-sm cursor-pointer transition-colors ${idx === activeIdx
                                            ? 'bg-primary-50 text-primary-700 font-medium'
                                            : 'text-gray-700 hover:bg-gray-50'
                                        }`}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); // prevent input blur before click fires
                                        handleSelect(item);
                                    }}
                                >
                                    <span className="material-symbols-outlined text-base text-gray-300">
                                        {icon}
                                    </span>
                                    {renderItem ? renderItem(item) : (
                                        <span className="truncate">{displayValue}</span>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50">
                        <p className="text-xs text-gray-400">{suggestions.length} hasil ditemukan</p>
                    </div>
                </div>
            )}
        </div>
    );
}

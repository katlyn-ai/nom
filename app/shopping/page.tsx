'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'
import { XIcon, SparklesIcon, ExternalLinkIcon, PlusIcon } from '@/components/icons'

type ShoppingItem = {
  id: string
  name: string
  checked: boolean
  category: string
  added_by: string
  quantity?: string | null
}

type Staple = {
  id: string
  name: string
  notes?: string | null
}

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Drinks', 'Other']

const STORES = [
  { name: 'Barbora', url: 'https://barbora.ee', color: '#E4002B' },
  { name: 'Selver', url: 'https://selver.ee', color: '#008B45' },
  { name: 'Prisma', url: 'https://prismamarket.ee', color: '#004F9F' },
  { name: 'Rimi', url: 'https://rimi.ee', color: '#E4002B' },
]

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [userId, setUserId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)
  const [addingItem, setAddingItem] = useState(false)

  // Staples
  const [staples, setStaples] = useState<Staple[]>([])
  const [showStaples, setShowStaples] = useState(false)
  const [newStaple, setNewStaple] = useState('')
  const [addingStaple, setAddingStaple] = useState(false)
  const [addingAllStaples, setAddingAllStaples] = useState(false)

  // Go Shopping modal
  const [showShopModal, setShowShopModal] = useState(false)
  const [selectedStore, setSelectedStore] = useState<typeof STORES[number] | null>(null)
  const [listCopied, setListCopied] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)

  // Claude in Chrome extension detection
  const [extensionDetected, setExtensionDetected] = useState<boolean | null>(null)
  const EXTENSION_ID = 'pjmhcfonfhabnfbbembbndmgjfhkfjob'
  const EXTENSION_STORE_URL = `https://chromewebstore.google.com/detail/claude/${EXTENSION_ID}`

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const [{ data: itemData }, { data: stapleData }] = await Promise.all([
        supabase.from('shopping_items').select('*').eq('user_id', user.id).order('category'),
        supabase.from('shopping_staples').select('*').eq('user_id', user.id).order('name'),
      ])
      setItems(itemData || [])
      setStaples(stapleData || [])
      setLoading(false)
    }
    load()

    const channel = supabase
      .channel('shopping')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
        if (payload.eventType === 'INSERT') {
          // Deduplicate — item may already be in state from optimistic update
          setItems(prev => prev.some(i => i.id === payload.new.id) ? prev : [...prev, payload.new as ShoppingItem])
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === payload.new.id ? payload.new as ShoppingItem : i))
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  // Detect Claude in Chrome extension
  useEffect(() => {
    const detect = () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cr = (window as any).chrome
        if (!cr?.runtime?.sendMessage) { setExtensionDetected(false); return }
        cr.runtime.sendMessage(EXTENSION_ID, { type: 'ping' }, () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const err = (cr.runtime as any).lastError
          if (err?.message?.includes('not exist') || err?.message?.includes('cannot')) {
            setExtensionDetected(false)
          } else {
            setExtensionDetected(true)
          }
        })
        setTimeout(() => setExtensionDetected(prev => prev === null ? false : prev), 1500)
      } catch {
        setExtensionDetected(false)
      }
    }
    detect()
  }, [])

  const categoriseItem = async (name: string): Promise<string> => {
    try {
      const res = await fetch('/api/categorise-shopping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: [name] }),
      })
      if (res.ok) {
        const json = await res.json()
        return json.categorised?.[0] || 'Other'
      }
    } catch { /* fall back */ }
    return 'Other'
  }

  const addItem = async () => {
    if (!newItem.trim() || !userId || addingItem) return
    setAddingItem(true)
    const name = newItem.trim()
    setNewItem('')

    // Insert with 'Other' first, then update with categorised value
    const { data } = await supabase.from('shopping_items').insert({
      user_id: userId,
      name,
      category: 'Other',
      checked: false,
      added_by: userId,
    }).select().single()

    if (data) {
      // Add immediately so it shows up without waiting for real-time
      setItems(prev => [...prev, data])
      // Auto-categorise in background
      categoriseItem(name).then(category => {
        if (category !== 'Other') {
          supabase.from('shopping_items').update({ category }).eq('id', data.id)
          setItems(prev => prev.map(i => i.id === data.id ? { ...i, category } : i))
        }
      })
    }
    setAddingItem(false)
  }

  const toggleItem = async (id: string, checked: boolean) => {
    await supabase.from('shopping_items').update({ checked: !checked }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))
  }

  const deleteItem = async (id: string) => {
    await supabase.from('shopping_items').delete().eq('id', id)
    setItems(prev => prev.filter(i => i.id !== id))
  }

  const deleteChecked = async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    await supabase.from('shopping_items').delete().in('id', checkedIds)
    setItems(prev => prev.filter(i => !i.checked))
  }

  const generateFromMeals = async () => {
    setGenerating(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setGenerating(false); return }

      const { data: meals, error: mealsError } = await supabase
        .from('meal_plans').select('custom_name').eq('user_id', user.id)

      if (mealsError) {
        alert('Something went wrong loading your meal plan. Please try again.')
        setGenerating(false)
        return
      }

      const mealNames = meals?.map(m => m.custom_name).filter(Boolean) || []
      if (mealNames.length === 0) {
        alert('No meals are planned this week. Go to the Meals page first and generate a meal plan.')
        setGenerating(false)
        return
      }

      const [{ data: settings }, { data: pantryData }] = await Promise.all([
        supabase.from('settings').select('preferred_brands, store_sort_preference, preferred_store').eq('user_id', user.id).single(),
        supabase.from('pantry_items').select('name, quantity').eq('user_id', user.id).eq('in_stock', true),
      ])

      const pantryItems = pantryData?.filter(p => p.name).map(p => ({ name: p.name, quantity: p.quantity || null })) || []

      const res = await fetch('/api/generate-shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mealNames, settings, pantryItems }),
      })
      const data = await res.json()

      if (data.items && data.items.length > 0) {
        for (const item of data.items) {
          const { data: inserted } = await supabase.from('shopping_items').insert({
            user_id: user.id,
            name: item.name,
            category: item.category || 'Other',
            checked: false,
            added_by: user.id,
            quantity: item.quantity || null,
          }).select().single()
          if (inserted) setItems(prev => [...prev, inserted])
        }
      } else {
        alert('Couldn\'t generate a list from your meals. Please try again.')
      }
    } catch (e) {
      console.error('generateFromMeals error:', e)
      alert('Something went wrong generating your list. Please try again.')
    }
    setGenerating(false)
  }

  // ── Staples ───────────────────────────────────────────────────────────────

  const addStaple = async () => {
    if (!newStaple.trim() || !userId || addingStaple) return
    setAddingStaple(true)
    const name = newStaple.trim()
    setNewStaple('')
    const { data } = await supabase.from('shopping_staples').insert({
      user_id: userId,
      name,
    }).select().single()
    if (data) setStaples(prev => [...prev, data])
    setAddingStaple(false)
  }

  const deleteStaple = async (id: string) => {
    await supabase.from('shopping_staples').delete().eq('id', id)
    setStaples(prev => prev.filter(s => s.id !== id))
  }

  const addStapleToList = async (staple: Staple) => {
    if (!userId) return
    const category = await categoriseItem(staple.name)
    const { data } = await supabase.from('shopping_items').insert({
      user_id: userId,
      name: staple.name,
      category,
      checked: false,
      added_by: userId,
    }).select().single()
    if (data) setItems(prev => [...prev, data])
  }

  const addAllStaplesToList = async () => {
    if (!userId || staples.length === 0 || addingAllStaples) return
    setAddingAllStaples(true)
    // Categorise all at once
    try {
      const res = await fetch('/api/categorise-shopping', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: staples.map(s => s.name) }),
      })
      const json = res.ok ? await res.json() : {}
      const categories: string[] = json.categorised || staples.map(() => 'Other')

      for (let i = 0; i < staples.length; i++) {
        const { data } = await supabase.from('shopping_items').insert({
          user_id: userId,
          name: staples[i].name,
          category: categories[i] || 'Other',
          checked: false,
          added_by: userId,
        }).select().single()
        if (data) setItems(prev => [...prev, data])
      }
    } catch { /* silent */ }
    setAddingAllStaples(false)
  }

  // ── Go Shopping ───────────────────────────────────────────────────────────

  const buildListText = () =>
    items.filter(i => !i.checked).map(i => `- ${i.name}${i.quantity ? ` (${i.quantity})` : ''}`).join('\n')

  const buildClaudePrompt = (storeName?: string) => {
    const list = buildListText()
    const storeRef = storeName ? `my ${storeName} cart` : 'my cart on this website'
    return `Please add these items to ${storeRef}, one by one:\n\n${list}\n\nIf I'm not logged in yet, please wait for me to log in first. For each item, search for it, pick the most suitable option, and add it to the cart. If something isn't available, skip it and let me know at the end.`
  }

  const copyList = () => {
    navigator.clipboard.writeText(buildClaudePrompt())
    setListCopied(true)
    setTimeout(() => setListCopied(false), 2500)
  }

  const copyPrompt = (store: typeof STORES[number]) => {
    navigator.clipboard.writeText(buildClaudePrompt(store.name))
    setPromptCopied(true)
    setTimeout(() => setPromptCopied(false), 2500)
  }

  const openStore = (store: typeof STORES[number]) => {
    setSelectedStore(store)
    window.open(store.url, '_blank')
  }

  const closeShopModal = () => {
    setShowShopModal(false)
    setSelectedStore(null)
    setListCopied(false)
    setPromptCopied(false)
  }

  // ─────────────────────────────────────────────────────────────────────────

  const ShoppingRow = ({ item, i, onToggle, onDelete }: {
    item: ShoppingItem; i: number; onToggle: () => void; onDelete: () => void
  }) => {
    const [hovered, setHovered] = useState(false)
    return (
      <div
        className="flex items-center gap-3 px-4 py-3"
        style={{ background: 'var(--card)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      >
        <button
          onClick={onToggle}
          className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
          style={{
            borderColor: item.checked ? 'var(--secondary)' : 'var(--border)',
            background: item.checked ? 'var(--secondary)' : 'transparent',
          }}
        >
          {item.checked && <span className="text-white text-xs">✓</span>}
        </button>
        <span
          className="text-sm flex-1 flex items-center gap-2 min-w-0"
          style={{ color: item.checked ? 'var(--muted)' : 'var(--foreground)', textDecoration: item.checked ? 'line-through' : 'none' }}
        >
          <span className="truncate">{item.name}</span>
          {item.quantity && (
            <span
              className="text-xs px-2 py-0.5 rounded-full flex-shrink-0"
              style={{
                background: item.checked ? 'var(--border)' : 'var(--primary-light)',
                color: item.checked ? 'var(--muted)' : 'var(--primary)',
              }}
            >
              {item.quantity}
            </span>
          )}
        </span>
        <button
          onClick={onDelete}
          title="Remove item"
          style={{ color: 'var(--muted)', opacity: hovered ? 1 : 0.3, transition: 'opacity 0.15s' }}
        >
          <XIcon size={14} />
        </button>
      </div>
    )
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {} as Record<string, ShoppingItem[]>)

  const checkedCount = items.filter(i => i.checked).length
  const uncheckedCount = items.filter(i => !i.checked).length

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-64 px-6 py-8 pb-24 md:pb-8 max-w-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Shopping List</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              {uncheckedCount} items remaining · updates live
            </p>
          </div>
          <button
            onClick={generateFromMeals}
            disabled={generating}
            className="px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
            style={{ background: 'var(--secondary)' }}
          >
            {generating ? '…' : '🍽️ From meals'}
          </button>
        </div>

        {/* Add item — no category chips, auto-categorised */}
        <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <div className="flex gap-2">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add item… (auto-categorised)"
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button
              onClick={addItem}
              disabled={addingItem}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {addingItem ? '…' : 'Add'}
            </button>
          </div>
        </div>

        {/* Weekly Staples */}
        <div className="rounded-2xl mb-6" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          <button
            onClick={() => setShowStaples(s => !s)}
            className="w-full flex items-center justify-between px-4 py-3.5"
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
                📌 Weekly Staples
              </span>
              {staples.length > 0 && (
                <span
                  className="text-xs px-2 py-0.5 rounded-full"
                  style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                >
                  {staples.length}
                </span>
              )}
            </div>
            <span className="text-sm" style={{ color: 'var(--muted)', transform: showStaples ? 'rotate(180deg)' : 'none', display: 'inline-block', transition: 'transform 0.2s' }}>▾</span>
          </button>

          {showStaples && (
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {/* Add staple */}
              <div className="flex gap-2 p-3">
                <input
                  type="text"
                  value={newStaple}
                  onChange={e => setNewStaple(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addStaple()}
                  placeholder="Add weekly staple…"
                  className="flex-1 px-3 py-2 rounded-xl border text-sm outline-none"
                  style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
                />
                <button
                  onClick={addStaple}
                  disabled={addingStaple}
                  className="px-3 py-2 rounded-xl text-white text-sm font-medium disabled:opacity-60 flex items-center gap-1"
                  style={{ background: 'var(--primary)' }}
                >
                  <PlusIcon size={14} />
                </button>
              </div>

              {staples.length === 0 ? (
                <p className="px-4 pb-4 text-sm" style={{ color: 'var(--muted)' }}>
                  No staples yet — add items you buy every week
                </p>
              ) : (
                <>
                  <div>
                    {staples.map((staple, i) => (
                      <div
                        key={staple.id}
                        className="flex items-center gap-3 px-4 py-2.5"
                        style={{ borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                      >
                        <span className="text-sm flex-1" style={{ color: 'var(--foreground)' }}>{staple.name}</span>
                        <button
                          onClick={() => addStapleToList(staple)}
                          className="text-xs px-2.5 py-1 rounded-full font-medium flex-shrink-0"
                          style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}
                        >
                          + Add
                        </button>
                        <button
                          onClick={() => deleteStaple(staple.id)}
                          title="Remove staple"
                          style={{ color: 'var(--muted)', opacity: 0.5 }}
                        >
                          <XIcon size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="p-3" style={{ borderTop: '1px solid var(--border)' }}>
                    <button
                      onClick={addAllStaplesToList}
                      disabled={addingAllStaples}
                      className="w-full py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60"
                      style={{ background: 'var(--gradient-primary)' }}
                    >
                      {addingAllStaples ? 'Adding…' : `Add all ${staples.length} staples to list`}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Items grouped by category */}
        {Object.keys(grouped).length === 0 ? (
          <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
            <p className="text-4xl mb-3">🛒</p>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Your list is empty</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>Add items above or generate from your meal plan</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>{cat}</p>
                <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  {catItems.map((item, i) => (
                    <ShoppingRow
                      key={item.id}
                      item={item}
                      i={i}
                      onToggle={() => toggleItem(item.id, item.checked)}
                      onDelete={() => deleteItem(item.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {checkedCount > 0 && (
          <button
            onClick={deleteChecked}
            className="mt-6 w-full py-3 rounded-xl text-sm font-medium"
            style={{ background: 'var(--border)', color: 'var(--muted)' }}
          >
            Remove {checkedCount} checked item{checkedCount > 1 ? 's' : ''}
          </button>
        )}

        {/* Go Shopping button */}
        {uncheckedCount > 0 && (
          <button
            onClick={() => setShowShopModal(true)}
            className="mt-4 w-full py-4 rounded-2xl text-white font-semibold flex items-center justify-center gap-2 text-sm"
            style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-md)' }}
          >
            🛒 Go Shopping
          </button>
        )}
      </main>

      {/* ── Go Shopping modal ─────────────────────────────────────────────── */}
      {showShopModal && (
        <>
          <div
            className="fixed inset-0 z-40"
            style={{ background: 'rgba(0,0,0,0.5)' }}
            onClick={closeShopModal}
          />
          <div className="fixed inset-x-0 bottom-0 md:inset-0 md:flex md:items-center md:justify-center z-50 pointer-events-none">
            <div
              className="rounded-t-3xl md:rounded-3xl w-full md:max-w-md md:mx-4 flex flex-col pointer-events-auto"
              style={{ background: 'var(--card)', maxHeight: '90vh', boxShadow: '0 -8px 40px rgba(0,0,0,0.15)' }}
            >
              {/* Modal header */}
              <div
                className="px-6 pt-6 pb-4 flex items-center justify-between flex-shrink-0"
                style={{ borderBottom: '1px solid var(--border)' }}
              >
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: 'var(--foreground)', fontFamily: 'var(--font-display)' }}>
                    {selectedStore ? `Shopping at ${selectedStore.name}` : 'Go Shopping'}
                  </h2>
                  <p className="text-sm" style={{ color: 'var(--muted)' }}>
                    {uncheckedCount} item{uncheckedCount !== 1 ? 's' : ''} on your list
                  </p>
                </div>
                <button onClick={closeShopModal} className="p-2 rounded-xl hover:opacity-70" style={{ color: 'var(--muted)' }}>
                  <XIcon size={18} />
                </button>
              </div>

              {/* Modal body */}
              <div className="flex-1 overflow-y-auto px-6 py-5">

                {/* Store picker (shown before and after selecting) */}
                {!selectedStore && (
                  <>
                    {/* Copy list */}
                    <button
                      onClick={copyList}
                      className="w-full py-3 rounded-2xl text-sm font-medium mb-5 flex items-center justify-center gap-2 transition-colors"
                      style={{
                        background: listCopied ? 'var(--primary-light)' : 'var(--background)',
                        color: listCopied ? 'var(--primary)' : 'var(--foreground)',
                        border: `1.5px solid ${listCopied ? 'var(--primary)' : 'var(--border)'}`,
                      }}
                    >
                      {listCopied ? '✓ Prompt copied!' : '✨ Copy Claude prompt for auto-cart'}
                    </button>

                    {/* Store selection */}
                    <p className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--muted)' }}>Choose your store</p>
                    <div className="grid grid-cols-2 gap-3">
                      {STORES.map(store => (
                        <button
                          key={store.name}
                          onClick={() => openStore(store)}
                          className="py-3 rounded-2xl text-white font-semibold text-sm flex items-center justify-center gap-1.5 transition-opacity hover:opacity-90"
                          style={{ background: store.color }}
                        >
                          {store.name}
                          <ExternalLinkIcon size={12} />
                        </button>
                      ))}
                    </div>

                    {/* Shopping list preview */}
                    <p className="text-xs font-medium uppercase tracking-wider mt-5 mb-2" style={{ color: 'var(--muted)' }}>Your list</p>
                    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                      {items.filter(i => !i.checked).map((item, i) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                          style={{ background: 'var(--background)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--border)' }} />
                          <span className="text-sm flex items-center gap-2 flex-1 min-w-0" style={{ color: 'var(--foreground)' }}>
                            <span className="truncate">{item.name}</span>
                            {item.quantity && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                                {item.quantity}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* After store selected */}
                {selectedStore && (
                  <div>
                    <div
                      className="rounded-2xl p-4 mb-4 text-center"
                      style={{ background: selectedStore.color + '15', border: `1.5px solid ${selectedStore.color}40` }}
                    >
                      <p className="font-semibold" style={{ color: selectedStore.color }}>
                        {selectedStore.name} is open in another tab
                      </p>
                      <p className="text-xs mt-1" style={{ color: selectedStore.color + 'CC' }}>
                        Come back here to see your list or use Claude to fill your cart
                      </p>
                    </div>

                    {/* Claude extension */}
                    {extensionDetected === false && (
                      <div className="rounded-2xl p-4 mb-4" style={{ background: '#FFF7ED', border: '1.5px solid #FED7AA' }}>
                        <p className="font-semibold text-sm mb-1" style={{ color: '#C2410C' }}>
                          🧩 Get Claude in Chrome to auto-fill your cart
                        </p>
                        <p className="text-xs mb-3" style={{ color: '#9A3412' }}>
                          The Claude browser extension can add all your items to the cart automatically.
                        </p>
                        <a
                          href={EXTENSION_STORE_URL}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl text-white text-sm font-semibold"
                          style={{ background: '#EA580C' }}
                        >
                          <ExternalLinkIcon size={13} />
                          Install Claude in Chrome — it&apos;s free
                        </a>
                        <button
                          onClick={() => setExtensionDetected(true)}
                          className="w-full mt-2 py-2 text-xs font-medium"
                          style={{ color: '#9A3412' }}
                        >
                          I already have it ↓
                        </button>
                      </div>
                    )}

                    {extensionDetected === true && (
                      <div className="rounded-2xl p-4 mb-4" style={{ background: 'var(--primary-light)', border: '1.5px solid var(--primary)' }}>
                        <p className="font-semibold text-sm mb-1" style={{ color: 'var(--primary)' }}>
                          ✨ Claude is ready to fill your cart
                        </p>
                        <p className="text-xs mb-3" style={{ color: 'var(--primary)' }}>
                          Open Claude in Chrome and paste this prompt:
                        </p>
                        <div
                          className="rounded-xl p-3 mb-3 text-xs font-mono leading-relaxed"
                          style={{ background: 'var(--card)', color: 'var(--foreground)', border: '1px solid var(--border)', whiteSpace: 'pre-wrap' }}
                        >
                          {buildClaudePrompt(selectedStore.name)}
                        </div>
                        <button
                          onClick={() => copyPrompt(selectedStore)}
                          className="w-full py-2.5 rounded-xl text-sm font-semibold"
                          style={{ background: promptCopied ? '#4A7C59' : 'var(--primary)', color: 'white', transition: 'background 0.2s' }}
                        >
                          {promptCopied ? '✓ Copied!' : 'Copy prompt'}
                        </button>
                      </div>
                    )}

                    {/* Shopping list reference */}
                    <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>Your list</p>
                    <div className="rounded-2xl overflow-hidden mb-4" style={{ border: '1px solid var(--border)' }}>
                      {items.filter(i => !i.checked).map((item, i) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 px-4 py-2.5"
                          style={{ background: 'var(--background)', borderTop: i > 0 ? '1px solid var(--border)' : 'none' }}
                        >
                          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--border)' }} />
                          <span className="text-sm flex items-center gap-2 flex-1 min-w-0" style={{ color: 'var(--foreground)' }}>
                            <span className="truncate">{item.name}</span>
                            {item.quantity && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: 'var(--primary-light)', color: 'var(--primary)' }}>
                                {item.quantity}
                              </span>
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={copyList}
                        className="flex-1 py-3 rounded-2xl text-sm font-medium transition-colors"
                        style={{
                          background: listCopied ? 'var(--primary-light)' : 'var(--background)',
                          color: listCopied ? 'var(--primary)' : 'var(--muted)',
                          border: `1px solid ${listCopied ? 'var(--primary)' : 'var(--border)'}`,
                        }}
                      >
                        {listCopied ? '✓ Copied!' : '✨ Copy prompt'}
                      </button>
                      <button
                        onClick={() => window.open(selectedStore.url, '_blank')}
                        className="flex-1 py-3 rounded-2xl text-white text-sm font-medium flex items-center justify-center gap-1.5"
                        style={{ background: selectedStore.color }}
                      >
                        <ExternalLinkIcon size={13} />
                        Reopen {selectedStore.name}
                      </button>
                    </div>

                    <button
                      onClick={() => setSelectedStore(null)}
                      className="w-full mt-2 py-2 text-xs font-medium"
                      style={{ color: 'var(--muted)' }}
                    >
                      ← Choose a different store
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import Nav from '@/components/nav'

type ShoppingItem = {
  id: string
  name: string
  checked: boolean
  category: string
  added_by: string
}

const CATEGORIES = ['Produce', 'Dairy', 'Meat', 'Pantry', 'Frozen', 'Drinks', 'Other']

export default function ShoppingPage() {
  const [items, setItems] = useState<ShoppingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [newItem, setNewItem] = useState('')
  const [category, setCategory] = useState('Other')
  const [userId, setUserId] = useState<string | null>(null)
  const [generating, setGenerating] = useState(false)

  const supabase = createClient()

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)
      const { data } = await supabase
        .from('shopping_items')
        .select('*')
        .eq('user_id', user.id)
        .order('category')
      setItems(data || [])
      setLoading(false)
    }
    load()

    // Real-time updates for shared list
    const channel = supabase
      .channel('shopping')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
        if (payload.eventType === 'INSERT') {
          setItems(prev => [...prev, payload.new as ShoppingItem])
        } else if (payload.eventType === 'UPDATE') {
          setItems(prev => prev.map(i => i.id === payload.new.id ? payload.new as ShoppingItem : i))
        } else if (payload.eventType === 'DELETE') {
          setItems(prev => prev.filter(i => i.id !== payload.old.id))
        }
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const addItem = async () => {
    if (!newItem.trim() || !userId) return
    const { data } = await supabase.from('shopping_items').insert({
      user_id: userId,
      name: newItem.trim(),
      category,
      checked: false,
      added_by: userId,
    }).select().single()
    if (data) {
      setItems(prev => [...prev, data])
      setNewItem('')
    }
  }

  const toggleItem = async (id: string, checked: boolean) => {
    await supabase.from('shopping_items').update({ checked: !checked }).eq('id', id)
    setItems(prev => prev.map(i => i.id === id ? { ...i, checked: !checked } : i))
  }

  const deleteChecked = async () => {
    const checkedIds = items.filter(i => i.checked).map(i => i.id)
    await supabase.from('shopping_items').delete().in('id', checkedIds)
    setItems(prev => prev.filter(i => !i.checked))
  }

  const generateFromMeals = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/generate-shopping-list', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      const data = await res.json()
      if (data.items) {
        for (const item of data.items) {
          const { data: inserted } = await supabase.from('shopping_items').insert({
            user_id: userId,
            name: item.name,
            category: item.category || 'Other',
            checked: false,
            added_by: userId,
          }).select().single()
          if (inserted) setItems(prev => [...prev, inserted])
        }
      }
    } catch (e) {
      console.error(e)
    }
    setGenerating(false)
  }

  const grouped = CATEGORIES.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat)
    if (catItems.length > 0) acc[cat] = catItems
    return acc
  }, {} as Record<string, ShoppingItem[]>)

  const checkedCount = items.filter(i => i.checked).length

  if (loading) return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--background)' }}>
      <Nav />
      <main className="md:ml-60 px-6 py-8 pb-24 md:pb-8 max-w-2xl">
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>Shopping List</h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              {items.length - checkedCount} items remaining · updates live
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

        {/* Add item */}
        <div
          className="rounded-2xl p-4 mb-6"
          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
        >
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              value={newItem}
              onChange={e => setNewItem(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addItem()}
              placeholder="Add item…"
              className="flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none"
              style={{ borderColor: 'var(--border)', background: 'var(--background)', color: 'var(--foreground)' }}
            />
            <button
              onClick={addItem}
              className="px-4 py-2.5 rounded-xl text-white text-sm font-medium"
              style={{ background: 'var(--primary)' }}
            >
              Add
            </button>
          </div>
          <div className="flex gap-2 flex-wrap">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategory(cat)}
                className="text-xs px-2.5 py-1 rounded-full font-medium transition-colors"
                style={{
                  background: category === cat ? 'var(--primary)' : 'var(--border)',
                  color: category === cat ? 'white' : 'var(--muted)',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Items grouped by category */}
        {Object.keys(grouped).length === 0 ? (
          <div
            className="rounded-2xl p-10 text-center"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <p className="text-4xl mb-3">🛒</p>
            <p className="font-medium mb-1" style={{ color: 'var(--foreground)' }}>Your list is empty</p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Add items above or generate from your meal plan
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <p className="text-xs font-medium uppercase tracking-wider mb-2" style={{ color: 'var(--muted)' }}>
                  {cat}
                </p>
                <div
                  className="rounded-2xl overflow-hidden"
                  style={{ border: '1px solid var(--border)' }}
                >
                  {catItems.map((item, i) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3"
                      style={{
                        background: 'var(--card)',
                        borderTop: i > 0 ? '1px solid var(--border)' : 'none',
                      }}
                    >
                      <button
                        onClick={() => toggleItem(item.id, item.checked)}
                        className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                        style={{
                          borderColor: item.checked ? 'var(--secondary)' : 'var(--border)',
                          background: item.checked ? 'var(--secondary)' : 'transparent',
                        }}
                      >
                        {item.checked && <span className="text-white text-xs">✓</span>}
                      </button>
                      <span
                        className="text-sm flex-1"
                        style={{
                          color: item.checked ? 'var(--muted)' : 'var(--foreground)',
                          textDecoration: item.checked ? 'line-through' : 'none',
                        }}
                      >
                        {item.name}
                      </span>
                    </div>
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
      </main>
    </div>
  )
}

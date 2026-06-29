import React, { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://pzuqxfmakmpjdfwpwrfa.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB6dXF4Zm1ha21wamRmd3B3cmZhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3MTM5NTksImV4cCI6MjA5ODI4OTk1OX0.GMcd2wu0vX1t2pWr_Cvxa330PYWCkj9ZQUrLZ0Vka3k'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

export default function App() {
  const [activeTab, setActiveTab] = useState('NE')
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [lastUpdated, setLastUpdated] = useState(null)
  const [uploadMsg, setUploadMsg] = useState('')

  useEffect(() => {
    fetchItems()
  }, [])

  async function fetchItems() {
    setLoading(true)
    const { data, error } = await supabase
      .from('stock_items')
      .select('*')
      .order('itemcode')
    if (!error && data) {
      setItems(data)
      if (data.length > 0) {
        const dates = data.map(d => new Date(d.last_updated))
        setLastUpdated(new Date(Math.max(...dates)))
      }
    }
    setLoading(false)
  }

  async function handleFile(e) {
    const file = e.target.files[0]
    if (!file) return
    setUploading(true)
    setUploadMsg('عم بقرأ الملف...')

    const reader = new FileReader()
    reader.onload = async (evt) => {
      try {
        const wb = XLSX.read(evt.target.result, { type: 'binary' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })

        // Find header row
        let headerRow = -1
        let headers = []
        for (let i = 0; i < rows.length; i++) {
          const row = rows[i].map(c => String(c || '').trim().toUpperCase())
          if (row.some(c => c.includes('ITEMCODE') || c.includes('ITEM CODE'))) {
            headerRow = i
            headers = rows[i].map(c => String(c || '').trim().toUpperCase())
            break
          }
        }

        if (headerRow === -1) {
          setUploadMsg('❌ ما لقيت column اسمه Itemcode!')
          setUploading(false)
          return
        }

        const idxCode = headers.findIndex(h => h.includes('ITEMCODE') || h.includes('ITEM CODE'))
        const idxDesc = headers.findIndex(h => h.includes('DESCRIPTION') || h.includes('DESC'))
        const idxQty  = headers.findIndex(h => h.includes('ON HAND') || h.includes('QTY') || h.includes('QUANTITY'))
        const idxSheets = headers.findIndex(h => h.includes('SHEET'))
        const idxCat  = headers.findIndex(h => h.includes('CATEGORY') || h.includes('CAT'))

        const parsed = []
        for (let i = headerRow + 1; i < rows.length; i++) {
          const row = rows[i]
          const code = String(row[idxCode] || '').trim()
          if (!code) continue

          const upperCode = code.toUpperCase()
          if (!upperCode.startsWith('NE-') && !upperCode.startsWith('AB-')) continue
          if (upperCode.includes('CHIPBOARD')) continue

          const brand = upperCode.startsWith('NE-') ? 'NE' : 'AB'

          parsed.push({
            itemcode: code,
            description: idxDesc >= 0 ? String(row[idxDesc] || '').trim() : '',
            qty: idxQty >= 0 ? (parseFloat(row[idxQty]) || 0) : 0,
            sheets: idxSheets >= 0 ? String(row[idxSheets] || '').trim() : '',
            brand,
            category: idxCat >= 0 ? String(row[idxCat] || '').trim() : '',
            last_updated: new Date().toISOString(),
          })
        }

        setUploadMsg(`عم بحفظ ${parsed.length} item...`)

        // Upsert in batches
        const batchSize = 100
        for (let i = 0; i < parsed.length; i += batchSize) {
          const batch = parsed.slice(i, i + batchSize)
          const { error } = await supabase
            .from('stock_items')
            .upsert(batch, { onConflict: 'itemcode' })
          if (error) {
            console.error(error)
            setUploadMsg('❌ خطأ بالحفظ: ' + error.message)
            setUploading(false)
            return
          }
        }

        setUploadMsg(`✅ تم رفع ${parsed.length} item بنجاح!`)
        await fetchItems()
      } catch (err) {
        setUploadMsg('❌ خطأ: ' + err.message)
      }
      setUploading(false)
    }
    reader.readAsBinaryString(file)
  }

  const filtered = items.filter(item => {
    if (item.brand !== activeTab) return false
    if (search) {
      const s = search.toLowerCase()
      return item.itemcode.toLowerCase().includes(s) ||
             (item.description || '').toLowerCase().includes(s)
    }
    return true
  })

  const stats = {
    total: filtered.length,
    inStock: filtered.filter(i => i.qty > 0).length,
    zero: filtered.filter(i => i.qty === 0).length,
    negative: filtered.filter(i => i.qty < 0).length,
  }

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', minHeight: '100vh', background: '#f0f4f8' }}>
      {/* Header */}
      <div style={{ background: '#1F4E79', color: 'white', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 'bold' }}>📦 MDCC Stock Tracker</h1>
          {lastUpdated && (
            <div style={{ fontSize: 12, opacity: 0.8, marginTop: 4 }}>
              آخر تحديث: {lastUpdated.toLocaleString('ar')}
            </div>
          )}
        </div>
        <label style={{
          background: '#2E75B6', color: 'white', padding: '10px 20px',
          borderRadius: 8, cursor: uploading ? 'wait' : 'pointer',
          fontWeight: 'bold', fontSize: 14, border: 'none',
          opacity: uploading ? 0.7 : 1
        }}>
          {uploading ? '⏳ جاري الرفع...' : '📤 رفع Excel'}
          <input type="file" accept=".xlsx,.xls" onChange={handleFile}
            style={{ display: 'none' }} disabled={uploading} />
        </label>
      </div>

      {uploadMsg && (
        <div style={{
          background: uploadMsg.includes('❌') ? '#fee2e2' : '#dcfce7',
          color: uploadMsg.includes('❌') ? '#991b1b' : '#166534',
          padding: '10px 24px', fontSize: 14, fontWeight: 'bold'
        }}>
          {uploadMsg}
        </div>
      )}

      <div style={{ padding: '20px 24px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          {['NE', 'AB'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{
              padding: '10px 28px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontWeight: 'bold', fontSize: 15,
              background: activeTab === tab ? '#1F4E79' : '#e2e8f0',
              color: activeTab === tab ? 'white' : '#374151',
              transition: 'all 0.2s'
            }}>
              {tab === 'NE' ? '🟦 Neropan (NE)' : '🟥 Abet (AB)'}
            </button>
          ))}
        </div>

        {/* Stats */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
          {[
            { label: 'إجمالي Items', value: stats.total, color: '#1F4E79', bg: '#dbeafe' },
            { label: 'موجود بالمخزن', value: stats.inStock, color: '#166534', bg: '#dcfce7' },
            { label: 'صفر', value: stats.zero, color: '#92400e', bg: '#fef3c7' },
            { label: 'سالب ⚠️', value: stats.negative, color: '#991b1b', bg: '#fee2e2' },
          ].map(s => (
            <div key={s.label} style={{
              background: s.bg, borderRadius: 10, padding: '12px 20px',
              minWidth: 120, textAlign: 'center'
            }}>
              <div style={{ fontSize: 24, fontWeight: 'bold', color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: s.color, marginTop: 2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Search */}
        <input
          placeholder="🔍 ابحث بالكود أو الاسم..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 8,
            border: '1px solid #cbd5e1', fontSize: 14, marginBottom: 16,
            boxSizing: 'border-box'
          }}
        />

        {/* Table */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>⏳ جاري التحميل...</div>
        ) : (
          <div style={{ overflowX: 'auto', borderRadius: 10, boxShadow: '0 1px 4px rgba(0,0,0,0.1)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white' }}>
              <thead>
                <tr style={{ background: '#1F4E79', color: 'white' }}>
                  <th style={thStyle}>#</th>
                  <th style={thStyle}>Item Code</th>
                  <th style={thStyle}>Description</th>
                  <th style={thStyle}>On Hand Qty</th>
                  <th style={thStyle}>Sheets</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: 30, color: '#94a3b8' }}>
                      {items.length === 0 ? '📂 ارفع Excel لتشوف الـ stock' : 'لا يوجد نتائج'}
                    </td>
                  </tr>
                ) : filtered.map((item, idx) => (
                  <tr key={item.id} style={{ background: idx % 2 === 0 ? 'white' : '#f8fafc' }}>
                    <td style={tdStyle}>{idx + 1}</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', color: '#1e40af' }}>{item.itemcode}</td>
                    <td style={tdStyle}>{item.description}</td>
                    <td style={{
                      ...tdStyle, textAlign: 'center', fontWeight: 'bold',
                      color: item.qty > 0 ? '#166534' : item.qty < 0 ? '#991b1b' : '#92400e'
                    }}>
                      {item.qty}
                    </td>
                    <td style={{ ...tdStyle, color: '#64748b', fontSize: 13 }}>{item.sheets || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

const thStyle = {
  padding: '12px 14px', textAlign: 'left', fontSize: 13,
  fontWeight: 'bold', whiteSpace: 'nowrap'
}
const tdStyle = {
  padding: '10px 14px', fontSize: 13,
  borderBottom: '1px solid #e2e8f0'
}

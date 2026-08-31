import { Component, createRef } from 'react'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import InvoicePreview from './InvoicePreview'
import {
  pad3,
  fmtINR,
  shortDate,
  iso,
  parseISO,
  fmtDMY,
  resolveTenure,
  LS,
  loadCounter,
  loadLast,
  MAX_ITEMS,
  makeItem,
  sanitizeMode,
  itemsFromLast,
  sumItems,
} from './utils'
import { cachedClients, fetchClients, saveClients } from './clientsApi'
import PeriodPicker from './PeriodPicker'

const AUTO_INCREMENT = true
const DEFAULT_DESCRIPTION = 'Software Consulting Charges'
const DEFAULT_PRICE = 183333

export default class App extends Component {
  constructor(props) {
    super(props)
    const clients = cachedClients()
    const counter = loadCounter()
    const last = loadLast()
    const loaded =
      last.loadedId != null
        ? clients.find((c) => c.id === last.loadedId)
        : clients.length
          ? clients[clients.length - 1]
          : null
    this.state = {
      step: 1,
      clients,
      loadedId: loaded ? loaded.id : null,
      clientName: loaded ? loaded.name : '',
      clientAddress: loaded ? loaded.address : '',
      clientQuery: '',
      invNo: counter + 1,
      invDate: iso(new Date()),
      tenureMode: sanitizeMode(last.tenureMode, last.customStart, last.customEnd),
      customStart: last.customStart || '',
      customEnd: last.customEnd || '',
      items: itemsFromLast(last, DEFAULT_DESCRIPTION, DEFAULT_PRICE),
      fitScale: 0.45,
      narrow: typeof window !== 'undefined' && window.innerWidth < 640,
      overflowPx: 0,
      toast: null,
    }
    this.invRef = createRef()
  }

  componentDidMount() {
    // pull the shared client list from the server, reconcile local edits
    fetchClients().then(({ clients, ok }) => {
      if (!ok) return
      this.setState((s) => {
        const stillThere = s.loadedId != null && clients.some((c) => c.id === s.loadedId)
        // don't clobber a name the user is mid-typing for a brand-new client
        const typingNew = s.loadedId == null && s.clientName.trim()
        return { clients, loadedId: stillThere ? s.loadedId : typingNew ? null : s.loadedId }
      })
    })

    this.fit = () => {
      const s = Math.min(
        (window.innerHeight - 190) / 1123,
        (window.innerWidth - 40) / 794,
        0.85
      )
      this.setState({ fitScale: Math.max(0.25, s), narrow: window.innerWidth < 640 })
    }
    window.addEventListener('resize', this.fit)
    this.fit()
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.fit)
    if (this.toastT) clearTimeout(this.toastT)
  }

  componentDidUpdate() {
    // A4 is a fixed box: if the rows push past it the PDF would silently clip.
    // scrollHeight is a layout value, so the preview's scale() doesn't skew it.
    const node = this.invRef.current
    if (this.state.step === 3 && node) {
      const over = Math.max(0, node.scrollHeight - node.clientHeight)
      if (over !== this.state.overflowPx) this.setState({ overflowPx: over })
    }

    const { loadedId, tenureMode, customStart, customEnd, items } = this.state
    try {
      localStorage.setItem(
        LS.last,
        JSON.stringify({ loadedId, tenureMode, customStart, customEnd, items })
      )
    } catch {
      /* ignore */
    }
  }

  showToast(msg) {
    this.setState({ toast: msg })
    if (this.toastT) clearTimeout(this.toastT)
    this.toastT = setTimeout(() => this.setState({ toast: null }), 2600)
  }

  persistClients(clients) {
    this.setState({ clients })
    saveClients(clients).then((ok) => {
      if (!ok) this.showToast('Saved on this device — cloud sync failed')
    })
  }

  updateItem = (id, patch) => {
    this.setState((s) => ({
      items: s.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }))
  }

  addItem = () => {
    if (this.state.items.length >= MAX_ITEMS) {
      this.showToast('One A4 page fits ' + MAX_ITEMS + ' items')
      return
    }
    this.setState((s) => ({ items: [...s.items, makeItem()] }))
  }

  // the invoice always keeps at least one item
  removeItem = (id) => {
    this.setState((s) =>
      s.items.length > 1 ? { items: s.items.filter((it) => it.id !== id) } : null
    )
  }

  // save current client without moving on — for building up the client list
  saveAndAddAnother = () => {
    if (!this.state.clientName.trim()) {
      this.showToast('Enter a client name first')
      return
    }
    this.syncClient()
    this.setState({ loadedId: null, clientName: '', clientAddress: '' })
  }

  syncClient() {
    const s = this.state
    const name = s.clientName.trim()
    if (!name) return
    if (s.loadedId != null && s.clients.some((c) => c.id === s.loadedId)) {
      const cur = s.clients.find((c) => c.id === s.loadedId)
      if (cur.name !== name || cur.address !== s.clientAddress) {
        this.persistClients(
          s.clients.map((c) =>
            c.id === s.loadedId ? { ...c, name, address: s.clientAddress } : c
          )
        )
        this.showToast('Client updated')
      }
    } else {
      const id = Date.now()
      this.persistClients([...s.clients, { id, name, address: s.clientAddress }])
      this.setState({ loadedId: id })
      this.showToast('Saved "' + name + '"')
    }
  }

  download = async () => {
    const { clientName, invNo } = this.state
    if (!clientName.trim()) {
      this.showToast('Add a client name in step 1')
      return
    }
    const { items } = this.state
    if (!items.length) {
      this.showToast('Add at least one item in step 2')
      return
    }
    const blank = items.findIndex((it) => !it.description.trim())
    if (blank >= 0) {
      this.showToast('Item ' + (blank + 1) + ' needs a description')
      return
    }
    const invoiceP = resolveTenure(this.state.tenureMode, this.state.customStart, this.state.customEnd)
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      const p =
        it.tenureMode == null ? invoiceP : resolveTenure(it.tenureMode, it.customStart, it.customEnd)
      if (!p.start || !p.end) {
        this.showToast(
          it.tenureMode == null
            ? 'Pick the custom billing dates in step 2'
            : 'Pick the custom dates for item ' + (i + 1)
        )
        return
      }
    }
    const node = this.invRef.current
    if (!node) {
      this.showToast('PDF engine still loading — try again')
      return
    }
    if (node.scrollHeight - node.clientHeight > 2) {
      this.showToast('Too long for one A4 page — shorten a description or remove an item')
      return
    }
    try {
      const prev = node.style.transform
      node.style.transform = 'none'
      const canvas = await html2canvas(node, { scale: 3, useCORS: true, backgroundColor: '#ffffff' })
      node.style.transform = prev
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 210, 297)
      pdf.save('Invoice-' + pad3(invNo) + '-' + clientName.trim().replace(/[^\w-]+/g, '-') + '.pdf')
      try {
        localStorage.setItem(LS.counter, String(invNo))
      } catch {
        /* ignore */
      }
      if (AUTO_INCREMENT) this.setState({ invNo: invNo + 1 })
      this.showToast('Invoice #' + pad3(invNo) + ' downloaded')
    } catch (e) {
      this.showToast('PDF failed: ' + e.message)
    }
  }

  render() {
    const s = this.state
    const { start, end } = resolveTenure(s.tenureMode, s.customStart, s.customEnd)
    const periodLabel = (p) =>
      p.start && p.end ? shortDate(p.start) + ' - ' + shortDate(p.end) : 'Pick dates'
    const tenureLabel = periodLabel({ start, end })
    // one view row per item, with its period inherited from the invoice unless overridden
    const itemViews = s.items.map((it) => {
      const p =
        it.tenureMode == null ? { start, end } : resolveTenure(it.tenureMode, it.customStart, it.customEnd)
      return {
        id: it.id,
        description: it.description.trim() || '—',
        tenureLabel: periodLabel(p),
        amountFmt: fmtINR(it.price),
      }
    })
    const invD = parseISO(s.invDate) || new Date()
    const invDateFmt = fmtDMY(invD)
    const hasName = !!s.clientName.trim()
    const totalFmt = fmtINR(sumItems(s.items))
    const invNoPad = pad3(s.invNo)
    const nextDisabled = s.step === 1 && !hasName
    const q = s.clientQuery.trim().toLowerCase()
    const filtered = q
      ? s.clients.filter((c) => (c.name + ' ' + (c.address || '')).toLowerCase().includes(q))
      : s.clients
    const scaledW = Math.round(794 * s.fitScale)
    const scaledH = Math.round(1123 * s.fitScale)

    const steps = [
      [1, 'Client'],
      [2, 'Details'],
      [3, 'Review'],
    ].map(([n, label]) => {
      const active = s.step === n
      const done = s.step > n
      return {
        n,
        label,
        dotBg: active || done ? '#3d3833' : 'transparent',
        dotColor: active || done ? '#f6f1e8' : '#a89a83',
        dotBorder: active || done ? '#3d3833' : '#cbc0ae',
        labelColor: active ? '#3d3833' : '#a89a83',
        weight: active ? 600 : 400,
        go: () => {
          if (n < s.step || hasName) {
            if (s.step === 1 && n > 1) this.syncClient()
            this.setState({ step: n })
          }
        },
      }
    })

    return (
      <div style={{ height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* header: step nav */}
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: s.narrow ? '14px 16px' : '18px 32px',
          }}
        >
          <button
            className="nav-back"
            onClick={() => this.setState({ step: 1 })}
            title="Back to start"
            style={{
              flex: 'none',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              padding: 0,
              textAlign: 'left',
            }}
          >
            Invoice <span style={{ fontWeight: 400, color: '#8a7c6b' }}>#{invNoPad}</span>
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
            {steps.map((st) => (
              <button
                key={st.n}
                onClick={st.go}
                title={st.label}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: s.narrow ? '6px 6px' : '6px 14px',
                }}
              >
                <span
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    flex: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 600,
                    background: st.dotBg,
                    color: st.dotColor,
                    border: '1.5px solid ' + st.dotBorder,
                  }}
                >
                  {st.n}
                </span>
                {!s.narrow && (
                  <span style={{ fontSize: 13, color: st.labelColor, fontWeight: st.weight }}>
                    {st.label}
                  </span>
                )}
              </button>
            ))}
          </div>
          {!s.narrow && <div style={{ width: 110 }} />}
        </div>

        {/* STEP 1 — Client */}
        {s.step === 1 && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'stepIn 0.2s ease' }}>
            <div
              style={{
                maxWidth: 560,
                margin: '0 auto',
                padding: '24px 24px 40px',
                display: 'flex',
                flexDirection: 'column',
                gap: 22,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>Who is this invoice for?</div>
                <div style={{ fontSize: 13, color: '#8a7c6b', marginTop: 4 }}>
                  Pick a saved client, or type a new one below.
                </div>
              </div>

              {s.clients.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input
                    value={s.clientQuery}
                    onChange={(e) => this.setState({ clientQuery: e.target.value })}
                    placeholder={
                      'Search ' + s.clients.length + ' client' + (s.clients.length > 1 ? 's' : '') + '…'
                    }
                    style={{ ...inp, fontSize: 13.5 }}
                  />
                  {filtered.length === 0 && (
                    <div style={{ fontSize: 13, color: '#a89a83', padding: '6px 2px' }}>
                      No clients match “{s.clientQuery.trim()}”.
                    </div>
                  )}
                  {filtered.map((c) => {
                    const sel = c.id === s.loadedId && s.clientName === c.name
                    return (
                      <div
                        key={c.id}
                        className="client-card"
                        onClick={() =>
                          this.setState({
                            loadedId: c.id,
                            clientName: c.name,
                            clientAddress: c.address,
                            step: 2,
                          })
                        }
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 14,
                          background: '#fff',
                          border: '2px solid ' + (sel ? '#3d3833' : '#e9e2d4'),
                          borderRadius: 12,
                          padding: '14px 16px',
                          cursor: 'pointer',
                        }}
                      >
                        <span
                          style={{
                            width: 20,
                            height: 20,
                            borderRadius: '50%',
                            flex: 'none',
                            border: '2px solid ' + (sel ? '#3d3833' : '#cbc0ae'),
                            background: sel ? '#3d3833' : '#fff',
                            boxShadow: sel ? 'inset 0 0 0 3px #fff' : 'none',
                          }}
                        />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 14, fontWeight: 600 }}>{c.name}</div>
                          <div
                            style={{
                              fontSize: 12,
                              color: '#8a7c6b',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                            }}
                          >
                            {(c.address || '').replace(/\n/g, ', ') || '—'}
                          </div>
                        </div>
                        <button
                          className="del-btn"
                          onClick={(e) => {
                            e.stopPropagation()
                            this.persistClients(s.clients.filter((x) => x.id !== c.id))
                            if (s.loadedId === c.id)
                              this.setState({ loadedId: null, clientName: '', clientAddress: '' })
                          }}
                          style={{
                            width: 26,
                            height: 26,
                            flex: 'none',
                            border: 'none',
                            borderRadius: '50%',
                            background: 'transparent',
                            color: '#b3a291',
                            fontSize: 15,
                            cursor: 'pointer',
                            lineHeight: 1,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}

              <div
                style={{
                  background: '#fff',
                  border: '2px solid ' + (s.loadedId == null && hasName ? '#3d3833' : '#e9e2d4'),
                  borderRadius: 12,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: 0.8, color: '#8a7c6b' }}>
                  {s.loadedId != null ? 'EDIT SELECTED CLIENT' : 'NEW CLIENT'}
                </div>
                <input
                  value={s.clientName}
                  onChange={(e) => this.setState({ clientName: e.target.value })}
                  placeholder="Client name"
                  style={inp}
                />
                <textarea
                  value={s.clientAddress}
                  onChange={(e) => this.setState({ clientAddress: e.target.value })}
                  placeholder="Address — one line per row"
                  rows={3}
                  style={{ ...inp, fontSize: 13.5, resize: 'vertical' }}
                />
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <span style={{ fontSize: 11.5, color: '#a89a83' }}>
                    Saved to all your devices. Continue also saves.
                  </span>
                  <button
                    className="nav-back"
                    onClick={this.saveAndAddAnother}
                    disabled={!hasName}
                    style={{
                      flex: 'none',
                      border: '1px solid #ddd4c4',
                      borderRadius: 9,
                      background: '#fff',
                      color: '#3d3833',
                      fontSize: 12.5,
                      fontWeight: 600,
                      padding: '9px 14px',
                      cursor: hasName ? 'pointer' : 'default',
                      opacity: hasName ? 1 : 0.45,
                    }}
                  >
                    {s.loadedId != null ? 'Save changes + add another' : 'Save + add another'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 2 — Details */}
        {s.step === 2 && (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', animation: 'stepIn 0.2s ease' }}>
            <div
              style={{
                maxWidth: 560,
                margin: '0 auto',
                padding: '24px 24px 40px',
                display: 'flex',
                flexDirection: 'column',
                gap: 22,
              }}
            >
              <div>
                <div style={{ fontSize: 22, fontWeight: 600 }}>Invoice details</div>
                <div style={{ fontSize: 13, color: '#8a7c6b', marginTop: 4 }}>
                  Everything is pre-filled — change only what's different this time.
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: s.narrow ? '1fr' : '1fr 1fr', gap: 14 }}>
                <div style={card}>
                  <label style={lbl}>Invoice number</label>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'stretch',
                      border: '1px solid #ddd4c4',
                      borderRadius: 9,
                      overflow: 'hidden',
                      background: '#fdfcfa',
                    }}
                  >
                    <button
                      className="step-btn"
                      onClick={() => this.setState({ invNo: Math.max(1, s.invNo - 1) })}
                      style={{ width: 38, border: 'none', background: 'transparent', fontSize: 17, cursor: 'pointer', color: '#8a7c6b' }}
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={s.invNo}
                      onChange={(e) => this.setState({ invNo: Math.max(1, parseInt(e.target.value, 10) || 1) })}
                      style={{
                        flex: 1,
                        width: 40,
                        border: 'none',
                        textAlign: 'center',
                        fontSize: 14,
                        padding: '10px 0',
                        fontVariantNumeric: 'tabular-nums',
                        background: 'transparent',
                      }}
                    />
                    <button
                      className="step-btn"
                      onClick={() => this.setState({ invNo: s.invNo + 1 })}
                      style={{ width: 38, border: 'none', background: 'transparent', fontSize: 16, cursor: 'pointer', color: '#8a7c6b' }}
                    >
                      +
                    </button>
                  </div>
                </div>
                <div style={card}>
                  <label style={lbl}>Invoice date</label>
                  <input
                    type="date"
                    value={s.invDate}
                    onChange={(e) => this.setState({ invDate: e.target.value })}
                    style={{ ...inp, fontSize: 13.5 }}
                  />
                </div>
              </div>

              <div style={{ ...card, gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <label style={lbl}>Billing period</label>
                  <span style={{ fontSize: 12, color: '#a89a83', fontVariantNumeric: 'tabular-nums' }}>
                    {tenureLabel}
                  </span>
                </div>
                <PeriodPicker
                  mode={s.tenureMode}
                  customStart={s.customStart}
                  customEnd={s.customEnd}
                  onChange={(patch) => this.setState(patch)}
                />
                <div style={{ fontSize: 11.5, color: '#a89a83' }}>
                  Every item uses this period unless it sets its own.
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                  <label style={lbl}>Items</label>
                  <span style={{ fontSize: 12, color: '#a89a83' }}>
                    {s.items.length} of {MAX_ITEMS}
                  </span>
                </div>

                {s.items.map((it, i) => {
                  const own = it.tenureMode != null
                  return (
                    <div key={it.id} style={{ ...card, gap: 10 }}>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <span style={{ ...lbl, letterSpacing: 0.8 }}>ITEM {i + 1}</span>
                        {s.items.length > 1 && (
                          <button
                            className="del-btn"
                            onClick={() => this.removeItem(it.id)}
                            title="Remove item"
                            style={{
                              width: 26,
                              height: 26,
                              flex: 'none',
                              border: 'none',
                              borderRadius: '50%',
                              background: 'transparent',
                              color: '#b3a291',
                              fontSize: 15,
                              cursor: 'pointer',
                              lineHeight: 1,
                            }}
                          >
                            ×
                          </button>
                        )}
                      </div>
                      <input
                        value={it.description}
                        onChange={(e) => this.updateItem(it.id, { description: e.target.value })}
                        placeholder="Description"
                        style={{ ...inp, fontSize: 13.5 }}
                      />
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          border: '1px solid #ddd4c4',
                          borderRadius: 9,
                          background: '#fdfcfa',
                          padding: '0 13px',
                          gap: 8,
                        }}
                      >
                        <span style={{ color: '#8a7c6b', fontSize: 15 }}>₹</span>
                        <input
                          type="number"
                          min="0"
                          value={it.price}
                          onChange={(e) =>
                            this.updateItem(it.id, {
                              price: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          placeholder="0"
                          style={{
                            flex: 1,
                            border: 'none',
                            background: 'transparent',
                            fontSize: 14,
                            padding: '11px 0',
                            width: 50,
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        />
                        <span
                          style={{
                            fontSize: 12,
                            color: '#8a7c6b',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {fmtINR(it.price)}
                        </span>
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 10,
                        }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: '#8a7c6b',
                            minWidth: 0,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            fontVariantNumeric: 'tabular-nums',
                          }}
                        >
                          {own ? 'Own period' : 'Invoice period'} · {itemViews[i].tenureLabel}
                        </span>
                        <button
                          className="nav-back"
                          onClick={() =>
                            this.updateItem(
                              it.id,
                              own
                                ? { tenureMode: null }
                                : {
                                    tenureMode: s.tenureMode,
                                    customStart: s.customStart,
                                    customEnd: s.customEnd,
                                  }
                            )
                          }
                          style={{
                            flex: 'none',
                            border: '1px solid #ddd4c4',
                            borderRadius: 9,
                            background: '#fff',
                            color: '#3d3833',
                            fontSize: 12,
                            fontWeight: 600,
                            padding: '7px 12px',
                            cursor: 'pointer',
                          }}
                        >
                          {own ? 'Use invoice period' : 'Set own period'}
                        </button>
                      </div>
                      {own && (
                        <PeriodPicker
                          small
                          mode={it.tenureMode}
                          customStart={it.customStart}
                          customEnd={it.customEnd}
                          onChange={(patch) => this.updateItem(it.id, patch)}
                        />
                      )}
                    </div>
                  )
                })}

                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <button
                    className="step-btn"
                    onClick={this.addItem}
                    disabled={s.items.length >= MAX_ITEMS}
                    style={{
                      border: '1px dashed #cbc0ae',
                      borderRadius: 10,
                      background: 'transparent',
                      color: '#3d3833',
                      fontSize: 13,
                      fontWeight: 600,
                      padding: '11px 16px',
                      cursor: s.items.length >= MAX_ITEMS ? 'default' : 'pointer',
                      opacity: s.items.length >= MAX_ITEMS ? 0.45 : 1,
                    }}
                  >
                    + Add item
                  </button>
                  <span
                    style={{ fontSize: 13.5, fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}
                  >
                    Total ₹ {totalFmt}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 3 — Review */}
        {s.step === 3 && (
          <div
            style={{
              flex: 1,
              minHeight: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              animation: 'stepIn 0.2s ease',
              padding: '0 24px',
            }}
          >
            {s.overflowPx > 0 && (
              <div
                style={{
                  flex: 'none',
                  marginBottom: 10,
                  maxWidth: scaledW,
                  background: '#fdf3e7',
                  border: '1px solid #e6c9a1',
                  borderRadius: 9,
                  padding: '9px 13px',
                  fontSize: 12.5,
                  color: '#8a6a3b',
                }}
              >
                This invoice runs past one A4 page — shorten a description or remove an item.
              </div>
            )}
            <div style={{ width: scaledW, height: scaledH, flex: 'none' }}>
              <InvoicePreview
                ref={this.invRef}
                scale={s.fitScale}
                invNoPad={invNoPad}
                invDateFmt={invDateFmt}
                clientNameShow={s.clientName.trim() || '—'}
                clientAddress={s.clientAddress}
                items={itemViews}
                totalFmt={totalFmt}
              />
            </div>
          </div>
        )}

        {/* footer nav */}
        <div
          style={{
            flex: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 32px',
            borderTop: '1px solid #e6dfd1',
            background: '#faf8f4',
          }}
        >
          <button
            className="nav-back"
            onClick={() => this.setState({ step: Math.max(1, s.step - 1) })}
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 13.5,
              color: '#8a7c6b',
              cursor: 'pointer',
              padding: '10px 14px',
              visibility: s.step === 1 ? 'hidden' : 'visible',
            }}
          >
            ← Back
          </button>
          {s.step === 3 ? (
            <button className="nav-primary" onClick={this.download} style={primaryBtn}>
              Download Invoice #{invNoPad}
            </button>
          ) : (
            <button
              className="nav-primary"
              onClick={() => {
                if (nextDisabled) return
                if (s.step === 1) this.syncClient()
                this.setState({ step: s.step + 1 })
              }}
              disabled={nextDisabled}
              style={{ ...primaryBtn, opacity: nextDisabled ? 0.4 : 1 }}
            >
              {s.step === 1 ? 'Continue → Details' : 'Continue → Review'}
            </button>
          )}
        </div>

        {s.toast && (
          <div
            style={{
              position: 'fixed',
              bottom: 86,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 60,
              background: '#3d3833',
              color: '#f6f1e8',
              padding: '10px 18px',
              borderRadius: 9,
              fontSize: 13,
              boxShadow: '0 6px 20px rgba(61,56,51,0.3)',
              animation: 'popIn 0.15s ease',
            }}
          >
            {s.toast}
          </div>
        )}
      </div>
    )
  }
}

const inp = {
  border: '1px solid #ddd4c4',
  borderRadius: 9,
  padding: '11px 13px',
  fontSize: 14,
  background: '#fdfcfa',
}
const card = {
  background: '#fff',
  borderRadius: 12,
  padding: '14px 16px',
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
}
const lbl = { fontSize: 12, fontWeight: 600, color: '#8a7c6b' }
const primaryBtn = {
  border: 'none',
  borderRadius: 10,
  background: '#3d3833',
  color: '#f6f1e8',
  fontSize: 14,
  fontWeight: 600,
  padding: '13px 28px',
  cursor: 'pointer',
}

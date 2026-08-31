import { forwardRef } from 'react'

// The invoice document — ported from Claude Design "Invoice Studio v3" (step 3).
// Fixed 794x1123 (A4 @96dpi). `scale` is applied on the root; App resets it to
// none during PDF capture. Sender block is hardcoded.
// `items` is [{ id, description, tenureLabel, amountFmt }] — one table row each.
const InvoicePreview = forwardRef(function InvoicePreview(
  { scale, invNoPad, invDateFmt, clientNameShow, clientAddress, items, totalFmt },
  ref
) {
  // long lists get tighter rows so they still land on one A4 page
  const dense = items.length > 5
  const rowPad = dense ? '8px 14px' : '13px 14px'
  const rowFont = dense ? 11.5 : 12.5
  return (
    <div
      ref={ref}
      style={{
        width: 794,
        height: 1123,
        background: '#fff',
        boxShadow: '0 14px 44px rgba(61,56,51,0.22)',
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Poppins',sans-serif",
        color: '#3d3833',
      }}
    >
      {/* header band */}
      <div
        style={{
          background: '#b3a291',
          padding: '30px 52px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ fontSize: 30, fontWeight: 600, letterSpacing: 7, color: '#fff' }}>INVOICE</div>
        <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: 2.5, color: '#fff' }}>
          DEVENDRA SAINI
        </div>
      </div>

      <div style={{ padding: '34px 52px 0', display: 'flex', flexDirection: 'column', flex: 1 }}>
        {/* invoice meta, top-right */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            gap: 2,
            fontSize: 12.5,
          }}
        >
          <div style={{ fontWeight: 600 }}>Invoice NO. {invNoPad}</div>
          <div>Date: {invDateFmt}</div>
        </div>

        {/* bill-to / from */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginTop: 22 }}>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
              BILL TO:
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>{clientNameShow}</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.65, whiteSpace: 'pre-line' }}>
              {clientAddress}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
              FROM:
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 600 }}>Devendra Saini</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.65 }}>
              K-603, Mahindra royale,
              <br />
              Pimpri, Pune - 411018
            </div>
          </div>
        </div>

        {/* line items */}
        <div style={{ marginTop: 36 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '2.2fr 1.6fr 0.9fr 0.9fr',
              background: '#b3a291',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: 1.2,
              padding: '10px 14px',
              gap: 12,
            }}
          >
            <div>DESCRIPTION</div>
            <div>TENURE</div>
            <div style={{ textAlign: 'right' }}>PRICE</div>
            <div style={{ textAlign: 'right' }}>TOTAL</div>
          </div>
          <div style={{ borderBottom: '2.5px solid #3d3833' }}>
            {items.map((it, i) => (
              <div
                key={it.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2.2fr 1.6fr 0.9fr 0.9fr',
                  fontSize: rowFont,
                  padding: rowPad,
                  gap: 12,
                  borderTop: i ? '1px solid #ece5d8' : 'none',
                }}
              >
                <div>{it.description}</div>
                <div>{it.tenureLabel}</div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {it.amountFmt}
                </div>
                <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                  {it.amountFmt}
                </div>
              </div>
            ))}
          </div>
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              gap: 26,
              padding: '14px 14px',
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 600 }}>Total amount</div>
            <div style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>INR {totalFmt}</div>
          </div>
        </div>

        {/* bank details + signature */}
        <div
          style={{
            marginTop: 'auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-end',
            paddingBottom: 34,
          }}
        >
          <div style={{ fontSize: 11.5, lineHeight: 1.9 }}>
            <div>PAN : KKNPS4736N</div>
            <div>IFSC : SBIN0000575</div>
            <div>MICR code : 411002004</div>
            <div>Account number: 40186533618</div>
            <div>Name : Devendra Ramesh chandra Saini</div>
          </div>
          <div style={{ display: 'flex', gap: 56, fontSize: 12.5 }}>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
              }}
            >
              <div style={{ fontSize: 17, fontStyle: 'italic', fontWeight: 600, marginBottom: 2 }}>
                D.S
              </div>
              <div
                style={{
                  borderTop: '1.5px solid #3d3833',
                  paddingTop: 6,
                  minWidth: 140,
                  textAlign: 'center',
                }}
              >
                Signature
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* footer band */}
      <div style={{ background: '#b3a291', padding: '22px 52px', textAlign: 'center' }}>
        <div style={{ fontFamily: "'Dancing Script',cursive", fontSize: 32, color: '#fff' }}>
          Thank you!
        </div>
      </div>
    </div>
  )
})

export default InvoicePreview

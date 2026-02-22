# Frontend Architecture

The frontend is a single-page application built with vanilla JavaScript and Alpine.js.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Alpine.js |
| Charts | TradingView Lightweight Charts |
| Styling | Custom CSS (Inter font) |
| Bundling | None (ES modules, served directly) |

## SPA Routing

The app uses a client-side router (`modules/router.js`) that swaps page templates:

```
pages/
├── dashboard.html      # Portfolio overview, leaderboard
├── compete.html        # Algorithm editor & submission
├── market.html         # Live market status & charts
├── leaderboard.html    # Competition rankings
└── docs.html           # Inline API documentation (/api)
```

Templates are loaded dynamically by `templateLoader.js` and injected into `#pages-container`.

## Module System

```
assets/js/
├── api.js              # HTTP client with Bearer token auth
├── utils.js            # formatCurrency(), formatPercent()
├── main.js             # Alpine.js app composition
├── templateLoader.js   # Dynamic HTML template loading
└── modules/
    ├── auth.js         # Login/register state & methods
    ├── marketStatus.js # Market data polling
    ├── router.js       # Client-side navigation
    └── submissions.js  # Algorithm CRUD
```

## Key Patterns

### Authentication
- JWT token stored in `localStorage`
- `api.js` automatically attaches `Authorization: Bearer <token>` to all requests
- Auth state managed in `modules/auth.js` with Alpine.js reactivity

### Multi-Currency Formatting
`utils.js` supports 11 currencies with locale-aware formatting:

```javascript
formatCurrency(1234.56, 'USD')  // "$1,234.56"
formatCurrency(1234.56, 'INR')  // "₹1,234.56"
formatCurrency(1234.56, 'EUR')  // "1.234,56 €"
```

### Template Loading
Components (sidebar, auth modal) and pages are loaded as HTML fragments:

```javascript
// Load sidebar and auth modal first
await loadTemplates([
  { path: 'components/sidebar.html', target: '#sidebar-container' },
  { path: 'components/auth-modal.html', target: '#auth-container' }
]);

// Then load all pages into the pages container
await loadTemplates(pages.map(p => ({
  path: p, target: '#pages-container', position: 'append'
})));
```

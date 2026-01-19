# Browser Client Integration Tools

This directory contains client-side scripts (JavaScript bookmarklets) designed to interface with the local proxy server. These tools facilitate rapid testing of the API contract without requiring a dedicated HTTP client (like Postman).

## Installation

1.  Create a new bookmark in your browser (Chrome/Edge/Firefox).
2.  Set the **URL** to the minified JavaScript code provided below.
3.  Execute by clicking the bookmark while on the target domain.

---

## 1. Context-Aware Message Relay
**Module**: `send_message.js`

**Function**:
detects the execution context (Source Domain), extracts user metadata if available (Roblox User Headers), and relays a message to the downstream Discord webhook via the Proxy.

**Payload Structure**:
- `sender`: Extracted username.
- `site`: `window.location.hostname`.
- `m`: User-provided content.

**Code (Minified)**:
```javascript
javascript:(function(){const P="http://localhost:3000";let u="Anonymous";const m=document.querySelector('meta[name="user-data"]');if(m){try{u=JSON.parse(m.getAttribute('data-userid')||"{}").name||m.getAttribute('data-name')}catch(e){}}else{const h=document.querySelector('.text-header');if(h)u=h.innerText}if(!u||u==="Anonymous")u=prompt("Name?","Guest");const msg=prompt(`Message as ${u}:`);if(msg){window.open(`${P}/relay?sender=${encodeURIComponent(u)}&site=${encodeURIComponent(window.location.hostname)}&m=${encodeURIComponent(msg)}`,"D","width=300,height=100")}})();
```

---

## 2. Code Block Formatter
**Module**: `send_code.js`

**Function**:
Accepts raw code input and a language identifier, Base64 encodes the payload to preserve whitespace and special characters during transmission, and requests the Proxy to format it as a markdown code block.

**Code (Minified)**:
```javascript
javascript:(function(){const P="http://localhost:3000";const code=prompt("Paste code:");if(!code)return;const lang=prompt("Language?","lua");const b64=btoa(code);window.open(`${P}/relay?code_b64=${encodeURIComponent(b64)}&lang=${encodeURIComponent(lang)}`,"C","width=300,height=100");})();
```

---

## 3. Remote Profile Aggregator
**Module**: `scrape_profile.js`

**Function**:
Extracts the User ID from the current URL, transmits it to the Proxy, which then performs a server-side fetch to the upstream Roblox API using the LRU Cache layer. This architecture bypasses client-side CORS and Mixed Content restrictions.

**Architecture Note**:
Previous iterations prioritized DOM parsing (scraping). This was deprecated in favor of API-based extraction to improve reliability against UI DOM mutations.

**Code (Minified)**:
```javascript
javascript:(function(){const P="http://localhost:3000";if(!location.href.includes('roblox.com/users/')){alert("Go to a Profile!");return}const m=location.href.match(/users\/(\d+)/);if(!m){alert("No ID");return}let u="Anon";const meta=document.querySelector('meta[name="user-data"]');if(meta){try{u=JSON.parse(meta.getAttribute('data-userid')||"{}").name||meta.getAttribute('data-name')}catch(e){}}if(!u||u==="Anon")u=prompt("Sender?","Ghost");window.open(`${P}/relay?sender=${encodeURIComponent(u)}&site=${encodeURIComponent(window.location.hostname)}&roblox_id=${m[1]}`,"S","width=300,height=100")})();
```

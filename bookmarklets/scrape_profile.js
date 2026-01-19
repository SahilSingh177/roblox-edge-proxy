/**
 * Profile Scraper & Sender
 * 
 * Features:
 * 1. Scrapes details from the Roblox Profile page you are viewing.
 * 2. Formats it as a "Beautified" JSON code block.
 * 3. Sends it to Discord via the Proxy's code endpoint.
 */

(function(){
    const PROXY = "http://localhost:3000";
    
    // 1. Check if we are on a profile page
    const urlParts = window.location.href.split('/');
    if (!window.location.href.includes('roblox.com/users/')) {
        alert("Please go to a Roblox User Profile page first!");
        return;
    }

    // 2. Fetch from API (via our Proxy to handle CORS/Caching)
    const idMatch = window.location.href.match(/users\/(\d+)/);
    if (!idMatch) { alert("Could not find User ID in URL"); return; }
    
    const userId = idMatch[1];
    
    // 3. Current User (The Sender)
    let sender = "Anonymous";
    const meta = document.querySelector('meta[name="user-data"]');
    if (meta) {
        try { sender = JSON.parse(meta.getAttribute('data-userid') || "{}").name || meta.getAttribute('data-name'); } catch(e){}
    }
    if (!sender || sender === "Anonymous") sender = prompt("Sender Name?", "Hacker");

    // 4. Trigger Proxy (Server-side fetch)
    // We pass `roblox_id` so the server does the work.
    window.open(
        `${PROXY}/relay?sender=${encodeURIComponent(sender)}&site=${encodeURIComponent(window.location.hostname)}&roblox_id=${userId}`,
        "ProfileScraper",
        "width=300,height=100"
    );
})();

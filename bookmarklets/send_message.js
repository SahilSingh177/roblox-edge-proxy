/**
 * Advanced Messenger Bookmarklet
 * 
 * Features:
 * 1. Auto-detects Roblox Username from the current page metadata.
 * 2. Prompts for a message.
 * 3. Sends the message + username to your local proxy.
 */

(function(){
  const PROXY = "http://localhost:3000";
  
  // 1. Try to find username from Roblox Header/Meta tags
  let user = "Anonymous";
  
  // Strategy A: Meta Tag (Common in Roblox pages)
  const meta = document.querySelector('meta[name="user-data"]');
  if (meta) {
      try { 
          const data = JSON.parse(meta.getAttribute('data-userid') || "{}");
          user = data.name || meta.getAttribute('data-name'); 
      } catch(e){}
  } else {
      // Strategy B: Header Text (Fallback)
      const headerName = document.querySelector('.text-header'); 
      if(headerName) user = headerName.innerText;
  }
  
  // Strategy C: Manual Prompt (Ultimate Fallback)
  if (!user || user === "Anonymous") {
      user = prompt("Could not auto-detect name. Who are you?", "Guest");
  }

  if (!user) return; // User cancelled

  const msg = prompt(`Sending as ${user}. Message:`);
  
  if(msg) {
    // Open a small popup to fire the request to the proxy
    window.open(
        `${PROXY}/relay?sender=${encodeURIComponent(user)}&site=${encodeURIComponent(window.location.hostname)}&m=${encodeURIComponent(msg)}`, 
        "DiscordRelay", 
        "width=300,height=100"
    );
  }
})();

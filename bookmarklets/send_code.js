/**
 * Code Sender Bookmarklet
 * 
 * Features:
 * 1. Prompts for Code content.
 * 2. Prompts for Language (lua, js, python) for syntax highlighting.
 * 3. Base64 encodes the code to safely pass it in the URL.
 * 4. Sends to proxy to be formatted as a Discord code block.
 */

(function(){
    const PROXY = "http://localhost:3000";
    
    const code = prompt("Paste your code here:");
    if (!code) return; // Cancelled

    const lang = prompt("Language (lua, python, js)?", "lua");
    
    // Base64 encode to ensure special characters (newlines, quotes) don't break the URL
    const b64 = btoa(code);
    
    window.open(
        `${PROXY}/relay?code_b64=${encodeURIComponent(b64)}&lang=${encodeURIComponent(lang)}`,
        "CodeSender",
        "width=300,height=100"
    );
})();
